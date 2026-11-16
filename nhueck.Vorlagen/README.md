# 🗓 Vorlagen (nhueck)

Trägt in Tages-, Wochen- und Monatsnotizen, die schon Inhalt, aber noch keine Vorlage haben, die Standard-Vorlage nach.

- **/Vorlagen nachtragen**: geht alle Tages-, Wochen- und Monatsnotizen durch (standardmäßig nur solche, deren Zeitraum heute oder später endet), fragt nach und setzt dann die Vorlage ein.
- **/Vorlage in diese Notiz**: dasselbe für die gerade geöffnete Kalendernotiz.

Die vorhandenen Zeilen werden einsortiert:
- Zeilen mit dem Lieferungs-Tag (`#bestellung`, auch `#bestellung/…`) ans Ende des Abschnitts „Lieferungen“,
- andere Aufgaben ans Ende des Abschnitts „Aufgaben“,
- alles Übrige ans Ende der Notiz.

Eingerückte Zeilen bleiben bei ihrer übergeordneten Zeile. Eine Notiz gilt als „hat die Vorlage schon“, sobald sie mindestens eine Überschrift der Vorlage enthält. Leere Notizen werden nicht angefasst.

Vorlagen, Überschriften und Tag lassen sich in den Plugin-Einstellungen ändern. Vorlagen mit Template-Tags (z. B. `events()`) werden über np.Templating gerendert; Termine werden dabei für den Tag bzw. die Woche der jeweiligen Notiz geholt.

Notizen, deren Vorlage Termine auflistet, bekommen zusätzlich oben den Eintrag `triggers: onOpen => nhueck.GroupTasks.refreshEvents` (in den Einstellungen änderbar), damit die Termine bei jedem Öffnen aktualisiert werden.
