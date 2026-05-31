// src/state/conversationManager.js
// ConversationManager respaldado por Redis para soporte multi-sesión.
// Todos los métodos son async porque Redis es I/O-bound.
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Redis = require('ioredis');
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

class ConversationManager {
  constructor() {
    this.redis = new Redis(config.redis.url);
    this.ttl = config.session.ttl * 60; // segundos
  }

  _key(sessionId) {
    return `session:${sessionId}:state`;
  }

  async createSession() {
    const sessionId = uuidv4();
    const data = {
      sessionId,
      createdAt: new Date().toISOString(),
      turns: [],
      emotion: 'neutral',
      language: 'es',
    };
    await this.redis.set(this._key(sessionId), JSON.stringify(data), 'EX', this.ttl);
    logger.info('Session created', { sessionId });
    return { sessionId, expiresIn: this.ttl };
  }

  async getSession(sessionId) {
    const raw = await this.redis.get(this._key(sessionId));
    if (!raw) return null;
    // Renovar TTL en cada acceso
    await this.redis.expire(this._key(sessionId), this.ttl);
    return JSON.parse(raw);
  }

  async addTurn(sessionId, role, content) {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    session.turns.push({ role, content });
    if (session.turns.length > config.llm.contextTurns) {
      session.turns.shift();
    }
    await this.redis.set(this._key(sessionId), JSON.stringify(session), 'EX', this.ttl);
    return true;
  }

  async updateSessionMetadata(sessionId, updates = {}) {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    if (updates.emotion) session.emotion = updates.emotion;
    if (updates.language) session.language = updates.language;
    await this.redis.set(this._key(sessionId), JSON.stringify(session), 'EX', this.ttl);
    return true;
  }

  async deleteSession(sessionId) {
    const deleted = await this.redis.del(this._key(sessionId));
    if (deleted) logger.info('Session deleted', { sessionId });
    return deleted > 0;
  }
}

export const conversationManager = new ConversationManager();
