// DISC-IG-P0-01.1: the helper's pure rules, shared by the page script, the background worker
// and the tests (node --test loads this file as CommonJS; the extension loads it as a script).
(function (root) {
  const DEFAULTS = { base: "https://ark.wonderapps.biz", dailyLimit: 20, gapSeconds: 120 };

  /** "https://www.instagram.com/weekview/?hl=en" -> "weekview". Null for anything that is
   * not a plain profile address (a post, a reel, the inbox). */
  function handleOf(link) {
    try {
      const url = new URL(link, "https://www.instagram.com");
      if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return null;
      const handle = parts[0].toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
      if (["direct", "explore", "reels", "p", "accounts", "stories", "about", "legal"].includes(handle)) return null;
      return handle;
    } catch {
      return null;
    }
  }

  const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

  /**
   * Whether another message may be opened now. The pace is the person's own protection:
   * at most `dailyLimit` a day and `gapSeconds` between two, counted from messages they
   * actually sent. Returns how long to wait, or that today's limit is reached.
   */
  function paceCheck(pace, settings, now) {
    const today = dayOf(now);
    const count = pace && pace.day === today ? pace.count : 0;
    const left = Math.max(0, settings.dailyLimit - count);
    if (left === 0) return { allowed: false, reason: "limit", left: 0, waitSeconds: 0 };
    const since = pace && pace.lastAt ? (now - pace.lastAt) / 1000 : Infinity;
    const wait = Math.ceil(settings.gapSeconds - since);
    if (wait > 0) return { allowed: false, reason: "gap", left, waitSeconds: wait };
    return { allowed: true, reason: null, left, waitSeconds: 0 };
  }

  /** The pace after one message was sent at `now`. */
  function paceAfterSend(pace, now) {
    const today = dayOf(now);
    const count = pace && pace.day === today ? pace.count : 0;
    return { day: today, count: count + 1, lastAt: now };
  }

  /** A settings object with sane numbers, whatever was stored. */
  function cleanSettings(raw) {
    const out = { ...DEFAULTS, ...(raw || {}) };
    const base = String(out.base || "").trim().replace(/\/+$/, "");
    // Only WonderArk's own address is ever called (the manifest allows no other host).
    out.base = /^https:\/\/([a-z0-9-]+\.)?ark\.wonderapps\.biz$/.test(base) ? base : DEFAULTS.base;
    out.dailyLimit = Math.min(50, Math.max(1, Math.round(Number(out.dailyLimit)) || DEFAULTS.dailyLimit));
    out.gapSeconds = Math.min(3600, Math.max(30, Math.round(Number(out.gapSeconds)) || DEFAULTS.gapSeconds));
    return out;
  }

  /** The first words of a message, to recognise it in the conversation after it is sent. */
  function snippetOf(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }

  const api = { DEFAULTS, handleOf, paceCheck, paceAfterSend, cleanSettings, snippetOf, dayOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonderArkHelper = api;
})(typeof self !== "undefined" ? self : globalThis);
