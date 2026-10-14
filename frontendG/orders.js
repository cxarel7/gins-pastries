(function () {
  if (!Auth.user()) return;
  const box = document.getElementById("ordersList");

  const peso = (n) => "₱" + Number(n).toFixed(2).replace(/\.00$/, "");

  function fmtTime(t) {
    const [h, m] = String(t).split(":");
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function note(text, retry) {
    box.replaceChildren();
    const p = document.createElement("div");
    p.className = "ord-note";
    p.textContent = text;
    box.appendChild(p);
    if (retry) {
      const b = document.createElement("button");
      b.className = "shop-retry";
      b.textContent = "Try again";
      b.addEventListener("click", load);
      box.appendChild(b);
    }
  }

  function empty() {
    box.replaceChildren();
    const d = document.createElement("div");
    d.className = "ord-empty";
    d.innerHTML =
      "<h2>You don't have any orders yet!</h2>" +
      "<span>Explore our best-selling cookies and place your first order.</span>";
    const a = document.createElement("a");
    a.href = "products.html#bestSellingTitle";
    a.className = "ord-btn";
    a.textContent = "View Our Best-Selling Cookies";
    d.appendChild(a);
    box.appendChild(d);
  }

  function card(o) {
    const div = document.createElement("div");
    div.className = "ord-card";
    div.id = `order-${o.order_id}`;

    const top = document.createElement("div");
    top.className = "ord-top";
    const id = document.createElement("strong");
    id.textContent = `Order #${o.order_id}`;
    const st = document.createElement("span");
    st.className = `ord-status st-${o.status}`;
    st.textContent = o.status === "Ready" ? "Ready for Pickup" : o.status;
    top.append(id, st);

    const info = document.createElement("div");
    info.className = "ord-info";
    info.textContent =
      `Ordered: ${String(o.order_date).slice(0, 16)}  |  ` +
      `Pickup: ${o.pickup_date} at ${fmtTime(o.pickup_time)}`;

    const list = document.createElement("ul");
    list.className = "ord-items";
    o.items.forEach((i) => {
      const li = document.createElement("li");
      const l = document.createElement("span");
      l.textContent = `${i.product_name} × ${i.quantity}`;
      const r = document.createElement("span");
      r.textContent = peso(i.subtotal);
      li.append(l, r);
      list.appendChild(li);
    });

    const total = document.createElement("div");
    total.className = "ord-total";
    total.textContent = `Total: ${peso(o.total_amount)}`;

    div.append(top, info, list, total);

    if (o.status === "Cancelled") {
      const c = document.createElement("div");
      c.className = "ord-cancel-note";
      c.textContent = "This order was cancelled." +
        (o.cancel_reason ? ` Reason: ${o.cancel_reason}.` : "") +
        " Please contact the seller for clarification.";
      div.appendChild(c);
    }
    return div;
  }

  async function load() {
    note("Loading your orders...");
    const { ok, data } = await Auth.api("/api/my-orders");
    if (!ok) return note(data.error || "Could not load your orders.", true);
    if (data.length === 0) return empty();
    box.replaceChildren(...data.map(card));

    // Coming from a notification: jump to that order
    const target = location.hash.startsWith("#order-") ? document.getElementById(location.hash.slice(1)) : null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ord-highlight");
      setTimeout(() => target.classList.remove("ord-highlight"), 2500);
    }
  }

  load();
})();