// src/api/router.js
import { Router } from 'express';
import { getHealth } from './health.js';
import { createSession, deleteSession } from './sessions.js';

const router = Router();

// Health Check
router.get('/health', getHealth);

// Session Handling Endpoints
router.post('/session', createSession);
router.delete('/session/:id', deleteSession);

// Placeholder for our Phase 4 Non-Streaming Tester Route
router.post('/text', (req, res) => {
  res.status(501).json({ message: 'Text fallback testing endpoint coming in Phase 4' });
});

export { router };