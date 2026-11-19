/* global describe, expect, test */
import { ensureRefreshTrigger, getTriggersLine, makeCriteriaLine, makeStandLine } from '../src/standHelpers'

const TRIGGER = 'triggers: onOpen => nhueck.search.refreshSavedSearch'

describe('standHelpers', () => {
  test('makeStandLine()', () => {
    expect(makeStandLine(new Date(2026, 10, 19, 9, 37, 42))).toEqual('Stand: 19.11.2026, 9:37 Uhr')
    expect(makeStandLine(new Date(2026, 0, 5, 14, 3))).toEqual('Stand: 05.01.2026, 14:03 Uhr')
  })

  describe('ensureRefreshTrigger()', () => {
    test('adds triggers line', () =>
      expect(ensureRefreshTrigger('---\ntitle: ⭐️ x\nfavorite: true\n---\n## h')).toEqual(`---\ntitle: ⭐️ x\nfavorite: true\n${TRIGGER}\n---\n## h`))
    test('appends to other triggers', () =>
      expect(ensureRefreshTrigger('---\ntitle: x\ntriggers: onEditorWillSave => a.b.c\n---\n')).toEqual(
        '---\ntitle: x\ntriggers: onEditorWillSave => a.b.c, onOpen => nhueck.search.refreshSavedSearch\n---\n',
      ))
    test('already there', () => {
      const content = `---\ntitle: x\n${TRIGGER}\n---\ntext`
      expect(ensureRefreshTrigger(content)).toEqual(content)
    })
    test('replaces the old age trigger', () => {
      expect(ensureRefreshTrigger('---\ntitle: x\ntriggers: onOpen => nhueck.search.updateSavedSearchAge\n---\ntext')).toEqual(`---\ntitle: x\n${TRIGGER}\n---\ntext`)
      expect(ensureRefreshTrigger('---\ntriggers: onOpen => nhueck.search.updateSavedSearchAge, onEditorWillSave => a.b.c\n---')).toEqual(
        '---\ntriggers: onEditorWillSave => a.b.c, onOpen => nhueck.search.refreshSavedSearch\n---',
      )
      expect(ensureRefreshTrigger('---\ntriggers: onEditorWillSave => a.b.c, onOpen => nhueck.search.updateSavedSearchAge\n---')).toEqual(
        '---\ntriggers: onEditorWillSave => a.b.c, onOpen => nhueck.search.refreshSavedSearch\n---',
      )
    })
    test('no frontmatter', () => expect(ensureRefreshTrigger('# Titel\ntext\n---\n')).toEqual('# Titel\ntext\n---\n'))
  })

  describe('makeCriteriaLine()', () => {
    const s = (noteTypes: string, paraTypes: string, fromDateStr: string = '', toDateStr: string = '') => ({ noteTypes, paraTypes, fromDateStr, toDateStr })
    test('terms only', () => expect(makeCriteriaLine("'+# -#privat'")).toEqual('Suche: `+# -#privat`'))
    test('calendar, open', () => expect(makeCriteriaLine("'#bestellung'", s('calendar', 'open'))).toEqual('Suche: `#bestellung` · Kalendernotizen · nur offene Aufgaben'))
    test('all notes, all types', () => expect(makeCriteriaLine("'a b'", s('both', ''))).toEqual('Suche: `a b` · alle Notizen'))
    test('all open types', () =>
      expect(makeCriteriaLine("'x'", s('notes', 'open,scheduled,checklist,checklistScheduled'))).toEqual('Suche: `x` · normale Notizen · nur offene Aufgaben und Checklisten'))
    test('several types', () => expect(makeCriteriaLine("'x'", s('both', 'done, text,foo'))).toEqual('Suche: `x` · alle Notizen · nur erledigte Aufgaben, Text, foo'))
    test('period', () => expect(makeCriteriaLine("'x'", s('calendar', '', '2026-01-01', '2026-03-31'))).toEqual('Suche: `x` · Kalendernotizen · Zeitraum 2026-01-01 bis 2026-03-31'))
  })

  test('getTriggersLine()', () => {
    expect(getTriggersLine(`---\ntitle: x\n${TRIGGER}\n---\ntext`)).toEqual(TRIGGER)
    expect(getTriggersLine('---\ntitle: x\n---\ntriggers: nein')).toEqual('')
    expect(getTriggersLine('# Titel\ntriggers: nein')).toEqual('')
  })
})
