const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/register
router.post('/register', async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = String(b.first_name || '').trim();
    const lastName = String(b.last_name || '').trim();
    const contact = String(b.contact || '').trim();
    const cleanEmail = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');

    if (!firstName || !lastName || !cleanEmail || !password || !contact) {
      return res.status(400).json({
        error: 'First name, last name, contact, email, and password are required.'
      });
    }
    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({ error: 'First and last name must be 50 characters or less.' });
    }
    if (contact.length < 5 || contact.length > 100) {
      return res.status(400).json({ error: 'Contact must be 5 to 100 characters (phone number or Facebook account).' });
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (first_name, last_name, contact, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'customer')`,
      [firstName, lastName, contact, cleanEmail, passwordHash]
    );

    res.status(201).json({
      message: 'Registration successful.',
      user: {
        user_id: result.insertId, first_name: firstName, last_name: lastName,
        name: `${firstName} ${lastName}`, contact, email: cleanEmail, role: 'customer'
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, name, contact, email, password_hash, role
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = rows[0];
    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

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
        name: user.name, contact: user.contact, email: user.email, role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;