const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { LOW_STOCK_LIMIT } = require('../config');
const { notifyAllCustomers } = require('../notifyHelper');

const router = express.Router();

// Every inventory route needs a logged-in admin
router.use(verifyToken, requireAdmin);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const MAX_STOCK = 100000;
const FILTERS = ['all', 'alerts', 'low', 'out', 'archived'];

const backInStock = (name) => `Back in stock! ${name} is available again.`;

// GET /api/inventory?filter=all|alerts|low|out|archived&search=oreo
router.get('/', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    if (!FILTERS.includes(filter)) {
      return res.status(400).json({ error: "Filter must be 'all', 'alerts', 'low', 'out', or 'archived'." });
    }
    const search = String(req.query.search || '').trim().slice(0, 100).toLowerCase();

    const conds = [];
    const params = [];
    const limit = Number(LOW_STOCK_LIMIT);

    if (filter === 'alerts') conds.push(`status = 'active' AND stock_quantity <= ${limit}`);
    if (filter === 'low') conds.push(`status = 'active' AND stock_quantity BETWEEN 1 AND ${limit}`);
    if (filter === 'out') conds.push("status = 'active' AND stock_quantity = 0");
    if (filter === 'archived') conds.push("status = 'archived'");
    if (search) {
      conds.push('LOWER(product_name) LIKE ?');
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [products] = await pool.query(
      `SELECT product_id, product_name, description, price, stock_quantity, status, image, updated_at,
              CASE
                WHEN stock_quantity = 0 THEN 'out_of_stock'
                WHEN stock_quantity <= ? THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM products
       ${where}
       ORDER BY stock_quantity ASC, product_name ASC`,
      [LOW_STOCK_LIMIT, ...params]
    );

    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(status = 'active' AND stock_quantity > ?), 0) AS in_stock,
         COALESCE(SUM(status = 'active' AND stock_quantity BETWEEN 1 AND ?), 0) AS low_stock,
         COALESCE(SUM(status = 'active' AND stock_quantity = 0), 0) AS out_of_stock,
         COALESCE(SUM(status = 'archived'), 0) AS archived
       FROM products`,
      [LOW_STOCK_LIMIT, LOW_STOCK_LIMIT]
    );

    res.json({ low_stock_limit: LOW_STOCK_LIMIT, summary, products });
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/inventory/:id   body: { "stock_quantity": 30 }  (sets an exact number)
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

  const body = req.body || {};
  const stock = Number(body.stock_quantity);
  if (body.stock_quantity === undefined || body.stock_quantity === '' ||
      !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Stock must be a whole number, 0 or higher.' });
  }
  if (stock > MAX_STOCK) {
    return res.status(400).json({ error: `Stock cannot be more than ${MAX_STOCK}.` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the cookie so the old stock we compare against can't change underneath us
    const [rows] = await conn.query(
      'SELECT product_name, stock_quantity, status FROM products WHERE product_id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cookie not found.' });
    }

    await conn.query('UPDATE products SET stock_quantity = ? WHERE product_id = ?', [stock, id]);

    let notified = false;
    if (rows[0].status === 'active' && rows[0].stock_quantity === 0 && stock > 0) {
      await notifyAllCustomers(conn, id, backInStock(rows[0].product_name));
      notified = true;
    }

    await conn.commit();

    res.json({
      message: 'Stock updated.',
      customers_notified: notified,
      product: { product_id: id, product_name: rows[0].product_name, stock_quantity: stock, status: rows[0].status }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Update stock error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

// PATCH /api/inventory/:id/stock   body: { "change": 10 } or { "change": -3 }
router.patch('/:id/stock', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

  const body = req.body || {};
  const change = Number(body.change);
  if (body.change === undefined || body.change === '' ||
      !Number.isInteger(change) || change === 0) {
    return res.status(400).json({ error: 'Change must be a whole number, not 0 (example: 10 or -3).' });
  }
  if (Math.abs(change) > MAX_STOCK) {
    return res.status(400).json({ error: `Change cannot be more than ${MAX_STOCK}.` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock this row so two requests can't change the stock at the same time
    const [rows] = await conn.query(
      'SELECT product_name, stock_quantity, status FROM products WHERE product_id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cookie not found.' });
    }

    const oldStock = rows[0].stock_quantity;
    const newStock = oldStock + change;
    if (newStock < 0) {
      await conn.rollback();
      return res.status(400).json({ error: `Not enough stock. Current stock is ${oldStock}.` });
    }
    if (newStock > MAX_STOCK) {
      await conn.rollback();
      return res.status(400).json({ error: `Stock cannot be more than ${MAX_STOCK}.` });
    }

    await conn.query('UPDATE products SET stock_quantity = ? WHERE product_id = ?', [newStock, id]);

    let notified = false;
    if (rows[0].status === 'active' && oldStock === 0 && newStock > 0) {
      await notifyAllCustomers(conn, id, backInStock(rows[0].product_name));
      notified = true;
    }

    await conn.commit();

    res.json({
      message: 'Stock adjusted.',
      customers_notified: notified,
      product_id: id,
      previous_stock: oldStock,
      change,
      stock_quantity: newStock
    });
  } catch (err) {
    await conn.rollback();
    console.error('Adjust stock error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  } finally {
    conn.release();
  }
});

module.exports = router;