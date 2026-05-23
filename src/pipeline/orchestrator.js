// src/pipeline/orchestrator.js
import { transcribeAudio } from './asr.js';
import { generateDialogueStream } from './llm.js';
import { synthesizeSpeechStream } from './tts.js';
import { generateVisemesFromText } from './lipsync.js';
import { conversationManager } from '../state/conversationManager.js';
import { logger } from '../utils/logger.js';

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

        // Convertir el stream de audio en chunks binarios y enviarlos
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

/**
 * Orquesta un turno completo de conversación desde audio entrante hasta streaming de respuesta.
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

        // 3. LLM: Ejecutar el flujo del modelo pasándole el historial de turnos actual
        const updatedSession = conversationManager.getSession(sessionId);
        await executeLlmPipeline(sessionId, updatedSession.turns, onStreamSegment);

    } catch (error) {
        logger.error('Fallo crítico en el Orquestador (Voz)', { message: error.message });
        onStreamSegment({ type: 'error', message: error.message });
    }
};

// 👇 ¡NUEVO COMPONENTE: ORQUESTADOR DE INYECCIÓN DE TEXTO (YOLO / EVENTOS DRÁSTICOS)!
/**
 * Orquesta un turno disparado directamente por texto o alertas de sistemas externos como YOLO.
 * @param {string} sessionId - ID de la sesión activa
 * @param {string} systemPromptAlert - El reporte contextual listo para procesar por el LLM
 * @param {Function} onStreamSegment - Callback de envío al WebSocket
 */
export const processTextTurn = async (sessionId, systemPromptAlert, onStreamSegment) => {
    try {
        // 1. Validar la sesión
        const session = conversationManager.getSession(sessionId);
        if (!session) throw new Error('La sesión no existe o ha expirado');

        logger.info('⚙️ Procesando inyección visual en el pipeline de texto...', { sessionId });

        // 2. Para no contaminar la memoria limpia de la conversación con comandos de código,
        // creamos una copia temporal del historial agregando la alerta como si fuera un input del sistema
        const temporalTurns = [
            ...session.turns,
            { role: 'user', content: systemPromptAlert }
        ];

        // 3. LLM: Desparar directo la tubería cognitiva evadiendo el hardware del micrófono
        await executeLlmPipeline(sessionId, temporalTurns, onStreamSegment);

    } catch (error) {
        logger.error('Fallo crítico en el Orquestador (Texto/YOLO)', { message: error.message });
        onStreamSegment({ type: 'error', message: error.message });
    }
};

/**
 * Sub-proceso reutilizable para aislar y ejecutar el cerebro del LLM junto con TTS y LipSync
 */
const executeLlmPipeline = async (sessionId, turnsInput, onStreamSegment) => {
    let sentenceBuffer = '';
    logger.info('Despertando cerebro LLM...', { model: process.env.LLM_MODEL });

    // Mapeamos los campos si tu función requiere que tengan claves específicas (ej: 'turns')
    await generateDialogueStream(
        turnsInput,
        // Callback por cada token generado
        (token) => {
            sentenceBuffer += token;

            if (/[.!?]\s*$/.test(sentenceBuffer) && sentenceBuffer.trim().length > 10) {
                processAndSendSegment(sentenceBuffer.trim(), onStreamSegment);
                sentenceBuffer = '';
            }
        },
        // Callback al finalizar el flujo por completo
        (finalLlmResult) => {
            if (finalLlmResult.error) return;

            if (sentenceBuffer.trim().length > 0) {
                processAndSendSegment(sentenceBuffer.trim(), onStreamSegment);
            }

            // Guardar la respuesta final real en el historial oficial de la base de datos de la sesión
            conversationManager.addTurn(sessionId, 'assistant', finalLlmResult.text);
            conversationManager.updateSessionMetadata(sessionId, { emotion: finalLlmResult.emotion });

            // Cerrar ciclo de transmisión en el frontend
            onStreamSegment({
                type: 'turn_complete',
                emotion: finalLlmResult.emotion,
                metrics: { llm_ms: finalLlmResult.duration_ms }
            });
        }
    );
};