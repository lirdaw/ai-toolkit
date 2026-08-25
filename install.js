#!/usr/bin/env node
"use strict";

// =============================================================================
// install.js — instalator paczki @lirdaw/ai-toolkit
//
// Uruchamiany na DWA sposoby:
//   1) automatycznie przez npm, jako `postinstall`, po `npm install` u konsumenta
//   2) recznie: `npx --package=@lirdaw/ai-toolkit ai-toolkit`
//
// Zadanie: rozlozyc artefakty z paczki w projekcie konsumenta — DLA KAZDEGO
// WYKRYTEGO NARZEDZIA AI — i zapisac, co dokladnie zostalo rozlozone, zeby
// deinstalacja nie musiala zgadywac.
// =============================================================================

const fs = require("fs");
const path = require("path");

// Nazwa paczki wchodzi do znacznikow sentinel, wiec czytamy ja ze zrodla,
// a nie wpisujemy drugi raz recznie. Dwa zapisy tej samej nazwy predzej
// czy pozniej sie rozjada, a wtedy instalator przestaje rozpoznawac
// wlasny blok w pliku konsumenta.
const pkg = require("./package.json");

const PACKAGE_NAME = pkg.name;
const PACKAGE_VERSION = pkg.version;

const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;

// Katalog samej paczki (tam, gdzie lezy ten plik).
const PACKAGE_ROOT = __dirname;

const MANIFEST_NAME = ".ai-toolkit-manifest.json";

// -----------------------------------------------------------------------------
// 0. Profile narzedzi
// -----------------------------------------------------------------------------

// ⚑ TU I TYLKO TU paczka wie cokolwiek o konkretnych narzedziach AI.
// Sam artefakt (SKILL.md, reguly) jest neutralny — narzedzia rozni wylacznie
// katalog docelowy i nazwa pliku regul. Dodanie kolejnego narzedzia to
// dopisanie wiersza w tej mapie, nie zmiana logiki instalatora.
const PROFILES = {
  "claude-code": {
    toolDir: ".claude",
    rulesFile: "CLAUDE.md",
    // Po czym poznajemy, ze projekt uzywa tego narzedzia.
    detect: [".claude", "CLAUDE.md"],
  },
  cursor: {
    toolDir: ".cursor",
    rulesFile: path.join(".cursor", "rules", "ai-toolkit.mdc"),
    detect: [".cursor"],
  },
  codex: {
    toolDir: ".agents",
    rulesFile: "AGENTS.md",
    detect: [".agents", "AGENTS.md"],
  },
};

const DEFAULT_PROFILE = "claude-code";

/**
 * Ktore narzedzia obsluzyc w tym projekcie.
 *
 * Kolejnosc decyzji:
 *   1. Zmienna AI_TOOLKIT_TOOLS — jawny wybor uzytkownika, wygrywa zawsze.
 *   2. Wykrycie po sladach w projekcie — instalujemy do WSZYSTKICH wykrytych,
 *      bo w zespole spotykaja sie rozne narzedzia w jednym repo.
 *   3. Gdy nic nie wykryto — profil domyslny.
 *
 * ⚑ Nie pytamy interaktywnie. `postinstall` bywa uruchamiany w CI, gdzie
 * nie ma komu odpowiedziec, a pytanie bez odpowiedzi zawiesza instalacje.
 */
function resolveProfiles(consumerRoot) {
  const requested = (process.env.AI_TOOLKIT_TOOLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length) {
    const unknown = requested.filter((name) => !PROFILES[name]);
    if (unknown.length) {
      throw new Error(
        `Nieznane narzedzie w AI_TOOLKIT_TOOLS: ${unknown.join(", ")}. ` +
          `Dostepne: ${Object.keys(PROFILES).join(", ")}.`
      );
    }
    return { profiles: requested, source: "AI_TOOLKIT_TOOLS" };
  }

  const detected = Object.entries(PROFILES)
    .filter(([, cfg]) =>
      cfg.detect.some((marker) => fs.existsSync(path.join(consumerRoot, marker)))
    )
    .map(([name]) => name);

  if (detected.length) return { profiles: detected, source: "wykryte w projekcie" };

  return { profiles: [DEFAULT_PROFILE], source: "domyslny" };
}

