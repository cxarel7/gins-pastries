const Confirm = (function () {
  let overlay, titleEl, msgEl, detailsEl, fieldEl, labelEl, inputEl, errEl, noBtn, yesBtn;
  let cfg = null;
  let resolver = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function build() {
    overlay = el("div", "cf-overlay");
    const box = el("div", "cf-box cf-wide");
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "cfTitle2");

    titleEl = el("h2");
    titleEl.id = "cfTitle2";
    msgEl = el("p");
    detailsEl = el("div", "cf-details");

    fieldEl = el("div", "cf-field");
    labelEl = el("label");
    labelEl.htmlFor = "cfInput";
    inputEl = el("input", "cf-input");
    inputEl.id = "cfInput";
    inputEl.type = "text";
    inputEl.autocomplete = "off";
    errEl = el("div", "cf-err");
    errEl.setAttribute("role", "alert");
    fieldEl.append(labelEl, inputEl, errEl);

    noBtn = el("button", "cf-btn");
    noBtn.type = "button";
    yesBtn = el("button", "cf-btn");
    yesBtn.type = "button";
    const row = el("div", "cf-row");
    row.append(noBtn, yesBtn);

    box.append(titleEl, msgEl, detailsEl, fieldEl, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    noBtn.addEventListener("click", () => finish(null));
    yesBtn.addEventListener("click", submit);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(null); });
    document.addEventListener("keydown", (e) => {
      if (!overlay.classList.contains("open")) return;
      if (e.key === "Escape") finish(null);
      if (e.key === "Enter" && e.target === inputEl) { e.preventDefault(); submit(); }
    });
  }

  function submit() {
    let value = null;
    if (cfg.input) {
      value = inputEl.value.trim();
      const min = cfg.input.min || 1;
      const max = cfg.input.max || 200;
      if (value.length < min) { errEl.textContent = `Please type at least ${min} characters.`; inputEl.focus(); return; }
      if (value.length > max) { errEl.textContent = `Please keep it under ${max} characters.`; inputEl.focus(); return; }
    }
    finish({ value });
  }

  function finish(result) {
    overlay.classList.remove("open");
    const r = resolver;
    resolver = null;
    cfg = null;
    if (r) r(result);
  }

  // Resolves to null when cancelled, or { value } when confirmed
  // (value is the typed text if an input was asked for, otherwise null).
  function ask(opts) {
    if (!overlay) build();
    if (resolver) finish(null);
    cfg = opts;

    titleEl.textContent = opts.title || "Are you sure?";
    msgEl.textContent = opts.message || "";
    msgEl.style.display = opts.message ? "" : "none";

    const lines = opts.details || [];
    detailsEl.replaceChildren(...lines.map((t) => el("div", "", t)));
    detailsEl.style.display = lines.length ? "" : "none";

    fieldEl.style.display = opts.input ? "" : "none";
    labelEl.textContent = opts.input ? opts.input.label : "";
    inputEl.value = "";
    errEl.textContent = "";

    noBtn.textContent = opts.no || "Cancel";
    noBtn.className = "cf-btn";
    yesBtn.textContent = opts.yes || "Yes";
    yesBtn.className = "cf-btn " + (opts.danger ? "cf-yes" : "cf-ok");

    return new Promise((resolve) => {
      resolver = resolve;
      overlay.classList.add("open");
      (opts.input ? inputEl : noBtn).focus();
    });
  }

  return { ask };
})();