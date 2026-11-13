'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'docs', 'apps-script-patch.gs'), 'utf8');

function extractFunction(src, name) {
  const token = 'function ' + name;
  const start = src.indexOf(token);
  if (start < 0) throw new Error('missing function ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

const api = new Function(
  [
    extractFunction(source, 'yaksuIsTransientSheetError_'),
    extractFunction(source, 'yaksuBackoffMs_'),
    extractFunction(source, 'yaksuPlanSubmit_'),
    extractFunction(source, 'yaksuSlotKey_'),
    extractFunction(source, 'yaksuShouldWriteSlot_'),
    extractFunction(source, 'yaksuBuildMemberRow_'),
    'return { yaksuIsTransientSheetError_, yaksuBackoffMs_, yaksuPlanSubmit_, yaksuSlotKey_, yaksuShouldWriteSlot_, yaksuBuildMemberRow_ };',
  ].join('\n')
)();

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

test('스프레드시트 일시 오류만 다시 시도한다', function () {
  const msg = 'ID가 1I8zIUUaP-eIGpB2y4dMgZbDRiBBzjpAGEWU0RD3yk8g인 문서에 액세스하는 동안 스프레드시트 서비스에 오류가 발생했습니다.';
  assert.strictEqual(api.yaksuIsTransientSheetError_(new Error(msg)), true);
  assert.strictEqual(api.yaksuIsTransientSheetError_(new Error("이름이 '27-4월'인 시트가 이미 있습니다.")), false);
  assert.strictEqual(api.yaksuIsTransientSheetError_(new Error('보호된 시트라 편집할 수 없습니다.')), false);
  assert.deepStrictEqual([0, 1, 2].map(api.yaksuBackoffMs_), [0, 400, 1200]);
});

test('기록이 없으면 기준 회차에 이번 회차만 더한다', function () {
  const plan = api.yaksuPlanSubmit_({
    log: null,
    currentRound: 27,
    sessionsToAdd: 11,
    passLabelMatches: false,
    manageDaysBlank: false,
    timeBlank: false,
    sheetTouchedRecently: false,
  });
  assert.strictEqual(plan.mode, 'apply');
  assert.strictEqual(plan.baseRound, 27);
  assert.strictEqual(plan.absoluteRound, 38);
  assert.strictEqual(plan.roundApplied, false);
});

test('같은 번호가 이미 커밋됐으면 회차를 다시 더하지 않는다', function () {
  const plan = api.yaksuPlanSubmit_({
    log: {
      stage: 'committed',
      result: { result: 'success', memberRow: 2 },
      plan: { absoluteRound: 38, scheduleKeys: ['2026-11-16|10:00|최진옥'] },
    },
    currentRound: 38,
    sessionsToAdd: 11,
  });
  assert.strictEqual(plan.mode, 'replay');
  assert.strictEqual(plan.response.memberRow, 2);
  assert.strictEqual(plan.absoluteRound, 38);
});

test('쓰기 전에 적어 둔 절대 회차로 재시도한다', function () {
  const plan = api.yaksuPlanSubmit_({
    log: {
      stage: 'started',
      plan: { baseRound: 27, absoluteRound: 38, scheduleKeys: [], steps: { member: true } },
    },
    currentRound: 38,
    sessionsToAdd: 11,
  });
  assert.strictEqual(plan.mode, 'resume');
  assert.strictEqual(plan.absoluteRound, 38);
  assert.strictEqual(plan.steps.member, true);
  assert.notStrictEqual(plan.absoluteRound, 49);
});

test('기록 없이 회차만 늘어난 재결제는 38을 49로 만들지 않는다', function () {
  const plan = api.yaksuPlanSubmit_({
    log: null,
    currentRound: 38,
    sessionsToAdd: 11,
    passLabelMatches: true,
    manageDaysBlank: true,
    timeBlank: true,
    sheetTouchedRecently: true,
  });
  assert.strictEqual(plan.mode, 'resume');
  assert.strictEqual(plan.baseRound, 27);
  assert.strictEqual(plan.absoluteRound, 38);
  assert.strictEqual(plan.recoveredUnlogged, true);
});

test('요일이 이미 있는 같은 이용권은 새 결제로 회차를 더한다', function () {
  const plan = api.yaksuPlanSubmit_({
    log: null,
    currentRound: 38,
    sessionsToAdd: 11,
    passLabelMatches: true,
    manageDaysBlank: false,
    timeBlank: false,
    sheetTouchedRecently: true,
  });
  assert.strictEqual(plan.absoluteRound, 49);
  assert.strictEqual(plan.recoveredUnlogged, false);
});

test('이미 적은 스케줄 칸은 다시 쓰지 않는다', function () {
  const key = api.yaksuSlotKey_('2026-11-16', '10:00', '최진옥');
  assert.strictEqual(key, '2026-11-16|10:00|최진옥');
  const plan = { scheduleKeys: [key] };
  assert.strictEqual(api.yaksuShouldWriteSlot_(plan, key), false);
  assert.strictEqual(api.yaksuShouldWriteSlot_(plan, api.yaksuSlotKey_('2026-11-16', '10:30', '최진옥')), true);
});

test('회원 행은 한 번에 14칸으로 맞춘다', function () {
  const row = api.yaksuBuildMemberRow_(
    ['old', '안성희', '01020789617', 28, 27, -1, '[hist]', '이전 이용권', 2305000, '11월 현금', '최진옥', '2026-06-27', '월', '10:00'],
    {
      submittedAt: '2026-11-13T04:38:00.000Z',
      passLabel: '기능 운동 · 약수 · 11회',
      paidRound: 38,
      amount: 3070000,
      payMethod: '11월 현금',
      manageDays: '금',
      timeInfo: '10:00, 10:30',
    }
  );
  assert.strictEqual(row.length, 14);
  assert.strictEqual(row[4], 38);
  assert.strictEqual(row[5], 10);
  assert.strictEqual(row[7], '기능 운동 · 약수 · 11회');
  assert.strictEqual(row[8], 3070000);
  assert.strictEqual(row[12], '금');
  assert.strictEqual(row[13], '10:00, 10:30');
  assert.strictEqual(row[1], '안성희');
});

assert.doesNotMatch(source, /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]/i);
assert.doesNotMatch(source, /api[_-]?secret\s*[:=]\s*['"]/i);
assert.doesNotMatch(source, /NC[A-Z0-9]{10,}/);

console.log(passed + ' tests passed');
