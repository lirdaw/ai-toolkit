# @lirdaw/ai-toolkit

Wersjonowana paczka artefaktów AI — skille i reguły — dystrybuowana przez
GitHub Packages.

Artefakty AI są wykonywane przy każdej zmianie w kodzie, więc ich nieaktualna
kopia nie jest starą notatką, tylko cichym błędem. Ta paczka traktuje je jak
kod: z wersją, historią i kontrolowaną instalacją.

## Zawartość

| Ścieżka | Co to jest |
|---|---|
| `skills/code-review/SKILL.md` | kryteria przeglądu zmiany i format werdyktu |
| `rules/CLAUDE.md` | konwencje zespołowe wstrzykiwane do pliku reguł konsumenta |

## Instalacja u konsumenta

W repozytorium konsumenta, jednorazowo — mapowanie scope'a w `.npmrc`:

```
@lirdaw:registry=https://npm.pkg.github.com
```

Ten plik jest commitowany i **nie zawiera tokena**. Odczyt z GitHub Packages
wymaga uwierzytelnienia: lokalnie przez `npm login --scope=@lirdaw
--registry=https://npm.pkg.github.com`, w CI przez zmienną środowiskową.

Następnie:

```bash
npm install @lirdaw/ai-toolkit
```

`postinstall` uruchamia `install.js`, który:

- kopiuje skille do `.claude/skills/<nazwa>/`,
- wstrzykuje reguły do `CLAUDE.md` między znaczniki `<!-- BEGIN ... -->`
  i `<!-- END ... -->`,
- zapisuje `.claude/.ai-toolkit-manifest.json` z wersją i listą wgranych plików.

Instalacja jest idempotentna: ponowne uruchomienie podmienia treść **wyłącznie
między znacznikami**. Cokolwiek dopiszesz w `CLAUDE.md` poza blokiem, zostaje
nietknięte.

## Deinstalacja

```bash
node node_modules/@lirdaw/ai-toolkit/uninstall.js
```

Deinstalator czyta manifest i usuwa dokładnie te pliki, które kiedyś wgrał —
nie zgaduje po zawartości katalogu. Bez manifestu nie usuwa niczego.

## Wydawanie nowej wersji

1. Zmień zawartość `skills/` albo `rules/`.
2. Podbij `version` w `package.json`.
3. Merge do `main`.

CI waliduje paczkę i publikuje ją do GitHub Packages. Publikacja bez podbicia
wersji jest pomijana — GitHub Packages odrzuca duplikat wersji.

## Przenośność

Katalog docelowy i nazwa pliku reguł są w `install.js` dwiema stałymi:

```js
const TOOL_DIR = ".claude";
const RULES_FILE = "CLAUDE.md";
```

To jedyne miejsca przywiązane do konkretnego narzędzia. Obsługa Cursora
(`.cursor/`) czy Codeksa (`.agents/`, `AGENTS.md`) to ich podmiana, nie
przepisanie instalatora.

Podobnie po stronie rejestru: `publishConfig` w `package.json`, `.npmrc`
konsumenta i job publikujący w CI są jedynymi elementami zależnymi od
GitHub Packages. Reszta — zawartość paczki, instalator, znaczniki, manifest —
jest neutralna.
