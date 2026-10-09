const assert = require('assert');
const E = require('../js/engine.js');
global.window = global;
require('../js/registry.js'); global.TripRegistry = window.TripRegistry;
require('../js/trips/jeonju.js');
const trip = TripRegistry.get('jeonju-2d');
const pb = {}; trip.places.forEach(p => pb[p.id] = p);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('시간 형식', () => { assert.equal(E.fmt(E.toMin('09:05')), '09:05'); });
t('타임라인: 순차 시각, 이동 포함', () => {
  const rows = E.timeline(trip.plans.balanced.days[1], pb, '10:30');
  assert.equal(rows[0].start, 630);
  rows.filter(r => r.included).forEach((r, i, a) => { if (i) assert.ok(r.start >= a[i - 1].end); assert.ok(r.end >= r.start); });
});
t('제외 항목은 시간 계산에서 빠진다 (재계산)', () => {
  const items = JSON.parse(JSON.stringify(trip.plans.balanced.days[1]));
  const before = E.timeline(items, pb, '10:30').slice(-1)[0].end;
  items[2].included = false;
  const rows = E.timeline(items, pb, '10:30');
  assert.equal(rows[2].start, null);
  assert.ok(rows.slice(-1)[0].end < before);
});
t('모든 대안에 필수 방문지 4곳 포함', () => {
  Object.values(trip.plans).forEach(pl => {
    const s = E.mandatoryStatus(trip.mandatory, pl.days);
    assert.deepEqual(s.missing, []); assert.deepEqual(s.excluded, []);
  });
});
t('필수 방문지 누락 시 복구', () => {
  const days = JSON.parse(JSON.stringify(trip.plans.balanced.days));
  days[2] = days[2].filter(i => i.p !== 'hyanggyo');
  const fixed = E.repairMandatory(trip.mandatory, days, trip.plans.balanced.days);
  assert.deepEqual(fixed, ['hyanggyo']);
  assert.deepEqual(E.mandatoryStatus(trip.mandatory, days).missing, []);
});
t('필수 방문지끼리 순서 교환 거부', () => {
  const items = trip.plans.balanced.days[1];
  const i = items.findIndex(x => x.p === 'jeondong');
  assert.equal(E.move(items, i, 1, trip.mandatory).ok, false);
  assert.equal(E.move(items, 0, 1, trip.mandatory).ok, true);
});
t('좌표 검증', () => { assert.ok(!E.validCoord(91, 0)); assert.ok(!E.validCoord('a', 1)); assert.ok(E.validCoord(35.8, 127.1)); });
t('이스케이프', () => { assert.equal(E.esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;'); });
t('현재 항목 인덱스', () => {
  const items = trip.plans.balanced.days[1];
  assert.equal(E.currentIndex(items, {}), 0);
  assert.equal(E.currentIndex(items, { 'd1-parking': { status: 'done' } }), 1);
});
t('길찾기 URL', () => { assert.ok(E.directionsUrl(pb.jeondong, 'walk').includes('destination=35.8133%2C127.1497')); });
t('항목 검증', () => { assert.equal(E.validateItems([{ id: 'x', p: 'nope' }, { id: 'y', p: 'lunch', dur: -5 }], pb).length, 2); });

t('여행 데이터 검증', () => {
  assert.deepEqual(E.validateTrip(trip), []);
  const bad = JSON.parse(JSON.stringify(trip));
  bad.places[0].lat = 200; bad.plans.balanced.days[1][0].p = 'nope'; bad.mandatory = ['zzz'];
  assert.ok(E.validateTrip(bad).length >= 3);
  assert.ok(E.validateTrip(null).length === 1);
});
t('trips/*.json 템플릿·매니페스트 유효', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '../trips');
  JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).forEach(f =>
    assert.deepEqual(E.validateTrip(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), [], f));
  assert.deepEqual(E.validateTrip(JSON.parse(fs.readFileSync(path.join(dir, 'template.json.example'), 'utf8'))), []);
});
console.log(n + ' tests passed');
