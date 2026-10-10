const Toast = {
  show(type, text, ms) {
    let box = document.getElementById("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    // Prevent duplicates: same message already on screen
    for (const t of box.children) if (t.dataset.key === type + text) return;

    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.dataset.key = type + text;
    el.setAttribute("role", type === "error" ? "alert" : "status");

    const span = document.createElement("span");
    span.textContent = text;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Dismiss");

    const remove = () => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 250);
    };
    x.addEventListener("click", remove);
    el.append(span, x);
    box.appendChild(el);

    // Errors stay until dismissed. Others disappear on their own.
    if (type !== "error") setTimeout(remove, ms || 2800);
  },
  success(t) { Toast.show("success", t); },
  error(t)   { Toast.show("error", t); },
  warning(t) { Toast.show("warning", t, 4000); },
  info(t)    { Toast.show("info", t); }
};