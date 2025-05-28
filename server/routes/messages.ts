import { Router } from 'express';
import { Message } from '../models/Message';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// Get messages for a chat
router.get('/:chatId', isAuthenticated, async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .populate('sender', 'username profileImageUrl')
      .lean();

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Send a new message
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { chatId, content, type = 'text' } = req.body;
    const senderId = req.session.userId;

    const message = new Message({
      chatId,
      sender: senderId,
      content,
      type
    });

    await message.save();
    await message.populate('sender', 'username profileImageUrl');

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

export default router; 