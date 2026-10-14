// Sends email through Brevo's HTTP API.
// It returns only after Brevo has ACCEPTED the message, and throws otherwise.
async function sendMail({ to, subject, html, text }) {
  const key = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  if (!key || !fromEmail) {
    throw new Error('Email is not configured. Set BREVO_API_KEY and MAIL_FROM_EMAIL in .env.');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_FROM_NAME || "Gin's Pastries", email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo rejected the email (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  return true;
}

function wrap(title, bodyHtml) {
  return `
  <div style="font-family:'Comic Sans MS',Arial,sans-serif;background:#f0e0ff;padding:24px">
    <div style="max-width:420px;margin:0 auto;background:#d1a3fd;border-radius:24px;overflow:hidden">
      <div style="background:#501c83;color:#fff;padding:16px 22px;font-size:20px;font-weight:bold">Gin's Pastries</div>
      <div style="padding:22px;color:#501c83">
        <h2 style="margin:0 0 8px">${title}</h2>
        ${bodyHtml}
      </div>
    </div>
  </div>`;
}

function codeEmail(code, purpose, minutes) {
  const reset = purpose === 'reset';
  const title = reset ? 'Reset your password' : 'Verify your email';
  const intro = reset
    ? "Use this code to reset your Gin's Pastries password."
    : "Use this code to finish creating your Gin's Pastries account.";
  const html = wrap(title, `
    <p style="margin:0 0 16px">${intro}</p>
    <div style="background:#fff;border-radius:16px;padding:14px;text-align:center;font-size:34px;font-weight:bold;letter-spacing:8px">${code}</div>
    <p style="margin:16px 0 0;font-size:14px">This code expires in ${minutes} minutes. If you did not ask for it, you can ignore this email.</p>`);
  const text = `${title}\n\n${intro}\n\nYour code: ${code}\nIt expires in ${minutes} minutes.\n\nIf you did not ask for this, you can ignore this email.`;
  return { subject: "Your Gin's Pastries verification code", html, text };
}

function passwordChangedEmail() {
  const html = wrap('Your password was changed', `
    <p style="margin:0">The password for your Gin's Pastries account was just changed. If this was not you, please contact the shop right away.</p>`);
  const text = "The password for your Gin's Pastries account was just changed. If this was not you, please contact the shop right away.";
  return { subject: "Your Gin's Pastries password was changed", html, text };
}

module.exports = { sendMail, codeEmail, passwordChangedEmail };