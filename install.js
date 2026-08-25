#!/usr/bin/env node
"use strict";

// =============================================================================
// install.js — instalator paczki @lirdaw/ai-toolkit
//
// Uruchamiany na DWA sposoby:
//   1) automatycznie przez npm, jako `postinstall`, po `npm install` u konsumenta
//   2) recznie: `npx @lirdaw/ai-toolkit install`
//
// Zadanie: rozlozyc artefakty z paczki w projekcie konsumenta i ZAPISAC,
// co dokladnie zostalo rozlozone — zeby deinstalacja nie musiala zgadywac.
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

// Gdzie trafiaja artefakty u konsumenta. Te dwie stale sa JEDYNYM miejscem
// przywiazanym do Claude Code — podmiana ich wystarczy, zeby ta sama paczka
// obslugiwala Cursora (.cursor/) albo Codexa (.agents/).
const TOOL_DIR = ".claude";
const RULES_FILE = "CLAUDE.md";
const MANIFEST_NAME = ".ai-toolkit-manifest.json";

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

function installSkills(consumerRoot) {
  const srcSkills = path.join(PACKAGE_ROOT, "skills");
  const installed = {};

  if (!fs.existsSync(srcSkills)) return installed;

  for (const entry of fs.readdirSync(srcSkills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillName = entry.name;
    const dest = path.join(consumerRoot, TOOL_DIR, "skills", skillName);
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
      `Uszkodzony blok ${PACKAGE_NAME} w ${RULES_FILE}: znaleziono tylko jeden ` +
        `znacznik. Usun pozostaly znacznik recznie i uruchom instalacje ponownie.`
    );
  }

  // Znaczniki w zlej kolejnosci — tez uszkodzenie, tylko innego rodzaju.
  if (start !== -1 && end !== -1 && end < start) {
    throw new Error(
      `Uszkodzony blok ${PACKAGE_NAME} w ${RULES_FILE}: znacznik END wystepuje ` +
        `przed BEGIN.`
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

function installRules(consumerRoot) {
  const srcRules = path.join(PACKAGE_ROOT, "rules", RULES_FILE);
  if (!fs.existsSync(srcRules)) return null;

  const teamRules = fs.readFileSync(srcRules, "utf8");

  // GUARD NA SENTINEL-INJECTION.
  // Jesli dostarczana tresc SAMA zawiera znaczniki, to przy nastepnej
  // aktualizacji instalator wzialby podrzucony znacznik za wlasny
  // i skasowal fragment pliku lezacy poza blokiem. Odmawiamy zapisu.
  if (teamRules.includes(BEGIN) || teamRules.includes(END)) {
    throw new Error(
      `Tresc rules/${RULES_FILE} zawiera znaczniki sentinel. Znaczniki dokleja ` +
        `instalator — nie moga wystepowac w samej tresci reguly.`
    );
  }

  const target = path.join(consumerRoot, RULES_FILE);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

  fs.writeFileSync(target, applyRules(existing, teamRules), "utf8");

  return RULES_FILE;
}

// -----------------------------------------------------------------------------
// 3b. Sprzatanie po POPRZEDNIEJ wersji paczki
// -----------------------------------------------------------------------------

function readPreviousManifest(consumerRoot) {
  const p = path.join(consumerRoot, TOOL_DIR, MANIFEST_NAME);
  if (!fs.existsSync(p)) return null;

  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    // ⚑ USZKODZONY MANIFEST: NIE sprzatamy.
    // Nie wiemy, co paczka kiedys wgrala, wiec kazde kasowanie byloby
    // zgadywaniem. Lepiej zostawic osierocony plik niz skasowac cudzy.
    console.error(
      `[${PACKAGE_NAME}] manifest jest nieczytelny — pomijam sprzatanie po ` +
        `poprzedniej wersji. Osierocone pliki (jesli sa) usun recznie.`
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
function pruneOrphans(consumerRoot, previous, currentSkills) {
  if (!previous) return [];

  const oldSkills = previous.files?.skills || {};
  const skillsRoot = path.join(consumerRoot, TOOL_DIR, "skills");
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

function writeManifest(consumerRoot, skills, rulesFile) {
  const dir = path.join(consumerRoot, TOOL_DIR);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    installedAt: new Date().toISOString(),
    files: {
      skills,
      rules: rulesFile,
    },
  };

  fs.writeFileSync(
    path.join(dir, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  return manifest;
}

// -----------------------------------------------------------------------------
// 5. Przebieg
// -----------------------------------------------------------------------------

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

  // Stary manifest czytamy PRZED instalacja — zaraz zostanie nadpisany,
  // a to jedyne zrodlo wiedzy o tym, co wgrala poprzednia wersja.
  const previous = readPreviousManifest(consumerRoot);

  const skills = installSkills(consumerRoot);
  const orphans = pruneOrphans(consumerRoot, previous, skills);
  const rulesFile = installRules(consumerRoot);
  writeManifest(consumerRoot, skills, rulesFile);

  const skillNames = Object.keys(skills);
  console.log(
    `[${PACKAGE_NAME}@${PACKAGE_VERSION}] zainstalowano ` +
      `${skillNames.length} skill(i): ${skillNames.join(", ") || "brak"}` +
      (rulesFile ? ` + reguly w ${rulesFile}` : "")
  );

  if (orphans.length) {
    console.log(
      `[${PACKAGE_NAME}] usunieto ${orphans.length} artefakt(ow) wycofanych ` +
        `z paczki od wersji ${previous.version}: ${orphans.join(", ")}`
    );
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
