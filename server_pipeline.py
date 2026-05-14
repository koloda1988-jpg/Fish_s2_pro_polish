# -*- coding: utf-8 -*-
"""
server_pipeline.py — pipeline kolejki fragmentow do serwera TTS.

Domyslnie celuje w nasz `s2_server.py` (port 8080, endpoint /generate),
ktory wystawia ten sam multipart format co stary s2.cpp:

    POST /generate
    fields: text, reference_text, reference_audio (WAV bytes)
    return: audio/wav

Pipeline:
- CPU-side prebuild fragmentow (apply_phonetic + multipart body) w ThreadPoolExecutor
- GPU-side flood: gpu_workers requestow w locie, Semaphore steruje
- Disk writer w osobnym watku, by GPU nie czekal na zapis
- Retry przy TimeoutError (do max_retries razy, ze zmniejszonym workersami)

Publiczne API:
    ping_server(url, timeout=3) -> (alive: bool, info: str)
    run_pipeline_sync(cfg, on_event, stop_flag=None) -> {"ok": bool, ...}
"""

import os
import re
import sys
import time
import json
import wave
import base64
import asyncio
import threading
import traceback
import urllib.request
import urllib.error
from queue import Queue
from concurrent.futures import ThreadPoolExecutor

try:
    import aiohttp
except ImportError:
    aiohttp = None

# Pydub do konwersji WAV -> MP3 po stronie disk-writera.
# Imageio-ffmpeg dostarcza scieżke do ffmpeg.exe bez instalacji systemowej.
try:
    from pydub import AudioSegment
    try:
        import imageio_ffmpeg
        AudioSegment.converter = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass  # spróbuj systemowego ffmpeg z PATH
    _PYDUB_OK = True
except Exception:
    AudioSegment = None
    _PYDUB_OK = False


# ─── Konfiguracja domyslna ──────────────────────────────────────────────────

DEFAULT_SUBDIR = "Silos"
DEFAULT_URL = "http://127.0.0.1:8080"
DEFAULT_ENDPOINT = "/generate"      # nasz s2_server.py — kompatybilny z s2.cpp
DEFAULT_TIMEOUT = 1800              # 30 min, bezpiecznie dla dlugich fragmentow
DEFAULT_GPU_WORKERS = 1             # s2_server ma global lock — 1 wystarczy
DEFAULT_PRE_WORKERS = 8             # CPU prebuild
DEFAULT_DISK_WORKERS = 1            # zapis WAV-ow (1 wystarczy)
DEFAULT_MAX_RETRIES = 2             # retry przy TimeoutError


def _sanitize_part(s):
    """Usuwa znaki niedozwolone w nazwach plikow Windows i zamienia spacje na '_'."""
    if not s:
        return ""
    s = s.strip().replace(" ", "_")
    s = re.sub(r'[\\/:*?"<>|]', "", s)
    return s or ""


def output_filename(index, subdir=DEFAULT_SUBDIR, ext="wav", voice_label="", session_ts=""):
    """Buduje nazwe pliku: {lektor}_{ksiazka}_{rozdzial}_{ts}_{idx:04d}.{ext}"""
    parts = re.split(r'[\\/]', (subdir or "").strip("\\/"))
    if parts and parts[0].lower() == "audiobooks":
        parts = parts[1:]
    book    = _sanitize_part(parts[0]) if len(parts) > 0 else ""
    chapter = _sanitize_part(parts[1]) if len(parts) > 1 else ""
    voice   = _sanitize_part(voice_label)
    ts      = _sanitize_part(session_ts)
    segments = [s for s in [voice, book, chapter, ts] if s]
    prefix = "_".join(segments) if segments else "fragment"
    name = "{}_{:04d}.{}".format(prefix, index, ext)
    if subdir:
        return "{}\\{}".format(subdir.rstrip("\\/"), name)
    return name


# ─── Fonetyka (passowana z python_backend) ──────────────────────────────────

