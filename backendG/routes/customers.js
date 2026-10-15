const express = require('express');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireAdmin);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Only these fixed pieces of SQL are ever used for sorting
const SORTS = {
  newest: 'u.created_at DESC, u.user_id DESC',
  oldest: 'u.created_at ASC, u.user_id ASC',
  name:   'u.name ASC, u.user_id ASC',
  orders: 'order_count DESC, u.user_id ASC'
};

// GET /api/admin/customers?search=&sort=newest&page=1&limit=10
router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100).toLowerCase();
    const sort = req.query.sort || 'newest';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);

    if (!SORTS[sort]) return res.status(400).json({ error: "Sort must be 'newest', 'oldest', 'name', or 'orders'." });
    if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: 'Page must be 1 or higher.' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: 'Limit must be 1 to 50.' });

    const params = [];
    let where = "WHERE u.role = 'customer'";
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      where += ' AND (LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(u.contact) LIKE ?)';
      params.push(like, like, like);
    }

    const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    const total = Number(count.total);
    const pages = Math.max(1, Math.ceil(total / limit));

    const [rows] = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.name, u.contact, u.facebook, u.email, u.created_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.user_id) AS order_count,
              (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o
                 WHERE o.user_id = u.user_id AND o.status = 'Completed') AS total_spent
       FROM users u
       ${where}
       ORDER BY ${SORTS[sort]}
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    const [[sum]] = await pool.query(
      `SELECT COUNT(*) AS total_customers,
              COALESCE(SUM(created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')), 0) AS new_this_month
       FROM users WHERE role = 'customer'`
    );
    const [[withOrders]] = await pool.query(
      `SELECT COUNT(DISTINCT o.user_id) AS with_orders
       FROM orders o JOIN users u ON u.user_id = o.user_id WHERE u.role = 'customer'`
    );

    res.json({
      summary: {
        total_customers: Number(sum.total_customers),
        new_this_month: Number(sum.new_this_month),
        with_orders: Number(withOrders.with_orders)
      },
      page, limit, total, pages,
      customers: rows.map(r => ({
        ...r,
        order_count: Number(r.order_count),
        total_spent: Number(r.total_spent)
      }))
    });
  } catch (err) {
    console.error('List customers error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/admin/customers/:id  (one customer plus their order history)
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid customer ID.' });

    const [users] = await pool.query(
      `SELECT user_id, first_name, last_name, name, contact, facebook, email, created_at
       FROM users WHERE user_id = ? AND role = 'customer'`,
      [id]
    );
    if (users.length === 0) return res.status(404).json({ error: 'Customer not found.' });

    const [orders] = await pool.query(
      `SELECT order_id, order_date, pickup_date, pickup_time, total_amount, status, cancel_reason
       FROM orders WHERE user_id = ?
       ORDER BY order_date DESC, order_id DESC LIMIT 50`,
      [id]
    );

    let items = [];
    if (orders.length > 0) {
      [items] = await pool.query(
        `SELECT oi.order_id, p.product_name, oi.quantity
         FROM order_items oi JOIN products p ON p.product_id = oi.product_id
         WHERE oi.order_id IN (?) ORDER BY oi.order_item_id`,
        [orders.map(o => o.order_id)]
      );
    }

    res.json({
      customer: users[0],
      orders: orders.map(o => ({
        ...o,
        items: items.filter(i => i.order_id === o.order_id)
      }))
    });
  } catch (err) {
    console.error('Get customer error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;