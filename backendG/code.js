const crypto = require('crypto');

const MAX_ATTEMPTS = 5;
const BAD_CODE = 'That code is invalid or expired. Please request a new one.';

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

module.exports = { hashCode, verifyCode };