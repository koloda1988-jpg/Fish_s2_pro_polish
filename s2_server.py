# -*- coding: utf-8 -*-
"""
s2_server.py — drop-in zamiennik s2.cpp dla audiobook_app.py.

Serwer Pythona uruchamiany w venv ComfyUI (Stability Matrix). Laduje s2-pro
z biblioteki fish_speech, kwantyzuje przez bitsandbytes (NF4 lub INT8), trzyma
model w VRAM miedzy requestami i wystawia ten sam endpoint co s2.cpp:

    POST /generate
    Content-Type: multipart/form-data
    fields:
        text             (str)   - tekst do syntezy (wymagany)
        reference_text   (str)   - transkrypt ref audio (opcjonalny, polepsza jakosc)
        reference_audio  (file)  - WAV referencyjny (opcjonalny, do klonowania glosu)
        # ponizsze sa opcjonalne; nieobecne -> wartosci domyslne
        temperature      (float) - default 0.8
        top_p            (float) - default 0.8
        repetition_penalty (float) - default 1.1
        chunk_length     (int)   - default 200 (100..400)
        max_new_tokens   (int)   - default 0 (= bez limitu)
        seed             (int)   - default brak (losowy)

    Zwraca: 200 + audio/wav (PCM_16, sample_rate z modelu, zwykle 44100)

Konfiguracja przez env vars (lub wartosci domyslne ponizej):
    S2_MODEL_PATH    - sciezka do checkpointa fishaudio/s2-pro
                       default: <ten katalog>/models/s2-pro
    S2_DEVICE        - cuda / cpu / mps           default: cuda
    S2_BNB_MODE      - nf4 / int8 / none          default: nf4
    S2_PRECISION     - bfloat16/float16/float32   default: float16 (zalecane przy bnb)
    S2_ATTENTION     - sdpa/sage_attention/flash_attention/auto  default: sdpa
                       (przy bnb i tak wymuszane sdpa)
    S2_COMPILE       - 0 / 1                      default: 0
                       (1 = torch.compile, pierwszy request 30-60 s wolniejszy
                       potem ~10-25 % szybsze; nie dziala na Windows zawsze stabilnie)
    S2_PORT          - port HTTP                  default: 8080
    S2_HOST          - host                       default: 127.0.0.1
"""

import os
import io
import sys
import time
import hashlib
import logging
import threading
from pathlib import Path
from typing import Optional

# Blokujemy import tensorflow zanim audiotools go wywola przez torch.utils.tensorboard.
# Zapobiega to RecursionError w numpy/ml_dtypes przy niezgodnych wersjach w venv ComfyUI.
import types as _types
import importlib.machinery as _ilm
if "tensorflow" not in sys.modules:
    _fake_tf = _types.ModuleType("tensorflow")
    # tensorboard sprawdza hasattr(tf.io.gfile, "join") - podajemy pusty obiekt
    _fake_tf.io = _types.SimpleNamespace(gfile=_types.SimpleNamespace(join=None))
    # torch._dynamo.trace_rules uzywa importlib.util.find_spec(), ktore wymaga __spec__ != None
    _fake_tf.__spec__ = _ilm.ModuleSpec("tensorflow", loader=None)
    sys.modules["tensorflow"] = _fake_tf

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Form, File, UploadFile, HTTPException
from fastapi.responses import Response, JSONResponse

# ─── Konfiguracja ────────────────────────────────────────────────────────────

THIS_DIR = Path(__file__).resolve().parent

DEFAULT_MODEL = str(THIS_DIR / "models" / "s2-pro")

MODEL_PATH = os.environ.get("S2_MODEL_PATH", DEFAULT_MODEL)
DEVICE     = os.environ.get("S2_DEVICE", "cuda").strip().lower()
DECODER_DEVICE_CFG = os.environ.get("S2_DECODER_DEVICE", "auto").strip().lower()
BNB_MODE   = os.environ.get("S2_BNB_MODE", "nf4").strip().lower()
PRECISION  = os.environ.get("S2_PRECISION", "float16").strip().lower()
ATTENTION  = os.environ.get("S2_ATTENTION", "sdpa").strip().lower()
COMPILE    = os.environ.get("S2_COMPILE", "0").strip() == "1"
PORT       = int(os.environ.get("S2_PORT", "8080"))
HOST       = os.environ.get("S2_HOST", "127.0.0.1").strip()

