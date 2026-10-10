const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

const COLS = 'user_id, first_name, last_name, name, contact, email, role, created_at';

// GET /api/me  (only the logged-in person's own info)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [req.user.user_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/me  body: { first_name, last_name, contact }
router.put('/', async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = String(b.first_name || '').trim();
    const lastName = String(b.last_name || '').trim();
    const contact = String(b.contact || '').trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }
    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({ error: 'First and last name must be 50 characters or less.' });
    }
    if (contact.length < 5 || contact.length > 100) {
      return res.status(400).json({ error: 'Contact must be 5 to 100 characters (phone number or Facebook account).' });
    }

    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ?, contact = ? WHERE user_id = ?',
      [firstName, lastName, contact, req.user.user_id]
    );

    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [req.user.user_id]);
    res.json({ message: 'Profile updated.', user: rows[0] });
  } catch (err) {
    console.error('Update me error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/me/password  body: { current_password, new_password }
router.put('/password', async (req, res) => {
  try {
    const body = req.body || {};
    const current = String(body.current_password || '');
    const next = String(body.new_password || '');

    if (!current || !next) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (next.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (next === current) {
      return res.status(400).json({ error: 'New password must be different from the current one.' });
    }

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });

    const match = await bcrypt.compare(current, rows[0].password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(next, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.user_id]);

    res.json({ message: 'Password changed.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;