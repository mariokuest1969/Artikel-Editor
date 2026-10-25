import { test } from "node:test";
import assert from "node:assert/strict";
import * as plist from "plist";
import { validateImport, countStoredArticles } from "./articleStore";
import { validatePlistPath } from "./storageSettings";

const item = { ArtikelId: "12", Artikel: "Test", Preis: "3,50", PreisAH: "0,00", Extra: "unbekanntes Feld" };
test("Import erhält Dezimalkommas und Zusatzfelder", () => {
  assert.deepEqual(validateImport(plist.build([item])), [item]);
});
test("Neue doppelte Nummern abweisen, bestehenden Bestand weiterhin sichern", () => {
  const raw = plist.build([item, item]);
  assert.throws(() => validateImport(raw), /Doppelte Artikelnummer/);
  assert.equal(countStoredArticles(raw), 2);
});
test("Ungültige Strukturen, binäre Dateien und XML-Entitäten ablehnen", () => {
  assert.throws(() => validateImport(plist.build({ Artikel: "kein Array" })));
  assert.throws(() => validateImport("bplist00"));
  assert.throws(() => validateImport('<!DOCTYPE plist [<!ENTITY test "test">]><plist/>'));
  assert.throws(() => validateImport(plist.build([{ Artikel: "Keine Nummer" }])));
});
test("Dropbox-Pfade prüfen", () => {
  assert.equal(validatePlistPath("/Apps/Artikel-Plist/artikelData.plist"), "/Apps/Artikel-Plist/artikelData.plist");
  for (const path of ["relative.plist", "/../data.plist", "/folder/file.txt", "/folder//file.plist"]) {
    assert.throws(() => validatePlistPath(path));
  }
});
