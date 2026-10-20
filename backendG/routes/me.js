const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { sendMail, codeEmail, passwordChangedEmail } = require('../mailer');
const { hashCode, verifyCode } = require('../codes');

const router = express.Router();
router.use(verifyToken);

const COLS = 'user_id, first_name, last_name, name, contact, facebook, email, role, created_at';
const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;

const CODE_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;

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

// PUT /api/me  body: { first_name, last_name, contact, facebook }
router.put('/', async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = String(b.first_name || '').trim();
    const lastName = String(b.last_name || '').trim();
    const contact = String(b.contact || '').replace(/[\s-]/g, '');
    const facebook = String(b.facebook || '').trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }
    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({ error: 'First and last name must be 50 characters or less.' });
    }
    if (!PHONE_REGEX.test(contact)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (09XXXXXXXXX or +639XXXXXXXXX).' });
    }
    if (facebook && (facebook.length < 3 || facebook.length > 150)) {
      return res.status(400).json({ error: 'Facebook account must be 3 to 150 characters.' });
    }

    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ?, name = ?, contact = ?, facebook = ? WHERE user_id = ?',
      [firstName, lastName, `${firstName} ${lastName}`, contact, facebook || null, req.user.user_id]
    );

    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [req.user.user_id]);
    res.json({ message: 'Profile updated.', user: rows[0] });
  } catch (err) {
    console.error('Update me error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/me/password-code  (emails a code to the logged-in person's own address)
router.post('/password-code', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT email FROM users WHERE user_id = ?', [req.user.user_id]);
    if (users.length === 0) return res.status(404).json({ error: 'Account not found.' });
    const email = users[0].email;

    const [[lim]] = await pool.query(
      `SELECT COALESCE(SUM(created_at > DATE_SUB(NOW(), INTERVAL ${COOLDOWN_SECONDS} SECOND)), 0) AS recent,
              COUNT(*) AS per_hour
       FROM email_codes
       WHERE email = ? AND purpose = 'change' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [email]
    );
    if (Number(lim.recent) > 0) {
      return res.status(429).json({ error: `Please wait ${COOLDOWN_SECONDS} seconds before requesting another code.` });
    }
    if (Number(lim.per_hour) >= MAX_CODES_PER_HOUR) {
      return res.status(429).json({ error: 'Too many codes requested. Please try again in an hour.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = 'change' AND used = 0", [email]);
    const [ins] = await pool.query(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at)
       VALUES (?, 'change', ?, DATE_ADD(NOW(), INTERVAL ${CODE_MINUTES} MINUTE))`,
      [email, hashCode(email, 'change', code)]
    );

    try {
      await sendMail({ to: email, ...codeEmail(code, 'change', CODE_MINUTES) });
    } catch (mailErr) {
      console.error('Password code email failed:', mailErr.message);
      await pool.query('DELETE FROM email_codes WHERE code_id = ?', [ins.insertId]);
      return res.status(503).json({ error: "We couldn't send the email right now. Please try again later." });
    }

    res.json({ message: 'Verification code sent to your email.', cooldown: COOLDOWN_SECONDS });
  } catch (err) {
    console.error('Password code error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/me/password  body: { current_password, new_password, code }
router.put('/password', async (req, res) => {
  const body = req.body || {};
  const current = String(body.current_password || '');
  const next = String(body.new_password || '');
  const code = String(body.code || '').trim();

  if (!current || !next) return res.status(400).json({ error: 'Current and new password are required.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Please enter the 6-digit code we emailed you.' });
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  if (next.length > 72) return res.status(400).json({ error: 'New password must be 72 characters or less.' });
  if (next === current) return res.status(400).json({ error: 'New password must be different from the current one.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT password_hash, email FROM users WHERE user_id = ? FOR UPDATE',
      [req.user.user_id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Account not found.' });
    }

    // Check the current password first, so a wrong one doesn't use up a code attempt
    const match = await bcrypt.compare(current, rows[0].password_hash);
    if (!match) {
      await conn.rollback();
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const v = await verifyCode(conn, rows[0].email, 'change', code);
    if (!v.ok) {
      await conn.commit(); // keeps the wrong-attempt count
      return res.status(400).json({ error: v.error });
    }

    const hash = await bcrypt.hash(next, 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.user_id]);
    await conn.query("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = 'change'", [rows[0].email]);
    await conn.commit();

    // Best effort: tell the owner their password changed
    sendMail({ to: rows[0].email, ...passwordChangedEmail() })
      .catch((e) => console.error('Password-changed email failed:', e.message));

    res.json({ message: 'Password changed.' });
  } catch (err) {
    await conn.rollback();
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

module.exports = router;