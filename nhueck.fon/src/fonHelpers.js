// @flow
//-----------------------------------------------------------------------------
// Fon (nhueck): pure helper functions (no NotePlan API calls), so they can be tested with jest.
//-----------------------------------------------------------------------------

export type Phone = {
  label: string, // e.g. 'Mobil'; may be ''
  number: string, // as written in the address book
}

export type Contact = {
  lastName: string, // or the organisation name, for contacts without a last name
  firstName: string, // may be ''
  phones: Array<Phone>,
}

// One number of one contact: what the user picks from
export type PhoneChoice = {
  contact: Contact,
  phone: Phone,
}

// A last name found in a line of text
export type Occurrence = {
  name: string, // the last name, as in the address book
  start: number, // position of the name in the text
  end: number, // position just after the name
  linked: boolean, // already followed by a phone link?
  firstNames: Array<string>, // first names (of contacts with this last name) found next to the name; usually empty
}

/**
 * Read the contacts from the content of the contacts note, as written by the 'Kontakte importieren' command (formatContactsNote() below).
 * Each contact is a list line: `- Nachname | Vorname | Label: Nummer | Label: Nummer ...`
 * Other lines are ignored, as are contacts without a name or without a number.
 * @param {string} content of the note
 * @returns {Array<Contact>}
 */
export function parseContactsNote(content: string): Array<Contact> {
  const contacts: Array<Contact> = []
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*[-*+]\s+(.*)$/)
    if (!match) continue
    const fields = match[1].split('|').map((f) => f.trim())
    if (fields.length < 3 || fields[0] === '') continue
    const phones: Array<Phone> = []
    for (const field of fields.slice(2)) {
      if (field === '') continue
      // The label is everything before the last colon that is followed by the number
      const phoneMatch = field.match(/^(?:(.*?):\s*)?([^:]*)$/)
      const number = (phoneMatch?.[2] ?? '').trim()
      if (number === '' || !/\d/.test(number)) continue
      phones.push({ label: (phoneMatch?.[1] ?? '').trim(), number })
    }
    if (phones.length > 0) {
      contacts.push({ lastName: fields[0], firstName: fields[1], phones })
    }
  }
  return contacts
}

/**
 * Read the contacts from the text that the 'Kontakte exportieren' shortcut (Apple Shortcuts) produces.
 * Each contact is a block of lines, started by a line '###':
 *   ###
 *   N: Nachname
 *   V: Vorname
 *   F: Firma
 *   T (Mobil): +49 170 1234567
 *   T (): 0821 12345
 * There is one 'T' line per phone number, with the number's label in brackets (which may be empty or missing).
 * Lines after a 'T' line that don't start a new field are taken as further numbers (that is how Shortcuts writes a list of numbers).
 * Contacts without a last name get the company as name. Contacts without name or without number are left out.
 * @param {string} text
 * @returns {Array<Contact>} sorted by last name, then first name
 */
