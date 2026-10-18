(function () {
  const root = document.getElementById("album");
  if (!root) return;

  // ===== EDIT THIS: your own slides =====
  // Photos: put them in a "slides" folder inside frontendG, for example "slides/red-velvet.jpg".
  // Use JPG files about 1200 px wide and under 300 KB.
  const SLIDES = [
    { image: "coki.jpg", title: "Freshly baked, made to order", text: "Pre-order your favorite cookies and pick them up at the shop." },
    { card: true, title: "How to order", steps: [
      "Create your account",
      "Choose your cookies and pickup time",
      "Pay with GCash and enter the reference number",
      "Pick up your cookies on the day you chose"
    ] }
    // { image: "slides/red-velvet.jpg", title: "Red Velvet Cookie", text: "Soft and rich, with cream cheese chips." },
  ];
  const AUTO_MS = 5000;
  const SHOW_COOKIES_FROM_SHOP = true; // adds a slide for every cookie that has an uploaded picture

  const stage = root.querySelector(".album-stage");
  const dotsBox = root.querySelector(".album-dots");
  const prevBtn = root.querySelector(".album-prev");
  const nextBtn = root.querySelector(".album-next");
  const toggleBtn = root.querySelector(".album-toggle");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const els = [];
  const dots = [];
  let index = 0;
  let timer = null;
  let userPaused = reduced; // people who prefer less motion start paused
  let hoverPaused = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function addSlide(s) {
    const slide = el("div", "album-slide");
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");

    if (s.card) {
      slide.classList.add("is-card");
      const inner = el("div", "album-card-in");
      inner.appendChild(el("h2", "", s.title));
      const ol = el("ol");
      (s.steps || []).forEach((t) => ol.appendChild(el("li", "", t)));
      inner.appendChild(ol);
      slide.appendChild(inner);
    } else {
      const img = el("img");
      img.alt = s.title || "";
      img.draggable = false;
      img.onerror = () => { slide.classList.add("no-image"); img.remove(); };
      img.src = s.image;
      slide.appendChild(img);
      if (s.title || s.text) {
        slide.classList.add("has-caption");
        const cap = el("div", "album-caption");
        if (s.title) cap.appendChild(el("h2", "", s.title));
        if (s.text) cap.appendChild(el("p", "", s.text));
        slide.appendChild(cap);
      }
    }

    const n = els.length;
    const dot = el("button", "album-dot");
    dot.type = "button";
    dot.setAttribute("aria-label", `Show picture ${n + 1}`);
    dot.addEventListener("click", () => { show(n); restart(); });

    stage.appendChild(slide);
    dotsBox.appendChild(dot);
    els.push(slide);
    dots.push(dot);
    refreshLabels();
    show(index);
  }

  function refreshLabels() {
    els.forEach((slide, i) => slide.setAttribute("aria-label", `${i + 1} of ${els.length}`));
    const many = els.length > 1;
    prevBtn.style.display = nextBtn.style.display = dotsBox.style.display = toggleBtn.style.display = many ? "" : "none";
  }

  function show(i) {
    if (!els.length) return;
    index = (i + els.length) % els.length;
    els.forEach((slide, k) => {
      const on = k === index;
      slide.classList.toggle("active", on);
      slide.setAttribute("aria-hidden", String(!on));
      dots[k].classList.toggle("active", on);
      if (on) dots[k].setAttribute("aria-current", "true"); else dots[k].removeAttribute("aria-current");
    });
  }

  // ----- Auto-advance (pauses on hover, focus, hidden tab, or when the person pauses it) -----
  function stop() { clearInterval(timer); timer = null; }
  function start() {
    stop();
    if (userPaused || hoverPaused || document.hidden || els.length < 2) return;
    timer = setInterval(() => show(index + 1), AUTO_MS);
  }
  function restart() { start(); }

  function setToggle() {
    toggleBtn.textContent = userPaused ? "▶" : "❚❚";
    toggleBtn.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
  }

  prevBtn.addEventListener("click", () => { show(index - 1); restart(); });
  nextBtn.addEventListener("click", () => { show(index + 1); restart(); });
  toggleBtn.addEventListener("click", () => { userPaused = !userPaused; setToggle(); start(); });

  root.addEventListener("pointerenter", () => { hoverPaused = true; stop(); });
  root.addEventListener("pointerleave", () => { hoverPaused = false; start(); });
  root.addEventListener("focusin", () => { hoverPaused = true; stop(); });
  root.addEventListener("focusout", () => { hoverPaused = false; start(); });
  document.addEventListener("visibilitychange", start);

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { show(index - 1); restart(); }
    if (e.key === "ArrowRight") { show(index + 1); restart(); }
  });

  // Swipe on phones and tablets
  let startX = null;
  stage.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 45) { show(dx < 0 ? index + 1 : index - 1); restart(); }
  });

  // ----- Start -----
  SLIDES.forEach(addSlide);
  setToggle();
  start();

  // Add the shop's own cookie pictures. If the server is asleep or unreachable, the album still works.
  async function addShopCookies() {
    if (!SHOW_COOKIES_FROM_SHOP || typeof API_URL === "undefined") return;
    try {
      const res = await fetch(`${API_URL}/api/products`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const list = await res.json();
      list.filter((p) => p.image).slice(0, 5).forEach((p) => {
        const price = "₱" + Number(p.price).toFixed(2).replace(/\.00$/, "");
        const desc = p.description ? ` · ${String(p.description).slice(0, 70)}` : "";
        addSlide({ image: p.image, title: p.product_name, text: `${price}${desc}` });
      });
      start();
    } catch (e) { /* ignore: the album works without it */ }
  }
  addShopCookies();
})();