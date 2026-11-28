# Discovery: the Instagram helper (browser extension)

Story ids: `DISC-IG-P0-01.1` (the extension), `DISC-IG-P0-01.2` (the endpoints it calls).
Owner decision, 2026-11-28.

## What it is

A Chrome extension (`extensions/instagram-helper`, plain Manifest V3, no build step) for a
person who reaches prospects from their own, ordinary Instagram account. On instagram.com it
shows the Instagram messages WonderArk drafted, opens the right chat and fills the message
in. **The person presses Send.** It then records the send in WonderArk, and can save a
prospect's reply back to WonderArk when the person presses Save reply.

## The limit (do not widen without the owner's explicit approval)

The owner asked for an extension that runs the account by itself. That was refused: automated
activity through a logged-in session breaks Instagram's terms and gets accounts restricted,
and CLAUDE.md ("AI, untrusted input and governed actions", rule 3) keeps AI-written messages
from going out on their own. What was approved instead:

- It never presses Send, follows, likes, comments or browses. Its one click on Instagram is
  the profile's own **Message** button, to open the chat.
- It reads only the chat the person has open, and saves a reply only on their press.
- It holds a pace: 20 messages a day and 120 seconds between two by default (1 to 50 a day,
  30 seconds or more), counted from messages the person actually sent.
- It asks Chrome for `storage` and WonderArk's own addresses only. It has no access to
  Instagram's cookies or requests.

`scripts/instagram-helper.test.mjs` pins these: one `.click()` in the page script, no
synthetic key presses or submits, the permission list, the pace and the address rule.

## How it talks to WonderArk

With the person's own WonderArk session cookie (it stores no key or password). The session is
kept per address (each business has its own subdomain), so the extension uses the WonderArk
address it last saw the person signed in on (`ark.js` reports the open address; the background
worker adopts it only if WonderArk answers there as signed in).

| Endpoint (`/api/discovery/instagram-helper/…`) | Does |
|---|---|
| `GET queue` | Approved prospects on Instagram and their unsent Instagram drafts, per offering |
| `POST sent { messageId }` | Marks an Instagram draft sent. Safe to repeat |
| `POST reply { prospectId, text }` | Saves the prospect's reply as an inbound message. Saved once per prospect, text and day |

- **Door** (`request.ts`): the `X-WonderArk-Helper` header and an `Origin` that is the
  extension's or the site's own, then a signed-in user. These routes answer no CORS preflight,
  so another website cannot make the calls with the person's cookie.
- **Scope**: every read and write runs under the person's session, so RLS limits it to their
  businesses with Discovery licensed. `/api/*` is outside the page guard, so the licence
  (`requireModule`) and the module's view permission are checked in
  `lib/instagram-helper/helper.ts` as well.
- **Replies are data.** A saved reply is the prospect's words, stored as an inbound message
  and classified like any other reply; it never changes a prompt or triggers an action.

## Installing it (`DISC-IG-P0-01.3`)

Chrome installs an extension in one click only from its Web Store, and blocks installers for
anything else. Until the helper is listed there, the install page is the shortest honest path:
`/<business>/discovery/instagram-helper`, linked beside Instagram messages on Prospects
(desktop widths only; Chrome on a phone cannot run extensions).

- **Download**: `GET /api/discovery/instagram-helper/download` (signed-in). The zip is built
  from the extension's own files by `npm run build:instagram-helper` into
  `lib/instagram-helper/package.generated.ts` (stored, fixed dates, so the same source gives
  the same bytes). A test fails when it is stale.
- **Installed check**: on WonderArk pages the helper sets `data-wonderark-helper` on `<html>`
  to its version (`ark.js`). The install page reads it, so it says "Installed" only when it can
  see the helper, and says when a newer version is ready.
- **Web Store later**: listing it needs the owner's Chrome developer account. Then the page's
  download becomes an "Add to Chrome" link and the steps go.

## What is and is not verified

- Verified: the server logic and the door (unit tests), and the whole extension in Chromium
  against a mock Instagram page and a mock WonderArk (`node extensions/instagram-helper/e2e-mock.cjs`).
- Not verified here: Instagram's real page. The extension finds the message box, the Message
  button and the chat's rows by their roles; if Instagram changes them, the helper says it
  could not fill the message and leaves it copied for the person to paste. It was not run on
  instagram.com from this environment (no Instagram sign-in is available to it).