// -----------------------------------------------------------------------------
// 1. Gdzie jest projekt konsumenta
// -----------------------------------------------------------------------------

function findConsumerRoot() {
  // npm ustawia INIT_CWD na katalog, z ktorego uzytkownik odpalil `npm install`.
  // process.cwd() w trakcie postinstall wskazuje na katalog paczki wewnatrz
  // node_modules, wiec sam w sobie jest bezuzyteczny.
  return process.env.INIT_CWD || process.cwd();
}

// -----------------------------------------------------------------------------
// 2. Kopiowanie skilli
// -----------------------------------------------------------------------------

function copyDirRecursive(src, dest, collected, relBase) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, collected, rel);
    } else {
      fs.copyFileSync(srcPath, destPath);
      // Zbieramy KAZDY skopiowany plik. Ta lista trafi do manifestu i jest
      // jedyna podstawa deinstalacji.
      collected.push(rel);
    }
  }
}

function installSkills(consumerRoot, profile) {
  const srcSkills = path.join(PACKAGE_ROOT, "skills");
  const installed = {};

  if (!fs.existsSync(srcSkills)) return installed;

  for (const entry of fs.readdirSync(srcSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillName = entry.name;
    const dest = path.join(consumerRoot, profile.toolDir, "skills", skillName);
    const files = [];

    // Kopiujemy Z NADPISANIEM. To jest swiadome: skill nalezy do paczki,
    // wiec aktualizacja ma go zastapic. Pliki uzytkownika mieszkaja
    // gdzie indziej i tej sciezki nie dotykamy.
    copyDirRecursive(path.join(srcSkills, skillName), dest, files, "");

    installed[skillName] = { files: files.sort() };
  }

  return installed;
}

// -----------------------------------------------------------------------------
// 3. Reguly — blok miedzy znacznikami sentinel
// -----------------------------------------------------------------------------

function applyRules(existing, teamRules) {
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;

  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  // Przypadek USZKODZONEGO BLOKU: jeden znacznik jest, drugiego nie ma.
  // Zwykle znaczy to, ze ktos recznie skasowal polowe bloku. Gdybysmy
  // po prostu dopisali nowy blok na koncu, uzytkownik dostalby duplikat
  // regul, a instalator stracilby panowanie nad wlasna trescia.
  // Dlatego odmawiamy i kazemy naprawic recznie.
  if ((start === -1) !== (end === -1)) {
    throw new Error(
      `Uszkodzony blok ${PACKAGE_NAME}: znaleziono tylko jeden znacznik. ` +
        `Usun pozostaly znacznik recznie i uruchom instalacje ponownie.`
    );
  }

  // Znaczniki w zlej kolejnosci — tez uszkodzenie, tylko innego rodzaju.
  if (start !== -1 && end !== -1 && end < start) {
    throw new Error(
      `Uszkodzony blok ${PACKAGE_NAME}: znacznik END wystepuje przed BEGIN.`
    );
  }

  // Sciezka aktualizacji: podmieniamy WYLACZNIE srodek bloku.
  // Wszystko przed BEGIN i po END zostaje nietkniete — to jest cala
  // idempotencja tego instalatora.
  if (start !== -1 && end !== -1) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }

  // Sciezka pierwszej instalacji: doklejamy blok na koncu pliku.
  return existing.trimEnd() + "\n\n" + block + "\n";
}

function installRules(consumerRoot, profile) {
  const srcRules = path.join(PACKAGE_ROOT, "rules", "CLAUDE.md");
  if (!fs.existsSync(srcRules)) return null;

  const teamRules = fs.readFileSync(srcRules, "utf8");

  // GUARD NA SENTINEL-INJECTION.
  // Jesli dostarczana tresc SAMA zawiera znaczniki, to przy nastepnej
  // aktualizacji instalator wzialby podrzucony znacznik za wlasny
  // i skasowal fragment pliku lezacy poza blokiem. Odmawiamy zapisu.
  if (teamRules.includes(BEGIN) || teamRules.includes(END)) {
    throw new Error(
      `Tresc rules/CLAUDE.md zawiera znaczniki sentinel. Znaczniki dokleja ` +
        `instalator — nie moga wystepowac w samej tresci reguly.`
    );
  }

  const target = path.join(consumerRoot, profile.rulesFile);

  // Cursor trzyma reguly w zagniezdzonym katalogu, ktory moze jeszcze
  // nie istniec — inaczej niz CLAUDE.md czy AGENTS.md w korzeniu.
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  fs.writeFileSync(target, applyRules(existing, teamRules), "utf8");

  return profile.rulesFile;
}

