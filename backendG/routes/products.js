const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Checks the data sent by the admin. Returns { error } or { data }.
function validateProduct(body) {
  const name = String(body.product_name || '').trim();
  const price = Number(body.price);
  const stock = body.stock_quantity === undefined ? 0 : Number(body.stock_quantity);
  const status = body.status || 'active';

  if (!name) return { error: 'Product name is required.' };
  if (name.length > 100) return { error: 'Product name must be 100 characters or less.' };
  if (body.price === undefined || body.price === '' || !Number.isFinite(price) || price <= 0) {
    return { error: 'Price must be a number greater than 0.' };
  }
  if (!Number.isInteger(stock) || stock < 0) {
    return { error: 'Stock must be a whole number, 0 or higher.' };
  }
  if (!['active', 'archived'].includes(status)) {
    return { error: "Status must be 'active' or 'archived'." };
  }

  // Image: nothing, a web link, or a small uploaded picture
  let image = body.image ? String(body.image).trim() : null;
  if (image) {
    const isLink = /^https?:\/\//i.test(image);
    const isUpload = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
    if (!isLink && !isUpload) {
      return { error: 'Image must be a web link or a JPG, PNG, or WebP picture.' };
    }
    if (image.length > 400000) {
      return { error: 'That picture is too large. Please choose a smaller one.' };
    }
  }

  return {
    data: {
      name,
      description: body.description ? String(body.description).trim() : null,
      price: Math.round(price * 100) / 100,
      stock,
      status,
      image
    }
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/products  (public, active cookies only)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM products WHERE status = 'active' ORDER BY product_name"
    );
    res.json(rows);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/products/best-selling  (public, top 4 by completed sales)
// MUST stay above /:id, or "best-selling" is read as an ID
router.get('/best-selling', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.product_id, p.product_name, p.description, p.price,
              p.stock_quantity, p.image, SUM(oi.quantity) AS total_sold
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN products p ON p.product_id = oi.product_id
       WHERE o.status = 'Completed' AND p.status = 'active'
       GROUP BY p.product_id, p.product_name, p.description, p.price, p.stock_quantity, p.image
       ORDER BY total_sold DESC
       LIMIT 4`
    );
    res.json(rows.map(r => ({ ...r, total_sold: Number(r.total_sold) })));
  } catch (err) {
    console.error('Best selling error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/products/:id  (public, active cookies only)
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const [rows] = await pool.query(
      "SELECT * FROM products WHERE product_id = ? AND status = 'active'",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cookie not found.' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/products  (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { error, data } = validateProduct(req.body || {});
    if (error) return res.status(400).json({ error });

    const [result] = await pool.query(
      `INSERT INTO products (product_name, description, price, stock_quantity, status, image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.description, data.price, data.stock, data.status, data.image]
    );

    const [rows] = await pool.query('SELECT * FROM products WHERE product_id = ?', [result.insertId]);
    res.status(201).json({ message: 'Cookie added.', product: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A cookie with that name already exists.' });
    }
    console.error('Add product error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/products/:id  (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const { error, data } = validateProduct(req.body || {});
    if (error) return res.status(400).json({ error });

    const [result] = await pool.query(
      `UPDATE products
       SET product_name = ?, description = ?, price = ?, stock_quantity = ?, status = ?, image = ?
       WHERE product_id = ?`,
      [data.name, data.description, data.price, data.stock, data.status, data.image, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cookie not found.' });

    const [rows] = await pool.query('SELECT * FROM products WHERE product_id = ?', [id]);
    res.json({ message: 'Cookie updated.', product: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A cookie with that name already exists.' });
    }
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// DELETE /api/products/:id  (admin only, archives the cookie)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const [result] = await pool.query(
      "UPDATE products SET status = 'archived' WHERE product_id = ?",
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cookie not found.' });

    res.json({ message: 'Cookie archived.' });
  } catch (err) {
    console.error('Archive product error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PATCH /api/products/:id/restore  (admin only, un-archives the cookie)
router.patch('/:id/restore', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const [result] = await pool.query(
      "UPDATE products SET status = 'active' WHERE product_id = ?",
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cookie not found.' });

    res.json({ message: 'Cookie restored.' });
  } catch (err) {
    console.error('Restore product error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;