// src/pipeline/llm.js
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { startTimer } from '../utils/timer.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Sends a conversation context stream to Anthropic Claude.
 * @param {Array} history - Array of previous context turns [{role, content}]
 * @param {Function} onToken - Callback firing immediately when a new text chunk lands
 * @param {Function} onComplete - Callback returning the finalized clean text, emotion, and metrics
 */
export const generateDialogueStream = async (history, onToken, onComplete) => {
    const timer = startTimer();
    let accumulatedResponse = '';

    try {
        // Format history structure to fit Anthropic message requirements safely
        const formattedMessages = history.map(turn => ({
            role: turn.role === 'assistant' ? 'assistant' : 'user',
            content: turn.content
        }));

        const stream = await anthropic.messages.create({
            model: config.llm.model, // Enforced: claude-sonnet-4-20250514
            max_tokens: 150,
            system: config.llm.systemPrompt,
            messages: formattedMessages,
            stream: true,
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.text) {
                const token = event.delta.text;
                accumulatedResponse += token;

                // Pass the raw token downstream immediately to unlock lightning-fast pipeline speeds
                if (onToken) onToken(token);
            }
        }

        const durationMs = timer.stop();

        // Parse the system-enforced emotion tag from the output string: [EMOTION:xx]
        const emotionMatch = accumulatedResponse.match(/\[EMOTION:(neutral|happy|surprised|thinking|sad)\]/i);
        const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : 'neutral';

        // Clean up response string by stripping out the explicit emotion text before client presentation
        const cleanText = accumulatedResponse.replace(/\[EMOTION:.*?\]/gi, '').trim();

        if (onComplete) {
            onComplete({
                text: cleanText,
                emotion,
                duration_ms: durationMs,
                tokens_used: Math.round(accumulatedResponse.length / 4), // Approximate token volume proxy
            });
        }

    } catch (error) {
        logger.error('LLM Core Stream module encountered an exception', { message: error.message });
        if (onComplete) onComplete({ error: 'llm_failed', message: error.message });
    }
};