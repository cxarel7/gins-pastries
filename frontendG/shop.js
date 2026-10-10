(function () {
  if (!Auth.user()) return;
  const LOW_STOCK = 5;

  const bestBox = document.getElementById("bestSelling");
  const allBox = document.getElementById("allCookies");

  function note(box, text, withRetry) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.className = "shop-note";
    p.textContent = text;
    box.appendChild(p);
    if (withRetry) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "shop-retry";
      b.textContent = "Try again";
      b.addEventListener("click", load);
      box.appendChild(b);
    }
  }

  function stockInfo(n) {
    if (n === 0) return { cls: "out", text: "Out of stock" };
    if (n <= LOW_STOCK) return { cls: "low", text: `Only ${n} left` };
    return { cls: "ok", text: "In stock" };
  }

  function card(p, i) {
    const div = document.createElement("div");
    div.className = "koki1" + (p.stock_quantity === 0 ? " is-out" : "");

    const img = document.createElement("img");
    img.alt = p.product_name;
    // Built-in cookie picture, so nothing breaks when there's no photo file
    const FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>" +
      "<circle cx='100' cy='100' r='80' fill='#d9a05b'/>" +
      "<circle cx='70' cy='80' r='9' fill='#5a3418'/><circle cx='120' cy='70' r='8' fill='#5a3418'/>" +
      "<circle cx='135' cy='115' r='10' fill='#5a3418'/><circle cx='85' cy='128' r='8' fill='#5a3418'/>" +
      "<circle cx='105' cy='98' r='7' fill='#5a3418'/></svg>");
    img.src = p.image || FALLBACK;
    img.onerror = () => { img.onerror = null; img.src = FALLBACK; };
    const name = document.createElement("h4");
    name.textContent = p.product_name;

    const desc = document.createElement("p");
    desc.textContent = p.description || "Freshly baked cookie.";

    const price = document.createElement("h4");
    price.textContent = `₱${Number(p.price).toFixed(2).replace(/\.00$/, "")}`;

    const s = stockInfo(p.stock_quantity);
    const tag = document.createElement("span");
    tag.className = `stock-tag stock-${s.cls}`;
    tag.textContent = s.text;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = p.stock_quantity === 0 ? "Out of stock" : "Add to cart";
    btn.disabled = p.stock_quantity === 0;
    btn.addEventListener("click", () => {
      const r = Cart.add(p);
      if (r.ok) {
        Toast.success(r.updated ? "Cookie quantity updated in your cart!" : "Cookie added to cart successfully!");
      } else if (r.reason === "max") {
        Toast.warning(`Only ${p.stock_quantity} ${p.product_name} available. You already have them all in your cart.`);
      } else {
        Toast.error("This cookie is currently unavailable.");
      }
    });

    div.append(img, name, desc, price, tag, btn);
    return div;
  }

  function render(box, list) {
    box.replaceChildren(...list.map(card));
  }

  async function load() {
    note(bestBox, "Loading cookies...");
    note(allBox, "Loading cookies...");

    const [all, best] = await Promise.all([
      Auth.api("/api/products"),
      Auth.api("/api/products/best-selling")
    ]);

    if (!all.ok) {
      note(allBox, all.data.error || "Could not load the cookies.", true);
    } else if (all.data.length === 0) {
      note(allBox, "No cookies are available right now. Please check back soon!");
    } else {
      render(allBox, all.data);
    }

    if (!best.ok) {
      note(bestBox, "Best sellers could not be loaded.");
    } else if (best.data.length === 0) {
      note(bestBox, "Best sellers will show up here once cookies have been ordered and picked up.");
    } else {
      render(bestBox, best.data);
    }
  }

  load();
})();