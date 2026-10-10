const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { LOW_STOCK_LIMIT } = require('../config');

const router = express.Router();
router.use(verifyToken, requireAdmin);

const TZ = 'Asia/Manila';
const RANGES = ['today', 'week', 'month', 'year', 'custom'];

function isRealDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Turns ?range=today|week|month|year|custom into { from, to } (inclusive dates)
function getRange(query) {
  const range = query.range || 'month';
  if (!RANGES.includes(range)) {
    return { error: `Range must be one of: ${RANGES.join(', ')}.` };
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  if (range === 'today') return { range, from: today, to: today };

  if (range === 'week') {
    // Week starts on Monday
    const day = new Date(`${today}T00:00:00Z`).getUTCDay();
    const from = addDays(today, -((day + 6) % 7));
    return { range, from, to: today };
  }
  if (range === 'month') return { range, from: `${today.slice(0, 7)}-01`, to: today };
  if (range === 'year') return { range, from: `${today.slice(0, 4)}-01-01`, to: today };

  // custom
  const { from, to } = query;
  if (!isRealDate(from) || !isRealDate(to)) {
    return { error: 'Custom range needs real dates: from=YYYY-MM-DD&to=YYYY-MM-DD.' };
  }
  if (from > to) return { error: "'from' date cannot be after 'to' date." };
  return { range, from, to };
}

// SQL piece for "order_date is inside the range"
const IN_RANGE = 'o.order_date >= ? AND o.order_date < DATE_ADD(?, INTERVAL 1 DAY)';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

// GET /api/admin/dashboard?range=month
router.get('/dashboard', async (req, res) => {
  try {
    const r = getRange(req.query);
    if (r.error) return res.status(400).json({ error: r.error });

    const [[orderStats]] = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(o.status = 'Completed'), 0) AS completed_orders,
         COALESCE(SUM(o.status = 'Cancelled'), 0) AS cancelled_orders,
         COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS total_sales
       FROM orders o
       WHERE ${IN_RANGE}`,
      [r.from, r.to]
    );

    const [[sold]] = await pool.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS cookies_sold
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.status = 'Completed' AND ${IN_RANGE}`,
      [r.from, r.to]
    );

    const [[pending]] = await pool.query(
      "SELECT COUNT(*) AS pending_orders FROM orders WHERE status = 'Pending'"
    );

    const [[stock]] = await pool.query(
      `SELECT
         COALESCE(SUM(stock_quantity BETWEEN 1 AND ?), 0) AS low_stock,
         COALESCE(SUM(stock_quantity = 0), 0) AS out_of_stock
       FROM products
       WHERE status = 'active'`,
      [LOW_STOCK_LIMIT]
    );

    res.json({
      range: r.range, from: r.from, to: r.to,
      total_sales: money(orderStats.total_sales),
      total_orders: Number(orderStats.total_orders),
      cookies_sold: Number(sold.cookies_sold),
      completed_orders: Number(orderStats.completed_orders),
      cancelled_orders: Number(orderStats.cancelled_orders),
      pending_orders: Number(pending.pending_orders),
      low_stock: Number(stock.low_stock),
      out_of_stock: Number(stock.out_of_stock),
      low_stock_limit: LOW_STOCK_LIMIT
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/admin/sales?range=month  (completed orders + totals)
router.get('/sales', async (req, res) => {
  try {
    const r = getRange(req.query);
    if (r.error) return res.status(400).json({ error: r.error });

    const [orders] = await pool.query(
      `SELECT o.order_id, o.order_date, o.pickup_date, o.pickup_time, o.total_amount,
              u.name AS customer_name
       FROM orders o
       JOIN users u ON u.user_id = o.user_id
       WHERE o.status = 'Completed' AND ${IN_RANGE}
       ORDER BY o.order_date DESC, o.order_id DESC`,
      [r.from, r.to]
    );

    const total = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    res.json({
      range: r.range, from: r.from, to: r.to,
      total_sales: money(total),
      order_count: orders.length,
      average_order: orders.length ? money(total / orders.length) : 0,
      orders
    });
  } catch (err) {
    console.error('Sales error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/admin/sales/trends?range=month&group=daily|weekly|monthly|yearly
router.get('/sales/trends', async (req, res) => {
  try {
    const r = getRange(req.query);
    if (r.error) return res.status(400).json({ error: r.error });

    // Only these fixed pieces of SQL are ever used (nothing from the user)
    const GROUPS = {
      daily:   'DATE(o.order_date)',
      weekly:  'DATE_SUB(DATE(o.order_date), INTERVAL WEEKDAY(o.order_date) DAY)',
      monthly: "DATE_FORMAT(o.order_date, '%Y-%m')",
      yearly:  'YEAR(o.order_date)'
    };
    const group = req.query.group || 'daily';
    if (!GROUPS[group]) {
      return res.status(400).json({ error: "Group must be 'daily', 'weekly', 'monthly', or 'yearly'." });
    }

    const [rows] = await pool.query(
      `SELECT ${GROUPS[group]} AS period,
              SUM(o.total_amount) AS sales,
              COUNT(*) AS orders
       FROM orders o
       WHERE o.status = 'Completed' AND ${IN_RANGE}
       GROUP BY period
       ORDER BY period`,
      [r.from, r.to]
    );

    res.json({
      range: r.range, from: r.from, to: r.to, group,
      data: rows.map(row => ({
        period: String(row.period),
        sales: money(row.sales),
        orders: Number(row.orders)
      }))
    });
  } catch (err) {
    console.error('Trends error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/admin/products/top-selling?range=month&limit=5
router.get('/products/top-selling', async (req, res) => {
  try {
    const r = getRange(req.query);
    if (r.error) return res.status(400).json({ error: r.error });

    const limit = req.query.limit === undefined ? 5 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'Limit must be a whole number from 1 to 50.' });
    }

    const [rows] = await pool.query(
      `SELECT p.product_id, p.product_name,
              SUM(oi.quantity) AS total_sold,
              SUM(oi.quantity * oi.price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN products p ON p.product_id = oi.product_id
       WHERE o.status = 'Completed' AND ${IN_RANGE}
       GROUP BY p.product_id, p.product_name
       ORDER BY total_sold DESC, revenue DESC
       LIMIT ?`,
      [r.from, r.to, limit]
    );

    res.json({
      range: r.range, from: r.from, to: r.to,
      products: rows.map(row => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_sold: Number(row.total_sold),
        revenue: money(row.revenue)
      }))
    });
  } catch (err) {
    console.error('Top selling error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;