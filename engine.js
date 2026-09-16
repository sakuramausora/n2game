/* engine.js — pure game logic (story generator, quiz generator, helpers).
   Works in browser (window.N2ENGINE) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.N2ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA = null;
  function setData(d) { DATA = d; return DATA; }
  function getData() { return DATA; }

  function words() { return DATA ? DATA.words : []; }
  function kanjiMap() { return DATA ? DATA.kanji : {}; }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function firstMeaningEN(item) {
    if (!item || !item.m) return '';
    var s = item.m.split(';')[0].trim();
    s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return s;
  }

  function gloss(item) {
    if (!item) return '';
    return item.pl ? item.pl : ('„' + firstMeaningEN(item) + '"');
  }

  function enDoc(item) {
    if (!item) return '';
    var lines = item.m.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.join('; ');
  }

  function isKanji(str) {
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0x4e00 && c <= 0x9fff) return true;
    }
    return false;
  }

  function katakanaToHiragana(s) {
    return s.replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  var ROMA_KANA = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
    za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
    da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
    wa: 'わ', wo: 'を',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ'
  };
  var SOKUON_CHARS = 'kgsztdhbp';
  // vowel (あ/い/う/え/お) the kana ends with — used to expand ー
  var VOWEL_OF = (function () {
    var rows = ['あかがさざただなはばぱまやらわ', 'いきぎしじちぢにひびぴみり', 'うくぐすずつづぬふぶぷむゆる', 'えけげせぜてでねへべぺめれ', 'おこごそぞとどのほぼぽもよろ'];
    var vows = ['あ', 'い', 'う', 'え', 'お'];
    var m = {};
    rows.forEach(function (r, vi) {
      for (var i = 0; i < r.length; i++) m[r[i]] = vows[vi];
    });
    m['ゃ'] = 'あ'; m['ゅ'] = 'う'; m['ょ'] = 'お';
    m['ぁ'] = 'あ'; m['ぃ'] = 'い'; m['ぅ'] = 'う'; m['ぇ'] = 'え'; m['ぉ'] = 'お';
    m['を'] = 'お'; m['ゔ'] = 'う';
    m['っ'] = ''; m['ん'] = '';
    return m;
  })();

  // romaji -> hiragana (type-as-you-go safe; longest match first)
  function romajiToKana(s) {
    var t = String(s || '').toLowerCase();
    var out = '';
    var i = 0;
    while (i < t.length) {
      var c = t.charAt(i);
      // '-' i 'ｰ' to znak przedłużenia sylaby (ka-do -> かーど)
      if (c === '-' || c === 'ｰ') { out += 'ー'; i++; continue; }
      // sokuon っ: doubled consonant (kka -> っか), but never for n/y/w
      if (i + 1 < t.length && c === t.charAt(i + 1) && SOKUON_CHARS.indexOf(c) >= 0) {
        out += 'っ';
        i++;
        continue;
      }
      var matched = null, len = 0;
      for (var L = 4; L >= 1; L--) {
        var sub = t.substr(i, L);
        var m = ROMA_KANA[sub];
        if (m) { matched = m; len = L; break; }
      }
      if (matched) { out += matched; i += len; continue; }
      // standalone n (before consonant or end) -> ん
      if (c === 'n') { out += 'ん'; i++; continue; }
      out += c;
      i++;
    }
    return out;
  }

  // normalize kana for comparison: romaji->kana, hiraganize, drop stray
  // separators (but not ー), expand long-vowel mark ー (カード <-> kaado)
  function normalizeKana(s) {
    var t = romajiToKana(s);
    t = t.replace(/[\s・ｰ_\-]/g, '');
    t = katakanaToHiragana(t);
    var out = '';
    for (var k = 0; k < t.length; k++) {
      var ch = t.charAt(k);
      if (ch === 'ー') {
        var prev = out.charAt(out.length - 1);
        var v = VOWEL_OF[prev];
        if (v) out += v;
        continue;
      }
      out += ch;
    }
    return out;
  }

  function sameKana(a, b) {
    return normalizeKana(a) === normalizeKana(b);
  }

  // extract kanji characters of a word (in order) -> array of chars
  function wordKanji(item) {
    var out = [];
    for (var i = 0; i < item.w.length; i++) {
      var c = item.w.charAt(i);
      if (isKanji(c)) out.push(c);
    }
    return out;
  }

  // ruby wrap: find the word (or its reading) inside a Japanese sentence
  function ruby(ja, item) {
    if (!ja || !item) return esc(ja);
    var word = item.w;
    var alt = (item.r && item.r.length > 1) ? item.r : null;
    var variants = [word];
    if (alt) variants.push(alt);
    var best = null;
    for (var i = 0; i < variants.length; i++) {
      var idx = ja.indexOf(variants[i]);
      if (idx >= 0) { if (!best || variants[i].length > word.length) best = { s: variants[i], at: idx }; }
    }
    if (best) {
      word = best.s;
      var a = ja.slice(0, best.at);
      var b = ja.slice(best.at);
      return esc(a) + '<ruby>' + esc(word) + '<rt>' + esc(item.r) + '</rt></ruby>' + esc(b.slice(word.length));
    }
    return esc(ja);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --------------------------------------------------------------------
  // Story scenarios
  // tokens: __W__ = word (JA), __R__ = reading, __M__ = gloss (PL/EN)
  // --------------------------------------------------------------------
  var GLOSS_BEATS = [
    { t: 'G', ja: '「__W__」という言葉をノートに書きました。読み方は「__R__」です。', pl: 'Zapisałem/am w notatniku słowo «__M__». Czyta się je: __R__.' },
    { t: 'G', ja: '今日の会話の中で「__W__」という表現が出てきました。', pl: 'W dzisiejszej rozmowie padło sformułowanie: «__M__».' },
    { t: 'G', ja: '先生に「__W__」の意味を聞いてみました。', pl: 'Zapytałem/am o znaczenie słowa «__M__».' },
    { t: 'G', ja: '「__W__」という言葉、どこかで聞いたことがあります。', pl: 'Słowo «__M__» — zdaje się, że gdzieś już je słyszałem/am.' }
  ];

  function beatFmt(beat, item) {
    return {
      ja: beat.ja.replace(/__W__/g, item.w).replace(/__R__/g, item.r),
      pl: beat.pl.replace(/__M__/g, gloss(item)).replace(/__R__/g, item.r),
      word: item
    };
  }

  var THEME_SCENARIOS = {
    travel: {
      titleJA: '週末の小旅行',
      titlePL: 'Weekendowy wypad w góry',
      open: { ja: '先週末、友達と小旅行に出かけました。', pl: 'W zeszły weekend wybraliśmy się z przyjaciółmi na krótki wypad.' },
      close_ja: '帰り道、また来たいね、とみんなで話しました。',
      close_pl: 'W drodze powrotnej wszyscy mówiliśmy, że chcielibyśmy wrócić tu jeszcze raz.',
      props: { who: '友達と', what: '旅の準備' },
      beats: [
        { t: 'N', ja: '出発の前に、__W__の準備をしっかりしました。', pl: 'Przed wyjazdem zrobiliśmy porządne przygotowania (do tego, co opisuje słowo «__M__»).' },
        { t: 'N', ja: '駅に着いて、__W__について少し相談しました。', pl: 'Na stacji ustaliliśmy kilka rzeczy w sprawie «__M__».' },
        { t: 'N', ja: '電車の中で、__W__が大事だと思いました。', pl: 'W pociągu uznałem/am, że «__M__» jest naprawdę ważne.' },
        { t: 'V', ja: '__W__ために、地図を何度も見ました。', pl: 'Żeby (zrobić to, o czym mówi słowo) «__M__», kilka razy sprawdzaliśmy mapę.' },
        { t: 'N', ja: '観光の合間に、__W__の話になりました。', pl: 'Między zwiedzaniem rozmowa zeszła na temat «__M__».' },
        { t: 'I', ja: 'その景色には、__W__という感じがしました。', pl: 'Ten widok wywoływał wrażenie, które najtrafniej opisuje słowo «__M__».' },
        { t: 'V', ja: 'みんなで__W__ことに決めて、すぐ行動しました。', pl: 'Postanowiliśmy zrobić to, co opisuje słowo «__M__», i od razu przeszliśmy do działania.' },
        { t: 'N', ja: 'お土産を見て、__W__が必要だなと思いました。', pl: 'Patrząc na pamiątki, pomyślałem/am, że przydałoby się nam «__M__».' },
        { t: 'N', ja: '夜は宿で__W__のことを話しました。', pl: 'Wieczorem w gospodzie rozmawialiśmy o «__M__».' },
        { t: 'V', ja: 'あの日は、とにかく__W__ことができてよかったです。', pl: 'Najważniejsze, że tamtego dnia udało nam się zrobić to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '次の日、__W__について調べてみました。', pl: 'Następnego dnia doczytałem/am sobie coś o «__M__».' }
      ]
    },
    work: {
      titleJA: '会社での一日',
      titlePL: 'Dzień w pracy',
      open: { ja: '月曜日の朝、会社で忙しい一日が始まりました。', pl: 'W poniedziałkowy poranek w firmie zaczął się pracowity dzień.' },
      close_ja: '一日が終わり、ほっと一息つきました。',
      close_pl: 'Koniec dnia — wreszcie można było odetchnąć.',
      props: { who: '同僚たちと', what: '仕事' },
      beats: [
        { t: 'N', ja: '朝の会議で、__W__について報告がありました。', pl: 'Na porannym spotkaniu padały raporty w sprawie «__M__».' },
        { t: 'N', ja: '__W__を確認するのに、時間がかかりました。', pl: 'Sprawdzenie kwestii związanej z «__M__» zajęło sporo czasu.' },
        { t: 'V', ja: '今年こそ__W__と心に決めました。', pl: 'W tym roku postanowiłem/am sobie, że (zrobię to, o czym mówi słowo) «__M__».' },
        { t: 'N', ja: '昼休みに、__W__の準備を始めました。', pl: 'W przerwie obiadowej zabraliśmy się do przygotowań (do «__M__»).' },
        { t: 'N', ja: '外部の人から、__W__について質問が来ました。', pl: 'Pytania z zewnątrz dotyczyły «__M__».' },
        { t: 'V', ja: '同僚と__W__ように話し合いました。', pl: 'Z kolegami rozmawialiśmy tak, żeby (trafnie ująć to, co znaczy) «__M__».' },
        { t: 'I', ja: 'その日の空気は、__W__という感じがしました。', pl: 'W powietrzu czuło się coś takiego, co najlepiej oddaje słowo «__M__».' },
        { t: 'N', ja: '__W__のせいで、帰りが遅くなりました。', pl: 'Przez (sprawy opisane jako) «__M__» wróciłem/am późno do domu.' },
        { t: 'N', ja: '夕方、郵便で__W__の連絡が来ました。', pl: 'Pod wieczór pocztą przyszła wiadomość w sprawie «__M__».' },
        { t: 'V', ja: '帰る前に、もう一度__W__ことにしました。', pl: 'Przed wyjściem postanowiliśmy jeszcze raz zrobić to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '今日の経験は、__W__のいい勉強になりました。', pl: 'Dzisiejszy dzień był dobrą lekcją, jeśli chodzi o «__M__».' }
      ]
    },
    city: {
      id: 'city',
      titleJA: '町の文化祭',
      titlePL: 'Festiwal w mieście',
      open: { ja: '日曜日、町で文化祭がありました。', pl: 'W niedzielę w mieście odbywał się festiwal.' },
      close_ja: '楽しい一日でした。また来年も行きたいです。',
      close_pl: 'To był udany dzień. W przyszłym roku znów chcę tam pójść.',
      props: { who: '家族と', what: '祭り' },
      beats: [
        { t: 'N', ja: '会場に着いて、まず__W__が見えました。', pl: 'Na miejscu od razu rzucało się w oczy to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '屋台で__W__について話しながら、食べ歩きました。', pl: 'Przy stoiskach jedliśmy, rozmawiając o «__M__».' },
        { t: 'V', ja: 'できるだけ__W__ようにしました。', pl: 'Staraliśmy się maksymalnie (zrobić to, o czym mówi słowo) «__M__».' },
        { t: 'I', ja: '会場の雰囲気は、__W__という感じでした。', pl: 'Atmosfera miejsca przypominała to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '__W__の順番を待っていると、時間があっという間に過ぎました。', pl: 'Kolejka (do «__M__») minęła zaskakująco szybko.' },
        { t: 'N', ja: '子どもは__W__に夢中でした。', pl: 'Dzieci były zachwycone (tym, co łączy się ze słowem) «__M__».' },
        { t: 'N', ja: '夜、花火の前で__W__の写真を撮りました。', pl: 'Wieczorem, na tle fajerwerków, zrobiliśmy zdjęcie związane z «__M__».' },
        { t: 'V', ja: '__W__ことをみんなに約束しました。', pl: 'Obiecaliśmy wszystkim, że (zrobimy to, co opisuje słowo) «__M__».' }
      ]
    },
    study: {
      titleJA: 'N2の勉強ノート',
      titlePL: 'Notatnik do nauki N2',
      open: { ja: '今日は日本語能力試験N2の勉強をしました。', pl: 'Dziś uczyłem/am się do egzaminu N2 z japońskiego.' },
      close_ja: 'ノートが一冊終わりました。少しずつ力がついてきました。',
      close_pl: 'Skończył się właśnie kolejny zeszyt notatek. Powoli, ale widać postępy.',
      props: { who: '私は', what: '勉強' },
      beats: [
        { t: 'G', ja: '「__W__」という言葉をノートに書きました。', pl: 'Zapisałem/am w notatniku słowo «__M__».' },
        { t: 'G', ja: '先生に「__W__」の意味を聞いてみました。', pl: 'Zapytałem/am nauczyciela o znaczenie słowa «__M__».' },
        { t: 'N', ja: '__W__の例文を、声に出して三回読みました。', pl: 'Przykładowe zdanie z (słowem) «__M__» przeczytałem/am na głos trzy razy.' },
        { t: 'V', ja: '毎日続けて__W__ことにしました。', pl: 'Postanowiłem/am, że codziennie będę robić to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '__W__は試験によく出る、と聞きました。', pl: 'Mówią, że (temat) «__M__» często pojawia się na egzaminie.' },
        { t: 'I', ja: 'この単語は、__W__という感じがあります。', pl: 'To słowo ma w sobie coś, co najlepiej opisuje «__M__».' },
        { t: 'N', ja: '夜、__W__についてもう一度復習しました。', pl: 'Wieczorem jeszcze raz powtórzyłem/am (temat) «__M__».' },
        { t: 'V', ja: '自信を持って__W__ことができるようになりました。', pl: 'Teraz już z przekonaniem potrafię zrobić to, co opisuje słowo «__M__».' }
      ]
    },
    nature: {
      titleJA: '山の天気は変わりやすい',
      titlePL: 'Pogoda w górach bywa zmienna',
      open: { ja: 'ある朝、山へ散歩に出かけました。', pl: 'Pewnego ranka wybrałem/am się na spacer w góry.' },
      close_ja: '自然の素晴らしさを実感した一日でした。',
      close_pl: 'To był dzień, w którym naprawdę poczułem/am piękno natury.',
      props: { who: '一人で', what: '散歩' },
      beats: [
        { t: 'N', ja: '歩いていくと、__W__が見えてきました。', pl: 'W miarę marszu przed oczami pojawiało się to, co opisuje słowo «__M__».' },
        { t: 'I', ja: '空の様子は、どちらかと言えば__W__という感じでした。', pl: 'Wygląd nieba najlepiej oddajełoby słowo «__M__».' },
        { t: 'V', ja: '途中で、無理せず__W__ことにしました。', pl: 'Po drodze postanowiłem/am bez wysiłku zrobić to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '昼ごろ、__W__のことを考えました。', pl: 'W okolicach południa myślałem/am o «__M__».' },
        { t: 'N', ja: '風が強くなって、__W__が必要でした。', pl: 'Wiatr się wzmógł — przydało się to, co opisuje słowo «__M__».' },
        { t: 'V', ja: '下りる前に、もう一度__W__から確認しました。', pl: 'Przed zejściem z góry jeszcze raz wszystko sprawdziliśmy (w kontekście «__M__»).' },
        { t: 'N', ja: '夕方、山道で__W__に出会いました。', pl: 'Wieczorem na górskim szlaku natrafiliśmy na coś związanego ze słowem «__M__».' },
        { t: 'N', ja: '家に帰って、__W__について調べました。', pl: 'W domu doczytałem/am sobie coś na temat «__M__».' }
      ]
    },
    general: {
      titleJA: '今日のできごと',
      titlePL: 'Co wydarzyło się dzisiaj',
      open: { ja: '今日は、いくつか新しい経験をしました。', pl: 'Dziś przeżyłem/am kilka nowych rzeczy.' },
      close_ja: 'こうして今日も一日が終わりました。',
      close_pl: 'I tak oto skończył się kolejny dzień.',
      props: { who: '私は', what: '日常' },
      beats: [
        { t: 'N', ja: '朝起きて、まず__W__のことを考えました。', pl: 'Po przebudzeniu najpierw pomyślałem/am o «__M__».' },
        { t: 'V', ja: '今日はとにかく__W__ことにしました。', pl: 'Na dziś postanowiłem/am jedno: zrobić to, co opisuje słowo «__M__».' },
        { t: 'N', ja: '人に会って、__W__について話しました。', pl: 'Spotkałem/am znajomych i rozmowa zeszła na «__M__».' },
        { t: 'N', ja: '__W__のおかげで、うまくいきました。', pl: 'To dzięki (sprawie opisanej jako) «__M__» wszystko się udało.' },
        { t: 'I', ja: 'その様子は、__W__という感じがしました。', pl: 'Cała ta sytuacja miała w sobie coś, co najlepiej oddaje słowo «__M__».' },
        { t: 'V', ja: '__W__ように気をつけました。', pl: 'Starałem/am się przy tym zwracać uwagę na to, o czym mówi słowo «__M__».' },
        { t: 'N', ja: '帰宅して、__W__のことを思い出しました。', pl: 'Po powrocie do domu przypomniałem/am sobie coś związanego z «__M__».' },
        { t: 'N', ja: '夜、__W__についてノートを読んでいました。', pl: 'Wieczorem czytałem/am notatki na temat «__M__».' }
      ]
    }
  };
  // fix leftover placeholder beat
  var cityBeats = THEME_SCENARIOS.city.beats;
  for (var bi = 0; bi < cityBeats.length; bi++) {
    if (cityBeats[bi].ja.indexOf('大きな__W__こ') >= 0) {
      cityBeats.splice(bi, 1);
      break;
    }
  }

  function risky(item) {
    var w = item.w;
    var m = (item.m || '').toLowerCase();
    var kanaOnly = !/[\u4e00-\u9fff]/.test(w);
    var phrase = /(ください|ます$|でした$|しましょう|こんにちは|こんばんは|さようなら|ごめん|ありがとう|いらっしゃい|ようこそ|よろしく|すみません)/.test(w);
    var startsPolite = kanaOnly && /^(お|ご)/.test(w);
    var meanPolite = /^(please|good|thank|excuse|sorry|may i|let me|won't|take care|see you|well|yes|no)/.test(m);
    return phrase || startsPolite || meanPolite;
  }

  function themeOf(item) {
    return item.t || 'general';
  }

  // build a story for a group of words
  function buildStory(group) {
    var items = group.slice();
    var counts = {};
    items.forEach(function (it) { counts[themeOf(it)] = (counts[themeOf(it)] || 0) + 1; });
    var bestTheme = 'general', bestN = 0;
    for (var t in counts) { if (counts[t] > bestN) { bestN = counts[t]; bestTheme = t; } }
    var sc = THEME_SCENARIOS[bestTheme] || THEME_SCENARIOS.general;

    var beatsOut = [];
    beatsOut.push({ ja: sc.open.ja, pl: sc.open.pl, word: null });

    // context beats take ONLY non-risky words of a matching class
    var pool = items.slice();
    var beats = sc.beats.slice();
    for (var i = 0; i < beats.length && pool.length; i++) {
      var beat = beats[i];
      if (beat.t === 'G') continue;
      var pick = null, pickN = -1;
      for (var j = 0; j < pool.length; j++) {
        var it = pool[j];
        if (it.p === beat.t && !risky(it)) { pick = it; pickN = j; break; }
      }
      if (pick) {
        pool.splice(pickN, 1);
        beatsOut.push(beatFmt(beat, pick));
      }
    }
    // leftovers (incl. all risky words) -> safe gloss beats
    var gi = 0;
    for (var k = 0; k < pool.length; k++) {
      var w = pool[k];
      beatsOut.push(beatFmt(GLOSS_BEATS[gi % GLOSS_BEATS.length], w));
      gi++;
    }
    beatsOut.push({ ja: sc.close_ja, pl: sc.close_pl, word: null });

    var wordsUsed = items.slice();
    return {
      theme: bestTheme,
      titleJA: sc.titleJA,
      titlePL: sc.titlePL,
      beats: beatsOut,
      words: wordsUsed
    };
  }

  // build story quiz: pick n beats that carry a word, blank Options
  function storyQuiz(story, group, n) {
    var carries = story.beats.filter(function (b) { return b.word; });
    var chosen = shuffle(carries).slice(0, Math.min(n || 5, carries.length));
    var items = [];
    chosen.forEach(function (b) {
      var correct = b.word;
      var others = shuffle(group.filter(function (g) { return g.w !== correct.w; }));
      var opts = shuffle([correct].concat(others.slice(0, 3)));
      items.push({
        ja: b.ja,
        pl: b.pl,
        correct: correct,
        options: opts
      });
    });
    return items;
  }

  // radicals present in a word (union across its kanji), via kradfile data
  function wordRads(item) {
    var out = [];
    var seen = {};
    var K = kanjiMap();
    wordKanji(item).forEach(function (c) {
      var r = K[c] && K[c].rad;
      if (!r) return;
      r.forEach(function (x) {
        if (!seen[x]) { seen[x] = 1; out.push(x); }
      });
    });
    return out;
  }

  // Jaccard similarity of two words' radical sets (0..1); 0 if either lacks kanji
  function radSim(a, b) {
    var ra = wordRads(a), rb = wordRads(b);
    if (!ra.length || !rb.length) return 0;
    var inA = {}, inter = 0, union = {};
    ra.forEach(function (x) { inA[x] = 1; union[x] = 1; });
    rb.forEach(function (x) { if (inA[x]) inter++; union[x] = 1; });
    var un = 0; for (var kk in union) un++;
    return un ? inter / un : 0;
  }

  // pick n words visually similar to item (share radicals); fill rest from pool
  function confusables(item, pool, n) {
    var scored = [];
    pool.forEach(function (p) {
      if (p === item || p.w === item.w) return;
      var s = radSim(item, p);
      if (s > 0) scored.push({ s: s, w: p, j: Math.random() });
    });
    scored.sort(function (a, b) { return b.s - a.s || a.j - b.j; });
    var out = [], used = {};
    for (var i = 0; i < scored.length && out.length < n; i++) {
      if (!used[scored[i].w.w]) { used[scored[i].w.w] = 1; out.push(scored[i].w); }
    }
    var rest = shuffle(pool).filter(function (p) { return !used[p.w] && p.w !== item.w; });
    for (var j = 0; j < rest.length && out.length < n; j++) out.push(rest[j]);
    return out;
  }

  // Quiz builder modes: 1 kanji->meaning  2 meaning->kanji  3 kana->meaning
  //   + 'sk' meaning->kanji with radical-similar distractors.
  // `all` = the whole word base used to pick distractors (defaults to `group`).
  function buildQuiz(group, mode, n, all) {
    var base = (all && all.length) ? all : group;
    var avail = shuffle(base);
    var pool = shuffle(group);
    // 'sk' drills radical similarity: questions come from the active group
    // (kanji words only), distractors from the full base
    var qs;
    if (mode === 'sk') {
      qs = pool.filter(function (w) { return wordKanji(w).length; }).slice(0, Math.min(n || 10, pool.length));
      if (!qs.length) qs = avail.filter(function (w) { return wordKanji(w).length; }).slice(0, Math.min(n || 10, 40));
    }
    else qs = pool.slice(0, Math.min(n || 10, pool.length));
    // decoys are chosen per question (never the same set every round) and
    // prefer words not already used as decoys earlier in the quiz
    var usedDecoys = {};
    var out = [];
    qs.forEach(function (it) {
      var others;
      if (mode === 'sk') {
        others = confusables(it, avail, 3);
      } else {
        var cands = shuffle(avail).filter(function (p) { return p.w !== it.w && p.r !== it.r; });
        var fresh = cands.filter(function (p) { return !usedDecoys[p.w]; });
        others = [];
        var seenW = {};
        fresh.concat(cands).forEach(function (p) {
          if (others.length >= 3) return;
          if (seenW[p.w]) return;
          seenW[p.w] = 1;
          others.push(p);
          usedDecoys[p.w] = 1;
        });
      }
      out.push({ word: it, options: shuffle([it].concat(others)) });
    });
    return out;
  }

  function pickGroup(words, mode, state) {
    if (mode === 'random') return shuffle(words).slice(0, 10);
    // needi
    var known = (state && state.status) || {};
    var order = words.slice().sort(function (a, b) {
      function rank(x) { return (known[x.w] || 'new') === 'know' ? 2 : (known[x.w] === 'learn' ? 1 : 0); }
      return rank(a) - rank(b);
    });
    // rotate starting point per sequential call
    var start = (state && state.offset) || 0;
    var slice = [];
    for (var i = 0; i < 10; i++) {
      slice.push(order[(start + i) % order.length]);
    }
    return slice;
  }

  return {
    setData: setData,
    getData: getData,
    words: words,
    kanjiMap: kanjiMap,
    shuffle: shuffle,
    firstMeaningEN: firstMeaningEN,
    gloss: gloss,
    enDoc: enDoc,
    isKanji: isKanji,
    katakanaToHiragana: katakanaToHiragana,
    romajiToKana: romajiToKana,
    normalizeKana: normalizeKana,
    sameKana: sameKana,
    wordKanji: wordKanji,
    wordRads: wordRads,
    radSim: radSim,
    confusables: confusables,
    ruby: ruby,
    esc: esc,
    risky: risky,
    themeOf: themeOf,
    buildStory: buildStory,
    storyQuiz: storyQuiz,
    buildQuiz: buildQuiz,
    pickGroup: pickGroup
  };
});