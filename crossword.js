/* crossword.js — karta „🧩 Krzyżówka N2” dla aplikacji słówek.
   Wymaga: n2data.js, engine.js oraz API przekazanego z app.js.
   Hasła: wyłącznie kanji, min. 2 znaki, ze statusem „znam” albo „uczę się”. */
(function () {
  'use strict';

  var KANJI_WORD = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]{2,}$/;
  var KANJI_ONE = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/;
  var MODE_KEY = 'n2cross.mode.v1';
  var BAG_KEY = 'n2cross.bag.v1';
  var BOUND = 16;          // roboczy obszar przy układaniu haseł
  var TARGET = 10;         // docelowa liczba haseł

  var api = null;
  var view = {
    mode: 'learn', puzzle: null, inputs: [], active: null, dir: 'A',
    solved: {}, paletteOn: true, msgTimer: null
  };

  // ---------------- API ----------------
  function init(a) {
    api = a;
    try {
      var saved = localStorage.getItem(MODE_KEY);
      if (saved === 'know' || saved === 'learn') view.mode = saved;
    } catch (e) {}
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
      if (!KANJI_WORD.test(item.w)) return;
      if (seen[item.w]) return;
      seen[item.w] = 1;
      out.push({ word: item.w, item: item });
    });
    return out;
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

    if (list.length < 12) {
      list = shuffle(words.filter(function (w) { return last.indexOf(w) < 0; }));
      if (list.length < 12) list = shuffle(words);
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
  function inBounds(rc) { return rc[0] >= 0 && rc[0] < BOUND && rc[1] >= 0 && rc[1] < BOUND; }

  // ---------------- generator ----------------
  function attempt(pool) {
    var grid = {}, placed = [];

    function canPlace(word, cells) {
      for (var i = 0; i < cells.length; i++) {
        if (!inBounds(cells[i])) return false;
        var cur = grid[key(cells[i][0], cells[i][1])];
        if (cur !== undefined && cur !== word[i]) return false;
      }
      var d = [cells[1][0] - cells[0][0], cells[1][1] - cells[0][1]];
      var first = cells[0], last = cells[cells.length - 1];
      if (grid[key(first[0] - d[0], first[1] - d[1])] !== undefined) return false;
      if (grid[key(last[0] + d[0], last[1] + d[1])] !== undefined) return false;

      // brak przypadkowego sąsiedztwa równoległych haseł
      var perp = d[0] === 0 ? [1, 0] : [0, 1];
      for (var j = 0; j < cells.length; j++) {
        if (grid[key(cells[j][0], cells[j][1])] !== undefined) continue; // skrzyżowanie
        var n1 = [cells[j][0] + perp[0], cells[j][1] + perp[1]];
        var n2 = [cells[j][0] - perp[0], cells[j][1] - perp[1]];
        if (grid[key(n1[0], n1[1])] !== undefined || grid[key(n2[0], n2[1])] !== undefined) return false;
      }
      return true;
    }

    function commit(entry, cells, dir) {
      cells.forEach(function (rc, i) { grid[key(rc[0], rc[1])] = entry.word[i]; });
      placed.push({ word: entry.word, item: entry.item, cells: cells, dir: dir, num: null });
    }

    // hasło startowe: losowe z całej puli, ale z wagą za możliwość skrzyżowań.
    // Dzięki temu nie wracamy w kółko do tej samej garstki „popularnych” słów.
    var byChar = {};
    pool.forEach(function (e, i) {
      e.word.split('').forEach(function (ch) { (byChar[ch] || (byChar[ch] = [])).push(i); });
    });
    var cumulative = [], totalWeight = 0;
    for (var ri = 0; ri < pool.length; ri++) {
      var seen = {}, deg = 0;
      pool[ri].word.split('').forEach(function (ch) {
        byChar[ch].forEach(function (j) { if (j !== ri && !seen[j]) { seen[j] = 1; deg++; } });
      });
      totalWeight += deg >= 3 ? Math.sqrt(deg) : 0;
      cumulative.push(totalWeight);
    }
    var seedIdx;
    if (totalWeight > 0) {
      var pick = Math.random() * totalWeight;
      seedIdx = 0;
      while (seedIdx < cumulative.length - 1 && cumulative[seedIdx] < pick) seedIdx++;
    } else {
      seedIdx = Math.floor(Math.random() * pool.length);
    }
    var seed = pool[seedIdx];
    var startRow = 2 + Math.floor(Math.random() * (BOUND - 5));
    var startCol = 1 + Math.floor(Math.random() * (BOUND - seed.word.length - 2));
    var seedCells = [];
    for (var s = 0; s < seed.word.length; s++) seedCells.push([startRow, startCol + s]);
    commit(seed, seedCells, 'A');

    // dokładanie haseł przecinających się z już ułożonymi
    for (var p = 0; p < pool.length && placed.length < TARGET; p++) {
      var entry = pool[p], done = false;
      if (entry === seed) continue;
      // jedno słowo = jedno hasło w krzyżówce
      if (placed.some(function (old) { return old.word === entry.word; })) continue;
      var others = shuffle(placed);
      for (var oi = 0; oi < others.length && !done; oi++) {
        var other = others[oi];
        var dir = other.dir === 'A' ? [1, 0] : [0, 1];
        var idxA = shuffle(entry.word.split('').map(function (_, k) { return k; }));
        var idxB = shuffle(other.word.split('').map(function (_, k) { return k; }));
        for (var a = 0; a < idxA.length && !done; a++) {
          for (var b = 0; b < idxB.length && !done; b++) {
            if (entry.word[idxA[a]] !== other.word[idxB[b]]) continue;
            var anchor = other.cells[idxB[b]];
            var begin = [anchor[0] - dir[0] * idxA[a], anchor[1] - dir[1] * idxA[a]];
            var cells = [];
            for (var k = 0; k < entry.word.length; k++) {
              cells.push([begin[0] + dir[0] * k, begin[1] + dir[1] * k]);
            }
            if (canPlace(entry.word, cells)) { commit(entry, cells, other.dir === 'A' ? 'D' : 'A'); done = true; }
          }
        }
      }
    }
    return placed.length >= 3 ? placed : null;
  }

  function normalize(placed) {
    var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    placed.forEach(function (p) {
      p.cells.forEach(function (rc) {
        minR = Math.min(minR, rc[0]); maxR = Math.max(maxR, rc[0]);
        minC = Math.min(minC, rc[1]); maxC = Math.max(maxC, rc[1]);
      });
    });
    var rows = maxR - minR + 3, cols = maxC - minC + 3;   // margines 1 pola
    var grid = [], numbers = [], r, c;
    for (r = 0; r < rows; r++) {
      grid.push(new Array(cols).fill(null));
      numbers.push(new Array(cols).fill(0));
    }
    placed.forEach(function (p) {
      p.cells = p.cells.map(function (rc) { return [rc[0] - minR + 1, rc[1] - minC + 1]; });
      p.cells.forEach(function (rc, i) { grid[rc[0]][rc[1]] = p.word[i]; });
    });

    function wordAt(r, c, dir) {
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (p.dir === dir && p.cells[0][0] === r && p.cells[0][1] === c) return p;
      }
      return null;
    }

    var num = 0;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (!grid[r][c]) continue;
        var isStart = (r === 0 || !grid[r - 1][c]) || (c === 0 || !grid[r][c - 1]);
        if (!isStart) continue;
        var across = wordAt(r, c, 'A'), down = wordAt(r, c, 'D');
        if (!across && !down) continue;
        num++;
        numbers[r][c] = num;
        if (across && across.num === null) across.num = num;
        if (down && down.num === null) down.num = num;
      }
    }

    var ordered = placed.filter(function (p) { return p.num !== null; }).sort(function (a, b) { return a.num - b.num; });
    return {
      rows: rows, cols: cols, grid: grid, numbers: numbers,
      words: ordered,
      across: ordered.filter(function (p) { return p.dir === 'A'; }),
      down: ordered.filter(function (p) { return p.dir === 'D'; })
    };
  }

  function build(mode) {
    var all = eligible(mode);
    if (all.length < 5) return null;
    var bag = loadBag(mode, all);
    var byWord = {};
    all.forEach(function (e) { byWord[e.word] = e; });
    var pool = bag.list.map(function (w) { return byWord[w]; }).filter(Boolean);
    if (pool.length < 5) return null;

    var best = null;
    for (var t = 0; t < 40; t++) {
      var placed = attempt(shuffle(pool));
      if (!placed) continue;
      var result = normalize(placed);
      if (!best || result.words.length > best.words.length) best = result;
      if (result.words.length >= 9) break;
    }
    if (!best || best.words.length < 3) return null;
    var used = best.words.map(function (w) { return w.word; });
    saveBag(mode, bag, used);
    return best;
  }

  // ---------------- pomocnicze ----------------
  function wordFor(rc, dir) {
    if (!view.puzzle) return null;
    for (var i = 0; i < view.puzzle.words.length; i++) {
      var w = view.puzzle.words[i];
      if (w.dir !== dir) continue;
      for (var j = 0; j < w.cells.length; j++) {
        if (w.cells[j][0] === rc[0] && w.cells[j][1] === rc[1]) return w;
      }
    }
    return null;
  }

  function setActive(r, c, dir) {
    var rc = [r, c];
    var w = wordFor(rc, dir) || wordFor(rc, dir === 'A' ? 'D' : 'A');
    if (w) dir = w.dir;
    view.active = rc;
    view.dir = dir;
    paint();
    var inp = view.inputs[r] && view.inputs[r][c];
    if (inp) inp.focus();
  }

  function nextCell(rc, dir, step) {
    var w = wordFor(rc, dir);
    if (!w) return rc;
    for (var i = 0; i < w.cells.length; i++) {
      if (w.cells[i][0] === rc[0] && w.cells[i][1] === rc[1]) {
        var n = w.cells[i + step];
        return n ? [n[0], n[1]] : rc;
      }
    }
    return rc;
  }

  function paint() {
    if (!view.puzzle) return;
    var word = view.active ? (wordFor(view.active, view.dir) || wordFor(view.active, view.dir === 'A' ? 'D' : 'A')) : null;
    for (var r = 0; r < view.puzzle.rows; r++) {
      for (var c = 0; c < view.puzzle.cols; c++) {
        var wrap = view.wraps[r][c];
        if (!wrap) continue;
        var inWord = !!word && word.cells.some(function (rc) { return rc[0] === r && rc[1] === c; });
        wrap.classList.toggle('onword', inWord);
        wrap.classList.toggle('active', !!view.active && view.active[0] === r && view.active[1] === c);
      }
    }
    view.puzzle.words.forEach(function (w, i) {
      var row = view.clueRows[i];
      if (row) row.classList.toggle('sel', !!word && word === w);
    });
  }

  function say(text, kind) {
    if (!view.msgEl) return;
    view.msgEl.textContent = text || '';
    view.msgEl.className = 'x-msg' + (kind ? ' ' + kind : '');
    if (view.msgTimer) clearTimeout(view.msgTimer);
  }

  function currentValue(rc) {
    var inp = view.inputs[rc[0]] && view.inputs[rc[0]][rc[1]];
    return inp ? inp.value : '';
  }

  function setValue(rc, ch) {
    var inp = view.inputs[rc[0]] && view.inputs[rc[0]][rc[1]];
    if (!inp) return;
    inp.value = ch;
    inp.classList.remove('bad', 'good');
  }

  function wordSolved(w) {
    return w.cells.every(function (rc, i) { return currentValue(rc) === w.word[i]; });
  }

  function expectedAt(r, c) {
    var words = view.puzzle.words;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      for (var j = 0; j < w.cells.length; j++) {
        if (w.cells[j][0] === r && w.cells[j][1] === c) return w.word[j];
      }
    }
    return null;
  }

  // markCells = true tylko po kliknięciu „Sprawdź”; przy wpisywaniu czyścimy stare oceny
  function refreshSolved(markCells) {
    if (!view.puzzle) return 0;
    var total = view.puzzle.words.length, n = 0, solvedCells = {};
    view.puzzle.words.forEach(function (w, i) {
      var ok = wordSolved(w);
      view.solved[w.num] = ok;
      var row = view.clueRows[i];
      if (row) row.classList.toggle('done', ok);
      if (!ok) return;
      n++;
      w.cells.forEach(function (rc) { solvedCells[key(rc[0], rc[1])] = 1; });
    });
    for (var r = 0; r < view.puzzle.rows; r++) {
      for (var c = 0; c < view.puzzle.cols; c++) {
        var wrap = view.wraps[r] && view.wraps[r][c];
        if (wrap) wrap.classList.toggle('word-ok', !!solvedCells[key(r, c)]);
        var inp = view.inputs[r] && view.inputs[r][c];
        if (!inp) continue;
        if (!markCells) { inp.classList.remove('good', 'bad'); continue; }
        var want = expectedAt(r, c);
        if (!want) continue;
        inp.classList.toggle('good', inp.value === want);
        inp.classList.toggle('bad', !!inp.value && inp.value !== want);
      }
    }
    if (view.progressEl) view.progressEl.textContent = 'Rozwiązane: ' + n + ' / ' + total;
    if (n === total) say('🎉 Krzyżówka rozwiązana!', 'good');
    return n;
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
    var sec = api.el('section', 'view x-view');

    var head = api.el('div', 'x-head');
    head.appendChild(api.el('h2', '', '🧩 Krzyżówka N2'));
    head.appendChild(api.el('p', 'dim', 'Wpisz kanji do siatki — poziomo i pionowo. Wskazówki to angielskie znaczenia słówek z Twojego postępu.'));
    sec.appendChild(head);

    var counts = { know: eligible('know').length, learn: eligible('learn').length };
    var controls = api.el('div', 'card x-controls');
    var modes = api.el('div', 'x-modes');
    [['know', '✅ Znam'], ['learn', '📖 Uczę się']].forEach(function (pair) {
      var b = api.el('button', 'btn mini x-mode' + (view.mode === pair[0] ? ' on' : ''),
        pair[1] + ' <span class="x-count">' + counts[pair[0]] + '</span>');
      b.setAttribute('data-mode', pair[0]);
      b.onclick = function () { if (view.mode === pair[0]) return; setMode(pair[0]); rebuild(); };
      modes.appendChild(b);
    });
    controls.appendChild(modes);

    var actions = api.el('div', 'x-actions');
    var newBtn = api.el('button', 'btn pri', '🔄 Nowa krzyżówka');
    newBtn.onclick = rebuild;
    actions.appendChild(newBtn);
    var checkBtn = api.el('button', 'btn', '✅ Sprawdź');
    checkBtn.onclick = function () {
      if (!view.puzzle) return;
      var total = view.puzzle.words.length;
      var n = refreshSolved(true);
      say(n === total ? '🎉 Wszystkie hasła poprawne!' : 'Poprawne hasła: ' + n + ' / ' + total, n === total ? 'good' : '');
    };
    actions.appendChild(checkBtn);
    var hintBtn = api.el('button', 'btn', '💡 Podpowiedź');
    hintBtn.onclick = function () {
      if (!view.puzzle) return;
      var candidates = view.puzzle.words.filter(function (w) { return !wordSolved(w); });
      if (!candidates.length) { say('Wszystkie hasła są już rozwiązane.'); return; }
      var w = candidates[Math.floor(Math.random() * candidates.length)];
      for (var i = 0; i < w.cells.length; i++) {
        if (currentValue(w.cells[i]) !== w.word[i]) {
          setValue(w.cells[i], w.word[i]);
          setActive(w.cells[i][0], w.cells[i][1], w.dir);
          say('Podpowiedź: wpisano ' + w.word[i] + ' w hasło nr ' + w.num + '.');
          refreshSolved(false);
          return;
        }
      }
    };
    actions.appendChild(hintBtn);
    var palBtn = api.el('button', 'btn mini' + (view.paletteOn ? ' on' : ''), '🔡 Kanji');
    palBtn.onclick = function () {
      view.paletteOn = !view.paletteOn;
      palBtn.classList.toggle('on', view.paletteOn);
      var pal = sec.querySelector('.x-palette');
      if (pal) pal.style.display = view.paletteOn ? '' : 'none';
    };
    actions.appendChild(palBtn);
    controls.appendChild(actions);
    sec.appendChild(controls);

    view.puzzle = build(view.mode);
    view.solved = {};
    view.inputs = [];
    view.wraps = [];
    view.clueRows = [];
    view.active = null;
    view.dir = 'A';
    view.msgEl = null;
    if (view.msgTimer) { clearTimeout(view.msgTimer); view.msgTimer = null; }

    var layout = api.el('div', 'x-layout');
    var gridCard = api.el('div', 'card x-grid-card');
    var gridHead = api.el('div', 'x-grid-head');
    view.progressEl = api.el('span', 'x-progress', '');
    gridHead.appendChild(view.progressEl);
    gridHead.appendChild(api.el('span', 'dim', view.mode === 'know' ? 'słowa: znam' : 'słowa: uczę się'));
    gridCard.appendChild(gridHead);

    if (!view.puzzle) {
      gridCard.appendChild(api.el('div', 'x-empty',
        'Za mało słówek w tej kategorii, żeby zbudować krzyżówkę (potrzeba co najmniej kilku słów złożonych wyłącznie z kanji). Przełącz kategorię albo oznacz więcej słówek.'));
      layout.appendChild(gridCard);
      sec.appendChild(layout);
      document.querySelector('#app').appendChild(sec);
      return;
    }

    var pz = view.puzzle;
    var board = api.el('div', 'x-board');
    board.style.setProperty('--x-cols', pz.cols);
    board.style.setProperty('--x-rows', pz.rows);
    for (var r = 0; r < pz.rows; r++) {
      var rowEls = [], inpEls = [];
      for (var c = 0; c < pz.cols; c++) {
        var wrap = api.el('div', 'x-cell' + (pz.grid[r][c] ? '' : ' blank'));
        if (pz.numbers[r][c]) {
          wrap.appendChild(api.el('span', 'x-num', String(pz.numbers[r][c])));
        }
        if (pz.grid[r][c]) {
          var inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'x-inp';
          inp.maxLength = 2;
          inp.autocomplete = 'off';
          inp.setAttribute('aria-label', 'Pole krzyżówki ' + (r + 1) + ',' + (c + 1));
          (function (rr, cc) {
            inp.addEventListener('focus', function () { setActive(rr, cc, view.dir); });
            inp.addEventListener('input', function (e) {
              if (e.isComposing) return;
              var ch = e.target.value.replace(/[^\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '').slice(-1);
              e.target.value = ch;
              e.target.classList.remove('bad', 'good');
              if (ch) {
                var nx = nextCell([rr, cc], view.dir, 1);
                setActive(nx[0], nx[1], view.dir);
              }
              refreshSolved(false);
            });
            inp.addEventListener('keydown', function (e) {
              var d = null;
              if (e.key === 'ArrowRight') d = 'A';
              else if (e.key === 'ArrowLeft') d = 'A';
              else if (e.key === 'ArrowDown') d = 'D';
              else if (e.key === 'ArrowUp') d = 'D';
              if (d) {
                e.preventDefault();
                var step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
                var nx = nextCell([rr, cc], d, step);
                setActive(nx[0], nx[1], d);
              } else if (e.key === 'Backspace' && !e.target.value) {
                var pv = nextCell([rr, cc], view.dir, -1);
                if (pv[0] !== rr || pv[1] !== cc) setActive(pv[0], pv[1], view.dir);
              }
            });
          })(r, c);
          wrap.appendChild(inp);
          inpEls[c] = inp;
        }
        board.appendChild(wrap);
        rowEls[c] = wrap;
      }
      view.wraps.push(rowEls);
      view.inputs.push(inpEls);
    }
    gridCard.appendChild(board);

    view.msgEl = api.el('div', 'x-msg', '');
    gridCard.appendChild(view.msgEl);

    var chars = {};
    pz.words.forEach(function (w) { w.word.split('').forEach(function (ch) { chars[ch] = 1; }); });
    var palette = api.el('div', 'x-palette');
    palette.style.display = view.paletteOn ? '' : 'none';
    palette.appendChild(api.el('span', 'dim', 'Kanji: '));
    shuffle(Object.keys(chars)).forEach(function (ch) {
      var b = api.el('button', 'x-char', ch);
      b.setAttribute('type', 'button');
      b.onclick = function () {
        if (!view.active) { say('Najpierw kliknij pole w siatce.'); return; }
        setValue(view.active, ch);
        var nx = nextCell(view.active, view.dir, 1);
        setActive(nx[0], nx[1], view.dir);
        refreshSolved(false);
      };
      palette.appendChild(b);
    });
    gridCard.appendChild(palette);
    layout.appendChild(gridCard);

    var clueCard = api.el('div', 'card x-clue-card');
    [['A', 'Poziomo'], ['D', 'Pionowo']].forEach(function (pair) {
      var list = pair[0] === 'A' ? pz.across : pz.down;
      if (!list.length) return;
      clueCard.appendChild(api.el('h3', 'x-clue-h', pair[1]));
      list.forEach(function (w) {
        var row = api.el('div', 'x-clue');
        var num = api.el('span', 'x-clue-num', String(w.num));
        var text = api.el('button', 'x-clue-text', api.esc(api.meaning(w.item)) + ' <span class="x-len">(' + w.word.length + ')</span>');
        text.setAttribute('type', 'button');
        text.onclick = function () { setActive(w.cells[0][0], w.cells[0][1], w.dir); };
        var info = api.el('button', 'x-clue-info', '🔍');
        info.setAttribute('type', 'button');
        info.title = 'Pokaż słowo i przykłady';
        info.onclick = function () { api.openWord(w.item); };
        row.append(num, text, info);
        view.clueRows[pz.words.indexOf(w)] = row;
        clueCard.appendChild(row);
      });
    });
    layout.appendChild(clueCard);

    sec.appendChild(layout);
    document.querySelector('#app').appendChild(sec);
    view.progressEl.textContent = 'Rozwiązane: 0 / ' + pz.words.length;
  }

  // ---------------- CSS ----------------
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('n2cross-css')) return;
    var css = '' +
      '.x-head h2{margin:0 0 4px;}' +
      '.x-controls{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;}' +
      '.x-modes,.x-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}' +
      '.x-mode.on,.x-actions .btn.mini.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600;}' +
      '.x-count{opacity:.8;font-size:11px;margin-left:3px;}' +
      '.x-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.8fr);gap:12px;align-items:start;}' +
      '@media(max-width:820px){.x-layout{grid-template-columns:1fr;}}' +
      '.x-grid-head{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:13px;margin-bottom:10px;}' +
      '.x-progress{font-weight:700;color:var(--accent2);}' +
      '.x-board{display:grid;grid-template-columns:repeat(var(--x-cols),minmax(0,1fr));gap:2px;width:100%;max-width:calc(var(--x-cols) * 46px);margin:0 auto;}' +
      '.x-cell{position:relative;aspect-ratio:1/1;background:var(--panel2);border:1px solid var(--line);border-radius:4px;display:flex;align-items:center;justify-content:center;}' +
      '.x-cell.blank{background:transparent;border-color:transparent;}' +
      '.x-cell.onword{background:rgba(244,185,66,.14);}' +
      '.x-cell.word-ok{background:rgba(67,181,129,.20);}' +
      '.x-cell.word-ok .x-inp{color:var(--ok);}' +
      '.x-cell.active{outline:2px solid var(--accent);outline-offset:-1px;}' +
      '.x-num{position:absolute;top:1px;left:3px;font-size:9px;color:var(--accent2);line-height:1;}' +
      '.x-inp{width:100%;height:100%;text-align:center;background:transparent;border:0;outline:0;color:var(--ink);padding:10px 0 0;' +
      'font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:clamp(15px,3vw,22px);}' +
      '.x-inp.good{color:var(--ok);}' +
      '.x-inp.bad{color:var(--accent);}' +
      '.x-msg{min-height:20px;text-align:center;font-size:13px;color:var(--ink-dim);margin:10px 0 0;}' +
      '.x-msg.good{color:var(--ok);font-weight:700;}' +
      '.x-palette{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:10px;}' +
      '.x-palette .dim{margin-right:4px;}' +
      '.x-char{width:32px;height:32px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;color:var(--ink);' +
      'font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:18px;cursor:pointer;}' +
      '.x-char:hover{border-color:var(--accent2);background:rgba(244,185,66,.12);}' +
      '.x-empty{padding:24px 12px;text-align:center;color:var(--ink-dim);}' +
      '.x-clue-h{margin:12px 0 6px;color:var(--accent2);font-size:14px;}' +
      '.x-clue{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid transparent;border-radius:9px;}' +
      '.x-clue.sel{background:rgba(244,185,66,.10);border-color:rgba(244,185,66,.35);}' +
      '.x-clue.done{background:rgba(67,181,129,.10);}' +
      '.x-clue-num{min-width:22px;text-align:right;color:var(--accent2);font-weight:700;}' +
      '.x-clue-text{flex:1;background:none;border:0;color:var(--ink);text-align:left;font:inherit;font-size:13px;cursor:pointer;padding:2px 0;}' +
      '.x-clue-text:hover{color:var(--accent2);}' +
      '.x-clue.done .x-clue-text{color:var(--ok);}' +
      '.x-len{color:var(--ink-dim);font-size:11px;}' +
      '.x-clue-info{background:none;border:0;cursor:pointer;font-size:13px;opacity:.6;}' +
      '.x-clue-info:hover{opacity:1;}';
    var s = document.createElement('style');
    s.id = 'n2cross-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  window.N2CROSS = {
    init: init,
    render: render,
    debug: {
      eligible: eligible, build: build, attempt: attempt, normalize: normalize,
      current: function () { return view.puzzle; }
    }
  };
})();
