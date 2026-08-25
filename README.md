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

Aktualizacja **usuwa też artefakty wycofane z paczki**. Instalator czyta stary
manifest, zanim go nadpisze, i kasuje pliki, które wgrał w poprzedniej wersji,
a których w bieżącej już nie ma. Bez tego skill usunięty z paczki zostawałby
u konsumenta na zawsze — nieaktualizowany i niewidoczny dla deinstalatora.

Kasowane jest wyłącznie to, co wypisane w manifeście. Pliki, których paczka
nigdy nie wgrała, zostają nietknięte, a **nieczytelny manifest wstrzymuje
sprzątanie** zamiast zgadywać po zawartości katalogu.

## Deinstalacja

```bash
npx --package=@lirdaw/ai-toolkit ai-toolkit-uninstall
```

albo wprost:

```bash
node node_modules/@lirdaw/ai-toolkit/uninstall.js
```

Deinstalator czyta manifest i usuwa dokładnie te pliki, które kiedyś wgrał —
nie zgaduje po zawartości katalogu. Bez manifestu nie usuwa niczego.

> Deinstalacja ma **własną komendę**. `ai-toolkit uninstall` nie zadziała:
> komenda `ai-toolkit` wskazuje na instalator i ignoruje argumenty, więc
> zainstalowałaby paczkę ponownie zamiast ją usunąć.

## Wydawanie nowej wersji

1. Zmień zawartość `skills/` albo `rules/`.
2. Podbij `version` w `package.json`.
3. Merge do `main`.

CI waliduje paczkę i publikuje ją do GitHub Packages. Publikacja bez podbicia
wersji jest pomijana — GitHub Packages odrzuca duplikat wersji.

## Wiele narzędzi naraz

`SKILL.md` jest formatem neutralnym — narzędzia różni wyłącznie katalog
docelowy i nazwa pliku reguł. Paczka obsługuje trzy profile:

| profil | skille | reguły |
|---|---|---|
| `claude-code` | `.claude/skills/` | `CLAUDE.md` |
| `cursor` | `.cursor/skills/` | `.cursor/rules/ai-toolkit.mdc` |
| `codex` | `.agents/skills/` | `AGENTS.md` |

**Wybór profilu jest automatyczny.** Instalator wykrywa po śladach w projekcie
(`.claude/`, `.cursor/`, `.agents/`, `CLAUDE.md`, `AGENTS.md`) i instaluje do
**wszystkich wykrytych** — bo w jednym repo spotykają się różne narzędzia.
Gdy nie wykryje nic, używa `claude-code`.

Jawny wybór wygrywa z wykryciem:

```bash
AI_TOOLKIT_TOOLS=cursor,codex npm install @lirdaw/ai-toolkit
```

Instalator **nie pyta interaktywnie** — `postinstall` bywa uruchamiany w CI,
gdzie nie ma komu odpowiedzieć, a pytanie bez odpowiedzi zawiesza instalację.

Dodanie kolejnego narzędzia to dopisanie wiersza do mapy `PROFILES`
w `install.js`, nie zmiana logiki instalatora.

## Manifest — jeden na narzędzie

Każdy profil ma własny manifest w swoim katalogu (`.claude/`, `.cursor/`,
`.agents/`). Dzięki temu profile sprzątają niezależnie, a manifest zapisany
przez wersje sprzed obsługi wielu narzędzi pozostaje poprawnym manifestem
profilu `claude-code` — bez migracji.

Manifest zapisuje też, **czy katalog narzędzia założyła ta paczka**.
Deinstalacja zwija go tylko wtedy, gdy tak było; katalog istniejący wcześniej
zostaje, nawet pusty.

## Przenośność rejestru

`publishConfig` w `package.json`, `.npmrc` konsumenta i job publikujący w CI
są jedynymi elementami zależnymi od GitHub Packages. Reszta — zawartość paczki,
instalator, znaczniki, manifest, profile narzędzi — jest neutralna.
