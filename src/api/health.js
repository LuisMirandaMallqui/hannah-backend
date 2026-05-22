// src/api/health.js
import { config } from '../config.js';

export const getHealth = (req, res) => {
  try {
    const uptime = process.uptime();
    
    res.status(200).json({
      status: 'ok',
      version: '0.1.0',
      services: {
        asr: config.asr.provider,
        llm: config.llm.provider,
        tts: config.tts.provider,
        sidecar: process.env.SIDECAR_ENABLED === 'true' ? 'enabled' : 'disabled'
      },
      uptime_s: Math.floor(uptime)
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};