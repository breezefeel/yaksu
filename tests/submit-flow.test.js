'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(source, name) {
  const token = 'function ' + name;
  const start = source.indexOf(token);
  if (start < 0) throw new Error('missing function ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (let i = brace; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

function extractConst(source, name) {
  const token = 'const ' + name + ' =';
  const start = source.indexOf(token);
  if (start < 0) throw new Error('missing const ' + name);
  const eq = source.indexOf('=', start);
  let i = eq + 1;
  while (source[i] === ' ' || source[i] === '\n') i += 1;
  const open = source[i];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error('unsupported const ' + name);
  let depth = 0;
  let quote = null;
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (quote) {
      if (c === '\\') { j += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, j + 1) + ';';
    }
  }
  throw new Error('unterminated const ' + name);
}

function extractVar(source, name) {
  const re = new RegExp('var ' + name + ' = [^;\\n]+;');
  const m = source.match(re);
  if (!m) throw new Error('missing var ' + name);
  return m[0];
}

const api = new Function(
  [
    extractConst(html, 'DAY_MAP_KO_TO_JS'),
    extractConst(html, 'JS_TO_KOR'),
    extractConst(html, 'YAKSU_PASS_SESSIONS'),
    extractVar(html, 'SUBMIT_ATTEMPT_STORE_KEY'),
    extractVar(html, '_submitAttemptMemory'),
    extractVar(html, '_submitInFlight'),
    extractFunction(html, 'getCurrentWeekMonday'),
    extractFunction(html, 'formatDateForDB'),
    extractFunction(html, 'parseSessionCount'),
    extractFunction(html, 'parseYMD'),
    extractFunction(html, 'dateForDayInWeek_'),
    extractFunction(html, 'compareTimeStr_'),
    extractFunction(html, 'bumpSlotDateForHoliday_'),
    extractFunction(html, 'computeSessionSlotsFromPattern'),
    extractFunction(html, 'isRetryableSubmitError_'),
    extractFunction(html, 'newClientRequestId_'),
    extractFunction(html, 'submitAttemptStorage_'),
    extractFunction(html, 'loadSubmitAttempt_'),
    extractFunction(html, 'saveSubmitAttempt_'),
    extractFunction(html, 'clearSubmitAttempt_'),
    extractFunction(html, 'submissionDraftKey_'),
    extractFunction(html, 'resolveClientRequestId_'),
    extractFunction(html, 'shouldAutoResubmitSubmit_'),
    extractFunction(html, 'classifySubmitFailure_'),
    extractFunction(html, 'submitFailureGuidance_'),
    'return {',
    '  formatDateForDB, computeSessionSlotsFromPattern, loadSubmitAttempt_,',
    '  clearSubmitAttempt_, submissionDraftKey_, resolveClientRequestId_,',
    '  shouldAutoResubmitSubmit_, classifySubmitFailure_, submitFailureGuidance_,',
    '};',
  ].join('\n')
)();

const memory = new Map();
global.sessionStorage = {
  getItem(k) { return memory.has(k) ? memory.get(k) : null; },
  setItem(k, v) { memory.set(k, String(v)); },
  removeItem(k) { memory.delete(k); },
};

function ymd(date) {
  return api.formatDateForDB(date);
}

function draft(overrides) {
  return Object.assign({
    name: '가상회원',
    phone: '01011112222',
    program: '기능 운동',
    instructor: '박준규',
    startDate: '2026-11-09',
    sessions: '3개월 패키지',
    amount: '1920000',
    manualScheduleDates: false,
    storeBranch: '약수',
    branch: '약수',
    days: ['월'],
    scheduleSlots: [{ day: '월', time: '10:00' }],
  }, overrides || {});
}

/** 오류 문구 "27-4월"에서 본 표기 추정. 배포 서버 함수는 이 테스트에 없다. */
function inferredMonthTabName(date) {
  return String(date.getFullYear()).slice(-2) + '-' + (date.getMonth() + 1) + '월';
}

let passed = 0;
function test(name, fn) {
  memory.clear();
  fn();
  passed += 1;
  console.log('ok', name);
}

test('신규 등록은 신청 번호를 만들고 자동 재전송하지 않는다', function () {
  const key = api.submissionDraftKey_(draft());
  const id = api.resolveClientRequestId_(key);
  assert.ok(id);
  assert.strictEqual(api.loadSubmitAttempt_().submitAttempt, 1);
  assert.strictEqual(api.shouldAutoResubmitSubmit_(), false);
  assert.strictEqual(api.shouldAutoResubmitSubmit_('connection'), false);
  assert.strictEqual(api.shouldAutoResubmitSubmit_('partial'), false);
  assert.strictEqual(api.shouldAutoResubmitSubmit_('business'), false);
});

test('같은 신청의 연속 재시도는 같은 번호를 유지한다', function () {
  const key = api.submissionDraftKey_(draft());
  const first = api.resolveClientRequestId_(key);
  const second = api.resolveClientRequestId_(key);
  assert.strictEqual(first, second);
  assert.strictEqual(api.loadSubmitAttempt_().submitAttempt, 2);
});

test('저장된 신청 번호는 시간 경과만으로 버리지 않는다', function () {
  const key = api.submissionDraftKey_(draft());
  const first = api.resolveClientRequestId_(key);
  const stored = api.loadSubmitAttempt_();
  stored.savedAt = 0;
  sessionStorage.setItem('yaksuSubmitAttemptV1', JSON.stringify(stored));
  assert.strictEqual(api.resolveClientRequestId_(key), first);
});