if BNB_MODE in ("none", "off", "no", ""):
    BNB_MODE = None  # pelna precyzja

# ─── Wbudowany fish_speech od ComfyUI node'a (priorytet przed pip-paczka) ───
# Dzieki temu uruchamiamy DOKLADNIE ten kod, ktorego uzywa Twoj custom node
# w workflow — czyli brzmienie wyjsciowe jest 1:1.
NODE_SRC = THIS_DIR / "_node_code" / "fish_speech_src"
if NODE_SRC.is_dir():
    sys.path.insert(0, str(NODE_SRC))

# ─── Logger ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("s2_server")
logging.getLogger("FishAudioS2").setLevel(logging.INFO)

import torch  # po sys.path, ale przed reszta

# Patch einops: zepsute/bazowe tensorflow stuby w venvie powoduja
# AttributeError w TensorflowBackend.is_appropriate_type().
# Nie dotykamy calego get_backend — tylko bezpiecznie zabezpieczamy backend TF.
try:
    import einops._backends as _eb
    if hasattr(_eb, "TensorflowBackend"):
        _orig_tf_is_appropriate = _eb.TensorflowBackend.is_appropriate_type

        def _safe_tf_is_appropriate(self, tensor):
            try:
                return _orig_tf_is_appropriate(self, tensor)
            except Exception:
                return False

        _eb.TensorflowBackend.is_appropriate_type = _safe_tf_is_appropriate
except Exception as _patch_err:
    log.warning(f"einops patch nieudany: {_patch_err}")

DTYPE_MAP = {
    "bfloat16": torch.bfloat16,
    "bf16":     torch.bfloat16,
    "float16":  torch.float16,
    "fp16":     torch.float16,
    "half":     torch.float16,
    "float32":  torch.float32,
    "fp32":     torch.float32,
}

# ─── Stan globalny ──────────────────────────────────────────────────────────

_engine = None             # TTSInferenceEngine
_engine_lock = threading.Lock()  # serializacja inference (GPU robi po jednym)
_ref_cache: dict[str, bytes] = {}  # hash -> ref_bytes (tylko zeby nie trzymac duplikatow w pamieci)
_abort_requested = False   # ustawiane przez POST /abort; zerowane po uzyciu


def _resolve_decoder(model_dir: Path) -> Path:
    """Znajdz codec.pth w katalogu modelu lub jego rodzicu."""
    candidates = ["codec.pth",
                  "firefly-gan-vq-fsq-8x1024-21hz-generator.pth",
                  "decoder.pth", "vocoder.pth"]
    for search in (model_dir, model_dir.parent):
        for name in candidates:
            p = search / name
            if p.is_file():
                return p
    raise FileNotFoundError(
        f"Nie znaleziono codec.pth obok modelu: {model_dir}\n"
        f"Sprawdzono: {', '.join(candidates)}"
    )


