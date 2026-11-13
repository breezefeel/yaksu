/**
 * 약수 신청서 Apps Script 패치 (2026-11-13 부분 저장)
 *
 * 이 파일에는 API 키를 넣지 않는다.
 * Solapi 키/시크릿은 기존처럼 PropertiesService.getScriptProperties()에만 둔다.
 * 이 패치를 붙여 넣을 때 Code.gs에 적힌 키 문자열이 있으면 지우고 속성으로 옮긴다.
 *
 * 배포 (준규):
 * 1. https://script.google.com/d/1oGhoObowcEljUJg9wi0YLnnt6WQqOmPO8ED-yd65T7bKH71Zyz4GqxN5/edit 를 연다.
 * 2. Code.gs 맨 아래에 이 파일 전체를 붙여 넣는다. 기존 함수 이름은 지우지 않는다.
 * 3. doGet / doPost 에서 action을 나눈 직후, 다른 처리보다 먼저 다음을 넣는다.
 *      var yaksuEarly = yaksuHandleKnownAction_(action, data);
 *      if (yaksuEarly) return yaksuJsonResponse_(yaksuEarly);
 *    프로젝트에 JSON 응답 헬퍼가 있으면 yaksuJsonResponse_ 대신 그 함수를 쓴다.
 * 4. 신청 저장(submitApplication) 본문을 아래 「저장 순서」로 감싼다.
 *    셀을 하나씩 setValue 하지 말고, 값을 모두 만든 뒤 행마다 setValues 한 번으로 쓴다.
 *    결제 회차는 현재 칸에 더하지 말고 plan.absoluteRound 를 그대로 넣는다.
 * 5. 일간 칩 HTML에는 docs/schedule-chip.js 를 붙이고, 칩을 만든 직후
 *      var ratio = parseChipRatio_(횟수텍스트);
 *      if (ratio) applyScheduleChipTone(chipEl, ratio.current, ratio.total);
 *    를 호출한다. 취소/줄 클래스와 text-decoration 은 그대로 둔다.
 * 6. 배포 > 웹 앱 > 새 버전으로 배포한다. 깃허브 페이지(신청서)보다 이 배포를 먼저 한다.
 *    11/13 안성희 건(회차 38, 관리요일 비어 있음)은 배포 후 12시간 안에
 *    「같은 신청 다시 보내기」로만 이어 쓴다. 그 이후에는 결제 회차를 눈으로 확인한다.
 *
 * 저장 순서 (기존 저장 함수 안에서):
 *   return yaksuWithDocumentLock_(function () {
 *     var found = 기존_회원찾기(data); // { sheet, row, values } values는 A~N 14칸
 *     var add = 기존_이번회차수(data);
 *     var log = yaksuFindRequestLog_(data.clientRequestId);
 *     var plan = yaksuPlanSubmit_({
 *       log: log,
 *       currentRound: found ? Number(found.values[4]) : 0,
 *       sessionsToAdd: add,
 *       passLabelMatches: found && String(found.values[7]) === 기존_이용권문구(data),
 *       manageDaysBlank: !found || !String(found.values[12] || '').trim(),
 *       timeBlank: !found || !String(found.values[13] || '').trim(),
 *       sheetTouchedRecently: found && yaksuTouchedWithinHours_(found.values[0], 12)
 *     });
 *     if (plan.mode === 'replay') return plan.response;
 *     yaksuSaveRequestLog_(data.clientRequestId, 'started', plan, null, '');
 *     // 여기서부터 시트 변경. 각 쓰기는 yaksuWithSheetRetry_ 로 감싼다.
 *     if (!plan.steps.member) {
 *       var row = yaksuBuildMemberRow_(found && found.values, {
 *         submittedAt: new Date(),
 *         passLabel: 기존_이용권문구(data),
 *         paidRound: plan.absoluteRound,
 *         amount: 기존_누적금액(found, data),
 *         payMethod: 기존_결제방법(data),
 *         manageDays: 기존_관리요일(data),
 *         timeInfo: 기존_시간정보(data)
 *         // 이름·전화·출석·강사·시작주간은 기존 로직대로 updates에 넣는다.
 *       });
 *       yaksuWithSheetRetry_(function () {
 *         found.sheet.getRange(found.row, 1, 1, 14).setValues([row]);
 *       });
 *       plan.steps.member = true;
 *       yaksuSaveRequestLog_(data.clientRequestId, 'member', plan, null, '');
 *     }
 *     if (!plan.steps.moved) {
 *       // 기존 행 이동이 있으면 여기서 한 번만. 없으면 이 블록을 호출하지 않는다.
 *       plan.steps.moved = true;
 *       yaksuSaveRequestLog_(data.clientRequestId, 'member', plan, null, '');
 *     }
 *     if (!plan.steps.schedule) {
 *       // 기존 스케줄 쓰기. var key = yaksuSlotKey_(ymd, time, instructor);
 *       // if (!yaksuShouldWriteSlot_(plan, key)) 이면 그 칸은 건너뛴다.
 *       // 한 행에 넣을 칸은 모아서 range.setValues 한 번으로 쓰고, 성공한 key를 plan.scheduleKeys에 넣은 뒤 로그를 갱신한다.
 *       plan.steps.schedule = true;
 *       yaksuSaveRequestLog_(data.clientRequestId, 'schedule', plan, null, '');
 *     }
 *     var response = { result: 'success', clientRequestId: data.clientRequestId };
 *     yaksuSaveRequestLog_(data.clientRequestId, 'committed', plan, response, '');
 *     return response;
 *   });
 *   // catch에서는 yaksuSaveRequestLog_(id, 현재stage, plan, null, err.message) 후 오류를 반환한다.
 *   // stage를 committed로 바꾸지 않는다. 그래야 같은 번호의 재시도가 이어 쓴다.
 */

