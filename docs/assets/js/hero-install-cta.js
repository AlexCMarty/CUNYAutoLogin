(function () {
  var installCta = document.getElementById("hero-install-cta");
  if (!installCta) {
    return;
  }

  var chromeStoreUrl =
    "https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin";
  var firefoxStoreUrl =
    "https://addons.mozilla.org/en-US/firefox/addon/cunyautologin/";

  var userAgent = navigator.userAgent;

  // Gecko — Firefox and forks (check before Chromium; some forks add a product token).
  if (/Firefox\//i.test(userAgent) || /FxiOS/i.test(userAgent)) {
    installCta.href = firefoxStoreUrl;
    if (/Waterfox/i.test(userAgent)) {
      installCta.textContent = "Add to Waterfox";
    } else if (/LibreWolf/i.test(userAgent)) {
      installCta.textContent = "Add to LibreWolf";
    } else if (/Floorp/i.test(userAgent)) {
      installCta.textContent = "Add to Floorp";
    } else if (/\bZen\//i.test(userAgent)) {
      installCta.textContent = "Add to Zen";
    } else {
      installCta.textContent = "Add to Firefox";
    }
    return;
  }

  // Chromium derivatives — order matters; all include "Chrome/" in the UA string.
  installCta.href = chromeStoreUrl;

  if (/Edg\//i.test(userAgent)) {
    installCta.textContent = "Add to Edge";
  } else if (/OPR\/|Opera/i.test(userAgent)) {
    installCta.textContent = "Add to Opera";
  } else if (/Brave/i.test(userAgent)) {
    installCta.textContent = "Add to Brave";
  } else if (/Vivaldi/i.test(userAgent)) {
    installCta.textContent = "Add to Vivaldi";
  } else if (/SamsungBrowser/i.test(userAgent)) {
    installCta.textContent = "Add to Samsung Internet";
  } else if (/Chrome\//i.test(userAgent) || /CriOS/i.test(userAgent)) {
    installCta.textContent = "Add to Chrome";
  } else if (/Chromium/i.test(userAgent)) {
    installCta.textContent = "Add extension";
  }
})();
