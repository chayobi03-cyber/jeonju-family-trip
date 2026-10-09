/* 앱 셸 오프라인 캐시. 지도 타일/Leaflet CDN은 가능한 경우에만 캐시한다. */
var CACHE = 'trip-planner-v1';
var SHELL = ['./', 'index.html', 'css/styles.css', 'js/engine.js', 'js/registry.js', 'js/trips/jeonju.js', 'js/storage.js', 'js/app.js',
  'trips/index.json', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url), same = url.origin === location.origin;
  if (!same && url.hostname.indexOf('unpkg.com') < 0) return; // 지도 타일 등은 브라우저 기본 동작
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (m) { return m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()); }); }));
});
