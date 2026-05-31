// src/api/sessions.js
import { conversationManager } from '../state/conversationManager.js';

export const createSession = async (req, res) => {
  try {
    const sessionInfo = await conversationManager.createSession();
    res.status(201).json(sessionInfo);
  } catch (error) {
    res.status(500).json({ error: 'session_creation_failed', message: error.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await conversationManager.deleteSession(id);

    if (!deleted) {
      return res.status(404).json({ error: 'not_found', message: 'Session not found or already expired.' });
    }

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'session_deletion_failed', message: error.message });
  }
};
