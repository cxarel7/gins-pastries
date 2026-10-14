const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { sendMail, codeEmail, passwordChangedEmail } = require('../mailer');
const { limiter } = require('../rateLimit');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;

const CODE_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const RESET_REPLY = 'If an account exists with that email, a reset code will be sent to it.';
const BAD_CODE = 'That code is invalid or expired. Please request a new one.';

const codeLimiter = limiter({
  windowMs: 15 * 60 * 1000, max: 12,
  message: 'Too many requests. Please try again in a few minutes.'
});
const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000, max: 30,
  message: 'Too many login attempts. Please try again in a few minutes.'
});

function hashCode(email, purpose, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`${email}:${purpose}:${code}`).digest('hex');
}
function sameHash(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Checks a code inside the caller's transaction. The caller must COMMIT afterwards,
// even when this returns { ok: false }, so wrong-attempt counts are saved.
async function verifyCode(conn, email, purpose, code) {
  const [rows] = await conn.query(
    `SELECT code_id, code_hash, attempts, (expires_at > NOW()) AS live
     FROM email_codes
     WHERE email = ? AND purpose = ? AND used = 0
     ORDER BY code_id DESC LIMIT 1 FOR UPDATE`,
    [email, purpose]
  );
  if (rows.length === 0) return { ok: false, error: BAD_CODE };

  const row = rows[0];
  if (!Number(row.live)) {
    await conn.query('UPDATE email_codes SET used = 1 WHERE code_id = ?', [row.code_id]);
    return { ok: false, error: 'That code has expired. Please request a new one.' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }
  if (!sameHash(row.code_hash, hashCode(email, purpose, code))) {
    await conn.query('UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = ?', [row.code_id]);
    return { ok: false, error: 'Incorrect code. Please check it and try again.' };
  }
  await conn.query('UPDATE email_codes SET used = 1 WHERE code_id = ?', [row.code_id]);
  return { ok: true };
}

// POST /api/send-code   body: { email, purpose: 'register' | 'reset' }
router.post('/send-code', codeLimiter, async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const purpose = b.purpose;

  if (purpose !== 'register' && purpose !== 'reset') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  if (!EMAIL_REGEX.test(email) || email.length > 150) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const reset = purpose === 'reset';

  try {
    const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    const exists = users.length > 0;

    if (!reset && exists) return res.status(409).json({ error: 'That email is already registered.' });
    if (reset && !exists) return res.json({ message: RESET_REPLY }); // no email is sent

    // Limits per email address
    const [[lim]] = await pool.query(
      `SELECT COALESCE(SUM(created_at > DATE_SUB(NOW(), INTERVAL ${COOLDOWN_SECONDS} SECOND)), 0) AS recent,
              COUNT(*) AS per_hour
       FROM email_codes
       WHERE email = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [email, purpose]
    );
    const tooSoon = Number(lim.recent) > 0;
    const tooMany = Number(lim.per_hour) >= MAX_CODES_PER_HOUR;
    if (tooSoon || tooMany) {
      if (reset) return res.json({ message: RESET_REPLY });
      return res.status(429).json({
        error: tooSoon
          ? `Please wait ${COOLDOWN_SECONDS} seconds before requesting another code.`
          : 'Too many codes requested. Please try again in an hour.'
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query('UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0', [email, purpose]);
    const [ins] = await pool.query(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${CODE_MINUTES} MINUTE))`,
      [email, purpose, hashCode(email, purpose, code)]
    );

    try {
      await sendMail({ to: email, ...codeEmail(code, purpose, CODE_MINUTES) });
    } catch (mailErr) {
      console.error('Send code email failed:', mailErr.message);
      await pool.query('DELETE FROM email_codes WHERE code_id = ?', [ins.insertId]);
      if (reset) return res.json({ message: RESET_REPLY });
      return res.status(503).json({ error: "We couldn't send the email right now. Please try again later." });
    }

    res.json({
      message: reset ? RESET_REPLY : 'Verification code sent to your email.',
      cooldown: COOLDOWN_SECONDS
    });
  } catch (err) {
    console.error('Send code error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/register  (needs the emailed code)
router.post('/register', codeLimiter, async (req, res) => {
  const b = req.body || {};
  const firstName = String(b.first_name || '').trim();
  const lastName = String(b.last_name || '').trim();
  const contact = String(b.contact || '').replace(/[\s-]/g, '');
  const facebook = String(b.facebook || '').trim();
  const cleanEmail = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const code = String(b.code || '').trim();

  if (!firstName || !lastName || !contact || !cleanEmail || !password) {
    return res.status(400).json({ error: 'First name, last name, contact number, email, and password are required.' });
  }
  if (firstName.length > 50 || lastName.length > 50) {
    return res.status(400).json({ error: 'First and last name must be 50 characters or less.' });
  }
  if (!PHONE_REGEX.test(contact)) {
    return res.status(400).json({ error: 'Please enter a valid mobile number (09XXXXXXXXX or +639XXXXXXXXX).' });
  }
  if (facebook && (facebook.length < 3 || facebook.length > 150)) {
    return res.status(400).json({ error: 'Facebook link must be 3 to 150 characters.' });
  }
  if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 150) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 72) return res.status(400).json({ error: 'Password must be 72 characters or less.' });
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Please enter the 6-digit code we emailed you.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT user_id FROM users WHERE email = ? FOR UPDATE', [cleanEmail]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const v = await verifyCode(conn, cleanEmail, 'register', code);
    if (!v.ok) {
      await conn.commit(); // keeps the wrong-attempt count
      return res.status(400).json({ error: v.error });
    }

    const fullName = `${firstName} ${lastName}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      `INSERT INTO users (first_name, last_name, name, contact, facebook, email, password_hash, role, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', 1)`,
      [firstName, lastName, fullName, contact, facebook || null, cleanEmail, passwordHash]
    );
    await conn.commit();

    res.status(201).json({
      message: 'Registration successful.',
      user: {
        user_id: result.insertId, first_name: firstName, last_name: lastName,
        name: fullName, contact, facebook: facebook || null, email: cleanEmail, role: 'customer'
      }
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

// POST /api/reset-password   body: { email, code, new_password }
router.post('/reset-password', codeLimiter, async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  const newPassword = String(b.new_password || '');

  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Please enter the 6-digit code we emailed you.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (newPassword.length > 72) return res.status(400).json({ error: 'Password must be 72 characters or less.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.query('SELECT user_id FROM users WHERE email = ? FOR UPDATE', [email]);
    if (users.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: BAD_CODE }); // same answer as a wrong code
    }

    const v = await verifyCode(conn, email, 'reset', code);
    if (!v.ok) {
      await conn.commit(); // keeps the wrong-attempt count
      return res.status(400).json({ error: v.error });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, users[0].user_id]);
    await conn.query("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = 'reset'", [email]);
    await conn.commit();

    // Best effort: tell the owner their password changed
    sendMail({ to: email, ...passwordChangedEmail() })
      .catch((e) => console.error('Password-changed email failed:', e.message));

    res.json({ message: 'Your password has been changed. You can log in now.' });
  } catch (err) {
    await conn.rollback();
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

// POST /api/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, name, contact, facebook, email, password_hash, role, email_verified
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = rows[0];
    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        user_id: user.user_id, first_name: user.first_name, last_name: user.last_name,
        name: user.name, contact: user.contact, facebook: user.facebook,
        email: user.email, role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;