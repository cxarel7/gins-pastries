// Only customers can be here
const user = Auth.require("customer");

if (user) {
  // The header itself is built by header.js
  const w = document.getElementById("welcome");
  if (w) w.textContent = `Hi, ${user.first_name || user.name}!`;
  const out = document.getElementById("logoutBtn");
  if (out) out.addEventListener("click", (e) => { e.preventDefault(); Auth.logout(); });
}

// Built-in avatar (our permanent profile picture)
const AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>" +
  "<rect width='100' height='100' fill='#510087'/>" +
  "<circle cx='50' cy='38' r='18' fill='#d1a3fd'/>" +
  "<path d='M15 95c0-22 15-35 35-35s35 13 35 35z' fill='#d1a3fd'/></svg>");
document.querySelectorAll(".hb").forEach((img) => { img.src = AVATAR; });