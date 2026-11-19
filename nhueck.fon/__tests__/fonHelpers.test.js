/* global describe, expect, test */
// @flow
import {
  findOccurrences,
  formatContactsNote,
  getNameVariants,
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
} from '../src/fonHelpers'

const NOTE = `---
title: Telefonliste
---
Automatisch erzeugt. Nicht von Hand ändern.
- Müller | Anna | Mobil: +49 171 1234567 | Privat: 0821 12345
- Müller | Bernd | Arbeit: (0821) 555-0
- Müller-Schmidt | Carla | Mobil: 0172 999
- Sanitär Huber GmbH |  | Arbeit: 0821 777
- Ohne Nummer | Otto |
- von der Heide | Dora | 0160 111
`

const contacts = parseContactsNote(NOTE)
const byName = groupByLastName(contacts)
const regex = makeNameRegex(Array.from(byName.keys()))
if (!regex) throw new Error('no regex')
const find = (text: string) => findOccurrences(text, regex, byName)

describe('parseContactsNote()', () => {
  test('reads contacts, skipping other lines and contacts without number', () => {
    expect(contacts.length).toEqual(5)
    expect(contacts[0]).toEqual({
      lastName: 'Müller',
      firstName: 'Anna',
      phones: [
        { label: 'Mobil', number: '+49 171 1234567' },
        { label: 'Privat', number: '0821 12345' },
      ],
    })
  })
  test('organisation without first name', () => {
    expect(contacts[3]).toEqual({ lastName: 'Sanitär Huber GmbH', firstName: '', phones: [{ label: 'Arbeit', number: '0821 777' }] })
  })
  test('number without label', () => {
    expect(contacts[4].phones).toEqual([{ label: '', number: '0160 111' }])
  })
})

describe('groupByLastName()', () => {
  test('groups', () => {
    expect(byName.get('Müller')?.length).toEqual(2)
    expect(byName.size).toEqual(4)
  })
  test('ignores names', () => {
    expect(groupByLastName(contacts, [' müller ', '']).has('Müller')).toEqual(false)
  })
})

describe('makeNameRegex()', () => {
  test('no names', () => {
    expect(makeNameRegex([])).toBeNull()
  })
})

describe('findOccurrences()', () => {
  test('whole words only, case-sensitive', () => {
    expect(find('Müllerstraße und müller und Obermüller')).toEqual([])
  })
  test('finds name with position', () => {
    expect(find('Herrn Müller anrufen')).toEqual([{ name: 'Müller', start: 6, end: 12, linked: false, firstNames: [] }])
  })
  test('name at start and end, with punctuation', () => {
    expect(find('Müller: Termin mit Müller.').map((o) => o.start)).toEqual([0, 19])
  })
  test('longer name wins', () => {
    expect(find('Frau Müller-Schmidt kommt').map((o) => o.name)).toEqual(['Müller-Schmidt'])
  })
  test('multi-word names', () => {
    expect(find('Rechnung Sanitär Huber GmbH, Frau von der Heide').map((o) => o.name)).toEqual(['Sanitär Huber GmbH', 'von der Heide'])
  })
  test('first name before or after', () => {
    expect(find('mit Anna Müller reden')[0].firstNames).toEqual(['Anna'])
    expect(find('Müller, Bernd')[0].firstNames).toEqual(['Bernd'])
    expect(find('Susanna Müller')[0].firstNames).toEqual([])
  })
  test('already linked', () => {
    expect(find('Müller [📞 0821 12345](tel:082112345) anrufen')[0].linked).toEqual(true)
    expect(find('Müller, Anna [0821 12345](tel:082112345)')[0].linked).toEqual(true)
    expect(find('Müller [Seite](https://example.com)')[0].linked).toEqual(false)
  })
  test('not inside links, URLs, code, tags and mentions', () => {
    expect(find('[[Projekt Müller]] [Müller](https://x.de/Müller) `Müller` https://x.de/Müller #kunde/Müller @Müller')).toEqual([])
  })
})

describe('getPhoneChoices()', () => {
  test('all numbers of all contacts with that name', () => {
    expect(getPhoneChoices(find('Müller')[0], byName).map(makeChoiceLabel)).toEqual([
      'Anna Müller · Mobil: +49 171 1234567',
      'Anna Müller · Privat: 0821 12345',
      'Bernd Müller · Arbeit: (0821) 555-0',
    ])
  })
  test('narrowed by first name', () => {
    expect(getPhoneChoices(find('Bernd Müller')[0], byName).map(makeChoiceLabel)).toEqual(['Bernd Müller · Arbeit: (0821) 555-0'])
  })
  test('same number only once', () => {
    const dup = groupByLastName(parseContactsNote('- Maier | Eva | Mobil: 0171 1 | iPhone: 01711\n- Maier | Fritz | Privat: 0171-1'))
    expect(getPhoneChoices({ name: 'Maier', start: 0, end: 5, linked: false, firstNames: [] }, dup).length).toEqual(1)
  })
  test('label without first name or label', () => {
    expect(getPhoneChoices(find('von der Heide')[0], byName).map(makeChoiceLabel)).toEqual(['Dora von der Heide · 0160 111'])
    expect(getPhoneChoices(find('Sanitär Huber GmbH')[0], byName).map(makeChoiceLabel)).toEqual(['Sanitär Huber GmbH · Arbeit: 0821 777'])
  })
})

