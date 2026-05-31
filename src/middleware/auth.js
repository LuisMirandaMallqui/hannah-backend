// src/middleware/auth.js
// Middleware de autenticación JWT para Express y WebSocket.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
import { config } from '../config.js';

export const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.tokenData = jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

export const verifyTokenWs = (tokenStr) => {
  try {
    return jwt.verify(tokenStr, config.jwt.secret);
  } catch {
    return null;
  }
};
