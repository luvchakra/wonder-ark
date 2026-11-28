// DISC-IG-P0-01.1: on a WonderArk page, tell the helper which WonderArk address is open, so
// it calls the one the person is signed in on. Nothing on the page is read or changed.
try {
  chrome.runtime.sendMessage({ type: "seenHost", origin: location.origin });
} catch {
  /* the helper was reloaded; the next page load tells it */
}
