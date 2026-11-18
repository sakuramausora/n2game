/* wordsearch.js — karta „Word search” dla aplikacji N2.
   Wymaga: n2data.js, engine.js oraz API przekazanego z app.js.
   Używa wyłącznie słówek z statusem „znam” albo „uczę się”,
   samych kanji i o długości min. 2 znaki. Działa offline. */
(function () {
  'use strict';

  var KANJI_WORD = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]{2,}$/;
  var KANJI_ONE = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/;
  var DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var MAX_WORDS = 12;
  var MODE_KEY = 'n2ws.mode.v1';
  var BAG_KEY = 'n2ws.bag.v1';
  var FALLBACK_KANJI = ['一', '二', '三', '人', '日', '本', '語', '学', '生', '年', '時', '間', '力', '心', '手', '大'];

  var api = null;
  var view = {
    mode: 'learn',
    board: null,
    dict: {},
    found: {},
    category: {},
    catFound: 0,
    listEl: null,
    listCountEl: null,
    listEmptyEl: null,
    selected: [],
    dragging: false,
    cellEls: [],
    rows: {},
    toastTimer: null
  };

  // ---------------- API ----------------
  function init(a) {
    api = a;
    try {
      var saved = localStorage.getItem(MODE_KEY);
      if (saved === 'know' || saved === 'learn') view.mode = saved;
    } catch (e) {}
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('pointerup', function () { view.dragging = false; });
    }
    view.dict = fullDictionary();
    injectCss();
  }

  function setMode(mode) {
    view.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
  }

  // ---------------- dane ----------------
  function eligible(mode) {
    var out = [], seen = {};
    if (!api) return out;
    api.words.forEach(function (item, i) {
      if (api.statusOf(i) !== mode) return;
      if (!KANJI_WORD.test(item.w)) return;      // tylko kanji, min. 2 znaki, bez kany i znaków specjalnych
      if (seen[item.w]) return;                  // usuwa duplikaty tego samego zapisu
      seen[item.w] = 1;
      out.push({ word: item.w, item: item });
    });
    return out;
  }

  // Pełny słownik: słowa N2 + JMdict. Można znaleźć dowolne istniejące słowo,
  // nie tylko 12 ukrytych z kategorii. Słownik budujemy raz przy starcie.
  function fullDictionary() {
    var dict = {};
    if (!api) return dict;
    api.words.forEach(function (item) {
      if (!KANJI_WORD.test(item.w)) return;
      if (!dict[item.w]) dict[item.w] = item;
    });
    var extra = window.N2_JMDICT && window.N2_JMDICT.words;
    if (extra) {
      Object.keys(extra).forEach(function (w) {
        if (!KANJI_WORD.test(w) || dict[w]) return;
        var e = extra[w] || {};
        dict[w] = { w: w, r: e.r || '', m: e.m || 'słowo', p: 'N', t: 'general', x: [] };
      });
    }
    return dict;
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Pełna rotacja słów: dopóki worek się nie wyczerpie, żadne słowo nie wróci.
  function loadBag(mode, all) {
    var words = all.map(function (e) { return e.word; });
    var known = {};
    words.forEach(function (w) { known[w] = 1; });
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(BAG_KEY) || '{}'); } catch (e) {}
    var entry = stored && stored[mode] ? stored[mode] : null;
    var hadBag = !!(entry && Array.isArray(entry.list));
    // nie dodajemy brakujących słów z powrotem — to właśnie one zostały już użyte
    var list = hadBag ? entry.list.filter(function (w) { return known[w]; }) : shuffle(words);
    var last = entry && Array.isArray(entry.last) ? entry.last : [];

    if (list.length < MAX_WORDS) {
      list = shuffle(words.filter(function (w) { return last.indexOf(w) < 0; }));
      if (list.length < MAX_WORDS) list = shuffle(words);
    }
    return { list: list, last: last };
  }
  function saveBag(mode, bag, used) {
    try {
      var o = JSON.parse(localStorage.getItem(BAG_KEY) || '{}');
      if (!o || typeof o !== 'object') o = {};
      o[mode] = { list: bag.list.filter(function (w) { return used.indexOf(w) < 0; }), last: used };
      localStorage.setItem(BAG_KEY, JSON.stringify(o));
    } catch (e) {}
  }

  function key(r, c) { return r + ',' + c; }

  function sameCell(a, b) { return !!a && !!b && a[0] === b[0] && a[1] === b[1]; }

  function adjacent(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
  }

  function occurrences(grid, size, word) {
    var hits = [], len = word.length;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        for (var d = 0; d < DIRS.length; d++) {
          var dir = DIRS[d], cells = [], ok = true;
          for (var i = 0; i < len; i++) {
            var rr = r + dir[0] * i, cc = c + dir[1] * i;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) { ok = false; break; }
            if (grid[rr * size + cc] !== word[i]) { ok = false; break; }
            cells.push([rr, cc]);
          }
          if (ok) hits.push(cells);
        }
      }
    }
    return hits;
  }

  function fillerPool(placed) {
    var chars = {}, pool;
    placed.forEach(function (p) {
      p.word.split('').forEach(function (ch) { chars[ch] = 1; });
    });
    pool = Object.keys(chars);
    var kanjiKeys = api && api.kanji ? Object.keys(api.kanji).filter(function (k) { return KANJI_ONE.test(k); }) : [];
    pool = pool.concat(shuffle(kanjiKeys).slice(0, 24));
    pool = pool.concat(FALLBACK_KANJI);
    return pool.length ? pool : FALLBACK_KANJI;
  }

  function isPlacement(cells, p) {
    return cells.length === p.cells.length &&
      cells.every(function (rc, k) { return sameCell(rc, p.cells[k]); });
  }

  function badCount(grid, size, placed) {
    var n = 0;
    placed.forEach(function (p) {
      occurrences(grid, size, p.word).forEach(function (h) {
        if (!isPlacement(h, p)) n++;
      });
    });
    return n;
  }

  // wypełnia puste pola kanji i czyści przypadkowe dodatkowe wystąpienia słów
  function fillGrid(grid, size, placed) {
    var pool = fillerPool(placed), reserved = {};
    placed.forEach(function (p) {
      p.cells.forEach(function (rc) { reserved[key(rc[0], rc[1])] = 1; });
    });

    for (var i = 0; i < grid.length; i++) {
      if (grid[i] === null) grid[i] = pool[Math.floor(Math.random() * pool.length)];
    }

    var before = badCount(grid, size, placed);
    for (var pass = 0; pass < 40 && before > 0; pass++) {
      var changed = false;
      for (var pi = 0; pi < placed.length && !changed; pi++) {
        var p = placed[pi], hits = occurrences(grid, size, p.word);
        for (var h = 0; h < hits.length && !changed; h++) {
          if (isPlacement(hits[h], p)) continue;

          // zmieniamy tylko pole, które nie należy do żadnego z ukrytych słów
          var free = null;
          for (var j = 0; j < hits[h].length; j++) {
            if (!reserved[key(hits[h][j][0], hits[h][j][1])]) { free = hits[h][j]; break; }
          }
          if (!free) continue;

          var idx = free[0] * size + free[1], orig = grid[idx];
          var alts = shuffle(pool.filter(function (ch) { return ch !== orig; }));
          for (var a = 0; a < alts.length; a++) {
            grid[idx] = alts[a];
            var now = badCount(grid, size, placed);
            if (now < before) { before = now; changed = true; break; }
          }
          if (!changed) grid[idx] = orig;
        }
      }
      if (!changed) break;
    }
  }

  function generate(mode) {
    // bez sortowania wg długości + pełna rotacja puli
    var all = eligible(mode);
    if (!all.length) return null;
    var bag = loadBag(mode, all);
    var byWord = {};
    all.forEach(function (e) { byWord[e.word] = e; });
    var chosen = bag.list.slice(0, MAX_WORDS).map(function (w) { return byWord[w]; }).filter(Boolean);
    if (!chosen.length) return null;

    var longest = chosen.reduce(function (m, e) { return Math.max(m, e.word.length); }, 2);
    var total = chosen.reduce(function (n, e) { return n + e.word.length; }, 0);
    var size = Math.max(10, Math.min(15, longest + 4, Math.ceil(Math.sqrt(total * 3)) + 2));
    var grid = new Array(size * size).fill(null);
    var placed = [];

    chosen.forEach(function (entry) {
      var spots = [];
      for (var d = 0; d < DIRS.length; d++) {
        var dir = DIRS[d];
        for (var r = 0; r < size; r++) {
          for (var c = 0; c < size; c++) {
            var cells = [], ok = true;
            for (var i = 0; i < entry.word.length; i++) {
              var rr = r + dir[0] * i, cc = c + dir[1] * i;
              if (rr < 0 || rr >= size || cc < 0 || cc >= size) { ok = false; break; }
              var cur = grid[rr * size + cc];
              if (cur !== null && cur !== entry.word[i]) { ok = false; break; }
              cells.push([rr, cc]);
            }
            if (ok) spots.push(cells);
          }
        }
      }
      if (!spots.length) return;
      var pick = shuffle(spots)[0];
      pick.forEach(function (rc, i) { grid[rc[0] * size + rc[1]] = entry.word[i]; });
      placed.push({ word: entry.word, item: entry.item, cells: pick });
    });

    if (!placed.length) return null;
    saveBag(mode, bag, placed.map(function (e) { return e.word; }));
    fillGrid(grid, size, placed);
    return { mode: mode, size: size, grid: grid, placed: placed };
  }

  // ---------------- interakcja ----------------
  function paint() {
    var selected = {};
    view.selected.forEach(function (rc) { selected[key(rc[0], rc[1])] = 1; });
    view.cellEls.forEach(function (el, idx) {
      var r = Math.floor(idx / view.board.size), c = idx % view.board.size;
      el.classList.toggle('sel', !!selected[key(r, c)]);
    });
    var active = view.active || '';
    if (view.activeEl) view.activeEl.textContent = active ? 'Wybór: ' + active : '';
  }

  function say(text, kind) {
    if (!view.msgEl) return;
    view.msgEl.textContent = text || '';
    view.msgEl.className = 'ws-msg' + (kind ? ' ' + kind : '');
    if (view.toastTimer) clearTimeout(view.toastTimer);
    if (text && kind === 'good') {
      view.toastTimer = setTimeout(function () {
        if (view.msgEl) { view.msgEl.textContent = ''; view.msgEl.className = 'ws-msg'; }
      }, 2600);
    }
  }

  // klasyczna zasada: słowo musi leżeć w jednej linii (poziomo, pionowo, po przekątnej)
  function isStraight(cells) {
    if (cells.length < 2) return false;
    var dr = cells[1][0] - cells[0][0], dc = cells[1][1] - cells[0][1];
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return false;
    for (var i = 1; i < cells.length; i++) {
      if (cells[i][0] - cells[i - 1][0] !== dr || cells[i][1] - cells[i - 1][1] !== dc) return false;
    }
    return true;
  }

  function checkSelection() {
    var s = view.selected.map(function (rc) {
      return view.board.grid[rc[0] * view.board.size + rc[1]];
    }).join('');
    view.active = s;
    paint();
    if (s.length < 2 || !isStraight(view.selected)) return;

    var rev = s.split('').reverse().join('');
    var word = view.dict[s] ? s : (view.dict[rev] ? rev : null);
    if (!word || view.found[word]) return;
    var cells = view.dict[s] ? view.selected.slice() : view.selected.slice().reverse();
    markFound(word, view.dict[word], cells);
  }

  function updateProgress() {
    var n = Object.keys(view.found).length, total = view.board.placed.length;
    if (view.progressEl) {
      view.progressEl.textContent = 'Znalezione: ' + n + ' · z kategorii: ' + view.catFound + '/' + total;
    }
    if (view.listCountEl) view.listCountEl.textContent = '(' + n + ')';
  }

  function addFoundRow(word, item) {
    if (!view.listEl) return;
    if (view.listEmptyEl) {
      view.listEmptyEl.parentNode.removeChild(view.listEmptyEl);
      view.listEmptyEl = null;
    }
    var row = api.el('button', 'ws-row');
    row.appendChild(api.el('span', 'ws-row-word', api.esc(word)));
    row.setAttribute('type', 'button');
    row.onclick = function () { api.openWord(item); };
    view.rows[word] = row;
    view.listEl.appendChild(row);
    view.listEl.scrollTop = view.listEl.scrollHeight;
  }

  function markFound(word, item, cells) {
    view.found[word] = true;
    var hit = function (rc) {
      var el = view.cellEls[rc[0] * view.board.size + rc[1]];
      if (el) el.classList.add('hit');
    };
    cells.forEach(hit);
    if (view.category[word]) {
      view.category[word].cells.forEach(hit);
      view.catFound++;
    }
    addFoundRow(word, item);
    updateProgress();
    say('✓ ' + word + ' — ' + api.meaning(item), 'good');
    if (api.speak) api.speak(word);
    view.selected = [];
    view.active = '';
    paint();
    if (view.catFound === view.board.placed.length && view.doneEl) {
      view.doneEl.textContent = '🎉 Wszystkie słowa z kategorii znalezione! Kliknij „Nowa plansza” po więcej.';
      view.doneEl.classList.add('on');
    }
  }

  function extendTo(cell) {
    if (!view.selected.length) return;
    var last = view.selected[view.selected.length - 1];
    if (sameCell(last, cell)) return;

    var prev = view.selected.length > 1 ? view.selected[view.selected.length - 2] : null;
    if (prev && sameCell(prev, cell)) {           // cofnięcie się po ścieżce
      view.selected.pop();
      checkSelection();
      return;
    }
    var already = view.selected.some(function (rc) { return sameCell(rc, cell); });
    if (adjacent(last, cell) && !already) {
      view.selected.push(cell);
      checkSelection();
    }
  }

  function press(cell) {
    if (!view.board) return;
    var last = view.selected[view.selected.length - 1];
    var already = view.selected.some(function (rc) { return sameCell(rc, cell); });
    if (last && adjacent(last, cell) && !already) extendTo(cell);
    else { view.selected = [cell]; checkSelection(); }
    view.dragging = true;
  }

  // ---------------- widok ----------------
  function rebuild() {
    var host = document.querySelector('#app');
    if (!host) return;
    host.innerHTML = '';
    render();
  }

  function render() {
    if (!api) return;
    var sec = api.el('section', 'view ws-view');

    var head = api.el('div', 'ws-head');
    head.appendChild(api.el('h2', '', '🔤 Word search — kanji N2'));
    head.appendChild(api.el('p', 'dim', 'Szukaj dowolnych słów z bazy N2 — nie tylko tych ukrytych. W kratce jest dużo słów z wybranej kategorii. Wybieraj pola wzdłuż jednej linii (poziomo, pionowo lub po przekątnej).'));
    sec.appendChild(head);

    var counts = { know: eligible('know').length, learn: eligible('learn').length };
    var controls = api.el('div', 'card ws-controls');
    var modes = api.el('div', 'ws-modes');
    [['know', '✅ Znam'], ['learn', '📖 Uczę się']].forEach(function (pair) {
      var b = api.el('button', 'btn mini ws-mode' + (view.mode === pair[0] ? ' on' : ''),
        pair[1] + ' <span class="ws-count">' + counts[pair[0]] + '</span>');
      b.setAttribute('data-mode', pair[0]);
      b.onclick = function () { if (view.mode === pair[0]) return; setMode(pair[0]); rebuild(); };
      modes.appendChild(b);
    });
    controls.appendChild(modes);
    var actions = api.el('div', 'ws-actions');
    var nb = api.el('button', 'btn pri', '🎲 Nowa plansza');
    nb.onclick = function () { rebuild(); };
    actions.appendChild(nb);
    controls.appendChild(actions);
    sec.appendChild(controls);

    var layout = api.el('div', 'ws-layout');
    var boardCard = api.el('div', 'card ws-board-card');
    var boardHead = api.el('div', 'ws-board-head');
    view.progressEl = api.el('span', 'ws-progress', '');
    boardHead.appendChild(view.progressEl);
    boardHead.appendChild(api.el('span', 'dim', view.mode === 'know' ? 'słowa: znam' : 'słowa: uczę się'));
    boardCard.appendChild(boardHead);

    view.board = generate(view.mode);
    view.found = {};
    view.category = {};
    view.catFound = 0;
    if (view.board) view.board.placed.forEach(function (p) { view.category[p.word] = p; });
    view.selected = [];
    view.active = '';
    view.rows = {};
    view.listEl = null;
    view.listCountEl = null;
    view.listEmptyEl = null;
    view.cellEls = [];
    view.msgEl = null;
    if (view.toastTimer) { clearTimeout(view.toastTimer); view.toastTimer = null; }

    if (!view.board) {
      boardCard.appendChild(api.el('div', 'ws-empty',
        'Nie masz jeszcze słówek w tej kategorii (albo żadne z nich nie składa się wyłącznie z kanji i ma min. 2 znaki). ' +
        'Przełącz na drugą kategorię albo oznacz słówka jako „Znam” / „Uczę się”.'));
      layout.appendChild(boardCard);
      sec.appendChild(layout);
      document.querySelector('#app').appendChild(sec);
      return;
    }

    var board = api.el('div', 'ws-board');
    board.style.setProperty('--ws-size', view.board.size);
    for (var r = 0; r < view.board.size; r++) {
      for (var c = 0; c < view.board.size; c++) {
        var cell = api.el('button', 'ws-cell', api.esc(view.board.grid[r * view.board.size + c]));
        cell.setAttribute('type', 'button');
        cell.setAttribute('data-r', r);
        cell.setAttribute('data-c', c);
        (function (rr, cc) {
          cell.addEventListener('click', function (e) { if (e.detail === 0) press([rr, cc]); });
        })(r, c);
        board.appendChild(cell);
        view.cellEls.push(cell);
      }
    }
    boardCard.appendChild(board);

    view.msgEl = api.el('div', 'ws-msg', '');
    view.activeEl = api.el('div', 'ws-msg ws-active', '');
    boardCard.appendChild(view.msgEl);
    boardCard.appendChild(view.activeEl);
    boardCard.appendChild(api.el('p', 'dim', 'Kliknięcie pola nie sąsiadującego z poprzednim zaczyna nowe słowo. Znalezione słowa pojawiają się po prawej — kliknij je, by zobaczyć szczegóły.'));
    layout.appendChild(boardCard);

    var listCard = api.el('div', 'card ws-list-card');
    var listHead = api.el('div', 'ws-list-head');
    listHead.appendChild(api.el('h3', '', 'Znalezione słowa'));
    view.listCountEl = api.el('span', 'ws-count', '(0)');
    listHead.appendChild(view.listCountEl);
    listCard.appendChild(listHead);
    view.listEl = api.el('div', 'ws-list');
    view.listEmptyEl = api.el('div', 'ws-empty', 'Lista jest pusta. Znajdź pierwsze słowo w kratce — pojawi się tutaj.');
    view.listEl.appendChild(view.listEmptyEl);
    listCard.appendChild(view.listEl);
    view.doneEl = api.el('div', 'ws-done', '');
    listCard.appendChild(view.doneEl);
    layout.appendChild(listCard);

    sec.appendChild(layout);
    document.querySelector('#app').appendChild(sec);

    // przeciąganie po planszy (mysz i dotyk)
    board.addEventListener('pointerdown', function (e) {
      var cell = e.target.closest ? e.target.closest('.ws-cell') : null;
      if (!cell || !board.contains(cell)) return;
      e.preventDefault();
      if (board.setPointerCapture) {
        try { board.setPointerCapture(e.pointerId); } catch (err) {}
      }
      press([+cell.dataset.r, +cell.dataset.c]);
    });
    board.addEventListener('pointermove', function (e) {
      if (!view.dragging) return;
      var under = document.elementFromPoint(e.clientX, e.clientY);
      var cell = under && under.closest ? under.closest('.ws-cell') : null;
      if (cell && board.contains(cell)) extendTo([+cell.dataset.r, +cell.dataset.c]);
    });
    function stop() { view.dragging = false; }
    board.addEventListener('pointerup', stop);
    board.addEventListener('pointercancel', stop);

    paint();
    updateProgress();
  }

  // ---------------- CSS (wstrzykiwany raz, żeby nie ruszać index.html) ----------------
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('n2ws-css')) return;
    var css = '' +
      '.ws-head h2{margin:0 0 4px;}' +
      '.ws-controls{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}' +
      '.ws-modes,.ws-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}' +
      '.ws-mode.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600;}' +
      '.ws-count{opacity:.8;font-size:11px;margin-left:3px;}' +
      '.ws-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.75fr);gap:12px;align-items:start;}' +
      '@media(max-width:780px){.ws-layout{grid-template-columns:1fr;}}' +
      '.ws-board-head{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:13px;margin-bottom:10px;}' +
      '.ws-progress{font-weight:700;color:var(--accent2);}' +
      '.ws-board{display:grid;grid-template-columns:repeat(var(--ws-size),minmax(0,1fr));gap:3px;width:100%;max-width:620px;margin:0 auto;touch-action:none;}' +
      '.ws-cell{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;padding:0;' +
      'background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);' +
      'font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:clamp(15px,3.2vw,23px);' +
      'cursor:pointer;user-select:none;-webkit-user-select:none;transition:background .1s,border-color .1s;}' +
      '.ws-cell:hover{border-color:var(--accent2);}' +
      '.ws-cell.sel{background:rgba(244,185,66,.3);border-color:var(--accent2);color:#fff;}' +
      '.ws-cell.hit{background:rgba(67,181,129,.28);border-color:var(--ok);color:#fff;}' +
      '.ws-cell.hit.sel{background:rgba(67,181,129,.45);}' +
      '.ws-msg{min-height:20px;text-align:center;font-size:13px;color:var(--ink-dim);margin:10px 0 0;}' +
      '.ws-msg.good{color:var(--ok);font-weight:600;}' +
      '.ws-active{font-size:12px;letter-spacing:1px;}' +
      '.ws-empty{padding:24px 12px;text-align:center;color:var(--ink-dim);}' +
      '.ws-list-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}' +
      '.ws-list-head h3{margin:0 0 8px;}' +
      '.ws-list{display:flex;flex-direction:column;gap:6px;max-height:540px;overflow:auto;}' +
      '.ws-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:var(--panel2);' +
      'border:1px solid var(--line);border-radius:10px;padding:7px 10px;color:var(--ink);text-align:left;font:inherit;cursor:pointer;}' +
      '.ws-row:hover{border-color:var(--accent);}' +
      '.ws-row.found{border-color:rgba(67,181,129,.55);background:rgba(67,181,129,.08);}' +
      '.ws-row-word{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:18px;line-height:1.2;}' +
      '.ws-check{color:var(--ok);margin-right:6px;}' +
      '.ws-done{margin-top:10px;color:var(--ok);font-weight:700;text-align:center;font-size:13px;display:none;}' +
      '.ws-done.on{display:block;}';
    var s = document.createElement('style');
    s.id = 'n2ws-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  window.N2WS = {
    init: init,
    render: render,
    debug: {
      eligible: eligible, generate: generate, occurrences: occurrences,
      current: function () { return view.board; },
      dict: function () { return view.dict; },
      lookup: function (w) { return view.dict[w] || null; }
    }
  };
})();
