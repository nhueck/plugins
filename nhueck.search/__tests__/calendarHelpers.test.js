/* global describe, expect, test */
// @flow
import { compareByCalendarOrder, getCalendarSortKey, getGermanCalendarLink, getGermanCalendarTitle, parseCalendarFilename } from '../src/calendarHelpers'

describe('calendarHelpers.js tests', () => {
  describe('getGermanCalendarTitle()', () => {
    const today = new Date(2026, 10, 19, 23, 30) // local time, late in the evening
    test('day', () => expect(getGermanCalendarTitle('20261116.md', today)).toEqual('Montag, 16.11.2026'))
    test('day (.txt)', () => expect(getGermanCalendarTitle('20260301.txt', today)).toEqual('Sonntag, 01.03.2026'))
    test('yesterday', () => expect(getGermanCalendarTitle('20261118.md', today)).toEqual('Gestern, 18.11.2026'))
    test('today', () => expect(getGermanCalendarTitle('20261119.md', today)).toEqual('Heute, 19.11.2026'))
    test('tomorrow', () => expect(getGermanCalendarTitle('20261120.md', today)).toEqual('Morgen, 20.11.2026'))
    test('day before yesterday', () => expect(getGermanCalendarTitle('20261117.md', today)).toEqual('Dienstag, 17.11.2026'))
    test('day after tomorrow', () => expect(getGermanCalendarTitle('20261121.md', today)).toEqual('Samstag, 21.11.2026'))
    test('tomorrow across year boundary', () => expect(getGermanCalendarTitle('20270101.md', new Date(2026, 11, 31, 0, 5))).toEqual('Morgen, 01.01.2027'))
    test('week', () => expect(getGermanCalendarTitle('2026-W47.md')).toEqual('Woche vom 16.11.2026 bis 22.11.2026'))
    test('week across year boundary', () => expect(getGermanCalendarTitle('2026-W01.md')).toEqual('Woche vom 29.12.2025 bis 04.01.2026'))
    test('week 53', () => expect(getGermanCalendarTitle('2026-W53.md')).toEqual('Woche vom 28.12.2026 bis 03.01.2027'))
    test('month', () => expect(getGermanCalendarTitle('2026-11.md')).toEqual('November 2026'))
    test('quarter', () => expect(getGermanCalendarTitle('2026-Q4.md')).toEqual('4. Quartal 2026'))
    test('year', () => expect(getGermanCalendarTitle('2026.md')).toEqual('2026'))
    test('regular note', () => expect(getGermanCalendarTitle('Projects/2026-11.md')).toBeNull())
    test('invalid date', () => expect(getGermanCalendarTitle('20261341.md')).toBeNull())
  })

  describe('getGermanCalendarLink()', () => {
    test('day keeps link to note', () =>
      expect(getGermanCalendarLink('20261116.md', new Date(2026, 10, 19))).toEqual('[[20261116|Montag, 16.11.2026]]'))
    test('today', () => expect(getGermanCalendarLink('20261119.md', new Date(2026, 10, 19))).toEqual('[[20261119|Heute, 19.11.2026]]'))
    test('week', () => expect(getGermanCalendarLink('2026-W47.md')).toEqual('[[2026-W47|Woche vom 16.11.2026 bis 22.11.2026]]'))
    test('regular note', () => expect(getGermanCalendarLink('Projects/Foo.md')).toBeNull())
  })

  describe('parseCalendarFilename()', () => {
    test('teamspace day note', () => {
      const info = parseCalendarFilename('%%NotePlan%%/abc-123/20261116.md')
      expect(info?.type).toEqual('day')
      expect(info?.isTeamspace).toEqual(true)
    })
  })

  describe('calendar sort order', () => {
    test('days, then week, then month, then quarter, then year, then regular notes', () => {
      const expected = [
        '20261026.md', // Mon of W44
        '20261101.md', // Sun of W44 -> stays with its week (counted to October)
        '2026-W44.md',
        '2026-10.md',
        '20261102.md',
        '2026-W45.md',
        '20261116.md',
        '20261118.md',
        '2026-W47.md',
        '20261123.md',
        '2026-W48.md',
        '2026-11.md',
        '20261130.md', // Mon of W49, whose Thursday is in December
        '2026-W49.md',
        '2026-12.md',
        '2026-Q4.md',
        '2026.md',
        '20270104.md',
        'Projects/Alpha.md',
      ]
      const shuffled = [...expected].reverse()
      shuffled.push(shuffled.splice(3, 1)[0])
      const result = shuffled.map((f) => ({ noteFilename: f, index: 0 })).sort(compareByCalendarOrder).map((r) => r.noteFilename)
      expect(result).toEqual(expected)
    })
    test('same note: by line index', () => {
      const result = [{ noteFilename: '20261116.md', index: 7 }, { noteFilename: '20261116.md', index: 2 }].sort(compareByCalendarOrder)
      expect(result.map((r) => r.index)).toEqual([2, 7])
    })
    test('keys are never numeric strings', () => {
      expect(isNaN(getCalendarSortKey('20261116.md'))).toEqual(true)
    })
  })
})
