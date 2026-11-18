# 日本語 N2 — gra do nauki słówek + powieści wizualne

Nauka słówek **JLPT N2** (OpenJLPT, 1793 słowa) przez fiszki, quizy i generowane historyjki, plus **ręcznie napisana powieść wizualna BL** „観測者の殻” ze słówek oznaczonych jako „w nauce”, odtwarzacz powieści wizualnych generowanych przez AI oraz **mroczna gra przygodowa „洞窟のともしび ― 深層”** z whumpem i dziesięcioma zakończeniami. Działa w pełni offline, bez konta, na każdym urządzeniu (telefon, tablet, laptop). Gotowe do opublikowania na **GitHub Pages**.

## Co tu jest

| Plik | Co to jest |
|---|---|
| `index.html` | strona główna — fiszki, quiz, słownik, kanji, historyjki AI |
| `app.js` + `engine.js` + `n2data.js` | logika i dane aplikacji |
| `wordsearch.js` | karta **🔤 Word search** — kratka z kanji do przeszukiwania, zbudowana ze słówek „znam” albo „uczę się” |
| `storyllm.js` | budowanie promptu i parsowanie historyjek oraz powieści wizualnych z modelu (używany też przez `serve.js`) |
| `vn-bl.html` + `bl-story.js` | **ręcznie napisana powieść wizualna BL** „観測者の殻” („Skorupa obserwatora”) — 10 rozdziałów, 14 teł, 2 zakończenia, napisana ze 90 słówek oznaczonych w zapisie jako „w nauce”; link z `index.html` (Start → 🎬 oraz 📖 Historyjka) |
| `vn-ai.html` | odtwarzacz powieści wizualnych wygenerowanych przez AI (skrypt z `localStorage` `n2.vn.ai`); 17 tła + dźwięk otoczenia. **Nie jest już podlinkowany z `index.html`** — otwórz go ręcznie po wygenerowaniu skryptu |
| `serve.js` | *tylko lokalnie*: serwer + proxy historyjek do opencode (nie wchodzi na Pages) |
| `build.js`, `test_all.js` | *tylko lokalnie*: regeneracja danych, testy silnika |
| `closed-school/` | osobna gra „私立桜丘高等学校 — 閉館” (punkt-and-click, 9 rozdziałów, 5 zakończeń, 759 słówek) |
| `cave/cave.html` + `cave/cave-story.js` | osobna gra „洞窟のともしび ― 深層” („Światło latarni w jaskini — głębiej”) — mroczna przygoda o dwóch studentach uwięzionych w jaskini: opisy whumpu, kolejne sceny, pasek sił i zaufania, **10 zakończeń** (w tym nagłe „bad endy” po jednej decyzji); graf i osiągalność zakończeń weryfikuje `tools/cave_check.js` (brute-force ~2,2 mln ścieżek) |
| `tools/` | *tylko lokalnie*: generator słownika/dokumentów, kompilator dialogów i pakiety testów (`node tools/test_game.js`) |

## Jak uruchomić lokalnie

- Otwórz `index.html` bezpośrednio (offline) — ale historyjki AI będą potrzebować serwera, albo klucza Gemini (patrz niżej).
- `node serve.js` → `http://localhost:8000` (sam uruchamia też backend opencode do generowania historyjek).

## Publikacja na GitHub Pages (bezpłatnie)

> Uwaga: Pages bezpłatnie działa tylko dla repozytorium **publicznego**.

1. Załóż repozytorium na https://github.com/new (np. nazwa `jlpt-n2-game`), **Public**.
2. W folderze gry zainicjalizuj git i wgraj pliki:

```powershell
cd "C:\Users\wacio\Documents\Default Project\jlpt-n2-game"
git init
git add .
git commit -m "N2 vocab game + VN stories"
git branch -M main
git remote add origin https://github.com/TWOJ_LOGIN/jlpt-n2-game.git
git push -u origin main
```

(podmień `TWOJ_LOGIN`; przy pushu GitHub poprosi o zalogowanie — możesz przez przeglądarkę albo token.)

3. Włącz Pages: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save**.
4. Gotowe — strona pod adresem `https://TWOJ_LOGIN.github.io/jlpt-n2-game/`. Przy każdym `git push` aktualizuje się sama.

Otwieranie powieści wizualnej BL: Start → karta **🎬 Powieść wizualna (BL)** albo zakładka **📖 Historyjka** → „▶ Otwórz powieść wizualną”. Historia jest wbudowana w plik (`bl-story.js`), więc działa od razu, bez klucza i bez internetu.

Otwieranie gry z jaskini: Start → karta **🕯️ 洞窟のともしび ― 深層** albo zakładka **📖 Historyjka** → „▶ Otwórz grę z jaskini” (albo wprost `cave/cave.html`). Scenariusz (`cave/cave-story.js`) i silnik (`cave/cave.html`) działają offline, bez klucza i bez internetu.

### Word search

Zakładka **🔤 Word search** (albo karta na Start) to kratka z ukrytymi słowami N2. Przełącznik wybiera pulę: **✅ Znam** albo **📖 Uczę się** — brane są wyłącznie słówka z tym statusem, zapisane same kanji i o długości min. 2 znaki (bez hiragany, katakany i znaków specjalnych). Słowa można zaznaczać klikaniem kolejnych sąsiadujących pól (również po przekątnej) albo przeciąganiem. Znalezione słowo świeci na zielono, pojawia się jego znaczenie i — jeśli dźwięk jest włączony — wymowa. Kliknięcie słowa po prawej otwiera standardowy modal z kanji i przykładami. Plansza jest losowa za każdym razem; przycisk „🎲 Nowa plansza” generuje nową.

