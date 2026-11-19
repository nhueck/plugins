// @flow
//-----------------------------------------------------------------------------
// Helpers for the head of a saved search's results note:
// - the 'Stand: 19.11.2026, 9:37 Uhr' line under the Refresh button
// - the onOpen trigger that runs the search again each time the note is opened.
// All functions are pure (no NotePlan API calls), so they can be tested in jest.
//-----------------------------------------------------------------------------

export const REFRESH_TRIGGER_COMMAND = 'nhueck.search.refreshSavedSearch'
// Trigger of a short-lived earlier version; it is removed from notes that still have it.
const OLD_AGE_TRIGGER_RE = /\s*onOpen\s*=>\s*nhueck\.search\.updateSavedSearchAge\s*,?/g

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Make the line that says when the search results were written, e.g. 'Stand: 19.11.2026, 9:37 Uhr'.
 * @param {Date} stamp when the results were written (local time is shown)
 * @returns {string}
 */
export function makeStandLine(stamp: Date): string {
  const date = `${pad2(stamp.getDate())}.${pad2(stamp.getMonth() + 1)}.${stamp.getFullYear()}`
  return `Stand: ${date}, ${stamp.getHours()}:${pad2(stamp.getMinutes())} Uhr`
}

/**
 * Make sure the frontmatter of a results note has the onOpen trigger that runs the search again when the note is opened.
 * Other triggers are kept. Nothing is changed if the note has no frontmatter or already has the trigger.
 * @param {string} content of the note
 * @returns {string} the (possibly changed) content
 */
export function ensureRefreshTrigger(content: string): string {
  const lines = content.split('\n')
  if (lines[0] !== '---') return content
  const end = lines.indexOf('---', 1)
  if (end < 0) return content
  const trigger = `onOpen => ${REFRESH_TRIGGER_COMMAND}`
  for (let i = 1; i < end; i++) {
    if (!/^triggers:/.test(lines[i])) continue
    const existing = lines[i]
      .replace(/^triggers:/, '')
      .replace(OLD_AGE_TRIGGER_RE, '')
      .trim()
      .replace(/,$/, '')
    lines[i] = existing.includes(REFRESH_TRIGGER_COMMAND) ? `triggers: ${existing}` : `triggers: ${existing !== '' ? `${existing}, ` : ''}${trigger}`
    return lines.join('\n')
  }
  lines.splice(end, 0, `triggers: ${trigger}`)
  return lines.join('\n')
}

/**
 * The 'triggers: ...' line of a note's frontmatter, if it has one.
 * @param {string} content of the note
 * @returns {string} the whole line, or ''
 */
export function getTriggersLine(content: string): string {
  const lines = content.split('\n')
  if (lines[0] !== '---') return ''
  const end = lines.indexOf('---', 1)
  return lines.slice(1, Math.max(end, 1)).find((l) => /^triggers:/.test(l)) ?? ''
}

const NOTE_TYPES_DE: { [string]: string } = { calendar: 'Kalendernotizen', notes: 'normale Notizen', both: 'alle Notizen' }
const PARA_TYPES_DE: { [string]: string } = {
  open: 'offene Aufgaben',
  scheduled: 'geplante Aufgaben',
  done: 'erledigte Aufgaben',
  cancelled: 'abgebrochene Aufgaben',
  checklist: 'offene Checklisten',
  checklistScheduled: 'geplante Checklisten',
  checklistDone: 'erledigte Checklisten',
  checklistCancelled: 'abgebrochene Checklisten',
  title: 'Überschriften',
  list: 'Listenpunkte',
  quote: 'Zitate',
  text: 'Text',
}
const ALL_OPEN_TYPES = ['checklist', 'checklistScheduled', 'open', 'scheduled']

/**
 * Make the line that sums up what a saved search looks for, for results notes that have a title of their own, e.g.
 *   Suche: `+# -#privat` · Kalendernotizen · nur offene Aufgaben
 * The search terms are shown as code, so that NotePlan doesn't treat them as tags or mentions.
 * @param {string} searchTermsRepStr the search terms as shown to the user (may be wrapped in '...')
 * @param {?{ noteTypes: string, paraTypes: string, fromDateStr: string, toDateStr: string, ... }} savedSearch details from the Refresh URL, if there is one
 * @returns {string}
 */
export function makeCriteriaLine(
  searchTermsRepStr: string,
  savedSearch: ?{ +noteTypes: string, +paraTypes: string, +fromDateStr: string, +toDateStr: string, ... } = null,
): string {
  const terms = searchTermsRepStr.replace(/^'(.*)'$/, '$1').replace(/`/g, "'")
  const parts = [`Suche: \`${terms}\``]
  if (savedSearch) {
    parts.push(NOTE_TYPES_DE[savedSearch.noteTypes] ?? NOTE_TYPES_DE.both)
    const paraTypes = savedSearch.paraTypes.split(',').map((t) => t.trim()).filter((t) => t !== '')
    if (paraTypes.length > 0) {
      const isAllOpen = paraTypes.length === ALL_OPEN_TYPES.length && [...paraTypes].sort().join() === ALL_OPEN_TYPES.join()
      parts.push(`nur ${isAllOpen ? 'offene Aufgaben und Checklisten' : paraTypes.map((t) => PARA_TYPES_DE[t] ?? t).join(', ')}`)
    }
    if (savedSearch.fromDateStr !== '' || savedSearch.toDateStr !== '') {
      parts.push(`Zeitraum ${savedSearch.fromDateStr} bis ${savedSearch.toDateStr}`)
    }
  }
  return parts.join(' · ')
}
