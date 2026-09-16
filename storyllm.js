/* storyllm.js — prompt building & response parsing for LLM-generated stories.
   Pure logic: works in browser (window.N2STORYLLM) and Node (module.exports). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.N2STORYLLM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function firstMeaningEN(item) {
    if (!item || !item.m) return '';
    return item.m.split(';')[0].trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  var GENRE_LABEL = { normal: 'NORMALNA', whump: 'WHUMP', horror: 'HORROR', twist: 'ZWROT AKCJI' };
  var GENRE_RULES = {
    normal: 'opowieść spokojna i zwykła, z życia codziennego: żadnej grozy, żadnych nadzwyczajnych wydarzeń, żadnego dramatyzmu.',
    whump: 'cała historia to PRZYGODA: podróż po dalekim kraju, wyprawa fantasy, bitwa albo nieoczekiwane zdarzenie — nie jest to opowieść wyłącznie o chorobie. W trakcie przygody głównemu bohaterowi (młody facet) MUSI coś się stać: zostaje ranny, poraniony, skrajnie wyczerpany albo NAGLE pojawiają się u niego objawy choroby (np. malaria, gorączka). Potem jest taki fragment „co robić”: trzeba go opatrzyć, znaleźć lekarstwo, odpocząć, ratować go w środku przygody. Pokaż tę pomoc i opiekę, ale fabuła cały czas się toczy — to nie jest historia o chorobie od A do Z.',
    horror: 'cała historia MUSI być mroczna i niepokojąca: noc, cisza, narastające napięcie, coś dziwnego lub złowieszczego w tle. Groza ma być obecna od pierwszego do ostatniego zdania. Bez przesadnej brutalności, ale też bez złagodzenia na końcu.',
    twist: 'przez prawie całą historię wszystko wygląda zwyczajnie (normalna codzienność), a OSTATNI beat (ostatnie zdanie) MUSI przynieść zaskakujący zwrot akcji — nową perspektywę lub nieoczekiwane rozwiązanie, które zmienia sens całej historii.'
  };

  var SURNAMES = [
    '佐藤(さとう)', '鈴木(すずき)', '高橋(たかはし)', '田中(たなか)', '伊藤(いとう)', '渡辺(わたなべ)',
    '山本(やまもと)', '中村(なかむら)', '小林(こばやし)', '加藤(かとう)', '吉田(よしだ)', '山田(やまだ)',
    '佐々木(ささき)', '山口(やまぐち)', '松本(まつもと)', '井上(いのうえ)', '木村(きむら)', '林(はやし)',
    '斎藤(さいとう)', '清水(しみず)', '山崎(やまざき)', '森(もり)', '池田(いけだ)', '橋本(はしもと)',
    '石川(いしかわ)', '中島(なかじま)', '前田(まえだ)', '藤田(ふじた)', '後藤(ごとう)', '小川(おがわ)',
    '岡田(おかだ)', '長谷川(はせがわ)', '村上(むらかみ)', '近藤(こんどう)', '石井(いしい)', '坂本(さかもと)',
    '遠藤(えんどう)', '青木(あおき)', '藤井(ふじい)', '西村(にしむら)', '福田(ふくだ)', '太田(おおた)',
    '三浦(みうら)', '岡本(おかもと)', '松田(まつだ)', '中川(なかがわ)', '川口(かわぐち)', '原田(はらだ)',
    '野村(のむら)', '石田(いしだ)', '河野(こうの)', '高木(たかぎ)', '吉村(よしむら)', '藤原(ふじわら)',
    '土屋(つちや)', '本間(ほんま)', '星野(ほしの)', '小島(こじま)', '横山(よこやま)', '金子(かねこ)',
    '松井(まつい)', '和田(わだ)', '西田(にしだ)', '酒井(さかい)', '上田(うえだ)', '水野(みずの)',
    '高野(たかの)', '三宅(みやけ)', '村田(むらた)', '中野(なかの)', '内田(うちだ)', '大塚(おおつか)',
    '小松(こまつ)', '杉本(すぎもと)', '竹内(たけうち)', '岩崎(いわさき)', '増田(ますだ)', '谷口(たにぐち)'
  ];
  var MALE_NAMES = [
    '蓮(れん)', '颯太(そうた)', '悠太(ゆうた)', '大翔(ひろと)', '湊(みなと)', '大和(やまと)',
    '一樹(かずき)', '圭太(けいた)', '翔太(しょうた)', '拓海(たくみ)', '直樹(なおき)', '悠人(ゆうと)',
    '光輝(こうき)', '健太(けんた)', '隼人(はやと)', '陸(りく)', '陽向(ひなた)', '岳人(がくと)',
    '大地(だいち)', '奏太(そうた)', '樹(いつき)', '大輝(だいき)', '翔(しょう)', '慶(けい)',
    '達也(たつや)', '圭吾(けいご)', '真一(しんいち)', '隆(たかし)', '和真(かずま)', '洋平(ようへい)',
    '貴之(たかゆき)', '大智(たいち)', '遼太郎(りょうたろう)', '誠(まこと)', '雅人(まさと)',
    '将太(しょうた)', '直人(なおと)', '哲也(てつや)', '俊輔(しゅんすけ)', '優斗(ゆうと)',
    '涼太(りょうた)', '翼(つばさ)', '壮太(そうた)', '浩一(こういち)', '晴人(はると)',
    '光一(こういち)', '翔平(しょうへい)', '蒼(あおい)', '空(そら)', '海斗(かいと)'
  ];
  var FEMALE_NAMES = [
    '美咲(みさき)', '葵(あおい)', '陽菜(ひな)', 'さくら(さくら)', '結衣(ゆい)', 'ひかり(ひかり)',
    '玲奈(れな)', '花音(かのん)', '美月(みつき)', '七海(ななみ)', '千夏(ちなつ)', '夏希(なつき)',
    '凛(りん)', '美優(みゆ)', '琴音(ことね)', '心春(こはる)', '芽依(めい)', '美羽(みう)',
    '志帆(しほ)', '彩花(あやか)', '優莉(ゆうり)', '愛梨(あいり)', '莉子(りこ)', '澪(みお)',
    '奈々(なな)', '真琴(まこと)', '明日香(あすか)', '由美(ゆみ)', '恵美(えみ)', '幸子(さちこ)',
    '美智子(みちこ)', '綾(あや)', '真由美(まゆみ)', '早紀(さき)', '由紀(ゆき)', '直美(なおみ)',
    '加奈子(かなこ)', '美紀(みき)', '千絵(ちえ)', '雅子(まさこ)', '聡子(さとこ)', '由香(ゆか)',
    '裕子(ゆうこ)', '理恵(りえ)', '純子(じゅんこ)', '由美子(ゆみこ)', '千歳(ちとせ)', '花凛(かりん)',
    '優奈(ゆうな)', '汐里(しおり)', '泉(いずみ)', '汀(みぎわ)'
  ];

  // Pick n unique random items from a pool and join them for the prompt.
  function sample(pool, n) {
    var copy = pool.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy.slice(0, n).join('、');
  }

  // Build the user prompt that asks the model for a strict-JSON story.
  function buildPrompt(items, genre) {
    var lines = (items || []).map(function (it) {
      var meaning = (it.pl && String(it.pl).trim()) || firstMeaningEN(it);
      return 'WT: ' + it.w + '|' + (it.r || '') + '|' + meaning;
    });
    var key = GENRE_RULES[genre] ? genre : 'normal';
    var label = GENRE_LABEL[key];
    var rule = GENRE_RULES[key];
    var surnames = sample(SURNAMES, 18);
    var maleNames = sample(MALE_NAMES, 12);
    var femaleNames = sample(FEMALE_NAMES, 12);
    var t = [
      'Jesteś nauczycielem języka japońskiego. Ułóż krótką, spójną opowieść (zdania po japońsku, z polskim tłumaczeniem), która wykorzysta DOKŁADNIE RAZ każde słówko z listy poniżej.',
      '',
      'GATUNEK: ' + label + ' — DO OBOWIĄZKOWEGO PRZESTRZEGANIA',
      'Cała historia MUSI od pierwszego do ostatniego zdania realizować ten gatunek: ' + rule,
      '',
      'Zasady:',
      '1. Każde zdanie to jeden „beat” i zawiera dokładnie jedno słówko w formie słownikowej.',
      '2. Słowo japońskie musi pojawić się w zdaniu w DOKŁADNIE takim zapisie jak na liście (np. 伝わる jako dokładnie „伝わる”), bez odmiany i bez wtrąceń.',
      '3. Dla każdego zdania podaj naturalne polskie tłumaczenie.',
      '4. Użyj WSZYSTKICH słówek: ani jednego nie pomiń i nie duplikuj.',
      '5. BOHATEROWIE: każda ważniejsza postać MUSI mieć imię i nazwisko (albo przynajmniej imię). Przy neutralnym tle — Japonia, zwykła codzienność — losowo łącz nazwiska i imiona z poniższych pul (np. 佐藤蓮, 高橋美咲), żeby w każdej historii padały inne kombinacje. W KAŻDEJ nowej historii wybieraj INNE nazwiska i imiona niż w poprzednich opowieściach; w obrębie jednej historii nazwiska też nie mogą się powtarzać (druga postać ma mieć inne nazwisko). Jeśli akcja toczy się gdzie indziej (daleki kraj, wyprawa, fantasy, bitwa), dobierz imiona stosowne do tego świata i miejsca akcji (np. imiona ze świata fantasy albo lokalne). Wybrane imiona używaj konsekwentnie w całej historii.',
      '5a. PULA NAZWISK (wybieraj LOSOWO, łącznie: nazwisko + imię): ' + surnames + '. ' + 'Imiona MĘSKIE: ' + maleNames + '. ' + 'Imiona ŻEŃSKIE: ' + femaleNames + '.',
      '6. GATUNEK (obowiązkowy wymóg): przestrzegaj gatunku „' + label + '” przez CAŁĄ historię, łącznie z ostatnim beatem. Nie pisz historii neutralnej ani „bezpiecznej”, jeśli gatunek tego nie dopuszcza.',
      '7. W odpowiedzi JSON umieść pole "genre" z dokładną wartością "' + key + '" (tylko normal, whump, horror lub twist).',
      '8. Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez komentarzy, bez wstępu) w tym formacie:',
      '',
      '{',
      '  "titleJA": "…tytuł po japońsku…",',
      '  "titlePL": "…tytuł po polsku…",',
      '  "theme": "general",',
      '  "genre": "' + key + '",',
      '  "beats": [',
      '    { "ja": "…zdanie z dokładną formą słówka i imieniem bohatera…", "pl": "…polskie tłumaczenie…" }',
      '  ]',
      '}',
      '',
      'Liczba elementów w „beats” musi być równa liczbie słówek na liście.',
      '',
      'PAMIĘTAJ: gatunek = ' + label + '. Trzymaj się go w każdym zdaniu; OSTATNI beat też ma należeć do tego gatunku.',
      '',
      'Słówka do użycia:',
      ''
    ].join('\n');
    return t + lines.join('\n');
  }

  // Robustly pull the first balanced {...} JSON object out of model text.
  function extractJSON(text) {
    if (!text) return null;
    var t = String(text).replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
    var i = t.indexOf('{');
    if (i < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = i; j < t.length; j++) {
      var c = t.charAt(j);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return t.slice(i, j + 1); }
    }
    return null;
  }

  // Attach group items to beats: find the as-yet-unused word written in ja.
  function matchWords(beats, items) {
    var used = {};
    beats.forEach(function (b) {
      if (!b.ja) return;
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (used[it.w]) continue;
        if (b.ja.indexOf(it.w) >= 0) { b.word = it; used[it.w] = 1; break; }
      }
    });
  }

  // Normalize an LLM story response into the app's story shape {titleJA,titlePL,theme,beats,words}.
  // Returns null when the response does not contain a usable JSON story.
  function parseStory(text, items) {
    var raw = extractJSON(text);
    if (!raw) return null;
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { return null; }
    if (!obj || !Array.isArray(obj.beats) || !obj.beats.length) return null;
    var genre = String(obj.genre || '').trim();
    if (genre && ['normal', 'whump', 'horror', 'twist'].indexOf(genre) < 0) genre = '';
    var beats = obj.beats.map(function (b) {
      return { ja: String(b.ja || '').trim(), pl: String(b.pl || '').trim(), word: null };
    });
    matchWords(beats, items || []);
    return {
      titleJA: String(obj.titleJA || '').trim(),
      titlePL: String(obj.titlePL || '').trim(),
      theme: String(obj.theme || 'general').trim(),
      genre: genre,
      beats: beats,
      words: (items || []).slice()
    };
  }

  var VN_BG = { night: 0, rain: 1, station: 2, train: 3, hospital: 4, twilight: 5, river: 6 };

  // Build the user prompt asking for a full visual-novel script (JSON).
  function buildVNPrompt(items, genre) {
    var lines = (items || []).map(function (it) {
      var meaning = (it.pl && String(it.pl).trim()) || firstMeaningEN(it);
      return 'WT: ' + it.w + '|' + (it.r || '') + '|' + meaning;
    });
    var key = GENRE_RULES[genre] ? genre : 'normal';
    var label = GENRE_LABEL[key];
    var rule = GENRE_RULES[key];
    var surnames = sample(SURNAMES, 18);
    var maleNames = sample(MALE_NAMES, 12);
    var femaleNames = sample(FEMALE_NAMES, 12);
    var bgList = ['night', 'rain', 'station', 'train', 'hospital', 'twilight', 'river'];
    var t = [
      'Jesteś scenarzystą powieści wizualnych po japońsku. Napisz pełną, dłuższą opowieść (aspekty gatunku bardzo ważne!), która wykorzysta DOKŁADNIE RAZ każde słówko z listy poniżej.',
      '',
      'GATUNEK: ' + label + ' — DO OBOWIĄZKOWEGO PRZESTRZEGANIA',
      'Cała historia MUSI od pierwszego do ostatniego zdania realizować ten gatunek: ' + rule,
      '',
      'Konwencja powieści wizualnej (VN):',
      '1. 3–5 ROZDZIAŁÓW (pole "chapters"). Każdy rozdział ma: "titleJA" (tytuł po japońsku z furiganą w "titleKana"), "titlePL", "bg" (miejsce akcji jako jedna z wartości: ' + bgList.join(', ') + '), "who" (głośny narrator/postacie prowadząca cały rozdział) oraz 4–8 zdań w "paras".',
      '2. Każde zdanie w "paras" to obiekt: { "ja": "…zdanie po japońsku…", "pl": "…naturalne polskie tłumaczenie…" }. Możesz dodać żywą rozmowę między bohaterami.',
      '3. POŁOWA_KROPLA: w 2. lub 3. rozdziale umieść wybór (pole "choice" na poziomie całego skryptu, "afterChapter": numer rozdziału, po którym wybór się pojawia). "choice.paras" to 1–2 zdania tuż przed pytaniem, a "options" to DOKŁADNIE dwie opcje: { "label": "…krótkie zdanie po japońsku…", "note": "…krótki polski komentarz…" }. Wybór prowadzi do dwóch różnych zakończeń.',
      '4. W OSTATNIM rozdziale umieść dwa zakończenia (pole "endings", DOKŁADNIE 2 elementy): { "title": "…tytuł po japońsku…", "sub": "…podtytuł np. Epilog…", "body": "…opis zakończenia po polsku, 2–4 zdania…" }.',
      '5. Jeśli ostatnia scena powinna się różnić w zależności od wyboru, danemu zdaniu w ostatnim rozdziale nadaj "variants": [ "…wersja przy opcji 1…", "…wersja przy opcji 2…" ] (zamiast "ja"; obie wersje po japońsku).',
      '6. BOHATEROWIE: każda ważniejsza postać MUSI mieć imię i nazwisko (przy neutralnym tle — Japonia — losowo łącz nazwiska i imiona z pul; w obrębie jednej historii nazwiska nie mogą się powtarzać; jeśli akcja toczy się gdzie indziej, dobierz imiona stosowne do świata).',
      '6a. PULA NAZWISK: ' + surnames + '. Imiona MĘSKIE: ' + maleNames + '. Imiona ŻEŃSKIE: ' + femaleNames + '.',
      '',
      'Zasady użycia słówek:',
      '7. Każde słówko musi pojawić się w tekście japońskim DOKŁADNIE RAZ, w DOKŁĄDNIE takim zapisie jak na liście (np. 伝わる jako dokładnie „伝わる"), otoczone gwiazdkami ★słówko★ (np. „夜の闇に★伝わる★声"). Kontekst ma być naturalny, zgodny ze znaczeniem.',
      '8. Łączna liczba znaczników ★…★ w całej historii MUSI być równa liczbie słówek z listy. Ani jednego nie pominąć, żadnego nie powtórzyć. Poza tymi znacznikami w tekście nie używaj gwiazdek.',
      '9. W polu "vocab" wypisz słownik użytych słówek (każde DOKŁADNIE raz): { "w": "…słowo…", "r": "…hiragana/czytanie…", "m": "…znaczenie po angielsku…", "pl": "…znaczenie po polsku…" } — pole "vocab" musi zawierać identyczną liczbę elementów co lista wejściowa.',
      '',
      '10. Odpowiedz WYŁĄCZNIE poprawnym JSON-em (bez markdown, bez komentarzy, bez wstępu) w tym formacie:',
      '',
      '{',
      '  "titleJA": "…tytuł po japońsku…",',
      '  "titlePL": "…tytuł po polsku…",',
      '  "genre": "' + key + '",',
      '  "vocab": [ { "w": "…", "r": "…", "m": "…", "pl": "…" } ],',
      '  "chapters": [',
      '    { "titleJA": "…", "titlePL": "…", "titleKana": "…", "bg": "night", "who": "…",',
      '      "paras": [ { "ja": "…zdanie po japońsku z ★słówkiem★…", "pl": "…tłumaczenie…" } ] }',
      '  ],',
      '  "choice": { "afterChapter": 2,',
      '    "paras": [ { "ja": "…", "pl": "…" } ],',
      '    "options": [ { "label": "…", "note": "…" }, { "label": "…", "note": "…" } ] },',
      '  "endings": [ { "title": "…", "sub": "…", "body": "…" }, { "title": "…", "sub": "…", "body": "…" } ]',
      '}',
      '',
      'PAMIĘTAJ: gatunek = ' + label + ', znaczniki ★…★ tylko dla słówek, wybór w środku, dwa różne zakończenia, 3–5 rozdziałów.',
      '',
      'Słówka do wykorzystania:',
      ''
    ].join('\n');
    return t + lines.join('\n');
  }

  // Normalize an LLM VN response into the player script shape.
  // Returns { title,titlePL,genre,vocab,chapters,choice,endings } or null.
  function parseVN(text, items) {
    var raw = extractJSON(text);
    if (!raw) return null;
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { return null; }
    if (!obj || !Array.isArray(obj.chapters) || obj.chapters.length < 2) return null;
    var genre = String(obj.genre || '').trim();
    if (['normal', 'whump', 'horror', 'twist'].indexOf(genre) < 0) genre = '';
    var chapters = [];
    for (var ci = 0; ci < obj.chapters.length; ci++) {
      var ch = obj.chapters[ci];
      if (!ch || !Array.isArray(ch.paras) || !ch.paras.length) return null;
      var batch = [];
      for (var pi = 0; pi < ch.paras.length; pi++) {
        var p = ch.paras[pi];
        if (!p || !String(p.ja || '').trim()) {
          if (p && Array.isArray(p.variants) && p.variants.length >= 2) {
            batch.push({ ja: '', pl: String(p.pl || '').trim(), k: -1, word: null, variants: [String(p.variants[0]), String(p.variants[1])] });
          }
          continue;
        }
        var para = { ja: String(p.ja).trim(), pl: String(p.pl || '').trim(), k: -1, word: null };
        if (Array.isArray(p.variants) && p.variants.length >= 2) para.variants = [String(p.variants[0]), String(p.variants[1])];
        if (p.fx && ['shake', 'flash', 'flicker'].indexOf(p.fx) >= 0) para.fx = p.fx;
        batch.push(para);
      }
      if (!batch.length) return null;
      chapters.push({
        titleJA: String(ch.titleJA || '').trim(),
        titlePL: String(ch.titlePL || '').trim(),
        kana: String(ch.titleKana || ch.kana || '').trim(),
        who: String(ch.who || '').trim(),
        bg: (ch.bg != null && VN_BG[ch.bg] != null) ? VN_BG[ch.bg] : (typeof ch.bg === 'number' && ch.bg >= 0 && ch.bg <= 6 ? ch.bg : 0),
        paras: batch
      });
    }
    var used = {};
    chapters.forEach(function (ch) {
      ch.paras.forEach(function (p) {
        var m = String(p.ja).match(/★([^★]+)★/g) || [];
        m.forEach(function (mark) { used[mark.slice(1, -1)] = 1; });
      });
    });
    var vocabMap = {};
    var vocab = [];
    (obj.vocab || []).forEach(function (v, i) {
      if (!v || !String(v.w || '').trim()) return;
      var entry = { w: String(v.w).trim(), r: String(v.r || '').trim(), m: String(v.m || '').trim(), pl: String(v.pl || '').trim() };
      if (!vocabMap[entry.w]) { vocab.push(entry); vocabMap[entry.w] = entry; }
    });
    (items || []).forEach(function (it, i) {
      if (it && it.w && !vocabMap[it.w] && (used[it.w] || true)) {
        var e = { w: it.w, r: it.r || '', m: it.m || '', pl: it.pl || '' };
        vocab.push(e); vocabMap[e.w] = e;
      }
    });
    var choice = null;
    if (obj.choice && Array.isArray(obj.choice.options) && obj.choice.options.length >= 2) {
      var cp = (obj.choice.paras || []).map(function (p) { return { ja: String(p.ja || '').trim(), pl: String(p.pl || '').trim() }; }).filter(function (p) { return p.ja; });
      choice = {
        afterChapter: (obj.choice.afterChapter != null ? Number(obj.choice.afterChapter) : 1),
        paras: cp,
        options: obj.choice.options.slice(0, 2).map(function (o) { return { label: String(o.label || '').trim(), note: String(o.note || '').trim() }; })
      };
    }
    var endings = (obj.endings || []).slice(0, 2).map(function (e) {
      return { title: String(e.title || '').trim(), sub: String(e.sub || '').trim(), body: String(e.body || '').trim() };
    });
    while (endings.length < 2) endings.push({ title: '…', sub: '…', body: '…' });
    return {
      titleJA: String(obj.titleJA || '').trim(),
      titlePL: String(obj.titlePL || '').trim(),
      genre: genre,
      vocab: vocab,
      chapters: chapters,
      choice: choice,
      endings: endings
    };
  }

  return { buildPrompt: buildPrompt, parseStory: parseStory, extractJSON: extractJSON, buildVNPrompt: buildVNPrompt, parseVN: parseVN };
});