describe('makeTelURL() and makePhoneLink()', () => {
  test('tel URL', () => {
    expect(makeTelURL('+49 (171) 123-45 67')).toEqual('tel:+491711234567')
    expect(makeTelURL(' 0821 / 12345 ')).toEqual('tel:082112345')
  })
  test('link', () => {
    expect(makePhoneLink('+49 171 1234567', '📞 ')).toEqual('[📞 +49 171 1234567](tel:+491711234567)')
    expect(makePhoneLink('0821 [1]')).toEqual('[0821 1](tel:08211)')
  })
})

describe('phone lines', () => {
  const link = makePhoneLink('+49 171 1234567', '📞 ')
  test('makePhoneLine()', () => {
    expect(makePhoneLine(link, 1)).toEqual('\t[📞 +49 171 1234567](tel:+491711234567)')
    expect(makePhoneLine(link, 0)).toEqual('[📞 +49 171 1234567](tel:+491711234567)')
    expect(makePhoneLine(link, 2, 'Müller')).toEqual('\t\tMüller: [📞 +49 171 1234567](tel:+491711234567)')
  })
  test('isPhoneLine()', () => {
    expect(isPhoneLine(makePhoneLine(link, 1))).toEqual(true)
    expect(isPhoneLine(makePhoneLine(link, 0, 'von der Heide'))).toEqual(true)
    expect(isPhoneLine('Müller [📞 0821 1](tel:08211) anrufen')).toEqual(false)
    expect(isPhoneLine('[Seite](https://example.com)')).toEqual(false)
    expect(isPhoneLine('Herrn Müller anrufen')).toEqual(false)
  })
  test('getTelURLs()', () => {
    expect(getTelURLs(makePhoneLine(link, 1, 'Müller'))).toEqual(['tel:+491711234567'])
    expect(getTelURLs('[a](tel:1) und [b](https://x.de) und [c](tel:+2)')).toEqual(['tel:1', 'tel:+2'])
    expect(getTelURLs('nichts')).toEqual([])
  })
})

describe('parseShortcutExport() and formatContactsNote()', () => {
  const EXPORT = `###
N: Müller
V: Anna
F: 
T (Mobil): +49 171 1234567
T (Privat): 0821 12345
T (iPhone): +491711234567
###
N: 
V: 
F: Sanitär Huber | GmbH
T (): 0821 777
###
N: Ohne
V: Nummer
F: 

###
N: Abel
V: Zoe
F: Firma
T: 0160 1
0160 2
###
`
  const imported = parseShortcutExport(EXPORT)
  test('reads contacts, sorted, with labels and without duplicate numbers', () => {
    expect(imported).toEqual([
      {
        lastName: 'Abel',
        firstName: 'Zoe',
        phones: [
          { label: '', number: '0160 1' },
          { label: '', number: '0160 2' },
        ],
      },
      {
        lastName: 'Müller',
        firstName: 'Anna',
        phones: [
          { label: 'Mobil', number: '+49 171 1234567' },
          { label: 'Privat', number: '0821 12345' },
        ],
      },
      { lastName: 'Sanitär Huber GmbH', firstName: '', phones: [{ label: '', number: '0821 777' }] },
    ])
  })
  test('other text gives no contacts', () => {
    expect(parseShortcutExport('irgendein Text\nT: ohne Ziffern')).toEqual([])
    expect(parseShortcutExport('')).toEqual([])
  })
  test('note content can be read back', () => {
    const content = formatContactsNote(imported, 'Telefonliste', '17.11.2026')
    expect(content.startsWith('---\ntitle: Telefonliste\n---\n3 Kontakte')).toEqual(true)
    expect(content.split('\n')[5]).toEqual('- Müller | Anna | Mobil: +49 171 1234567 | Privat: 0821 12345')
    expect(parseContactsNote(content)).toEqual(imported)
  })
})

describe('name variants', () => {
  test('getNameVariants()', () => {
    expect(getNameVariants('Müller')).toEqual(['Müller'])
    expect(getNameVariants('Müller (Glück)')).toEqual(['Müller (Glück)', 'Müller'])
    expect(getNameVariants('Moser/Wiens')).toEqual(['Moser/Wiens', 'Moser', 'Wiens'])
  })
  test('contacts are found under their variants', () => {
    const variants = groupByLastName(
      parseShortcutExport('###\nN: Müller (Glück)\nV: Martin\nF: \nT (Privat): 0159 1\n###\nN: Müller\nV: Frieder\nF: \nT (Arbeit): 0170 2\n###\nN: Moser/Wiens\nV: Edith\nF: \nT (Privat): 089 3\n###'),
    )
    const variantRegex = makeNameRegex(Array.from(variants.keys()))
    if (!variantRegex) throw new Error('no regex')
    const occurrences = findOccurrences('Müller und Frau Wiens', variantRegex, variants)
    expect(occurrences.map((o) => o.name)).toEqual(['Müller', 'Wiens'])
    expect(getPhoneChoices(occurrences[0], variants).map(makeChoiceLabel)).toEqual(['Frieder Müller · Arbeit: 0170 2', 'Martin Müller (Glück) · Privat: 0159 1'])
    expect(getPhoneChoices(occurrences[1], variants).map(makeChoiceLabel)).toEqual(['Edith Moser/Wiens · Privat: 089 3'])
  })
})
