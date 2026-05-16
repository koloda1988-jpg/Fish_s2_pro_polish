# -*- coding: utf-8 -*-
"""
python_backend.py
=================
JSON-RPC over stdin/stdout backend dla Electron Audiobook Generator.

Protokol:
  Stdin:  jeden JSON na linie: {"id": N, "method": "...", "params": {...}}
  Stdout:
    - odpowiedz: {"id": N, "result": ...} albo {"id": N, "error": "..."}
    - event:     {"event": "...", ...}     (asynchroniczny, np. status fragmentu)

Metody:
  - load_book(path) -> [{title, paragraphs}]
  - split_text(text, target_words=75) -> [string]
  - process_fragment(idx, text, workdir, subdir) -> {wav_path, duration, audio_seconds}
       (event: fragment:progress idx start/success/error)
  - merge_wavs(paths, out_path) -> {audio_seconds}
  - get_wav_duration(path) -> float
  - exists(path) -> bool
  - ensure_dir(path) -> bool
"""

import os
import re
import sys
import json
import time
import wave
import base64
import threading
import subprocess
import traceback
import io
import codecs
import zipfile
import posixpath
import html
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote as _url_unquote, urlparse, parse_qs

# Force UTF-8 on stdin/stdout - critical for bundled exe on Windows.
# PYTHONLEGACYWINDOWSSTDIO can block this, so we enforce it manually.
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    else:
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
except Exception:
    pass
try:
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    else:
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass
try:
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8', errors='replace')
    else:
        sys.stdin = io.TextIOWrapper(
            sys.stdin.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass


def emit(obj):
    """Send JSON to stdout (single line) - always UTF-8."""
    try:
        line = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
        sys.stdout.write(line + '\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"[emit error] {str(e)}\n")
        sys.stderr.flush()


def emit_event(name, **kwargs):
    payload = {"event": name}
    payload.update(kwargs)
    emit(payload)


def split_by_tags(text):
    """Return list (is_tag, chunk) so text inside [tag] is not modified."""
    parts = re.split(r"(\[[^\[\]\n]{1,120}\])", text)
    out = []
    for p in parts:
        if not p:
            continue
        is_tag = bool(re.fullmatch(r"\[[^\[\]\n]{1,120}\]", p))
        out.append((is_tag, p))
    return out


def apply_case_like(source, replacement):
    if not source:
        return replacement
    if source.isupper():
        return replacement.upper()
    if source[0].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _map_word_case_aware(segment, src_word, dst_word):
    pattern = re.compile(r"\b" + re.escape(src_word) + r"\b", flags=re.IGNORECASE)

    def repl(m):
        return apply_case_like(m.group(0), dst_word)

    return pattern.sub(repl, segment)


def get_backend_base_dir():
    if getattr(sys, "frozen", False):
        # PyInstaller onefile extracts files into _MEIPASS.
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def load_phonetic_map():
    fallback = {
        "word_map": {"silos": "sy-los", "sinus": "sy-nus"},
        "hard_i_rules": [
            {"pattern": r"si(?=[aeiouyąęó])", "replacement": "sy"},
            {"pattern": r"zi(?=[aeiouyąęó])", "replacement": "z-i"},
            {"pattern": r"ci(?=[aeiouyąęó])", "replacement": "c-i"},
            {"pattern": r"ni(?=[aeiouyąęó])", "replacement": "n-i"},
        ],
    }

    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "phonetic_map.json")
        candidates.append(Path(getattr(sys, "_MEIPASS", "")) / "phonetic_map.json")
    else:
        candidates.append((Path(__file__).resolve().parent / "phonetic_map.json"))

    for path in candidates:
        try:
            if path and path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return data
        except Exception:
            continue

    return fallback


PHONETIC_MAP = load_phonetic_map()

# Precompile hard_i_rules regex patterns once at startup, not per fragment
_COMPILED_HARD_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(rule["pattern"], flags=re.IGNORECASE), rule.get("replacement", ""))
    for rule in (PHONETIC_MAP or {}).get("hard_i_rules", [])
    if rule.get("pattern")
]


def normalize_punctuation_segment(segment):
    # Remove symbols that most often confuse the model. Keep: . , ? ! and hyphen.
    segment = segment.replace("…", "...")
    segment = re.sub(r"[;:(){}<>/\\|*_~=+@#$%^&\"'`´]", " ", segment)
    segment = re.sub(r"\s+,", ",", segment)
    segment = re.sub(r"\s+([?!.,])", r"\1", segment)
    segment = re.sub(r"\s+", " ", segment)
    return segment.strip()


def apply_hard_i_rules_segment(segment, rules=None):
    # Use precompiled patterns instead of recompiling every call
    compiled = _COMPILED_HARD_RULES if rules is None else [
        (re.compile(r["pattern"], flags=re.IGNORECASE), r.get("replacement", ""))
        for r in rules if r.get("pattern")
    ]
    for rgx, repl in compiled:
        def repl_fn(m, _repl=repl):
            return apply_case_like(m.group(0), _repl)
        segment = rgx.sub(repl_fn, segment)
    return segment


def apply_phonetic_corrections(text, options=None):
    """Niewidzialna podmiana: dziala tylko na tekscie wysylanym do TTS.
    Oryginalny tekst pozostaje bez zmian po stronie UI.
    """
    options = options or {}
    if not options.get("enabled", True):
        return text

    apply_pause = options.get("pause_tags", True)
    apply_norm = options.get("normalize_punctuation", True)
    apply_hard = options.get("hard_phonetic", True)
    use_zwsp = options.get("use_zwsp", False)
    use_dot_break = options.get("use_dot_break", False)

    word_map = (PHONETIC_MAP or {}).get("word_map", {})

    chunks = []
    for is_tag, chunk in split_by_tags(text):
        if is_tag:
            chunks.append(chunk)
            continue

        seg = chunk

        if apply_norm:
            seg = normalize_punctuation_segment(seg)

        if apply_pause:
            # Long ellipsis pauses also get a physical silence marker.
            seg = re.sub(r"\.{3,}", " [[SILENCE:1200]] [pause] ", seg)
            seg = re.sub(r"\.\.", " [short pause] ", seg)
            seg = re.sub(r"\.(?=\s|$)", " [short pause] ", seg)

        if apply_hard:
            for src, dst in word_map.items():
                seg = _map_word_case_aware(seg, src, dst)
            seg = apply_hard_i_rules_segment(seg)

            if use_dot_break:
                # Experimental: split "si" into "s.i".
                seg = re.sub(r"si(?=[aeiouyąęó])", "s.i", seg, flags=re.IGNORECASE)

            if use_zwsp:
                zwsp = "\u200b"
                seg = re.sub(r"s(?=i[aeiouyąęó])", "s" + zwsp, seg, flags=re.IGNORECASE)

        seg = re.sub(r"\s+", " ", seg).strip()
        chunks.append(seg)

    merged = " ".join([c for c in chunks if c])
    merged = re.sub(r"\s+", " ", merged).strip()
    return merged


def parse_silence_markers(text):
    token = re.compile(r"\[\[SILENCE:(\d{2,5})\]\]")
    parts = []
    pos = 0
    for m in token.finditer(text):
        if m.start() > pos:
            parts.append({"kind": "speech", "text": text[pos:m.start()].strip()})
        ms = int(m.group(1))
        parts.append({"kind": "silence", "ms": ms})
        pos = m.end()
    if pos < len(text):
        parts.append({"kind": "speech", "text": text[pos:].strip()})
    return [p for p in parts if (p["kind"] == "silence" or p.get("text"))]


def make_silence_wav(out_path, duration_sec, params):
    channels = params.get("channels", 1)
    sampwidth = params.get("sampwidth", 2)
    framerate = params.get("framerate", 24000)
    nframes = max(1, int(round(duration_sec * framerate)))
    silence_frame = b"\x00" * sampwidth * channels

    with wave.open(out_path, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sampwidth)
        w.setframerate(framerate)
        w.writeframes(silence_frame * nframes)


