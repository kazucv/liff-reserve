const GAS_URL =
  "https://script.google.com/macros/s/AKfycbx2e8Xd8kAQ--kWErdGY7CBtsJ8gDSD87SEQbtDHrfM5HL0xxGhfpzZ8hQ5Qjj8bRg/exec";

fetch(GAS_URL)
  .then((r) => r.json())
  .then((data) => console.log("GAS:", data))
  .catch((err) => console.error("fetch error:", err));
