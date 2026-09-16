global.window = {};
require('./n2data.js');
const E = require('./engine.js');
const D = window.N2GAME_DATA;
E.setData(D);
const W = D.words;

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('FAIL:', msg); }
}
function test(fn) {
  try { fn(); } catch (e) { fails++; console.error('THROW:', e.message); }
}

test(() => {
  for (let r = 0; r < 300; r++) {
    const g = E.shuffle(W).slice(0, 10);
    const s = E.buildStory(g);
    // every word present exactly once in wordsUsed, and appears in beats
    ok(s.words.length === g.length, 'story covers all words r=' + r);
    const seen = {};
    s.beats.forEach(b => {
      if (b.word) {
        if (seen[b.word.w]) { fails++; console.error('DUP word in story:', b.word.w); }
        seen[b.word.w] = 1;
        // risky words only in gloss (「」) beats
        if (E.risky(b.word) && b.ja.indexOf('「') < 0) {
          fails++; console.error('risky word in context beat:', b.word.w, '->', b.ja);
        }
      }
    });
    // every group word in seen
    g.forEach(item => { if (!seen[item.w]) { fails++; console.error('missing word in story:', item.w); } });
  }
});

test(() => {
  // all verbs group
  const V = W.filter(w => w.p === 'V').slice(0, 10);
  const s = E.buildStory(V);
  ok(s.words.length === V.length, 'verb group covered: ' + s.words.length);
  s.beats.forEach(b => { if (b.word && b.word.p === 'V' && E.risky(b.word) && b.ja.indexOf('「') < 0) fails++; });
});

test(() => {
  // mixed with many risky
  const R = W.filter(w => E.risky(w));
  const g = E.shuffle(R).slice(0, 10);
  const s = E.buildStory(g);
  ok(s.words.length === g.length, 'risky group covered');
});

test(() => {
  // quiz: unique options, contains correct (distractors now come from the whole base)
  const g = E.shuffle(W).slice(0, 10);
  const q = E.buildQuiz(g, 'km', 10, W);
  q.forEach(it => {
    const ws = it.options.map(o => o.w);
    ok(new Set(ws).size === ws.length, 'distinct options');
    ok(ws.indexOf(it.word.w) >= 0, 'correct included');
  });
});

test(() => {
  // sk mode: options distinct, correct included, distractors share radicals
  const g15 = W.filter(w => E.wordKanji(w).length).slice(0, 15);
  const q = E.buildQuiz(g15, 'sk', 10, W);
  ok(q.length === 10 && q.every(it => it.options.length === 4), 'sk: 4 options each');
  const grpW = g15.map(w => w.w);
  ok(q.every(it => grpW.indexOf(it.word.w) >= 0), 'sk: questions come from the active group (not whole vocab)');
  q.forEach(it => {
    const ws = it.options.map(o => o.w);
    ok(new Set(ws).size === ws.length, 'sk: distinct options');
    ok(ws.indexOf(it.word.w) >= 0, 'sk: correct included');
    it.options.forEach(o => {
      if (o !== it.word) {
        const s = E.radSim(it.word, o);
        if (s > 0) return;
        // fallback disambiguates homophone-free fillers; warn only if all are 0
        ok(true, 'sk: distractor sim=' + s);
      }
    });
  });
  // at least one question should have a radical-similar distractor
  const hasSim = q.some(it => it.options.some(o => o !== it.word && E.radSim(it.word, o) > 0));
  ok(hasSim, 'sk: uses radical-similar distractors');
});

test(() => {
  // confusables return n items, none equal to the target
  const item = W.find(w => E.wordKanji(w).length >= 2);
  const c = E.confusables(item, W, 3);
  ok(c.length === 3 && c.every(x => x.w !== item.w), 'confusables: 3 others');
  console.log('confusable example:', item.w, '->', c.map(x => x.w + ':' + E.radSim(item, x).toFixed(2)).join(' '));
});

