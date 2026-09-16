/* app.js — UI layer for the N2 vocab game. Requires n2data.js + engine.js. */
(function () {
  'use strict';
  var E = window.N2ENGINE;
  var DATA = E.setData(window.N2GAME_DATA);
  var WORDS = E.words();
  var KM = E.kanjiMap();

  // ---------------- state ----------------
  var LS_KEY = 'n2game.v1';
  var state = {
    status: {},          // idx -> 'new' | 'learn' | 'know'
    settings: { batchSize: 10, quizMode: 'km', sound: true, geminiKey: '', geminiModel: 'gemini-3.7-flash', ghRepo: '', ghBranch: '', ghToken: '', ghDevice: '', ghOn: true },
    group: [],           // current group indices
    groupKey: '',        // cache key for story
    stats: { played: 0, correct: 0, streaks: 0, bestStreak: 0, batches: 0, stories: 0 }
  };
  function restoreState(savedText) {
    try {
      var raw = savedText;
      if (raw === undefined) {
        try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
      }
      var saved = JSON.parse(raw || 'null');
      if (saved) {
        state.status = saved.status || state.status;
        if (saved.settings) Object.assign(state.settings, saved.settings);
        if (saved.stats) Object.assign(state.stats, saved.stats);
        if (Array.isArray(saved.group) && saved.group.length) {
          state.group = saved.group.filter(function (i) { return Number.isInteger(i) && i >= 0 && i < WORDS.length; });
        }
        if (saved.groupKey) state.groupKey = String(saved.groupKey);
      }
    } catch (e) {}
  }
  restoreState();
  window.N2GAME_RESTORE = restoreState;

  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} scheduleSync(); }
  window.N2GAME_EXPORT = function () {
    var s = JSON.parse(JSON.stringify(state));
    if (s.settings) { delete s.settings.geminiKey; delete s.settings.geminiModel; delete s.settings.ghToken; }
    return JSON.stringify(s);
  };
  window.N2GAME_IMPORT = function (raw) { try { window.N2GAME_RESTORE(raw); save(); syncNow(true); return true; } catch (e) { return false; } };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { save(); syncNow(false); } });
  window.addEventListener('beforeunload', function () { save(); });
  window.addEventListener('online', function () { syncNow(true); });

  // ---------------- GitHub sync (progress/save.json) ----------------
  var GH_PROGRESS_PATH = 'progress/save.json';
  var SYNC_META_KEY = 'n2game.syncmeta.v1';
  var syncMeta = { fp: '', lastAt: 0 };
  function loadSyncMeta() { try { syncMeta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}') || {}; } catch (e) {} }
  function storeSyncMeta() { try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta)); } catch (e) {} }
  loadSyncMeta();

  var syncTimer = null, syncing = false, syncMsg = '';
  function setSyncMsg(t) {
    syncMsg = t || '';
    var elx = document.getElementById('syncmsg');
    if (elx) elx.textContent = syncMsg;
  }
  function progressFp() { return JSON.stringify(state.status) + '|' + JSON.stringify(state.stats); }
  function progressPayload() {
    var status = {}, stats = {};
    Object.keys(state.status).forEach(function (k) { status[k] = state.status[k]; });
    ['played', 'correct', 'streaks', 'bestStreak', 'batches', 'stories'].forEach(function (k) { stats[k] = state.stats[k] || 0; });
    return { v: 1, updatedAt: Date.now(), status: status, stats: stats };
  }
  function scheduleSync() {
    if (syncMeta.fp && syncMeta.fp === progressFp()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; syncNow(false); }, 1500);
  }
  function b64e(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64d(b64) {
    var bin = atob(String(b64).replace(/\s+/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghApi(path, opts) {
    var cfg = state.settings, o = opts || { method: 'GET' };
    var h = { accept: 'application/vnd.github+json' };
    if (cfg.ghToken) h.authorization = 'token ' + cfg.ghToken;
    if (o.body !== undefined) h['content-type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: o.method, headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  }
  function ghProgressUrl(branch) {
    var cfg = state.settings;
    return '/repos/' + cfg.ghRepo + '/contents/' + GH_PROGRESS_PATH + '?ref=' + encodeURIComponent(branch || cfg.ghBranch || 'main');
  }
  function mergeStatus(a, b) {
    var order = { new: 0, learn: 1, know: 2 }, out = {}, keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var va = a[k] || 'new', vb = b[k] || 'new';
      out[k] = (order[va] || 0) >= (order[vb] || 0) ? va : vb;
    });
    return out;
  }
  function mergeStats(a, b) {
    var out = {};
    ['played', 'correct', 'streaks', 'bestStreak', 'batches', 'stories'].forEach(function (k) { out[k] = Math.max(a[k] || 0, b[k] || 0); });
    return out;
  }
  function ghWrite(sha, branch) {
    var cfg = state.settings;
    var body = { message: 'Sync postepu [NihongoN2]', content: b64e(JSON.stringify(progressPayload())), branch: branch || cfg.ghBranch || 'main' };
    if (sha) body.sha = sha;
    return ghApi('/repos/' + cfg.ghRepo + '/contents/' + GH_PROGRESS_PATH, { method: 'PUT', body: body }).then(function (r) {
      if (r.status !== 200 && r.status !== 201) {
        return r.json().catch(function () { return null; }).then(function (j) {
          var msg = (j && j.message) || '';
          if (r.status === 403) {
            var hint = /not accessible/i.test(msg) ? ' — token fine-grained bez dostępu do repo; użyj tokena klasycznego z zakresem „repo"' : '';
            throw new Error('Token nie ma uprawnień zapisu (HTTP 403)' + hint + ': ' + msg);
          }
          if (r.status === 422) throw new Error('Nie da się zapisać do gałęzi ' + (branch || 'main') + ' (HTTP 422): ' + msg);
          throw new Error('Zapis w repo nieudany (HTTP ' + r.status + '): ' + msg);
        });
      }
      return true;
    });
  }
  function mergeAndWrite(remote, sha, branch) {
    var local = progressPayload();
    var status = mergeStatus(local.status, remote.status || {});
    var stats = mergeStats(local.stats, remote.stats || {});
    if (JSON.stringify(status) !== JSON.stringify(local.status) || JSON.stringify(stats) !== JSON.stringify(local.stats)) {
      state.status = status;
      state.stats = stats;
      save();
    }
    var payload = progressPayload();
    var same = JSON.stringify(payload.status) === JSON.stringify(remote.status || {}) && JSON.stringify(payload.stats) === JSON.stringify(remote.stats || {});
    if (same) { syncMeta.fp = progressFp(); storeSyncMeta(); return Promise.resolve(false); }
    return ghWrite(sha, branch).then(function () { syncMeta.fp = progressFp(); storeSyncMeta(); return true; });
  }
  // pobiera domyślną gałąź repo (leniwie, zapamiętana), do celów zapisu
  function ghResolveBranch() {
    var cfg = state.settings;
    if (cfg.ghBranch && cfg.ghBranch !== 'main') return Promise.resolve(cfg.ghBranch);
    return ghApi('/repos/' + cfg.ghRepo, { method: 'GET' }).then(function (r) {
return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401 || r.status === 403) {
          var hint = (j && j.message && /not accessible/i.test(j.message)) ? ' — możliwe, że używasz tokena fine-grained; wygeneruj klasyczny z zakresem „repo"' : '';
          throw new Error('Brak dostępu do repo (HTTP ' + r.status + ')' + hint + ': ' + ((j && j.message) || ''));
        }
        if (r.status === 404) throw new Error('Repo nie istnieje: ' + cfg.ghRepo + ' — sprawdź pisownię „login/repo".');
        if (r.status !== 200 || !j) throw new Error('GitHub API: HTTP ' + r.status);
        var b = (j.default_branch || 'main');
        if (!cfg.ghBranch || cfg.ghBranch === 'main') { cfg.ghBranch = b; }
        return b;
      });
    });
  }
  function syncNow(force) {
    var cfg = state.settings;
    if (syncing) return;
    if (!cfg.ghOn || !cfg.ghRepo || !cfg.ghToken) { if (force) setSyncMsg('Dodaj repo (login/nazwa) i token GitHub, potem wciśnij „🔄 Synchronizuj teraz”.'); return; }
    if (!window.fetch) return;
    var now = Date.now();
    if (!force && now - (syncMeta.lastAt || 0) < 15000) return;
    syncMeta.lastAt = now;
    syncing = true;
    setSyncMsg('Synchronizuję…');
    ghResolveBranch().then(function (branch) {
      return ghApi(ghProgressUrl(branch), { method: 'GET' }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, json: j }; });
      }).then(function (res) {
        if (res.status === 404) return ghWrite(null, branch).then(function () { return true; });
        if (res.status === 401 || res.status === 403) {
        var hint = (res.json && res.json.message && /not accessible/i.test(res.json.message)) ? ' (token fine-grained bez dostępu do tego repo — użyj tokena klasycznego z zakresem „repo")' : '';
        throw new Error('Brak dostępu do pliku (HTTP ' + res.status + ')' + hint + ' — sprawdź token i uprawnienia do repo.');
      }
        if (res.status === 429) throw new Error('Limit GitHub API (HTTP 429) — odczekaj chwilę.');
        if (res.status !== 200 || !res.json) throw new Error('GitHub API: HTTP ' + res.status);
        var remote = null;
        try { remote = JSON.parse(b64d(res.json.content)); } catch (e) { throw new Error('Nieprawidłowy zapis w progress/save.json na GitHubie.'); }
        return mergeAndWrite(remote, res.json.sha, branch);
      });
    }).then(function (done) {
      setSyncMsg(done ? 'Postęp zsynchronizowany ✓' : 'Wszystko zsynchronizowane ✓');
    }).catch(function (e) {
      setSyncMsg('Sync: ' + ((e && e.message) || e));
    }).then(function () { syncing = false; });
  }
  window.N2GAME_SYNC_CLEAR = function (cb) {
    var cfg = state.settings;
    if (!cfg.ghOn || !cfg.ghRepo || !cfg.ghToken || !window.fetch) { if (cb) cb(); return; }
    ghResolveBranch().then(function (branch) {
      return ghApi(ghProgressUrl(branch), { method: 'GET' }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, json: j }; });
      }).then(function (res) {
        if (res.status !== 200 || !res.json || !res.json.sha) { if (cb) cb(); return; }
        return ghApi('/repos/' + cfg.ghRepo + '/contents/' + GH_PROGRESS_PATH, { method: 'DELETE', body: { message: 'Wyczyszczono postep [NihongoN2]', sha: res.json.sha, branch: branch || 'main' } })
          .then(function () { if (cb) cb(); }).catch(function () { if (cb) cb(); });
      });
    }).catch(function () { if (cb) cb(); });
  };

  function wordAt(i) { return WORDS[i]; }
  function idxOf(item) { return WORDS.indexOf(item); }

  function statusOf(i) { return state.status[i] || 'new'; }

  // ---------------- micro helpers ----------------
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function nl(num) { return (num + '').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0'); }

  function typeLabel(p) { return p === 'V' ? 'czasownik' : p === 'I' ? 'przymiotnik い' : 'rzeczownik'; }
  function themeLabel(t) {
    var m = { travel: 'podróż', work: 'praca', food: 'jedzenie', nature: 'natura', city: 'miasto', home: 'dom', emotion: 'uczucia', health: 'zdrowie', money: 'pieniądze', time: 'czas', study: 'nauka', society: 'społeczeństwo', general: 'ogólne' };
    return m[t] || t;
  }

  function speak(text) {
    if (!state.settings.sound) return;
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.9;
      var v = window.speechSynthesis.getVoices().filter(function (x) { return /ja/i.test(x.lang); })[0];
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = function () {};

  // ---------------- modal ----------------
  function kanjiChip(c) {
    var k = KM[c];
    if (!k) return null;
    var on = k.o.join('・'), kun = k.k.join('・'), mean = k.m.join('; ');
    return el('div', 'kchip', '<div class="kchar">' + c + '</div>' +
      '<div class="kbody">' +
      '<div class="krow"><span class="klab">on</span>' + E.esc(on || '—') + '</div>' +
      '<div class="krow"><span class="klab">kun</span>' + E.esc(kun || '—') + '</div>' +
      '<div class="krow"><span class="klab">zn.</span>' + E.esc(mean || '—') + '</div>' +
      '<div class="krow meta">' + (k.s ? k.s + ' kresek' : '') + (k.l ? ' · poziom ' + k.l : '') + '</div>' +
      '</div>');
  }

  function openWord(item) {
    var i = idxOf(item);
    var overlay = el('div', 'modal-overlay');
    var box = el('div', 'modal');
    box.appendChild(el('button', 'modal-x', '×'));
    var wHead = el('div', 'mw-head');
    wHead.appendChild(el('div', 'mw-word', E.esc(item.w)));
    wHead.appendChild(el('div', 'mw-kana', E.esc(item.r)));
    wHead.appendChild(el('button', 'btn mini speak', '🔊'));
    box.appendChild(wHead);

    var badges = el('div', 'mw-badges');
    badges.appendChild(el('span', 'badge', typeLabel(item.p)));
    badges.appendChild(el('span', 'badge', themeLabel(item.t)));
    badges.appendChild(el('span', 'badge lvl', 'JLPT N2'));
    box.appendChild(badges);

    var mean = el('div', 'mw-mean');
    mean.appendChild(el('div', 'mw-en', E.esc(E.enDoc(item))));
    box.appendChild(mean);

    var kchars = E.wordKanji(item);
    if (kchars.length) {
      var ks = el('div', 'mw-kanji');
      ks.appendChild(el('h4', 'mw-h', 'Szczegóły kanji'));
      kchars.forEach(function (c) { var chip = kanjiChip(c); if (chip) ks.appendChild(chip); });
      box.appendChild(ks);
    }

    var ex = el('div', 'mw-ex');
    ex.appendChild(el('h4', 'mw-h', 'Przykładowe zdania'));
    if (item.x && item.x.length) {
      item.x.forEach(function (pair) {
        var d = el('div', 'ex-item');
        d.appendChild(el('div', 'ex-ja', E.ruby(pair[0], item)));
        d.appendChild(el('div', 'ex-en', E.esc(pair[1])));
        ex.appendChild(d);
      });
    } else {
      ex.appendChild(el('div', 'ex-item dim', 'Brak przykładu w bazie — użyj go w historyjce!'));
    }
    box.appendChild(ex);

    box.querySelector('.modal-x').addEventListener('click', close);
    box.querySelector('.speak').addEventListener('click', function () { speak(item.w + '。' + item.r); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ---------------- views ----------------
  var main = q('#app');

  function show(view) {
    main.innerHTML = '';
    views[view]();
    window.scrollTo(0, 0);
  }
  function navLive() {
    var n = qa('.tab');
    n.forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === currentView);
    });
  }
  var currentView = 'home';

  // ---- group selection helpers ----
  function batchSize() { return Math.max(3, Math.min(20, +state.settings.batchSize || 10)); }

  // stałe, ponumerowane grupy: kolejne kawałki bazy (batchSize słów)
  function groupCount() { return Math.ceil(WORDS.length / batchSize()); }
  function groupStart(g) { return g * batchSize(); }
  function groupEnd(g) { return Math.min((g + 1) * batchSize(), WORDS.length); }
  function groupIndices(g) {
    var a = [];
    for (var i = groupStart(g); i < groupEnd(g); i++) a.push(i);
    return a;
  }
  function groupStats(g) {
    var s = { new: 0, learn: 0, know: 0 };
    for (var i = groupStart(g); i < groupEnd(g); i++) s[statusOf(i)] = (s[statusOf(i)] || 0) + 1;
    return s;
  }
  // 'new' = nikt nie ruszał · 'part' = częściowo uczona · 'done' = ukończona
  function groupStatus(g) {
    var s = groupStats(g);
    if (s.know + s.learn === 0) return 'new';
    if (s.know + s.learn < groupEnd(g) - groupStart(g)) return 'part';
    return 'done';
  }
  // numer grupy (1-based) jeśli bieżąca grupa to dokładnie kawałek numerowanej; inaczej null
  function currentGroupNum() {
    if (!state.group.length || !WORDS.length) return null;
    var N = batchSize();
    var g0 = Math.floor(state.group[0] / N);
    if (g0 < 0 || g0 >= groupCount()) return null;
    var len = groupEnd(g0) - groupStart(g0);
    if (state.group.length !== len) return null;
    for (var k = 0; k < state.group.length; k++) if (state.group[k] !== g0 * N + k) return null;
    return g0 + 1;
  }
  // grupy do powtórki: kolejne kawałki słówek oznaczonych „uczę się” (wg kolejności w bazie)
  function reviewGroups() {
    var li = [];
    WORDS.forEach(function (w, i) { if (statusOf(i) === 'learn') li.push(i); });
    var N = batchSize();
    var out = [];
    for (var g = 0; g * N < li.length; g++) out.push(li.slice(g * N, (g + 1) * N));
    return out;
  }

  function openGroup(g) {
    state.group = groupIndices(g);
    state.groupKey = state.group.join(',');
    save();
    show('learn');
  }
  function openReview(ids) {
    state.group = ids.slice();
    state.groupKey = state.group.join(',');
    save();
    show('learn');
  }

  function makeGroup(mode) {
    var n = batchSize();
    if (mode === 'recent') {
      // ostatnio uczone: najpierw grupy z "uczę się", potem wszystkie niedokończone
      var revR = reviewGroups();
      var poolIdx;
      if (revR.length) {
        poolIdx = [];
        revR.forEach(function (ids) { poolIdx = poolIdx.concat(ids); });
      } else {
        poolIdx = WORDS.map(function (w, i) { return i; }).filter(function (i) { return statusOf(i) !== 'know'; });
        if (!poolIdx.length) poolIdx = WORDS.map(function (w, i) { return i; });
      }
      state.group = E.shuffle(poolIdx).slice(0, n);
    } else if (mode === 'random') {
      state.group = E.shuffle(WORDS).slice(0, n).map(idxOf);
    } else if (mode === 'weak') {
      var rev = reviewGroups();
      if (rev.length) {
        var off = (state.settings.revOffset || 0) % rev.length;
        state.group = rev[off].slice();
        state.settings.revOffset = (off + 1) % rev.length;
      } else {
        var weak = WORDS.filter(function (w, i) { return statusOf(i) !== 'know'; });
        if (weak.length < n) weak = WORDS.slice();
        state.group = E.shuffle(weak).slice(0, n).map(idxOf);
      }
    } else {
      var rank = WORDS.map(function (w, i) { return { i: i, r: statusOf(i) === 'know' ? 2 : statusOf(i) === 'learn' ? 1 : 0 }; });
      rank.sort(function (a, b) { return a.r === b.r ? a.i - b.i : a.r - b.r; });
      var start = (state.settings.seqOffset || 0);
      var g = [];
      for (var k = 0; k < n; k++) g.push(rank[(start + k) % rank.length].i);
      state.settings.seqOffset = (start + n) % WORDS.length;
    }
    state.groupKey = state.group.join(',');
    save();
  }

  function currentItems() { return state.group.map(wordAt); }

  function groupBar(extra) {
    var bar = el('div', 'groupbar');
    var cnt = {};
    currentItems().forEach(function (it, k) { var s = statusOf(state.group[k]); cnt[s] = (cnt[s] || 0) + 1; });
    var gn = currentGroupNum();
    var t = gn ? ('Grupa ' + gn + ' / ' + groupCount() + ': ') : 'Grupa: ';
    t += (cnt.new || 0) + ' nowych · ' + (cnt.learn || 0) + ' w nauce · ' + (cnt.know || 0) + ' znanych';
    bar.appendChild(el('div', 'gb-title', t));
    if (extra) bar.appendChild(extra);
    return bar;
  }

  function makeGroupButtons() {
    var wrap = el('div', 'gbtns');
    var b1 = el('button', 'btn pri', '🎲 Nowa grupa (losowa)');
    var b3 = el('button', 'btn', '🔁 Powtórka (słabe)');
    if (!WORDS.length) return wrap;
    b1.onclick = function () { makeGroup('random'); show('learn'); };
    b3.onclick = function () { makeGroup('weak'); show('learn'); };
    wrap.append(b1, b3);
    return wrap;
  }

  // ---- HOME ----
  var homeSec = null;
  function renderHome() {
    var know = 0, learn = 0, nnew = 0;
    WORDS.forEach(function (w, i) {
      var s = statusOf(i);
      if (s === 'know') know++; else if (s === 'learn') learn++; else nnew++;
    });
    var sec = el('section', 'view');
    var hero = el('div', 'hero');
    hero.appendChild(el('h1', 'hero-title', '日本語 <span>N2</span>'));
    hero.appendChild(el('p', 'hero-sub', 'Gra do nauki słówek JLPT N2 — fiszki, quizy i historyjki generowane z grup 10 słów.'));
    sec.appendChild(hero);

    var stats = el('div', 'home-stats');
    stats.appendChild(statBox(nl(WORDS.length), 'słów w bazie'));
    stats.appendChild(statBox(know, 'znanych'));
    stats.appendChild(statBox(learn, 'w nauce'));
    stats.appendChild(statBox(nnew, 'nowych'));
    sec.appendChild(stats);
    sec.appendChild(progressBar({ know: know, learn: learn, nnew: nnew }));

    var acts = el('div', 'home-actions');
    acts.appendChild(card('📘', 'Nauka kartami', 'Przeglądaj grupę słówek: kana, znaczenie, szczegóły kanji i przykłady.', function () { show('learn'); }));
    acts.appendChild(card('⚡', 'Quiz', 'Słówko → znaczenie, znaczenie → słówko, kana i więcej.', function () { show('quiz'); }));
    acts.appendChild(card('📖', 'Historyjka', 'Wygeneruj opowieść, która używa wszystkich słówek z grupy.', function () { show('story'); }));
    acts.appendChild(card('🔎', 'Słownik', 'Przeszukaj całą bazę N2 i zaglądaj do szczegółów kanji.', function () { show('dict'); }));
    acts.appendChild(card('🈯', 'Kanji', 'Przeglądaj znaki poziomu N2 z odczytami i znaczeniami.', function () { show('kanji'); }));
    acts.appendChild(card('↞', 'Powieści wizualne', '4 gotowe powieści (horror / dramat) w japońskim — gameplay w nowej karcie.', function () { show('vns'); }));
    sec.appendChild(acts);

    // ---- VN gry ----
    var vnList = [
      { file: 'saishu-tenji.html', title: '最終展示', sub: 'najnowsza · horror · 3 zakończenia', color: 'var(--accent)' },
      { file: 'vn.html', title: '蛍の最終列車', sub: 'horror · 9 rozdziałów', color: 'var(--accent)' },
      { file: 'kitsunebi.html', title: '狐火の宮', sub: 'horror · 9 rozdziałów', color: 'var(--accent2)' },
      { file: 'kagami-no-yado.html', title: '鏡の宿', sub: 'dramat · lustrzany pokój', color: 'var(--accent2)' }
    ];
    var vnsec = el('div', 'card');
    vnsec.appendChild(el('h3', '', '📚 Powieści wizualne — graj z dowolnego urządzenia'));
    vnsec.appendChild(el('p', 'dim', 'Self-contained HTML — wystarczy otworzyć plik. Each title opens in a new tab. Postęp zapisuje się osobno w pamięci przeglądarki na tym urządzeniu.'));
    var vngrid = el('div', 'groups-grid');
    vnList.forEach(function (v) {
      var b = el('a', '', '<b style="color:' + v.color + '">' + E.esc(v.title) + '</b><span>' + E.esc(v.sub) + '</span>');
      b.href = v.file;
      b.target = '_blank';
      b.rel = 'noopener';
      b.className = 'group-chip';
      b.style.textDecoration = 'none';
      vngrid.appendChild(b);
    });
    vnsec.appendChild(vngrid);
    sec.appendChild(vnsec);

    // ---- grupy słówek (ponumerowane) ----
    var gsec = el('div', 'card groups-card');
    gsec.appendChild(el('h3', '', '📚 Grupy słówek (' + batchSize() + ' słów na grupę)'));
    gsec.appendChild(el('p', 'dim', 'Kliknij grupę, by uczyć się jej kartami — ponumerowane grupy możesz powtarzać w dowolnej kolejności.'));
    var gact = el('div', 'gbtns');
    var gr = el('button', 'btn pri', '🎲 Nowa grupa (losowa)');
    gr.onclick = function () { makeGroup('random'); show('learn'); };
    var gp = el('button', 'btn', '🔁 Powtórka (uczę się)');
    gp.onclick = function () { makeGroup('weak'); show('learn'); };
    gact.append(gr, gp);
    gsec.appendChild(gact);

    var ggrid = el('div', 'groups-grid');
    for (var g = 0; g < groupCount(); g++) {
      var st = groupStatus(g);
      var cnt = groupStats(g);
      var n = groupEnd(g) - groupStart(g);
      var label = st === 'done' ? '✓ uczona' : st === 'part' ? 'w trakcie' : 'nowa';
      var b = el('button', 'group-chip ' + st,
        '<b>Grupa ' + (g + 1) + '</b>' +
        '<span>' + (cnt.know + cnt.learn) + '/' + n + ' uczonych</span>' +
        '<span class="grp-st">' + label + '</span>');
      if (currentGroupNum() === g + 1) b.classList.add('cur');
      b.onclick = (function (gg) { return function () { openGroup(gg); }; })(g);
      ggrid.appendChild(b);
    }
    gsec.appendChild(ggrid);

    // ---- grupy do powtórki ze słówek „uczę się” ----
    var rev = reviewGroups();
    gsec.appendChild(el('h4', 'sub-h', '🔁 Powtórki ze słówek „📖 Uczę się” — grupy: ' + rev.length));
    if (!rev.length) {
      gsec.appendChild(el('p', 'dim', 'Brak słówek do powtórki. Oznaczaj słówka jako „📖 Uczę się” na kartach, a będą się tu zbierać w osobne grupy do późniejszego powtarzania.'));
    } else {
      var rgrid = el('div', 'groups-grid');
      rev.forEach(function (ids, r) {
        var b = el('button', 'group-chip review',
          '<b>Powtórka ' + (r + 1) + '</b><span>' + ids.length + ' słów</span>');
        var matches = state.group.length === ids.length && ids.every(function (x, k) { return state.group[k] === x; });
        if (matches) b.classList.add('cur');
        b.onclick = (function (ids2) { return function () { openReview(ids2); }; })(ids);
        rgrid.appendChild(b);
      });
      gsec.appendChild(rgrid);
    }
    sec.appendChild(gsec);

    var sett = el('div', 'card sett');
    sett.appendChild(el('h3', '', 'Ustawienia'));
    var row1 = el('div', 'sett-row');
    row1.appendChild(el('label', '', 'Liczba słów w grupie: '));
    var selN = el('select', '', '<option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option>');
    selN.value = '' + batchSize();
    selN.onchange = function () { state.settings.batchSize = +selN.value; save(); show('home'); };
    row1.appendChild(selN);
    var row3 = el('div', 'sett-row');
    var cb = el('label', 'chk', '<input type="checkbox"> ' + 'Wymowa (Text-to-Speech)');
    cb.querySelector('input').checked = !!state.settings.sound;
    cb.querySelector('input').onchange = function () { state.settings.sound = cb.querySelector('input').checked; save(); };
    row3.appendChild(cb);
    sett.append(row1, row3);
    sec.appendChild(sett);

    // ---- synchronizacja przez GitHub ----
    var syncCard = el('div', 'card sett');
    syncCard.appendChild(el('h3', '', '🔄 Synchronizacja postępu (GitHub)'));
    syncCard.appendChild(el('p', 'dim', 'Status słówek i statystyki zapisują się w pliku <code>progress/save.json</code> w Twoim repozytorium — automatycznie scalają się między urządzeniami. Token trzymany tylko w tej przeglądarce.<br><br>' +
      'Użyj klasycznego tokena: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a> → „Generate new token (classic)" → zaznacz <b>repo</b> → wygeneruj i wklej poniżej. Token fine-grained nie zadziała bez wybrania uprawnienia Contents read/write i dostępu do tego repo.'));
    var rRepo = el('div', 'sett-row');
    rRepo.appendChild(el('label', '', 'Repo (login/nazwa): '));
    var repInp = el('input', 'dict-inp');
    repInp.value = state.settings.ghRepo || '';
    repInp.placeholder = 'twoj-login/jlpt-n2-game';
    rRepo.appendChild(repInp);
    var rDev = el('div', 'sett-row');
    rDev.appendChild(el('label', '', 'Nazwa urządzenia: '));
    var devInp = el('input', 'dict-inp');
    devInp.value = state.settings.ghDevice || '';
    devInp.placeholder = 'np. dom / praca';
    rDev.appendChild(devInp);
    var rTok = el('div', 'sett-row');
    rTok.appendChild(el('label', '', 'Token GitHub (classic): '));
    var tokInp = el('input', 'dict-inp');
    tokInp.type = 'password';
    tokInp.value = state.settings.ghToken || '';
    tokInp.placeholder = 'ghp_…';
    rTok.appendChild(tokInp);
    var rBr = el('div', 'sett-row');
    rBr.appendChild(el('label', '', 'Gałąź (pusta = domyślna repo): '));
    var brInp = el('input', 'dict-inp');
    brInp.value = (state.settings.ghBranch && state.settings.ghBranch !== 'main') ? state.settings.ghBranch : '';
    brInp.placeholder = 'np. master / main';
    rBr.appendChild(brInp);
    var rowBtn = el('div', 'sett-row');
    var bSaveCfg = el('button', 'btn pri', 'Zapisz ustawienia sync');
    var bSyncNow = el('button', 'btn', '🔥 Synchronizuj teraz');
    rowBtn.append(bSaveCfg, bSyncNow);
    var syncStatus = el('div', 'syncmsg', '');
    syncStatus.id = 'syncmsg';
    syncStatus.className = 'dim';
    function commitGhCfg() {
      state.settings.ghRepo = repInp.value.trim();
      state.settings.ghDevice = devInp.value.trim();
      state.settings.ghToken = tokInp.value.trim();
      state.settings.ghBranch = brInp.value.trim() || '';
      save();
    }
    bSaveCfg.onclick = function () { commitGhCfg(); setSyncMsg('Ustawienia sync zapisane.'); };
    bSyncNow.onclick = function () { commitGhCfg(); syncNow(true); };
    syncCard.append(rRepo, rDev, rTok, rBr, rowBtn, syncStatus);
    sec.appendChild(syncCard);

    main.appendChild(sec);
  }

  function statBox(num, label) {
    return el('div', 'stat', '<div class="stat-n">' + num + '</div><div class="stat-l">' + label + '</div>');
  }
  function progressBar(sb) {
    var tot = sb.know + sb.learn + sb.nnew || 1;
    var bar = el('div', 'lbars');
    var inner = el('div', 'lbar');
    var k = el('div', 'lseg know', '<span>' + sb.know + '</span>');
    k.style.flexGrow = (sb.know / tot) * 100;
    var l = el('div', 'lseg learn', '<span>' + sb.learn + '</span>');
    l.style.flexGrow = (sb.learn / tot) * 100;
    var n = el('div', 'lseg new', '<span>' + sb.nnew + '</span>');
    n.style.flexGrow = (sb.nnew / tot) * 100;
    inner.append(k, l, n);
    bar.appendChild(inner);
    return bar;
  }

  function card(icon, title, desc, fn) {
    var c = el('button', 'home-card');
    c.appendChild(el('div', 'hc-icon', icon));
    c.appendChild(el('div', 'hc-title', title));
    c.appendChild(el('div', 'hc-desc', desc));
    c.onclick = fn;
    return c;
  }

  // ---- LEARN ----
  var learnIdx = 0;
  function renderLearn() {
    if (!state.group.length) { makeGroup('recent'); }
    var items = currentItems();
    var sec = el('section', 'view');
    sec.appendChild(groupBar());
    // header
    var head = el('div', 'learn-head');
    head.appendChild(el('h2', '', '📘 Nauka — grupa słówek'));
    sec.appendChild(head);
    // card area
    var wrap = el('div', 'flash-wrap');
    var card = el('div', 'flash');
    var reveal = {};
      function draw(i) {
        var it = items[i];
        card.innerHTML = '';
        var pos = el('div', 'flash-pos', 'Słówko ' + (i + 1) + ' z ' + items.length);
        var w = el('div', 'flash-word', E.esc(it.w));
        if (E.isKanji(it.w)) w.classList.add('kanji');
        var kana = el('div', 'flash-kana hidden', E.esc(it.r));
        function toggle(flag) {
          return function () { reveal[flag] = !reveal[flag]; draw(i); };
        }
        var b1 = el('button', 'btn reveal' + (reveal.k ? ' on' : ''), 'あ かな');
        b1.onclick = toggle('k');
        var b2 = el('button', 'btn reveal' + (reveal.m ? ' on' : ''), '💡 Znaczenie');
        b2.onclick = toggle('m');
        var b3 = el('button', 'btn reveal' + (reveal.g ? ' on' : ''), '🈯 Kanji');
        b3.onclick = toggle('g');
        var btns = el('div', 'reveal-btns');
        if (it.r) btns.appendChild(b1);
        btns.appendChild(b2);
        btns.appendChild(b3);
        var mainC = el('div', 'flash-body');
        mainC.appendChild(pos);
        mainC.appendChild(w);
        var exb = el('button', 'btn mini speak' + (reveal.x ? ' on' : ''), '📝');
        exb.onclick = toggle('x');
        mainC.appendChild(exb);
      if (reveal.x) {
        var xd = el('div', 'flash-exword');
        if (it.x && it.x.length) {
          xd.appendChild(el('div', 'flash-ex-ja', E.ruby(it.x[0][0], it)));
          xd.appendChild(el('div', 'flash-ex-en', E.esc(it.x[0][1])));
        } else {
          xd.appendChild(el('div', 'ex-item dim', 'Brak przykładu dla tego słówka w bazie.'));
        }
        mainC.appendChild(xd);
      }
      if (reveal.k) mainC.appendChild(kana);
      if (reveal.m) {
        mainC.appendChild(el('div', 'flash-mean', E.esc(E.enDoc(it))));
      }
      if (reveal.g) {
        var ks = E.wordKanji(it);
        if (ks.length) {
          var ksDiv = el('div', 'flash-kanji');
          ks.forEach(function (c) { var chip = kanjiChip(c); if (chip) ksDiv.appendChild(chip); });
          mainC.appendChild(ksDiv);
        } else mainC.appendChild(el('div', 'flash-mean', 'Brak kanji — słowo zapisane kana.'));
      }
      card.appendChild(btns);
      card.appendChild(mainC);
      // assess
      var assess = el('div', 'assess');
      var cur = statusOf(state.group[i]);
      var kn = el('button', 'btn a-know' + (cur === 'know' ? ' on' : ''), '😀 Znam');
      var le = el('button', 'btn a-learn' + (cur === 'learn' ? ' on' : ''), '📖 Uczę się');
      kn.onclick = function () { setStatus(i, 'know'); next(i); };
      le.onclick = function () { setStatus(i, 'learn'); next(i); };
      assess.append(le, kn);
      card.appendChild(assess);
    }
    function setStatus(i, s) { state.status[state.group[i]] = s; save(); }
    function next(i) {
      if (i + 1 < items.length) { learnIdx = i + 1; draw(learnIdx); }
      else { learnIdx = 0; finishGroup(); }
    }
    function prev(i) { if (i > 0) { learnIdx = i - 1; draw(learnIdx); } }
    function finishGroup() {
      state.stats.batches++;
      save();
      var wrap2 = el('div', 'flash');
      wrap2.appendChild(el('h2', '', '🎉 Grupa ukończona!'));
      wrap2.appendChild(el('p', '', 'Wszystkie słówka z tej grupy zostały ocenione. Co dalej?'));
      var acts = el('div', 'gbtns');
      var bq = el('button', 'btn pri', '⚡ Quiz z tej grupy');
      bq.onclick = function () { show('quiz'); };
      var bs = el('button', 'btn', '📖 Historyjka z tej grupy');
      bs.onclick = function () { show('story'); };
      var bpow = el('button', 'btn', '🔁 Powtórka (uczę się)');
      bpow.onclick = function () { makeGroup('weak'); show('learn'); };
      var br = el('button', 'btn', '🎲 Losowa grupa');
      br.onclick = function () { makeGroup('random'); show('learn'); };
      acts.append(bq, bs, bpow, br);
      wrap2.appendChild(acts);
      card.parentNode.replaceChild(wrap2, card);
    }
    draw(0);
    // nav
    var nav = el('div', 'flash-nav');
    var pb = el('button', 'btn mini', '‹');
    var nb = el('button', 'btn mini', '›');
    var stats = el('div', 'flash-prog', '');
    pb.onclick = function () { prev(learnIdx); };
    nb.onclick = function () { if (learnIdx + 1 < items.length) { learnIdx++; draw(learnIdx); } };
    nav.append(pb, stats, nb);
    wrap.appendChild(card);
    sec.appendChild(wrap);
    sec.appendChild(nav);
    main.appendChild(sec);
    learnIdx = 0;
  }

  // ---- QUIZ ----
  function renderQuiz() {
    var sec = el('section', 'view');
    sec.appendChild(el('h2', '', '⚡ Quiz'));
    if (!state.group.length) makeGroup('recent');

    var cfg = el('div', 'card');
    cfg.appendChild(el('p', '', 'Wybierz wariant i zacznij rundę. Wyniki zapisują się w statystykach.'));
    var r1 = el('div', 'sett-row');
    r1.appendChild(el('label', '', 'Wariant: '));
    var sel = el('select', '', modesHTML());
    sel.value = state.settings.quizMode;
    sel.onchange = function () { state.settings.quizMode = sel.value; save(); };
    r1.appendChild(sel);
    var r2 = el('div', 'sett-row');
    r2.appendChild(el('label', '', 'Pytania: '));
    var selQ = el('select', '', '<option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option>');
    selQ.value = '10';
    r2.appendChild(selQ);
    var r3 = el('div', 'sett-row');
    var bGo = el('button', 'btn pri', '▶️ Start');
    r3.appendChild(bGo);
    cfg.append(r1, r2, r3);
    sec.appendChild(cfg);

    var arena = el('div', 'quiz-arena');
    sec.appendChild(arena);

    bGo.onclick = function () {
      var mode = sel.value;
      state.settings.quizMode = mode;
      save();
      var items = E.buildQuiz(currentItems(), mode, +selQ.value, WORDS);
      runQuiz(arena, items, mode);
    };
    main.appendChild(sec);
    showQuizStats(sec);
  }

  function modesHTML() {
    return '<option value="km">kanji → znaczenie</option>' +
      '<option value="mk">znaczenie → kanji</option>' +
      '<option value="kr">kanji → kana</option>' +
      '<option value="rk">kana → kanji</option>' +
      '<option value="mr">znaczenie → kana</option>' +
      '<option value="sk">🈯 rozróżnij podobne kanji (kana → znaki)</option>';
  }

  function showQuizStats(sec) {
    var st = state.stats;
    var d = el('div', 'quiz-stats');
    d.appendChild(el('div', 'stat', '<div class="stat-n">' + nl(st.played) + '</div><div class="stat-l">rund</div>'));
    d.appendChild(el('div', 'stat', '<div class="stat-n">' + Math.round(st.played ? (st.correct / st.played) * 100 : 0) + '%</div><div class="stat-l">skuteczność</div>'));
    d.appendChild(el('div', 'stat', '<div class="stat-n">' + st.bestStreak + '</div><div class="stat-l">najdł. seria</div>'));
    sec.appendChild(d);
  }

  function runQuiz(arena, items, mode) {
    arena.innerHTML = '';
    var i = 0, correctN = 0, streak = 0, best = streak;
    var wrongs = [];
    function draw() {
      if (i >= items.length) { finish(); return; }
      var it = items[i];
      var q = el('div', 'quiz-q');
      var prompt = el('div', 'quiz-prompt');
      var question = '', answers = [];
      function optHTML(o) { return E.esc(o.w); }
      if (mode === 'km') { question = E.esc(it.word.w); answers = it.options.map(function (o) { return E.firstMeaningEN(o); }); }
      else if (mode === 'mk') { question = E.esc(E.firstMeaningEN(it.word)); answers = it.options.map(optHTML); }
      else if (mode === 'kr') { question = E.esc(it.word.w); answers = []; }
      else if (mode === 'rk') { question = E.esc(it.word.r); answers = it.options.map(optHTML); }
      else if (mode === 'mr') { question = E.esc(E.firstMeaningEN(it.word)); answers = it.options.map(function (o) { return E.esc(o.r); }); }
      else if (mode === 'sk') { question = E.esc(it.word.r); answers = it.options.map(optHTML); }
      prompt.appendChild(el('div', 'quiz-qtext', question));
      var prog = el('div', 'quiz-prog', 'Pytanie ' + (i + 1) + ' / ' + items.length);
      q.appendChild(prog);
      q.appendChild(prompt);
      if (it.word.p === 'V') q.appendChild(el('div', 'quiz-tag', 'czasownik'));
      else if (it.word.p === 'I') q.appendChild(el('div', 'quiz-tag', 'przymiotnik'));
      else q.appendChild(el('div', 'quiz-tag', 'rzeczownik'));
      if (mode === 'sk') {
        q.appendChild(el('div', 'quiz-tag skacc', '🈯 podobne kanji — wybierz zapis dla: ' + E.esc(it.word.r)));
        q.appendChild(el('div', 'quiz-tag', E.esc(E.firstMeaningEN(it.word))));
      }

      var answ = el('div', 'quiz-answers');
      function typingBox(targetR) {
        var box = el('div', 'kana-box');
        var inp = el('input', 'kana-inp');
        inp.placeholder = 'wpisz czytanie (romaji)';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        var live = el('div', 'kana-live', '\u00a0');
        var sub = el('button', 'btn pri mini', '✓ Sprawdź');
        box.appendChild(inp);
        box.appendChild(live);
        box.appendChild(sub);
        function upd() {
          var k = E.romajiToKana(inp.value);
          live.textContent = k || '\u00a0';
        }
        inp.addEventListener('input', upd);
        function check() {
          if (inp.disabled || !inp.value.trim()) return;
          var good = E.sameKana(inp.value, targetR);
          inp.disabled = true;
          sub.disabled = true;
          inp.classList.add(good ? 'ok' : 'no');
          live.classList.add(good ? 'ok' : 'no');
          if (!good) live.textContent = E.katakanaToHiragana(targetR);
          if (good) { correctN++; streak++; if (streak > best) best = streak; }
          else { streak = 0; wrongs.push(it.word); }
          setTimeout(function () { i++; draw(); }, good ? 650 : 1400);
        }
        sub.onclick = check;
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); check(); }
        });
        setTimeout(function () { inp.focus(); }, 10);
        return box;
      }
      if (mode === 'kr' || mode === 'mr') {
        answ.classList.add('solo');
        answ.appendChild(typingBox(it.word.r));
      } else {
      var keep = null;
      it.options.forEach(function (o, k) {
        var b = el('button', 'qopt', answers[k]);
        b.onclick = function () {
          var isC = o === it.word;
          b.disabled = true;
          b.classList.add(isC ? 'ok' : 'no');
          if (!isC) {
            answ.querySelectorAll('.qopt').forEach(function (x, kk) {
              if (it.options[kk] === it.word) { x.classList.add('ok'); x.disabled = true; }
            });
          }
          if (isC) { correctN++; streak++; if (streak > best) best = streak; }
          else { streak = 0; wrongs.push(it.word); }
          setTimeout(function () { i++; draw(); }, 650);
        };
        answ.appendChild(b);
      });
      }
      q.appendChild(answ);
      arena.innerHTML = '';
      arena.appendChild(q);
    }
    function finish() {
      state.stats.played += items.length;
      state.stats.correct += correctN;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, best);
      save();
      var d = el('div', 'quiz-done');
      d.appendChild(el('h3', 'quiz-result-h', 'Wynik: ' + correctN + ' / ' + items.length));
      var pct = Math.round((correctN / items.length) * 100);
      d.appendChild(el('div', 'quiz-pct ' + (pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low'), pct + '%'));
      if (wrongs.length) {
        var wl = el('div', 'quiz-wrong');
        wl.appendChild(el('h4', '', 'Do powtórki:'));
        var wg = el('div', 'chiprow');
        wrongs.forEach(function (w) {
          var c = el('button', 'wchip', E.esc(w.w));
          c.onclick = function () { openWord(w); };
          wg.appendChild(c);
        });
        wl.appendChild(wg);
        d.appendChild(wl);
      }
      var again = el('button', 'btn pri', '🔄 Jeszcze raz');
      again.onclick = function () { runQuiz(arena, E.buildQuiz(currentItems(), mode, items.length, WORDS), mode); };
      d.appendChild(again);
      arena.innerHTML = '';
      arena.appendChild(d);
    }
    draw();
  }

  // ---- STORY ----
  function genreOptionsHTML() {
    return '<option value="normal">🌿 Normalna</option>' +
      '<option value="whump">🩹 Whump (przygoda + ktoś ranny lub nagle chory)</option>' +
      '<option value="horror">👻 Horror</option>' +
      '<option value="twist">🌀 Zwrot akcji na końcu</option>';
  }
  function genreLabel(g) {
    var m = { normal: 'normalna', whump: 'whump', horror: 'horror', twist: 'zwrot akcji' };
    return m[g] || g;
  }

  function renderStory() {
    var sec = el('section', 'view');
    sec.appendChild(el('h2', '', '📖 Historyjka (AI)'));
    if (!state.group.length) makeGroup('recent');

    var sett = el('div', 'card');
    sett.appendChild(el('h3', '', '🤖 Źródło generowania'));
    sett.appendChild(el('p', 'dim', 'Wpisz swój bezpłatny klucz Google AI Studio, żeby historyjki działały w dowolnym miejscu (także na GitHub Pages). Bez klucza generator spróbuje połączyć się z lokalnym serwerem <code>node serve.js</code>.'));
    var row = el('div', 'sett-row');
    var kInp = el('input', 'dict-inp');
    kInp.type = 'password';
    kInp.placeholder = 'Wklej klucz API (AIza…)';
    kInp.value = state.settings.geminiKey || '';
    kInp.style.flex = '1';
    var mSel = el('select', '', [
      'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'
    ].map(function (m) { return '<option>' + m + '</option>'; }).join(''));
    mSel.value = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].indexOf(state.settings.geminiModel) >= 0 ? state.settings.geminiModel : 'gemini-3.7-flash';
    var bKey = el('button', 'btn pri', 'Zapisz klucz');
    bKey.onclick = function () {
      state.settings.geminiKey = kInp.value.trim();
      state.settings.geminiModel = mSel.value;
      save();
      kInp.value = state.settings.geminiKey ? '••••••••••••••••' : '';
      sett.appendChild(el('p', 'dim', '✓ Zapisano. Źródło: ' + (state.settings.geminiKey ? 'Gemini (' + mSel.value + ')' : 'lokalny opencode (serve.js).')));
    };
    row.append(el('label', '', 'Klucz Gemini: '), kInp, el('label', '', 'Model: '), mSel, bKey);
    sett.appendChild(row);
    sett.appendChild(el('p', 'dim', 'Darmowy klucz: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → „Create API key”. Klucz zapisuje się tylko w tej przeglądarce.'));
    sec.appendChild(sett);

    var top = el('div', 'gbtns');
    var sel = el('select', '', genreOptionsHTML());
    sel.value = state.settings.storyGenre || 'normal';
    sel.onchange = function () { state.settings.storyGenre = sel.value; save(); };
    var bAI = el('button', 'btn pri', '🤖 Generuj historyjkę AI');
    var bNew2 = el('button', 'btn', '🎲 Inna grupa + AI');
    var bVN = el('button', 'btn', '📼 Generuj VN AI');
    bAI.onclick = function () { aiStoryDraw(q('.story-out'), sel.value); };
    bNew2.onclick = function () { makeGroup('random'); aiStoryDraw(q('.story-out'), sel.value); };
    bVN.onclick = function () { aiVNDraw(q('.story-out'), sel.value); };
    top.append(sel, bAI, bNew2, bVN);
    sec.appendChild(top);
    sec.appendChild(groupBar());
    var out = el('div', 'story-out');
    sec.appendChild(out);
    main.appendChild(sec);
    out.appendChild(el('div', 'story-note dim', 'Wybierz rodzaj historyjki i kliknij „🤖 Generuj historyjkę AI". „📼 Generuj VN AI" tworzy pełną powieść wizualną (rozdziały, wybór, 2 zakończenia).'));
  }

  // AI story: Gemini (browser, GitHub Pages OK) gdy klucz podany; w przeciwnym razie local opencode (serve.js).
  function aiStoryDraw(out, genre) {
    out.innerHTML = '';
    var items = currentItems();
    if (!items.length) return aiError(out, null);
    if (!window.fetch) return aiError(out, null);
    var key = state.settings.geminiKey || '';
    if (key) { genGeminiStory(out, items, genre, key); return; }
    out.appendChild(el('div', 'story-note', '🤖 Generuję historyjkę ' + genreLabel(genre) + ' przez serwer opencode… to może potrwać nawet kilka minut, nie zamykaj okna.'));
    var payload = JSON.stringify({
      words: items.map(function (w) {
        return { w: w.w, r: w.r, m: w.m || '' };
      }),
      genre: genre || 'normal'
    });
    fetch('api/story', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload
    }).then(function (r) {
      return r.json().catch(function () { return null; });
    }).then(function (j) {
      if (j && j.ok && j.story) {
        state.stats.stories++;
        save();
        renderStoryBody(j.story, out);
      } else {
        aiError(out, j);
      }
    }).catch(function () {
      aiError(out, null);
    });
  }

  // AI visual novel: full script (chapters, choice, 2 endings) via Gemini.
  function aiVNDraw(out, genre) {
    out.innerHTML = '';
    var items = currentItems();
    if (!items.length) return aiError(out, null);
    if (!window.fetch || !window.N2STORYLLM) return aiError(out, null);
    var key = state.settings.geminiKey || '';
    if (!key) { aiError(out, { error: 'VN AI wymaga klucza Gemini — wpisz go w polu „Klucz Gemini" powyżej.' }); return; }
    genGeminiVN(out, items, genre, key);
  }

  function genGeminiVN(out, items, genre, key) {
    out.appendChild(el('div', 'story-note', '📼 Generuję powieść wizualną ' + genreLabel(genre) + ' przez Gemini… to trwa zwykle 1–3 minuty, nie zamykaj okna.'));
    var known = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    var cfg = state.settings.geminiModel;
    var models = known.indexOf(cfg) >= 0 ? [cfg].concat(known) : known;
    models = models.filter(function (m, i) { return models.indexOf(m) === i; });
    var clean = items.map(function (w) { return { w: w.w, r: w.r, pl: w.pl || '', m: w.m || '' }; });
    var prompt = window.N2STORYLLM.buildVNPrompt(clean, genre);
    callGemini(prompt, key, models).then(function (text) {
      var script = window.N2STORYLLM.parseVN(text, clean);
      if (!script) throw new Error('Model nie zwrócił poprawnego skryptu VN — spróbuj jeszcze raz lub zmień model.');
      try { localStorage.setItem('n2.vn.ai', JSON.stringify(script)); }
      catch (e) { throw new Error('Nie udało się zapisać powieści w localStorage.'); }
      state.stats.stories++;
      save();
      var want = el('div', 'card');
      want.appendChild(el('h3', '', '📼 ' + (script.titleJA || 'Powieść wizualna')));
      want.appendChild(el('p', 'ex-item', '„' + (script.titlePL || '') + '" — ' + script.chapters.length + (script.chapters.length === 1 ? ' rozdział' : ' rozdziały/rozdziałów') + ', wybór, 2 zakończenia, ' + script.vocab.length + ' słówek. Gotowe do odtwarzania.'));
      var bOpen = el('button', 'btn pri', '▶ Otwórz powieść wizualną');
      bOpen.onclick = function () { window.open('vn-ai.html', '_blank'); };
      want.appendChild(bOpen);
      out.appendChild(want);
    }).catch(function (e) {
      aiError(out, { error: e && e.message || String(e) });
    });
  }

  function genGeminiStory(out, items, genre, key) {
    if (!window.N2STORYLLM) return aiError(out, null);
    out.appendChild(el('div', 'story-note', '🤖 Generuję historyjkę ' + genreLabel(genre) + ' przez Gemini… zwykle 15–60 sekund, nie zamykaj okna.'));
    var known = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    var cfg = state.settings.geminiModel;
    var models = known.indexOf(cfg) >= 0 ? [cfg].concat(known) : known;
    models = models.filter(function (m, i) { return models.indexOf(m) === i; });
    var clean = items.map(function (w) { return { w: w.w, r: w.r, pl: w.pl || '', m: w.m || '' }; });
    var prompt = window.N2STORYLLM.buildPrompt(clean, genre);
    callGemini(prompt, key, models).then(function (text) {
      var story = window.N2STORYLLM.parseStory(text, clean);
      if (!story) throw new Error('Model nie zwrócił poprawnego JSON-a — spróbuj jeszcze raz lub zmień model.');
      state.stats.stories++;
      save();
      renderStoryBody(story, out);
    }).catch(function (e) {
      aiError(out, { error: e && e.message || String(e) });
    });
  }

  function callGemini(prompt, apiKey, models) {
    var base = (models && models.length ? models : ['gemini-3.7-flash']);
    return new Promise(function (resolve, reject) {
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, 180000);
      var done = false;
      function finish(err, text) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err); else resolve(text);
      }
      function attempt(list, tries) {
        if (done) return;
        if (!list.length) {
          if (tries > 0) { setTimeout(function () { attempt(base, tries - 1); }, 3000); return; }
          finish(new Error('Wszystkie modele Gemini są chwilowo przeciążone (HTTP 503). Spikes są zwykle przejściowe — poczekaj chwilę i spróbuj ponownie.'));
          return;
        }
        var model = list[0];
        fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, responseMimeType: 'application/json' }
          }),
          signal: ctl.signal
        }).then(function (r) {
          return r.json().catch(function () { return null; }).then(function (j) {
            if (!r.ok) throw { _status: r.status, _json: j };
            var parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
            var text = '';
            if (parts) parts.forEach(function (p) { if (p && p.text) text += p.text; });
            if (!text) throw new Error('Pusta odpowiedź modelu (candidates).');
            finish(null, text);
          });
        }).catch(function (e) {
          if (done) return;
          if (e && (e._status === 503 || e._status === 404)) { setTimeout(function () { attempt(list.slice(1), tries); }, 2200); return; }
          if (e && e._status) { finish(new Error(geminiError(e._status, e._json))); return; }
          if (e && e.name === 'AbortError') {
            finish(new Error('Generowanie trwało zbyt długo (> 3 min). Spróbuj mniejszą grupą lub innym modelem.'));
          } else {
            finish(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
      attempt(base, 2);
    });
  }

  function geminiError(status, json) {
    var msg = json && json.error && json.error.message;
    if (status === 401 || status === 403) return 'Nieprawidłowy klucz Gemini (HTTP ' + status + '). Zdobądź darmowy klucz na aistudio.google.com/apikey i zapisz go powyżej.';
    if (status === 404) return 'Model nie istnieje lub jest niedostępny dla tego klucza (HTTP 404). Użyj stabilnych modeli Gemini 3 (np. gemini-3.7-flash / gemini-3.5-flash).';
    if (status === 429) return 'Przekroczono limit darmowego klucza (HTTP 429). Odczekaj chwilę albo użyj innego klucza/modelu.';
    if (status === 503) return 'Model chwilowo przeciążony (HTTP 503). Spróbuj ponownie za chwilę — aplikacja sama przeskakuje na inny model Gemini 3.';
    if (status === 400) return 'Zapytanie odrzucone (HTTP 400): ' + (msg || 'sprawdź klucz, model i grupę słówek.');
    return 'Błąd Gemini (HTTP ' + status + '): ' + (msg || 'nieznany błąd');
  }

  function aiError(out, j) {
    out.innerHTML = '';
    var msg = (j && j.error) ? j.error : 'Nie mogę połączyć się z serwerem opencode (uruchom „node serve.js” zamiast otwierać index.html bezpośrednio).';
    var card = el('div', 'card');
    card.appendChild(el('h3', '', '🤖 Nie udało się wygenerować historyjki AI'));
    card.appendChild(el('p', 'ex-item', E.esc(msg)));
    card.appendChild(el('p', 'ex-item dim', 'Jak włączyć:<br>' +
      '1. <code>node serve.js</code> (sam uruchomi serwer opencode)<br>' +
      '2. otwórz <code>http://localhost:8000</code> w przeglądarce<br>' +
      '3. kliknij tę samą przycisk „🤖 Generuj historyjkę AI”'));
    var fb = el('button', 'btn pri', '↩ Spróbuj ponownie');
    fb.onclick = function () { aiStoryDraw(q('.story-out'), state.settings.storyGenre || 'normal'); };
    card.appendChild(fb);
    out.appendChild(card);
  }

  function renderStoryBody(story, out) {
    var items = story.words && story.words.length ? story.words : currentItems();
    var head = el('div', 'story-head');
    head.appendChild(el('div', 'story-ja-title', E.esc(story.titleJA)));
    head.appendChild(el('div', 'story-pl-title', E.esc(story.titlePL)));
    head.appendChild(el('span', 'badge', themeLabel(story.theme)));
    if (story.genre) head.appendChild(el('span', 'badge lvl', genreLabel(story.genre)));
    out.appendChild(head);

    var intro = el('p', 'story-note', 'Każde słówko z grupy pojawia się w historyjce. Kliknij wyróżnione słowo, by zobaczyć szczegóły. Kliknij 🔊, by posłuchać zdania.');
    out.appendChild(intro);

    var list = el('div', 'story-beats');
    story.beats.forEach(function (b) {
      var row = el('div', 'beat');
      var ja = b.ja;
      if (b.word) ja = E.ruby(ja, b.word);
      var jaDiv = el('div', 'beat-ja', ja);
      var spk = el('button', 'btn mini speak-right', '🔊');
      spk.onclick = function () { speak(story.beats[story.beats.indexOf(b)].ja); };
      row.appendChild(jaDiv);
      row.appendChild(spk);
      list.appendChild(row);
    });
    out.appendChild(list);

    var vocab = el('div', 'story-vocab');
    vocab.appendChild(el('h4', 'story-vocab-h', 'Słówka w tej historyjce'));
    var chips = el('div', 'chiprow');
    items.forEach(function (w) {
      var c = el('button', 'wchip', E.esc(w.w) + ' — ' + E.esc(E.firstMeaningEN(w)));
      c.onclick = function () { openWord(w); };
      chips.appendChild(c);
    });
    vocab.appendChild(chips);
    out.appendChild(vocab);

    var acts = el('div', 'gbtns');
    var bq = el('button', 'btn pri', '🧩 Quiz z historyjki (uzupełnij brakujące słowa)');
    bq.onclick = function () {
      var qs = E.storyQuiz(story, items, 5);
      out.innerHTML = '';
      storyQuizUI(out, qs);
    };
    acts.appendChild(bq);
    out.appendChild(acts);
  }

  function storyQuizUI(container, qs) {
    container.innerHTML = '';
    container.appendChild(el('h3', '', '🧩 Quiz z historyjki — wybierz właściwe słowo'));
    container.appendChild(el('p', 'quest-note', 'Przeczytaj zdanie z opowieści i uzupełnij lukę jednym z czterech słówek.'));
    var i = 0, ok = 0;
    var wrongs = [];
    function draw() {
      if (i >= qs.length) { finish(); return; }
      var it = qs[i];
      var w = it.correct;
      var ja = it.ja.split(w.w).join('＿＿＿＿').split(w.r).join('＿＿＿＿');
      var card = el('div', 'card sq');
      card.appendChild(el('div', 'beat-ja', E.esc(ja)));
      var opts = el('div', 'quiz-answers');
      it.options.forEach(function (o) {
        var b = el('button', 'qopt', E.esc(E.firstMeaningEN(o)));
        b.onclick = function () {
          b.disabled = true;
          var isC = o.w === w.w;
          b.classList.add(isC ? 'ok' : 'no');
          if (!isC) {
            opts.querySelectorAll('.qopt').forEach(function (x, kk) {
              if (it.options[kk].w === w.w) { x.classList.add('ok'); x.disabled = true; }
            });
          } else ok++;
          wrongs = wrongs;
          setTimeout(function () { i++; draw(); }, 700);
        };
        opts.appendChild(b);
      });
      card.appendChild(opts);
      card.appendChild(el('div', 'quiz-prog', 'Pytanie ' + (i + 1) + ' / ' + qs.length));
      container.innerHTML = '';
      container.appendChild(card);
    }
    function finish() {
      container.innerHTML = '';
      var d = el('div', 'quiz-done');
      d.appendChild(el('h3', '', 'Wynik z historyjki: ' + ok + ' / ' + qs.length));
      var again = el('button', 'btn pri', '📖 Wróć do historyjki');
      again.onclick = function () { renderStory(); };
      var more = el('button', 'btn', '✨ Nowa historyjka');
      more.onclick = function () { storyDraw(); };
      d.append(again, more);
      container.appendChild(d);
    }
    draw();
  }

  // ---- DICT ----
  function renderDict() {
    var sec = el('section', 'view');
    sec.appendChild(el('h2', '', '🔎 Słownik N2'));
    var filter = el('div', 'dict-filter');
    var inp = el('input', 'dict-inp');
    inp.placeholder = 'Szukaj: słowo, kana, znaczenie EN…';
    var ckV = el('label', 'chk', '<input type="checkbox"> tylko czasowniki');
    var ckI = el('label', 'chk', '<input type="checkbox"> tylko przymiotniki');
    var ckKnown = el('label', 'chk', '<input type="checkbox"> tylko „znam"');
    filter.append(inp, ckV, ckI, ckKnown);
    sec.appendChild(filter);

    var list = el('div', 'dict-list');
    sec.appendChild(list);
    main.appendChild(sec);

    function render() {
      var q = inp.value.trim().toLowerCase();
      var fV = ckV.querySelector('input').checked;
      var fI = ckI.querySelector('input').checked;
      var fK = ckKnown.querySelector('input').checked;
      list.innerHTML = '';
      var n = 0;
      WORDS.forEach(function (w, i) {
        if (fV && w.p !== 'V') return;
        if (fI && w.p !== 'I') return;
        if (fK && statusOf(i) !== 'know') return;
        if (q) {
          var hay = (w.w + ' ' + w.r + ' ' + w.m).toLowerCase();
          if (hay.indexOf(q) < 0) return;
        }
        n++;
        var row = el('button', 'dict-row');
        var s = statusOf(i);
        var m = el('div', 'd-main');
        m.appendChild(el('span', 'd-word', E.esc(w.w)));
        if (w.r !== w.w) m.appendChild(el('span', 'd-kana', E.esc(w.r)));
        var mm = el('div', 'd-mean');
        mm.appendChild(el('span', 'd-m', E.esc(E.firstMeaningEN(w))));
        m.appendChild(mm);
        row.appendChild(m);
        var tags = el('div', 'd-tags');
        tags.appendChild(el('span', 'badge', typeLabel(w.p)));
        tags.appendChild(el('span', 'badge', themeLabel(w.t)));
        if (s === 'know') tags.appendChild(el('span', 'badge ok', 'znam'));
        if (s === 'learn') tags.appendChild(el('span', 'badge wrn', 'w nauce'));
        row.appendChild(tags);
        row.onclick = function () { openWord(w); };
        list.appendChild(row);
      });
      list.appendChild(el('div', 'dict-count', 'Wyniki: ' + nl(n)));
    }
    inp.oninput = render;
    ckV.onchange = render; ckI.onchange = render; ckKnown.onchange = render;
    render();
  }

  // ---- KANJI ----
  function renderKanji() {
    var sec = el('section', 'view');
    sec.appendChild(el('h2', '', '🈯 Kanji N2'));
    var filter = el('div', 'dict-filter');
    var inp = el('input', 'dict-inp');
    inp.placeholder = 'Szukaj znaku, odczytu lub znaczenia…';
    filter.appendChild(inp);
    sec.appendChild(filter);
    var grid = el('div', 'kanji-grid');
    sec.appendChild(grid);
    main.appendChild(sec);

    function render() {
      var q = inp.value.trim().toLowerCase();
      grid.innerHTML = '';
      var n = 0;
      Object.keys(KM).forEach(function (c) {
        var k = KM[c];
        if (k.l !== 'N2') return;
        if (q) {
          var hay = (c + ' ' + k.o.join(' ') + ' ' + k.k.join(' ') + ' ' + k.m.join(' ')).toLowerCase();
          if (hay.indexOf(q) < 0) return;
        }
        n++;
        var b = el('button', 'kcard', '<div class="kc-char">' + c + '</div>' +
          '<div class="kc-on">' + E.esc(k.o.slice(0, 2).join('・')) + '</div>' +
          '<div class="kc-mean">' + E.esc(k.m[0]) + '</div>');
        b.onclick = function () { openKanji(c); };
        grid.appendChild(b);
      });
      grid.appendChild(el('div', 'dict-count', 'Znaków N2: ' + nl(n)));
    }
    inp.oninput = render;
    render();
  }

  function openKanji(c) {
    var k = KM[c];
    if (!k) return;
    var overlay = el('div', 'modal-overlay');
    var box = el('div', 'modal');
    box.appendChild(el('button', 'modal-x', '×'));
    box.appendChild(el('div', 'mw-head', '<div class="mw-word big">' + c + '</div>' +
      '<div class="mw-kana">' + E.esc(k.m.slice(0, 2).join('; ')) + '</div>'));
    var rows = el('div', 'kanji-rows');
    rows.appendChild(el('div', 'krow wide', '<b>Poziom:</b> ' + k.l + ' · ' + (k.s ? k.s + ' kresek' : '? kresek')));
    rows.appendChild(el('div', 'krow wide', '<b>Onyomi:</b> ' + E.esc(k.o.join('、') || '—')));
    rows.appendChild(el('div', 'krow wide', '<b>Kunyomi:</b> ' + E.esc(k.k.join('、') || '—')));
    rows.appendChild(el('div', 'krow wide', '<b>Znaczenia:</b> ' + E.esc(k.m.join('; '))));
    box.appendChild(rows);

    var wordsWith = el('div', 'mw-ex');
    wordsWith.appendChild(el('h4', '', 'Słowa N2 z tym znakiem'));
    var cnt = 0;
    WORDS.forEach(function (w) {
      if (cnt >= 12) return;
      if (!/[\u4e00-\u9fff]/.test(w.w)) return;
      if (w.w.indexOf(c) < 0) return;
      cnt++;
      var d = el('button', 'dict-row mini-row');
      d.appendChild(el('span', 'd-word', E.esc(w.w)));
      if (w.r !== w.w) d.appendChild(el('span', 'd-kana', E.esc(w.r)));
      d.appendChild(el('span', 'd-m', E.esc(E.firstMeaningEN(w))));
      d.onclick = function () { openWord(w); };
      wordsWith.appendChild(d);
    });
    if (!cnt) wordsWith.appendChild(el('div', 'ex-item dim', 'Brak słów N2 w bazie.'));
    box.appendChild(wordsWith);

    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    box.querySelector('.modal-x').onclick = function () { overlay.remove(); };
    document.body.appendChild(overlay);
  }

  // ---------------- VN list ----------------
  function renderVns() {
    var sec = el('section', 'view');
    sec.appendChild(el('h2', '', '📚 Powieści wizualne'));
    sec.appendChild(el('p', 'dim', 'Wystarczy otworzyć plik — działa offline, na każdym urządzeniu. Postęp na danym urządzeniu zapisuje się automatycznie.'));
    var vnList = [
      { file: 'saishu-tenji.html', title: '最終展示', sub: '最新的 · horror · 3 zakończenia · zapis + auto + prędkość', badge: 'nowa' },
      { file: 'vn.html', title: '蛍の最終列車', sub: 'horror · 9 rozdziałów · 26 słówek', badge: 'horror' },
      { file: 'kitsunebi.html', title: '狐火の宮', sub: 'horror · 9 rozdziałów · світлячки', badge: 'horror' },
      { file: 'kagami-no-yado.html', title: '鏡の宿', sub: 'dramat · lustro · dwie postacie', badge: 'dramat' }
    ];
    var grid = el('div', 'groups-grid');
    vnList.forEach(function (v) {
      var a = el('a', 'group-chip', '<b>' + E.esc(v.title) + '</b><span>' + E.esc(v.sub) + '</span><span class="grp-st">' + E.esc(v.badge) + '</span>');
      a.href = v.file;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.textDecoration = 'none';
      grid.appendChild(a);
    });
    sec.appendChild(grid);
    main.appendChild(sec);
  }

  // ---------------- wire tabs ----------------
  var views = { home: renderHome, learn: renderLearn, quiz: renderQuiz, story: renderStory, dict: renderDict, kanji: renderKanji, vns: renderVns };
  qa('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      currentView = b.dataset.view;
      navLive();
      show(currentView);
    });
  });

  // start
  if (!WORDS.length) {
    main.appendChild(el('div', 'card', 'Brak danych — uruchom najpierw <code>node build.js</code> (powinien powstać plik n2data.js).'));
    return;
  }
  navLive();
  renderHome();
  setTimeout(function () { syncNow(true); }, 1500);
})();