'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function block(re) { const m = re.exec(html); if (!m) throw new Error('missing ' + re); return m[0]; }
const slotsSrc = block(/const TIME_SLOTS = \[[\s\S]*?\];/);
const hoursSrc = block(/const TIME_HOUR_OPTIONS = \[[\s\S]*?\];/);
const fnStart = html.indexOf('function formatTimeSlotFromSelect');
const fnSrc = html.slice(fnStart, html.indexOf('\n}\n', fnStart) + 3);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(slotsSrc + hoursSrc + fnSrc + ';this.TIME_SLOTS=TIME_SLOTS;this.TIME_HOUR_OPTIONS=TIME_HOUR_OPTIONS;this.f=formatTimeSlotFromSelect;', ctx);
assert.strictEqual(ctx.TIME_SLOTS.slice(-3).join(), '21:00,21:30,22:00');
assert.strictEqual(ctx.TIME_HOUR_OPTIONS[ctx.TIME_HOUR_OPTIONS.length - 1].v, '22');
assert.strictEqual(ctx.f('21', '30'), '21:30');
assert.strictEqual(ctx.f('22', '00'), '22:00');
assert.strictEqual(ctx.f('21', '00'), '21:00');
console.log('ok late-slots (4 checks)');
