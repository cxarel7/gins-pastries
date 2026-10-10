const bcrypt = require('bcryptjs');
const pool = require('./db');
require('dotenv').config();

async function seedAdmin() {
const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
const lastName = process.env.ADMIN_LAST_NAME || 'User';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || password.length < 8) {
    console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD (8+ characters) in .env first.');
    process.exit(1);
  }

  try {
    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE users SET role = ?, first_name = ?, last_name = ? WHERE email = ?',
        ['admin', firstName, lastName, email]
      );
      console.log('Admin already existed. Role and name confirmed:', email);
    } else {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [firstName, lastName, email, hash, 'admin']
      );
      console.log('Admin account created:', email);
    }
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();