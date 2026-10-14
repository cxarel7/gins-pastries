(function () {
  const user = Auth.user();
  const avatar = document.querySelector(".prof img");
  if (!user || !avatar) return;

  avatar.classList.add("avatar-btn");
  avatar.title = "My profile";

  const isAdmin = user.role === "admin";
  const MONTHS = ["January","February","March","April","May","June","July",
                  "August","September","October","November","December"];
  const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
  const TITLES = { view: "My Profile", edit: "Edit Profile", password: "Change Password" };

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

      <div id="pfViewSec">
        <div class="pf-info">
          <div id="pfVName" class="pf-vname"></div>
          <div id="pfVContact" class="pf-vline"></div>
          <div id="pfVFacebook" class="pf-vline"></div>
          <div id="pfVEmail" class="pf-vline"></div>
          <div id="pfVSince" class="pf-vline pf-muted"></div>
        </div>
        <div class="pf-actions">
          <button type="button" class="pf-btn" id="pfEdit">Edit profile</button>
          <button type="button" class="pf-btn pf-ghost" id="pfGoPw">Change password</button>
        </div>
      </div>

      <div id="pfEditSec" class="hidden-pf">
        <div class="pf-row"><span>First name</span><input id="pfFirst" autocomplete="given-name"></div>
        <div class="pf-row"><span>Last name</span><input id="pfLast" autocomplete="family-name"></div>
        <div class="pf-row"><span>Mobile number</span><input id="pfContact" type="tel" placeholder="09XX XXX XXXX"></div>
        <div class="pf-row"><span>Facebook (optional)</span><input id="pfFacebook" placeholder="facebook.com/yourname"></div>
        <div class="pf-actions">
          <button type="button" class="pf-btn" id="pfSave" disabled>Save</button>
          <button type="button" class="pf-btn pf-ghost" id="pfCancel">Cancel</button>
        </div>
      </div>

      <div id="pfPwSec" class="hidden-pf">
        <div class="pf-row"><span>Current password</span><input type="password" id="pfCurPw" autocomplete="current-password"></div>
        <div class="pf-row"><span>New password</span><input type="password" id="pfNewPw" autocomplete="new-password"></div>
        <div class="pf-row"><span>Confirm new password</span><input type="password" id="pfConfPw" autocomplete="new-password"></div>
        <label class="pf-check"><input type="checkbox" id="pfShowPw"> Show passwords</label>
        <div class="pf-actions">
          <button type="button" class="pf-btn" id="pfPwSave">Update password</button>
          <button type="button" class="pf-btn pf-ghost" id="pfPwCancel">Cancel</button>
        </div>
      </div>

      <div class="pf-msg" id="pfMsg" role="alert" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => document.getElementById(id);
  let original = null;

  if (isAdmin) { $("pfEdit").classList.add("hidden-pf"); }

  function msg(type, text) {
    const el = $("pfMsg");
    el.className = text ? `pf-msg pf-${type}` : "pf-msg";
    el.textContent = text;
  }

  function longDate(str) {
    const [y, m, d] = String(str || "").slice(0, 10).split("-").map(Number);
    return y ? `${MONTHS[m - 1]} ${d}, ${y}` : "";
  }

  // Show exactly one step at a time
  function setMode(mode) {
    $("pfViewSec").classList.toggle("hidden-pf", mode !== "view");
    $("pfEditSec").classList.toggle("hidden-pf", mode !== "edit");
    $("pfPwSec").classList.toggle("hidden-pf", mode !== "password");
    $("pfTitle").textContent = TITLES[mode];
    msg("info", "");

    if (mode === "edit") {
      $("pfSave").disabled = !original;
      $("pfFirst").focus();
    }
    if (mode === "password") {
      ["pfCurPw", "pfNewPw", "pfConfPw"].forEach((id) => { $(id).value = ""; $(id).type = "password"; });
      $("pfShowPw").checked = false;
      $("pfCurPw").focus();
    }
  }

  function fill(u) {
    original = u;
    $("pfVName").textContent = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    if (u.contact && PHONE_REGEX.test(u.contact)) {
      $("pfVContact").textContent = u.contact;
      $("pfVContact").classList.remove("pf-muted");
    } else {
      $("pfVContact").textContent = isAdmin ? "" : "Please add your mobile number";
      $("pfVContact").classList.add("pf-muted");
    }
    $("pfVFacebook").textContent = u.facebook ? `Facebook: ${u.facebook}` : "";
    $("pfVEmail").textContent = u.email || "";
    $("pfVSince").textContent = `Member since ${longDate(u.created_at)}`;

    $("pfFirst").value = u.first_name || "";
    $("pfLast").value = u.last_name || "";
    $("pfContact").value = PHONE_REGEX.test(u.contact || "") ? u.contact : "";
    $("pfFacebook").value = u.facebook || "";
    $("pfSave").disabled = false;
  }

  async function open(mode) {
    mode = TITLES[mode] ? mode : "view";
    overlay.classList.add("open");
    $("pfPic").src = avatar.src;
    setMode(mode);

    const { ok, data } = await Auth.api("/api/me");
    if (!ok) return msg("error", data.error || "Could not load your profile.");
    fill(data);
  }
  window.openProfile = open; // the side menu calls this

  function close() { overlay.classList.remove("open"); }

  avatar.addEventListener("click", () => open("view"));
  $("pfClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  // ----- Step buttons -----
  $("pfEdit").addEventListener("click", () => setMode("edit"));
  $("pfGoPw").addEventListener("click", () => setMode("password"));
  $("pfCancel").addEventListener("click", () => { if (original) fill(original); setMode("view"); });
  $("pfPwCancel").addEventListener("click", () => setMode("view"));

  // ----- Save profile -----
  $("pfSave").addEventListener("click", async () => {
    const first_name = $("pfFirst").value.trim();
    const last_name = $("pfLast").value.trim();
    const contact = $("pfContact").value.replace(/[\s-]/g, "");
    const facebook = $("pfFacebook").value.trim();
    if (!first_name || !last_name) return msg("error", "Please enter your first and last name.");
    if (!PHONE_REGEX.test(contact)) return msg("error", "Please enter a valid mobile number (09XXXXXXXXX).");

    $("pfSave").disabled = true;
    const { ok, data } = await Auth.api("/api/me", {
      method: "PUT",
      body: JSON.stringify({ first_name, last_name, contact, facebook })
    });
    $("pfSave").disabled = false;

    if (!ok) return msg("error", data.error || "Could not save. Please try again.");

    fill(data.user);
    Auth.save(Auth.token(), {
      ...Auth.user(),
      first_name: data.user.first_name, last_name: data.user.last_name,
      name: data.user.name, contact: data.user.contact, facebook: data.user.facebook
    });
    const welcome = document.getElementById("welcome");
    if (welcome) welcome.textContent = `Hi, ${data.user.first_name}!`;
    setMode("view");
    msg("success", "Profile updated successfully!");
  });

  // ----- Change password -----
  $("pfShowPw").addEventListener("change", function () {
    const t = this.checked ? "text" : "password";
    ["pfCurPw", "pfNewPw", "pfConfPw"].forEach((id) => { $(id).type = t; });
  });

  $("pfPwSave").addEventListener("click", async () => {
    const current_password = $("pfCurPw").value;
    const new_password = $("pfNewPw").value;
    const confirm_password = $("pfConfPw").value;

    if (!current_password || !new_password || !confirm_password) return msg("error", "Please fill in all three password fields.");
    if (new_password.length < 8) return msg("error", "New password must be at least 8 characters.");
    if (new_password !== confirm_password) return msg("error", "The new passwords do not match.");
    if (new_password === current_password) return msg("error", "New password must be different from the current one.");

    $("pfPwSave").disabled = true;
    const { ok, data } = await Auth.api("/api/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password })
    });
    $("pfPwSave").disabled = false;

    if (!ok) return msg("error", data.error || "Could not change password.");

    ["pfCurPw", "pfNewPw", "pfConfPw"].forEach((id) => { $(id).value = ""; });
    msg("success", "Password changed successfully!");
  });
})();