def _patch_attention(attention: str):
    """Wymusza wybrany backend attention na klasie Attention z fish_speech.
    Zwraca (oryginalny_forward, klasa) zeby pozniej przywrocic."""
    if attention == "auto":
        return None, None
    try:
        from fish_speech.models.text2semantic.llama import Attention, apply_rotary_emb
    except ImportError as e:
        log.warning(f"Nie mozna patchowac Attention: {e}")
        return None, None
    import torch.nn.functional as F

    def _sdpa_forward(self, x, freqs_cis, mask, input_pos=None):
        bsz, seqlen, _ = x.shape
        q_size = self.n_head * self.head_dim
        kv_size = self.n_local_heads * self.head_dim
        q, k, v = self.wqkv(x).to(x.dtype).split([q_size, kv_size, kv_size], dim=-1)
        q = q.view(bsz, seqlen, self.n_head, self.head_dim)
        k = k.view(bsz, seqlen, self.n_local_heads, self.head_dim)
        v = v.view(bsz, seqlen, self.n_local_heads, self.head_dim)
        if self.attention_qk_norm:
            q = self.q_norm(q); k = self.k_norm(k)
        q = apply_rotary_emb(q, freqs_cis); k = apply_rotary_emb(k, freqs_cis)
        q, k, v = map(lambda t: t.transpose(1, 2), (q, k, v))
        if self.kv_cache is not None:
            k, v = self.kv_cache.update(input_pos, k, v)
            q = q.to(k.dtype)  # align q with cached k/v dtype (BnB NF4 may return float32)
        k = k.repeat_interleave(self.n_head // self.n_local_heads, dim=1)
        v = v.repeat_interleave(self.n_head // self.n_local_heads, dim=1)
        y = F.scaled_dot_product_attention(
            q, k, v, attn_mask=mask,
            dropout_p=self.dropout if self.training else 0.0,
            is_causal=(mask is None))
        y = y.transpose(1, 2).contiguous().view(bsz, seqlen, q_size)
        return self.wo(y)

    if attention == "sdpa":
        forward = _sdpa_forward
    elif attention == "sage_attention":
        try:
            from sageattention import sageattn
        except ImportError as e:
            log.warning(
                f"Nie mozna zaladowac sageattention ({e}). "
                "Triton nie jest dostepny na Windows – uzywam SDPA jako fallback."
            )
            forward = _sdpa_forward
            orig = Attention.forward
            Attention.forward = forward
            return orig, Attention

        def _sage_forward(self, x, freqs_cis, mask, input_pos=None):
            bsz, seqlen, _ = x.shape
            q_size = self.n_head * self.head_dim
            kv_size = self.n_local_heads * self.head_dim
            q, k, v = self.wqkv(x).to(x.dtype).split([q_size, kv_size, kv_size], dim=-1)
            q = q.view(bsz, seqlen, self.n_head, self.head_dim)
            k = k.view(bsz, seqlen, self.n_local_heads, self.head_dim)
            v = v.view(bsz, seqlen, self.n_local_heads, self.head_dim)
            if self.attention_qk_norm:
                q = self.q_norm(q); k = self.k_norm(k)
            q = apply_rotary_emb(q, freqs_cis); k = apply_rotary_emb(k, freqs_cis)
            q, k, v = map(lambda t: t.transpose(1, 2), (q, k, v))
            if self.kv_cache is not None:
                k, v = self.kv_cache.update(input_pos, k, v)
                q = q.to(k.dtype)  # align q with cached k/v dtype (BnB NF4 may return float32)
            k = k.repeat_interleave(self.n_head // self.n_local_heads, dim=1)
            v = v.repeat_interleave(self.n_head // self.n_local_heads, dim=1)
            if mask is None:
                y = sageattn(q, k, v, is_causal=True)
            else:
                y = F.scaled_dot_product_attention(
                    q, k, v, attn_mask=mask,
                    dropout_p=self.dropout if self.training else 0.0)
            y = y.transpose(1, 2).contiguous().view(bsz, seqlen, q_size)
            return self.wo(y)

        forward = _sage_forward
    else:
        log.warning(f"Nieznany backend attention '{attention}', uzywam 'auto'.")
        return None, None

    original = Attention.forward
    Attention.forward = forward
    log.info(f"Attention klasa zpatchowana: {attention}")
    return original, Attention


def _load_engine():
    """Laduje LM (z opcjonalna kwantyzacja bnb) + codec, zwraca TTSInferenceEngine."""
    global _engine
    if _engine is not None:
        return _engine

    from fish_speech.models.dac.inference import load_model as load_decoder_model
    from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
    from fish_speech.inference_engine import TTSInferenceEngine

    if DEVICE != "cuda":
        log.warning("DEVICE=%s — bnb wymaga cuda; jezeli BNB_MODE != None, model "
                    "moze sie nie zaladowac.", DEVICE)

    dtype = DTYPE_MAP.get(PRECISION, torch.float16)
    bnb = BNB_MODE if BNB_MODE in ("nf4", "int8") else None
    attention = ATTENTION

    if bnb is not None and attention in ("flash_attention",):
        log.warning("BNB wymusza attention=sdpa (zamiast %s).", attention)
        attention = "sdpa"

    model_dir = Path(MODEL_PATH).resolve()
    if not model_dir.is_dir():
        raise FileNotFoundError(f"S2_MODEL_PATH nie istnieje: {model_dir}")

    decoder_ckpt = _resolve_decoder(model_dir)
    decoder_device = DECODER_DEVICE_CFG
    if decoder_device == "auto":
        decoder_device = DEVICE
        if DEVICE == "cuda" and torch.cuda.is_available():
            try:
                cc_major, cc_minor = torch.cuda.get_device_capability()
                sm_name = f"sm_{cc_major}{cc_minor}"
                supported = torch.cuda.get_arch_list()
                if sm_name not in supported:
                    log.warning(
                        "Wykryto GPU %s; nie jest obslugiwane przez obecny torch (%s). "
                        "Wymuszam DAC na CPU zeby uniknac 'no kernel image' w codec.",
                        sm_name, ", ".join(supported[-3:]),
                    )
                    decoder_device = "cpu"
                else:
                    log.info("GPU %s obslugiwane przez torch — DAC bedzie na CUDA.", sm_name)
            except Exception as e:
                log.warning("Nie mozna odczytac compute capability GPU: %s", e)

    log.info("Konfiguracja:")
    log.info("  MODEL_PATH = %s", model_dir)
    log.info("  DECODER    = %s", decoder_ckpt)
    log.info("  DEVICE     = %s", DEVICE)
    log.info("  DECODER_DEVICE = %s", decoder_device)
    log.info("  PRECISION  = %s (%s)", PRECISION, dtype)
    log.info("  BNB_MODE   = %s", bnb)
    log.info("  ATTENTION  = %s", attention)
    log.info("  COMPILE    = %s", COMPILE)

    t0 = time.time()
    orig, cls = _patch_attention(attention)
    try:
        log.info("Ladowanie LM (worker thread)...")
        llama_queue, llama_thread = launch_thread_safe_queue(
            checkpoint_path=str(model_dir),
            device=DEVICE,
            precision=dtype,
            compile=COMPILE,
            bnb_mode=bnb,
            lazy_load=False,
        )
    finally:
        if orig is not None and cls is not None:
            cls.forward = orig
            log.info("Attention przywrocone do default.")

    log.info("Ladowanie codec'a (DAC)...")
    decoder_model = load_decoder_model(
        config_name="modded_dac_vq",
        checkpoint_path=str(decoder_ckpt),
        device=decoder_device,
    )

    engine = TTSInferenceEngine(
        llama_queue=llama_queue,
        decoder_model=decoder_model,
        precision=dtype,
        compile=COMPILE,
    )
    engine._llama_thread = llama_thread
    _engine = engine

    elapsed = time.time() - t0
    log.info("Engine gotowy w %.1fs. VRAM stan po starcie:", elapsed)
    if torch.cuda.is_available():
        a = torch.cuda.memory_allocated() / 1024 / 1024
        r = torch.cuda.memory_reserved() / 1024 / 1024
        log.info("  alloc=%.0f MB, reserved=%.0f MB", a, r)
    return _engine


# ─── FastAPI ────────────────────────────────────────────────────────────────

app = FastAPI(title="s2_server (fish-speech S2-Pro drop-in)")


@app.on_event("startup")
def _startup():
    log.info("Startup: laduje engine fish-speech S2-Pro...")
    _load_engine()
    log.info("Startup zakonczony — server gotowy.")


@app.get("/")
def root():
    """Healthcheck — apka audiobook_app.py uderza GET / aby sprawdzic ze serwer zyje."""
    if _engine is None:
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok",
            "engine": "fish-speech-s2-pro",
            "bnb_mode": BNB_MODE,
            "device": DEVICE,
            "model": MODEL_PATH}


def _parse_optional_float(value: Optional[str], fallback: float) -> float:
    if value is None or value == "":
        return fallback
    try:
        return float(value)
    except ValueError:
        return fallback


def _parse_optional_int(value: Optional[str], fallback: int) -> int:
    if value is None or value == "":
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


@app.post("/abort")
async def abort_generation():
    """Przerywa kolejne generowanie (nie biezace). Wywolywane przez przycisk STOP w UI."""
    global _abort_requested
    _abort_requested = True
    log.info("Abort requested — nastepna generacja zostanie odrzucona.")
    return {"status": "abort_queued"}


@app.post("/generate")
async def generate(
    text: str = Form(...),
    reference_text: str = Form(""),
    reference_audio: UploadFile | None = File(None),
    temperature: Optional[str] = Form(None),
    top_p: Optional[str] = Form(None),
    repetition_penalty: Optional[str] = Form(None),
    chunk_length: Optional[str] = Form(None),
    max_new_tokens: Optional[str] = Form(None),
    seed: Optional[str] = Form(None),
):
    """Glowny endpoint kompatybilny z s2.cpp /generate."""
    MAX_TEXT_CHARS = 2000
    if not text.strip():
        raise HTTPException(400, "Pole 'text' nie moze byc puste.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(400, f"Tekst zbyt dlugi ({len(text)} > {MAX_TEXT_CHARS} znakow). "
                                  "Podziel fragment na krotsze czesci.")
    global _abort_requested
    if _abort_requested:
        _abort_requested = False
        raise HTTPException(499, "Generacja przerwana przez uzytkownika.")
    if _engine is None:
        raise HTTPException(503, "Engine jeszcze sie laduje, sprobuj ponownie za chwile.")

    # Parametry sampling — uzywamy defaultow jak w workflow ComfyUI.
    temp_val   = _parse_optional_float(temperature, 0.8)
    top_p_val  = _parse_optional_float(top_p, 0.8)
    rep_val    = _parse_optional_float(repetition_penalty, 1.1)
    chunk_val  = _parse_optional_int(chunk_length, 512)
    tokens_val = _parse_optional_int(max_new_tokens, 0)
    seed_val   = _parse_optional_int(seed, 0) or None  # 0/brak → None (losowy)

    # Reference audio — odczytujemy bajty (jezeli przyszly).
    ref_bytes = b""
    if reference_audio is not None:
        ref_bytes = await reference_audio.read()
    if not ref_bytes and reference_text.strip():
        log.warning("reference_text podane, ale brak reference_audio.")

    # Cache po hashu — jednolity glos w calej ksiazce = 1 wpis w pamieci.
    if ref_bytes:
        h = hashlib.sha256(ref_bytes).hexdigest()
        if h not in _ref_cache:
            _ref_cache[h] = ref_bytes
            log.info("Nowa referencja w cache (hash=%s..., len=%d B). Wpisow=%d",
                     h[:8], len(ref_bytes), len(_ref_cache))
        else:
            ref_bytes = _ref_cache[h]  # ten sam obiekt (oszczednosc RAM)

    from fish_speech.utils.schema import ServeReferenceAudio, ServeTTSRequest

    references = []
    if ref_bytes:
        references.append(ServeReferenceAudio(
            audio=ref_bytes,
            text=(reference_text or "").strip(),
        ))

    request = ServeTTSRequest(
        text=text,
        references=references,
        reference_id=None,
        max_new_tokens=tokens_val,
        chunk_length=chunk_val,
        top_p=top_p_val,
        repetition_penalty=rep_val,
        temperature=temp_val,
        seed=seed_val,
        streaming=False,
        format="wav",
    )

    # Inference — globalny lock, GPU robi po jednym. audiobook_app.py i tak
    # ma Semaphore(1) po stronie klienta, ale tu dla pewnosci.
    log.info("Generuje (text len=%d, ref=%s, T=%.2f, top_p=%.2f, "
             "rep=%.2f, chunk=%d, tokens=%d, seed=%s)",
             len(text), bool(ref_bytes), temp_val, top_p_val,
             rep_val, chunk_val, tokens_val, seed_val)

    audio_out = None
    sample_rate = 44100
    t0 = time.time()
    with _engine_lock:
        try:
            for result in _engine.inference(request):
                if result.code == "error":
                    raise RuntimeError(f"Engine error: {result.error}")
                if result.code == "final":
                    sample_rate, audio_out = result.audio
        except Exception as e:
            log.exception("Wyjatek w trakcie inferencji.")
            raise HTTPException(500, f"Inference exception: {type(e).__name__}: {e}")

    if audio_out is None:
        raise HTTPException(500, "Engine nie zwrocil audio (final == None).")

    # Audio np.ndarray -> WAV PCM_16 in-memory
    audio_np = np.asarray(audio_out)
    if audio_np.dtype != np.float32:
        audio_np = audio_np.astype(np.float32)

    buf = io.BytesIO()
    sf.write(buf, audio_np, sample_rate, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    elapsed = time.time() - t0
    duration_s = audio_np.shape[-1] / float(sample_rate) if audio_np.ndim >= 1 else 0
    log.info("OK: %.2fs audio w %.2fs (rt=%.2fx), wav=%.0f KB",
             duration_s, elapsed, duration_s / max(elapsed, 1e-6),
             len(wav_bytes) / 1024)

    return Response(content=wav_bytes, media_type="audio/wav")


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    log.info("Uruchamiam s2_server na %s:%d", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, workers=1, log_level="info")
