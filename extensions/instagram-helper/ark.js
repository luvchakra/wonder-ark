// DISC-IG-P0-01.1: on a WonderArk page, tell the helper which WonderArk address is open, so
// it calls the one the person is signed in on.
// DISC-IG-P0-01.3: and leave one mark on the page, the helper's version, so WonderArk's
// install page can say "Installed". Nothing on the page is read, and nothing else changed.
try {
  document.documentElement.dataset.wonderarkHelper = chrome.runtime.getManifest().version;
  chrome.runtime.sendMessage({ type: "seenHost", origin: location.origin });
} catch {
  /* the helper was reloaded; the next page load tells it */
}
