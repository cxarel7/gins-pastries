(function () {
  const user = Auth.require("admin");
  if (!user) return;

  // ---------- Header ----------
  document.getElementById("welcome").textContent = `Admin: ${user.first_name || user.name}`;
  document.getElementById("logoutBtn").addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });

  const AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>" +
    "<rect width='100' height='100' fill='#510087'/>" +
    "<circle cx='50' cy='38' r='18' fill='#d1a3fd'/>" +
    "<path d='M15 95c0-22 15-35 35-35s35 13 35 35z' fill='#d1a3fd'/></svg>");
  document.querySelectorAll(".hb").forEach((img) => { img.src = AVATAR; });

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
  function renderCards(d) {
    const makeCard = ([label, value, cls]) => {
      const c = el("div", "ad-card " + cls);
      c.append(el("div", "ad-card-label", label), el("div", "ad-card-value", String(value)));
      return c;
    };

    // Big cards
    $("adCardsBig").replaceChildren(...[
      ["Total Sales", peso(d.total_sales), ""],
      ["Total Orders", d.total_orders, ""],
      ["Pending Orders", d.pending_orders, d.pending_orders > 0 ? "warn" : ""]
    ].map(makeCard));

    // Smaller cards (all the same size)
    $("adCardsSmall").replaceChildren(...[
      ["Cookies Sold", d.cookies_sold, ""],
      ["Completed Orders", d.completed_orders, ""],
      ["Low Stock", d.low_stock, d.low_stock > 0 ? "warn" : ""],
      ["Out of Stock", d.out_of_stock, d.out_of_stock > 0 ? "danger" : ""]
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

  function stockList(title, items, fmt, cls) {
    const wrap = el("div", "ad-stock-group");
    wrap.appendChild(el("div", "ad-stock-title " + cls, `${title} (${items.length})`));
    if (items.length === 0) wrap.appendChild(el("div", "ad-muted", "None. All good!"));
    items.forEach((p) => wrap.appendChild(el("div", "ad-stock-item", fmt(p))));
    return wrap;
  }

  function renderStock(lowRes, outRes) {
    const box = $("adStock");
    if (!lowRes.ok || !outRes.ok) return note(box, "Could not load the stock alerts.");
    box.replaceChildren(
      stockList("Low stock", lowRes.data.products, (p) => `${p.product_name}: ${p.stock_quantity} left`, "low"),
      stockList("Out of stock", outRes.data.products, (p) => p.product_name, "out")
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