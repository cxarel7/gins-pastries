(function () {
  const user = Auth.user();
  if (!user || user.role !== "customer") return;

  const nav = document.querySelector(".subnavi");
  const logoutLi = document.getElementById("logoutBtn")
    ? document.getElementById("logoutBtn").closest("li") : null;
  if (!nav) return;

  // ----- Build the bell -----
  const li = document.createElement("li");
  li.className = "nt-wrap";
  li.innerHTML = `
    <button type="button" class="nt-bell" id="ntBell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 22a2.5 2.5 0 0 0 2.4-1.8h-4.8A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V3a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/>
      </svg>
      <span class="nt-badge hidden-nt" id="ntBadge">0</span>
    </button>
    <div class="nt-panel" id="ntPanel" role="menu">
      <div class="nt-head">
        <strong>Notifications</strong>
        <button type="button" class="nt-readall" id="ntReadAll">Mark all as read</button>
      </div>
      <div class="nt-list" id="ntList"></div>
    </div>`;
  if (logoutLi) nav.insertBefore(li, logoutLi); else nav.appendChild(li);

  const $ = (id) => document.getElementById(id);
  let items = [];
  let unread = 0;
  let lastUnread = null;   // used to detect NEW notifications
  let open = false;

  function ago(str) {
    // Stored in Philippine time
    const t = new Date(String(str).replace(" ", "T") + "+08:00").getTime();
    if (Number.isNaN(t)) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)} day(s) ago`;
  }

  function renderBadge() {
    const b = $("ntBadge");
    b.textContent = unread > 99 ? "99+" : String(unread);
    b.classList.toggle("hidden-nt", unread === 0);
    $("ntReadAll").disabled = unread === 0;
  }

  function renderList() {
    const list = $("ntList");
    if (items.length === 0) {
      const e = document.createElement("div");
      e.className = "nt-empty";
      e.textContent = "No notifications yet. We'll tell you when your order status changes.";
      list.replaceChildren(e);
      return;
    }
    list.replaceChildren(...items.map((n) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "nt-item" + (n.is_read ? "" : " unread");
      row.setAttribute("role", "menuitem");

      const dot = document.createElement("span");
      dot.className = "nt-dot";
      const body = document.createElement("span");
      body.className = "nt-body";
      const msg = document.createElement("span");
      msg.className = "nt-msg";
      msg.textContent = n.message;
      const meta = document.createElement("span");
      meta.className = "nt-meta";
      meta.textContent = (n.order_id ? `Order #${n.order_id}  |  ` : "") + ago(n.created_at);
      body.append(msg, meta);
      row.append(dot, body);

      row.addEventListener("click", () => openNotification(n));
      return row;
    }));
  }

  async function refresh(quiet) {
    const { ok, data } = await Auth.api("/api/notifications");
    if (!ok) return;
    items = data.notifications;
    unread = data.unread;

    // A toast only when something genuinely new arrived (not on first load)
    if (!quiet && lastUnread !== null && unread > lastUnread) {
      Toast.info("You have a new notification!");
      li.classList.remove("nt-pulse"); void li.offsetWidth; li.classList.add("nt-pulse");
    }
    lastUnread = unread;
    renderBadge();
    if (open) renderList();
  }

  async function openNotification(n) {
    if (!n.is_read) {
      n.is_read = true;
      unread = Math.max(0, unread - 1);
      lastUnread = unread;
      renderBadge(); renderList();
      Auth.api(`/api/notifications/${n.notification_id}/read`, { method: "PUT" });
    }
    if (n.order_id) location.href = `orders.html#order-${n.order_id}`;
    else setOpen(false);
  }

  $("ntReadAll").addEventListener("click", async () => {
    items.forEach((n) => { n.is_read = true; });
    unread = 0; lastUnread = 0;
    renderBadge(); renderList();
    const { ok } = await Auth.api("/api/notifications/read-all", { method: "PUT" });
    if (!ok) { Toast.error("Could not update your notifications. Please try again."); refresh(true); }
  });

  function setOpen(v) {
    open = v;
    $("ntPanel").classList.toggle("open", v);
    $("ntBell").setAttribute("aria-expanded", String(v));
    if (v) { renderList(); refresh(true); }
  }

  $("ntBell").addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });
  document.addEventListener("click", (e) => { if (open && !li.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });

  // ----- Checking for new notifications -----
  let timer = null;
  function start() { if (!timer) timer = setInterval(() => refresh(false), 30000); }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else { refresh(false); start(); }
  });

  refresh(true);
  start();
})();