export function parseShortcutExport(text: string): Array<Contact> {
  const contacts: Array<Contact> = []
  // '|' separates the fields in the contacts note, ':' the label from the number, and square brackets would break the link
  const clean = (str: string): string => str.replace(/[|[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const block of text.split(/^\s*###\s*$/m)) {
    let lastName = ''
    let firstName = ''
    let company = ''
    const phones: Array<Phone> = []
    const addPhone = (label: string, number: string) => {
      const cleanNumber = clean(number).replace(/:/g, ' ').trim()
      if (/\d/.test(cleanNumber) && !phones.some((p) => makeTelURL(p.number) === makeTelURL(cleanNumber))) {
        phones.push({ label: clean(label).replace(/:/g, ' ').trim(), number: cleanNumber })
      }
    }
    let inPhones = false
    for (const rawLine of block.split(/\r?\n/)) {
      const line = rawLine.trim()
      const phoneField = line.match(/^T\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/)
      const nameField = line.match(/^([NVF]):\s*(.*)$/)
      if (phoneField) {
        inPhones = true
        addPhone(phoneField[1] ?? '', phoneField[2])
      } else if (nameField && !inPhones) {
        const value = clean(nameField[2])
        if (nameField[1] === 'N') lastName = value
        else if (nameField[1] === 'V') firstName = value
        else company = value
      } else if (inPhones && line !== '') {
        addPhone('', line)
      }
    }
    const name = lastName !== '' ? lastName : company
    if (name !== '' && phones.length > 0) {
      contacts.push({ lastName: name, firstName, phones })
    }
  }
  contacts.sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'))
  return contacts
}

/**
 * Make the content of the contacts note, which parseContactsNote() reads back.
 * @param {Array<Contact>} contacts
 * @param {string} title of the note
 * @param {string} dateStr when the contacts were imported, to show in the note
 * @returns {string}
 */
export function formatContactsNote(contacts: Array<Contact>, title: string, dateStr: string): string {
  const lines = [
    '---',
    `title: ${title}`,
    '---',
    `${contacts.length} Kontakte aus dem Adressbuch, importiert am ${dateStr} vom Plugin „Fon“. Bitte nicht von Hand ändern – die Notiz wird beim nächsten Import überschrieben.`,
  ]
  for (const contact of contacts) {
    const phones = contact.phones.map((p) => (p.label !== '' ? `${p.label}: ${p.number}` : p.number))
    lines.push(`- ${[contact.lastName, contact.firstName, ...phones].join(' | ')}`)
  }
  return lines.join('\n')
}

/**
 * Get the names under which a contact is to be found in a text, from the 'last name' in the address book:
 * the name itself, the name without an addition in brackets ('Müller (Glück)' -> 'Müller'), and the parts of a double entry ('Moser/Wiens' -> 'Moser', 'Wiens').
 * @param {string} lastName
 * @returns {Array<string>}
 */
export function getNameVariants(lastName: string): Array<string> {
  const variants: Array<string> = []
  const add = (name: string) => {
    const trimmed = name.trim()
    if (trimmed.length >= 2 && !variants.includes(trimmed)) variants.push(trimmed)
  }
  add(lastName)
  const withoutBrackets = lastName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ')
  add(withoutBrackets)
  if (withoutBrackets.includes('/')) {
    withoutBrackets.split('/').forEach(add)
  }
  return variants
}

/**
 * Group the contacts by the names they are to be found under (see getNameVariants()).
 * @param {Array<Contact>} contacts
 * @param {Array<string>} namesToIgnore names that are never to be matched (compared without regard to case)
 * @returns {Map<string, Array<Contact>>}
 */
export function groupByLastName(contacts: Array<Contact>, namesToIgnore: Array<string> = []): Map<string, Array<Contact>> {
  const ignore = namesToIgnore.map((n) => n.trim().toLowerCase()).filter((n) => n !== '')
  const byName: Map<string, Array<Contact>> = new Map()
  for (const contact of contacts) {
    for (const name of getNameVariants(contact.lastName)) {
      if (ignore.includes(name.toLowerCase())) continue
      const list = byName.get(name)
      if (list) {
        list.push(contact)
      } else {
        byName.set(name, [contact])
      }
    }
  }
  return byName
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Make the regular expression that finds any of the given names as a whole word. The match is case-sensitive.
 * Longer names come first, so that 'Müller-Schmidt' wins over 'Müller'.
 * Note: built from a string (not a literal) so that the build doesn't try to transpile the look-behind and \p{..}.
 * @param {Array<string>} names
 * @returns {?RegExp} null if there are no names
 */
export function makeNameRegex(names: Array<string>): ?RegExp {
  if (names.length === 0) return null
  const sorted = [...names].sort((a, b) => b.length - a.length || a.localeCompare(b))
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
}

/**
 * Find the parts of a line that must not be changed: links, wiki links, URLs, inline code, hashtags and mentions.
 * @param {string} text
 * @returns {Array<[number, number]>} start (inclusive) and end (exclusive) positions
 */
export function findProtectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const patterns = [
    /\[\[[^\]]*\]\]/g, // [[wiki link]]
    /!?\[[^\]]*\]\([^)]*\)/g, // [text](url)
    /`[^`]*`/g, // `code`
    /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/g, // URL
    /(?:^|\s)[#@][^\s]+/g, // #tag or @mention
  ]
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0
      ranges.push([start, start + m[0].length])
    }
  }
  return ranges
}

/**
 * Find the last names in a line of text.
 * Names inside links, URLs, code, tags and mentions are left out.
 * @param {string} text
 * @param {RegExp} nameRegex from makeNameRegex()
 * @param {Map<string, Array<Contact>>} contactsByName from groupByLastName()
 * @returns {Array<Occurrence>} in order of appearance
 */
export function findOccurrences(text: string, nameRegex: RegExp, contactsByName: Map<string, Array<Contact>>): Array<Occurrence> {
  const protectedRanges = findProtectedRanges(text)
  const occurrences: Array<Occurrence> = []
  for (const m of text.matchAll(nameRegex)) {
    const name = m[0]
    const start = m.index ?? 0
    const end = start + name.length
    if (protectedRanges.some(([from, to]) => start < to && end > from)) continue
    const before = text.slice(0, start)
    const after = text.slice(end)
    // Which first names (of the contacts with this last name) stand right before the name ('Anna Müller') or after it ('Müller, Anna')?
    const firstNames: Array<string> = []
    for (const contact of contactsByName.get(name) ?? []) {
      const firstName = contact.firstName
      if (firstName === '' || firstNames.includes(firstName)) continue
      const first = escapeRegExp(firstName)
      const isBefore = new RegExp(`(?<![\\p{L}\\p{N}])${first}\\s+$`, 'u').test(before)
      const isAfter = new RegExp(`^,\\s*${first}(?![\\p{L}\\p{N}])`, 'u').test(after)
      if (isBefore || isAfter) firstNames.push(firstName)
    }
    // Is there a phone link already? (It may come after the first name in 'Müller, Anna'.)
    const linked = /^(?:,\s*[\p{L}\p{N}.-]+(?:\s+[\p{L}\p{N}.-]+)?)?\s*\[[^\]]*\]\(tel:/u.test(after)
    occurrences.push({ name, start, end, linked, firstNames })
  }
  return occurrences
}

/**
 * Get all the numbers to choose from for an occurrence of a last name.
 * If a first name was found next to it, only the contacts with that first name count.
 * @param {Occurrence} occurrence
 * @param {Map<string, Array<Contact>>} contactsByName
 * @returns {Array<PhoneChoice>}
 */
export function getPhoneChoices(occurrence: Occurrence, contactsByName: Map<string, Array<Contact>>): Array<PhoneChoice> {
  const all = contactsByName.get(occurrence.name) ?? []
  const narrowed = occurrence.firstNames.length > 0 ? all.filter((c) => occurrence.firstNames.includes(c.firstName)) : all
  const choices: Array<PhoneChoice> = []
  for (const contact of narrowed) {
    for (const phone of contact.phones) {
      // the same number can be in the address book more than once
      if (!choices.some((c) => makeTelURL(c.phone.number) === makeTelURL(phone.number))) {
        choices.push({ contact, phone })
      }
    }
  }
  return choices
}

/**
 * Make a 'tel:' URL from a phone number as written in the address book.
 * Keeps only the digits, a leading '+', and '*' / '#'.
 * @param {string} number
 * @returns {string}
 */
export function makeTelURL(number: string): string {
  const trimmed = number.trim()
  const digits = trimmed.replace(/[^\d*#]/g, '')
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`
}

