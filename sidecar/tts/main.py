# sidecar/tts/main.py
import io
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro
import soundfile as sf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hannah TTS Sidecar", version="1.0.0")

logger.info("Loading Kokoro model...")
kokoro_model = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
logger.info("Kokoro ready.")


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
        lang="es",
    )

    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV")
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="audio/wav")


@app.get("/health")
async def health():
    return {"status": "ok", "model": "kokoro"}
