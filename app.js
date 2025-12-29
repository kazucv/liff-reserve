const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";

const statusEl = document.getElementById("status");
if (statusEl) statusEl.textContent = "fetching GAS...";

fetch(GAS_URL, { cache: "no-store" })
  .then((r) => r.json())
  .then((data) => {
    console.log("GAS:", data);
    if (statusEl) statusEl.textContent = `GAS OK: ${JSON.stringify(data)}`;
  })
  .catch((err) => {
    console.error("fetch error:", err);
    if (statusEl) statusEl.textContent = `GAS NG: ${err?.message || err}`;
  });
