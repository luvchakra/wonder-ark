// DISC-IG-P0-01.1: the helper's background worker. It is the only part that talks to
// WonderArk, with the person's own WonderArk sign-in (their session cookie; no key or
// password is stored here). It never talks to Instagram and never sends a message.
importScripts("lib.js");
const { cleanSettings, paceCheck, paceAfterSend } = self.WonderArkHelper;

async function settings() {
  const stored = await chrome.storage.local.get("settings");
  return cleanSettings(stored.settings);
}

async function call(path, body, at) {
  const base = at || (await settings()).base;
  let response;
  try {
    response = await fetch(`${base}/api/discovery/instagram-helper/${path}`, {
      method: body ? "POST" : "GET",
      credentials: "include",
      // A header a plain web page cannot add across sites: the server refuses calls without it.
      headers: { "X-WonderArk-Helper": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: "WonderArk could not be reached." };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* not JSON: reported by status below */
  }
  if (response.status === 401) return { ok: false, status: 401, error: "Sign in to WonderArk in this browser first.", base };
  if (!response.ok) return { ok: false, status: response.status, error: (data && data.error) || `WonderArk answered ${response.status}.` };
  return { ok: true, status: response.status, data, base };
}

const handlers = {
  async queue() {
    return call("queue");
  },
  /** May another message be opened now? */
  async pace() {
    const [{ pace }, s] = await Promise.all([chrome.storage.local.get("pace"), settings()]);
    return { ok: true, data: paceCheck(pace, s, Date.now()) };
  },
  /** The person sent it: record it in WonderArk, then count it toward today's pace. */
  async sent({ messageId }) {
    const result = await call("sent", { messageId });
    if (result.ok) {
      const { pace } = await chrome.storage.local.get("pace");
      await chrome.storage.local.set({ pace: paceAfterSend(pace, Date.now()) });
    }
    return result;
  },
  async reply({ prospectId, text }) {
    return call("reply", { prospectId, text });
  },
  /**
   * A WonderArk page is open at this address. The sign-in is kept per address (each
   * business has its own), so the helper uses the address the person is signed in on:
   * it is adopted only if WonderArk answers there as signed in.
   */
  async seenHost({ origin }) {
    const current = await settings();
    const candidate = cleanSettings({ ...current, base: origin });
    if (candidate.base !== origin || candidate.base === current.base) return { ok: true, data: current };
    const probe = await call("queue", null, candidate.base);
    if (!probe.ok) return { ok: true, data: current };
    await chrome.storage.local.set({ settings: candidate });
    return { ok: true, data: candidate };
  },
  async settings() {
    return { ok: true, data: await settings() };
  },
  async saveSettings({ settings: next }) {
    const clean = cleanSettings(next);
    await chrome.storage.local.set({ settings: clean });
    return { ok: true, data: clean };
  },
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only this extension's own pages and its Instagram page script are answered.
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message && message.type];
  if (!handler) return false;
  handler(message).then(respond, (error) => respond({ ok: false, status: 0, error: String((error && error.message) || error) }));
  return true;
});