var YAKSU_REQUEST_SHEET = '_신청요청';
var YAKSU_REQUEST_HEADERS = ['requestId', 'stage', 'updatedAt', 'schedJson', 'memberRow', 'resultJson', 'lastError'];

function yaksuJsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function yaksuHandleKnownAction_(action, data) {
  if (action === 'submitApplicationStatus') {
    return yaksuReadStatus_(data && data.clientRequestId);
  }
  return null;
}

function yaksuIsTransientSheetError_(err) {
  var msg = String((err && err.message) || err || '');
  if (/시트가 이미 있습니다|보호된|권한이 없|편집할 수 없/.test(msg)) return false;
  return /스프레드시트 서비스에 오류|Service Spreadsheets failed|Service error: Spreadsheets|Internal error|일시적으로|시간이 초과|Timed out|Exception: Service/.test(msg);
}

function yaksuBackoffMs_(attemptIndex) {
  if (attemptIndex <= 0) return 0;
  if (attemptIndex === 1) return 400;
  return 1200;
}

function yaksuWithSheetRetry_(fn) {
  var last;
  var i;
  for (i = 0; i < 3; i++) {
    var wait = yaksuBackoffMs_(i);
    if (wait && typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(wait);
    try {
      return fn();
    } catch (err) {
      last = err;
      if (!yaksuIsTransientSheetError_(err) || i === 2) throw err;
    }
  }
  throw last;
}

function yaksuWithDocumentLock_(fn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    throw new Error('다른 저장이 진행 중입니다. 잠시 후 「같은 신청 다시 보내기」를 눌러 주세요.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function yaksuPlanSubmit_(opts) {
  opts = opts || {};
  var log = opts.log || null;
  var add = parseInt(opts.sessionsToAdd, 10);
  if (isNaN(add) || add < 0) add = 0;
  var current = parseInt(opts.currentRound, 10);
  if (isNaN(current) || current < 0) current = 0;
  var plan = log && log.plan ? log.plan : null;
  if (log && (log.stage === 'committed' || log.stage === 'done')) {
    return {
      mode: 'replay',
      response: log.result || { result: 'success' },
      absoluteRound: plan && plan.absoluteRound != null ? Number(plan.absoluteRound) : null,
      scheduleKeys: (plan && plan.scheduleKeys) || [],
      steps: (plan && plan.steps) || {}
    };
  }
  if (plan && plan.absoluteRound != null && plan.absoluteRound !== '') {
    return {
      mode: 'resume',
      baseRound: Number(plan.baseRound),
      absoluteRound: Number(plan.absoluteRound),
      roundApplied: true,
      scheduleKeys: plan.scheduleKeys || [],
      steps: plan.steps || {},
      recoveredUnlogged: !!plan.recoveredUnlogged
    };
  }
  var recover = !log &&
    !!opts.passLabelMatches &&
    !!opts.manageDaysBlank &&
    !!opts.timeBlank &&
    !!opts.sheetTouchedRecently &&
    add > 0 &&
    current >= add;
  if (recover) {
    return {
      mode: 'resume',
      baseRound: current - add,
      absoluteRound: current,
      roundApplied: true,
      scheduleKeys: [],
      steps: {},
      recoveredUnlogged: true
    };
  }
  return {
    mode: 'apply',
    baseRound: current,
    absoluteRound: current + add,
    roundApplied: false,
    scheduleKeys: [],
    steps: {},
    recoveredUnlogged: false
  };
}

function yaksuSlotKey_(ymd, time, instructor) {
  return [ymd || '', time || '', instructor || ''].join('|');
}

function yaksuShouldWriteSlot_(plan, key) {
  var keys = (plan && plan.scheduleKeys) || [];
  return keys.indexOf(key) === -1;
}

function yaksuBuildMemberRow_(currentValues, updates) {
  var row = [];
  var i;
  for (i = 0; i < 14; i++) {
    row.push(currentValues && currentValues.length > i && currentValues[i] != null ? currentValues[i] : '');
  }
  var keys = {
    submittedAt: 0,
    name: 1,
    phone: 2,
    attended: 3,
    paidRound: 4,
    remaining: 5,
    history: 6,
    passLabel: 7,
    amount: 8,
    payMethod: 9,
    instructor: 10,
    startWeek: 11,
    manageDays: 12,
    timeInfo: 13
  };
  updates = updates || {};
  Object.keys(updates).forEach(function (key) {
    if (keys[key] == null || typeof updates[key] === 'undefined') return;
    row[keys[key]] = updates[key];
  });
  if (typeof updates.paidRound !== 'undefined' && typeof updates.remaining === 'undefined') {
    var attended = Number(row[3]);
    var paid = Number(row[4]);
    if (isFinite(attended) && isFinite(paid)) row[5] = paid - attended;
  }
  return row;
}

function yaksuTouchedWithinHours_(value, hours) {
  var ms = yaksuToMillis_(value);
  if (!ms) return false;
  var windowMs = (hours || 12) * 60 * 60 * 1000;
  return Math.abs(Date.now() - ms) <= windowMs;
}

function yaksuToMillis_(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && isFinite(value)) {
    return Math.round((value - 25569) * 86400 * 1000);
  }
  var parsed = Date.parse(String(value || ''));
  return isNaN(parsed) ? 0 : parsed;
}

function yaksuRequestSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(YAKSU_REQUEST_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(YAKSU_REQUEST_SHEET);
    sheet.hideSheet();
  }
  yaksuWithSheetRetry_(function () {
    var header = sheet.getRange(1, 1, 1, YAKSU_REQUEST_HEADERS.length).getValues()[0];
    if (String(header[0] || '') !== 'requestId') {
      sheet.getRange(1, 1, 1, YAKSU_REQUEST_HEADERS.length).setValues([YAKSU_REQUEST_HEADERS]);
    }
  });
  return sheet;
}