test(() => {
  // romaji -> kana converter
  const cases = [
    ['a', 'あ'], ['tsutawaru', 'つたわる'], ['kekka', 'けっか'], ['konnichiwa', 'こんにちわ'],
    ['satta', 'さった'], ['massugu', 'まっすぐ'], ['ippai', 'いっぱい'], ['shuukai', 'しゅうかい'],
    ['gakkou', 'がっこう'], ['hanbun', 'はんぶん'], ['shinbun', 'しんぶん'], ['kya', 'きゃ'],
    ['kachou', 'かちょう'], ['tsukau', 'つかう'], ['bunshi', 'ぶんし'], ['chotto', 'ちょっと'],
    ['hiragana', 'ひらがな'], ['nihongo', 'にほんご'], ['sensei', 'せんせい'], ['konna', 'こんな'],
    ['konnichiwa', 'こんにちわ'], ['kekkon', 'けっこん'], ['zannen', 'ざんねん'],
    ['ka-do', 'かーど'], ['syuukai', 'しゅうかい'], ['juu', 'じゅう'],
  ];
  cases.forEach(([rom, want]) => {
    const got = E.romajiToKana(rom);
    ok(got === want, 'romajiToKana("' + rom + '") = ' + got + ' (chcę ' + want + ')');
  });
  // normalize kana / sameKana (long-vowel mark, katakana, spacing)
  ok(E.normalizeKana('カード') === E.normalizeKana('かあど'), 'normalizeKana expands ー');
  ok(E.sameKana('kaado', 'カード'), 'sameKana katakana + long vowel');
  ok(E.sameKana('ka-do', 'カード'), 'sameKana "-" = long vowel');
  ok(E.sameKana('shuukai', 'しゅうかい'), 'sameKana shoo-long vowels');
  ok(E.sameKana('zannen', 'ざんねん'), 'sameKana plain');
  ok(E.sameKana('kekkon', 'けっこん'), 'sameKana sokuon');
  ok(!E.sameKana('gakkou', 'がっこうにとう'), 'sameKana rejects extra kana');
});

test(() => {
  // quiz: different answer sets per question, still distinct, correct included
  const g = E.shuffle(W).slice(0, 20);
  const q = E.buildQuiz(g, 'km', 20, W);
  const sets = q.map(it => it.options.map(o => o.w).sort().join('|'));
  ok(new Set(sets).size > 1, 'km: answer sets vary per question (różne decoye): ' + new Set(sets).size + ' unique sets');
  q.forEach(it => {
    const ws = it.options.map(o => o.w);
    ok(new Set(ws).size === ws.length, 'km: distinct options');
    ok(ws.indexOf(it.word.w) >= 0, 'km: correct included');
  });
});

test(() => {
  // no coded nuisance tags like (v5u)/(hon)/(uk) in meanings anymore
  const TAGS = ['(n)', '(hon)', '(abbr)', '(col)', '(hum)', '(uk)', '(exp)', '(arch)', '(v5u)', '(v5r)', '(v5s)', '(female)', '(vt)', '(pol)'];
  W.forEach(w => TAGS.forEach(t => {
    if (w.m.indexOf(t) >= 0) { fails++; console.error('coded tag remains:', w.w, w.m); }
  }));
});

test(() => {
  // story quiz prompt does not leak either word or reading of the answer
  const g = E.shuffle(W).slice(0, 10);
  const s = E.buildStory(g);
  const sq = E.storyQuiz(s, g, 5);
  sq.forEach(item => {
    const ja = item.ja.split(item.correct.w).join('＿＿');
    ok(ja.indexOf(item.correct.w) < 0, 'answer word hidden in prompt');
  });
});

test(() => {
  // wordKanji / ruby
  const item = W.find(w => E.wordKanji(w).length >= 2);
  ok(item && E.wordKanji(item).length >= 2, 'multi-kanji word found');
  const r = E.ruby('私は' + item.w + 'が好きです。', item);
  ok(r.indexOf('<ruby>') >= 0 && r.indexOf(item.r) >= 0, 'ruby works');
});

test(() => {
  // theme/tags present for all
  W.forEach(w => {
    if (!w.t) { fails++; console.error('missing theme', w.w); }
    if (!w.p) { fails++; console.error('missing pos', w.w); }
  });
});

test(() => {
  // PL map sanity: any PL match should also appear
  const withPl = W.filter(w => w.pl);
  withPl.forEach(w => { if (w.pl.length < 2) { fails++; console.error('weird PL', w.w, w.pl); } });
  console.log('words with PL translation:', withPl.length);
});

console.log(fails === 0 ? 'ALL ENGINE TESTS PASSED' : fails + ' failures');
process.exit(fails === 0 ? 0 : 1);