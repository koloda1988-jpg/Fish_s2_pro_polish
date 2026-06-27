# -*- coding: utf-8 -*-
"""
s2_server.py — drop-in replacement for s2.cpp used by audiobook_app.py.

Python server running in the ComfyUI venv (Stability Matrix). Loads s2-pro
from the fish_speech library, quantises via bitsandbytes (NF4 or INT8), keeps
the model in VRAM between requests, and exposes the same endpoint as s2.cpp:

    POST /generate
    Content-Type: multipart/form-data
    fields:
        text             (str)   - text to synthesise (required)
        reference_text   (str)   - reference audio transcript (optional, improves quality)
        reference_audio  (file)  - reference WAV (optional, for voice cloning)
        # the following are optional; absent -> defaults
        temperature      (float) - default 0.8
        top_p            (float) - default 0.8
        repetition_penalty (float) - default 1.1
        chunk_length     (int)   - default 200 (100..400)
        max_new_tokens   (int)   - default 500
        seed             (int)   - default none (random)

    Returns: 200 + audio/wav (PCM_16, sample_rate from model, usually 44100)

Configuration via env vars (or defaults below):
    S2_MODEL_PATH    - path to the fishaudio/s2-pro checkpoint
                       default: <this dir>/models/s2-pro
    S2_DEVICE        - cuda / cpu / mps           default: cuda
    S2_BNB_MODE      - nf4 / int8 / none          default: nf4
    S2_PRECISION     - bfloat16/float16/float32   default: float16 (recommended with bnb)
    S2_ATTENTION     - sdpa/sage_attention/flash_attention/auto  default: sdpa
                       (with bnb, sdpa is forced regardless)
    S2_COMPILE       - 0 / 1                      default: 0
                       (1 = torch.compile, first request 30-60 s slower
                       then ~10-25 % faster; not always stable on Windows)
    S2_PORT          - HTTP port                  default: 8080
    S2_HOST          - host                       default: 127.0.0.1
"""

import os
import io
import sys
import time
import hashlib
import logging
import threading
import fnmatch
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

# ─── Configuration ──────────────────────────────────────────────────────────────────────────

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
    BNB_MODE = None  # full precision

# ─── Built-in fish_speech from ComfyUI node (takes priority over pip package) ───
# This way we run EXACTLY the code used by your custom node in the workflow
# — meaning the output sound is 1:1.
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

# Patch einops: broken/stub tensorflow in the venv causes
# AttributeError in TensorflowBackend.is_appropriate_type().
# We only safely guard the TF backend without touching all of get_backend.
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
    log.warning(f"einops patch failed: {_patch_err}")

DTYPE_MAP = {
    "bfloat16": torch.bfloat16,
    "bf16":     torch.bfloat16,
    "float16":  torch.float16,
    "fp16":     torch.float16,
    "half":     torch.float16,
    "float32":  torch.float32,
    "fp32":     torch.float32,
}

# ─── Global state ────────────────────────────────────────────────────────────────────────

_engine = None             # TTSInferenceEngine
_engine_lock = threading.Lock()  # serialise inference (GPU does one at a time)
_ref_cache: dict[str, bytes] = {}  # hash -> ref_bytes (avoid duplicates in memory)
_abort_requested = False   # set by POST /abort; cleared after use

HF_REPO_ID = os.environ.get("S2_HF_REPO_ID", "fishaudio/s2-pro").strip()
HF_ALLOW_PATTERNS = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "chat_template.jinja",
    "codec.pth",
    "model.pth",
    "model.safetensors",
    "*.ckpt",
    "*.bin",
    "*.safetensors",
    "firefly-gan-vq-fsq-8x1024-21hz-generator.pth",
]

DECODER_CKPT_NAMES = {
    "codec.pth",
    "firefly-gan-vq-fsq-8x1024-21hz-generator.pth",
    "decoder.pth",
    "vocoder.pth",
}


def _has_pattern_file(model_dir: Path, patterns: list[str]) -> bool:
    for p in model_dir.iterdir():
        if not p.is_file():
            continue
        name = p.name
        for pattern in patterns:
            if fnmatch.fnmatch(name, pattern):
                return True
    return False


