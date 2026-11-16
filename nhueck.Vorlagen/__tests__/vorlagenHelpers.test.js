/* global describe, expect, test */
// @flow
import {
  type CalendarInfo,
  addOnOpenTrigger,
  buildBlocks,
  getHeadings,
  hasDeliveryTag,
  hasEventsTag,
  hasSeenTemplate,
  injectEventParams,
  isRelevantPeriod,
  mergeBlocksIntoTemplate,
  parseCalendarFilename,
  splitFrontmatter,
} from '../src/vorlagenHelpers'

const DAY_TEMPLATE = `## Termine 
(events)
---
## Aufgaben
* 9:00 ⏰ Tagebuch #privat 
* 9:00 ⏰ Medizin #privat 

---
## Lieferungen

---
## Notizen`

const headings = { taskHeading: 'Aufgaben', deliveryHeading: 'Lieferungen' }
const line = (text: string, type: string, indents: number = 0) => ({ text, type, indents })

describe('vorlagenHelpers', () => {
  describe('parseCalendarFilename()', () => {
    test('day', () => expect(parseCalendarFilename('20270813.md')).toEqual({ type: 'day', startISO: '2027-08-13', endYMD: '20270813' }))
    test('week', () => expect(parseCalendarFilename('2026-W47.md')).toEqual({ type: 'week', startISO: '2026-11-16', endYMD: '20261122' }))
    test('month', () => expect(parseCalendarFilename('2026-11.txt')).toEqual({ type: 'month', startISO: '2026-11-01', endYMD: '20261130' }))
    test('quarter and year are not handled', () => {
      expect(parseCalendarFilename('2026-Q4.md')).toBeNull()
      expect(parseCalendarFilename('2026.md')).toBeNull()
    })
    test('regular note', () => expect(parseCalendarFilename('Projekte/20270813.md')).toBeNull())
  })

  describe('isRelevantPeriod()', () => {
    const week: CalendarInfo = { type: 'week', startISO: '2026-11-16', endYMD: '20261122' }
    test('current week counts', () => expect(isRelevantPeriod(week, '20261118', false)).toEqual(true))
    test('past week does not', () => expect(isRelevantPeriod(week, '20261123', false)).toEqual(false))
    test('past week counts if past notes are included', () => expect(isRelevantPeriod(week, '20261123', true)).toEqual(true))
  })

  describe('splitFrontmatter()', () => {
    test('template frontmatter is split off', () => {
      const res = splitFrontmatter('---\ntitle: Vorlage\ntype: empty-note\n---\n## Aufgaben\n---\n## Notizen')
      expect(res.frontmatter).toEqual('---\ntitle: Vorlage\ntype: empty-note\n---\n')
      expect(res.body).toEqual('## Aufgaben\n---\n## Notizen')
    })
    test('no frontmatter', () => expect(splitFrontmatter('* Aufgabe')).toEqual({ frontmatter: '', body: '* Aufgabe' }))
    test('a leading separator is not frontmatter', () => {
      const content = '---\n## Aufgaben\n* eins\n---\n## Notizen'
      expect(splitFrontmatter(content)).toEqual({ frontmatter: '', body: content })
    })
  })

  describe('hasSeenTemplate()', () => {
    const templateHeadings = getHeadings(DAY_TEMPLATE)
    test('headings are found', () => expect(templateHeadings).toEqual(['Termine', 'Aufgaben', 'Lieferungen', 'Notizen']))
    test('note with just a task has not', () => expect(hasSeenTemplate('* Backup Zeitleiste #it  @repeat(58/71)', templateHeadings)).toEqual(false))
    test('note with a template heading has', () => expect(hasSeenTemplate('## Aufgaben\n* eins', templateHeadings)).toEqual(true))
    test('note with only its own heading has not', () => expect(hasSeenTemplate('## Einkauf\n- Brot', templateHeadings)).toEqual(false))
  })

  describe('hasDeliveryTag()', () => {
    test('plain tag', () => expect(hasDeliveryTag('* Mantel #bestellung', '#bestellung')).toEqual(true))
    test('sub-tag', () => expect(hasDeliveryTag('* Tee #bestellung/amazon  ^9fcfub', '#bestellung')).toEqual(true))
    test('longer tag does not count', () => expect(hasDeliveryTag('* Liste #bestellungen', '#bestellung')).toEqual(false))
    test('no tag', () => expect(hasDeliveryTag('* Backup #it', '#bestellung')).toEqual(false))
  })

  describe('buildBlocks()', () => {
    test('children stay with their parent; empty lines are dropped', () => {
      const blocks = buildBlocks(
        [
          line('* Vodafone kündigen', 'open'),
          line('\t- Vertrag bis 10.1.', 'list', 1),
          line('', 'empty'),
          line('* Tee #bestellung/amazon', 'open'),
          line('Aufstehen: 07:44 Uhr', 'text'),
          line('- [x] Checkliste', 'checklistDone'),
        ],
        '#bestellung',
      )
      expect(blocks).toEqual([
        { kind: 'task', lines: ['* Vodafone kündigen', '\t- Vertrag bis 10.1.'] },
        { kind: 'delivery', lines: ['* Tee #bestellung/amazon'] },
        { kind: 'other', lines: ['Aufstehen: 07:44 Uhr'] },
        { kind: 'task', lines: ['- [x] Checkliste'] },
      ])
    })
  })

  describe('mergeBlocksIntoTemplate()', () => {
    test('task goes to the end of Aufgaben', () => {
      const result = mergeBlocksIntoTemplate(DAY_TEMPLATE, [{ kind: 'task', lines: ['* Backup Zeitleiste #it  @repeat(58/71)'] }], headings)
      expect(result).toEqual(`## Termine 
(events)
---
## Aufgaben
* 9:00 ⏰ Tagebuch #privat 
* 9:00 ⏰ Medizin #privat 
* Backup Zeitleiste #it  @repeat(58/71)

---
## Lieferungen

---
## Notizen`)
    })
    test('delivery, task and other text each go to their place', () => {
      const result = mergeBlocksIntoTemplate(
        DAY_TEMPLATE,
        [
          { kind: 'other', lines: ['Notiz ohne Aufgabe'] },
          { kind: 'delivery', lines: ['* Tee #bestellung/amazon'] },
          { kind: 'task', lines: ['* Anrufen', '\t- wegen Termin'] },
          { kind: 'delivery', lines: ['* Mantel #bestellung'] },
        ],
        headings,
      )
      expect(result).toEqual(`## Termine 
(events)
---
## Aufgaben
* 9:00 ⏰ Tagebuch #privat 
* 9:00 ⏰ Medizin #privat 
* Anrufen
\t- wegen Termin

---
## Lieferungen
* Tee #bestellung/amazon
* Mantel #bestellung

---
## Notizen
Notiz ohne Aufgabe`)
    })
    test('without the section heading everything goes to the bottom', () => {
      const result = mergeBlocksIntoTemplate('## Notizen\n', [{ kind: 'task', lines: ['* Anrufen'] }, { kind: 'delivery', lines: ['* Tee #bestellung'] }], headings)
      expect(result).toEqual('## Notizen\n* Anrufen\n* Tee #bestellung')
    })
  })

  describe('addOnOpenTrigger()', () => {
    const cmd = 'nhueck.GroupTasks.refreshEvents'
    test('creates the frontmatter block', () => expect(addOnOpenTrigger('', cmd)).toEqual(`---\ntriggers: onOpen => ${cmd}\n---\n`))
    test('adds a triggers line to existing frontmatter', () => {
      expect(addOnOpenTrigger('---\ntitle: x\n---\n', cmd)).toEqual(`---\ntitle: x\ntriggers: onOpen => ${cmd}\n---\n`)
    })
    test('appends to an existing triggers line', () => {
      expect(addOnOpenTrigger('---\ntriggers: onEditorWillSave => a.b.c\n---\n', cmd)).toEqual(`---\ntriggers: onEditorWillSave => a.b.c, onOpen => ${cmd}\n---\n`)
    })
    test('does not add it twice', () => {
      const fm = `---\ntriggers: onOpen => ${cmd}\n---\n`
      expect(addOnOpenTrigger(fm, cmd)).toEqual(fm)
    })
    test('empty command changes nothing', () => expect(addOnOpenTrigger('', '  ')).toEqual(''))
  })

  describe('hasEventsTag()', () => {
    test('day template', () => expect(hasEventsTag('## Termine\n<%- events({ format:"x" }) %>')).toEqual(true))
    test('static template', () => expect(hasEventsTag('## Aufgaben\n---\n## Lieferungen')).toEqual(false))
  })

  describe('injectEventParams()', () => {
    test('adds to existing parameters', () => {
      expect(injectEventParams('<%- events({ format:"x", includeHeadings:false}) %>', '2027-08-13', 1)).toEqual(
        '<%- events({ startDay:"2027-08-13", daysToCover:1,  format:"x", includeHeadings:false}) %>',
      )
    })
    test('adds to an empty call', () => expect(injectEventParams('<%- events() %>', '2026-11-16', 7)).toEqual('<%- events({ startDay:"2026-11-16", daysToCover:7 }) %>'))
    test('leaves other text alone', () => expect(injectEventParams('## Aufgaben', '2026-11-16', 1)).toEqual('## Aufgaben'))
  })
})
