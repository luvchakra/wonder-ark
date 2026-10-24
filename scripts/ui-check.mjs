#!/usr/bin/env node
// Text-before-pixels UI check. Opens a path, optionally clicks elements, then prints
// each matched element's text and box (x, y, width, height), one line each.
//
//   node scripts/ui-check.mjs <path> [--base URL] [--width PX]
//     [--click role:name]... [--find role:name]... [--shot] [--out DIR]
//
// --find defaults to headings and buttons. --shot saves a 1x JPEG (quality 60)
// cropped to the matched elements. Needs the dev server running at --base
// (default http://localhost:3000, or UI_CHECK_BASE).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_FIND = ['heading', 'button'];

// "button:Save" or a bare role such as "heading" (any name).
export function parseTarget(spec) {
  const i = spec.indexOf(':');
  const role = i < 0 ? spec : spec.slice(0, i);
  if (!role) throw new Error(`expected role or role:name, got "${spec}"`);
  return { role, name: i < 0 ? undefined : spec.slice(i + 1) || undefined };
}

export function parseArgs(argv) {
  const opts = {
    path: '/',
    base: process.env.UI_CHECK_BASE || 'http://localhost:3000',
    width: 1280,
    click: [],
    find: [],
    shot: false,
    out: 'ui-check-out',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--base') opts.base = value();
    else if (arg === '--width') opts.width = Number(value());
    else if (arg === '--click') opts.click.push(parseTarget(value()));
    else if (arg === '--find') opts.find.push(parseTarget(value()));
    else if (arg === '--shot') opts.shot = true;
    else if (arg === '--out') opts.out = value();
    else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}`);
    else opts.path = arg;
  }
  if (opts.find.length === 0) opts.find = DEFAULT_FIND.map((role) => ({ role, name: undefined }));
  return opts;
}

const locate = (page, { role, name }) => page.getByRole(role, name ? { name } : {});

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: opts.width, height: 900 },
      deviceScaleFactor: 1,
    });
    const url = new URL(opts.path, opts.base).href;
    try {
      await page.goto(url, { waitUntil: 'load' });
    } catch (err) {
      throw new Error(`could not open ${url} (is the dev server running?): ${err.message}`);
    }
    for (const target of opts.click) {
      await locate(page, target).first().click({ timeout: 5000 });
      await page.waitForLoadState('load');
    }
    console.log(`url ${page.url()}`);

    const boxes = [];
    for (const target of opts.find) {
      const matches = locate(page, target);
      const count = await matches.count();
      if (count === 0) console.log(`${target.role}${target.name ? `:${target.name}` : ''} no match`);
      for (let i = 0; i < count; i++) {
        const el = matches.nth(i);
        const box = await el.boundingBox();
        const text = ((await el.textContent({ timeout: 2000 }).catch(() => '')) || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);
        if (!box) {
          console.log(`${target.role}\t${text}\thidden`);
          continue;
        }
        const { x, y, width, height } = box;
        boxes.push(box);
        console.log(
          `${target.role}\t${text}\tx=${Math.round(x)} y=${Math.round(y)} w=${Math.round(width)} h=${Math.round(height)}`,
        );
      }
    }

    if (opts.shot) {
      if (boxes.length === 0) {
        console.log('shot skipped: nothing matched; pass --find role:name to crop to elements');
      } else {
        const pad = 8;
        const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
        const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
        const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
        const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
        mkdirSync(opts.out, { recursive: true });
        const file = join(opts.out, 'ui-check.jpg');
        await page.screenshot({
          path: file,
          type: 'jpeg',
          quality: 60,
          clip: { x: left, y: top, width: right - left, height: bottom - top },
        });
        console.log(`shot ${file}`);
      }
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
