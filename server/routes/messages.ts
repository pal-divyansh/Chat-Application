import { Router } from 'express';
import { storage } from '../storage';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get messages for a chat
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const messages = await storage.getMessagesByChatId(req.params.chatId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { content, chatId } = req.body;
    const message = await storage.createMessage({
      content,
      chatId,
      senderId: req.user._id,
      isRead: false
    });
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create message' });
  }
});

export default router; 