### Gra z jaskini — co doszło w tej wersji

Wersja rozbudowana względem pierwowzoru `洞窟のともしび`:

- **Więcej opisów, szczególnie whumpu** — dłuższe, scenowe linie: rana głowy, gorączka, utrata przytomności, opieka nad rannym, wychłodzenie. Między wyborem a kolejną sceną pojawiają się linie „co się po kolei stało” (nowe pole `post` w wyborach).
- **Nowe krainy jaskini** — spore / przepaść / woda / rój / wyjście oraz nowe wyrazy twarzy postaci (ból, gorączka, strach, czułość). Tła i sylwetki zostały zachowane w oryginalnym stylu (bez improwizacji, żeby nie było gorzej).
- **Trudniej** — mniejsze leczenie, droższe błędy; najlepsze zakończenie (`ベストエンド`) wymaga wysokiego zaufania, sił i wspólnej decyzji o ratunku.
- **Nagłe bad endy od jednej decyzji** — `胞子の褥` (zasypiasz w zarodnikach), `冷えた水` (pijesz zatrutą wodę), `見捨てた灯` (zostawiasz 遼 za sobą).
- **Sprawdzona logika zakończeń** — `node tools/cave_check.js` przechodzi wszystkie ~2,2 mln sekwencji wyborów i potwierdza, że **każde z 10 zakończeń jest osiągalne** (`node tools/cave_play.js` dodatkowo przechodzi silnik do wybranych zakończeń).

## Historyjki AI — jak mają działać na Pages

GitHub Pages to hosting **statyczny**: backend (`serve.js` + opencode) tam nie zadziała. Żeby generowanie działało na Pages z dowolnego urządzenia, podaj **własny bezpłatny klucz Google Gemini**:

1. Wejdź na https://aistudio.google.com/apikey → „Create API key” (darmowy).
2. W aplikacji: zakładka **📖 Historyjka** → pole „Klucz Gemini” → wklej klucz, wybierz model (np. `gemini-3.7-flash`) → „Zapisz klucz”.
3. Kliknij „🤖 Generuj historyjkę AI”. Klucz zapisuje się tylko w przeglądarce danego urządzenia.

Bez klucza generaator spróbuje połączyć się z `api/story` (lokalny `node serve.js`) — na Pages po prostu pokaże komunikat.

## Postęp między urządzeniami (bez konta i backendu)

Postęp zapisuje się automatycznie po każdej akcji w `localStorage` przeglądarki danego urządzenia (osobno per urządzenie).

### Automatycznie przez GitHub (zalecane)

Stan nauki (status słówek + statystyki) można synchronizować w pliku `progress/save.json` w Twoim repozytorium — działa na Pages, bez żadnego backendu. Wszystko dzieje się z przeglądarki przez GitHub API; token trzymany jest tylko w przeglądarce danego urządzenia.

1. W aplikacji: **Start → Ustawienia → 🔄 Synchronizacja postępu (GitHub)**.
2. Uzupełnij:
   - **Repo (login/nazwa)** — np. `TWOJ_LOGIN/jlpt-n2-game`,
   - **Nazwa urządzenia** — np. `dom` (widoczna przy scalaniu), 
   - **Token GitHub** — patrz niżej.
3. Wciśnij **Zapisz ustawienia sync**, a potem **🔥 Synchronizuj teraz**. Przy powtarzających się uruchomieniach sync działa sam:
   - po każdej ocenionej akcji (opóźnienie ~1,5 s),
   - przy ukryciu/wejściu na kartę, powrocie sieci i po wczytaniu strony.

**Token GitHub (darmowy):**
1. https://github.com/settings/tokens → **„Generate new token (classic)"** (nie fine-grained!).
2. Zaznacz zakres **`repo`** (pełny dostęp do repo) → generuj.
3. Skopiuj `ghp_…` i wklej w ustawieniach gry. Przechowywany jest tylko w `localStorage` tej przeglądarki (nie trafia do eksportów ani do repo).

**Jak działa scalanie:** każde urządzenie „uczy” najsilniejszy stan („znam” > „uczę się” > „nowe”), statystyki łączy przez maksimum, a wynik wypycha do `progress/save.json`. Konfliktów nie ma — oba urządzenia dojdą do tego samego stanu.

> Uwaga: plik `progress/save.json` jest w `.gitignore` — nie wgrywaj go ręcznie do repo.

### Ręcznie (alternatywa)

- na źródłowym urządzeniu: stopka → **exportuj postęp** (pobiera `n2game-save.json`),
- przenieś plik np. przez Google Drive / iCloud / Dropbox / e-mail,
- na drugim urządzeniu: stopka → **importuj postęp** i wybierz plik.

Powieści wizualne mają własny zapis postępu w pamięci przeglądarki (automatyczny, per urządzenie).

## Źródła danych

Dane słownikowe: OpenJLPT (listy Jonathan Waller / tanos.co.uk, przykłady Tatoeba, kanji KANJIDIC2, radykały kradfile2). Licencja CC BY-SA 4.0.