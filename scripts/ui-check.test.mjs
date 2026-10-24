import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parseTarget } from './ui-check.mjs';

test('parseArgs reads the path, flags and role:name targets', () => {
  const opts = parseArgs([
    '/inventory',
    '--click', 'button:Save',
    '--find', 'heading:Items',
    '--shot',
    '--width', '390',
  ]);
  assert.equal(opts.path, '/inventory');
  assert.deepEqual(opts.click, [{ role: 'button', name: 'Save' }]);
  assert.deepEqual(opts.find, [{ role: 'heading', name: 'Items' }]);
  assert.equal(opts.shot, true);
  assert.equal(opts.width, 390);
});

test('parseArgs defaults to finding headings and buttons', () => {
  const opts = parseArgs(['/']);
  assert.deepEqual(opts.find, [
    { role: 'heading', name: undefined },
    { role: 'button', name: undefined },
  ]);
});

test('parseTarget takes a bare role or role:name, and rejects an empty role', () => {
  assert.deepEqual(parseTarget('heading'), { role: 'heading', name: undefined });
  assert.deepEqual(parseTarget('button:Save'), { role: 'button', name: 'Save' });
  assert.throws(() => parseTarget(':Save'), /role or role:name/);
});

test('parseArgs rejects unknown flags and missing values', () => {
  assert.throws(() => parseArgs(['/', '--nope']), /unknown flag/);
  assert.throws(() => parseArgs(['/', '--width']), /needs a value/);
});
