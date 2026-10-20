(function () {
  const user = Auth.require("admin");
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const peso = (n) => "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(str) {
    const [y, m, d] = String(str || "").slice(0, 10).split("-").map(Number);
    return y ? `${MONTHS[m - 1]} ${d}, ${y}` : "";
  }
  function fmtTime(t) {
    const [h, m] = String(t).split(":");
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  }

  // ---------- State ----------
  let search = "";
  let sort = "newest";
  let page = 1;
  let seq = 0; // ignores out-of-date responses

  // ---------- Details pop-up ----------
  const overlay = el("div", "pf-overlay");
  overlay.innerHTML = `
    <div class="pf-box cs-box" role="dialog" aria-modal="true" aria-labelledby="csDName">
      <button type="button" class="pf-close" id="csClose" aria-label="Close">✕</button>
      <div class="cs-detail" id="csDetail"></div>
    </div>`;
  document.body.appendChild(overlay);
  function closeDetail() { overlay.classList.remove("open"); }
  $("csClose").addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  function row(label, value) {
    const wrap = el("div", "cs-row");
    wrap.append(el("span", "cs-key", label), el("span", "cs-val", value));
    return wrap;
  }

  function stat(label, value) {
    const s = el("div", "cs-stat");
    s.append(el("b", "", String(value)), el("span", "", label));
    return s;
  }

  async function openDetail(id) {
    overlay.classList.add("open");
    $("csDetail").replaceChildren(el("div", "ad-empty", "Loading..."));
    const { ok, data } = await Auth.api(`/api/admin/customers/${id}`);
    if (!ok) return $("csDetail").replaceChildren(el("div", "ad-empty", data.error || "Could not load this customer."));

    const c = data.customer;
    const s = data.stats || { order_count: data.orders.length, completed: 0, total_spent: 0 };
    const box = $("csDetail");

    // Header and contact details
    const head = el("div", "cs-head");
    const name = el("div", "cs-name", c.name);
    name.id = "csDName";
    head.appendChild(name);
    head.appendChild(row("Email", c.email));
    head.appendChild(row("Mobile", c.contact || "Not provided"));
    if (c.facebook) head.appendChild(row("Facebook", c.facebook));
    head.appendChild(row("Registered", fmtDate(c.created_at)));

    // Numbers
    const stats = el("div", "cs-stats");
    stats.append(stat("Orders", s.order_count), stat("Completed", s.completed), stat("Total spent", peso(s.total_spent)));

    // Scrollable order history
    const title = el("h4", "cs-sub", `Order history (${s.order_count})`);
    const history = el("div", "cs-history");
    history.tabIndex = 0;
    history.setAttribute("aria-label", "Order history, scrollable");

    if (data.orders.length === 0) {
      history.appendChild(el("div", "cs-none", "This customer has not placed any orders yet."));
    } else {
      data.orders.forEach((o) => {
        const card = el("div", "cs-order");
        const top = el("div", "cs-order-top");
        top.append(
          el("strong", "", `Order #${o.order_id}`),
          el("span", `ord-status st-${o.status}`, o.status === "Ready" ? "Ready for Pickup" : o.status)
        );
        const items = o.items.map((i) => `${i.product_name} × ${i.quantity}`).join(", ");
        card.append(
          top,
          el("div", "cs-order-line", items),
          el("div", "cs-order-line cs-muted", `Pickup ${o.pickup_date} at ${fmtTime(o.pickup_time)}  |  ${peso(o.total_amount)}`)
        );
        history.appendChild(card);
      });
      if (s.order_count > data.orders.length) {
        history.appendChild(el("div", "cs-none", `Showing the latest ${data.orders.length} of ${s.order_count} orders.`));
      }
    }

    box.replaceChildren(head, stats, title, history);
  }

  // ---------- Table ----------
  function render(data) {
    const box = $("csList");
    $("csSummary").textContent =
      `${data.total} customer(s)` + (search ? ` matching "${search}"` : "") +
      `  |  ${data.summary.total_customers} registered in total`;

    if (data.customers.length === 0) {
      box.replaceChildren(el("div", "ad-empty",
        search ? "No customers match your search." : "No customers have registered yet."));
      $("csPager").replaceChildren();
      return;
    }

    const table = el("table", "ck-table");
    const head = el("tr");
    ["Name", "Email", "Mobile", "Registered", "Orders", "Total spent", ""].forEach((h) => head.appendChild(el("th", "", h)));
    table.appendChild(head);

    data.customers.forEach((c) => {
      const tr = el("tr");
      const view = el("button", "ck-mini", "View");
      view.type = "button";
      view.addEventListener("click", () => openDetail(c.user_id));
      const act = el("td");
      act.appendChild(view);
      tr.append(
        el("td", "", c.name),
        el("td", "", c.email),
        el("td", "", c.contact || "-"),
        el("td", "", fmtDate(c.created_at)),
        el("td", "", String(c.order_count)),
        el("td", "", peso(c.total_spent)),
        act
      );
      table.appendChild(tr);
    });

    const scroller = el("div", "ck-scroll");
    scroller.appendChild(table);
    box.replaceChildren(scroller);

    const pager = $("csPager");
    pager.replaceChildren();
    if (data.pages > 1) {
      const prev = el("button", "ck-mini ck-mini-ghost", "Previous");
      prev.type = "button"; prev.disabled = page <= 1;
      prev.addEventListener("click", () => { page -= 1; load(); });
      const next = el("button", "ck-mini ck-mini-ghost", "Next");
      next.type = "button"; next.disabled = page >= data.pages;
      next.addEventListener("click", () => { page += 1; load(); });
      pager.append(prev, el("span", "cs-page", `Page ${page} of ${data.pages}`), next);
    }
  }

  async function load() {
    const mine = ++seq;
    $("csList").replaceChildren(el("div", "ad-empty", "Loading customers..."));
    const q = `search=${encodeURIComponent(search)}&sort=${sort}&page=${page}&limit=10`;
    const { ok, data } = await Auth.api(`/api/admin/customers?${q}`);
    if (mine !== seq) return;

    if (!ok) {
      const b = el("button", "ad-btn", "Try again");
      b.type = "button";
      b.addEventListener("click", load);
      $("csList").replaceChildren(el("div", "ad-empty", data.error || "Could not load the customers."), b);
      $("csPager").replaceChildren();
      return;
    }
    render(data);
  }

  // ---------- Controls ----------
  let timer = null;
  $("csSearch").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { search = e.target.value.trim(); page = 1; load(); }, 300);
  });
  $("csSort").addEventListener("change", (e) => { sort = e.target.value; page = 1; load(); });

  load();
})();