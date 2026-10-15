(function () {
  const user = Auth.user();
  if (!user || user.role !== "admin") return;
  const box = document.getElementById("adCustStrip");
  if (!box) return;

  function card(label, value) {
    const c = document.createElement("div");
    c.className = "ad-card";
    const l = document.createElement("div");
    l.className = "ad-card-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "ad-card-value";
    v.textContent = String(value);
    c.append(l, v);
    return c;
  }

  async function load() {
    const { ok, data } = await Auth.api("/api/admin/customers?limit=1");
    if (!ok) {
      const m = document.createElement("div");
      m.className = "ad-empty";
      m.textContent = "Could not load the customer overview.";
      box.replaceChildren(m);
      return;
    }
    const s = data.summary;
    box.replaceChildren(
      card("Registered Customers", s.total_customers),
      card("New This Month", s.new_this_month),
      card("Customers With Orders", s.with_orders)
    );
  }
  load();
})();