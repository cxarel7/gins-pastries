(function () {
  if (!Auth.user()) return;
  const box = document.getElementById("newestCookies");
  if (!box) return;

  function note(text, retry) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.className = "gp-note";
    p.textContent = text;
    box.appendChild(p);
    if (retry) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gp-add";
      b.textContent = "TRY AGAIN";
      b.addEventListener("click", load);
      box.appendChild(b);
    }
  }

  async function load() {
    note("Loading cookies...");
    const { ok, data } = await Auth.api("/api/products");
    if (!ok) return note(data.error || "Could not load the cookies.", true);
    if (data.length === 0) return note("No cookies yet. Please check back soon!");

    const newest = [...data]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.product_id - a.product_id)
      .slice(0, 3);
    box.replaceChildren(...newest.map((p) => CookieCard.build(p, false)));
  }

  load();
})();