def _has_lm_weights(model_dir: Path) -> bool:
    """True only when text2semantic LM weights exist (decoder-only files do not count)."""
    lm_ext = {".pth", ".ckpt", ".safetensors", ".bin"}
    for p in model_dir.iterdir():
        if not p.is_file():
            continue
        name = p.name
        if name in DECODER_CKPT_NAMES:
            continue
        if p.suffix.lower() in lm_ext:
            return True
    return False


def _model_artifacts_ok(model_dir: Path) -> tuple[bool, list[str]]:
    """Checks whether model_dir contains minimum files required to bootstrap S2."""
    if not model_dir.is_dir():
        return False, ["directory does not exist"]

    missing: list[str] = []

    required_files = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
    ]
    for name in required_files:
        if not (model_dir / name).is_file():
            missing.append(name)

    has_lm_weights = _has_lm_weights(model_dir)
    if not has_lm_weights:
        missing.append("LM weights (model*.pth / model*.safetensors / *.ckpt / *.bin)")

    # Decoder checkpoint can be next to model or in parent folder.
    try:
        _resolve_decoder(model_dir)
    except FileNotFoundError:
        missing.append("decoder checkpoint (codec.pth / firefly-gan... / decoder.pth / vocoder.pth)")

    return len(missing) == 0, missing


def _ensure_model_downloaded(model_dir: Path) -> None:
    """Downloads missing model artifacts from Hugging Face only when needed."""
    ok, missing = _model_artifacts_ok(model_dir)
    if ok:
        log.info("Model artifacts detected locally in %s, skipping download.", model_dir)
        return

    model_dir.mkdir(parents=True, exist_ok=True)
    missing_text = ", ".join(missing) if missing else "unknown"
    print("[s2] Wykryto brak modelu lokalnego. Rozpoczynam automatyczne pobieranie z Hugging Face...")
    log.warning("Missing model artifacts in %s: %s", model_dir, missing_text)
    log.info("Downloading repo '%s' to %s", HF_REPO_ID, model_dir)
    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=HF_REPO_ID,
            local_dir=str(model_dir),
            allow_patterns=HF_ALLOW_PATTERNS,
            local_dir_use_symlinks=False,
        )
    except Exception as e:
        raise RuntimeError(
            f"Automatic model download failed from Hugging Face repo '{HF_REPO_ID}': {e}"
        ) from e

    ok_after, missing_after = _model_artifacts_ok(model_dir)
    if not ok_after:
        raise FileNotFoundError(
            "Downloaded model is still incomplete. Missing: " + ", ".join(missing_after)
        )
    log.info("Model download finished and artifacts are complete.")


def _resolve_decoder(model_dir: Path) -> Path:
    """Find codec.pth in the model directory or its parent."""
    candidates = ["codec.pth",
                  "firefly-gan-vq-fsq-8x1024-21hz-generator.pth",
                  "decoder.pth", "vocoder.pth"]
    for search in (model_dir, model_dir.parent):
        for name in candidates:
            p = search / name
            if p.is_file():
                return p
    raise FileNotFoundError(
        f"codec.pth not found alongside model: {model_dir}\n"
        f"Searched: {', '.join(candidates)}"
    )


