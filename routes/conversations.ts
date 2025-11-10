import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { db } from '../config/database';

const logger = createLogger('ConversationsRoutes');
const router = express.Router();

// Get all conversations for user
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await db.getPool().query(
      `SELECT id, title, provider, model, created_at, updated_at, metadata
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json({
      success: true,
      conversations: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching conversations', error as Error);
    return next(error);
  }
});

// Get specific conversation with messages
router.get('/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { conversationId } = req.params;

    // Get conversation
    const convResult = await db.getPool().query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Get messages
    const messagesResult = await db.getPool().query(
      `SELECT id, role, content, metadata, created_at
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return res.json({
      success: true,
      conversation: convResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (error) {
    logger.error('Error fetching conversation', error as Error);
    return next(error);
  }
});

// Create new conversation
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { title, provider, model } = req.body;

    const result = await db.getPool().query(
      `INSERT INTO conversations (user_id, title, provider, model)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, title || 'New Conversation', provider, model]
    );

    return res.json({
      success: true,
      conversation: result.rows[0]
    });
  } catch (error) {
    logger.error('Error creating conversation', error as Error);
    return next(error);
  }
});

// Add message to conversation
router.post('/:conversationId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { conversationId } = req.params;
    const { role, content, metadata } = req.body;

    // Verify conversation belongs to user
    const convResult = await db.getPool().query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    // Add message
    const result = await db.getPool().query(
      `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [conversationId, role, content, metadata || {}]
    );

    // Update conversation updated_at
    await db.getPool().query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );

    return res.json({
      success: true,
      message: result.rows[0]
    });
  } catch (error) {
    logger.error('Error adding message', error as Error);
    return next(error);
  }
});

// Update conversation title
router.patch('/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { conversationId } = req.params;
    const { title } = req.body;

    const result = await db.getPool().query(
      `UPDATE conversations
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [title, conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    return res.json({
      success: true,
      conversation: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating conversation', error as Error);
    return next(error);
  }
});

// Delete conversation
router.delete('/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { conversationId } = req.params;

    const result = await db.getPool().query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    return res.json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    logger.error('Error deleting conversation', error as Error);
    return next(error);
  }
});

export default router;
