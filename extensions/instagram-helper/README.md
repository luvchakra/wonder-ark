# WonderArk Instagram helper

Fills in the Instagram messages WonderArk drafted for your prospects. You read each one and
press Send yourself; the helper never sends, follows or browses. Design and limits:
`docs/design/discovery-instagram-helper.md`.

## Install (until it is on the Chrome Web Store)

In WonderArk, open **Instagram helper** (the link beside your Instagram messages on an
offering's Prospects tab). It has the download and says "Installed" once Chrome has it.

1. Download and unzip. Keep the folder; Chrome runs the helper from it.
2. In Chrome on a computer, open `chrome://extensions` and turn on **Developer mode**.
3. Press **Load unpacked** and choose the unzipped folder.
4. Open instagram.com, signed in as yourself, and press **WonderArk** at the bottom right.

## Files

- `manifest.json`: asks for `storage` and WonderArk's own addresses only.
- `lib.js`: the pure rules (handle, pace, settings); tested by `scripts/instagram-helper.test.mjs`.
- `background.js`: the only part that calls WonderArk (`/api/discovery/instagram-helper/*`).
- `content.js`: the panel on instagram.com. `ark.js`: tells the helper which WonderArk address is open.
- `popup.html`, `popup.js`: the pace and the WonderArk address.
- `e2e-mock.cjs`: runs the extension in Chromium against a mock Instagram and a mock WonderArk.

After changing any shipped file run `npm run build:instagram-helper`: it repacks the download
WonderArk serves (a test fails when it is stale). Raise `version` in `manifest.json` for a
release, so the install page can tell people a newer one is ready.