test('성공 뒤 같은 내용의 재결제는 새 번호를 받는다', function () {
  const key = api.submissionDraftKey_(draft());
  const first = api.resolveClientRequestId_(key);
  api.clearSubmitAttempt_();
  const second = api.resolveClientRequestId_(key);
  assert.notStrictEqual(first, second);
});

test('횟수나 금액이 달라지면 새 신청 번호다', function () {
  const first = api.resolveClientRequestId_(api.submissionDraftKey_(draft()));
  const second = api.resolveClientRequestId_(api.submissionDraftKey_(draft({
    sessions: '1회',
    amount: '85000',
  })));
  assert.notStrictEqual(first, second);
});

test('이름만 달라도 새 신청이며 이름만으로 막지 않는다', function () {
  const first = api.resolveClientRequestId_(api.submissionDraftKey_(draft()));
  const second = api.resolveClientRequestId_(api.submissionDraftKey_(draft({
    name: '다른회원',
    phone: '01099998888',
  })));
  assert.notStrictEqual(first, second);
});

test('시트 이름 충돌은 업무 오류로 구분한다', function () {
  const message = "이름이 '27-4월'인 시트가 이미 있습니다. 다른 이름을 입력해 주세요.";
  assert.strictEqual(api.classifySubmitFailure_({ result: 'error', message: message }, null), 'business');
  const guidance = api.submitFailureGuidance_('business', message);
  assert.match(guidance, /연결이 끊긴 것이 아닙니다/);
  assert.match(guidance, /보호는 해제하지 마세요/);
  assert.match(guidance, /자동으로 다시 보내지 않았습니다/);
  assert.doesNotMatch(guidance, /연결이 끊겨 다시 보내는/);
});

test('응답 유실과 시간 초과는 연결 오류로 구분한다', function () {
  const timeout = new Error('시트 기록이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.');
  assert.strictEqual(api.classifySubmitFailure_(null, timeout), 'connection');
  const lost = new Error('서버 응답을 읽지 못했습니다. 시트에 일부만 저장됐을 수 있습니다.');
  assert.strictEqual(api.classifySubmitFailure_(null, lost), 'connection');
  const guidance = api.submitFailureGuidance_('connection', lost.message);
  assert.match(guidance, /스케줄만 저장되고 회원정보가 빠졌을 수 있습니다/);
  assert.match(guidance, /자동으로 다시 보내지 않았습니다/);
});

test('스케줄만 저장된 응답은 부분 저장으로 구분한다', function () {
  const json = { result: 'partial', scheduleSaved: true, memberSaved: false, message: '스케줄은 저장됐고 회원정보는 저장되지 않았습니다. 회원정보 기록 실패' };
  assert.strictEqual(api.classifySubmitFailure_(json, null), 'partial');
  const guidance = api.submitFailureGuidance_('partial', json.message);
  assert.match(guidance, /회원정보는 저장되지 않았습니다/);
  assert.doesNotMatch(guidance, /연결이 끊겨 다시 보내는/);
});

test('24회 월요일 일정은 2027년 4월 날짜를 포함한다', function () {
  const slots = api.computeSessionSlotsFromPattern('2026-11-09', [{ day: '월', time: '10:00' }], '3개월 패키지', new Set());
  assert.strictEqual(slots.length, 24);
  const labels = slots.map(function (slot) { return inferredMonthTabName(slot.date); });
  assert.ok(labels.indexOf('26-11월') >= 0);
  assert.ok(labels.indexOf('26-12월') >= 0);
  assert.ok(labels.indexOf('27-1월') >= 0);
  assert.ok(labels.indexOf('27-4월') >= 0);
  assert.strictEqual(ymd(slots[0].date), '2026-11-09');
  assert.strictEqual(ymd(slots[slots.length - 1].date), '2027-04-19');
});

test('주 2회 24회는 4월 탭까지 가지 않고 연도를 넘는다', function () {
  const slots = api.computeSessionSlotsFromPattern(
    '2026-11-09',
    [{ day: '월', time: '10:00' }, { day: '목', time: '10:00' }],
    '24회',
    new Set()
  );
  assert.strictEqual(slots.length, 24);
  const labels = slots.map(function (slot) { return inferredMonthTabName(slot.date); });
  assert.ok(labels.indexOf('27-1월') >= 0);
  assert.strictEqual(labels.indexOf('27-4월'), -1);
  assert.ok(ymd(slots[slots.length - 1].date) < '2027-04-01');
});

test('연말 일정은 다음 해 1월로 이어지고 공휴일은 같은 요일로 민다', function () {
  const yearEnd = api.computeSessionSlotsFromPattern(
    '2026-12-28',
    [{ day: '월', time: '09:00' }],
    '4회',
    new Set()
  );
  assert.deepStrictEqual(yearEnd.map(function (slot) { return ymd(slot.date); }), [
    '2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18',
  ]);
  const bumped = api.computeSessionSlotsFromPattern(
    '2027-01-04',
    [{ day: '월', time: '09:00' }],
    '1회',
    new Set(['2027-01-04'])
  );
  assert.strictEqual(ymd(bumped[0].date), '2027-01-11');
});

test('신청 POST 경로는 자동 재시도 문구를 포함하지 않는다', function () {
  const fn = extractFunction(html, 'postApplicationToGas_');
  assert.doesNotMatch(fn, /연결이 끊겨 다시 보내는/);
  assert.doesNotMatch(fn, /for\s*\(/);
  assert.match(fn, /method:\s*'POST'/);
  assert.doesNotMatch(fn, /method:\s*'GET'/);
  const probe = extractFunction(html, 'probeSubmitStatus_');
  assert.match(probe, /method:\s*'GET'/);
  assert.match(probe, /submitApplicationStatus/);
});

console.log(passed + ' tests passed');
