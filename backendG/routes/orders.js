const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const MAX_ITEMS = 20;
const MAX_QTY_PER_COOKIE = 50;
const PAGE_SIZE = 10;
const TZ = 'Asia/Manila';
const MIN_LEAD_DAYS = 1; // pickup must be at least this many days after the order date

const STATUSES = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

// Which status changes are allowed
const TRANSITIONS = {
  Pending:   ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready:     ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: []
};

// Message the customer receives for each new status
const NOTIFY = {
  Confirmed: (id) => `Your order #${id} has been confirmed!`,
  Preparing: (id) => `Your cookies for order #${id} are now being prepared.`,
  Ready:     (id) => `Your cookies are ready for pickup! (Order #${id})`,
  Completed: (id) => `Your order #${id} has been completed. Thank you for ordering from Gin's Pastries!`,
  Cancelled: (id, reason) => `Your order #${id} has been cancelled. Reason: ${reason}. Please contact the seller for clarification.`
};

const CUSTOMER_COLS =
  'u.name AS customer_name, u.email AS customer_email, u.contact AS customer_contact, u.facebook AS customer_facebook';

// Only these fixed pieces of SQL are ever used for sorting
const SORTS = {
  newest:  'o.order_date DESC, o.order_id DESC',
  oldest:  'o.order_date ASC, o.order_id ASC',
  pickup:  'o.pickup_date ASC, o.pickup_time ASC, o.order_id ASC',
  highest: 'o.total_amount DESC, o.order_id DESC'
};

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Current date (YYYY-MM-DD) and time (HH:MM) in the Philippines
function nowInManila() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: TZ });
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  });
  return { date, time };
}

function isRealDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function isRealTime(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(str);

}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Adds an "items" list to each order
async function attachItems(orders) {
  if (orders.length === 0) return orders;
  const ids = orders.map(o => o.order_id);
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.product_id, p.product_name, oi.quantity, oi.price,
            (oi.quantity * oi.price) AS subtotal
     FROM order_items oi
     JOIN products p ON p.product_id = oi.product_id
     WHERE oi.order_id IN (?)
     ORDER BY oi.order_item_id`,
    [ids]
  );
  return orders.map(o => ({
    ...o,
    items: items.filter(i => i.order_id === o.order_id)
  }));
}

// POST /api/orders  (customer only)
router.post('/orders', verifyToken, async (req, res) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Only customers can place orders.' });
  }

  const { pickup_date, pickup_time, items, payment_reference } = req.body || {};

  if (!pickup_date || !pickup_time) {
    return res.status(400).json({ error: 'Pickup date and pickup time are required.' });
  }
  const pDate = String(pickup_date).trim();
  const pTime = String(pickup_time).trim().slice(0, 5);

  if (!isRealDate(pDate)) {
    return res.status(400).json({ error: 'Pickup date must be a real date (YYYY-MM-DD).' });
  }
  if (!isRealTime(pTime)) {
    return res.status(400).json({ error: 'Pickup time must be a real time (HH:MM, 24-hour).' });
  }
  const now = nowInManila();
  const earliest = addDays(now.date, MIN_LEAD_DAYS);
  if (pDate < earliest) {
    return res.status(400).json({
      error: `Please choose ${earliest} or a later date. We need at least ${MIN_LEAD_DAYS} day${MIN_LEAD_DAYS === 1 ? '' : 's'} to prepare your order.`
    });
  }

  const payRef = String(payment_reference || '').trim();
  if (!/^\d{10,13}$/.test(payRef)) {
    return res.status(400).json({ error: 'Please enter your GCash reference number (10 to 13 digits).' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your order must contain at least one cookie.' });
  }
  if (items.length > MAX_ITEMS) {
    return res.status(400).json({ error: `An order can have at most ${MAX_ITEMS} different cookies.` });
  }

  // Merge duplicates (same cookie listed twice) into one line
  const wanted = new Map();
  for (const item of items) {
    const productId = parseId(item && item.product_id);
    const qty = Number(item && item.quantity);
    if (!productId) {
      return res.status(400).json({ error: 'Each item needs a valid product_id.' });
    }
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'Quantity must be a whole number, 1 or higher.' });
    }
    wanted.set(productId, (wanted.get(productId) || 0) + qty);
  }
  for (const qty of wanted.values()) {
    if (qty > MAX_QTY_PER_COOKIE) {
      return res.status(400).json({ error: `You can order at most ${MAX_QTY_PER_COOKIE} of one cookie.` });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const lines = [];
    let total = 0;
    const productIds = [...wanted.keys()].sort((a, b) => a - b);

    for (const productId of productIds) {
      const qty = wanted.get(productId);

      const [rows] = await conn.query(
        'SELECT product_id, product_name, price, stock_quantity, status FROM products WHERE product_id = ? FOR UPDATE',
        [productId]
      );

      if (rows.length === 0 || rows[0].status !== 'active') {
        await conn.rollback();
        return res.status(400).json({ error: `Cookie #${productId} is not available.` });
      }
      const p = rows[0];
      if (p.stock_quantity < qty) {
        await conn.rollback();
        const msg = p.stock_quantity === 0
          ? `${p.product_name} is out of stock.`
          : `Not enough ${p.product_name}. Only ${p.stock_quantity} left.`;
        return res.status(400).json({ error: msg });
      }

      const price = Number(p.price);
      total += price * qty;
      lines.push({ productId, qty, price });
    }

    total = Math.round(total * 100) / 100;

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, pickup_date, pickup_time, total_amount, payment_reference, status)
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [req.user.user_id, pDate, `${pTime}:00`, total, payRef]
    );
    const orderId = orderResult.insertId;

    for (const line of lines) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, line.productId, line.qty, line.price]
      );
      await conn.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?',
        [line.qty, line.productId]
      );
    }

    await conn.commit();

    const [orders] = await pool.query('SELECT * FROM orders WHERE order_id = ?', [orderId]);
    const [order] = await attachItems(orders);
    res.status(201).json({ message: 'Order placed.', order });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That reference number was already used for another order.' });
    }
    console.error('Place order error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

// GET /api/my-orders  (the logged-in customer's own orders)
router.get('/my-orders', verifyToken, async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC, order_id DESC',
      [req.user.user_id]
    );
    res.json(await attachItems(orders));
  } catch (err) {
    console.error('My orders error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/orders?status=&search=&sort=newest&page=1  (admin only)
router.get('/orders', verifyToken, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}.` });
    }
    const sort = req.query.sort || 'newest';
    if (!SORTS[sort]) {
      return res.status(400).json({ error: "Sort must be 'newest', 'oldest', 'pickup', or 'highest'." });
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({ error: 'Page must be 1 or higher.' });
    }
    const search = String(req.query.search || '').trim().replace(/^#/, '').slice(0, 100).toLowerCase();

    const conds = [];
    const params = [];
    if (status) { conds.push('o.status = ?'); params.push(status); }
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      const parts = [];
      const sp = [];
      if (/^\d{1,9}$/.test(search)) { parts.push('o.order_id = ?'); sp.push(Number(search)); }
      parts.push('LOWER(u.name) LIKE ?', 'LOWER(u.email) LIKE ?', 'LOWER(u.contact) LIKE ?', 'o.payment_reference LIKE ?');
      sp.push(like, like, like, like);
      conds.push(`(${parts.join(' OR ')})`);
      params.push(...sp);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.user_id = o.user_id ${where}`,
      params
    );
    const total = Number(countRow.total);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const [orders] = await pool.query(
      `SELECT o.*, ${CUSTOMER_COLS}
       FROM orders o
       JOIN users u ON u.user_id = o.user_id
       ${where}
       ORDER BY ${SORTS[sort]}
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    );

    // Number of orders per status, for the tab labels
    const [statusRows] = await pool.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
    const counts = { all: 0 };
    STATUSES.forEach((s) => { counts[s] = 0; });
    statusRows.forEach((r) => { counts[r.status] = Number(r.n); counts.all += Number(r.n); });

    res.json({ orders: await attachItems(orders), counts, total, page, pages, limit: PAGE_SIZE });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/orders/:id  (the order's owner, or an admin)
router.get('/orders/:id', verifyToken, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID.' });

    const [orders] = await pool.query(
      `SELECT o.*, ${CUSTOMER_COLS}
       FROM orders o
       JOIN users u ON u.user_id = o.user_id
       WHERE o.order_id = ?`,
      [id]
    );

    // Same answer for "doesn't exist" and "not yours", so IDs can't be guessed
    if (orders.length === 0 ||
        (req.user.role !== 'admin' && orders[0].user_id !== req.user.user_id)) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const [order] = await attachItems(orders);
    res.json(order);
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/orders/:id/status  body: { "status": "Confirmed" }  (admin only)
// Cancelling also needs: { "status": "Cancelled", "reason": "..." }
router.put('/orders/:id/status', verifyToken, requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid order ID.' });

  const newStatus = (req.body || {}).status;
  if (!STATUSES.includes(newStatus)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}.` });
  }

  let reason = null;
  if (newStatus === 'Cancelled') {
    reason = String((req.body || {}).reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ error: 'Please give a reason for cancelling (at least 3 characters).' });
    }
    if (reason.length > 120) {
      return res.status(400).json({ error: 'The reason must be 120 characters or less.' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the order so it can't be changed twice at the same moment
    const [rows] = await conn.query(
      'SELECT status, user_id FROM orders WHERE order_id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }

    const current = rows[0].status;
    const customerId = rows[0].user_id;

    if (current === newStatus) {
      await conn.rollback();
      return res.status(400).json({ error: `Order is already ${current}.` });
    }
    if (!TRANSITIONS[current].includes(newStatus)) {
      await conn.rollback();
      return res.status(400).json({ error: `Cannot change an order from ${current} to ${newStatus}.` });
    }

    // Cancelling puts the cookies back in stock
    if (newStatus === 'Cancelled') {
      const [items] = await conn.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id',
        [id]
      );
      for (const item of items) {
        await conn.query(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?',
          [item.quantity, item.product_id]
        );
      }
    }

    await conn.query(
      'UPDATE orders SET status = ?, cancel_reason = ? WHERE order_id = ?',
      [newStatus, reason, id]
    );

    // Notify the customer (same transaction, so it is saved exactly once)
    if (NOTIFY[newStatus]) {
      await conn.query(
        'INSERT INTO notifications (user_id, order_id, message) VALUES (?, ?, ?)',
        [customerId, id, NOTIFY[newStatus](id, reason)]
      );
    }

    await conn.commit();

    const [orders] = await pool.query('SELECT * FROM orders WHERE order_id = ?', [id]);
    const [order] = await attachItems(orders);
    res.json({ message: `Order is now ${newStatus}.`, order });
  } catch (err) {
    await conn.rollback();
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

module.exports = router;