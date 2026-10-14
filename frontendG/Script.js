const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;

const $ = (id) => document.getElementById(id);
const VIEWS = { login: $("loginForm"), register: $("registerForm"), forgot: $("forgotForm") };

// ---------- Helpers ----------
function showMessage(el, type, text) {
  el.className = text ? `msg-box msg-${type}` : "";
  el.textContent = text;
}

function setLoading(button, loading, loadingText) {
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = loadingText;
    button.classList.add("btn-loading");
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.classList.remove("btn-loading");
    button.disabled = false;
  }
}

function showView(name) {
  Object.entries(VIEWS).forEach(([key, form]) => form.classList.toggle("hidden", key !== name));
  ["message", "registerMessage", "fpMessage"].forEach((id) => showMessage($(id), "info", ""));
  window.scrollTo(0, 0);
}

// ---------- Show password ----------
function setupShowPassword(checkboxId, inputId) {
  $(checkboxId).addEventListener("change", function () {
    $(inputId).type = this.checked ? "text" : "password";
  });
}
setupShowPassword("showPassword", "password");
setupShowPassword("showRegPassword", "regPassword");
setupShowPassword("showFpPassword", "fpPassword");

// ---------- Only digits in the code boxes ----------
["regCode", "fpCode"].forEach((id) => {
  $(id).addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });
});

// ---------- Switching between screens ----------
$("showRegister").addEventListener("click", (e) => { e.preventDefault(); showView("register"); });
$("backBtn").addEventListener("click", () => showView("login"));
$("fpBack").addEventListener("click", () => showView("login"));
$("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  const typed = $("email").value.trim();
  showView("forgot");
  if (typed) $("fpEmail").value = typed;
});

// ---------- SEND CODE (with a cooldown so it can't be spammed) ----------
function startCooldown(btn, seconds) {
  clearInterval(btn._timer);
  let left = seconds;
  btn.disabled = true;
  btn.textContent = `RESEND (${left}s)`;
  btn._timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(btn._timer);
      btn.disabled = false;
      btn.textContent = "SEND CODE";
    } else {
      btn.textContent = `RESEND (${left}s)`;
    }
  }, 1000);
}

async function sendCode(purpose, emailEl, btn, msgEl) {
  const email = emailEl.value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return showMessage(msgEl, "error", "Please enter a valid email address first.");
  }
  showMessage(msgEl, "info", "");
  btn.disabled = true;
  btn.textContent = "SENDING...";

  const { ok, data } = await Auth.api("/api/send-code", {
    method: "POST",
    body: JSON.stringify({ email, purpose })
  });

  if (!ok) {
    btn.disabled = false;
    btn.textContent = "SEND CODE";
    return showMessage(msgEl, "error", data.error || "Could not send the code. Please try again.");
  }
  showMessage(msgEl, purpose === "reset" ? "info" : "success", data.message);
  startCooldown(btn, data.cooldown || 60);
}

$("sendRegCode").addEventListener("click", () => sendCode("register", $("regEmail"), $("sendRegCode"), $("registerMessage")));
$("sendFpCode").addEventListener("click", () => sendCode("reset", $("fpEmail"), $("sendFpCode"), $("fpMessage")));

// ---------- Login ----------
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;
  const messageEl = $("message");
  const button = $("loginBtn");

  if (!email || !password) return showMessage(messageEl, "error", "Please enter your email and password.");
  if (!EMAIL_REGEX.test(email)) return showMessage(messageEl, "error", "Please enter a valid email address.");

  showMessage(messageEl, "info", "");
  setLoading(button, true, "Logging in");

  const { ok, status, data } = await Auth.api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  setLoading(button, false);

  if (!ok) {
    if (status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
      return showMessage(messageEl, "warning", "Please verify your email before logging in.");
    }
    return showMessage(messageEl, "error", data.error || "Login failed. Please try again.");
  }

  Auth.save(data.token, data.user);

  // Convenience only. The backend still enforces who is admin.
  location.href = data.user.role === "admin" ? "dashboard.html" : "customerpage.html";
});

// ---------- Register ----------
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const first_name = $("firstName").value.trim();
  const last_name = $("lastName").value.trim();
  const contact = $("contact").value.replace(/[\s-]/g, "");
  const facebook = $("facebook").value.trim();
  const email = $("regEmail").value.trim().toLowerCase();
  const code = $("regCode").value.trim();
  const password = $("regPassword").value;
  const messageEl = $("registerMessage");
  const button = $("registerBtn");

  if (!first_name || !last_name || !contact || !email || !password) {
    return showMessage(messageEl, "error", "Please fill in your name, contact, email, and password.");
  }
  if (!PHONE_REGEX.test(contact)) return showMessage(messageEl, "error", "Please enter a valid mobile number (09XXXXXXXXX).");
  if (!EMAIL_REGEX.test(email)) return showMessage(messageEl, "error", "Please enter a valid email address.");
  if (!/^\d{6}$/.test(code)) return showMessage(messageEl, "error", "Press SEND CODE, then enter the 6-digit code from your email.");
  if (password.length < 8) return showMessage(messageEl, "error", "Password must be at least 8 characters.");

  showMessage(messageEl, "info", "");
  setLoading(button, true, "Creating");

  const { ok, data } = await Auth.api("/api/register", {
    method: "POST",
    body: JSON.stringify({ first_name, last_name, contact, facebook, email, code, password })
  });

  setLoading(button, false);

  if (!ok) return showMessage(messageEl, "error", data.error || "Registration failed. Please try again.");

  showMessage(messageEl, "success", "Account created! Please log in.");
  $("registerForm").reset();
  setTimeout(() => {
    showView("login");
    $("email").value = email;
    $("password").focus();
  }, 1500);
});

// ---------- Forget password ----------
$("forgotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("fpEmail").value.trim().toLowerCase();
  const code = $("fpCode").value.trim();
  const new_password = $("fpPassword").value;
  const messageEl = $("fpMessage");
  const button = $("fpBtn");

  if (!EMAIL_REGEX.test(email)) return showMessage(messageEl, "error", "Please enter a valid email address.");
  if (!/^\d{6}$/.test(code)) return showMessage(messageEl, "error", "Press SEND CODE, then enter the 6-digit code from your email.");
  if (new_password.length < 8) return showMessage(messageEl, "error", "Password must be at least 8 characters.");

  showMessage(messageEl, "info", "");
  setLoading(button, true, "Changing");

  const { ok, data } = await Auth.api("/api/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password })
  });

  setLoading(button, false);

  if (!ok) return showMessage(messageEl, "error", data.error || "Could not change the password. Please try again.");

  showMessage(messageEl, "success", data.message);
  $("forgotForm").reset();
  setTimeout(() => {
    showView("login");
    $("email").value = email;
    $("password").focus();
  }, 1800);
});