(function () {
  if (!Auth.user()) return;
  const bestBox = document.getElementById("bestSelling");
  const allBox = document.getElementById("allCookies");
  if (!bestBox || !allBox) return;

  function note(box, text, withRetry) {
    box.replaceChildren();
    const p = document.createElement("p");
    p.className = "gp-note";
    p.textContent = text;
    box.appendChild(p);
    if (withRetry) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gp-add";
      b.textContent = "TRY AGAIN";
      b.addEventListener("click", load);
      box.appendChild(b);
    }
  }

  function render(box, list, withId) {
    box.replaceChildren(...list.map((p) => CookieCard.build(p, withId)));
  }

  // Coming from a "new cookie" notification: scroll to that cookie
  function highlightFromHash() {
    if (!location.hash.startsWith("#cookie-")) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("gp-highlight");
    setTimeout(() => target.classList.remove("gp-highlight"), 2800);
  }

  async function load() {
    note(bestBox, "Loading cookies...");
    note(allBox, "Loading cookies...");

    const [all, best] = await Promise.all([
      Auth.api("/api/products"),
      Auth.api("/api/products/best-selling")
    ]);

    if (!all.ok) {
      note(allBox, all.data.error || "Could not load the cookies.", true);
    } else if (all.data.length === 0) {
      note(allBox, "No cookies are available right now. Please check back soon!");
    } else {
      render(allBox, all.data, true);
    }

    if (!best.ok) {
      note(bestBox, "Best sellers could not be loaded.");
    } else if (best.data.length === 0) {
      note(bestBox, "Best sellers will show up here once cookies have been ordered and picked up.");
    } else {
      render(bestBox, best.data, false);
    }

    highlightFromHash();
  }

  window.addEventListener("hashchange", highlightFromHash);
  load();
})();