def _patch_attention(attention: str):
    """Wymusza wybrany backend attention na klasie Attention z fish_speech.
    Zwraca (oryginalny_forward, klasa) zeby pozniej przywrocic."""
    if attention == "auto":
        return None, None
    try:
        from fish_speech.models.text2semantic.llama import Attention, apply_rotary_emb
    except ImportError as e:
        log.warning(f"Cannot patch Attention: {e}")
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
                f"Cannot load sageattention ({e}). "
                "Triton is not available on Windows – falling back to SDPA."
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
        log.warning(f"Unknown attention backend '{attention}', using 'auto'.")
        return None, None

    original = Attention.forward
    Attention.forward = forward
    log.info("Attention class patched: %s", attention)
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
        log.warning("DEVICE=%s — bnb requires cuda; if BNB_MODE != None, model "
                    "may fail to load.", DEVICE)

    dtype = DTYPE_MAP.get(PRECISION, torch.float16)
    bnb = BNB_MODE if BNB_MODE in ("nf4", "int8") else None
    attention = ATTENTION

    if bnb is not None and attention in ("flash_attention",):
        log.warning("BNB forces attention=sdpa (instead of %s).", attention)
        attention = "sdpa"

    model_dir = Path(MODEL_PATH).resolve()
    _ensure_model_downloaded(model_dir)

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
                        "Detected GPU %s; not supported by current torch (%s). "
                        "Forcing DAC to CPU to avoid 'no kernel image' in codec.",
                        sm_name, ", ".join(supported[-3:]),
                    )
                    decoder_device = "cpu"
                else:
                    log.info("GPU %s supported by current torch — DAC will run on CUDA.", sm_name)
            except Exception as e:
                log.warning("Cannot read GPU compute capability: %s", e)

    log.info("Configuration:")
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
        log.info("Loading LM (worker thread)...")
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
            log.info("Attention restored to default.")

    log.info("Loading codec (DAC)...")
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
    log.info("Engine ready in %.1fs. VRAM usage after init:", elapsed)
    if torch.cuda.is_available():
        a = torch.cuda.memory_allocated() / 1024 / 1024
        r = torch.cuda.memory_reserved() / 1024 / 1024
        log.info("  alloc=%.0f MB, reserved=%.0f MB", a, r)
    return _engine


# ─── FastAPI ────────────────────────────────────────────────────────────────

app = FastAPI(title="s2_server (fish-speech S2-Pro drop-in)")


@app.on_event("startup")
def _startup():
    log.info("Startup: loading fish-speech S2-Pro engine...")
    _load_engine()
    log.info("Startup complete — server ready.")


@app.get("/")
def root():
    """Healthcheck — audiobook_app.py hits GET / to verify the server is alive."""
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
    log.info("Abort requested — next generation will be rejected.")
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
    """Main endpoint compatible with s2.cpp /generate."""
    DEFAULT_MAX_NEW_TOKENS = 500
    MAX_MAX_NEW_TOKENS = 500
    MAX_TEXT_CHARS = 2000
    if not text.strip():
        raise HTTPException(400, "Field 'text' cannot be empty.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(400, f"Text too long ({len(text)} > {MAX_TEXT_CHARS} chars). "
                                  "Split the fragment into shorter parts.")
    global _abort_requested
    if _abort_requested:
        _abort_requested = False
        raise HTTPException(499, "Generation cancelled by user.")
    if _engine is None:
        raise HTTPException(503, "Engine is still loading, please try again in a moment.")

    # Sampling parameters — using ComfyUI workflow defaults.
    temp_val   = _parse_optional_float(temperature, 0.8)
    top_p_val  = _parse_optional_float(top_p, 0.8)
    rep_val    = _parse_optional_float(repetition_penalty, 1.1)
    chunk_val  = _parse_optional_int(chunk_length, 512)
    tokens_raw = _parse_optional_int(max_new_tokens, DEFAULT_MAX_NEW_TOKENS)
    tokens_val = max(0, min(MAX_MAX_NEW_TOKENS, tokens_raw))
    seed_val   = _parse_optional_int(seed, 0) or None  # 0/absent → None (random)

    # Reference audio — read bytes (if provided).
    ref_bytes = b""
    if reference_audio is not None:
        ref_bytes = await reference_audio.read()
    if not ref_bytes and reference_text.strip():
        log.warning("reference_text provided but no reference_audio.")

    # Cache by hash — consistent voice throughout the book = 1 entry in memory.
    if ref_bytes:
        h = hashlib.sha256(ref_bytes).hexdigest()
        if h not in _ref_cache:
            _ref_cache[h] = ref_bytes
            log.info("New reference in cache (hash=%s..., len=%d B). Entries=%d",
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

    # Inference — global lock, GPU does one at a time. audiobook_app.py also
    # has Semaphore(1) on the client side, but this is a safety net.
    log.info("Generating (text len=%d, ref=%s, T=%.2f, top_p=%.2f, "
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
            log.exception("Exception during inference.")
            raise HTTPException(500, f"Inference exception: {type(e).__name__}: {e}")

    if audio_out is None:
        raise HTTPException(500, "Engine returned no audio (final == None).")

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
    log.info("Starting s2_server on %s:%d", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, workers=1, log_level="info")
