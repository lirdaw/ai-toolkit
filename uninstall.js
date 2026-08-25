#!/usr/bin/env node
"use strict";

// =============================================================================
// uninstall.js — deinstalator paczki @lirdaw/ai-toolkit
//
// Uruchamiany RECZNIE, wlasna komenda:
//   npx --package=@lirdaw/ai-toolkit ai-toolkit-uninstall
// albo wprost:
//   node node_modules/@lirdaw/ai-toolkit/uninstall.js
//
// ⚑ To OSOBNY wpis w polu "bin". Komenda `ai-toolkit` wskazuje na instalator
// i ignoruje argumenty — `ai-toolkit uninstall` ZAINSTALOWALOBY paczke
// ponownie, zamiast ja usunac.
//
// ⚑ NIE jest podpiety pod zaden hook npm. To swiadome: hooki deinstalacyjne
// menedzera pakietow nie odpalaja sie w kazdym scenariuszu usuwania
// zaleznosci, wiec sprzatanie nie moze na nich polegac.
//
// Cala wiedza o tym, CO usunac, pochodzi z MANIFESTU — nie ze zgadywania
// po zawartosci katalogu i nie z tego, co akurat lezy w paczce.
// =============================================================================

const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");

const PACKAGE_NAME = pkg.name;

const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;

const TOOL_DIR = ".claude";
const MANIFEST_NAME = ".ai-toolkit-manifest.json";

function findConsumerRoot() {
  return process.env.INIT_CWD || process.cwd();
}

// -----------------------------------------------------------------------------
// 1. Usuwanie plikow wypisanych w manifescie
// -----------------------------------------------------------------------------

function removeEmptyDirsUpTo(startDir, stopDir) {
  // Po skasowaniu plikow zostaja puste katalogi po skillach. Zwijamy je
  // w gore, ale ZATRZYMUJEMY SIE na `stopDir` — zeby nigdy nie skasowac
  // katalogu, ktorego paczka nie zakladala.
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

function removeSkills(consumerRoot, skills) {
  const skillsRoot = path.join(consumerRoot, TOOL_DIR, "skills");
  const removed = [];
  const missing = [];

  for (const [skillName, entry] of Object.entries(skills || {})) {
    const skillDir = path.join(skillsRoot, skillName);

    for (const relFile of entry.files || []) {
      const target = path.join(skillDir, relFile);

      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removed.push(path.join(skillName, relFile));
      } else {
        // Plik z manifestu, ktorego juz nie ma. Nie jest to blad —
        // ktos mogl go skasowac recznie. Notujemy i idziemy dalej.
        missing.push(path.join(skillName, relFile));
      }
    }

    removeEmptyDirsUpTo(skillDir, skillsRoot);
  }

  removeEmptyDirsUpTo(skillsRoot, path.join(consumerRoot, TOOL_DIR));

  return { removed, missing };
}

// -----------------------------------------------------------------------------
// 2. Usuwanie bloku regul
// -----------------------------------------------------------------------------

function stripRulesBlock(existing) {
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  // Zadnego znacznika — nie ma czego usuwac.
  if (start === -1 && end === -1) return { text: existing, changed: false };

  // Jeden znacznik bez pary. Tak samo jak w instalatorze: NIE zgadujemy,
  // gdzie konczyl sie blok, bo kazde zgadniecie moze zjesc tresc
  // uzytkownika. Odmawiamy i mowimy, co naprawic.
  if ((start === -1) !== (end === -1)) {
    throw new Error(
      `Uszkodzony blok ${PACKAGE_NAME}: znaleziono tylko jeden znacznik. ` +
        `Usun go recznie — nie da sie bezpiecznie ustalic granic bloku.`
    );
  }

  if (end < start) {
    throw new Error(
      `Uszkodzony blok ${PACKAGE_NAME}: znacznik END wystepuje przed BEGIN.`
    );
  }

  // Wycinamy blok wraz z oboma znacznikami. Wszystko poza nim zostaje.
  const before = existing.slice(0, start);
  const after = existing.slice(end + END.length);

  // Sasiadow bloku rozdzielamy PUSTA LINIA, nie pojedynczym zlamaniem.
  // Blok byl doklejany po pustej linii, wiec jej brak po usunieciu
  // oznaczalby, ze deinstalacja przeformatowala tresc uzytkownika.
  // Deinstalacja ma usuwac swoje, nie ruszac cudzego.
  const separator = before.trim() && after.trim() ? "\n\n" : "\n";

  return {
    text: (before.trimEnd() + separator + after.trimStart()).trimEnd() + "\n",
    changed: true,
  };
}

function removeRules(consumerRoot, rulesFile) {
  if (!rulesFile) return false;

  const target = path.join(consumerRoot, rulesFile);
  if (!fs.existsSync(target)) return false;

  const { text, changed } = stripRulesBlock(fs.readFileSync(target, "utf8"));
  if (changed) fs.writeFileSync(target, text, "utf8");

  return changed;
}

// -----------------------------------------------------------------------------
// 3. Przebieg
// -----------------------------------------------------------------------------

function main() {
  const consumerRoot = findConsumerRoot();
  const manifestPath = path.join(consumerRoot, TOOL_DIR, MANIFEST_NAME);

  // Brak manifestu = paczka nie byla tu instalowana ALBO manifest zaginal.
  // W obu przypadkach nie kasujemy niczego na wyczucie.
  if (!fs.existsSync(manifestPath)) {
    console.log(
      `[${PACKAGE_NAME}] brak manifestu w ${path.join(TOOL_DIR, MANIFEST_NAME)} — ` +
        `nie ma czego usunac.`
    );
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const { removed, missing } = removeSkills(consumerRoot, manifest.files?.skills);
  const rulesChanged = removeRules(consumerRoot, manifest.files?.rules);

  // Manifest kasujemy NA KONCU. Gdyby cokolwiek wyzej rzucilo bledem,
  // manifest zostaje na miejscu i deinstalacje mozna powtorzyc.
  fs.unlinkSync(manifestPath);
  removeEmptyDirsUpTo(path.join(consumerRoot, TOOL_DIR), consumerRoot);

  console.log(
    `[${PACKAGE_NAME}@${manifest.version}] usunieto ${removed.length} plik(ow)` +
      (rulesChanged ? ` + blok regul w ${manifest.files.rules}` : "") +
      (missing.length ? ` (${missing.length} plik(ow) juz nie istnialo)` : "")
  );
}

try {
  main();
} catch (err) {
  // Tu, w odroznieniu od instalatora, KONCZYMY BLEDEM.
  // Deinstalacja jest uruchamiana swiadomie i recznie — uzytkownik ma
  // prawo wiedziec, ze nie doszla do konca, zamiast dostac zielony wynik
  // i resztki w repo.
  console.error(`[${PACKAGE_NAME}] deinstalacja nie powiodla sie:`);
  console.error(`  ${err.message}`);
  process.exitCode = 1;
}
