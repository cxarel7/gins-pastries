(function () {
  if (!Auth.user()) return;

  const listEl = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  const dateEl = document.getElementById("pickupDate");
  const timeEl = document.getElementById("pickupTime");
  const btn = document.getElementById("checkoutBtn");
  const msgEl = document.getElementById("cartMessage");
  let busy = false;

  const peso = (n) => "₱" + Number(n).toFixed(2).replace(/\.00$/, "");

  const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 200 200'>" +
    "<circle cx='100' cy='100' r='80' fill='#d9a05b'/>" +
    "<circle cx='70' cy='80' r='9' fill='#5a3418'/><circle cx='120' cy='70' r='8' fill='#5a3418'/>" +
    "<circle cx='135' cy='115' r='10' fill='#5a3418'/><circle cx='85' cy='128' r='8' fill='#5a3418'/></svg>");

  // Pickup date: today or later (Philippine date)
  function todayManila() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }
  dateEl.min = todayManila();

  function showMsg(type, text) {
    msgEl.className = text ? `cart-msg cart-${type}` : "";
    msgEl.textContent = text;
  }

  function render() {
    const items = Cart.items();
    listEl.replaceChildren();

    if (items.length === 0) {
      const p = document.createElement("div");
      p.className = "cart-empty";
      p.innerHTML = 'Your cart is empty. <a href="customerpage.html">Browse our cookies</a>';
      listEl.appendChild(p);
      totalEl.textContent = peso(0);
      btn.disabled = true;
      return;
    }

    let total = 0;
    items.forEach((it, i) => {
      const sub = it.price * it.quantity;
      total += sub;

      const row = document.createElement("div");
      row.className = "cartproduct";

      const no = document.createElement("h2");
      no.textContent = i + 1;
      const img = document.createElement("img");
      img.alt = it.name;
      img.src = it.image || FALLBACK;
      img.onerror = () => { img.onerror = null; img.src = FALLBACK; };

      const name = document.createElement("h4");
      name.className = "cart-name";
      name.textContent = it.name;

      // Picture with the name below it
      const prod = document.createElement("div");
      prod.className = "cart-prod";
      prod.append(img, name);

      const unit = document.createElement("h4");
      unit.textContent = peso(it.price);

      const qty = document.createElement("div");
      qty.className = "btn";
      const plus = document.createElement("button");
      plus.className = "btn2"; plus.textContent = "+";
      plus.addEventListener("click", () => change(it.product_id, +1));
      const count = document.createElement("span");
      count.className = "qty-num"; count.textContent = ` ${it.quantity} `;
      const minus = document.createElement("button");
      minus.className = "btn2"; minus.textContent = "-";
      minus.addEventListener("click", () => change(it.product_id, -1));
      qty.append(plus, count, minus);

      const subEl = document.createElement("h4");
      subEl.textContent = peso(sub);

      const rm = document.createElement("button");
      rm.className = "rmbtn"; rm.textContent = "remove";
      rm.addEventListener("click", () => remove(it.product_id));
      
      row.append(no, prod, unit, qty, subEl, rm);
      listEl.appendChild(row);
    });

    totalEl.textContent = peso(total);
    btn.disabled = busy;
  }

  function updateBadge() {
    const b = document.getElementById("cartCount");
    if (b) b.textContent = Cart.count();
  }

  function change(id, delta) {
    const items = Cart.items();
    const it = items.find(x => x.product_id === id);
    if (!it) return;
    const next = it.quantity + delta;

    if (next < 1) return remove(id);
    if (next > it.max) {
      return Toast.warning(`Only ${it.max} ${it.name} available.`);
    }
    it.quantity = next;
    Cart.save(items);
    render(); updateBadge();
    Toast.success("Cart updated successfully!");
  }

  function remove(id) {
    Cart.save(Cart.items().filter(x => x.product_id !== id));
    render(); updateBadge();
    Toast.info("Item removed from your cart.");
  }

  // ----- Checkout -----
  btn.addEventListener("click", async () => {
    if (busy) return;
    showMsg("info", "");

    const items = Cart.items();
    if (items.length === 0) return Toast.warning("Your cart is empty.");

    const pickup_date = dateEl.value;
    const pickup_time = timeEl.value;
    if (!pickup_date || !pickup_time) {
      return showMsg("error", "Please select a valid pickup date and time.");
    }

    busy = true;
    btn.disabled = true;
    btn.textContent = "Placing order...";

    const { ok, data } = await Auth.api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        pickup_date,
        pickup_time,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
      })
    });

    busy = false;
    btn.textContent = "Check Out";

    if (!ok) {
      btn.disabled = false;
      // The cart is kept so nothing is lost
      return showMsg("error", data.error || "Unable to complete your order. Please try again.");
    }

    // Only now is it safe to clear the cart
    Cart.save([]);
    render(); updateBadge();
    dateEl.value = ""; timeEl.value = "";
    showMsg("success", `Order placed! Your order ID is #${data.order.order_id}.`);
    Toast.success(`Order #${data.order.order_id} placed successfully!`);
  });

  render();
  updateBadge();
})();