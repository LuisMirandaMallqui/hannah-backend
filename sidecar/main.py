# sidecar/main.py
import io
import logging
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro
import soundfile as sf
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hannah Sidecar", version="1.0.0")

# --- Carga de modelos al arrancar ---
logger.info("Loading Whisper model...")
whisper_model = WhisperModel("small", device="cuda", compute_type="float16")
logger.info("Whisper ready.")

logger.info("Loading Kokoro model...")
kokoro_model = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
logger.info("Kokoro ready.")


# ─── ASR ────────────────────────────────────────────────────────────────────

@app.post("/asr")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("es"),
    model: str = Form("small"),
):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    audio_buffer = io.BytesIO(audio_bytes)

    segments, info = whisper_model.transcribe(
        audio_buffer,
        language=language,
        beam_size=5,
        vad_filter=True,
    )

    transcript = " ".join(seg.text for seg in segments).strip()
    logger.info(f"ASR transcript: {transcript[:60]}...")

    return {
        "transcript": transcript,
        "language": info.language,
        "confidence": round(info.language_probability, 3),
    }


# ─── TTS ────────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_bella"
    speed: float = 1.0


@app.post("/v1/audio/speech")
async def synthesize(req: TTSRequest):
    if not req.text:
        raise HTTPException(status_code=400, detail="Empty text")

    samples, sample_rate = kokoro_model.create(
        req.text,
        voice=req.voice,
        speed=req.speed,
        lang="es-es",
    )

    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV")
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="audio/wav")


# ─── Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "models": ["whisper-small", "kokoro"]}