def wav_params(path):
    with wave.open(path, "rb") as w:
        return {
            "channels": w.getnchannels(),
            "sampwidth": w.getsampwidth(),
            "framerate": w.getframerate(),
        }


# ---------- PARSERY ----------

def decode_best_text(data):
    # Fast path: clean UTF-8 without replacement characters
    try:
        t = data.decode("utf-8")
        if "\ufffd" not in t:
            return t
    except UnicodeDecodeError:
        pass

    candidates = ["utf-8", "utf-8-sig", "cp1250", "iso-8859-2", "cp852", "cp1252", "latin1"]
    best_text = None
    best_score = -10**9
    for enc in candidates:
        text = data.decode(enc, errors="replace")
        replacement = text.count("\ufffd")
        mojibake = text.count("Ã") + text.count("Å") + text.count("Ä")
        polish = sum(text.count(ch) for ch in "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ")
        ascii_like = sum(ch.isalnum() or ch.isspace() for ch in text)
        score = (polish * 3) + ascii_like - (replacement * 40) - (mojibake * 8)
        if score > best_score:
            best_score = score
            best_text = text

    text = best_text if best_text is not None else data.decode("utf-8", errors="replace")

    # Try to repair common UTF-8 mojibake decoded as latin/cp.
    if any(ch in text for ch in ("Ã", "Å", "Ä")):
        try:
            repaired = text.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
            if repaired:
                r_bad = repaired.count("\ufffd") + repaired.count("Ã") + repaired.count("Å") + repaired.count("Ä")
                t_bad = text.count("\ufffd") + text.count("Ã") + text.count("Å") + text.count("Ä")
                if r_bad < t_bad:
                    text = repaired
        except Exception:
            pass

    return text


def detect_xml_encoding(raw_bytes):
    """Wykrywa kodowanie z deklaracji XML/HTML w pierwszych 2KB pliku."""
    try:
        head = raw_bytes[:2048].decode('ascii', errors='replace')
    except Exception:
        return None
    m = re.search(r'<\?xml\b[^?>]*\bencoding=["\']([A-Za-z0-9_\-]+)', head, re.IGNORECASE)
    if m:
        try:
            codecs.lookup(m.group(1))
            return m.group(1).lower()
        except LookupError:
            pass
    m = re.search(r'<meta\b[^>]*\bcharset=["\']?([A-Za-z0-9_\-]+)', head, re.IGNORECASE)
    if m:
        try:
            codecs.lookup(m.group(1))
            return m.group(1).lower()
        except LookupError:
            pass
    return None


