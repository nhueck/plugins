// @flow
//-----------------------------------------------------------------------------
// Calendar-note helpers for Search Extensions:
// - German display titles for calendar notes (day / week / month / quarter / year)
// - a sort key that orders results as: days of a week, then that week, ...,
//   then (after all its weeks) the month, then the quarter, then the year.
// All functions are pure (no NotePlan API calls), so they can be tested in jest.
//-----------------------------------------------------------------------------

export const CALENDAR_SORT_ORDER = 'calendar date (days, then week, then month)'

export type CalendarPeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type CalendarFilenameInfo = {
  type: CalendarPeriodType,
  noteDateStr: string, // e.g. '20261116', '2026-W47', '2026-11', '2026-Q4', '2026'
  start: Date, // first day of the period (UTC midnight)
  end: Date, // last day of the period (UTC midnight)
  isTeamspace: boolean,
}

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const RELATIVE_DAYS_DE: { [string]: string } = { '-1': 'Gestern', '0': 'Heute', '1': 'Morgen' }
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const TEAMSPACE_PREFIX = '%%NotePlan%%/'
const MS_PER_DAY = 86400000

const pad2 = (n: number): string => String(n).padStart(2, '0')
const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d))
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY)
const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`
const dm = (d: Date): string => `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.`
const dmy = (d: Date): string => `${dm(d)}${d.getUTCFullYear()}`

/** Monday of the given ISO 8601 week. */
function mondayOfISOWeek(year: number, week: number): Date {
  const jan4 = utc(year, 1, 4) // 4 January is always in ISO week 1
  const mondayOfWeek1 = addDays(jan4, -((jan4.getUTCDay() + 6) % 7))
  return addDays(mondayOfWeek1, (week - 1) * 7)
}

/** Monday of the (ISO) week that contains the given date. */
function mondayOfWeekContaining(date: Date): Date {
  return addDays(date, -((date.getUTCDay() + 6) % 7))
}

/**
 * Work out what kind of calendar note a filename refers to, if any.
 * Understands '20261116.md', '2026-W47.md', '2026-11.md', '2026-Q4.md', '2026.md' (also with .txt, and teamspace-prefixed).
 * @param {string} filename
 * @returns {?CalendarFilenameInfo} null if this isn't a calendar note filename
 */
export function parseCalendarFilename(filename: string): ?CalendarFilenameInfo {
  let name = filename
  const isTeamspace = name.startsWith(TEAMSPACE_PREFIX)
  if (isTeamspace) {
    // teamspace calendar notes are stored as '%%NotePlan%%/<teamspace-id>/<calendar filename>'
    name = name.slice(TEAMSPACE_PREFIX.length).replace(/^[^/]+\//, '')
  }
  if (name.includes('/')) return null // regular notes in folders
  const base = name.replace(/\.(md|txt)$/, '')

  let m = base.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) {
    const date = utc(Number(m[1]), Number(m[2]), Number(m[3]))
    if (ymd(date) !== base) return null // not a real date
    return { type: 'day', noteDateStr: base, start: date, end: date, isTeamspace }
  }
  m = base.match(/^(\d{4})-W(\d{2})$/)
  if (m) {
    const week = Number(m[2])
    if (week < 1 || week > 53) return null
    const start = mondayOfISOWeek(Number(m[1]), week)
    return { type: 'week', noteDateStr: base, start, end: addDays(start, 6), isTeamspace }
  }
  m = base.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    const month = Number(m[2])
    if (month < 1 || month > 12) return null
    return { type: 'month', noteDateStr: base, start: utc(Number(m[1]), month, 1), end: utc(Number(m[1]), month + 1, 0), isTeamspace }
  }
  m = base.match(/^(\d{4})-Q([1-4])$/)
  if (m) {
    const q = Number(m[2])
    return { type: 'quarter', noteDateStr: base, start: utc(Number(m[1]), q * 3 - 2, 1), end: utc(Number(m[1]), q * 3 + 1, 0), isTeamspace }
  }
  m = base.match(/^(\d{4})$/)
  if (m) {
    return { type: 'year', noteDateStr: base, start: utc(Number(m[1]), 1, 1), end: utc(Number(m[1]), 12, 31), isTeamspace }
  }
  return null
}

/**
 * German display title for a calendar note filename:
 * - day:     '20261116' -> 'Montag, 16.11.2026'; yesterday, today and tomorrow get
 *            'Gestern, 18.11.2026', 'Heute, 19.11.2026', 'Morgen, 20.11.2026' instead of the weekday
 * - week:    '2026-W47' -> 'Woche vom 16.11.2026 bis 22.11.2026'
 * - month:   '2026-11'  -> 'November 2026'
 * - quarter: '2026-Q4'  -> '4. Quartal 2026'
 * - year:    '2026'     -> '2026'
 * @param {string} filename
 * @param {Date} today the current date (its local calendar day is used); only needed for tests
 * @returns {?string} null if this isn't a calendar note filename
 */
export function getGermanCalendarTitle(filename: string, today: Date = new Date()): ?string {
  const info = parseCalendarFilename(filename)
  if (!info) return null
  const { start, end } = info
  switch (info.type) {
    case 'day': {
      const todayUTC = utc(today.getFullYear(), today.getMonth() + 1, today.getDate())
      const daysFromToday = Math.round((start.getTime() - todayUTC.getTime()) / MS_PER_DAY)
      return `${RELATIVE_DAYS_DE[String(daysFromToday)] ?? WEEKDAYS_DE[start.getUTCDay()]}, ${dmy(start)}`
    }
    case 'week':
      return `Woche vom ${dmy(start)} bis ${dmy(end)}`
    case 'month':
      return `${MONTHS_DE[start.getUTCMonth()]} ${start.getUTCFullYear()}`
    case 'quarter':
      return `${Math.floor(start.getUTCMonth() / 3) + 1}. Quartal ${start.getUTCFullYear()}`
    default:
      return String(start.getUTCFullYear())
  }
}

/**
 * Link that shows the German title but still opens the calendar note itself.
 * @param {string} filename
 * @param {Date} today the current date; only needed for tests
 * @returns {?string} null if this isn't a calendar note filename
 */
export function getGermanCalendarLink(filename: string, today: Date = new Date()): ?string {
  const info = parseCalendarFilename(filename)
  const title = getGermanCalendarTitle(filename, today)
  if (!info || title == null) return null
  if (info.isTeamspace) {
    return `[${title}](noteplan://x-callback-url/openNote?filename=${encodeURIComponent(filename)})`
  }
  // Aliased wiki link: looks and behaves like a normal [[note link]], but shows the German title
  return `[[${info.noteDateStr}|${title}]]`
}

