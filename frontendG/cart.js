(function () {
  if (!Auth.user()) return;

  // ===== EDIT THESE: your GCash details =====
  const GCASH_NUMBER = "0907-588-5444";
  const GCASH_QR_IMAGE = "gcash-qr.jpg"; // put your QR picture in the frontendG folder with this name

  const $ = (id) => document.getElementById(id);
  const listEl = $("cartItems");
  const totalEl = $("cartTotal");
  const dateEl = $("pickupDate");
  const timeEl = $("pickupTime");
  const btn = $("checkoutBtn");
  const msgEl = $("cartMessage");
  let busy = false;

  const peso = (n) => "₱" + Number(n).toFixed(2).replace(/\.00$/, "");
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 200 200'>" +
    "<circle cx='100' cy='100' r='80' fill='#d9a05b'/>" +
    "<circle cx='70' cy='80' r='9' fill='#5a3418'/><circle cx='120' cy='70' r='8' fill='#5a3418'/>" +
    "<circle cx='135' cy='115' r='10' fill='#5a3418'/><circle cx='85' cy='128' r='8' fill='#5a3418'/></svg>");

  function todayManila() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }
  function nowTimeManila() {
    return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  // Orders need time to prepare: the earliest pickup date is MIN_LEAD_DAYS after today
  const MIN_LEAD_DAYS = 1;
  function earliestPickup() {
    const d = new Date(`${todayManila()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + MIN_LEAD_DAYS);
    return d.toISOString().slice(0, 10);
  }
  function prettyDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  dateEl.min = earliestPickup();
  const leadNote = el("small", "ct-lead",
    `Please order at least ${MIN_LEAD_DAYS} day${MIN_LEAD_DAYS === 1 ? "" : "s"} ahead so we have time to prepare. Earliest pickup: ${prettyDate(earliestPickup())}.`);
  dateEl.insertAdjacentElement("afterend", leadNote);
  function showMsg(type, text) {
    msgEl.replaceChildren();
    if (text) msgEl.appendChild(el("div", `ct-note ct-${type}`, text));
  }

  function badge() { if (window.refreshCartBadge) window.refreshCartBadge(); }

  // ---------- Cart table ----------
  function render() {
    const items = Cart.items();
    listEl.replaceChildren();

    if (items.length === 0) {
      const d = el("div", "ct-empty", "Your cart is empty. ");
      const a = el("a", "", "Browse our cookies");
      a.href = "products.html";
      d.appendChild(a);
      listEl.appendChild(d);
      totalEl.textContent = peso(0);
      btn.disabled = true;
      return;
    }

    let total = 0;
    items.forEach((it, i) => {
      total += it.price * it.quantity;

      const row = el("div", "ct-row");
      const no = el("div", "ct-no", String(i + 1));

      const img = el("img");
      img.alt = it.name;
      img.src = it.image || FALLBACK;
      img.onerror = () => { img.onerror = null; img.src = FALLBACK; };
      const prod = el("div", "ct-prod");
      prod.append(img, el("div", "ct-name", it.name));

      const unit = el("div", "ct-price", peso(it.price));

      const plus = el("button", "", "+");
      plus.type = "button";
      plus.setAttribute("aria-label", `Add one ${it.name}`);
      plus.addEventListener("click", () => change(it.product_id, +1));
      const minus = el("button", "", "−");
      minus.type = "button";
      minus.setAttribute("aria-label", `Remove one ${it.name}`);
      minus.addEventListener("click", () => change(it.product_id, -1));
      const qty = el("div", "ct-qty");
      qty.append(plus, el("span", "", String(it.quantity)), minus);

      const sub = el("div", "ct-price", peso(it.price * it.quantity));

      const rm = el("button", "ct-remove", "REMOVE");
      rm.type = "button";
      rm.addEventListener("click", () => remove(it.product_id));

      row.append(no, prod, unit, qty, sub, rm);
      listEl.appendChild(row);
    });

    totalEl.textContent = peso(total);
    btn.disabled = busy;
  }

  function change(id, delta) {
    const items = Cart.items();
    const it = items.find((x) => x.product_id === id);
    if (!it) return;
    const next = it.quantity + delta;
    if (next < 1) return remove(id);
    if (next > it.max) return Toast.warning(`Only ${it.max} ${it.name} available.`);
    it.quantity = next;
    Cart.save(items);
    render(); badge();
    Toast.success("Cart updated successfully!");
  }

  function remove(id) {
    Cart.save(Cart.items().filter((x) => x.product_id !== id));
    render(); badge();
    Toast.info("Item removed from your cart.");
  }

  // ---------- GCash payment pop-up ----------
  const overlay = el("div", "gcash-overlay");
  overlay.innerHTML = `
    <div class="gcash-box" role="dialog" aria-modal="true" aria-labelledby="gAsk">
      <button type="button" class="g-close" id="gClose" aria-label="Close">✕</button>
      <div class="gcash-in">
        <div class="g-ask" id="gAsk">Kindly send your payment to check out your order</div>
        <div class="g-qr" id="gQr"></div>
        <div class="g-number" id="gNumber"></div>
        <div class="g-amount" id="gAmount"></div>
        <div class="g-label">REFERENCE NUMBER</div>
        <input class="g-input" id="gRef" inputmode="numeric" maxlength="13" placeholder="10-13 Digits......" autocomplete="off">
        <button type="button" class="g-submit" id="gSubmit">Submit</button>
        <div id="gError" role="alert" aria-live="polite"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const qrBox = $("gQr");
  const qrImg = el("img");
  qrImg.alt = "GCash QR code";
  qrImg.onerror = () => { qrBox.replaceChildren(document.createTextNode("PICTURE OF QR GCASH")); };
  qrImg.src = GCASH_QR_IMAGE;
  qrBox.appendChild(qrImg);
  $("gNumber").textContent = GCASH_NUMBER;

  function gError(text) {
    $("gError").replaceChildren();
    if (text) $("gError").appendChild(el("div", "g-error", text));
  }

  function openPayment() {
    const total = Cart.items().reduce((s, i) => s + i.price * i.quantity, 0);
    $("gAmount").textContent = `Amount to pay: ${peso(total)}`;
    $("gRef").value = "";
    gError("");
    overlay.classList.add("open");
    $("gRef").focus();
  }
  function closePayment() { overlay.classList.remove("open"); }

  $("gClose").addEventListener("click", closePayment);
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !busy) closePayment(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy) closePayment(); });
  $("gRef").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
  $("gRef").addEventListener("keydown", (e) => { if (e.key === "Enter") submitOrder(); });
  $("gSubmit").addEventListener("click", submitOrder);

  async function submitOrder() {
    if (busy) return;
    const ref = $("gRef").value.trim();
    if (!/^\d{10,13}$/.test(ref)) {
      return gError("Please enter the 10 to 13 digit reference number from your GCash receipt.");
    }
    const items = Cart.items();
    if (items.length === 0) { closePayment(); return render(); }

    busy = true;
    btn.disabled = true;
    $("gSubmit").disabled = true;
    $("gSubmit").textContent = "Submitting...";
    gError("");

    const { ok, data } = await Auth.api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        pickup_date: dateEl.value,
        pickup_time: timeEl.value,
        payment_reference: ref,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))
      })
    });

    busy = false;
    $("gSubmit").disabled = false;
    $("gSubmit").textContent = "Submit";

    if (!ok) {
      // The cart is kept so nothing is lost
      btn.disabled = false;
      return gError(data.error || "Unable to complete your order. Please try again.");
    }

    // Only now is it safe to clear the cart
    Cart.save([]);
    closePayment();
    dateEl.value = "";
    timeEl.value = "";
    render(); badge();
    showMsg("success", `Order placed! Your order ID is #${data.order.order_id}. The shop will confirm your payment.`);
    Toast.success(`Order #${data.order.order_id} placed successfully!`);
  }

  // ---------- Checkout button ----------
  btn.addEventListener("click", () => {
    if (busy) return;
    showMsg("", "");
    if (Cart.items().length === 0) return Toast.warning("Your cart is empty.");
    if (!dateEl.value || !timeEl.value) {
      return showMsg("error", "Please select a valid pickup date and time.");
    }
    if (dateEl.value < todayManila() || (dateEl.value === todayManila() && timeEl.value <= nowTimeManila())) {
      return showMsg("error", "Pickup date and time must be in the future.");
    }
    openPayment();
  });

  render();
  badge();
})();