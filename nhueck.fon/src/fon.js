// @flow
//-----------------------------------------------------------------------------
// Fon (nhueck): find last names from the address book in the open note, and write the phone number
// in an indented line below, as a clickable link.
// The NotePlan plugin API has no access to the address book, so the contacts are read from a note.
// That note is written by the 'kontakteImportieren' command, from the text that an Apple Shortcut
// puts on the clipboard (see README).
//-----------------------------------------------------------------------------

import pluginJson from '../plugin.json'
import {
  type Occurrence,
  type PhoneChoice,
  findOccurrences,
  formatContactsNote,
  getPhoneChoices,
  getTelURLs,
  groupByLastName,
  isPhoneLine,
  makeChoiceLabel,
  makeNameRegex,
  makePhoneLine,
  makePhoneLink,
  makeTelURL,
  parseContactsNote,
  parseShortcutExport,
} from './fonHelpers'
import { logDebug, logError, logInfo } from '@helpers/dev'
import { chooseOption, showMessage } from '@helpers/userInput'

const DIALOG_TITLE = 'Telefonnummern einfügen'
const IMPORT_TITLE = 'Kontakte importieren'
const ALL_OCCURRENCES = 'Alle Vorkommen'
const SKIP = -1

type FonConfig = {
  contactsNote: string,
  occurrences: string,
  linkPrefix: string,
  namesToIgnore: Array<string>,
}

function getConfig(): FonConfig {
  const s = DataStore.settings ?? {}
  return {
    contactsNote: String(s.contactsNote ?? '@Kontakte/Telefonliste.md').trim(),
    occurrences: String(s.occurrences ?? ''),
    linkPrefix: String(s.linkPrefix ?? ''),
    namesToIgnore: String(s.namesToIgnore ?? '').split(','),
  }
}

/**
 * Find the contacts note: by filename, or failing that by title.
 * @param {string} nameOrFilename from the settings
 * @returns {?TNote}
 */
function getContactsNote(nameOrFilename: string): ?TNote {
  const byFilename = DataStore.projectNoteByFilename(nameOrFilename) ?? DataStore.projectNoteByFilename(`${nameOrFilename}.md`) ?? DataStore.projectNoteByFilename(`${nameOrFilename}.txt`)
  if (byFilename) return byFilename
  const title = (nameOrFilename.split('/').pop() ?? '').replace(/\.(md|txt)$/, '')
  const byTitle = DataStore.projectNoteByTitle(title, true, true) ?? []
  return byTitle.length > 0 ? byTitle[0] : null
}

/**
 * Plugin command: write the phone numbers of the last names in the open note, each in an indented line below the line with the name.
 */
