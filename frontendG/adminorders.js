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

  // The one button that moves an order forward
  const NEXT = {
    Pending:   ["Confirmed", "Confirm order"],
    Confirmed: ["Preparing", "Start preparing"],
    Preparing: ["Ready", "Mark ready for pickup"],
    Ready:     ["Completed", "Mark completed"]
  };

  let filter = "";
  let busy = false;

  function fmtTime(t) {
    const [h, m] = String(t).split(":");
    const hour = Number(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  }

  async function setStatus(o, status) {
    if (busy) return;

    let reason;
    if (status === "Cancelled") {
      reason = prompt(`Why are you cancelling order #${o.order_id}?\nThe customer will see this reason. The cookies go back into stock.`);
      if (reason === null) return;                 // admin pressed Cancel
      reason = reason.trim();
      if (reason.length < 3) return Toast.warning("Please type a reason for cancelling (at least 3 characters).");
      if (reason.length > 120) return Toast.warning("Please keep the reason under 120 characters.");
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
      el("span", "", ` | ${o.customer_email}`)
    );

    const info = el("div", "ord-info",
      `Ordered: ${String(o.order_date).slice(0, 16)}  |  Pickup: ${o.pickup_date} at ${fmtTime(o.pickup_time)}`);

    const list = el("ul", "ord-items");
    o.items.forEach((i) => {
      const li = el("li");
      li.append(el("span", "", `${i.product_name} × ${i.quantity}`), el("span", "", peso(i.subtotal)));
      list.appendChild(li);
    });

    const total = el("div", "ord-total", `Total: ${peso(o.total_amount)}`);

    div.append(top, who, info, list, total);

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

  async function load() {
    $("orList").replaceChildren(el("div", "ad-empty", "Loading orders..."));
    const q = filter ? `?status=${filter}` : "";
    const { ok, data } = await Auth.api(`/api/orders${q}`);

    if (!ok) {
      const b = el("button", "ad-btn", "Try again");
      b.type = "button";
      b.addEventListener("click", load);
      $("orList").replaceChildren(el("div", "ad-empty", data.error || "Could not load the orders."), b);
      return;
    }

    $("orSummary").textContent = `${data.length} order(s) shown`;
    if (data.length === 0) {
      $("orList").replaceChildren(el("div", "ad-empty", "No orders here yet."));
      return;
    }
    $("orList").replaceChildren(...data.map(card));
  }

  $("orTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]");
    if (!b) return;
    filter = b.dataset.filter;
    document.querySelectorAll("#orTabs button").forEach((x) => x.classList.toggle("active", x === b));
    load();
  });

  function maybeLoad() { if (location.hash === "#orders") load(); }
  window.addEventListener("hashchange", maybeLoad);
  maybeLoad();
})();