// Saves one notification for every customer.
// Always call it inside the caller's transaction, so it is saved only if the change succeeds.
async function notifyAllCustomers(conn, productId, message) {
  await conn.query(
    "INSERT INTO notifications (user_id, product_id, message) SELECT user_id, ?, ? FROM users WHERE role = 'customer'",
    [productId, message]
  );
}

module.exports = { notifyAllCustomers };