def extract_html_text(raw_bytes):
    declared = detect_xml_encoding(raw_bytes)
    if declared and declared not in ('utf-8', 'utf-8-sig'):
        try:
            s = raw_bytes.decode(declared, errors='replace')
        except (LookupError, UnicodeDecodeError):
            s = decode_best_text(raw_bytes)
    else:
        s = decode_best_text(raw_bytes)
    s = re.sub(r"<script\b[^>]*>.*?</script>", " ", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"<style\b[^>]*>.*?</style>", " ", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"</p>|</div>|</h1>|</h2>|</h3>|</li>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s).strip()
    return s

def read_txt(path):
    with open(path, "rb") as f:
        raw = f.read()

    content = decode_best_text(raw)

    heading_markdown = re.compile(r"^\s*#{1,6}\s+(.+?)\s*$")
    part_heading = re.compile(
        r"^\s*(CZ(?:E|Ę)(?:S|Ś)[ĆC]\s+[0-9IVXLCDM]+(?:\s*[-.:]\s*.*)?)\s*$",
        re.IGNORECASE,
    )
    chapter_heading = re.compile(
        r"^\s*(ROZDZIA[ŁL]\s+[0-9IVXLCDM]+(?:\s*[-.:]\s*.*)?)\s*$",
        re.IGNORECASE,
    )

    def heading_from_line(line):
        m_md = heading_markdown.match(line)
        if m_md:
            candidate = (m_md.group(1) or "").strip()
        else:
            candidate = line.strip()

        if not candidate:
            return None
        if len(candidate.split()) > 12:
            return None
        return candidate

    def parse_sections(lines, detector):
        sections = []
        current_title = None
        current_text = []

        def flush_current():
            nonlocal current_text, current_title
            if current_title is None:
                return
            text = "\n".join(current_text).strip()
            if text:
                sections.append({"title": current_title, "text": text})

        for raw_line in lines:
            candidate = heading_from_line(raw_line)
            is_heading = bool(candidate and detector.match(candidate))
            if is_heading:
                flush_current()
                current_title = candidate
                current_text = []
                continue

            if current_title is not None:
                current_text.append(raw_line)

        flush_current()
        return sections

    lines = content.splitlines()

    # Priority: if "CZESC/CZĘŚĆ" exists, show only parts.
    parts = parse_sections(lines, part_heading)
    if parts:
        return parts

    chapters = parse_sections(lines, chapter_heading)
    if chapters:
        return chapters

    # Fallback: split into sections by markdown headings (# text)
    # e.g. "# index_split_000.xhtml" from EPUB->TXT export via Gemini
    md_section_re = re.compile(r"^\s*#{1,6}\s+(.+?)\s*$")
    md_sections = []
    cur_title = None
    cur_text = []
    section_num = 0

    def _flush_md():
        nonlocal cur_text, cur_title
        if cur_title is None:
            return
        text = "\n".join(cur_text).strip()
        if text:
            md_sections.append({"title": cur_title, "text": text})

    for raw_line in lines:
        m = md_section_re.match(raw_line)
        if m:
            _flush_md()
            section_num += 1
            raw_heading = m.group(1).strip()
            # If heading is an xhtml filename (e.g. index_split_002.xhtml),
            # assign readable name "Section N"
            if re.match(r'^[\w_\-]+\.xhtml?$', raw_heading, re.IGNORECASE):
                cur_title = f"Section {section_num}"
            else:
                cur_title = raw_heading
            cur_text = []
        else:
            if cur_title is not None:
                cur_text.append(raw_line)

    _flush_md()

    if md_sections:
        return md_sections

    return [{"title": "Full text", "text": content}]


def read_pdf(path):
    from pypdf import PdfReader
    reader = PdfReader(path)
    pages = [p.extract_text() or "" for p in reader.pages]
    return [{"title": "Caly PDF", "text": "\n".join(pages)}]


def _parse_xml_safe(raw_bytes):
    """Parsuje XML, pomijajac BOM i naprawiajac typowe problemy."""
    # Remove BOM if present
    for bom in (b'\xef\xbb\xbf', b'\xff\xfe', b'\xfe\xff'):
        if raw_bytes.startswith(bom):
            raw_bytes = raw_bytes[len(bom):]
            break
    return ET.fromstring(raw_bytes)


def _zip_read(zf, path):
    """Czyta plik z zip; jezeli sciezka nie istnieje, probuje case-insensitive."""
    try:
        return zf.read(path)
    except KeyError:
        path_lower = path.lower()
        names_map = {n.lower(): n for n in zf.namelist()}
        real = names_map.get(path_lower)
        if real:
            return zf.read(real)
        # Probuj tez z ukosnikiem Windowsowym
        path_win = path.replace("/", "\\")
        real = names_map.get(path_win.lower())
        if real:
            return zf.read(real)
        raise


def read_epub(path):
    chapters = []

    with zipfile.ZipFile(path, "r") as zf:
        try:
            container_xml = _zip_read(zf, "META-INF/container.xml")
        except KeyError:
            raise ValueError("Niepoprawny EPUB: brak META-INF/container.xml")

        try:
            root = _parse_xml_safe(container_xml)
        except ET.ParseError as e:
            raise ValueError("Niepoprawny EPUB (container.xml): " + str(e))

        rootfile = None
        for el in root.iter():
            if el.tag.endswith("rootfile"):
                rootfile = el.attrib.get("full-path")
                if rootfile:
                    break
        if not rootfile:
            raise ValueError("Nie mozna znalezc pliku OPF w EPUB.")

        try:
            opf_bytes = _zip_read(zf, rootfile)
        except KeyError:
            raise ValueError("Brak pliku OPF w EPUB: " + rootfile)

        try:
            opf_root = _parse_xml_safe(opf_bytes)
        except ET.ParseError as e:
            raise ValueError("Niepoprawny plik OPF: " + str(e))

        opf_dir = posixpath.dirname(rootfile)
        manifest = {}
        spine_ids = []

        for el in opf_root.iter():
            if el.tag.endswith("item"):
                item_id = el.attrib.get("id")
                href = el.attrib.get("href")
                media = el.attrib.get("media-type", "")
                if item_id and href:
                    manifest[item_id] = {"href": _url_unquote(href), "media": media}
            elif el.tag.endswith("itemref"):
                idref = el.attrib.get("idref")
                if idref:
                    spine_ids.append(idref)

        for idx, idref in enumerate(spine_ids, 1):
            item = manifest.get(idref)
            if not item:
                continue

            href = item.get("href", "")
            if not href:
                continue

            item_path = posixpath.normpath(posixpath.join(opf_dir, href)) if opf_dir else href
            try:
                raw = _zip_read(zf, item_path)
            except KeyError:
                continue

            text = extract_html_text(raw)
            if not text:
                continue

            title = ""
            m = re.search(r"<(h1|h2|h3)\b[^>]*>(.*?)</\1>", decode_best_text(raw), flags=re.IGNORECASE | re.DOTALL)
            if m:
                title = re.sub(r"<[^>]+>", " ", m.group(2) or "")
                title = html.unescape(re.sub(r"\s+", " ", title)).strip()

            if not title:
                title = f"Sekcja {idx}"

            chapters.append({"title": title, "text": text})

    if not chapters:
        raise ValueError("Nie znaleziono rozdzialow/tresci w EPUB.")

    return chapters



def extract_speakers_from_text(text, max_speakers=200):
    """Wyciaga unikalne imiona z tagow [speaker:Imie] w tekscie.
    Zwraca liste posortowana po popularnosci (najczesciej mowiacy pierwsi).
    Pomija '?' i puste."""
    import re, collections
    cnt = collections.Counter()
    for m in re.finditer(r"\[speaker:\s*([^\]\?]+?)\s*\]", text or ""):
        name = m.group(1).strip()
        if name:
            cnt[name] += 1
    return [n for n, _ in cnt.most_common(max_speakers)]


def load_speakers_sidecar(book_path):
    """Sprawdza czy obok ksiazki istnieje <basename>.speakers.txt; zwraca liste lub []."""
    import os
    base, _ = os.path.splitext(book_path)
    sidecar = base + ".speakers.txt"
    if not os.path.isfile(sidecar):
        return []
    try:
        with open(sidecar, "r", encoding="utf-8") as f:
            return [ln.strip() for ln in f if ln.strip()]
    except Exception:
        return []


def load_book(path):
    p = path.lower()
    if p.endswith(".epub"):
        return read_epub(path)
    if p.endswith(".pdf"):
        return read_pdf(path)
    if p.endswith(".txt"):
        return read_txt(path)
    raise ValueError("Obslugiwane formaty: .epub .pdf .txt")


# ---------- SPLITTER ----------

def split_into_fragments(text, target_chars=390):
    """Dzieli tekst na fragmenty max target_chars znakow (~30s przy 13 zn/s).
    Ciecie odbywa sie na granicy zdan, nigdy w srodku.
    """
    # Usun nadmiarowe biale znaki
    clean = re.sub(r"[ \t]+", " ", text).strip()
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    if not clean:
        return []

    # Podziel na zdania (zachowaj interpunkcje i tagi np. [pause])
    # Wzorzec: koniec zdania to . ! ? po ktorych nastepuje spacja lub koniec
    sentence_re = re.compile(r"([^.!?\n]*(?:[.!?]+|\n))", re.DOTALL)
    sentences = [m.group(0) for m in sentence_re.finditer(clean)]
    consumed_len = sum(len(s) for s in sentences)
    tail = clean[consumed_len:].strip()
    if tail:
        sentences.append(tail + ".")

    fragments, buf, buf_chars = [], [], 0
    for s in sentences:
        s_stripped = s.strip()
        if not s_stripped:
            continue
        s_len = len(s_stripped)
        # Jesli jedno zdanie przekracza limit, wypchnij je jako osobny fragment
        if buf_chars > 0 and buf_chars + 1 + s_len > target_chars:
            fragments.append(" ".join(buf).strip())
            buf, buf_chars = [], 0
        buf.append(s_stripped)
        buf_chars += s_len + (1 if buf_chars > 0 else 0)
        # Jesli bufor osiagnal limit, wypchnij
        if buf_chars >= target_chars:
            fragments.append(" ".join(buf).strip())
            buf, buf_chars = [], 0
    if buf:
        fragments.append(" ".join(buf).strip())

    out = []
    for f in fragments:
        f = f.strip()
        if f and not f.endswith((".", "!", "?", "]»")):
            f += "."
        if f:
            out.append(f)
    return out


# ---------- KOMENDA POWERSHELL ----------

COMMAND_TEMPLATE = (
    '$promptText = Get-Content -Raw -Path "Lectors\\sample_glos_macieja_10s.txt"\n'
    '.\\s2.exe `\n'
    '  -m "s2-pro-q8_0.gguf" `\n'
    '  -t "tokenizer.json" `\n'
    '  -c 0 `\n'
    '  -pa "Lectors\\sample_glos_macieja_10s.wav" `\n'
    '  -pt "$promptText" `\n'
    '  -text "{TEXT}" `\n'
    '  -o "{OUT}"'
)


def output_filename(index, subdir="Silos"):
    name = "maciej_file_test.wav" if index == 1 else "maciej_file_test{}.wav".format(index)
    if subdir:
        return "{}\\{}".format(subdir.rstrip("\\/"), name)
    return name


def build_command(fragment_text, index, subdir):
    safe = fragment_text.replace('"', '`"')
    return COMMAND_TEMPLATE.replace("{TEXT}", safe).replace(
        "{OUT}", output_filename(index, subdir))


def build_command_for_output(fragment_text, output_rel_path):
    safe = fragment_text.replace('"', '`"')
    return COMMAND_TEMPLATE.replace("{TEXT}", safe).replace(
        "{OUT}", output_rel_path)


def run_powershell(command, workdir):
    wrapped = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;"
        "$OutputEncoding = [System.Text.Encoding]::UTF8;"
        + command
    )
    encoded = base64.b64encode(wrapped.encode("utf-16-le")).decode("ascii")
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
         "-EncodedCommand", encoded],
        cwd=workdir, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    return proc.returncode, proc.stdout, proc.stderr


# ---------- WAV ----------

def get_wav_duration(path):
    try:
        with wave.open(path, "rb") as w:
            frames = w.getnframes()
            rate = w.getframerate() or 0
            if rate <= 0:
                return 0.0
            return frames / float(rate)
    except Exception:
        return 0.0


def merge_wavs(wav_paths, out_path):
    if not wav_paths:
        raise ValueError("Brak plikow do polaczenia.")
    with wave.open(wav_paths[0], "rb") as w0:
        params = w0.getparams()
    with wave.open(out_path, "wb") as out:
        out.setparams(params)
        for p in wav_paths:
            with wave.open(p, "rb") as w:
                if w.getparams()[:3] != params[:3]:
                    raise ValueError(
                        "Plik {} ma inne parametry.".format(p))
                out.writeframes(w.readframes(w.getnframes()))


# ---------- WORKER (kolejka fragmentow) ----------

