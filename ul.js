/* 밑줄 기능: 글자를 드래그(모바일은 길게 눌러 선택)하면 뜨는 버튼으로 밑줄. 밑줄을 누르면 지우기.
   저장: 이 브라우저(localStorage) + 가능하면 계정(db, 본인만 보는 private 문서)에 동기화. */
(function () {
  'use strict';
  var PAGE = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';
  var LKEY = 'ul:v1:' + PAGE;
  var BLOCK = '.pair .en,.pair .ko,.box,.box li,main p,main li,td,th,h1,h2,h3,h4,.pt,.slide-title,.xqq,.xa';
  var SKIP = '.snav,.ul-bar,.ul-panel,.ul-fab,select,button,.top-btn,.legend';
  var marks = [];           // {id, b:blockIndex, h:hash, s, e, t:text, c:color, at}
  var blocks = [];
  var dbRef = null, saveTimer = null, synced = false;

  /* ---------- styles ---------- */
  var css = document.createElement('style');
  css.textContent =
    ':root{--u-r:#D6334B;--u-b:#2A5FAF;--u-bg:#fff;--u-ink:#1D2A2B;--u-line:#D2E1DB}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--u-r:#FF7A8C;--u-b:#8DB4F0;--u-bg:#18211F;--u-ink:#E2ECE9;--u-line:#2A3A36}}' +
    ':root[data-theme="dark"]{--u-r:#FF7A8C;--u-b:#8DB4F0;--u-bg:#18211F;--u-ink:#E2ECE9;--u-line:#2A3A36}' +
    'u.mu{cursor:pointer;text-decoration-skip-ink:none}' +
    'u.mu.r{text-decoration:underline 2.5px var(--u-r);text-underline-offset:3px;background:none}' +
    'u.mu.b{text-decoration:underline 2.5px var(--u-b);text-underline-offset:3px;background:none}' +
    'u.mu.flash{outline:2px solid var(--u-r);outline-offset:2px;border-radius:2px}' +
    '.ul-bar{position:fixed;z-index:60;display:none;gap:4px;padding:5px;border-radius:12px;background:var(--u-bg);border:1.5px solid var(--u-line);box-shadow:0 4px 16px rgba(0,0,0,.18);font:700 13px/1 "Nanum Gothic",sans-serif}' +
    '.ul-bar button{font:inherit;border:0;border-radius:8px;padding:8px 10px;cursor:pointer;background:transparent;color:var(--u-ink);display:inline-flex;align-items:center;gap:5px;min-height:34px}' +
    '.ul-bar button:hover{background:rgba(127,127,127,.15)}' +
    '.ul-bar .sw{display:inline-block;width:14px;height:3px;border-radius:2px}' +
    '.ul-fab{position:fixed;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:55;height:46px;padding:0 14px;border-radius:14px;background:var(--u-bg);color:var(--u-ink);border:1.5px solid var(--u-line);box-shadow:0 2px 8px rgba(0,0,0,.15);font:800 14px "Nanum Gothic",sans-serif;cursor:pointer}' +
    '.ul-fab b{color:var(--u-r)}' +
    '.ul-panel{position:fixed;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(68px + env(safe-area-inset-bottom,0px));z-index:56;width:min(380px,calc(100vw - 28px));max-height:min(60vh,520px);overflow:auto;background:var(--u-bg);color:var(--u-ink);border:1.5px solid var(--u-line);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.2);padding:12px 14px;font:14px/1.6 "Nanum Gothic",sans-serif;display:none}' +
    '.ul-panel h2{font-size:15px;margin:0 0 2px}.ul-panel .st{font-size:12px;opacity:.65;margin:0 0 8px}' +
    '.ul-panel ol{margin:0;padding-left:1.3em}.ul-panel li{margin:4px 0;cursor:pointer}.ul-panel li:hover{text-decoration:underline}' +
    '.ul-panel li.r::marker{color:var(--u-r)}.ul-panel li.b::marker{color:var(--u-b)}' +
    '.ul-panel .row{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:10px}' +
    '.ul-panel button{font:inherit;font-size:12.5px;font-weight:700;border:1.5px solid var(--u-line);background:transparent;color:var(--u-ink);border-radius:8px;padding:5px 9px;cursor:pointer}' +
    '.ul-panel button.danger{color:var(--u-r);border-color:var(--u-r)}' +
    '@media print{.ul-bar,.ul-fab,.ul-panel{display:none!important}}';
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  function hash(s) { var h = 0; s = s.slice(0, 80); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function textNodes(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), out = [], n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function blockOf(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(SKIP)) return null;
    return el.closest(BLOCK);
  }
  function offsetIn(block, node, off) {
    var ns = textNodes(block), t = 0;
    for (var i = 0; i < ns.length; i++) { if (ns[i] === node) return t + off; t += ns[i].nodeValue.length; }
    return -1;
  }
  function indexBlocks() { blocks = Array.prototype.slice.call(document.querySelectorAll(BLOCK)).filter(function (b) { return !b.closest(SKIP); }); }

  /* ---------- draw ---------- */
  function wrap(block, s, e, m) {
    var ns = textNodes(block), t = 0;
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i], len = n.nodeValue.length, a = Math.max(s, t), z = Math.min(e, t + len);
      if (a < z) {
        var mid = n;
        if (a - t > 0) mid = n.splitText(a - t);
        if (z - a < mid.nodeValue.length) mid.splitText(z - a);
        if (mid.nodeValue.trim()) {
          var u = document.createElement('u');
          u.className = 'mu ' + (m.c || 'r'); u.setAttribute('data-mid', m.id);
          mid.parentNode.insertBefore(u, mid); u.appendChild(mid);
        }
      }
      t += len;
    }
  }
  function clearAll() {
    Array.prototype.slice.call(document.querySelectorAll('u.mu')).forEach(function (u) {
      var p = u.parentNode; while (u.firstChild) p.insertBefore(u.firstChild, u); p.removeChild(u); p.normalize();
    });
  }
  function locate(m) {
    var b = blocks[m.b];
    if (b && hash(b.textContent) === m.h && b.textContent.slice(m.s, m.e) === m.t) return { b: b, s: m.s, e: m.e };
    for (var i = 0; i < blocks.length; i++) {            // 페이지가 바뀌었으면 같은 문장을 찾아 다시 붙임
      var k = blocks[i].textContent.indexOf(m.t);
      if (m.t && k >= 0 && blocks[i].querySelectorAll(BLOCK).length === 0) return { b: blocks[i], s: k, e: k + m.t.length };
    }
    return null;
  }
  function render() {
    clearAll(); indexBlocks();
    marks.forEach(function (m) { var L = locate(m); if (L) wrap(L.b, L.s, L.e, m); });
    updateFab();
  }

  /* ---------- storage ---------- */
  function loadLocal() { try { var v = JSON.parse(localStorage.getItem(LKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function saveLocal() { try { localStorage.setItem(LKEY, JSON.stringify(marks)); } catch (e) {} }
  function save() {
    saveLocal();
    if (!dbRef) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      dbRef.set({ marks: marks, del: loadRemoved(), updated: Date.now() }).catch(function () {});
    }, 700);
  }
  function merge(a, b) {
    var byId = {}; a.concat(b).forEach(function (m) { if (m && m.id && !byId[m.id]) byId[m.id] = m; });
    return Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (x, y) { return (x.b - y.b) || (x.s - y.s); });
  }
  function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    Promise.all([window.claude.use('db'), window.claude.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) return;
      return user.id().then(function (id) {
        if (!id) return;
        dbRef = db.collection('data/users/' + id).doc('ul-' + PAGE);
        var timer = setTimeout(function () { synced = false; updateFab(); }, 10000);
        return dbRef.get().then(function (snap) {
          clearTimeout(timer);
          var remote = snap.exists && snap.data() && Array.isArray(snap.data().marks) ? snap.data().marks : [];
          var rdel = snap.exists && snap.data() && Array.isArray(snap.data().del) ? snap.data().del : [];
          var removed = loadRemoved().concat(rdel.filter(function (x) { return loadRemoved().indexOf(x) < 0; }));
          try { localStorage.setItem(LKEY + ':del', JSON.stringify(removed.slice(-500))); } catch (e) {}
          var merged = merge(marks, remote).filter(function (m) { return removed.indexOf(m.id) < 0; });
          var changed = merged.length !== remote.length || removed.length !== rdel.length;
          marks = merged; synced = true; render(); saveLocal();
          if (changed) save();
        });
      });
    }).catch(function () {});
  }
  // 지운 밑줄이 다른 기기 기록 때문에 되살아나지 않도록 기억
  function loadRemoved() { try { return JSON.parse(localStorage.getItem(LKEY + ':del') || '[]'); } catch (e) { return []; } }
  function addRemoved(ids) { try { var r = loadRemoved().concat(ids).slice(-500); localStorage.setItem(LKEY + ':del', JSON.stringify(r)); } catch (e) {} }

  /* ---------- toolbar ---------- */
  var bar = document.createElement('div'); bar.className = 'ul-bar'; bar.setAttribute('role', 'toolbar');
  document.body.appendChild(bar);
  var pending = null; // {type:'new', range} | {type:'del', id}
  function showBar(rect, html) {
    bar.innerHTML = html; bar.style.display = 'flex';
    var bw = bar.offsetWidth, bh = bar.offsetHeight, vw = innerWidth, vh = innerHeight;
    var x = Math.min(Math.max(8, rect.left + rect.width / 2 - bw / 2), vw - bw - 8);
    var y = rect.bottom + 10; if (y + bh > vh - 70) y = Math.max(8, rect.top - bh - 10); y = Math.min(Math.max(8, y), vh - bh - 8);
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
  }
  function hideBar() { bar.style.display = 'none'; pending = null; }
  function sel() { var s = getSelection(); return s && s.rangeCount && !s.isCollapsed ? s : null; }
  function checkSelection() {
    var s = sel(); if (!s) { if (pending && pending.type === 'new') hideBar(); return; }
    var r = s.getRangeAt(0);
    if (!blockOf(r.startContainer) && !blockOf(r.endContainer)) return;
    if (!s.toString().trim()) return;
    pending = { type: 'new', range: r.cloneRange() };
    showBar(r.getBoundingClientRect(),
      '<button data-a="r" aria-label="빨간 밑줄"><span class="sw" style="background:var(--u-r)"></span>밑줄</button>' +
      '<button data-a="b" aria-label="파란 밑줄"><span class="sw" style="background:var(--u-b)"></span>파랑</button>');
  }
  var selTimer;
  document.addEventListener('selectionchange', function () { clearTimeout(selTimer); selTimer = setTimeout(checkSelection, 250); });
  bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn || !pending) return;
    var a = btn.getAttribute('data-a');
    if (pending.type === 'new' && (a === 'r' || a === 'b')) addFromRange(pending.range, a);
    if (pending.type === 'del' && a === 'del') removeMark(pending.id);
    hideBar();
  });
  document.addEventListener('click', function (e) {
    var u = e.target.closest && e.target.closest('u.mu');
    if (u && !sel()) {
      e.preventDefault(); e.stopPropagation();
      pending = { type: 'del', id: u.getAttribute('data-mid') };
      showBar(u.getBoundingClientRect(), '<button data-a="del">밑줄 지우기</button>');
      return;
    }
    if (!e.target.closest('.ul-bar') && !sel()) hideBar();
  }, true);
  addEventListener('scroll', function () { if (pending && pending.type === 'del') hideBar(); }, { passive: true });

  function addFromRange(r, color) {
    indexBlocks();
    var root = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
    var ns = textNodes(root).filter(function (n) { return r.intersectsNode(n); });
    if (r.startContainer.nodeType === 3 && ns.indexOf(r.startContainer) < 0) ns.unshift(r.startContainer);
    var per = new Map();
    ns.forEach(function (n) {
      var b = blockOf(n); if (!b) return;
      var a = n === r.startContainer ? r.startOffset : 0;
      var z = n === r.endContainer ? r.endOffset : n.nodeValue.length;
      if (z <= a) return;
      var s = offsetIn(b, n, a), e = offsetIn(b, n, z);
      var cur = per.get(b); per.set(b, cur ? { s: Math.min(cur.s, s), e: Math.max(cur.e, e) } : { s: s, e: e });
    });
    var added = 0, g = uid();
    per.forEach(function (v, b) {
      var bi = blocks.indexOf(b); if (bi < 0) return;
      var t = b.textContent.slice(v.s, v.e);
      if (!t.trim()) return;
      marks.push({ id: uid(), g: g, b: bi, h: hash(b.textContent), s: v.s, e: v.e, t: t, c: color, at: Date.now() });
      added++;
    });
    if (!added) return;
    try { getSelection().removeAllRanges(); } catch (e) {}
    render(); save();
  }
  function removeMark(id) {
    var t = marks.filter(function (m) { return m.id === id; })[0], g = t && (t.g || t.id);
    var gone = marks.filter(function (m) { return (m.g || m.id) === g; }).map(function (m) { return m.id; });
    marks = marks.filter(function (m) { return gone.indexOf(m.id) < 0; }); addRemoved(gone); render(); save();
  }

  /* ---------- list panel ---------- */
  var fab = document.createElement('button'); fab.className = 'ul-fab'; fab.type = 'button';
  var panel = document.createElement('div'); panel.className = 'ul-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '밑줄 모음');
  document.body.appendChild(fab); document.body.appendChild(panel);
  function updateFab() { var n = groups().length; fab.innerHTML = '밑줄 <b>' + n + '</b>'; fab.setAttribute('aria-label', '밑줄 모음, ' + n + '개'); if (panel.style.display === 'block') drawPanel(); }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var armed = false;
  function groups() {
    var o = [], seen = {};
    marks.forEach(function (m) { var k = m.g || m.id; if (!seen[k]) { seen[k] = { id: m.id, c: m.c, t: [] }; o.push(seen[k]); } seen[k].t.push(m.t); });
    return o.map(function (x) { return { id: x.id, c: x.c, t: x.t.join(' ') }; });
  }
  function drawPanel() {
    var gs = groups();
    var st = synced ? '계정에 저장 중 · 다른 기기에서도 보여요' : '이 브라우저에 저장돼요';
    panel.innerHTML = '<h2>이 페이지 밑줄 ' + gs.length + '개</h2><p class="st">' + st + ' · 글자를 드래그하면 밑줄, 밑줄을 누르면 지우기</p>' +
      (gs.length ? '<ol>' + gs.map(function (m) { return '<li class="' + (m.c || 'r') + '" data-id="' + m.id + '">' + esc(m.t.length > 90 ? m.t.slice(0, 90) + '…' : m.t) + '</li>'; }).join('') + '</ol>' : '<p style="margin:0;opacity:.7">아직 밑줄이 없어요.</p>') +
      '<div class="row"><button type="button" data-a="close">닫기</button>' + (marks.length ? '<button type="button" class="danger" data-a="clear">' + (armed ? '한 번 더 누르면 전부 지워요' : '이 페이지 밑줄 전부 지우기') + '</button>' : '') + '</div>';
  }
  fab.addEventListener('click', function () {
    var open = panel.style.display === 'block';
    armed = false; panel.style.display = open ? 'none' : 'block'; if (!open) drawPanel();
  });
  panel.addEventListener('click', function (e) {
    var li = e.target.closest('li[data-id]');
    if (li) {
      var u = document.querySelector('u.mu[data-mid="' + li.getAttribute('data-id') + '"]');
      if (u) {
        var d = u.closest('details'); if (d) d.open = true;
        u.scrollIntoView({ block: 'center' }); u.classList.add('flash'); setTimeout(function () { u.classList.remove('flash'); }, 1600);
        if (innerWidth < 600) panel.style.display = 'none';
      }
      return;
    }
    var a = e.target.closest('button') && e.target.closest('button').getAttribute('data-a');
    if (a === 'close') { panel.style.display = 'none'; armed = false; }
    if (a === 'clear') {
      if (!armed) { armed = true; drawPanel(); return; }
      addRemoved(marks.map(function (m) { return m.id; })); marks = []; armed = false; render(); save(); drawPanel();
    }
  });

  /* ---------- start ---------- */
  marks = loadLocal();
  render();
  connect();
})();
