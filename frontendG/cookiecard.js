const CookieCard = (function () {
  const LOW_STOCK = 5;
  const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>" +
    "<circle cx='100' cy='100' r='80' fill='#d9a05b'/>" +
    "<circle cx='70' cy='80' r='9' fill='#5a3418'/><circle cx='120' cy='70' r='8' fill='#5a3418'/>" +
    "<circle cx='135' cy='115' r='10' fill='#5a3418'/><circle cx='85' cy='128' r='8' fill='#5a3418'/>" +
    "<circle cx='105' cy='98' r='7' fill='#5a3418'/></svg>");

  const peso = (n) => "₱" + Number(n).toFixed(2).replace(/\.00$/, "");

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function stockInfo(n) {
    if (n === 0) return { cls: "out", text: "Out of Stock" };
    if (n <= LOW_STOCK) return { cls: "low", text: `Only ${n} left` };
    return { cls: "", text: "In Stock" };
  }

  // withId: gives the card an id so a notification can scroll to it
  function build(p, withId) {
    const card = el("article", "gp-card" + (p.stock_quantity === 0 ? " is-out" : ""));
    if (withId) card.id = `cookie-${p.product_id}`;

    const imgBox = el("div", "gp-img");
    const img = el("img");
    img.alt = p.product_name;
    img.src = p.image || FALLBACK;
    img.onerror = () => { img.onerror = null; img.src = FALLBACK; };
    imgBox.appendChild(img);

    const s = stockInfo(p.stock_quantity);
    const btn = el("button", "gp-add", p.stock_quantity === 0 ? "OUT OF STOCK" : "ADD TO CART");
    btn.type = "button";
    btn.disabled = p.stock_quantity === 0;
    btn.addEventListener("click", () => {
      const r = Cart.add(p);
      if (r.ok) {
        Toast.success(r.updated ? "Cookie quantity updated in your cart!" : "Cookie added to cart successfully!");
        if (window.refreshCartBadge) window.refreshCartBadge();
      } else if (r.reason === "max") {
        Toast.warning(`Only ${p.stock_quantity} ${p.product_name} available. You already have them all in your cart.`);
      } else {
        Toast.error("This cookie is currently unavailable.");
      }
    });

    card.append(
      imgBox,
      el("h3", "gp-name", p.product_name),
      el("p", "gp-desc", p.description || "Freshly baked cookie."),
      el("div", "gp-price", peso(p.price)),
      el("span", `gp-badge ${s.cls}`.trim(), s.text),
      btn
    );
    return card;
  }

  return { build };
})();