/**
 * Make the clickable Markdown link for a phone number.
 * @param {string} number as written in the address book
 * @param {string} prefix to show before the number, e.g. '📞 '
 * @returns {string}
 */
export function makePhoneLink(number: string, prefix: string = ''): string {
  // square brackets would break the link text
  const shown = number.trim().replace(/[[\]]/g, '')
  return `[${prefix}${shown}](${makeTelURL(number)})`
}

/**
 * Make the label that describes a number in the list the user chooses from.
 * @param {PhoneChoice} choice
 * @returns {string}
 */
export function makeChoiceLabel(choice: PhoneChoice): string {
  const { contact, phone } = choice
  const fullName = [contact.firstName, contact.lastName].filter((n) => n !== '').join(' ')
  return `${fullName} · ${phone.label !== '' ? `${phone.label}: ` : ''}${phone.number}`
}

/**
 * Insert pieces of text into a line.
 * @param {string} text
 * @param {Array<{ position: number, insert: string }>} insertions in any order
 * @returns {string}
 */
export function applyInsertions(text: string, insertions: Array<{ position: number, insert: string }>): string {
  let out = text
  // from right to left, so that the positions stay valid
  for (const { position, insert } of [...insertions].sort((a, b) => b.position - a.position)) {
    out = `${out.slice(0, position)}${insert}${out.slice(position)}`
  }
  return out
}
