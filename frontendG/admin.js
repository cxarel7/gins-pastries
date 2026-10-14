(function () {
  const user = Auth.require("admin");
  if (!user) return;

  // ---------- Views (no page reload) ----------
  const VIEWS = ["dashboard", "cookies", "orders"];
  function showView(name) {
    if (!VIEWS.includes(name)) name = "dashboard";
    document.querySelectorAll(".ad-view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    document.querySelectorAll(".nav-link[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === name));
  }
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
  showView(location.hash.slice(1));

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const peso = (n) => "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function note(box, text, retry) {
    box.replaceChildren(el("div", "ad-empty", text));
    if (retry) {
      const b = el("button", "ad-btn", "Try again");
      b.type = "button";
      b.addEventListener("click", load);
      box.appendChild(b);
    }
  }

  // ---------- Filter ----------
  const rangeSel = $("adRange"), groupSel = $("adGroup"), fromEl = $("adFrom"), toEl = $("adTo");
  const AUTO_GROUP = { today: "daily", week: "daily", month: "daily", year: "monthly", custom: "daily" };

  rangeSel.addEventListener("change", () => {
    const custom = rangeSel.value === "custom";
    document.querySelectorAll(".ad-custom").forEach((x) => x.classList.toggle("hidden-ad", !custom));
    groupSel.value = AUTO_GROUP[rangeSel.value];
    if (!custom) load();
  });
  groupSel.addEventListener("change", load);
  $("adApply").addEventListener("click", load);

  function buildQuery() {
    const r = rangeSel.value;
    if (r !== "custom") return `range=${r}`;
    if (!fromEl.value || !toEl.value) { Toast.warning("Please choose both a start and an end date."); return null; }
    if (fromEl.value > toEl.value) { Toast.error("The start date cannot be after the end date."); return null; }
    return `range=custom&from=${fromEl.value}&to=${toEl.value}`;
  }

  // ---------- Renderers ----------
  const STOCK_LOW = "dashboard.html?filter=low#cookies";
  const STOCK_OUT = "dashboard.html?filter=out#cookies";
  const STOCK_ALL = "dashboard.html?filter=alerts#cookies";

  function renderCards(d) {
    // [label, value, extra class, link (optional)]
    const makeCard = ([label, value, cls, href]) => {
      const c = el(href ? "a" : "div", "ad-card " + cls + (href ? " ad-card-link" : ""));
      if (href) { c.href = href; c.title = "Open the stock page"; }
      c.append(el("div", "ad-card-label", label), el("div", "ad-card-value", String(value)));
      return c;
    };

    $("adCardsBig").replaceChildren(...[
      ["Total Sales", peso(d.total_sales), ""],
      ["Total Orders", d.total_orders, ""],
      ["Pending Orders", d.pending_orders, d.pending_orders > 0 ? "warn" : ""]
    ].map(makeCard));

    $("adCardsSmall").replaceChildren(...[
      ["Cookies Sold", d.cookies_sold, ""],
      ["Completed Orders", d.completed_orders, ""],
      ["Low Stock", d.low_stock, d.low_stock > 0 ? "warn" : "", STOCK_LOW],
      ["Out of Stock", d.out_of_stock, d.out_of_stock > 0 ? "danger" : "", STOCK_OUT]
    ].map(makeCard));

    $("adRangeNote").textContent =
      `Showing ${d.from} to ${d.to}. Pending orders, low stock, and out of stock always show the situation right now.`;
  }

  function renderTop(list) {
    const box = $("adTop");
    if (list.length === 0) return note(box, "No completed sales in this period yet.");
    const max = Math.max(...list.map((p) => p.total_sold));
    box.replaceChildren(...list.map((p, i) => {
      const row = el("div", "ad-top-row");
      const head = el("div", "ad-top-head");
      head.append(el("span", "ad-rank", `${i + 1}.`), el("span", "ad-top-name", p.product_name),
                  el("span", "ad-top-sold", `${p.total_sold} sold`));
      const bar = el("div", "ad-top-bar");
      const fill = el("div", "ad-top-fill");
      fill.style.width = `${Math.max(4, (p.total_sold / max) * 100)}%`;
      bar.appendChild(fill);
      row.append(head, bar, el("div", "ad-top-rev", `Revenue: ${peso(p.revenue)}`));
      return row;
    }));
  }

  function stockList(title, items, fmt, cls, href) {
    const wrap = el("div", "ad-stock-group");
    const t = el("a", "ad-stock-title " + cls, `${title} (${items.length})`);
    t.href = href;
    wrap.appendChild(t);
    if (items.length === 0) wrap.appendChild(el("div", "ad-muted", "None. All good!"));
    items.forEach((p) => wrap.appendChild(el("div", "ad-stock-item", fmt(p))));
    return wrap;
  }

  function renderStock(lowRes, outRes) {
    const box = $("adStock");
    if (!lowRes.ok || !outRes.ok) return note(box, "Could not load the stock alerts.");
    const low = lowRes.data.products;
    const out = outRes.data.products;
    const need = low.length + out.length;

    const link = el("a", "ad-btn ad-link-btn", need > 0 ? `Open stock page (${need} need attention)` : "Open stock page");
    link.href = STOCK_ALL;

    box.replaceChildren(
      stockList("Low stock", low, (p) => `${p.product_name}: ${p.stock_quantity} left`, "low", STOCK_LOW),
      stockList("Out of stock", out, (p) => p.product_name, "out", STOCK_OUT),
      link
    );
  }

  function label(period, group) {
    const s = String(period);
    if (group === "daily") return s.slice(5);
    if (group === "weekly") return "wk " + s.slice(5);
    return s;
  }

  function renderChart(data, group) {
    const box = $("adChart");
    if (data.length === 0) return note(box, "No completed sales in this period yet.");
    const max = Math.max(...data.map((d) => d.sales));
    const chart = el("div", "ad-chart");
    data.forEach((d) => {
      const col = el("div", "ad-col");
      col.title = `${d.period}: ${peso(d.sales)} from ${d.orders} order(s)`;
      const val = el("div", "ad-col-val", peso(d.sales));
      const track = el("div", "ad-col-track");
      const bar = el("div", "ad-col-bar");
      bar.style.height = `${Math.max(3, (d.sales / max) * 100)}%`;
      track.appendChild(bar);
      col.append(val, track, el("div", "ad-col-label", label(d.period, group)));
      chart.appendChild(col);
    });
    box.replaceChildren(chart);
  }

  // ---------- Load everything ----------
  let loading = false;
  async function load() {
    const q = buildQuery();
    if (!q || loading) return;
    loading = true;
    $("adApply").disabled = true;
    ["adTop", "adStock", "adChart"].forEach((id) => $(id).replaceChildren(el("div", "ad-empty", "Loading...")));

    const [dash, top, trend, low, out] = await Promise.all([
      Auth.api(`/api/admin/dashboard?${q}`),
      Auth.api(`/api/admin/products/top-selling?${q}&limit=5`),
      Auth.api(`/api/admin/sales/trends?${q}&group=${groupSel.value}`),
      Auth.api("/api/inventory?filter=low"),
      Auth.api("/api/inventory?filter=out")
    ]);

    loading = false;
    $("adApply").disabled = false;

    if (!dash.ok) {
      $("adCardsBig").replaceChildren();
      $("adCardsSmall").replaceChildren();
      $("adRangeNote").textContent = "";
      ["adTop", "adStock", "adChart"].forEach((id) => note($(id), ""));
      return note($("adTop"), dash.data.error || "Could not load the dashboard.", true);
    }
    renderCards(dash.data);

    if (top.ok) renderTop(top.data.products); else note($("adTop"), top.data.error || "Could not load top sellers.", true);
    renderStock(low, out);
    if (trend.ok) renderChart(trend.data.data, trend.data.group); else note($("adChart"), trend.data.error || "Could not load the chart.", true);
  }

  load();
})();