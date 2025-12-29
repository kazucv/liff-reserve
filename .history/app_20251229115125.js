async function initLiff() {
  try {
    await liff.init({ liffId: "2008793696-IEhzXwEH" });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    document.getElementById("status").textContent =
      `こんにちは、${profile.displayName} さん 😊`;
  } catch (e) {
    document.getElementById("status").textContent = "LIFFエラー";
    console.error(e);
  }
}

initLiff();