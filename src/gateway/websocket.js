// src/gateway/websocket.js
import { WebSocketServer } from 'ws';
import { processVoiceTurn } from '../pipeline/orchestrator.js';
import { conversationManager } from '../state/conversationManager.js';
import { logger } from '../utils/logger.js';

/**
 * Inicializa el servidor WebSocket encima del servidor HTTP Express existente
 * @param {Server} httpServer - Instancia del servidor Node de Express
 */
export const initWebSocketGateway = (httpServer) => {
    const wss = new WebSocketServer({ noServer: true });

    // Manejar el "handshake" de actualización HTTP a WS de forma segura
    httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const sessionId = url.searchParams.get('sessionId');

        // Verificar que la sesión exista en nuestro mapa de memoria antes de aceptar el WebSocket
        if (!sessionId || !conversationManager.getSession(sessionId)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, sessionId);
        });
    });

    // Conexión establecida con éxito
    wss.on('connection', (ws, request, sessionId) => {
        logger.info('Cliente conectado a través de WebSocket Gateway', { sessionId });

        // Inicializar un contenedor dinámico para acumular los trozos de audio del micrófono
        let audioChunks = [];

        ws.on('message', async (message, isBinary) => {
            try {
                if (isBinary) {
                    // Si nos llega data binaria, es el micrófono del cliente enviando audio PCM/WAV
                    // Seguridad: Limitar el buffer acumulado a 5MB para evitar ataques DoS por memoria
                    const currentBufferSize = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    if (currentBufferSize + message.length > 5 * 1024 * 1024) {
                        logger.warn('⚠️ Buffer de audio excedido (5MB). Ignorando chunks adicionales.', { sessionId });
                        return;
                    }
                    audioChunks.push(message);
                } else {
                    // Si nos llega texto, es un comando de control estructurado en JSON
                    const data = JSON.parse(message.toString());

                    // Capturamos el comando o el tipo (soportando data.command y data.type del front)
                    const action = data.command || data.type;

                    if (action === 'SPEECH_START') {
                        logger.info('Usuario empezó a hablar, limpiando buffers anteriores...');
                        audioChunks = [];
                    }

                    if (action === 'SPEECH_END') {
                        logger.info('Usuario terminó de hablar. Procesando turno completo...');

                        if (audioChunks.length === 0) {
                            ws.send(JSON.stringify({ type: 'error', message: 'No se recibió audio' }));
                            return;
                        }

                        // Unificar todos los pequeños trozos de audio en un solo gran Buffer
                        const completeAudioBuffer = Buffer.concat(audioChunks);
                        audioChunks = []; // Liberar memoria RAM inmediatamente

                        // Ejecutar el orquestador
                        await processVoiceTurn(sessionId, completeAudioBuffer, (payload) => {
                            if (ws.readyState === ws.OPEN) {
                                ws.send(JSON.stringify(payload));
                            }
                        });
                    }

                    // 👇 ¡NUEVA INTERCEPCIÓN COGNITIVA PARA YOLO!
                    if (action === 'TRIGGER_YOLO') {
                        const scenario = data.data?.scenario || 'panorámica_seguridad';
                        logger.info('👁️ Solicitud YOLO manual recibida', { scenario, sessionId });

                        // 1. Consultar el microservicio Sidecar de Visión (Python en puerto 8001)
                        const { visionPipeline } = await import('../pipeline/vision.js');
                        const visionReport = await visionPipeline.analyzeScene(scenario);

                        // 2. Fabricar la alerta del sistema para el Modelo de Lenguaje
                        const yoloPrompt = `[SISTEMA - ALERTA DE CÁMARA YOLO]: Escaneo completado. Detección: "${visionReport.summary}". Reacciona de inmediato de forma hablada adoptando tu personalidad de Hannah AI. Sé directa, concisa y alerta al usuario.`;

                        logger.info('🧠 Inyectando reporte visual de YOLO al pipeline cognitivo...');

                        // 3. Invocar la ejecución por texto en tu orquestador
                        const { processTextTurn } = await import('../pipeline/orchestrator.js');

                        if (typeof processTextTurn === 'function') {
                            await processTextTurn(sessionId, yoloPrompt, (payload) => {
                                if (ws.readyState === ws.OPEN) {
                                    ws.send(JSON.stringify(payload));
                                }
                            });
                        } else {
                            logger.warn('⚠️ processTextTurn no está definido en orchestrator.js. Recuerda crear la función.');
                            ws.send(JSON.stringify({ type: 'error', message: 'Orquestador de texto no preparado.' }));
                        }
                    }
                }
            } catch (err) {
                logger.error('Error manejando mensaje WebSocket', { message: err.message });
                ws.send(JSON.stringify({ type: 'error', message: 'Error interno de procesamiento' }));
            }
        });

        ws.on('close', () => {
            logger.info('Conexión WebSocket cerrada por el cliente', { sessionId });
            audioChunks = [];
        });
    });

    return wss;
};