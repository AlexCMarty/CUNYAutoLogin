(() => {
  const installCtas = document.querySelectorAll(".js-install-cta");
  if (installCtas.length === 0) {
    return;
  }

  const chromeStoreUrl =
    "https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin";
  const firefoxStoreUrl =
    "https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/";

  // Gecko — Firefox and forks (checked before Chromium; some forks add a product token).
  const firefoxLabel = (userAgent) => {
    if (/Waterfox/i.test(userAgent)) return "Add to Waterfox";
    if (/LibreWolf/i.test(userAgent)) return "Add to LibreWolf";
    if (/Floorp/i.test(userAgent)) return "Add to Floorp";
    if (/\bZen\//i.test(userAgent)) return "Add to Zen";
    return "Add to Firefox";
  };

  // Chromium derivatives — order matters; all include "Chrome/" in the UA string.
  const chromiumLabel = (userAgent) => {
    if (/Edg\//i.test(userAgent)) return "Add to Edge";
    if (/OPR\/|Opera/i.test(userAgent)) return "Add to Opera";
    if (/Brave/i.test(userAgent)) return "Add to Brave";
    if (/Vivaldi/i.test(userAgent)) return "Add to Vivaldi";
    if (/SamsungBrowser/i.test(userAgent)) return "Add to Samsung Internet";
    if (/Chrome\//i.test(userAgent) || /CriOS/i.test(userAgent)) return "Add to Chrome";
    if (/Chromium/i.test(userAgent)) return "Add extension";
    return "Add to Chrome";
  };

  const { userAgent } = navigator;
  const isGecko = /Firefox\//i.test(userAgent) || /FxiOS/i.test(userAgent);

  // The browser is the same for every button, so resolve once and apply to all.
  const href = isGecko ? firefoxStoreUrl : chromeStoreUrl;
  const label = isGecko ? firefoxLabel(userAgent) : chromiumLabel(userAgent);

  for (const cta of installCtas) {
    cta.href = href;
    cta.textContent = label;
  }
})();
