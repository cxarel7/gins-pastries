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

  const VALID = ["all", "alerts", "low", "out", "archived"];
  const EMPTY = {
    all: "No cookies yet. Add your first cookie.",
    alerts: "No stock alerts. Every active cookie has enough stock.",
    low: "No cookies are running low.",
    out: "No cookies are out of stock.",
    archived: "No archived cookies."
  };

  let filter = "all";
  let search = "";
  let busy = false;
  let seq = 0; // ignores out-of-date responses

  function syncTabs() {
    document.querySelectorAll("#ckTabs button").forEach((x) => x.classList.toggle("active", x.dataset.filter === filter));
  }

  // Dashboard links open this page as dashboard.html?filter=low#cookies
  function applyUrlFilter() {
    const f = new URLSearchParams(location.search).get("filter");
    if (f && VALID.includes(f) && f !== filter) { filter = f; syncTabs(); }
  }

  // ---------- Add / Edit pop-up ----------
  const overlay = el("div", "pf-overlay");
  overlay.innerHTML = `
    <div class="pf-box" role="dialog" aria-modal="true" aria-labelledby="ckFormTitle">
      <button type="button" class="pf-close" id="ckClose" aria-label="Close">✕</button>
      <div class="pf-title" id="ckFormTitle">Add cookie</div>
      <div class="pf-row"><span>Cookie name</span><input id="ckName" maxlength="100"></div>
      <div class="pf-row"><span>Description</span><textarea id="ckDesc" rows="3"></textarea></div>
      <div class="pf-row"><span>Price (₱)</span><input id="ckPrice" type="number" min="1" step="0.01"></div>
      <div class="pf-row"><span>Stock quantity</span><input id="ckStock" type="number" min="0" step="1"></div>
      <div class="pf-row">
        <span>Cookie picture</span>
        <div class="ck-pic">
          <img id="ckPreview" alt="Preview" class="ck-preview hidden-pf">
          <div class="ck-pic-btns">
            <label class="ck-mini ck-file">Choose picture
              <input type="file" id="ckFile" accept="image/jpeg,image/png,image/webp" hidden>
            </label>
            <button type="button" class="ck-mini ck-mini-ghost hidden-pf" id="ckRemovePic">Remove picture</button>
          </div>
        </div>
      </div>
      <div class="pf-actions">
        <button type="button" class="pf-btn" id="ckSave">Save</button>
        <button type="button" class="pf-btn pf-ghost" id="ckCancel">Cancel</button>
      </div>
      <div class="pf-msg" id="ckMsg" role="alert" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(overlay);

  let editing = null;   // the cookie being edited, or null when adding
  let pictureData = ""; // the picture currently chosen ("" means none)

  function showPreview(src) {
    pictureData = src || "";
    const img = $("ckPreview");
    if (pictureData) { img.src = pictureData; img.classList.remove("hidden-pf"); }
    else { img.removeAttribute("src"); img.classList.add("hidden-pf"); }
    $("ckRemovePic").classList.toggle("hidden-pf", !pictureData);
  }

  // Shrink the picture in the browser so it stays small
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error("That file is not a valid picture."));
        im.onload = () => {
          const MAX = 600;
          const scale = Math.min(1, MAX / Math.max(im.width, im.height));
          const c = document.createElement("canvas");
          c.width = Math.round(im.width * scale);
          c.height = Math.round(im.height * scale);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.8));
        };
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function formMsg(type, text) {
    const m = $("ckMsg");
    m.className = text ? `pf-msg pf-${type}` : "pf-msg";
    m.textContent = text;
  }

  function openForm(p) {
    editing = p || null;
    $("ckFormTitle").textContent = p ? "Edit cookie" : "Add cookie";
    $("ckName").value = p ? p.product_name : "";
    $("ckDesc").value = p ? (p.description || "") : "";
    $("ckPrice").value = p ? p.price : "";
    $("ckStock").value = p ? p.stock_quantity : 0;
    showPreview(p ? p.image : "");
    $("ckFile").value = "";
    formMsg("info", "");
    overlay.classList.add("open");
    $("ckName").focus();
  }
  function closeForm() { overlay.classList.remove("open"); }

  $("ckClose").addEventListener("click", closeForm);
  $("ckCancel").addEventListener("click", closeForm);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeForm(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeForm(); });
  $("ckAdd").addEventListener("click", () => openForm(null));

  $("ckFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return formMsg("error", "Please choose a JPG, PNG, or WebP picture.");
    if (file.size > 8 * 1024 * 1024) return formMsg("error", "That file is too big. Please choose one under 8 MB.");
    try {
      showPreview(await shrink(file));
      formMsg("info", "");
    } catch (err) {
      formMsg("error", err.message);
    }
  });
  $("ckRemovePic").addEventListener("click", () => { showPreview(""); $("ckFile").value = ""; });

  $("ckSave").addEventListener("click", async () => {
    const product_name = $("ckName").value.trim();
    const description = $("ckDesc").value.trim();
    const price = Number($("ckPrice").value);
    const stockRaw = $("ckStock").value;
    const stock_quantity = Number(stockRaw);
    const image = pictureData;

    if (!product_name) return formMsg("error", "Please enter the cookie name.");
    if (!$("ckPrice").value || !Number.isFinite(price) || price <= 0) return formMsg("error", "Price must be greater than 0.");
    if (stockRaw === "" || !Number.isInteger(stock_quantity) || stock_quantity < 0) return formMsg("error", "Stock must be a whole number, 0 or higher.");

    $("ckSave").disabled = true;
    const body = JSON.stringify({
      product_name, description, price, stock_quantity, image,
      status: editing ? editing.status : "active"
    });
    const { ok, data } = editing
      ? await Auth.api(`/api/products/${editing.product_id}`, { method: "PUT", body })
      : await Auth.api("/api/products", { method: "POST", body });
    $("ckSave").disabled = false;

    if (!ok) return formMsg("error", data.error || "Could not save the cookie. Please try again.");

    const wasEditing = !!editing;
    closeForm();
       let m = wasEditing ? "Cookie updated successfully!" : "Cookie added successfully!";
    if (data.customers_notified) m += " Customers were notified.";
    Toast.success(m);
    load();
  });

  // ---------- Actions ----------
  async function changeStock(p, sign, input) {
    const qty = Number(input.value);
    if (!Number.isInteger(qty) || qty < 1) return Toast.warning("Type how many cookies first (1 or more).");
    if (busy) return;
    busy = true;
    const { ok, data } = await Auth.api(`/api/inventory/${p.product_id}/stock`, {
      method: "PATCH", body: JSON.stringify({ change: sign * qty })
    });
    busy = false;
    if (!ok) return Toast.error(data.error || "Could not change the stock.");
       Toast.success(`Stock quantity updated. ${p.product_name}: ${data.stock_quantity} in stock.` +
      (data.customers_notified ? " Customers were notified." : ""));
    load();
  }

  async function toggleArchive(p) {
    const archiving = p.status !== "archived";
    if (archiving && !confirm(`Archive "${p.product_name}"? Customers will no longer see it. You can restore it later.`)) return;
    if (busy) return;
    busy = true;
    const { ok, data } = archiving
      ? await Auth.api(`/api/products/${p.product_id}`, { method: "DELETE" })
      : await Auth.api(`/api/products/${p.product_id}/restore`, { method: "PATCH" });
    busy = false;
    if (!ok) return Toast.error(data.error || "Something went wrong. Please try again.");
    Toast.success(archiving ? "Cookie archived." : "Cookie restored.");
    load();
  }

  // ---------- Table ----------
  function stockTag(p) {
    if (p.status === "archived") return el("span", "stock-tag stock-out", "Archived");
    const map = { in_stock: ["stock-ok", "In stock"], low_stock: ["stock-low", "Low stock"], out_of_stock: ["stock-out", "Out of stock"] };
    const [cls, text] = map[p.stock_status];
    return el("span", `stock-tag ${cls}`, text);
  }

  function rowClass(p) {
    if (p.status === "archived") return "ck-archived";
    if (p.stock_status === "low_stock") return "ck-row-low";
    if (p.stock_status === "out_of_stock") return "ck-row-out";
    return "";
  }

  function render(products) {
    const box = $("ckList");
    if (products.length === 0) {
      box.replaceChildren(el("div", "ad-empty", search ? "No cookies match your search." : EMPTY[filter]));
      return;
    }
    const table = el("table", "ck-table");
    const head = el("tr");
    ["Cookie", "Price", "Stock", "Status", "Change stock", "Actions"].forEach((h) => head.appendChild(el("th", "", h)));
    table.appendChild(head);

    products.forEach((p) => {
      const tr = el("tr", rowClass(p));

      const nameTd = el("td");
      nameTd.append(el("strong", "", p.product_name));
      if (p.description) nameTd.append(el("div", "ck-desc", p.description));

      const stockTd = el("td", "", String(p.stock_quantity));

      const statusTd = el("td");
      statusTd.appendChild(stockTag(p));

      const changeTd = el("td");
      const wrap = el("div", "ck-stock");
      const input = el("input");
      input.type = "number"; input.min = "1"; input.placeholder = "qty";
      input.setAttribute("aria-label", `Quantity to add or remove for ${p.product_name}`);
      const plus = el("button", "ck-mini", "+ Add");
      plus.type = "button";
      plus.addEventListener("click", () => changeStock(p, +1, input));
      const minus = el("button", "ck-mini ck-mini-ghost", "− Remove");
      minus.type = "button";
      minus.addEventListener("click", () => changeStock(p, -1, input));
      wrap.append(input, plus, minus);
      changeTd.appendChild(wrap);

      const actTd = el("td");
      const act = el("div", "ck-actions");
      const edit = el("button", "ck-mini", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => openForm(p));
      const arch = el("button", "ck-mini ck-mini-ghost", p.status === "archived" ? "Restore" : "Archive");
      arch.type = "button";
      arch.addEventListener("click", () => toggleArchive(p));
      act.append(edit, arch);
      actTd.appendChild(act);

      tr.append(nameTd, el("td", "", peso(p.price)), stockTd, statusTd, changeTd, actTd);
      table.appendChild(tr);
    });

    const scroller = el("div", "ck-scroll");
    scroller.appendChild(table);
    box.replaceChildren(scroller);
  }

  async function load() {
    const mine = ++seq;
    $("ckList").replaceChildren(el("div", "ad-empty", "Loading cookies..."));
    const q = `filter=${filter}&search=${encodeURIComponent(search)}`;
    const { ok, data } = await Auth.api(`/api/inventory?${q}`);
    if (mine !== seq) return;

    if (!ok) {
      const b = el("button", "ad-btn", "Try again");
      b.type = "button";
      b.addEventListener("click", load);
      $("ckList").replaceChildren(el("div", "ad-empty", data.error || "Could not load the cookies."), b);
      return;
    }
    const s = data.summary;
    const attention = Number(s.low_stock) + Number(s.out_of_stock);
    $("ckSummary").textContent =
      `Total ${s.total}  |  In stock ${s.in_stock}  |  Low stock ${s.low_stock} (${data.low_stock_limit} or fewer)  |  ` +
      `Out of stock ${s.out_of_stock}  |  Archived ${s.archived}  |  Needs attention ${attention}`;
    render(data.products);
  }

  // ---------- Controls ----------
  $("ckTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]");
    if (!b) return;
    filter = b.dataset.filter;
    syncTabs();
    load();
  });

  let timer = null;
  $("ckSearch").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { search = e.target.value.trim(); load(); }, 300);
  });

  // Load each time the Cookies tab is opened
  function maybeLoad() {
    if (location.hash !== "#cookies") return;
    applyUrlFilter();
    load();
  }
  window.addEventListener("hashchange", maybeLoad);
  applyUrlFilter();
  maybeLoad();
})();