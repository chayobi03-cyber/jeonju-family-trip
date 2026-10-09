// 휴대폰 에뮬레이션 점검 (터치/뷰포트/오프라인/PWA/가져오기). 실기기 검증을 대체하지 않는다.
const pw = require(process.env.PW_MODULE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[f.split('.').pop()] || 'application/octet-stream'); r.end(d); }); });
let n = 0; const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else { n++; console.log('ok -', m); } };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = 'http://localhost:' + srv.address().port + '/';
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const name of ['iPhone 13', 'Pixel 7', 'iPhone SE']) {
    const ctx = await b.newContext({ ...pw.devices[name] }); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.route(/unpkg\.com|openstreetmap/, r => r.abort());
    await pg.goto(url); await pg.waitForSelector('.stepper');
    for (const tab of ['now', 'plan', 'map', 'places', 'settings']) {
      await pg.tap(`[data-act=tab][data-id=${tab}]`);
      ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: ${tab} 가로 스크롤 없음`);
    }
    await pg.tap('[data-act=tab][data-id=now]');
    const small = await pg.evaluate(() => [...document.querySelectorAll('button:not([hidden]),input[type=checkbox]')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 28 || e.getBoundingClientRect().width < 28)).map(e => e.textContent.trim().slice(0, 10)));
    ok(small.length === 0, `${name}: 터치 대상 28px 이상 ${small.join(',')}`);
    ok(await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('textarea')).fontSize) >= 16), `${name}: 입력 글자 16px 이상(iOS 확대 방지)`);
    await pg.tap('[data-act=status][data-v=arrived]'); await pg.tap('.big-btn');
    ok(await pg.locator('.stepper button.done').count() === 1, `${name}: 터치로 진행`);
    ok(errs.length === 0, `${name}: 오류 없음 ${errs}`);
    await ctx.close();
  }
  // PWA / 오프라인 / 가져오기
  const ctx = await b.newContext({ ...pw.devices['Pixel 7'], serviceWorkers: 'allow' }); const pg = await ctx.newPage();
  await pg.route(/unpkg\.com|openstreetmap/, r => r.abort());
  await pg.goto(url); await pg.evaluate(() => navigator.serviceWorker.ready); await pg.reload(); await pg.waitForSelector('.stepper');
  const man = await (await pg.request.get(url + 'manifest.webmanifest')).json();
  ok(man.display === 'standalone' && man.icons.length >= 2, '매니페스트 유효');
  for (const i of man.icons) ok((await pg.request.get(url + i.src)).ok(), '아이콘 존재 ' + i.src);
  await ctx.setOffline(true); await pg.reload(); await pg.waitForSelector('.stepper', { timeout: 5000 });
  ok(await pg.locator('h1').innerText() === '전주 가족 1박 2일', '오프라인에서도 앱 실행');
  await ctx.setOffline(false);
  const tpl = JSON.parse(fs.readFileSync(path.join(root, 'trips/template.json.example'), 'utf8'));
  await pg.tap('[data-act=tab][data-id=settings]');
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.tap('[data-act=import-trip]')]);
  await fc.setFiles({ name: 't.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tpl)) });
  await pg.waitForSelector('#tripTitle:has-text("새 여행 제목")');
  ok((await pg.locator('#tripSel option').count()) === 2, '다른 여행지 JSON 가져오기');
  await pg.tap('[data-act=tab][data-id=settings]');
  const [fc2] = await Promise.all([pg.waitForEvent('filechooser'), pg.tap('[data-act=import-trip]')]);
  await fc2.setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"id":"x"}') });
  await pg.waitForSelector('#notice .err');
  ok((await pg.locator('#tripSel option').count()) === 2, '잘못된 여행 파일은 거부');
  console.log(n + ' mobile checks passed'); await b.close(); srv.close();
})();