// -----------------------------------------------------------------------------
// 3b. Sprzatanie po POPRZEDNIEJ wersji paczki
// -----------------------------------------------------------------------------

function manifestPath(consumerRoot, profile) {
  return path.join(consumerRoot, profile.toolDir, MANIFEST_NAME);
}

function readPreviousManifest(consumerRoot, profile) {
  const p = manifestPath(consumerRoot, profile);
  if (!fs.existsSync(p)) return null;

  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    // ⚑ USZKODZONY MANIFEST: NIE sprzatamy.
    // Nie wiemy, co paczka kiedys wgrala, wiec kazde kasowanie byloby
    // zgadywaniem. Lepiej zostawic osierocony plik niz skasowac cudzy.
    console.error(
      `[${PACKAGE_NAME}] manifest w ${profile.toolDir} jest nieczytelny — ` +
        `pomijam sprzatanie po poprzedniej wersji. Osierocone pliki usun recznie.`
    );
    return null;
  }
}

function removeEmptyDirsUpTo(startDir, stopDir) {
  let dir = startDir;
  while (dir.startsWith(stopDir) && dir !== stopDir) {
    if (!fs.existsSync(dir)) {
      dir = path.dirname(dir);
      continue;
    }
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/**
 * Usuwa artefakty, ktore paczka wgrala W POPRZEDNIEJ WERSJI, a ktorych
 * w BIEZACEJ juz nie ma.
 *
 * ⚑ PO CO TO ISTNIEJE.
 * Bez tego kroku skill usuniety z paczki zostaje u konsumenta NA ZAWSZE:
 * nowa wersja go nie kopiuje (bo go nie ma), a manifest zostaje nadpisany
 * lista bez niego — wiec deinstalator tez go nie ruszy. Plik dalej steruje
 * agentem, mimo ze zespol dawno go wycofal. To jest dokladnie ten "cichy
 * blad", ktoremu ta paczka ma zapobiegac.
 *
 * Kasujemy WYLACZNIE pliki wypisane w starym manifescie — czyli tylko to,
 * co sami kiedys wgralismy. Niczego nie zgadujemy z zawartosci katalogu.
 */
function pruneOrphans(consumerRoot, profile, previous, currentSkills) {
  if (!previous) return [];

  const oldSkills = previous.files?.skills || {};
  const skillsRoot = path.join(consumerRoot, profile.toolDir, "skills");
  const removed = [];

  for (const [skillName, oldEntry] of Object.entries(oldSkills)) {
    const stillShipped = currentSkills[skillName];
    const currentFiles = new Set(stillShipped ? stillShipped.files : []);
    const skillDir = path.join(skillsRoot, skillName);

    for (const relFile of oldEntry.files || []) {
      // Plik nadal jest w paczce — zostal wlasnie nadpisany swieza wersja.
      if (currentFiles.has(relFile)) continue;

      const target = path.join(skillDir, relFile);
      if (!fs.existsSync(target)) continue;

      fs.unlinkSync(target);
      removed.push(`${skillName}/${relFile}`);

      // Zwijamy od KATALOGU SKASOWANEGO PLIKU, nie od katalogu skilla —
      // inaczej zagniezdzone katalogi (np. references/) zostaja puste.
      removeEmptyDirsUpTo(path.dirname(target), skillDir);
    }

    removeEmptyDirsUpTo(skillDir, skillsRoot);
  }

  return removed;
}

// -----------------------------------------------------------------------------
// 4. Manifest
// -----------------------------------------------------------------------------

// ⚑ MANIFEST JEST JEDEN NA NARZEDZIE i lezy w katalogu tego narzedzia.
// Dzieki temu kazdy profil sprzata sam po sobie, a manifest zapisany przez
// starsze wersje paczki (gdy istnial tylko Claude Code) pozostaje poprawnym
// manifestem profilu `claude-code` — bez migracji i bez lamania zgodnosci.
function writeManifest(
  consumerRoot,
  profile,
  profileName,
  skills,
  rulesFile,
  createdToolDir
) {
  const dir = path.join(consumerRoot, profile.toolDir);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    tool: profileName,
    installedAt: new Date().toISOString(),
    // ⚑ Czy katalog narzedzia zalozyla TA paczka.
    // Deinstalacja zwija go tylko wtedy, gdy sami go utworzylismy. Katalog,
    // ktory istnial wczesniej, zostaje — nawet pusty. Usuwamy swoje,
    // nie cudze. Manifesty starszych wersji nie maja tego pola i sa
    // czytane jako `false`, czyli po stronie ostrozniejszej.
    createdToolDir,
    files: {
      skills,
      rules: rulesFile,
    },
  };

  fs.writeFileSync(
    manifestPath(consumerRoot, profile),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
}

// -----------------------------------------------------------------------------
// 5. Przebieg
// -----------------------------------------------------------------------------

function installForProfile(consumerRoot, profileName) {
  const profile = PROFILES[profileName];

  // Stary manifest czytamy PRZED instalacja — zaraz zostanie nadpisany,
  // a to jedyne zrodlo wiedzy o tym, co wgrala poprzednia wersja.
  const previous = readPreviousManifest(consumerRoot, profile);

  // Sprawdzamy PRZED utworzeniem czegokolwiek. Przy reinstalacji nosimy
  // dalej odpowiedz z pierwszej instalacji — inaczej druga instalacja
  // zawsze widzialaby katalog jako "cudzy".
  const createdToolDir = previous
    ? previous.createdToolDir === true
    : !fs.existsSync(path.join(consumerRoot, profile.toolDir));

  const skills = installSkills(consumerRoot, profile);
  const orphans = pruneOrphans(consumerRoot, profile, previous, skills);
  const rulesFile = installRules(consumerRoot, profile);

  writeManifest(
    consumerRoot,
    profile,
    profileName,
    skills,
    rulesFile,
    createdToolDir
  );

  const names = Object.keys(skills);
  console.log(
    `[${PACKAGE_NAME}@${PACKAGE_VERSION}] ${profileName}: ` +
      `${names.length} skill(i) [${names.join(", ") || "brak"}]` +
      (rulesFile ? ` + reguly w ${rulesFile}` : "")
  );

  if (orphans.length) {
    console.log(
      `[${PACKAGE_NAME}] ${profileName}: usunieto ${orphans.length} ` +
        `artefakt(ow) wycofanych z paczki od wersji ${previous.version}: ` +
        orphans.join(", ")
    );
  }
}

function main() {
  const consumerRoot = findConsumerRoot();

  // ZABEZPIECZENIE PRZED INSTALACJA W SOBIE.
  // `npm install` uruchomiony w repo samej paczki odpalilby postinstall
  // z INIT_CWD rownym katalogowi paczki — instalator probowalby rozlozyc
  // artefakty w zrodle prawdy. Nie robimy nic i wychodzimy czysto.
  if (path.resolve(consumerRoot) === path.resolve(PACKAGE_ROOT)) {
    console.log(`[${PACKAGE_NAME}] pominieto: to jest repozytorium samej paczki.`);
    return;
  }

  const { profiles, source } = resolveProfiles(consumerRoot);
  console.log(
    `[${PACKAGE_NAME}] narzedzia: ${profiles.join(", ")} (${source})`
  );

  for (const profileName of profiles) {
    installForProfile(consumerRoot, profileName);
  }
}

try {
  main();
} catch (err) {
  // NIE PRZEWRACAMY CALEGO `npm install`.
  // Postinstall, ktory konczy sie bledem, wywala instalacje wszystkich
  // zaleznosci projektu. Nieudane rozlozenie artefaktow AI nie jest tego
  // warte — zglaszamy glosno i wychodzimy z zerem.
  console.error(`[${PACKAGE_NAME}] instalacja artefaktow nie powiodla sie:`);
  console.error(`  ${err.message}`);
  process.exitCode = 0;
}