class FragmentRunner:
    """Wykonuje jedno zadanie naraz, w osobnym watku.
    Renderer wysyla po jednym 'process_fragment' i czeka na wynik
    przez Promise; kolejka jest po stronie renderera."""
    def __init__(self):
        self._lock = threading.Lock()

    def process(self, idx, text, workdir, subdir, preprocess=None):
        with self._lock:
            emit_event("fragment:progress", idx=idx, status="processing")
            t0 = time.time()
            try:
                expected = os.path.join(workdir, output_filename(idx, subdir))
                prepared = apply_phonetic_corrections(text, preprocess)

                if (preprocess or {}).get("debug", False):
                    emit_event("log", line="[TTS Input]: " + prepared[:400])

                plan = parse_silence_markers(prepared)
                needs_physical_silence = any(
                    p["kind"] == "silence" and p.get("ms", 0) >= 1000 for p in plan
                )

                if not needs_physical_silence:
                    cmd = build_command_for_output(prepared, output_filename(idx, subdir))
                    rc, out, err = run_powershell(cmd, workdir)
                    duration = time.time() - t0
                    if rc == 0 and os.path.isfile(expected):
                        audio = get_wav_duration(expected)
                        emit_event("fragment:progress", idx=idx, status="success",
                                   duration=duration, wav_path=expected,
                                   audio_seconds=audio)
                        return {"wav_path": expected, "duration": duration,
                                "audio_seconds": audio}
                    msg = "exit={} stderr={}".format(rc, (err or "").strip()[:300])
                    emit_event("fragment:progress", idx=idx, status="error",
                               duration=duration, message=msg)
                    return {"error": msg, "duration": duration}

                tmp_rel = "{}\\_tmp_frag_{}".format(subdir.rstrip("\\/"), idx)
                tmp_abs = os.path.join(workdir, tmp_rel)
                os.makedirs(tmp_abs, exist_ok=True)

                parts = []
                speech_count = 0
                base_params = None

                for p_i, part in enumerate(plan, 1):
                    if part["kind"] == "speech":
                        speech_text = part["text"].replace("[[SILENCE:1200]]", " ").strip()
                        if not speech_text:
                            continue
                        speech_count += 1
                        rel = "{}\\speech_{:03d}.wav".format(tmp_rel, speech_count)
                        cmd = build_command_for_output(speech_text, rel)
                        rc, out, err = run_powershell(cmd, workdir)
                        if rc != 0:
                            duration = time.time() - t0
                            msg = "exit={} stderr={}".format(rc, (err or "").strip()[:300])
                            emit_event("fragment:progress", idx=idx, status="error",
                                       duration=duration, message=msg)
                            return {"error": msg, "duration": duration}
                        abs_wav = os.path.join(workdir, rel)
                        if not os.path.isfile(abs_wav):
                            duration = time.time() - t0
                            msg = "Brak pliku po syntezie: " + abs_wav
                            emit_event("fragment:progress", idx=idx, status="error",
                                       duration=duration, message=msg)
                            return {"error": msg, "duration": duration}
                        if base_params is None:
                            base_params = wav_params(abs_wav)
                        parts.append(abs_wav)
                    else:
                        ms = int(part.get("ms", 0))
                        if ms <= 0:
                            continue
                        if base_params is None:
                            continue
                        sil_rel = "{}\\silence_{:03d}.wav".format(tmp_rel, p_i)
                        sil_abs = os.path.join(workdir, sil_rel)
                        make_silence_wav(sil_abs, ms / 1000.0, base_params)
                        parts.append(sil_abs)

                if not parts:
                    duration = time.time() - t0
                    msg = "Brak czesci audio do scalenia."
                    emit_event("fragment:progress", idx=idx, status="error",
                               duration=duration, message=msg)
                    return {"error": msg, "duration": duration}

                merge_wavs(parts, expected)
                duration = time.time() - t0
                audio = get_wav_duration(expected)
                emit_event("fragment:progress", idx=idx, status="success",
                           duration=duration, wav_path=expected,
                           audio_seconds=audio)
                return {"wav_path": expected, "duration": duration,
                        "audio_seconds": audio}
            except Exception as e:
                duration = time.time() - t0
                msg = "wyjatek: " + str(e)
                emit_event("fragment:progress", idx=idx, status="error",
                           duration=duration, message=msg)
                return {"error": msg, "duration": duration}


RUNNER = FragmentRunner()


# ---------- Voice tools: YouTube + clip + transcription ----------

_WHISPER_CACHE = {"engine": None, "model": None, "name": None}


def _sanitize_voice_name(name):
    name = (name or "").strip()
    if not name:
        return ""
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^0-9A-Za-z_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name


def _run_cmd(cmd, cwd=None):
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return proc
    except FileNotFoundError:
        class _MissingCmdResult:
            returncode = 127
            stdout = ""
            stderr = "command not found"
        return _MissingCmdResult()


def _find_ytdlp_cmd():
    # 1) Global PATH
    ytdlp_path = shutil.which("yt-dlp")
    if ytdlp_path:
        return [ytdlp_path]

    # 2) Typowe lokalizacje obok Pythona
    py_dir = os.path.dirname(sys.executable or "")
    local_candidates = [
        os.path.join(py_dir, "yt-dlp.exe"),
        os.path.join(py_dir, "Scripts", "yt-dlp.exe"),
        os.path.join(get_backend_base_dir(), "yt-dlp.exe"),
    ]
    for pth in local_candidates:
        if pth and os.path.isfile(pth):
            return [pth]

    # 3) Python module
    test = [sys.executable, "-m", "yt_dlp", "--version"]
    p = _run_cmd(test)
    if p and p.returncode == 0:
        return [sys.executable, "-m", "yt_dlp"]

    return None


def _find_js_runtime_arg():
    # yt-dlp: prefer Node.js if available, fallback to Deno.
    node = shutil.which("node")
    if node:
        return ["--js-runtimes", f"node:{node}"]
    deno = shutil.which("deno")
    if deno:
        return ["--js-runtimes", f"deno:{deno}"]
    return []


def _youtube_video_only_url(raw_url):
    try:
        p = urlparse(raw_url)
        host = (p.netloc or "").lower()
        if "youtube.com" in host and p.path == "/watch":
            v = parse_qs(p.query).get("v", [""])[0]
            if v:
                return f"https://www.youtube.com/watch?v={v}"
        if "youtu.be" in host:
            vid = (p.path or "").strip("/")
            if vid:
                return f"https://www.youtube.com/watch?v={vid}"
    except Exception:
        pass
    return raw_url


def download_youtube_audio(url, temp_dir):
    if not (url or "").strip():
        raise ValueError("Provide a YouTube link.")
    os.makedirs(temp_dir, exist_ok=True)

    ytdlp = _find_ytdlp_cmd()
    if not ytdlp:
        raise RuntimeError("yt-dlp not found. Install: pip install yt-dlp")

    out_tpl = os.path.join(temp_dir, "yt_%(id)s.%(ext)s")
    base_args = [
        "--no-playlist",
        "--restrict-filenames",
        "--extractor-args", "youtube:player_client=android,web",
        "-x", "--audio-format", "mp3", "--audio-quality", "0",
        "--print", "after_move:filepath",
        "-o", out_tpl,
    ]
    js_args = _find_js_runtime_arg()

    requested_url = (url or "").strip()
    compact_url = _youtube_video_only_url(requested_url)
    urls_to_try = [requested_url]
    if compact_url and compact_url != requested_url:
        urls_to_try.append(compact_url)

    last_err = ""
    saw_js_runtime_issue = False
    saw_unavailable = False
    for u in urls_to_try:
        cmd = ytdlp + js_args + base_args + [u]
        proc = _run_cmd(cmd)
        if proc.returncode == 0:
            lines = [ln.strip() for ln in (proc.stdout or "").splitlines() if ln.strip()]
            audio_path = lines[-1] if lines else ""
            if audio_path and os.path.isfile(audio_path):
                title = os.path.basename(audio_path)
                return {"audio_path": audio_path, "title": title}
            last_err = "Could not determine downloaded audio file path."
            continue

        err_blob = (proc.stderr or proc.stdout or "")[-2000:]
        last_err = err_blob
        if "No supported JavaScript runtime" in err_blob:
            saw_js_runtime_issue = True
        if "This video is not available" in err_blob:
            saw_unavailable = True

    if saw_js_runtime_issue and not js_args:
        raise RuntimeError(
            "yt-dlp: missing JS runtime for YouTube. "
            "Install Node.js or Deno and try again. "
            "(YouTube requires JS runtime for some content)"
        )
    if saw_unavailable:
        raise RuntimeError(
            "YouTube returned: video unavailable (private/geo/age/restrictions). "
            "Try another link or logged-in cookies in yt-dlp. Details: " + last_err[-500:]
        )
    raise RuntimeError("yt-dlp error: " + (last_err or "unknown error")[-800:])


