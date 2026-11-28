// DISC-IG-P0-01.1: the helper's panel on instagram.com. It lists the messages WonderArk
// drafted for the person's prospects, opens the right conversation and fills the message
// in. It NEVER presses Send, follows, likes or browses: the person reads the message and
// sends it themselves, and the helper then records in WonderArk that they did.
// A prospect's reply is saved only when the person presses "Save reply" on text they can see.
(() => {
  const { handleOf, snippetOf } = self.WonderArkHelper;
  const PENDING = "wonderark-helper-pending";
  const ask = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (answer) => resolve(answer || { ok: false, error: "The helper is not answering. Reload this page." }));
      } catch {
        resolve({ ok: false, error: "The helper was updated. Reload this page." });
      }
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (find, ms = 8000) => {
    const until = Date.now() + ms;
    for (;;) {
      const found = find();
      if (found) return found;
      if (Date.now() > until) return null;
      await sleep(250);
    }
  };

  // ---- Instagram's page, read as little as possible -------------------------------------
  const composer = () =>
    document.querySelector('div[contenteditable="true"][role="textbox"]') || document.querySelector('textarea[placeholder*="essage"]');
  const onThread = () => location.pathname.startsWith("/direct/t/");
  /** The handles this conversation links to (its header links to the other person's profile). */
  const threadHandles = () =>
    [...document.querySelectorAll('a[href^="/"]')]
      .map((a) => handleOf(a.getAttribute("href")))
      .filter(Boolean);
  const messageButton = () =>
    [...document.querySelectorAll('div[role="button"], button')].find((el) => (el.textContent || "").trim() === "Message");
  const composerText = () => {
    const box = composer();
    return box ? (box.value !== undefined ? box.value : box.innerText || "").trim() : "";
  };

  /** Types the text into the message box the way a paste would. Returns false if it didn't take. */
  function fill(text) {
    const box = composer();
    if (!box) return false;
    box.focus();
    if (box.value !== undefined) {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      set.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (i > 0) document.execCommand("insertLineBreak");
        if (line) document.execCommand("insertText", false, line);
      });
    }
    return composerText().includes(snippetOf(text.split("\n")[0]));
  }

  /** The other person's latest messages, as the page shows them: the rows on the left side
   * after the last row on the right. A guess the person checks before anything is saved. */
  function latestIncoming() {
    const rows = [...document.querySelectorAll('div[role="row"]')].filter((row) => (row.innerText || "").trim());
    if (rows.length === 0) return "";
    const area = rows[0].parentElement ? rows[0].parentElement.getBoundingClientRect() : document.body.getBoundingClientRect();
    const middle = area.left + area.width / 2;
    const incoming = [];
    for (const row of rows.slice().reverse()) {
      const bubble = row.querySelector('[dir="auto"]') || row;
      const box = bubble.getBoundingClientRect();
      const left = box.left + box.width / 2 < middle;
      if (!left) break;
      incoming.unshift((bubble.innerText || "").trim());
    }
    return incoming.filter(Boolean).join("\n");
  }

  // ---- the panel -------------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "wonderark-helper";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .pill { border: 0; border-radius: 999px; background: #2563eb; color: #fff; padding: 10px 14px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
      .panel { width: 340px; max-height: 70vh; overflow: auto; background: #fff; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); padding: 12px; font-size: 13px; }
      .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
      .head b { font-size: 14px; }
      .x { border: 0; background: none; cursor: pointer; font-size: 16px; color: #64748b; }
      h4 { margin: 10px 0 6px; font-size: 12px; color: #475569; font-weight: 600; }
      .item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 6px; }
      .item b { display: block; }
      .item p { margin: 4px 0 6px; color: #475569; white-space: pre-wrap; max-height: 5.2em; overflow: hidden; }
      button.go { border: 0; border-radius: 6px; background: #2563eb; color: #fff; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
      button.go[disabled] { opacity: .5; cursor: default; }
      button.plain { border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 6px 10px; font-size: 12px; cursor: pointer; }
      textarea { width: 100%; min-height: 70px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 12px; }
      .note { color: #475569; margin: 6px 0; }
      .warn { color: #b45309; }
      a { color: #2563eb; }
    </style>
    <button class="pill" id="pill" type="button">WonderArk</button>
    <div class="panel" id="panel" hidden>
      <div class="head"><b>WonderArk helper</b><button class="x" id="close" type="button" aria-label="Close">×</button></div>
      <div id="status" class="note" role="status"></div>
      <div id="now"></div>
      <div id="list"></div>
      <p class="note">You send every message yourself. The helper never presses Send.</p>
    </div>`;
  const $ = (id) => root.getElementById(id);
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let queue = null; // what WonderArk returned
  let current = null; // the message opened in this conversation

  function say(text, warn) {
    $("status").textContent = text || "";
    $("status").className = warn ? "note warn" : "note";
  }

  async function load() {
    say("Loading from WonderArk...");
    const result = await ask({ type: "queue" });
    if (!result.ok) {
      queue = null;
      $("list").innerHTML = result.status === 401 && result.base ? `<a href="${escape(result.base)}/login" target="_blank" rel="noreferrer">Open WonderArk to sign in</a>` : "";
      say(result.error, true);
      $("pill").textContent = "WonderArk";
      return;
    }
    queue = result.data;
    const count = queue.offerings.reduce((sum, offering) => sum + offering.items.length, 0);
    $("pill").textContent = count > 0 ? `WonderArk (${count})` : "WonderArk";
    say(count === 0 ? "No Instagram messages are waiting in WonderArk." : "");
    render();
  }

  function render() {
    if (!queue) return;
    $("list").innerHTML = queue.offerings
      .filter((offering) => offering.items.length > 0)
      .map(
        (offering) => `<h4>${escape(offering.offeringName)}</h4>${offering.items
          .map(
            (item) => `<div class="item"><b>${escape(item.name)}${item.kind === "reply" ? " (reply)" : ""}</b><p>${escape(item.text)}</p>
              <button class="go" type="button" data-id="${escape(item.messageId)}">Open and fill</button></div>`,
          )
          .join("")}`,
      )
      .join("");
    for (const button of root.querySelectorAll("button.go[data-id]")) button.addEventListener("click", () => open(button.dataset.id));
    renderNow();
  }

  const findItem = (id) => queue && queue.offerings.flatMap((offering) => offering.items).find((item) => item.messageId === id);
  const prospectHere = () => {
    if (!queue || !onThread()) return null;
    const here = threadHandles();
    return queue.prospects.find((p) => here.includes(p.handle)) || null;
  };

  /** What applies to the conversation in view: the message just filled in, or saving a reply. */
  function renderNow() {
    const box = $("now");
    const prospect = prospectHere();
    if (current) {
      box.innerHTML = `<div class="item"><b>${escape(current.name)}</b>
        <div class="note">${current.filled ? "Filled in. Read it, then press Send in Instagram." : "Couldn't fill it in here. It is copied: paste it into the message box, then send."}</div>
        <button class="plain" id="marksent" type="button">I sent it</button></div>`;
      $("marksent").addEventListener("click", () => recordSent(current));
    } else if (prospect) {
      box.innerHTML = `<div class="item"><b>${escape(prospect.name)}</b>
        <div class="note">Their latest message, as this page shows it. Check it, then save it to WonderArk.</div>
        <textarea id="replytext" aria-label="Their reply"></textarea>
        <button class="plain" id="savereply" type="button">Save reply</button></div>`;
      $("replytext").value = String(window.getSelection() || "").trim() || latestIncoming();
      $("savereply").addEventListener("click", async () => {
        const text = $("replytext").value.trim();
        if (!text) return say("There is no reply text to save.", true);
        const result = await ask({ type: "reply", prospectId: prospect.prospectId, text });
        say(result.ok ? (result.data.status === "duplicate" ? "That reply was already saved." : "Reply saved to WonderArk. Its answer will be drafted there.") : result.error, !result.ok);
      });
    } else {
      box.innerHTML = "";
    }
  }

  /** The person pressed "Open and fill": check the pace, copy the text, go to the conversation. */
  async function open(messageId) {
    const item = findItem(messageId);
    if (!item) return;
    const pace = await ask({ type: "pace" });
    if (pace.ok && !pace.data.allowed) {
      return say(
        pace.data.reason === "limit"
          ? "Today's limit is reached. Sending more in one day risks your Instagram account."
          : `Wait ${Math.ceil(pace.data.waitSeconds / 60)} min before the next one, so your account keeps a human pace.`,
        true,
      );
    }
    try {
      await navigator.clipboard.writeText(item.text);
    } catch {
      /* the fill below still works; the fallback note says to copy from the panel */
    }
    sessionStorage.setItem(PENDING, JSON.stringify(item));
    if (onThread() && threadHandles().includes(item.handle)) return resume();
    location.assign(`https://www.instagram.com/${encodeURIComponent(item.handle)}/`);
  }

  /** After the page for the pending message has loaded: open the chat and fill the box. */
  async function resume() {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return;
    const item = JSON.parse(raw);
    if (!onThread()) {
      if (handleOf(location.href) !== item.handle) return;
      $("panel").hidden = false;
      $("pill").hidden = true;
      say(`Opening the chat with ${item.name}...`);
      const button = await waitFor(messageButton);
      if (!button) {
        sessionStorage.removeItem(PENDING);
        return say("This profile has no Message button here. Open the chat yourself; the message is copied.", true);
      }
      button.click();
      const arrived = await waitFor(() => onThread() && composer(), 10000);
      if (!arrived) {
        sessionStorage.removeItem(PENDING);
        return say("The chat didn't open. Open it yourself; the message is copied.", true);
      }
    }
    await waitFor(composer);
    // Only ever fill a conversation that links to this prospect's own profile.
    const right = await waitFor(() => threadHandles().includes(item.handle), 4000);
    sessionStorage.removeItem(PENDING);
    $("panel").hidden = false;
    $("pill").hidden = true;
    if (!right) return say(`This doesn't look like the chat with ${item.name}, so nothing was filled in. The message is copied.`, true);
    current = { ...item, filled: fill(item.text) };
    say("");
    renderNow();
    watchForSend(current);
  }

  /** The message counts as sent when the box is empty again and its words are in the chat. */
  async function watchForSend(item) {
    const snippet = snippetOf(item.text.split("\n")[0]);
    const until = Date.now() + 10 * 60 * 1000;
    while (current === item && Date.now() < until) {
      await sleep(1000);
      if (!onThread()) return;
      const inChat = [...document.querySelectorAll('div[role="row"]')].some((row) => (row.innerText || "").includes(snippet));
      if (item.filled && composerText() === "" && inChat) return recordSent(item);
    }
  }

  async function recordSent(item) {
    if (current !== item) return;
    current = null;
    const result = await ask({ type: "sent", messageId: item.messageId });
    // Refresh the list first, so the confirmation is the line left showing.
    if (result.ok) await load();
    else renderNow();
    say(result.ok ? `Marked as sent in WonderArk: ${item.name}.` : `Not recorded in WonderArk: ${result.error}`, !result.ok);
  }

  $("pill").addEventListener("click", () => {
    $("panel").hidden = false;
    $("pill").hidden = true;
    load();
  });
  $("close").addEventListener("click", () => {
    $("panel").hidden = true;
    $("pill").hidden = false;
  });
  document.documentElement.appendChild(host);

  // Instagram changes pages without reloading: re-check what applies when the address changes.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (current && !onThread()) current = null;
    if (!$("panel").hidden) renderNow();
  }, 1000);

  load().then(resume);
})();
