// src/pipeline/asr.js
import { OpenAI, toFile } from 'openai';
import { config } from '../config.js';
import { startTimer } from '../utils/timer.js';
import { logger } from '../utils/logger.js';

// Initialize OpenAI client using environment fallback safely
const openai = new OpenAI({
    apiKey: config.asr.apiKey || process.env.OPENAI_API_KEY,
});

/**
 * Converts a raw audio buffer into text using OpenAI Whisper
 * @param {Buffer} audioBuffer - In-memory raw audio data chunk
 * @param {string} [mimeType='audio/wav'] - Format format identifier
 * @returns {Promise<Object>} Output contract containing transcript and timing metrics
 */
export const transcribeAudio = async (audioBuffer, mimeType = 'audio/wav') => {
    const timer = startTimer();

    try {
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Received an empty or invalid audio buffer');
        }

        // Convert in-memory buffer to an explicit file-like object without touch disk storage
        const file = await toFile(audioBuffer, 'input_utterance.wav', { type: mimeType });

        const response = await openai.audio.transcriptions.create({
            file: file,
            model: config.asr.model,
            language: 'es', // Primary language constraint optimization
            temperature: 0.0, // Low temperature forces high accuracy/low hallucination
        });

        const durationMs = timer.stop();

        // Budget check alert
        if (durationMs > 300) {
            logger.warn('ASR exceeded standard latency budget target', { durationMs });
        }

        return {
            transcript: response.text || '',
            language: 'es',
            confidence: 1.0,
            duration_ms: durationMs
        };
    } catch (error) {
        logger.error('ASR Module failure occurred', { message: error.message });
        return { error: 'asr_failed', message: error.message };
    }
};