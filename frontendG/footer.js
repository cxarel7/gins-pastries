(function () {
  const host = document.getElementById("siteFooter");
  if (!host) return;

  // ===== EDIT THIS: your shop's real details =====
  const SHOP = {
    about: [
    "Welcome to Gin's Pastries, where every bite is baked with love and a little bit of magic!",
     "Our pastries are made fresh daily with the finest ingredients and a whole lot of heart. ",

    ],
    contact: [
      "Mobile: 0907 588 5444",
      "Facebook: facebook.com/ginspastries"
    ]
  };
  const TERMS = [
    "All orders are pre-orders. An order is confirmed only after the shop confirms it.",
    "Orders are for pickup on the date and time you choose. We do not deliver.",
    "Please pick up your order on time so your cookies stay fresh.",
    "The shop may cancel an order. When that happens, the reason is shown on your Order Status page.",
    "If you have any concern about your order, please contact us using the details in the footer."
  ];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  host.className = "gp-footer";
  const grid = el("div", "gp-foot-grid");

  const colAbout = el("div");
  colAbout.append(el("h3", "", "Gin's Pastries"), ...SHOP.about.map((t) => el("p", "", t)));

  const termsBtn = el("button", "gp-terms-btn", "Terms and Conditions");
  termsBtn.type = "button";
  const colLinks = el("div");
  colLinks.append(el("h3", "", "Quick Links"), termsBtn, el("p", "", "If you have any concerns, kindly contact us."));

  const colContact = el("div");
  colContact.append(el("h3", "", "Contact Us"), ...SHOP.contact.map((t) => el("p", "", t)));

  const year = new Date().getFullYear();
  if (host.hasAttribute("data-compact")) {
    // Slim one-line footer for the login page
    host.classList.add("gp-footer-compact");
    const bar = el("div", "gp-foot-bar");
    bar.append(
      el("span", "gp-foot-copy", `© ${year} Gin's Pastries`),
      termsBtn,
      el("span", "gp-foot-contact", SHOP.contact.join("  |  "))
    );
    host.append(bar);
  } else {
    grid.append(colAbout, colLinks, colContact);
    host.append(grid, el("div", "gp-copy", `Copyright © ${year} Gin's Pastries`));
  }

  // ----- Terms pop-up -----
  const overlay = el("div", "tm-overlay");
  const box = el("div", "tm-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "tmTitle");
  const close = el("button", "tm-close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const title = el("h2", "", "Gin's Pastries");
  title.id = "tmTitle";
  title.append(document.createElement("br"), "Policies & Terms and Conditions");
  const ol = el("ol");
  TERMS.forEach((t) => ol.appendChild(el("li", "", t)));
  box.append(close, title, ol);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const open = () => overlay.classList.add("open");
  const shut = () => overlay.classList.remove("open");
  termsBtn.addEventListener("click", open);
  close.addEventListener("click", shut);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) shut(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") shut(); });
})();