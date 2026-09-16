# 日本語 N2 — gra do nauki słówek + powieści wizualne

Nauka słówek **JLPT N2** (OpenJLPT, 1793 słowa) przez fiszki, quizy i generowane historyjki, plus 4 gotowe powieści wizualne po japońsku. Działa w pełni offline, bez konta, na każdym urządzeniu (telefon, tablet, laptop). Gotowe do opublikowania na **GitHub Pages**.

## Co tu jest

| Plik | Co to jest |
|---|---|
| `index.html` | strona główna — fiszki, quiz, słownik, kanji, historyjki AI |
| `app.js` + `engine.js` + `n2data.js` | logika i dane aplikacji |
| `storyllm.js` | budowanie promptu i parsowanie historyjek z modelu (używany też przez `serve.js`) |
| `vn.html` / `kitsunebi.html` / `kagami-no-yado.html` / `saishu-tenji.html` | 4 powieści wizualne (self-contained) |
| `serve.js` | *tylko lokalnie*: serwer + proxy historyjek do opencode (nie wchodzi na Pages) |
| `build.js`, `test_all.js` | *tylko lokalnie*: regeneracja danych, testy silnika |

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

Otwieranie powieści wizualnych: są na stronie głównej w sekcji „📚 Powieści wizualne” (każda otwiera się w nowej karcie).

## Historyjki AI — jak mają działać na Pages

GitHub Pages to hosting **statyczny**: backend (`serve.js` + opencode) tam nie zadziała. Żeby generowanie działało na Pages z dowolnego urządzenia, podaj **własny bezpłatny klucz Google Gemini**:

1. Wejdź na https://aistudio.google.com/apikey → „Create API key” (darmowy).
2. W aplikacji: zakładka **📖 Historyjka** → pole „Klucz Gemini” → wklej klucz, wybierz model (np. `gemini-2.5-flash`) → „Zapisz klucz”.
3. Kliknij „🤖 Generuj historyjkę AI”. Klucz zapisuje się tylko w przeglądarce danego urządzenia.

Bez klucza generaator spróbuje połączyć się z `api/story` (lokalny `node serve.js`) — na Pages po prostu pokaże komunikat.

## Postęp między urządzeniami (bez konta i backendu)

Postęp zapisuje się automatycznie po każdej akcji w `localStorage` przeglądarki danego urządzenia (osobno per urządzenie). Żeby przenieść go na inny gadżet:

- na źródłowym urządzeniu: stopka → **exportuj postęp** (pobiera `n2game-save.json`),
- przenieś plik np. przez Google Drive / iCloud / Dropbox / e-mail,
- na drugim urządzeniu: stopka → **importuj postęp** i wybierz plik.

Powieści wizualne mają własny zapis postępu w pamięci przeglądarki (automatyczny, per urządzenie).

## Źródła danych

Dane słownikowe: OpenJLPT (listy Jonathan Waller / tanos.co.uk, przykłady Tatoeba, kanji KANJIDIC2, radykały kradfile2). Licencja CC BY-SA 4.0.