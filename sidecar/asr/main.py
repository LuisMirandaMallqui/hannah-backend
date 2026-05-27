# sidecar/asr/main.py
import io
import logging
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hannah ASR Sidecar", version="1.0.0")

logger.info("Loading Whisper model (small)...")
whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
logger.info("Whisper ready.")


@app.post("/asr")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("es"),
    model: str = Form("small"),
):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    segments, info = whisper_model.transcribe(
        io.BytesIO(audio_bytes),
        language=language,
        beam_size=5,
        vad_filter=True,
    )

    transcript = " ".join(seg.text for seg in segments).strip()
    logger.info(f"ASR result: {transcript[:80]}")

    return {
        "transcript": transcript,
        "language": info.language,
        "confidence": round(info.language_probability, 3),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "model": "whisper-small"}
