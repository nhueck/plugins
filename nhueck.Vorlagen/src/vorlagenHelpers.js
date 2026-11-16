// @flow
//-----------------------------------------------------------------------------
// Pure helper functions for the Vorlagen plugin (no NotePlan API calls), so they can be tested in jest.
//-----------------------------------------------------------------------------

export type PeriodType = 'day' | 'week' | 'month'

export type CalendarInfo = {
  type: PeriodType,
  startISO: string, // first day of the period, 'YYYY-MM-DD'
  endYMD: string, // last day of the period, 'YYYYMMDD'
}

export type SimpleLine = {
  text: string, // the full raw line, including any indentation
  type: string, // NotePlan paragraph type ('open', 'list', 'text', 'empty', ...)
  indents: number,
}

export type BlockKind = 'task' | 'delivery' | 'other'

export type Block = {
  kind: BlockKind,
  lines: Array<string>,
}

const TEAMSPACE_PREFIX = '%%NotePlan%%/'
const MS_PER_DAY = 86400000
const TASK_TYPES = ['open', 'done', 'scheduled', 'cancelled', 'checklist', 'checklistDone', 'checklistScheduled', 'checklistCancelled']

const pad2 = (n: number): string => String(n).padStart(2, '0')
const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d))
const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
const iso = (d: Date): string => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Work out whether a filename is a day, week (ISO 8601) or month calendar note.
 * @param {string} filename e.g. '20270813.md', '2026-W47.md', '2026-11.md'
 * @returns {?CalendarInfo} null for anything else (regular notes, quarter and year notes)
 */
export function parseCalendarFilename(filename: string): ?CalendarInfo {
  let name = filename
  if (name.startsWith(TEAMSPACE_PREFIX)) {
    name = name.slice(TEAMSPACE_PREFIX.length).replace(/^[^/]+\//, '')
  }
  if (name.includes('/')) return null
  const base = name.replace(/\.(md|txt)$/, '')

  let m = base.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const date = utc(Number(m[1]), Number(m[2]), Number(m[3]))
    if (ymd(date) !== base) return null
    return { type: 'day', startISO: iso(date), endYMD: base }
  }
  m = base.match(/^(\d{4})-W(\d{2})$/)
  if (m) {
    const week = Number(m[2])
    if (week < 1 || week > 53) return null
    const jan4 = utc(Number(m[1]), 1, 4) // 4 January is always in ISO week 1
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * MS_PER_DAY + (week - 1) * 7 * MS_PER_DAY)
    return { type: 'week', startISO: iso(monday), endYMD: ymd(new Date(monday.getTime() + 6 * MS_PER_DAY)) }
  }
  m = base.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    const month = Number(m[2])
    if (month < 1 || month > 12) return null
    return { type: 'month', startISO: iso(utc(Number(m[1]), month, 1)), endYMD: ymd(utc(Number(m[1]), month + 1, 0)) }
  }
  return null
}

/**
 * Split off a frontmatter block ('---' ... '---') at the very top of a note or template.
 * Only counts as frontmatter if every line inside looks like 'key: value' (or is blank), so that a note
 * which merely starts with a '---' separator isn't misread.
 * @param {string} content
 * @returns {{ frontmatter: string, body: string }} frontmatter includes both '---' lines and a trailing newline, or is ''
 */
export function splitFrontmatter(content: string): { frontmatter: string, body: string } {
  const lines = content.split('\n')
  if (lines.length < 2 || lines[0].trim() !== '---') return { frontmatter: '', body: content }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '---') {
      if (i === 1) break // empty block: treat as separators, not frontmatter
      return { frontmatter: `${lines.slice(0, i + 1).join('\n')}\n`, body: lines.slice(i + 1).join('\n') }
    }
    if (line !== '' && !/^[\w.-]+\s*:/.test(line) && !/^\s*-\s/.test(lines[i])) break
  }
  return { frontmatter: '', body: content }
}

