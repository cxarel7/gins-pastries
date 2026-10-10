const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { LOW_STOCK_LIMIT } = require('../config');

const router = express.Router();

// Every inventory route needs a logged-in admin
router.use(verifyToken, requireAdmin);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const MAX_STOCK = 100000;
// GET /api/inventory?filter=all|low|out|archived
router.get('/', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';

    let where = '';
    if (filter === 'low') {
      where = `WHERE status = 'active' AND stock_quantity BETWEEN 1 AND ${Number(LOW_STOCK_LIMIT)}`;
    } else if (filter === 'out') {
      where = "WHERE status = 'active' AND stock_quantity = 0";
    } else if (filter === 'archived') {
      where = "WHERE status = 'archived'";
    } else if (filter !== 'all') {
      return res.status(400).json({ error: "Filter must be 'all', 'low', 'out', or 'archived'." });
    }

    const [products] = await pool.query(
      `SELECT product_id, product_name, description, price, stock_quantity, status, image, updated_at,
              CASE
                WHEN stock_quantity = 0 THEN 'out_of_stock'
                WHEN stock_quantity <= ? THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM products
       ${where}
       ORDER BY product_name`,
      [LOW_STOCK_LIMIT]
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
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const stock = Number(req.body.stock_quantity);
    if (req.body.stock_quantity === undefined || req.body.stock_quantity === '' ||
        !Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Stock must be a whole number, 0 or higher.' });
    }
    if (stock > MAX_STOCK) {
      return res.status(400).json({ error: `Stock cannot be more than ${MAX_STOCK}.` });
    }

    const [result] = await pool.query(
      'UPDATE products SET stock_quantity = ? WHERE product_id = ?',
      [stock, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cookie not found.' });

    const [rows] = await pool.query(
      'SELECT product_id, product_name, stock_quantity, status FROM products WHERE product_id = ?',
      [id]
    );
    res.json({ message: 'Stock updated.', product: rows[0] });
  } catch (err) {
    console.error('Update stock error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PATCH /api/inventory/:id/stock   body: { "change": 10 } or { "change": -3 }
router.patch('/:id/stock', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

  const change = Number(req.body.change);
  if (req.body.change === undefined || req.body.change === '' ||
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
      'SELECT stock_quantity FROM products WHERE product_id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cookie not found.' });
    }

    const newStock = rows[0].stock_quantity + change;
    if (newStock < 0) {
      await conn.rollback();
      return res.status(400).json({
        error: `Not enough stock. Current stock is ${rows[0].stock_quantity}.`
      });
    }
    if (newStock > MAX_STOCK) {
      await conn.rollback();
      return res.status(400).json({ error: `Stock cannot be more than ${MAX_STOCK}.` });
    }

    await conn.query('UPDATE products SET stock_quantity = ? WHERE product_id = ?', [newStock, id]);
    await conn.commit();

    res.json({
      message: 'Stock adjusted.',
      product_id: id,
      previous_stock: rows[0].stock_quantity,
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