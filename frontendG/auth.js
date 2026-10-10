// Shared helpers for every page. Loaded after config.js.
const Auth = {
  token() { return localStorage.getItem("token"); },

  user() {
    try { return JSON.parse(localStorage.getItem("user")); }
    catch (e) { return null; }
  },

  save(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  logout() {
    Auth.clear();
    location.href = "index.html";
  },

  // Call at the top of a protected page: Auth.require("customer") or Auth.require("admin").
  // This only decides which page to SHOW. The backend still enforces every permission.
  require(role) {
    const user = Auth.user();
    if (!Auth.token() || !user) { location.href = "index.html"; return null; }
    if (user.role !== role) {
      location.href = user.role === "admin" ? "dashboard.html" : "customerpage.html";
      return null;
    }
    return user;
  },

  // Calls the backend with the token attached. Returns { ok, status, data }.
  async api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (Auth.token()) headers.Authorization = `Bearer ${Auth.token()}`;

    let response;
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, headers });
    } catch (err) {
      return { ok: false, status: 0, data: { error: "Cannot reach the server. Please check your connection." } };
    }

    let data = {};
    try { data = await response.json(); } catch (e) {}

    // Expired or invalid token: send the person back to log in
    if (response.status === 401 && Auth.token()) Auth.logout();

    return { ok: response.ok, status: response.status, data };
  }
};