/* 저장소: 구조화 데이터는 localStorage, 사진 Blob은 IndexedDB. 실패는 호출자에게 알린다. */
(function (root) {
  'use strict';
  var KEY = 'trip-planner.v2';
  var DB = 'trip-planner-photos', STORE = 'photos';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (e) { return null; }
  }

  /** @returns {{ok:boolean,error?:string}} */
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return { ok: true }; }
    catch (e) { return { ok: false, error: '브라우저 저장에 실패했습니다 (용량 부족 또는 저장 차단): ' + (e && e.name) }; }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('IndexedDB를 사용할 수 없습니다.'));
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var s = req.result.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('byPlace', 'placeKey');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('사진 DB를 열 수 없습니다.')); };
    });
  }
  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); db.close(); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('사진 저장 실패')); db.close(); };
      });
    });
  }

  var photos = {
    add: function (rec) { return tx('readwrite', function (s) { return s.put(rec); }); },
    remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
    byPlace: function (placeKey) {
      return tx('readonly', function (s) { return s.index('byPlace').getAll(placeKey); });
    }
  };

  /** 이미지 파일을 검증하고 최대 변 1280px JPEG로 축소한다. */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('이미지 파일만 추가할 수 있습니다.'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('15MB 이하 이미지만 추가할 수 있습니다.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1280, sc = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('이미지 변환 실패')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
      img.src = url;
    });
  }

  root.Storage = { load: load, save: save, photos: photos, shrinkImage: shrinkImage };
})(window);
