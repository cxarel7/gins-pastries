const Cart = {
  key() { const u = Auth.user(); return `cart_${u ? u.user_id : "guest"}`; },

  items() {
    try { return JSON.parse(localStorage.getItem(Cart.key())) || []; }
    catch (e) { return []; }
  },

  save(items) { localStorage.setItem(Cart.key(), JSON.stringify(items)); },

  count() { return Cart.items().reduce((n, i) => n + i.quantity, 0); },

  // Returns { ok, updated } or { ok:false, reason }
  add(p) {
    if (p.stock_quantity < 1) return { ok: false, reason: "out" };
    const items = Cart.items();
    const found = items.find(i => i.product_id === p.product_id);

    if (found) {
      if (found.quantity + 1 > p.stock_quantity) return { ok: false, reason: "max" };
      found.quantity += 1;
      found.price = Number(p.price);
      found.max = p.stock_quantity;
      Cart.save(items);
      return { ok: true, updated: true };
    }

    items.push({
      product_id: p.product_id,
      name: p.product_name,
      price: Number(p.price),
      image: p.image || null,
      quantity: 1,
      max: p.stock_quantity
    });
    Cart.save(items);
    return { ok: true, updated: false };
  }
};