export async function telefonnummernEinfuegen(): Promise<void> {
  try {
    const config = getConfig()
    const note = Editor.note
    if (!note) {
      await showMessage('Bitte zuerst eine Notiz öffnen.', 'OK', DIALOG_TITLE)
      return
    }

    // Get the contacts
    const contactsNote = getContactsNote(config.contactsNote)
    if (!contactsNote) {
      await showMessage(
        `Ich finde die Kontakte-Notiz „${config.contactsNote}“ nicht. Sie entsteht, wenn du den Kurzbefehl „Kontakte exportieren“ ausführst (siehe README des Plugins).`,
        'OK',
        DIALOG_TITLE,
      )
      return
    }
    if (contactsNote.filename === note.filename) {
      await showMessage('Das ist die Kontakte-Notiz selbst – hier trage ich nichts ein.', 'OK', DIALOG_TITLE)
      return
    }
    const contacts = parseContactsNote(contactsNote.content ?? '')
    const contactsByName = groupByLastName(contacts, config.namesToIgnore)
    const nameRegex = makeNameRegex(Array.from(contactsByName.keys()))
    logDebug(pluginJson, `${contacts.length} Kontakte mit Nummer, ${contactsByName.size} verschiedene Nachnamen aus '${contactsNote.filename}'`)
    if (!nameRegex) {
      await showMessage(`In der Kontakte-Notiz „${config.contactsNote}“ stehen keine Kontakte mit Telefonnummer.`, 'OK', DIALOG_TITLE)
      return
    }

    // Find the names in the note. The note's title, its frontmatter and code are left alone.
    const paragraphs = Editor.paragraphs
    const found: Array<{ para: TParagraph, occurrence: Occurrence }> = []
    let inFrontmatter = false
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i]
      if (para.type === 'separator' && (i === 0 || inFrontmatter)) {
        inFrontmatter = !inFrontmatter
        continue
      }
      if (inFrontmatter || para.type === 'code' || para.type === 'empty' || para.type === 'separator') continue
      if (i === 0 && para.type === 'title') continue
      // the lines with phone numbers that this command wrote earlier are not searched
      if (isPhoneLine(para.content)) continue
      // Which numbers already stand in the phone lines right below this line?
      const telURLsBelow: Array<string> = []
      for (let j = i + 1; j < paragraphs.length && isPhoneLine(paragraphs[j].content); j++) {
        telURLsBelow.push(...getTelURLs(paragraphs[j].content))
      }
      for (const occurrence of findOccurrences(para.content, nameRegex, contactsByName)) {
        if (!occurrence.linked && telURLsBelow.length > 0) {
          const numbersOfName = getPhoneChoices({ ...occurrence, firstNames: [] }, contactsByName).map((c) => makeTelURL(c.phone.number))
          occurrence.linked = numbersOfName.some((url) => telURLsBelow.includes(url))
        }
        found.push({ para, occurrence })
      }
    }

    // Which of them get a number?
    let wanted = found.filter((f) => !f.occurrence.linked)
    if (config.occurrences !== ALL_OCCURRENCES) {
      // only the first occurrence of each name, and only if the name doesn't have a number anywhere in the note yet
      const namesDone = new Set(found.filter((f) => f.occurrence.linked).map((f) => f.occurrence.name))
      wanted = wanted.filter((f) => {
        if (namesDone.has(f.occurrence.name)) return false
        namesDone.add(f.occurrence.name)
        return true
      })
    }
    if (wanted.length === 0) {
      const message = found.length > 0 ? 'Alle gefundenen Namen haben schon eine Telefonnummer.' : 'Ich habe in dieser Notiz keinen Nachnamen aus dem Adressbuch gefunden.'
      await showMessage(message, 'OK', DIALOG_TITLE)
      return
    }

    // Work out the number for each of them, asking the user where there are several. The same question is only asked once.
    const answers: Map<string, number> = new Map() // key -> index of the chosen number, or SKIP
    const linksByPara: Map<TParagraph, Array<{ name: string, link: string }>> = new Map()
    let numInserted = 0
    for (const { para, occurrence } of wanted) {
      const choices: Array<PhoneChoice> = getPhoneChoices(occurrence, contactsByName)
      if (choices.length === 0) continue
      let chosen = 0
      if (choices.length > 1) {
        const key = `${occurrence.name}|${occurrence.firstNames.join(',')}`
        const earlierAnswer = answers.get(key)
        if (earlierAnswer != null) {
          chosen = earlierAnswer
        } else {
          const options = choices.map((c, index) => ({ label: makeChoiceLabel(c), value: index }))
          options.push({ label: '⏭ Überspringen (keine Nummer eintragen)', value: SKIP })
          chosen = await chooseOption(`Welche Nummer für „${occurrence.name}“?`, options, SKIP)
          answers.set(key, chosen)
        }
      }
      if (chosen === SKIP) continue
      const entry = { name: occurrence.name, link: makePhoneLink(choices[chosen].phone.number, config.linkPrefix) }
      const list = linksByPara.get(para)
      if (list) {
        list.push(entry)
      } else {
        linksByPara.set(para, [entry])
      }
      numInserted++
    }

    // Write the new lines: below the line with the name, indented one step further.
    // From the bottom of the note upwards, so that the line numbers stay valid.
    const parasToDo = Array.from(linksByPara.keys()).sort((a, b) => b.lineIndex - a.lineIndex)
    for (const para of parasToDo) {
      const entries = linksByPara.get(para) ?? []
      // the name is only written if the line has several names with a number
      const withName = entries.length > 1
      for (const entry of [...entries].reverse()) {
        Editor.insertParagraph(makePhoneLine(entry.link, para.indents + 1, withName ? entry.name : ''), para.lineIndex + 1, 'text')
      }
    }
    logInfo(pluginJson, `${numInserted} Telefonnummer(n) in '${note.filename}' eingetragen`)
    if (numInserted === 0) {
      await showMessage('Keine Telefonnummer eingetragen.', 'OK', DIALOG_TITLE)
    }
  } catch (error) {
    logError(pluginJson, `telefonnummernEinfuegen: ${error.message}`)
    await showMessage(`Fehler: ${error.message}`, 'OK', DIALOG_TITLE)
  }
}

/**
 * Plugin command: write the contacts note from the text that the 'Kontakte exportieren' shortcut produces.
 * Called by that shortcut through an x-callback URL. The text comes from the clipboard, or (for short lists) as argument.
 * @param {string?} textArg the exported contacts; if not given, the clipboard is used
 */
export async function kontakteImportieren(textArg?: string = ''): Promise<void> {
  try {
    const config = getConfig()
    const text = textArg !== '' ? textArg : Clipboard.string ?? ''
    const contacts = parseShortcutExport(text)
    if (contacts.length === 0) {
      await showMessage(
        'In der Zwischenablage stehen keine Kontakte im erwarteten Format. Dieser Befehl wird vom Kurzbefehl „Kontakte exportieren“ aufgerufen (siehe README des Plugins). Die Kontakte-Notiz bleibt unverändert.',
        'OK',
        IMPORT_TITLE,
      )
      return
    }

    // Write the note (new, or replacing the content of the existing one)
    const filename = /\.(md|txt)$/.test(config.contactsNote) ? config.contactsNote : `${config.contactsNote}.md`
    const parts = filename.split('/')
    const basename = parts.pop() ?? filename
    const folder = parts.length > 0 ? parts.join('/') : '/'
    const title = basename.replace(/\.(md|txt)$/, '')
    const now = new Date()
    const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
    const content = formatContactsNote(contacts, title, dateStr)
    const existingNote = getContactsNote(config.contactsNote)
    let writtenTo = ''
    if (existingNote) {
      existingNote.content = content
      writtenTo = existingNote.filename
    } else {
      writtenTo = DataStore.newNoteWithContent(content, folder, basename)
    }
    const numPhones = contacts.reduce((sum, c) => sum + c.phones.length, 0)
    logInfo(pluginJson, `${contacts.length} Kontakte mit ${numPhones} Nummern nach '${writtenTo}' geschrieben`)
    await showMessage(`${contacts.length} Kontakte mit ${numPhones} Telefonnummern übernommen.`, 'OK', IMPORT_TITLE)
  } catch (error) {
    logError(pluginJson, `kontakteImportieren: ${error.message}`)
    await showMessage(`Fehler: ${error.message}`, 'OK', IMPORT_TITLE)
  }
}
