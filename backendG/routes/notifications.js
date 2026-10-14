const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/notifications  (only the logged-in person's own, newest first)
router.get('/', async (req, res) => {
  try {
    const [notifications] = await pool.query(
      `SELECT notification_id, order_id, product_id, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, notification_id DESC
       LIMIT 30`,
      [req.user.user_id]
    );
    const [[count]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.user_id]
    );
    res.json({
      unread: Number(count.unread),
      notifications: notifications.map(n => ({ ...n, is_read: !!n.is_read }))
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.user_id]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Read all error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/notifications/:id/read  (only if it belongs to you)
router.put('/:id/read', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid notification ID.' });

    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
      [id, req.user.user_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found.' });

    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error('Read notification error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;