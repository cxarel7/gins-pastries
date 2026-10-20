(function () {
  const user = Auth.user();
  if (!user || user.role !== "admin") return;

  const $ = (id) => document.getElementById(id);
  const peso = (n) => "₱" + Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const TZ = "Asia/Manila";

  // The one button that moves an order forward
  const NEXT = {
    Pending:   ["Confirmed", "Confirm order"],
    Confirmed: ["Preparing", "Start preparing"],
    Preparing: ["Ready", "Mark ready for pickup"],
    Ready:     ["Completed", "Mark completed"]
  };

  let filter = "";
  let search = "";
  let sort = "newest";
  let page = 1;
  let busy = false;
  let seq = 0; // ignores out-of-date responses

  function fmtTime(t) {
    const [h, m] = String(t).split(":");
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  }
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  function addDays(d, n) {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  }

  // "Pickup today", "Pickup tomorrow", or "Overdue" for orders that are still active
  function pickupChip(o) {
    if (o.status === "Completed" || o.status === "Cancelled") return null;
    const t = today();
    if (o.pickup_date < t) return el("span", "or-chip or-late", "Overdue");
    if (o.pickup_date === t) return el("span", "or-chip or-today", "Pickup today");
    if (o.pickup_date === addDays(t, 1)) return el("span", "or-chip or-tomorrow", "Pickup tomorrow");
    return null;
  }

  // ---------- Questions asked before a status change ----------
  const ASK = {
    Confirmed: (o) => ({
      title: "Payment received?",
      message: "Are you sure you received the money? Check your GCash app before confirming.",
      details: [
        `Order #${o.order_id}  |  ${o.customer_name}`,
        `GCash reference: ${o.payment_reference || "none"}`,
        `Amount to receive: ${peso(o.total_amount)}`
      ],
      yes: "Yes, I received it", no: "Not yet"
    }),
    Ready: (o) => ({
      title: "Mark as ready?",
      message: "Are you sure? The customer is notified right away that the cookies are ready for pickup.",
      details: [`Order #${o.order_id}  |  ${o.customer_name}`, `Pickup: ${o.pickup_date} at ${fmtTime(o.pickup_time)}`],
      yes: "Yes, it's ready", no: "Not yet"
    }),
    Completed: (o) => ({
      title: "Mark as completed?",
      message: "Are you sure the customer already picked up the order? Completed orders count as sales and can't be changed.",
      details: [`Order #${o.order_id}  |  ${o.customer_name}`, `Total: ${peso(o.total_amount)}`],
      yes: "Yes, completed", no: "Not yet"
    })
  };

  async function setStatus(o, status) {
    if (busy) return;

    let reason;
    if (status === "Cancelled") {
      const r = await Confirm.ask({
        title: `Cancel order #${o.order_id}?`,
        message: "The cookies go back into stock and the customer is notified. The customer will see the reason you type.",
        input: { label: "Reason for cancelling", min: 3, max: 120 },
        yes: "Cancel order", no: "Keep order", danger: true
      });
      if (!r) return;
      reason = r.value;
    } else if (ASK[status]) {
      const r = await Confirm.ask(ASK[status](o));
      if (!r) return;
    }

    busy = true;
    document.querySelectorAll("#orList button").forEach((b) => { b.disabled = true; });

    const { ok, data } = await Auth.api(`/api/orders/${o.order_id}/status`, {
      method: "PUT", body: JSON.stringify({ status, reason })
    });
    busy = false;

    if (!ok) {
      Toast.error(data.error || "Could not update the order. Please try again.");
    } else {
      Toast.success(`Order #${o.order_id} is now ${status === "Ready" ? "Ready for Pickup" : status}.`);
    }
    load();
  }

  function card(o) {
    const div = el("div", "ord-card");

    const top = el("div", "ord-top");
    top.append(
      el("strong", "", `Order #${o.order_id}`),
      el("span", `ord-status st-${o.status}`, o.status === "Ready" ? "Ready for Pickup" : o.status)
    );

    const who = el("div", "ad-who");
    who.append(
      el("strong", "", o.customer_name),
      el("span", "", o.customer_contact ? ` | ${o.customer_contact}` : " | no contact on file"),
      el("span", "", o.customer_facebook ? ` | FB: ${o.customer_facebook}` : ""),
      el("span", "", ` | ${o.customer_email}`)
    );

    const info = el("div", "ord-info",
      `Ordered: ${String(o.order_date).slice(0, 16)}  |  Pickup: ${o.pickup_date} at ${fmtTime(o.pickup_time)}`);
    const chip = pickupChip(o);
    if (chip) info.appendChild(chip);

    div.append(top, who, info);
    if (o.payment_reference) div.appendChild(el("div", "ord-info", `GCash reference: ${o.payment_reference}`));

    const list = el("ul", "ord-items");
    o.items.forEach((i) => {
      const li = el("li");
      li.append(el("span", "", `${i.product_name} × ${i.quantity}`), el("span", "", peso(i.subtotal)));
      list.appendChild(li);
    });
    div.append(list, el("div", "ord-total", `Total: ${peso(o.total_amount)}`));

    if (o.status === "Cancelled" && o.cancel_reason) {
      div.appendChild(el("div", "ord-cancel-note", `Cancelled. Reason: ${o.cancel_reason}`));
    }

    const next = NEXT[o.status];
    if (next) {
      const bar = el("div", "ad-order-actions");
      const go = el("button", "ad-btn", next[1]);
      go.type = "button";
      go.addEventListener("click", () => setStatus(o, next[0]));
      const cancel = el("button", "ad-btn ad-btn-danger", "Cancel order");
      cancel.type = "button";
      cancel.addEventListener("click", () => setStatus(o, "Cancelled"));
      bar.append(go, cancel);
      div.appendChild(bar);
    } else {
      div.appendChild(el("div", "ad-muted", "This order is finished. No more changes."));
    }
    return div;
  }

  function renderTabs(counts) {
    document.querySelectorAll("#orTabs button").forEach((b) => {
      if (!b.dataset.label) b.dataset.label = b.textContent;
      const key = b.dataset.filter || "all";
      b.textContent = counts ? `${b.dataset.label} (${counts[key] || 0})` : b.dataset.label;
      b.classList.toggle("active", (b.dataset.filter || "") === filter);
    });
  }

  function renderPager(data) {
    const pager = $("orPager");
    pager.replaceChildren();
    if (data.pages <= 1) return;
    const prev = el("button", "ck-mini ck-mini-ghost", "Previous");
    prev.type = "button"; prev.disabled = page <= 1;
    prev.addEventListener("click", () => { page -= 1; load(); });
    const nxt = el("button", "ck-mini ck-mini-ghost", "Next");
    nxt.type = "button"; nxt.disabled = page >= data.pages;
    nxt.addEventListener("click", () => { page += 1; load(); });
    pager.append(prev, el("span", "cs-page", `Page ${page} of ${data.pages}`), nxt);
  }

  async function load() {
    const mine = ++seq;
    $("orList").replaceChildren(el("div", "ad-empty", "Loading orders..."));

    const q = new URLSearchParams({ sort, page: String(page), search });
    if (filter) q.set("status", filter);
  const { ok, data: responseData } = await Auth.api(
  `/api/orders?${q.toString()}`
);

if (mine !== seq) return;

// Support either an array or the expected object response.
const data = Array.isArray(responseData)
  ? {
      orders: responseData.filter(order =>
        !filter || order.status === filter
      ),
      counts: responseData.reduce((counts, order) => {
        counts.all = (counts.all || 0) + 1;

        if (order.status) {
          counts[order.status] = (counts[order.status] || 0) + 1;
        }

        return counts;
      }, {}),
      total: responseData.filter(order =>
        !filter || order.status === filter
      ).length,
      page: 1,
      pages: 1
    }
  : responseData;
  
if (!ok || !data || !Array.isArray(data.orders)) {
  console.error("Invalid orders response:", responseData);

  $("orList").replaceChildren(
    el("div", "ad-empty", "Could not load orders. Please try again.")
  );
  $("orPager").replaceChildren();
  return;
}

    if (!ok) {
      const b = el("button", "ad-btn", "Try again");
      b.type = "button";
      b.addEventListener("click", load);
      $("orList").replaceChildren(el("div", "ad-empty", data.error || "Could not load the orders."), b);
      $("orPager").replaceChildren();
      return;
    }

    // The last order on this page may have moved away: go back one page
    if (data.orders.length === 0 && page > 1) { page = Math.max(1, data.pages); return load(); }

    renderTabs(data.counts);
    $("orSummary").textContent =
      `${data.total} order(s) shown` + (search ? ` matching "${search}"` : "");

    if (data.orders.length === 0) {
      $("orList").replaceChildren(el("div", "ad-empty",
        search ? "No orders match your search." : "No orders here yet."));
      $("orPager").replaceChildren();
      return;
    }
    $("orList").replaceChildren(...data.orders.map(card));
    renderPager(data);
  }

  // ---------- Controls ----------
  $("orTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]");
    if (!b) return;
    filter = b.dataset.filter;
    page = 1;
    load();
  });

  let timer = null;
  $("orSearch").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { search = e.target.value.trim(); page = 1; load(); }, 300);
  });
  $("orSort").addEventListener("change", (e) => { sort = e.target.value; page = 1; load(); });

  function maybeLoad() { if (location.hash === "#orders") load(); }
  window.addEventListener("hashchange", maybeLoad);
  maybeLoad();
})();