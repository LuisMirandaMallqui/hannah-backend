// src/config.js
import dotenv from 'dotenv';
dotenv.config();

const requiredEnv = ['LLM_API_KEY'];
if (process.env.NODE_ENV === 'production') {
  requiredEnv.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Missing mandatory environment variable: ${envVar}`);
    }
  });
}

export const config = {
  port: process.env.PORT || 3001,
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  asr: {
    provider: process.env.ASR_PROVIDER || 'cloud',
    model: process.env.WHISPER_MODEL || 'whisper-1',
    apiKey: process.env.OPENAI_API_KEY,
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || null,
    contextTurns: parseInt(process.env.CONTEXT_TURNS || '10', 10),
    systemPrompt: `You are Hannah, a helpful and expressive AI avatar.
Respond conversationally and concisely (1-3 sentences).
Respond in the same language the user speaks.
At the end of each response, append an emotion tag on a new line in the format:
[EMOTION:neutral|happy|surprised|thinking|sad]`,
  },
  tts: {
    provider: process.env.TTS_PROVIDER || 'elevenlabs',
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    sidecarUrl: process.env.TTS_SIDECAR_URL || 'http://127.0.0.1:8002',
  },
  vision: {
    sidecarUrl: process.env.VISION_SIDECAR_URL || 'http://127.0.0.1:8001',
  },
  session: {
    ttl: parseInt(process.env.SESSION_TTL_MINUTES || '30', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'hannah-local-secret-2026',
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
