// src/pipeline/llm.js
import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { config } from '../config.js';
import { startTimer } from '../utils/timer.js';
import { logger } from '../utils/logger.js';

// Initialize Anthropic Client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Generic OpenAI-Compatible Client (Groq, Ollama, OpenRouter, or OpenAI)
const genericOpenAI = new OpenAI({
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY, // Falls back to OpenAI if no custom LLM key is given
    baseURL: config.llm.baseUrl || undefined,
});

/**
 * Agnostic Streaming Wrapper for Dialogue Engines
 */
export const generateDialogueStream = async (history, onToken, onComplete) => {
    const provider = config.llm.provider.toLowerCase();

    if (provider === 'anthropic') {
        return runAnthropicStream(history, onToken, onComplete);
    } else {
        return runOpenAICompatibleStream(history, onToken, onComplete);
    }
};

/**
 * Path A: Anthropic Claude Stream Connection
 */
const runAnthropicStream = async (history, onToken, onComplete) => {
    const timer = startTimer();
    let accumulatedResponse = '';

    try {
        const formattedMessages = history.map(turn => ({
            role: turn.role === 'assistant' ? 'assistant' : 'user',
            content: turn.content
        }));

        const stream = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514', // Architecturally locked for Claude paths
            max_tokens: 150,
            system: config.llm.systemPrompt,
            messages: formattedMessages,
            stream: true,
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta?.text) {
                const token = event.delta.text;
                accumulatedResponse += token;
                if (onToken) onToken(token);
            }
        }

        finalizeLlmTurn(accumulatedResponse, timer.stop(), onComplete);
    } catch (error) {
        logger.error('Anthropic stream engine runtime error', { message: error.message });
        if (onComplete) onComplete({ error: 'llm_failed', message: error.message });
    }
};

/**
 * Path B: Generic OpenAI-Compatible Stream Connection (LLaMA, Groq, local Ollama)
 */
const runOpenAICompatibleStream = async (history, onToken, onComplete) => {
    const timer = startTimer();
    let accumulatedResponse = '';

    try {
        // OpenAI expects the system prompt injected directly as the first object in the array
        const formattedMessages = [
            { role: 'system', content: config.llm.systemPrompt },
            ...history.map(turn => ({
                role: turn.role === 'assistant' ? 'assistant' : 'user',
                content: turn.content
            }))
        ];

        const stream = await genericOpenAI.chat.completions.create({
            model: config.llm.model, // Pulls whatever string you defined in .env (e.g., LLaMA)
            messages: formattedMessages,
            max_tokens: 150,
            stream: true,
        });

        for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
                accumulatedResponse += token;
                if (onToken) onToken(token);
            }
        }

        finalizeLlmTurn(accumulatedResponse, timer.stop(), onComplete);
    } catch (error) {
        logger.error('OpenAI-compatible stream engine runtime error', { message: error.message });
        if (onComplete) onComplete({ error: 'llm_failed', message: error.message });
    }
};

/**
 * Shared Utility: Extracts emotional tags and structures the pipeline contract uniformly
 */
const finalizeLlmTurn = (accumulatedResponse, durationMs, onComplete) => {
    // Parse the system-enforced emotion tag: [EMOTION:xx]
    const emotionMatch = accumulatedResponse.match(/\[EMOTION:(neutral|happy|surprised|thinking|sad)\]/i);
    const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : 'neutral';

    // Strip out the emotion text before sending to user/audio modules
    const cleanText = accumulatedResponse.replace(/\[EMOTION:.*?\]/gi, '').trim();

    if (onComplete) {
        onComplete({
            text: cleanText,
            emotion,
            duration_ms: durationMs,
            tokens_used: Math.round(accumulatedResponse.length / 4),
        });
    }
};