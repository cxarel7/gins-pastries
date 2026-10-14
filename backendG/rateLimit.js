// Small in-memory limit per IP address. It resets when the server restarts.
function limiter({ windowMs, max, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(key, fresh); else hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const fresh = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (fresh.length >= max) return res.status(429).json({ error: message });
    fresh.push(now);
    hits.set(key, fresh);
    next();
  };
}

module.exports = { limiter };