def apply_phonetic(text, mapping):
    """Cale slowo, case-insensitive po stronie src; zachowuje wielkosc."""
    if not mapping or not text:
        return text
    keys = sorted(mapping.keys(), key=len, reverse=True)
    pattern = re.compile(
        r"\b(" + "|".join(re.escape(k) for k in keys) + r")\b",
        re.IGNORECASE | re.UNICODE,
    )
    lower_map = {k.lower(): mapping[k] for k in mapping}

    def repl(m):
        word = m.group(1)
        rep = lower_map.get(word.lower(), word)
        if word.isupper():
            return rep.upper()
        if word[:1].isupper():
            return rep[:1].upper() + rep[1:]
        return rep
    return pattern.sub(repl, text)


# ─── Multipart builder ──────────────────────────────────────────────────────

def _build_multipart(fields, files=None):
    """Buduje multipart/form-data.
    fields = {name: str_value}, files = {name: (filename, content_bytes, content_type)}.
    Zwraca (body_bytes, content_type_header_value).
    """
    boundary = b"----Boundary" + base64.b64encode(os.urandom(12)) \
        .replace(b"+", b"-").replace(b"/", b"_")
    parts = []
    for name, value in (fields or {}).items():
        parts.append(
            b"--" + boundary + b"\r\n"
            b'Content-Disposition: form-data; name="' + name.encode() + b'"\r\n'
            b"\r\n" + (value.encode("utf-8") if isinstance(value, str) else value) + b"\r\n"
        )
    for name, (filename, content, ctype) in (files or {}).items():
        parts.append(
            b"--" + boundary + b"\r\n"
            b'Content-Disposition: form-data; name="' + name.encode()
            + b'"; filename="' + filename.encode() + b'"\r\n'
            b"Content-Type: " + ctype.encode() + b"\r\n"
            b"\r\n" + content + b"\r\n"
        )
    body = b"".join(parts) + b"--" + boundary + b"--\r\n"
    ct = "multipart/form-data; boundary=" + boundary.decode()
    return body, ct


# ─── Healthcheck (prosty urlopen) ───────────────────────────────────────────

def ping_server(server_url, timeout=3):
    """GET / na serwer; zwraca (alive: bool, info: str)."""
    url = server_url.rstrip("/") + "/"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return True, "HTTP {}".format(r.status)
    except urllib.error.HTTPError as e:
        # nawet 404 znaczy ze serwer odpowiada
        return True, "HTTP {} {} (zyje)".format(e.code, e.reason)
    except Exception as e:
        return False, str(e)


# ─── Prebuild + asyncio pipeline ────────────────────────────────────────────

def _prebuild_request(idx, fragment, phonetic_map, srv_cfg, frag_subdir=None):
    """CPU-side: aplikuje fonetyke i buduje gotowe bajty multipart.
    Zwraca (idx, url, body, content_type, expected_path, output_format).
    """
    wd = srv_cfg["workdir"]
    sub = frag_subdir if frag_subdir else srv_cfg.get("subdir", DEFAULT_SUBDIR)
    out_fmt = (srv_cfg.get("output_format") or "wav").lower()
    if out_fmt not in ("wav", "mp3"):
        out_fmt = "wav"
    text = apply_phonetic(fragment, phonetic_map) if phonetic_map else fragment
    voice_label = srv_cfg.get("voice_label", "")
    session_ts  = srv_cfg.get("session_ts", "")
    expected = os.path.join(wd, output_filename(idx, sub, ext=out_fmt, voice_label=voice_label, session_ts=session_ts))
    os.makedirs(os.path.dirname(expected), exist_ok=True)

    fields = {"text": text}
    ref_text = srv_cfg.get("ref_text", "")
    if ref_text:
        fields["reference_text"] = ref_text

    # Parametry zaawansowane TTS (opcjonalne — s2_server.py uzywa swoich defaultow gdy brak)
    for key in ("temperature", "top_p", "repetition_penalty", "chunk_length", "max_new_tokens", "seed"):
        val = srv_cfg.get(key)
        if val is not None:
            fields[key] = str(val)

    files = {}
    ref_bytes = srv_cfg.get("ref_audio_bytes")
    ref_name = srv_cfg.get("ref_audio_name", "reference.wav")
    if ref_bytes:
        files["reference_audio"] = (ref_name, ref_bytes, "audio/wav")

    body, ct = _build_multipart(fields, files or None)
    url = srv_cfg["url"].rstrip("/") + srv_cfg["endpoint"]
    return idx, url, body, ct, expected, out_fmt


