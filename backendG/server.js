const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Allowed websites: localhost for development, plus FRONTEND_URL when deployed
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Thunder Client, Postman
    const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    if (isLocal || allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ message: "Gin's Pastries API is running" });
});

// Routes
app.use('/api', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/me', require('./routes/me'));
app.use('/api/notifications', require('./routes/notifications'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});