def transcribe_audio(audio_path):
    model_name = os.environ.get("WHISPER_MODEL", "small")
    errors = []

    try:
        from faster_whisper import WhisperModel
        if _WHISPER_CACHE["engine"] != "faster" or _WHISPER_CACHE["name"] != model_name:
            try:
                model = WhisperModel(model_name, device="cuda", compute_type="float16")
            except Exception:
                model = WhisperModel(model_name, device="cpu", compute_type="int8")
            _WHISPER_CACHE.update({"engine": "faster", "model": model, "name": model_name})
        model = _WHISPER_CACHE["model"]
        segments, _info = model.transcribe(audio_path, language="pl", beam_size=5, vad_filter=True)
        text = " ".join((s.text or "").strip() for s in segments).strip()
        if text:
            return text
    except Exception as e:
        errors.append("faster-whisper: " + str(e))

    try:
        import whisper
        if _WHISPER_CACHE["engine"] != "openai" or _WHISPER_CACHE["name"] != model_name:
            model = whisper.load_model(model_name)
            _WHISPER_CACHE.update({"engine": "openai", "model": model, "name": model_name})
        model = _WHISPER_CACHE["model"]
        result = model.transcribe(audio_path, language="pl", fp16=False)
        text = (result.get("text") or "").strip()
        if text:
            return text
    except Exception as e:
        errors.append("openai-whisper: " + str(e))

    raise RuntimeError(
        "No working transcription engine (Whisper). "
        "Install for example: pip install faster-whisper yt-dlp. Details: " + " | ".join(errors[-2:])
    )


def transcribe_audio_segments(audio_path):
    model_name = os.environ.get("WHISPER_MODEL", "small")
    errors = []

    try:
        from faster_whisper import WhisperModel
        if _WHISPER_CACHE["engine"] != "faster" or _WHISPER_CACHE["name"] != model_name:
            try:
                model = WhisperModel(model_name, device="cuda", compute_type="float16")
            except Exception:
                model = WhisperModel(model_name, device="cpu", compute_type="int8")
            _WHISPER_CACHE.update({"engine": "faster", "model": model, "name": model_name})
        model = _WHISPER_CACHE["model"]
        segments, _info = model.transcribe(audio_path, language="pl", beam_size=5, vad_filter=True)
        cues = []
        for seg in segments:
            text = (getattr(seg, "text", "") or "").strip()
            start = int(round(float(getattr(seg, "start", 0.0) or 0.0) * 1000.0))
            end = int(round(float(getattr(seg, "end", 0.0) or 0.0) * 1000.0))
            if not text or end <= start:
                continue
            cues.append({
                "start_ms": start,
                "end_ms": end,
                "duration_ms": end - start,
                "text": text,
            })
        if cues:
            return cues
    except Exception as e:
        errors.append("faster-whisper: " + str(e))

    try:
        import whisper
        if _WHISPER_CACHE["engine"] != "openai" or _WHISPER_CACHE["name"] != model_name:
            model = whisper.load_model(model_name)
            _WHISPER_CACHE.update({"engine": "openai", "model": model, "name": model_name})
        model = _WHISPER_CACHE["model"]
        result = model.transcribe(audio_path, language="pl", fp16=False)
        cues = []
        for seg in (result.get("segments") or []):
            text = str(seg.get("text") or "").strip()
            start = int(round(float(seg.get("start", 0.0) or 0.0) * 1000.0))
            end = int(round(float(seg.get("end", 0.0) or 0.0) * 1000.0))
            if not text or end <= start:
                continue
            cues.append({
                "start_ms": start,
                "end_ms": end,
                "duration_ms": end - start,
                "text": text,
            })
        if cues:
            return cues
    except Exception as e:
        errors.append("openai-whisper: " + str(e))

    raise RuntimeError(
        "No working transcription engine (Whisper). "
        "Install for example: pip install faster-whisper yt-dlp. Details: " + " | ".join(errors[-2:])
    )


def create_voice_sample(source_path, start_sec, duration_sec, voice_name, lectors_dir, temp_dir):
    if not os.path.isfile(source_path):
        raise ValueError("Source file does not exist: " + source_path)
    safe_name = _sanitize_voice_name(voice_name)
    if not safe_name:
        raise ValueError("Provide a valid narrator name.")

    os.makedirs(lectors_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True)

    start_sec = max(0.0, float(start_sec or 0))
    duration_sec = max(1.0, float(duration_sec or 10))

    temp_clip = os.path.join(temp_dir, f"{safe_name}_clip.wav")
    final_wav = os.path.join(lectors_dir, f"{safe_name}.wav")
    final_txt = os.path.join(lectors_dir, f"{safe_name}.txt")

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start_sec:.3f}",
        "-t", f"{duration_sec:.3f}",
        "-i", source_path,
        "-ac", "1",
        "-ar", "44100",
        "-c:a", "pcm_s16le",
        temp_clip,
    ]
    proc = _run_cmd(cmd)
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg clip error: " + (proc.stderr or "")[-800:])

    if not os.path.isfile(temp_clip):
        raise RuntimeError("Failed to create trimmed WAV file.")

    transcript = transcribe_audio(temp_clip)

    shutil.copyfile(temp_clip, final_wav)
    with open(final_txt, "w", encoding="utf-8") as f:
        f.write(transcript.strip() + "\n")

    return {
        "voice_name": safe_name,
        "wav_path": final_wav,
        "txt_path": final_txt,
        "temp_clip": temp_clip,
        "text": transcript.strip(),
    }


# ---------- AI Voiceover (subtitles -> timed TTS -> video render) ----------

def _parse_tc_to_ms(tc):
    tc = (tc or "").strip().replace(",", ".")
    m = re.match(r"^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$", tc)
    if not m:
        raise ValueError("Invalid timecode: " + tc)
    hh = int(m.group(1))
    mm = int(m.group(2))
    ss = int(m.group(3))
    ms_raw = m.group(4)
    ms = int(ms_raw.ljust(3, "0")[:3])
    return ((hh * 3600 + mm * 60 + ss) * 1000) + ms


def _fmt_ms(ms):
    ms = int(max(0, ms))
    hh = ms // 3600000
    rem = ms % 3600000
    mm = rem // 60000
    rem %= 60000
    ss = rem // 1000
    mss = rem % 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d}.{mss:03d}"


def parse_subtitles_file(path):
    raw = Path(path).read_bytes()
    text = decode_best_text(raw).replace("\r\n", "\n").replace("\r", "\n").strip("\n")
    lower_name = str(path).lower()

    cues = []
    if lower_name.endswith(".srt"):
        blocks = re.split(r"\n\s*\n", text)
        for block in blocks:
            lines = [ln.strip("\ufeff") for ln in block.split("\n") if ln.strip()]
            if len(lines) < 2:
                continue
            time_idx = 1 if re.match(r"^\d+$", lines[0]) else 0
            if time_idx >= len(lines):
                continue
            m = re.match(r"^(\d{2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{1,3})", lines[time_idx])
            if not m:
                continue
            start_ms = _parse_tc_to_ms(m.group(1))
            end_ms = _parse_tc_to_ms(m.group(2))
            if end_ms <= start_ms:
                continue
            cue_text = " ".join(lines[time_idx + 1:]).strip()
            cue_text = re.sub(r"<[^>]+>", " ", cue_text)
            cue_text = re.sub(r"\s+", " ", cue_text).strip()
            if not cue_text:
                continue
            cues.append({
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": end_ms - start_ms,
                "text": cue_text,
            })
    elif lower_name.endswith(".vtt"):
        blocks = re.split(r"\n\s*\n", text)
        for block in blocks:
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if not lines:
                continue
            if lines[0].upper().startswith("WEBVTT"):
                continue
            time_line = lines[0]
            if re.match(r"^[A-Za-z0-9_-]+$", lines[0]) and len(lines) > 1:
                time_line = lines[1]
                content_lines = lines[2:]
            else:
                content_lines = lines[1:]
            m = re.match(r"^(\d{2}:\d{2}:\d{2}[\.,]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{1,3})", time_line)
            if not m:
                continue
            start_ms = _parse_tc_to_ms(m.group(1))
            end_ms = _parse_tc_to_ms(m.group(2))
            if end_ms <= start_ms:
                continue
            cue_text = " ".join(content_lines).strip()
            cue_text = re.sub(r"<[^>]+>", " ", cue_text)
            cue_text = re.sub(r"\s+", " ", cue_text).strip()
            if not cue_text:
                continue
            cues.append({
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": end_ms - start_ms,
                "text": cue_text,
            })
    else:
        raise ValueError("Supported subtitle formats: .srt, .vtt")

    cues.sort(key=lambda c: (c["start_ms"], c["end_ms"]))
    for i, c in enumerate(cues, 1):
        c["idx"] = i
        c["start_tc"] = _fmt_ms(c["start_ms"])
        c["end_tc"] = _fmt_ms(c["end_ms"])
    return cues