/** The text of a markdown heading line ('## Aufgaben ' -> 'Aufgaben'), or null if the line isn't a heading. */
function headingText(line: string): ?string {
  const m = line.match(/^#{1,6}\s+(.*)$/)
  return m ? m[1].trim() : null
}

/**
 * All heading texts in a piece of markdown.
 * @param {string} body
 * @returns {Array<string>}
 */
export function getHeadings(body: string): Array<string> {
  const headings = []
  for (const line of body.split('\n')) {
    const text = headingText(line)
    if (text != null && text !== '') headings.push(text)
  }
  return headings
}

/**
 * Has this note 'already seen' the template? True if it contains at least one of the template's headings.
 * @param {string} noteBody
 * @param {Array<string>} templateHeadings
 * @returns {boolean}
 */
export function hasSeenTemplate(noteBody: string, templateHeadings: Array<string>): boolean {
  const wanted = templateHeadings.map((h) => h.toLowerCase())
  return getHeadings(noteBody).some((h) => wanted.includes(h.toLowerCase()))
}

/**
 * Is this line tagged as a delivery? Matches the tag itself and its sub-tags (#bestellung, #bestellung/amazon),
 * but not longer tags that merely start the same (#bestellungen).
 */
export function hasDeliveryTag(line: string, deliveryTag: string): boolean {
  const tag = deliveryTag.trim()
  if (tag === '') return false
  return new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=$|[\\s/.,;:!?)])`, 'i').test(line)
}

/**
 * Group the lines of a note into blocks (a top-level line plus the indented lines under it), dropping empty lines,
 * and say where each block belongs.
 * @param {Array<SimpleLine>} lines
 * @param {string} deliveryTag
 * @returns {Array<Block>}
 */
export function buildBlocks(lines: Array<SimpleLine>, deliveryTag: string): Array<Block> {
  const blocks: Array<Block> = []
  for (const line of lines) {
    if (line.type === 'empty' || line.text.trim() === '') continue
    const isChild = line.indents > 0 || /^\s/.test(line.text)
    if (isChild && blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line.text)
      continue
    }
    const kind = hasDeliveryTag(line.text, deliveryTag) ? 'delivery' : TASK_TYPES.includes(line.type) ? 'task' : 'other'
    blocks.push({ kind, lines: [line.text] })
  }
  return blocks
}

/**
 * Insert lines at the end of the section under the given heading. The section ends at the next heading or '---'
 * separator; blank lines at its end stay after the inserted lines.
 * @returns {boolean} false if the heading wasn't found (nothing inserted)
 */
function insertAtEndOfSection(out: Array<string>, heading: string, newLines: Array<string>): boolean {
  const wanted = heading.trim().toLowerCase()
  const headingIndex = out.findIndex((l) => (headingText(l) ?? '').toLowerCase() === wanted && wanted !== '')
  if (headingIndex < 0) return false
  let end = headingIndex + 1
  while (end < out.length && headingText(out[end]) == null && !/^\s*(---+|\*\*\*+|___+)\s*$/.test(out[end])) end++
  while (end > headingIndex + 1 && out[end - 1].trim() === '') end--
  out.splice(end, 0, ...newLines)
  return true
}

/**
 * Put the blocks of the old note content into the (already rendered) template:
 * tasks at the end of the task section, deliveries at the end of the delivery section, everything else at the bottom.
 * If a section heading is missing from the template, those blocks go to the bottom as well.
 * @param {string} templateBody
 * @param {Array<Block>} blocks
 * @param {{ taskHeading: string, deliveryHeading: string }} headings
 * @returns {string}
 */
export function mergeBlocksIntoTemplate(templateBody: string, blocks: Array<Block>, headings: { +taskHeading: string, +deliveryHeading: string, ... }): string {
  const out = templateBody.replace(/\s+$/, '').split('\n')
  const linesOf = (kind: BlockKind): Array<string> => blocks.filter((b) => b.kind === kind).flatMap((b) => b.lines)
  const atBottom: Array<string> = []

  const tasks = linesOf('task')
  if (tasks.length > 0 && !insertAtEndOfSection(out, headings.taskHeading, tasks)) atBottom.push(...tasks)
  const deliveries = linesOf('delivery')
  if (deliveries.length > 0 && !insertAtEndOfSection(out, headings.deliveryHeading, deliveries)) atBottom.push(...deliveries)
  atBottom.push(...linesOf('other'))

  return [...out, ...atBottom].join('\n')
}

/**
 * Make any events() / listTodaysEvents() style template tag list the events of the note's own period rather than
 * those of whatever note happens to be open: adds startDay and daysToCover to the tag's parameters.
 * @param {string} templateBody
 * @param {string} startISO 'YYYY-MM-DD'
 * @param {number} daysToCover
 * @returns {string}
 */
export function injectEventParams(templateBody: string, startISO: string, daysToCover: number): string {
  const extra = `startDay:"${startISO}", daysToCover:${String(daysToCover)}`
  return templateBody
    .replace(/\bevents\(\s*\{/g, `events({ ${extra}, `)
    .replace(/\bevents\(\s*\)/g, `events({ ${extra} })`)
}

/**
 * Does this template list calendar events (an events() tag)? Such lists go stale, so these notes get an onOpen trigger.
 */
export function hasEventsTag(templateBody: string): boolean {
  return /\bevents\(/.test(templateBody)
}

/**
 * Add an 'onOpen => <command>' trigger to a note's frontmatter, creating the frontmatter block or the 'triggers:' line
 * if needed. Leaves the frontmatter alone if that trigger is already there.
 * @param {string} frontmatter as returned by splitFrontmatter(): '' or the whole block including a trailing newline
 * @param {string} command 'plugin.id.commandName'
 * @returns {string} the new frontmatter block (including a trailing newline)
 */
export function addOnOpenTrigger(frontmatter: string, command: string): string {
  const trigger = `onOpen => ${command.trim()}`
  if (command.trim() === '') return frontmatter
  if (frontmatter === '') return `---\ntriggers: ${trigger}\n---\n`
  const lines = frontmatter.split('\n')
  const triggersIndex = lines.findIndex((l) => /^triggers\s*:/.test(l))
  if (triggersIndex < 0) {
    lines.splice(lines.length - 2, 0, `triggers: ${trigger}`) // i.e. just before the closing '---'
    return lines.join('\n')
  }
  const existing = lines[triggersIndex].replace(/^triggers\s*:/, '').trim()
  const already = existing.split(',').some((t) => t.replace(/\s+/g, '') === trigger.replace(/\s+/g, ''))
  if (!already) lines[triggersIndex] = existing === '' ? `triggers: ${trigger}` : `triggers: ${existing}, ${trigger}`
  return lines.join('\n')
}

/**
 * Should a note for this period be handled? Yes if its period ends today or later (or if past notes are included).
 */
export function isRelevantPeriod(info: CalendarInfo, todayYMD: string, includePast: boolean): boolean {
  return includePast || info.endYMD >= todayYMD
}