function yaksuReadRequestRecords_() {
  var sheet = yaksuRequestSheet_();
  var last = Math.max(sheet.getLastRow(), 1);
  var values = yaksuWithSheetRetry_(function () {
    return sheet.getRange(1, 1, last, YAKSU_REQUEST_HEADERS.length).getValues();
  });
  var out = [];
  var r;
  for (r = 1; r < values.length; r++) {
    if (!values[r][0]) continue;
    out.push({ row: r + 1, cells: values[r] });
  }
  return { sheet: sheet, records: out };
}

function yaksuParseLog_(cells) {
  var plan = null;
  var result = null;
  try { plan = cells[3] ? JSON.parse(cells[3]) : null; } catch (e) { plan = null; }
  try { result = cells[5] ? JSON.parse(cells[5]) : null; } catch (e2) { result = null; }
  return {
    requestId: String(cells[0] || ''),
    stage: String(cells[1] || ''),
    plan: plan,
    memberRow: cells[4],
    result: result,
    lastError: String(cells[6] || '')
  };
}

function yaksuFindRequestLog_(clientRequestId) {
  var id = String(clientRequestId || '').trim();
  if (!id) return null;
  var packed = yaksuReadRequestRecords_();
  var i;
  for (i = 0; i < packed.records.length; i++) {
    if (String(packed.records[i].cells[0]) === id) {
      var log = yaksuParseLog_(packed.records[i].cells);
      log.sheetRow = packed.records[i].row;
      return log;
    }
  }
  return null;
}

function yaksuSaveRequestLog_(clientRequestId, stage, plan, result, lastError) {
  var id = String(clientRequestId || '').trim();
  if (!id) return;
  var packed = yaksuReadRequestRecords_();
  var target = 0;
  var i;
  for (i = 0; i < packed.records.length; i++) {
    if (String(packed.records[i].cells[0]) === id) target = packed.records[i].row;
  }
  if (!target) target = Math.max(packed.sheet.getLastRow(), 1) + 1;
  var line = [[
    id,
    stage || 'started',
    new Date(),
    JSON.stringify(plan || {}),
    plan && plan.memberRow ? plan.memberRow : '',
    result ? JSON.stringify(result) : '',
    lastError || ''
  ]];
  yaksuWithSheetRetry_(function () {
    packed.sheet.getRange(target, 1, 1, YAKSU_REQUEST_HEADERS.length).setValues(line);
  });
}

function yaksuReadStatus_(clientRequestId) {
  var id = String(clientRequestId || '').trim();
  if (!id) return { result: 'error', message: '신청 번호가 없습니다.' };
  var log = yaksuFindRequestLog_(id);
  if (!log) return { result: 'error', message: '신청 기록이 없습니다.', clientRequestId: id };
  if (log.stage === 'committed' || log.stage === 'done') {
    var done = log.result || { result: 'success' };
    done.result = 'success';
    done.clientRequestId = id;
    return done;
  }
  return {
    result: 'partial',
    partial: true,
    stage: log.stage || 'started',
    clientRequestId: id,
    message: '같은 신청이 아직 끝나지 않았습니다. 빠뜨린 칸만 이어서 저장합니다.'
  };
}
