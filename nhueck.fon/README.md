# 📞 Fon (nhueck)

Sucht in der geöffneten Notiz nach Nachnamen, die auch im Adressbuch stehen, und schreibt die Telefonnummer anklickbar dahinter:

`Herrn Müller anrufen` wird zu `Herrn Müller [📞 +49 171 1234567](tel:+491711234567) anrufen`

- **/Telefonnummern einfügen** (Alias `fon`, `tel`): bearbeitet die geöffnete Notiz.
- **/kontakteImportieren**: übernimmt die Kontakte in die Kontakte-Notiz. Wird vom Kurzbefehl aufgerufen (siehe unten).

## So wird eingetragen

- Namen werden als ganzes Wort und mit Groß-/Kleinschreibung gesucht („Müller“, nicht „müller“ oder „Müllerstraße“).
- Gibt es zu einem Namen mehrere Nummern oder mehrere Personen, fragt das Plugin, welche Nummer gemeint ist (oder „Überspringen“).
- Steht der Vorname dabei („Anna Müller“ oder „Müller, Anna“), kommen nur die Nummern dieser Person in Frage.
- Kontakte ohne Nachnamen werden unter ihrem Firmennamen gefunden.
- Zusätze in Klammern und Doppeleinträge zählen mit: „Müller (Glück)“ wird auch unter „Müller“ gefunden, „Moser/Wiens“ auch unter „Moser“ und „Wiens“.
- Namen, die schon eine Nummer haben, bleiben unverändert. Normalerweise bekommt nur das erste Vorkommen je Name eine Nummer (in den Einstellungen änderbar).
- Nicht angefasst werden: Titel der Notiz, Frontmatter, Code, Links, `[[Notiz-Links]]`, #Tags und @Erwähnungen.
- Nachnamen, die auch gewöhnliche Wörter sind (Koch, Klein …), lassen sich in den Einstellungen ausschließen.

## Kontakte bereitstellen (Kurzbefehl)

NotePlan-Plugins haben keinen Zugriff auf das Adressbuch. Deshalb liegen die Kontakte in einer Notiz (Standard: `@Kontakte/Telefonliste`), die ein Kurzbefehl füllt. Der Kurzbefehl wird einmal in der Kurzbefehle-App angelegt, steht dann über iCloud auf Mac, iPhone und iPad bereit und muss nur nach Änderungen im Adressbuch erneut laufen.

Kurzbefehl „Kontakte exportieren“ mit diesen Aktionen:

1. **Kontakte suchen** – ohne Filter (alle Kontakte), ohne Limit.
2. **Wiederholen mit jedem** – Objekt in „Kontakte“.
3. Darin für jeden Kontakt diesen Text erzeugen – eine Zeile `T` je Telefonnummer, mit der Bezeichnung der Nummer in Klammern (die Klammern dürfen leer sein):
   ```
   ###
   N: Nachname
   V: Vorname
   F: Firma
   T (Mobil): +49 170 1234567
   T (Privat): 0821 12345
   ```
4. Die Texte aller Kontakte mit neuen Zeilen aneinanderhängen.
5. **In Zwischenablage kopieren**.
6. **URL öffnen**: `noteplan://x-callback-url/runPlugin?pluginID=nhueck.fon&command=kontakteImportieren`

NotePlan meldet danach, wie viele Kontakte übernommen wurden. Die Kontakte stehen danach noch in der Zwischenablage.
