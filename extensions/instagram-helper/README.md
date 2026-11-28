# WonderArk Instagram helper

Fills in the Instagram messages WonderArk drafted for your prospects. You read each one and
press Send yourself; the helper never sends, follows or browses. Design and limits:
`docs/design/discovery-instagram-helper.md`.

## Install (until it is on the Chrome Web Store)

1. In Chrome on a computer, open `chrome://extensions` and turn on **Developer mode**.
2. Press **Load unpacked** and choose this folder (or the unzipped download).
3. Sign in to WonderArk in the same browser and open any WonderArk page once.
4. Open instagram.com, signed in as yourself, and press **WonderArk** at the bottom right.

## Files

- `manifest.json`: asks for `storage` and WonderArk's own addresses only.
- `lib.js`: the pure rules (handle, pace, settings); tested by `scripts/instagram-helper.test.mjs`.
- `background.js`: the only part that calls WonderArk (`/api/discovery/instagram-helper/*`).
- `content.js`: the panel on instagram.com. `ark.js`: tells the helper which WonderArk address is open.
- `popup.html`, `popup.js`: the pace and the WonderArk address.
- `e2e-mock.cjs`: runs the extension in Chromium against a mock Instagram and a mock WonderArk.
