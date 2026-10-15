(function () {
  const user = Auth.user();
  const host = document.getElementById("siteHeader");
  if (!user || !host) return;

  const isAdmin = user.role === "admin";
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];

  const AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>" +
    "<rect width='100' height='100' fill='#510087'/>" +
    "<circle cx='50' cy='38' r='18' fill='#d1a3fd'/>" +
    "<path d='M15 95c0-22 15-35 35-35s35 13 35 35z' fill='#d1a3fd'/></svg>");

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Admin links keep data-view so admin.js can switch sections without reloading
  const LINKS = isAdmin ? [
    { text: "DASHBOARD", href: "dashboard.html#dashboard", view: "dashboard" },
    { text: "COOKIES",   href: "dashboard.html#cookies",   view: "cookies" },
    { text: "ORDERS",    href: "dashboard.html#orders",    view: "orders" },
    { text: "CUSTOMERS", href: "customers.html",           page: "customers.html" }
  ] : [
    { text: "HOME",    href: "customerpage.html", page: "customerpage.html" },
    { text: "PRODUCT", href: "products.html",     page: "products.html" },
    { text: "CART",    href: "cart.html",         page: "cart.html", cart: true }
  ];

  // ---------- Header ----------
  const burger = el("button", "sh-burger");
  burger.type = "button";
  burger.id = "menuBtn";
  burger.setAttribute("aria-label", "Open menu");
  burger.setAttribute("aria-expanded", "false");
  burger.append(el("span"), el("span"), el("span"));

  const welcome = el("p", "", `Hi, ${user.first_name || user.name}!`);
  welcome.id = "welcome";
  const title = el("div", "sh-title");
  title.append(el("h1", "", "Gins Pastries"), welcome);

  const left = el("div", "sh-left");
  left.append(burger, title);

  const nav = el("nav", "sh-nav");
  nav.setAttribute("aria-label", "Main");
  const list = el("ul", "sh-pills");
  LINKS.forEach((l) => {
    const li = el("li");
    const a = el("a", "nav-link", l.text);
    a.href = l.href;
    if (l.view) a.dataset.view = l.view;
    if (l.page && l.page === page) { a.classList.add("active"); a.setAttribute("aria-current", "page"); }
    if (l.cart) { const b = el("span", "cart-badge"); b.id = "cartCount"; a.appendChild(b); }
    li.appendChild(a);
    list.appendChild(li);
  });
  nav.appendChild(list);
  if (!isAdmin) { const bell = el("div"); bell.id = "headerBell"; nav.appendChild(bell); }

  host.replaceChildren(left, nav);

  window.refreshCartBadge = function () {
    const b = document.getElementById("cartCount");
    if (!b || typeof Cart === "undefined") return;
    const n = Cart.count();
    b.textContent = n > 99 ? "99+" : String(n);
    b.style.display = n > 0 ? "inline-flex" : "none";
  };
  window.refreshCartBadge();

  // ---------- Side menu ----------
  const overlay = el("div", "dr-overlay");
  const drawer = el("aside", "dr");
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", "Menu");

  const top = el("div", "dr-top");
  const close = el("button", "dr-close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Close menu");
  top.append(close, el("span", "dr-menu", "MENU"));

  const prof = el("div", "prof");
  const avatar = el("img", "hb");
  avatar.alt = "Profile";
  avatar.src = AVATAR;
  prof.appendChild(avatar);

  const nameEl = el("div", "dr-name", user.name || `${user.first_name} ${user.last_name}`);
  const contactEl = el("div", "dr-line", isAdmin ? "Administrator" : (user.contact || ""));
  const emailEl = el("div", "dr-line", user.email || "");
  const sinceEl = el("div", "dr-line dr-muted", "");
  if (!contactEl.textContent) contactEl.style.display = "none";
  const info = el("div", "dr-info");
  info.append(nameEl, contactEl, emailEl, sinceEl);

  function pill(text, fn, cls) {
    const b = el("button", "dr-btn" + (cls ? " " + cls : ""), text);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  function openProfile(mode) {
    closeDrawer();
    if (window.openProfile) window.openProfile(mode); // profile.js opens the pop-up on that step
  }

  const actions = el("div", "dr-actions");
  if (!isAdmin) actions.appendChild(pill("EDIT PROFILE", () => openProfile("edit")));
  actions.appendChild(pill("CHANGE PASSWORD", () => openProfile("password")));
  if (!isAdmin) actions.appendChild(pill("ORDER STATUS", () => { location.href = "orders.html"; }));

  // "Are you sure?" pop-up
  const cfOverlay = el("div", "cf-overlay");
  const cfBox = el("div", "cf-box");
  cfBox.setAttribute("role", "alertdialog");
  cfBox.setAttribute("aria-modal", "true");
  cfBox.setAttribute("aria-labelledby", "cfTitle");
  const cfTitle = el("h2", "", "Are you sure?");
  cfTitle.id = "cfTitle";
  const cfText = el("p", "", "Do you want to log out of your account?");
  const cfNo = el("button", "cf-btn", "STAY");
  cfNo.type = "button";
  const cfYes = el("button", "cf-btn cf-yes", "YES, LOG OUT");
  cfYes.type = "button";
  const cfRow = el("div", "cf-row");
  cfRow.append(cfNo, cfYes);
  cfBox.append(cfTitle, cfText, cfRow);
  cfOverlay.appendChild(cfBox);
  document.body.appendChild(cfOverlay);

  function askLogout() { cfOverlay.classList.add("open"); cfNo.focus(); }
  function closeAsk() { cfOverlay.classList.remove("open"); }
  cfYes.addEventListener("click", () => Auth.logout());
  cfNo.addEventListener("click", closeAsk);
  cfOverlay.addEventListener("click", (e) => { if (e.target === cfOverlay) closeAsk(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAsk(); });

  // stopImmediatePropagation keeps the older logout listeners in other scripts from firing
  const logout = pill("LOG OUT", (e) => { e.stopImmediatePropagation(); askLogout(); }, "dr-logout");
  logout.id = "logoutBtn";

  drawer.append(top, prof, info, actions, logout);
  overlay.appendChild(drawer);
  document.body.appendChild(overlay);

  let loaded = false;
  async function loadMe() {
    if (loaded) return;
    const { ok, data } = await Auth.api("/api/me");
    if (!ok) return;
    loaded = true;
    if (data.name) nameEl.textContent = data.name;
    if (!isAdmin && data.contact) { contactEl.textContent = data.contact; contactEl.style.display = ""; }
    emailEl.textContent = data.email || "";
    const [y, m, d] = String(data.created_at || "").slice(0, 10).split("-").map(Number);
    if (y) sinceEl.textContent = `Member since ${MONTHS[m - 1]} ${d}, ${y}`;
  }

  function openDrawer() {
    overlay.classList.add("open");
    burger.setAttribute("aria-expanded", "true");
    close.focus();
    loadMe();
  }
  function closeDrawer() {
    overlay.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  }

  burger.addEventListener("click", openDrawer);
  close.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDrawer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
})();