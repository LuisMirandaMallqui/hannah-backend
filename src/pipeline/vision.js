// src/pipeline/vision.js
import axios from 'axios';
import { config } from '../config.js';

const VISION_URL = config.vision.sidecarUrl;

export const visionPipeline = {
    /**
     * Conecta con el sidecar de Python para obtener la simulación del escenario de video
     * @param {string} scenario
     */
    analyzeScene: async (scenario) => {
        try {
            const response = await axios.post(`${VISION_URL}/analyze-scene`, { scenario });
            return response.data; // Retorna: { success: true, detections: [...], summary: "..." }
        } catch (error) {
            console.error('❌ Error en src/pipeline/vision.js:', error.message);
            throw error;
        }
    }
};