async def _async_pipeline(tasks, srv_cfg, phonetic_map, timeout, gpu_workers,
                          pre_workers, on_event, stop_flag, retry_failed):
    """Pipeline: CPU prebuild + GPU flood + disk writer.

    on_event(typ, idx, **data):
      typ="start"   - rozpoczeto fragment idx
      typ="success" - fragment idx OK, data["wav"], data["duration"]
      typ="error"   - fragment idx blad, data["msg"]
      typ="log"     - data["line"]

    retry_failed: set() — bedzie wypelnione idxami ktore dostaly TimeoutError
                  (zewnetrzna petla retry uzyje tego do ponownego biegu).
    """
    if not tasks:
        return

    loop = asyncio.get_event_loop()
    pre_executor = ThreadPoolExecutor(max_workers=pre_workers, thread_name_prefix="pre")
    semaphore = asyncio.Semaphore(max(1, gpu_workers))

    # ─ FAZA 1: prebuild CPU rownolegle ─
    async def safe_prebuild(idx, frag, frag_sub=None):
        try:
            return await loop.run_in_executor(
                pre_executor, _prebuild_request, idx, frag, phonetic_map, srv_cfg, frag_sub)
        except Exception as e:
            tb = traceback.format_exc(limit=5)
            on_event("error", idx,
                     msg="[{}] {}\n{}".format(type(e).__name__, str(e), tb))
            return None

    prebuilts = await asyncio.gather(*[
        safe_prebuild(idx, frag, frag_sub) for idx, frag, frag_sub in tasks
    ])
    pre_executor.shutdown(wait=False)
    ready = [p for p in prebuilts if p is not None]

    on_event("log", 0, line="[CPU] Prebuild: {}/{} gotowych w RAM. "
             "GPU workers={}, timeout={}s".format(len(ready), len(tasks), gpu_workers, timeout))

    if not ready or stop_flag.is_set():
        return

    # ─ Disk-writer: osobny watek, kolejka WAV-ow do zapisu ─
    disk_q = Queue(maxsize=20)

    def disk_writer():
        while True:
            item = disk_q.get()
            if item is None:
                disk_q.task_done()
                break
            idx, path, wav_bytes, duration, out_fmt = item
            try:
                if out_fmt == "mp3":
                    if not _PYDUB_OK:
                        raise RuntimeError("Format MP3 wymagany, ale pydub niedostepny w venv.")
                    from io import BytesIO
                    audio = AudioSegment.from_file(BytesIO(wav_bytes), format="wav")
                    audio.export(path, format="mp3", bitrate="192k")
                else:
                    with open(path, "wb") as f:
                        f.write(wav_bytes)
                on_event("success", idx, wav=path, duration=duration)
            except Exception as e:
                on_event("error", idx, msg="zapis ({}): {}".format(out_fmt, e))
            finally:
                del wav_bytes  # jawnie zwolnij RAM
                disk_q.task_done()

    writer_t = threading.Thread(target=disk_writer, name="disk-writer", daemon=True)
    writer_t.start()

    # ─ FAZA 2: GPU flood ─
    connector = aiohttp.TCPConnector(limit=gpu_workers, limit_per_host=gpu_workers)
    async with aiohttp.ClientSession(connector=connector) as session:
        async def send_one(prebuild):
            if stop_flag.is_set():
                return
            idx, url, body, ct, expected, out_fmt = prebuild
            async with semaphore:
                if stop_flag.is_set():
                    return
                on_event("start", idx)
                t0 = time.time()
                try:
                    hdrs = {"Content-Type": ct}
                    tout = aiohttp.ClientTimeout(total=timeout)
                    async with session.post(url, data=body, headers=hdrs, timeout=tout) as resp:
                        if resp.status != 200:
                            err_body = await resp.text()
                            raise ValueError("HTTP {}: {}".format(resp.status, err_body[:300]))
                        wav_bytes = await resp.read()
                    duration = time.time() - t0
                    if not wav_bytes:
                        raise ValueError("Pusta odpowiedz serwera")
                    # zapisz przez disk-writera (nie blokuje GPU)
                    await loop.run_in_executor(None, disk_q.put,
                                               (idx, expected, wav_bytes, duration, out_fmt))
                except asyncio.TimeoutError:
                    duration = time.time() - t0
                    retry_failed.add(idx)
                    on_event("error", idx,
                             msg="TimeoutError po {}s (kolejka do retry)".format(int(duration)))
                except Exception as e:
                    duration = time.time() - t0
                    tb = traceback.format_exc(limit=8)
                    on_event("error", idx,
                             msg="[{}] {}\n{}".format(type(e).__name__, str(e), tb))

        await asyncio.gather(*[send_one(p) for p in ready])

    # zatrzymaj writera i poczekaj az dokonczy
    disk_q.put(None)
    writer_t.join(timeout=30)