/**
 * Sort key (plain string comparison, ascending) that gives the order:
 * all days of a week -> that week -> (after all weeks of a month) the month -> the quarter -> the year.
 * A week (and with it its days) is counted to the month/quarter/year its Thursday falls in (the ISO 8601 rule),
 * so that the days of a week always stay together directly above their week.
 * Regular notes sort after all calendar notes, by filename.
 * Note: the leading letter also stops sortListBy() from treating the key as a number.
 * @param {string} filename
 * @returns {string}
 */
export function getCalendarSortKey(filename: string): string {
  const info = parseCalendarFilename(filename)
  if (!info) return `z${filename.toLowerCase()}`
  const LAST8 = '99999999'
  const { start } = info
  const year = String(start.getUTCFullYear())
  switch (info.type) {
    case 'day':
    case 'week': {
      const monday = mondayOfWeekContaining(start)
      const thursday = addDays(monday, 3)
      const month = thursday.getUTCMonth() + 1
      const dayPart = info.type === 'day' ? ymd(start) : LAST8
      return `c${thursday.getUTCFullYear()}${Math.ceil(month / 3)}${pad2(month)}${ymd(monday)}${dayPart}`
    }
    case 'month': {
      const month = start.getUTCMonth() + 1
      return `c${year}${Math.ceil(month / 3)}${pad2(month)}${LAST8}${LAST8}`
    }
    case 'quarter':
      return `c${year}${Math.floor(start.getUTCMonth() / 3) + 1}99${LAST8}${LAST8}`
    default:
      return `c${year}999${LAST8}${LAST8}`
  }
}

/**
 * Comparator for things that have a filename and a line index, using getCalendarSortKey().
 */
export function compareByCalendarOrder(a: { noteFilename: string, index: number, ... }, b: { noteFilename: string, index: number, ... }): number {
  const keyA = getCalendarSortKey(a.noteFilename)
  const keyB = getCalendarSortKey(b.noteFilename)
  if (keyA !== keyB) return keyA < keyB ? -1 : 1
  return a.index - b.index
}
