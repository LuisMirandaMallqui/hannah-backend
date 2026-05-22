// src/pipeline/orchestrator.js
import { transcribeAudio } from './asr.js';
import { generateDialogueStream } from './llm.js';
import { synthesizeSpeechStream } from './tts.js';
import { generateVisemesFromText } from './lipsync.js';
import { conversationManager } from '../state/conversationManager.js';
import { logger } from '../utils/logger.js';

/**
 * Orquesta un turno completo de conversación desde audio entrante hasta streaming de respuesta.
 * @param {string} sessionId - ID de la sesión activa
 * @param {Buffer} audioBuffer - Buffer de audio del usuario en memoria
 * @param {Function} onStreamSegment - Callback que envía fragmentos listos (audio + visemas) al WebSocket
 */
export const processVoiceTurn = async (sessionId, audioBuffer, onStreamSegment) => {
    try {
        // 1. Validar la sesión
        const session = conversationManager.getSession(sessionId);
        if (!session) throw new Error('La sesión no existe o ha expirado');

        // 2. ASR: Transcribir el audio del usuario
        logger.info('Iniciando transcripción ASR...', { sessionId });
        const asrResult = await transcribeAudio(audioBuffer);
        if (asrResult.error || !asrResult.transcript.trim()) {
            throw new Error(asrResult.message || 'No se detectó voz clara en el audio');
        }

        // Guardar lo que dijo el usuario en la memoria in-memory de la sesión
        conversationManager.addTurn(sessionId, 'user', asrResult.transcript);

        // Avisarle al cliente qué fue lo que entendimos
        onStreamSegment({ type: 'user_transcript', text: asrResult.transcript });

        // 3. LLM: Obtener historial actualizado y activar streaming del modelo (LLaMA/Claude)
        const updatedSession = conversationManager.getSession(sessionId);
        let sentenceBuffer = '';

        logger.info('Despertando cerebro LLM...', { model: process.env.LLM_MODEL });

        await generateDialogueStream(
            updatedSession.turns,
            // Callback por cada token/palabra que genera la IA
            (token) => {
                sentenceBuffer += token;

                // Si detectamos un fin de oración (. ! ?), procesamos ese fragmento inmediatamente
                if (/[.!?]\s*$/.test(sentenceBuffer) && sentenceBuffer.trim().length > 10) {
                    processAndSendSegment(sentenceBuffer.trim(), onStreamSegment);
                    sentenceBuffer = ''; // Limpiar buffer para la siguiente oración
                }
            },
            // Callback cuando la IA termina de hablar por completo
            (finalLlmResult) => {
                if (finalLlmResult.error) return;

                // Procesar cualquier residuo de texto que haya quedado en el buffer
                if (sentenceBuffer.trim().length > 0) {
                    processAndSendSegment(sentenceBuffer.trim(), onStreamSegment);
                }

                // Guardar la respuesta final de la IA en la memoria de la sesión
                conversationManager.addTurn(sessionId, 'assistant', finalLlmResult.text);
                conversationManager.updateSessionMetadata(sessionId, { emotion: finalLlmResult.emotion });

                // Avisar al cliente que el turno ha terminado con éxito
                onStreamSegment({
                    type: 'turn_complete',
                    emotion: finalLlmResult.emotion,
                    metrics: { llm_ms: finalLlmResult.duration_ms }
                });
            }
        );

    } catch (error) {
        logger.error('Fallo crítico en el Orquestador', { message: error.message });
        onStreamSegment({ type: 'error', message: error.message });
    }
};

/**
 * Helper interno: Genera TTS y LipSync para una oración y lo manda al cliente en tiempo real
 */
const processAndSendSegment = async (text, sendCallback) => {
    // Ignorar fragmentos que sean solo etiquetas de emoción residuales
    if (text.startsWith('[') && text.endsWith(']')) return;

    try {
        // Ejecutar TTS (Audio) y LipSync (Animación de boca)
        const ttsResult = await synthesizeSpeechStream(text);
        const lipsyncResult = generateVisemesFromText(text);

        if (ttsResult.error) return;

        // Convertir el stream de audio de ElevenLabs en chunks binarios y enviarlos
        ttsResult.audioStream.on('data', (chunk) => {
            sendCallback({
                type: 'audio_chunk',
                text: text, // Texto de la oración actual
                visemes: lipsyncResult.visemes,
                audioBase64: chunk.toString('base64')
            });
        });
    } catch (err) {
        logger.error('Error procesando segmento del orquestador', { message: err.message });
    }
};