# ─── Publiczne API ──────────────────────────────────────────────────────────

def run_pipeline_sync(cfg, on_event, stop_flag=None):
    """Uruchamia asyncio pipeline synchronicznie.

    cfg dict (wszystkie pola opcjonalne za wyjatkiem fragments+workdir):
        url, endpoint, workdir, subdir
        ref_audio_bytes, ref_audio_name, ref_text
        fragments: [(idx, text), ...]
        phonetic_map: {} or None
        gpu_workers, pre_workers, timeout, max_retries

    on_event(typ, idx, **data) — callback eventowy.
    stop_flag: threading.Event (zewnetrzny przycisk STOP).
    """
    if aiohttp is None:
        on_event("error", 0, msg="Brak aiohttp. Zainstaluj: pip install aiohttp")
        return {"ok": False, "reason": "no aiohttp"}

    fragments = cfg.get("fragments") or []
    if not fragments:
        on_event("log", 0, line="[pipeline] Brak fragmentow do generacji.")
        on_event("done", 0)
        return {"ok": True, "result": {"processed": 0}}

    # uzupelnij defaulty
    cfg = dict(cfg)  # nie modyfikuj orig
    cfg.setdefault("url", DEFAULT_URL)
    cfg.setdefault("endpoint", DEFAULT_ENDPOINT)
    cfg.setdefault("subdir", DEFAULT_SUBDIR)

    timeout = int(cfg.get("timeout", DEFAULT_TIMEOUT))
    gpu_workers = int(cfg.get("gpu_workers", DEFAULT_GPU_WORKERS))
    pre_workers = int(cfg.get("pre_workers", DEFAULT_PRE_WORKERS))
    max_retries = int(cfg.get("max_retries", DEFAULT_MAX_RETRIES))
    phonetic_map = cfg.get("phonetic_map") or None
    stop_flag = stop_flag or threading.Event()

    os.makedirs(os.path.join(cfg["workdir"], cfg.get("subdir", "")), exist_ok=True)

    # uruchom asyncio w nowej petli
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)

        # bieg glowny
        retry_failed = set()
        loop.run_until_complete(_async_pipeline(
            fragments, cfg, phonetic_map, timeout, gpu_workers, pre_workers,
            on_event, stop_flag, retry_failed))

        # retry pętla — przy TimeoutError, ze zmniejszonym gpu_workers
        attempt = 0
        while retry_failed and not stop_flag.is_set() and attempt < max_retries:
            attempt += 1
            retry_tasks = [(i, t, s) for (i, t, s) in fragments if i in retry_failed]
            on_event("log", 0,
                     line="[retry #{}] {} fragmentow z TimeoutError, zmniejszam workers".format(
                         attempt, len(retry_tasks)))
            retry_failed.clear()
            new_workers = max(1, gpu_workers - 1)
            loop.run_until_complete(_async_pipeline(
                retry_tasks, cfg, phonetic_map, timeout, new_workers, pre_workers,
                on_event, stop_flag, retry_failed))

        if retry_failed:
            for i in retry_failed:
                on_event("error", i,
                         msg="TimeoutError nadal po {} retry".format(max_retries))

        on_event("done", 0)
        return {"ok": True, "result": {"processed": len(fragments) - len(retry_failed),
                                       "failed": len(retry_failed)}}
    except Exception as e:
        on_event("error", 0, msg="pipeline: " + str(e))
        return {"ok": False, "reason": str(e)}
    finally:
        loop.close()
