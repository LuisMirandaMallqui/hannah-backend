// src/config.js
import dotenv from 'dotenv';
dotenv.config();

const requiredEnv = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY'];
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
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: 'claude-sonnet-4-20250514', // Enforced by architectural spec
    contextTurns: parseInt(process.env.CONTEXT_TURNS || '10', 10),
    systemPrompt: `You are Hannah, a helpful and expressive AI avatar. 
Respond conversationally and concisely (1–3 sentences). 
Respond in the same language the user speaks.
At the end of each response, append an emotion tag on a new line in the format:
[EMOTION:neutral|happy|surprised|thinking|sad]`,
  },
  tts: {
    provider: process.env.TTS_PROVIDER || 'elevenlabs',
    voiceId: process.env.ELEVENLABS_VOICE_ID,
  },
  session: {
    ttl: parseInt(process.env.SESSION_TTL_MINUTES || '30', 10),
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};