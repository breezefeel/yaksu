/**
 * 일간 스케줄 칩 색.
 * Apps Script HTML(일간 화면)에서 칩 요소를 만든 직후 applyScheduleChipTone(el, current, total)을 호출한다.
 * current/total == total-1 (오늘이 결제 회차의 마지막에서 두 번째)이면 노란 배경,
 * current >= total (마지막 결제 회차 또는 초과)이면 빨간 배경.
 * 그 외 칩 색, 취소 줄(text-decoration)은 바꾸지 않는다.
 *
 * 스타일 (칩을 그리는 HTML의 <style>에 붙인다):
 * .chip-tone-low { background-color: #f6e27a; color: #1a1a1a; }
 * .chip-tone-last { background-color: #f4b4b4; color: #1a1a1a; }
 * .chip-tone-low.is-canceled, .chip-tone-last.is-canceled,
 * .chip-tone-low.canceled, .chip-tone-last.canceled,
 * .is-canceled .chip-tone-low, .is-canceled .chip-tone-last {
 *   text-decoration: line-through;
 *   color: #1a1a1a;
 * }
 */
function scheduleChipTone_(current, total) {
  var cur = Number(current);
  var tot = Number(total);
  if (!isFinite(cur) || !isFinite(tot) || tot <= 0) return '';
  if (cur >= tot) return 'last';
  if (cur === tot - 1) return 'low';
  return '';
}

function scheduleChipToneClass_(current, total) {
  var tone = scheduleChipTone_(current, total);
  if (tone === 'last') return 'chip-tone-last';
  if (tone === 'low') return 'chip-tone-low';
  return '';
}

function parseChipRatio_(text) {
  var m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { current: Number(m[1]), total: Number(m[2]) };
}

function applyScheduleChipTone(el, current, total) {
  var tone = scheduleChipTone_(current, total);
  var cls = scheduleChipToneClass_(current, total);
  if (!el) return tone;
  var deco = el.style && el.style.textDecoration ? String(el.style.textDecoration) : '';
  if (el.classList) {
    el.classList.remove('chip-tone-low', 'chip-tone-last');
    if (cls) el.classList.add(cls);
  }
  if (tone === 'last') {
    el.style.backgroundColor = '#f4b4b4';
    el.style.color = '#1a1a1a';
  } else if (tone === 'low') {
    el.style.backgroundColor = '#f6e27a';
    el.style.color = '#1a1a1a';
  } else if (el.getAttribute && el.getAttribute('data-chip-tone')) {
    el.style.backgroundColor = '';
    el.style.color = '';
  }
  if (el.setAttribute) el.setAttribute('data-chip-tone', tone || '');
  if (deco) el.style.textDecoration = deco;
  return tone;
}
