const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// ---------- Switch between login and register ----------
document.getElementById("showRegister").addEventListener("click", (e) => {
  e.preventDefault();
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
});

document.getElementById("backBtn").addEventListener("click", () => {
  registerForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
});

// ---------- Show password ----------
function setupShowPassword(checkboxId, inputId) {
  document.getElementById(checkboxId).addEventListener("change", function () {
    document.getElementById(inputId).type = this.checked ? "text" : "password";
  });
}
setupShowPassword("showPassword", "password");
setupShowPassword("showRegPassword", "regPassword");

// ---------- Forgot password (built in a later step) ----------
document.getElementById("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  showMessage(document.getElementById("message"), "info",
    "Password reset is coming soon. We will build it in a later step.");
});

// ---------- Login ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const messageEl = document.getElementById("message");
  const button = document.getElementById("loginBtn");

  if (!email || !password) {
    return showMessage(messageEl, "error", "Please enter your email and password.");
  }
  if (!EMAIL_REGEX.test(email)) {
    return showMessage(messageEl, "error", "Please enter a valid email address.");
  }

  showMessage(messageEl, "info", "");
  setLoading(button, true, "Logging in...");

  const { ok, status, data } = await Auth.api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  setLoading(button, false);

  if (!ok) {
    if (status === 0) return showMessage(messageEl, "error", data.error);
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
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const first_name = document.getElementById("firstName").value.trim();
  const last_name = document.getElementById("lastName").value.trim();
  const contact = document.getElementById("contact").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value;
  const messageEl = document.getElementById("registerMessage");
  const button = document.getElementById("registerBtn");

  if (!first_name || !last_name || !contact || !email || !password) {
    return showMessage(messageEl, "error", "Please fill in all the fields.");
  }
  if (contact.length < 5) {
    return showMessage(messageEl, "error", "Please enter a valid contact number or Facebook account.");
  }
  if (!EMAIL_REGEX.test(email)) {
    return showMessage(messageEl, "error", "Please enter a valid email address.");
  }
  if (password.length < 8) {
    return showMessage(messageEl, "error", "Password must be at least 8 characters.");
  }

  showMessage(messageEl, "info", "");
  setLoading(button, true, "Creating account...");

  const { ok, data } = await Auth.api("/api/register", {
    method: "POST",
    body: JSON.stringify({ first_name, last_name, contact, email, password })
  });

  setLoading(button, false);

  if (!ok) {
    return showMessage(messageEl, "error", data.error || "Registration failed. Please try again.");
  }

  showMessage(messageEl, "success", "Account created! Please log in.");
  registerForm.reset();
  setTimeout(() => {
    showMessage(messageEl, "info", "");
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }, 1500);
});