def _build_atempo_chain(rate):
    # ffmpeg atempo supports 0.5..2.0 per filter, so chain when needed
    rate = max(0.5, float(rate))
    factors = []
    while rate > 2.0:
        factors.append(2.0)
        rate /= 2.0
    while rate < 0.5:
        factors.append(0.5)
        rate /= 0.5
    factors.append(rate)
    return ",".join([f"atempo={f:.5f}" for f in factors])


def _ffprobe_duration_ms(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    proc = _run_cmd(cmd)
    if proc.returncode != 0:
        return 0
    try:
        sec = float((proc.stdout or "0").strip() or "0")
        return int(round(sec * 1000.0))
    except Exception:
        return 0


def extract_media_audio(media_path, output_path):
    if not os.path.isfile(media_path):
        raise ValueError("Media file not found: " + str(media_path))
    out_dir = os.path.dirname(output_path) or "."
    os.makedirs(out_dir, exist_ok=True)
    proc = _run_cmd([
        "ffmpeg", "-y",
        "-i", media_path,
        "-vn",
        "-ac", "2",
        "-ar", "48000",
        output_path,
    ])
    if proc.returncode != 0 or not os.path.isfile(output_path):
        raise RuntimeError("ffmpeg audio extract error: " + (proc.stderr or proc.stdout or "")[-1200:])
    return output_path


def _write_srt(cues, output_path):
    lines = []
    for idx, cue in enumerate(cues, 1):
        start_tc = _fmt_ms(int(cue.get("start_ms", 0))).replace(".", ",")
        end_tc = _fmt_ms(int(cue.get("end_ms", 0))).replace(".", ",")
        text = str(cue.get("text") or "").strip()
        if not text:
            continue
        lines.extend([str(idx), f"{start_tc} --> {end_tc}", text, ""])
    Path(output_path).write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return output_path


def transcribe_video_to_subtitles(video_path, workdir=None):
    if not os.path.isfile(video_path):
        raise ValueError("Video file not found: " + str(video_path))

    root_dir = workdir or os.path.dirname(video_path) or "."
    temp_dir = os.path.join(root_dir, "temp_voiceover")
    os.makedirs(temp_dir, exist_ok=True)

    video_name = Path(video_path).stem
    audio_path = os.path.join(temp_dir, f"{video_name}_source_audio.wav")
    subtitle_path = os.path.join(temp_dir, f"{video_name}_auto.srt")

    extract_media_audio(video_path, audio_path)
    cues = transcribe_audio_segments(audio_path)
    cues.sort(key=lambda c: (c["start_ms"], c["end_ms"]))
    for i, cue in enumerate(cues, 1):
        cue["idx"] = i
        cue["start_tc"] = _fmt_ms(cue["start_ms"])
        cue["end_tc"] = _fmt_ms(cue["end_ms"])
    _write_srt(cues, subtitle_path)
    return {
        "ok": True,
        "subtitle_path": subtitle_path,
        "audio_path": audio_path,
        "cues": cues,
        "count": len(cues),
    }


def _build_tts_command(text, out_abs_path, ref_audio_abs, ref_text_abs):
    safe = (text or "").replace('"', '`"')
    return (
        f'$promptText = Get-Content -Raw -Path "{ref_text_abs}"\n'
        '.\\s2.exe `\n'
        '  -m "s2-pro-q8_0.gguf" `\n'
        '  -t "tokenizer.json" `\n'
        '  -c 0 `\n'
        f'  -pa "{ref_audio_abs}" `\n'
        '  -pt "$promptText" `\n'
        f'  -text "{safe}" `\n'
        f'  -o "{out_abs_path}"'
    )


def generate_voiceover_fragment(idx, text, subtitle_duration_ms, workdir, temp_dir, voice_name, auto_fit=True):
    safe_voice = _sanitize_voice_name(voice_name)
    if not safe_voice:
        raise ValueError("Invalid narrator name")
    ref_audio = os.path.join(workdir, "Lectors", safe_voice + ".wav")
    ref_text = os.path.join(workdir, "Lectors", safe_voice + ".txt")
    if not os.path.isfile(ref_audio):
        raise ValueError("Narrator reference audio not found: " + ref_audio)
    if not os.path.isfile(ref_text):
        raise ValueError("Narrator reference text not found: " + ref_text)

    os.makedirs(temp_dir, exist_ok=True)
    raw_out = os.path.join(temp_dir, f"frag_{int(idx):04d}_raw.wav")
    fit_out = os.path.join(temp_dir, f"frag_{int(idx):04d}.wav")

    emit_event("voiceover:progress", idx=int(idx), status="processing")
    cmd = _build_tts_command(text, raw_out, ref_audio, ref_text)
    rc, _stdout, stderr = run_powershell(cmd, workdir)
    if rc != 0 or (not os.path.isfile(raw_out)):
        msg = "TTS error: " + (stderr or "unknown error")[-600:]
        emit_event("voiceover:progress", idx=int(idx), status="error", message=msg)
        return {"ok": False, "error": msg}

    audio_ms = int(round(get_wav_duration(raw_out) * 1000.0))
    target_ms = int(max(1, subtitle_duration_ms or 1))
    playback_rate = 1.0
    warning = None

    if auto_fit and audio_ms > target_ms:
        playback_rate = max(1.0, float(audio_ms) / float(target_ms))
        atempo = _build_atempo_chain(playback_rate)
        proc = _run_cmd(["ffmpeg", "-y", "-i", raw_out, "-filter:a", atempo, fit_out])
        if proc.returncode == 0 and os.path.isfile(fit_out):
            audio_ms = int(round(get_wav_duration(fit_out) * 1000.0))
        else:
            shutil.copyfile(raw_out, fit_out)
            warning = "Could not auto-fit with ffmpeg; using raw clip"
    else:
        shutil.copyfile(raw_out, fit_out)

    if audio_ms > target_ms and not warning:
        warning = f"Clip longer than subtitle window ({audio_ms}ms > {target_ms}ms)"

    emit_event(
        "voiceover:progress",
        idx=int(idx),
        status="success",
        audio_path=fit_out,
        audio_ms=audio_ms,
        target_ms=target_ms,
        playback_rate=playback_rate,
        warning=warning or "",
    )
    return {
        "ok": True,
        "audio_path": fit_out,
        "audio_ms": audio_ms,
        "target_ms": target_ms,
        "playback_rate": playback_rate,
        "warning": warning,
    }


def render_voiceover_video(video_path, cues, output_path, ducking_percent=0):
    from pydub import AudioSegment

    if not os.path.isfile(video_path):
        raise ValueError("Video file not found: " + str(video_path))
    if not cues:
        raise ValueError("No cues to render")

    output_dir = os.path.dirname(output_path) or "."
    os.makedirs(output_dir, exist_ok=True)
    temp_dir = os.path.join(output_dir, "temp_voiceover")
    os.makedirs(temp_dir, exist_ok=True)
    voice_track = os.path.join(temp_dir, "voiceover_track.wav")

    video_ms = _ffprobe_duration_ms(video_path)
    if video_ms <= 0:
        video_ms = max((int(c.get("end_ms", 0)) for c in cues), default=0) + 2000

    timeline = AudioSegment.silent(duration=video_ms)
    for cue in cues:
        path = cue.get("audio_path")
        if not path or not os.path.isfile(path):
            continue
        clip = AudioSegment.from_file(path)
        start_ms = int(cue.get("start_ms", 0)) + int(cue.get("offset_ms", 0))
        if start_ms < 0:
            start_ms = 0
        timeline = timeline.overlay(clip, position=start_ms)

    timeline.export(voice_track, format="wav")

    ducking = max(0, min(100, int(ducking_percent or 0)))
    base_volume = max(0.0, 1.0 - (ducking / 100.0))
    if ducking > 0:
        filter_complex = f"[0:a]volume={base_volume:.3f}[a0];[a0][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    else:
        filter_complex = "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]"

    proc = _run_cmd([
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", voice_track,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-shortest",
        output_path,
    ])
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg render error: " + (proc.stderr or proc.stdout or "")[-1200:])

    return {
        "ok": True,
        "output_path": output_path,
        "voice_track": voice_track,
        "video_duration_ms": video_ms,
    }


# ---------- DISPATCHER ----------

def handle(method, params):
    if method == "ping":
        return {"ok": True}
    if method == "server_ping":
        try:
            import server_pipeline
            res = server_pipeline.ping_server(params["url"], timeout=params.get("timeout", 3))
            # ping_server zwraca tuple (bool_alive, info_str)
            if isinstance(res, tuple) and len(res) >= 1:
                alive = bool(res[0])
                info = str(res[1]) if len(res) > 1 else ""
            else:
                alive = bool(res); info = ""
            return {"ok": alive, "info": info}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    if method == "server_run_queue":
        # Pipeline z aiohttp - dwufazowy prebuild + GPU flood
        try:
            import server_pipeline
        except ImportError as e:
            return {"ok": False, "error": "server_pipeline import: " + str(e)}
        # Wczytaj reference audio do RAM (cache na backendzie)
        ref_audio_path = params.get("ref_audio_path", "")
        ref_audio_bytes = None
        ref_audio_name = "reference.wav"
        if ref_audio_path:
            if os.path.isfile(ref_audio_path):
                with open(ref_audio_path, "rb") as f:
                    ref_audio_bytes = f.read()
                ref_audio_name = os.path.basename(ref_audio_path)
            else:
                return {"ok": False, "error": "Brak pliku reference_audio: " + ref_audio_path}
        # Wczytaj reference text
        ref_text = ""
        ref_text_file = params.get("ref_text_file", "")
        if ref_text_file and os.path.isfile(ref_text_file):
            with open(ref_text_file, "r", encoding="utf-8", errors="ignore") as f:
                ref_text = f.read().strip()
        cfg = {
            "url":       params.get("url", "http://127.0.0.1:8080"),
            "endpoint":  params.get("endpoint", "/generate"),
            "workdir":   params["workdir"],
            "subdir":    params.get("subdir", "Silos"),
            "ref_audio_bytes": ref_audio_bytes,
            "ref_audio_name":  ref_audio_name,
            "ref_text":  ref_text,
            "fragments": [(int(t["idx"]), t["text"], t.get("frag_subdir") or None) for t in params["fragments"]],
            "phonetic_map": params.get("phonetic_map") or None,
            "gpu_workers": int(params.get("gpu_workers", 1)),
            "timeout":   int(params.get("timeout", 1800)),
            "output_format": str(params.get("output_format", "wav")).lower(),
            "temperature":        float(params.get("temperature", 0.8)),
            "top_p":              float(params.get("top_p", 0.8)),
            "repetition_penalty": float(params.get("repetition_penalty", 1.1)),
            "chunk_length":       int(params.get("chunk_length", 200)),
            "max_new_tokens":     int(params.get("max_new_tokens", 0)),
            "max_retries":        int(params.get("max_retries", 2)),
            "voice_label":        str(params.get("voice_label", "")),
            "session_ts":         str(params.get("session_ts", "")),
        }
        os.makedirs(os.path.join(cfg["workdir"], cfg["subdir"]), exist_ok=True)
        def on_event(typ, idx, **data):
            if typ == "start":
                emit_event("fragment:progress", idx=idx, status="processing")
            elif typ == "success":
                emit_event("fragment:progress", idx=idx, status="success",
                           wav=data.get("wav", ""), duration=data.get("duration", 0.0))
            elif typ == "error":
                emit_event("fragment:progress", idx=idx, status="error",
                           message=data.get("msg", ""))
            elif typ == "done":
                emit_event("queue:done")
            elif typ == "log":
                emit_event("log", line=data.get("line", ""))
        return server_pipeline.run_pipeline_sync(cfg, on_event)
    if method == "merge_audio":
        import glob
        from pydub import AudioSegment
        directory     = params.get("dir", "")
        prefix        = params.get("prefix", "")
        output_format = (params.get("output_format") or "mp3").lower()
        if not directory or not prefix:
            return {"ok": False, "error": "Brak dir lub prefix"}
        pattern = os.path.join(directory, "{}_{}.{}".format(prefix, "*", output_format))
        files = sorted(glob.glob(pattern))
        # Wyklucz plik _full jesli juz istnieje
        files = [f for f in files if not f.replace("\\", "/").split("/")[-1].startswith(prefix + "_full")]
        if not files:
            return {"ok": False, "error": "Brak plikow do scalenia", "pattern": pattern}
        combined = AudioSegment.empty()
        for f in files:
            combined += AudioSegment.from_file(f, format=output_format)
        output_path = os.path.join(directory, "{}_full.{}".format(prefix, output_format))
        combined.export(output_path, format=output_format, bitrate="192k")
        return {"ok": True, "path": output_path, "count": len(files)}
    if method == "load_book":
        chapters = load_book(params["path"])
        chapters_with_counts = []
        full_text_parts = []
        for ch in chapters:
            t = ch.get("text", "")
            fragments = split_into_fragments(t, target_chars=390)
            chapters_with_counts.append({
                "title": ch["title"],
                "text":  t,
                "fragment_count": len(fragments),
            })
            full_text_parts.append(t)
        # Wyciagamy speakerow: najpierw sidecar (<basename>.speakers.txt),
        # potem tagi [speaker:Imie] w tekscie ksiazki
        speakers = load_speakers_sidecar(params["path"])
        if not speakers:
            speakers = extract_speakers_from_text("\n".join(full_text_parts))
        return {"chapters": chapters_with_counts, "speakers": speakers}
    if method == "split_text":
        target = int(params.get("target_chars", 390))
        return {"fragments": split_into_fragments(params["text"], target_chars=target)}
    if method == "process_fragment":
        return RUNNER.process(
            int(params["idx"]),
            params["text"],
            params["workdir"],
            params.get("subdir", "Silos"),
            params.get("preprocess", {}),
        )
    if method == "merge_wavs":
        merge_wavs(params["paths"], params["out_path"])
        audio = sum(get_wav_duration(p) for p in params["paths"])
        return {"audio_seconds": audio}
    if method == "get_wav_duration":
        return {"seconds": get_wav_duration(params["path"])}
    if method == "exists":
        return {"exists": os.path.exists(params["path"])}
    if method == "ensure_dir":
        os.makedirs(params["path"], exist_ok=True)
        return {"ok": True}
    if method == "build_command_preview":
        return {"command": build_command(
            params["text"], int(params["idx"]),
            params.get("subdir", "Silos"))}
    if method == "wav_path_for":
        wd  = params["workdir"]
        sub = params.get("subdir", "Silos")
        idx = int(params["idx"])
        rel = output_filename(idx, sub)
        full = os.path.join(wd, rel)
        return {"path": full, "exists": os.path.exists(full)}
    if method == "apply_phonetic_preview":
        return {"text": apply_phonetic_corrections(
            params.get("text", ""),
            params.get("options"))}
    if method == "scan_existing_wavs":
        # Skanuje workdir/subdir, zwraca liste {idx, path, exists}
        # dla fragmentow 1..count
        wd  = params.get("workdir", "")
        sub = params.get("subdir", "Silos")
        count = int(params.get("count", 0))
        results = []
        target_dir = os.path.join(wd, sub) if wd else ""
        for i in range(1, count + 1):
            rel = output_filename(i, sub)
            full = os.path.join(wd, rel) if wd else rel
            # Sprobuj rowniez .mp3 (alternative format)
            alt_mp3 = os.path.splitext(full)[0] + ".mp3"
            if os.path.isfile(full):
                results.append({"idx": i, "path": full, "exists": True, "ext": "wav"})
            elif os.path.isfile(alt_mp3):
                results.append({"idx": i, "path": alt_mp3, "exists": True, "ext": "mp3"})
            else:
                results.append({"idx": i, "path": full, "exists": False, "ext": "wav"})
        return {"results": results, "scanned": count}
    if method == "list_subdirs":
        base = params.get("path", "")
        if not base or not os.path.isdir(base):
            return {"dirs": []}
        dirs = sorted(
            d for d in os.listdir(base)
            if os.path.isdir(os.path.join(base, d)) and not d.startswith(".")
        )
        return {"dirs": dirs}
    if method == "list_files":
        base = params.get("path", "")
        allowed_ext = [e.lower().lstrip(".") for e in (params.get("extensions") or ["epub", "txt", "pdf"])]
        if not base or not os.path.isdir(base):
            return {"files": []}
        files = []
        for entry in sorted(os.listdir(base)):
            if os.path.isfile(os.path.join(base, entry)):
                stem, ext = os.path.splitext(entry)
                if ext.lower().lstrip(".") in allowed_ext:
                    files.append({
                        "name": entry,
                        "stem": stem,
                        "path": os.path.join(base, entry),
                    })
        return {"files": files}
    if method == "delete_book":
        # Usuwa caly folder ksiazki w Audiobooks/<book_name>
        import shutil
        audiobooks_dir = params.get("audiobooks_dir", "")
        book_name = (params.get("book_name") or "").strip()
        if not audiobooks_dir or not book_name:
            return {"ok": False, "error": "Brak audiobooks_dir lub book_name"}
        target = os.path.join(audiobooks_dir, book_name)
        if not os.path.isdir(target):
            return {"ok": False, "error": "Nie znaleziono ksiazki: " + book_name}
        try:
            shutil.rmtree(target)
            return {"ok": True, "removed": target}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    if method == "list_voices":
        voices_dir = params.get("voices_dir", "")
        voices = []
        if voices_dir and os.path.isdir(voices_dir):
            seen = set()
            for entry in sorted(os.listdir(voices_dir)):
                base, ext = os.path.splitext(entry)
                if ext.lower() not in (".wav", ".mp3", ".flac"):
                    continue
                if base in seen:
                    continue
                seen.add(base)
                wav_path = os.path.join(voices_dir, entry)
                txt_path = os.path.join(voices_dir, base + ".txt")
                transcript = ""
                if os.path.isfile(txt_path):
                    with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
                        transcript = f.read().strip()
                voices.append({
                    "name": base,
                    "first_sample": wav_path,
                    "txt_path": txt_path,
                    "sample_count": 1,
                    "source": "manual/yt",
                    "transcript": transcript,
                })
        return {"voices": voices}
    if method == "delete_voice":
        voices_dir = params.get("voices_dir", "")
        voice_name = params.get("voice_name", "")
        if not voices_dir or not voice_name:
            return {"ok": False, "error": "Brak voices_dir lub voice_name"}
        deleted = []
        for ext in (".wav", ".mp3", ".flac", ".txt"):
            p = os.path.join(voices_dir, voice_name + ext)
            if os.path.isfile(p):
                os.remove(p)
                deleted.append(p)
        if deleted:
            return {"ok": True, "deleted": deleted}
        return {"ok": False, "error": "Nie znaleziono pliku lektora: " + voice_name}
    if method == "rename_voice":
        voices_dir = params.get("voices_dir", "")
        old_name = params.get("voice_name") or params.get("old_name", "")
        new_name = params.get("new_name", "")
        if not (voices_dir and old_name and new_name):
            return {"ok": False, "error": "Brak voices_dir / old_name / new_name"}
        renamed = []
        for ext in (".wav", ".mp3", ".flac", ".txt"):
            src = os.path.join(voices_dir, old_name + ext)
            dst = os.path.join(voices_dir, new_name + ext)
            if os.path.isfile(src):
                if os.path.exists(dst):
                    return {"ok": False, "error": "Cel juz istnieje: " + new_name + ext}
                os.rename(src, dst)
                renamed.append(dst)
        if renamed:
            return {"ok": True, "renamed": renamed}
        return {"ok": False, "error": "Nie znaleziono pliku lektora: " + old_name}
    if method == "download_youtube_audio":
        try:
            temp_dir = params.get("temp_dir") or os.path.join(
                params.get("voices_dir", "."), "Temp")
            result = download_youtube_audio(params.get("url", ""), temp_dir)
            return {"ok": True, "audio_path": result["audio_path"], "title": result["title"]}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    if method == "create_voice_sample":
        try:
            temp_dir = params.get("temp_dir") or os.path.join(
                params.get("lectors_dir") or params.get("voices_dir", "."), "Temp")
            lectors_dir = params.get("lectors_dir") or params.get("voices_dir", ".")
            result = create_voice_sample(
                source_path  = params["source_path"],
                start_sec    = float(params.get("start_sec", 0)),
                duration_sec = float(params.get("duration_sec", 10)),
                voice_name   = params["voice_name"],
                lectors_dir  = lectors_dir,
                temp_dir     = temp_dir,
            )
            return {"ok": True, **result}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    if method == "voiceover_parse_subtitles":
        cues = parse_subtitles_file(params.get("path", ""))
        return {"ok": True, "cues": cues, "count": len(cues)}
    if method == "voiceover_transcribe_video":
        return transcribe_video_to_subtitles(
            video_path=params.get("video_path", ""),
            workdir=params.get("workdir", ""),
        )
    if method == "voiceover_extract_video_audio":
        video_path = params.get("video_path", "")
        output_path = params.get("output_path", "")
        if not output_path:
            base_dir = params.get("workdir", "") or os.path.dirname(video_path) or "."
            temp_dir = os.path.join(base_dir, "temp_voiceover")
            os.makedirs(temp_dir, exist_ok=True)
            output_path = os.path.join(temp_dir, f"{Path(video_path).stem}_preview_audio.wav")
        return {"ok": True, "audio_path": extract_media_audio(video_path, output_path)}
    if method == "voiceover_generate_fragment":
        return generate_voiceover_fragment(
            idx=int(params.get("idx", 0)),
            text=params.get("text", ""),
            subtitle_duration_ms=int(params.get("subtitle_duration_ms", 0)),
            workdir=params.get("workdir", ""),
            temp_dir=params.get("temp_dir", "temp_voiceover"),
            voice_name=params.get("voice_name", ""),
            auto_fit=bool(params.get("auto_fit", True)),
        )
    if method == "voiceover_render_video":
        return render_voiceover_video(
            video_path=params.get("video_path", ""),
            cues=params.get("cues", []),
            output_path=params.get("output_path", "video_with_voiceover.mp4"),
            ducking_percent=int(params.get("ducking_percent", 0)),
        )
    raise ValueError("Unknown method: " + str(method))


# ───────────────────────── MAIN LOOP ─────────────────────────

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            emit({"error": "JSON parse: " + str(e)})
            continue
        rid    = req.get("id")
        method = req.get("method")
        params = req.get("params") or {}
        try:
            result = handle(method, params)
            emit({"id": rid, "result": result})
        except Exception as e:
            tb = traceback.format_exc()
            sys.stderr.write(tb)
            sys.stderr.flush()
            emit({"id": rid, "error": str(e)})


if __name__ == "__main__":
    main()
