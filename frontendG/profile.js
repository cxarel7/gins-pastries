(function () {
  const user = Auth.user();
  const avatar = document.querySelector(".prof img");
  if (!user || !avatar) return;

  avatar.classList.add("avatar-btn");
  avatar.title = "My profile";

  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];

  // ----- Build the pop-up -----
  const overlay = document.createElement("div");
  overlay.className = "pf-overlay";
  overlay.innerHTML = `
    <div class="pf-box" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
      <button type="button" class="pf-close" id="pfClose" aria-label="Close">✕</button>
      <div class="pf-head">
        <img src="${avatar.getAttribute("src") || ""}" alt="profile" class="pf-pic" id="pfPic">
        <div id="pfTitle" class="pf-title">My Profile</div>
      </div>

      <div class="pf-info">
        <div id="pfVName" class="pf-vname"></div>
        <div id="pfVContact" class="pf-vline"></div>
        <div id="pfVEmail" class="pf-vline"></div>
        <div id="pfVSince" class="pf-vline pf-muted"></div>
      </div>

      <div id="pfEditBox" class="hidden-pf">
        <div class="pf-row"><span>First name</span><input id="pfFirst" autocomplete="given-name"></div>
        <div class="pf-row"><span>Last name</span><input id="pfLast" autocomplete="family-name"></div>
        <div class="pf-row"><span>Contact / Facebook</span><input id="pfContact"></div>
      </div>

      <div class="pf-actions">
        <button type="button" class="pf-btn" id="pfEdit">Edit profile</button>
        <button type="button" class="pf-btn pf-save hidden-pf" id="pfSave">Save</button>
        <button type="button" class="pf-btn pf-ghost hidden-pf" id="pfCancel">Cancel</button>
      </div>
      <div class="pf-msg" id="pfMsg" role="alert" aria-live="polite"></div>

      <div class="pf-divider"></div>
      <button type="button" class="pf-link" id="pfPwToggle">Change password</button>
      <div id="pfPwBox" class="hidden-pf">
        <div class="pf-row"><span>Current</span><input type="password" id="pfCurPw" autocomplete="current-password"></div>
        <div class="pf-row"><span>New</span><input type="password" id="pfNewPw" autocomplete="new-password"></div>
        <label class="pf-check"><input type="checkbox" id="pfShowPw"> Show passwords</label>
        <button type="button" class="pf-btn" id="pfPwSave">Update password</button>
        <div class="pf-msg" id="pfPwMsg" role="alert" aria-live="polite"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  let original = null;

  function msg(el, type, text) {
    el.className = text ? `pf-msg pf-${type}` : "pf-msg";
    el.textContent = text;
  }

  function longDate(str) {
    const [y, m, d] = String(str || "").slice(0, 10).split("-").map(Number);
    if (!y) return "";
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }

  // Text view <-> edit view
  function setEditing(on) {
    $("pfVName").classList.toggle("hidden-pf", on);
    $("pfVContact").classList.toggle("hidden-pf", on);
    $("pfEditBox").classList.toggle("hidden-pf", !on);
    $("pfEdit").classList.toggle("hidden-pf", on);
    $("pfSave").classList.toggle("hidden-pf", !on);
    $("pfCancel").classList.toggle("hidden-pf", !on);
    if (on) $("pfFirst").focus();
  }

  function fill(u) {
    original = u;

    // Text view
    $("pfVName").textContent = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    if (u.contact) {
      $("pfVContact").textContent = u.contact;
      $("pfVContact").classList.remove("pf-muted");
    } else {
      $("pfVContact").textContent = "No contact added yet";
      $("pfVContact").classList.add("pf-muted");
    }
    $("pfVEmail").textContent = u.email || "";
    $("pfVSince").textContent = `Member since ${longDate(u.created_at)}`;

    // Edit fields
    $("pfFirst").value = u.first_name || "";
    $("pfLast").value = u.last_name || "";
    $("pfContact").value = u.contact || "";
  }

  async function open() {
    overlay.classList.add("open");
    $("pfPic").src = avatar.src;
    setEditing(false);
    msg($("pfMsg"), "info", "Loading...");
    const { ok, data } = await Auth.api("/api/me");
    if (!ok) return msg($("pfMsg"), "error", data.error || "Could not load your profile.");
    fill(data);
    msg($("pfMsg"), "info", "");
  }

  function close() { overlay.classList.remove("open"); }

  avatar.addEventListener("click", open);
  $("pfClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  $("pfEdit").addEventListener("click", () => { msg($("pfMsg"), "info", ""); setEditing(true); });
  $("pfCancel").addEventListener("click", () => {
    if (original) fill(original);
    msg($("pfMsg"), "info", "");
    setEditing(false);
  });

  $("pfSave").addEventListener("click", async () => {
    const first_name = $("pfFirst").value.trim();
    const last_name = $("pfLast").value.trim();
    const contact = $("pfContact").value.trim();
    if (!first_name || !last_name) return msg($("pfMsg"), "error", "Please enter your first and last name.");
    if (contact.length < 5) return msg($("pfMsg"), "error", "Please enter a valid contact number or Facebook account.");

    $("pfSave").disabled = true;
    const { ok, data } = await Auth.api("/api/me", {
      method: "PUT",
      body: JSON.stringify({ first_name, last_name, contact })
    });
    $("pfSave").disabled = false;

    if (!ok) return msg($("pfMsg"), "error", data.error || "Could not save. Please try again.");

    fill(data.user);
    Auth.save(Auth.token(), {
      ...Auth.user(),
      first_name: data.user.first_name, last_name: data.user.last_name,
      name: data.user.name, contact: data.user.contact
    });
    const welcome = document.getElementById("welcome");
    if (welcome) welcome.textContent = `Hello, ${data.user.first_name}!`;
    setEditing(false);
    msg($("pfMsg"), "success", "Profile updated successfully!");
  });

  // ----- Change password -----
  $("pfPwToggle").addEventListener("click", () => $("pfPwBox").classList.toggle("hidden-pf"));
  $("pfShowPw").addEventListener("change", function () {
    $("pfCurPw").type = $("pfNewPw").type = this.checked ? "text" : "password";
  });

  $("pfPwSave").addEventListener("click", async () => {
    const current_password = $("pfCurPw").value;
    const new_password = $("pfNewPw").value;
    if (!current_password || !new_password) return msg($("pfPwMsg"), "error", "Please fill in both passwords.");
    if (new_password.length < 8) return msg($("pfPwMsg"), "error", "New password must be at least 8 characters.");

    $("pfPwSave").disabled = true;
    const { ok, data } = await Auth.api("/api/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password })
    });
    $("pfPwSave").disabled = false;

    if (!ok) return msg($("pfPwMsg"), "error", data.error || "Could not change password.");
    $("pfCurPw").value = $("pfNewPw").value = "";
    msg($("pfPwMsg"), "success", "Password changed successfully!");
  });
})();