'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'schedule-chip.js'), 'utf8');
const api = new Function(source + '\nreturn { scheduleChipTone_, scheduleChipToneClass_, parseChipRatio_, applyScheduleChipTone };')();

function el(extra) {
  const classes = new Set(extra && extra.classes || []);
  const node = {
    style: { textDecoration: (extra && extra.textDecoration) || '', backgroundColor: '', color: '' },
    classList: {
      remove() {
        Array.from(arguments).forEach(function (name) { classes.delete(name); });
      },
      add(name) { classes.add(name); },
      contains(name) { return classes.has(name); },
    },
    attrs: {},
    setAttribute(k, v) { node.attrs[k] = v; },
    getAttribute(k) { return node.attrs[k] || ''; },
    classes: classes,
  };
  return node;
}

assert.strictEqual(api.scheduleChipTone_(26, 27), 'low');
assert.strictEqual(api.scheduleChipToneClass_(26, 27), 'chip-tone-low');
assert.strictEqual(api.scheduleChipTone_(28, 27), 'last');
assert.strictEqual(api.scheduleChipTone_(29, 29), 'last');
assert.strictEqual(api.scheduleChipTone_(5, 8), '');
assert.strictEqual(api.scheduleChipTone_(7, 8), 'low');
assert.strictEqual(api.scheduleChipTone_(8, 8), 'last');

const parsed = api.parseChipRatio_('10:30, 11:00 안성희 28/27');
assert.deepStrictEqual(parsed, { current: 28, total: 27 });

const yellow = el();
assert.strictEqual(api.applyScheduleChipTone(yellow, 26, 27), 'low');
assert.strictEqual(yellow.style.backgroundColor, '#f6e27a');
assert.strictEqual(yellow.style.color, '#1a1a1a');
assert.ok(yellow.classes.has('chip-tone-low'));

const red = el();
assert.strictEqual(api.applyScheduleChipTone(red, 29, 29), 'last');
assert.strictEqual(red.style.backgroundColor, '#f4b4b4');
assert.strictEqual(red.style.color, '#1a1a1a');

const struck = el({ textDecoration: 'line-through', classes: ['is-canceled'] });
api.applyScheduleChipTone(struck, 28, 27);
assert.strictEqual(struck.style.textDecoration, 'line-through');
assert.strictEqual(struck.style.color, '#1a1a1a');
assert.ok(struck.classes.has('is-canceled'));
assert.ok(struck.classes.has('chip-tone-last'));

const plain = el();
api.applyScheduleChipTone(plain, 5, 8);
assert.strictEqual(plain.style.backgroundColor, '');
assert.strictEqual(plain.style.textDecoration, '');

assert.match(source, /text-decoration:\s*line-through/);
assert.match(source, /#f6e27a/);
assert.match(source, /#f4b4b4/);
assert.match(source, /#1a1a1a/);

console.log('ok chip-tone');
