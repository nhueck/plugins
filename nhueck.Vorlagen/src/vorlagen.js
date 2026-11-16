// @flow
//-----------------------------------------------------------------------------
// Vorlagen (nhueck): put the standard template into calendar notes that already have some content
// but haven't 'seen' a template yet, and file the existing lines into the right sections.
//-----------------------------------------------------------------------------

import pluginJson from '../plugin.json'
import {
  type CalendarInfo,
  type PeriodType,
  type SimpleLine,
  addOnOpenTrigger,
  buildBlocks,
  getHeadings,
  hasEventsTag,
  hasSeenTemplate,
  injectEventParams,
  isRelevantPeriod,
  mergeBlocksIntoTemplate,
  parseCalendarFilename,
  splitFrontmatter,
} from './vorlagenHelpers'
import { clo, logDebug, logError, logInfo, logWarn } from '@helpers/dev'
import { showMessage, showMessageYesNo } from '@helpers/userInput'

const TEMPLATE_FOLDER = '@Templates'
const DIALOG_TITLE = 'Vorlagen nachtragen'

type VorlagenConfig = {
  templateDay: string,
  templateWeek: string,
  templateMonth: string,
  taskHeading: string,
  deliveryHeading: string,
  deliveryTag: string,
  includePastNotes: boolean,
  eventsTrigger: string,
}

type TemplateInfo = {
  title: string,
  body: string, // template content without its frontmatter
  headings: Array<string>,
  needsRendering: boolean, // contains template tags
  listsEvents: boolean, // contains an events() tag
}

type Candidate = {
  note: TNote,
  info: CalendarInfo,
  template: TemplateInfo,
}

function getConfig(): VorlagenConfig {
  const s = DataStore.settings ?? {}
  return {
    templateDay: String(s.templateDay ?? '01 Tägliche Notiz mit Terminen (Vorlage)').trim(),
    templateWeek: String(s.templateWeek ?? '02 Wöchentliche Notiz').trim(),
    templateMonth: String(s.templateMonth ?? '03 Monatliche Notiz').trim(),
    taskHeading: String(s.taskHeading ?? 'Aufgaben'),
    deliveryHeading: String(s.deliveryHeading ?? 'Lieferungen'),
    deliveryTag: String(s.deliveryTag ?? '#bestellung'),
    includePastNotes: s.includePastNotes === true,
    eventsTrigger: String(s.eventsTrigger ?? 'nhueck.GroupTasks.refreshEvents').trim(),
  }
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Find a template in @Templates by its title (as shown in NotePlan / given in its frontmatter), or by its filename.
 */
function loadTemplate(title: string): ?TemplateInfo {
  if (title === '') return null
  const wanted = title.toLowerCase()
  const templates = DataStore.projectNotes.filter((n) => n.filename.startsWith(`${TEMPLATE_FOLDER}/`))
  const frontmatterTitle = (n: TNote): string => {
    const m = splitFrontmatter(n.content ?? '').frontmatter.match(/^title:\s*(.*)$/m)
    return m ? m[1].trim().toLowerCase() : ''
  }
  const baseName = (n: TNote): string =>
    n.filename
      .slice(TEMPLATE_FOLDER.length + 1)
      .replace(/\.(md|txt)$/, '')
      .toLowerCase()
  const note =
    templates.find((n) => (n.title ?? '').toLowerCase() === wanted) ?? templates.find((n) => frontmatterTitle(n) === wanted) ?? templates.find((n) => baseName(n) === wanted)
  if (!note) return null
  const body = splitFrontmatter(note.content ?? '').body
  return { title, body, headings: getHeadings(body), needsRendering: body.includes('<%'), listsEvents: hasEventsTag(body) }
}

/** Load the templates for the period types that are switched on. A missing template is reported and skipped. */
function loadTemplates(config: VorlagenConfig): { templates: Map<PeriodType, TemplateInfo>, missing: Array<string> } {
  const templates: Map<PeriodType, TemplateInfo> = new Map()
  const missing: Array<string> = []
  const wanted: Array<[PeriodType, string]> = [
    ['day', config.templateDay],
    ['week', config.templateWeek],
    ['month', config.templateMonth],
  ]
  for (const [type, title] of wanted) {
    if (title === '') continue
    const template = loadTemplate(title)
    if (template) {
      templates.set(type, template)
    } else {
      missing.push(title)
      logWarn(pluginJson, `Vorlage '${title}' nicht in ${TEMPLATE_FOLDER} gefunden`)
    }
  }
  return { templates, missing }
}

/**
 * Does this note need the template? Yes if it is a day/week/month note of a relevant period that has some content
 * but none of the template's headings.
 */
function asCandidate(note: TNote, templates: Map<PeriodType, TemplateInfo>, config: VorlagenConfig, today: string, ignorePeriod: boolean = false): ?Candidate {
  const info = parseCalendarFilename(note.filename)
  if (!info) return null
  const template = templates.get(info.type)
  if (!template) return null
  if (!ignorePeriod && !isRelevantPeriod(info, today, config.includePastNotes)) return null
  const body = splitFrontmatter(note.content ?? '').body
  if (body.trim() === '') return null // empty notes are left alone
  if (hasSeenTemplate(body, template.headings)) return null
  return { note, info, template }
}

/** The lines of the note body (without frontmatter), with NotePlan's own idea of each line's type and indentation. */
function getBodyLines(note: TNote, frontmatterLineCount: number): Array<SimpleLine> {
  const contentLines = (note.content ?? '').split('\n')
  return note.paragraphs
    .filter((p) => p.lineIndex >= frontmatterLineCount)
    .map((p) => ({ text: contentLines[p.lineIndex] ?? p.rawContent, type: p.type, indents: p.indents }))
}

/** Render the template for the given note's period. Returns null if rendering failed. */
async function renderTemplateFor(candidate: Candidate): Promise<?string> {
  const { template, info } = candidate
  if (!template.needsRendering) return template.body
  // Make event lists cover this note's own day/week, not that of the note open in the Editor
  const source = info.type === 'month' ? template.body : injectEventParams(template.body, info.startISO, info.type === 'week' ? 7 : 1)
  const rendered = await DataStore.invokePluginCommandByName('render', 'np.Templating', [source, {}])
  if (typeof rendered !== 'string' || rendered.trim() === '' || rendered.includes('<%')) {
    logError(pluginJson, `Vorlage '${template.title}' ließ sich für ${candidate.note.filename} nicht rendern: ${String(rendered).slice(0, 200)}`)
    return null
  }
  return rendered
}

/** Put the template into one note and file its existing lines. Returns true if the note was changed. */
async function applyTemplate(candidate: Candidate, config: VorlagenConfig): Promise<boolean> {
  const { note } = candidate
  const { frontmatter } = splitFrontmatter(note.content ?? '')
  const frontmatterLineCount = frontmatter === '' ? 0 : frontmatter.split('\n').length - 1
  const blocks = buildBlocks(getBodyLines(note, frontmatterLineCount), config.deliveryTag)

  const rendered = await renderTemplateFor(candidate)
  if (rendered == null) return false

  // Notes whose template lists events get a trigger that refreshes that list whenever the note is opened
  const newFrontmatter = candidate.template.listsEvents ? addOnOpenTrigger(frontmatter, config.eventsTrigger) : frontmatter
  const newContent = newFrontmatter + mergeBlocksIntoTemplate(rendered, blocks, config)
  logDebug(pluginJson, `${note.filename}: ${blocks.length} Block/Blöcke einsortiert (${blocks.map((b) => b.kind).join(', ')})`)
  if (Editor.note && Editor.filename === note.filename) {
    Editor.content = newContent
  } else {
    note.content = newContent
  }
  return true
}

/** Event template tags only work while a daily or weekly calendar note is open in the Editor. */
function editorHasDailyOrWeeklyNote(): boolean {
  if (!Editor.note || Editor.type !== 'Calendar') return false
  const info = parseCalendarFilename(Editor.filename ?? '')
  return info != null && (info.type === 'day' || info.type === 'week')
}

/**
 * Command: go through all day, week and month notes and put the template into those that need it.
 */
export async function vorlagenNachtragen(): Promise<void> {
  try {
    const config = getConfig()
    const { templates, missing } = loadTemplates(config)
    if (templates.size === 0) {
      await showMessage(`Keine der eingestellten Vorlagen wurde in ${TEMPLATE_FOLDER} gefunden. Bitte die Plugin-Einstellungen prüfen.`, 'OK', DIALOG_TITLE)
      return
    }

    const today = todayYMD()
    const candidates: Array<Candidate> = []
    for (const note of DataStore.calendarNotes) {
      const candidate = asCandidate(note, templates, config, today)
      if (candidate) candidates.push(candidate)
    }
    candidates.sort((a, b) => (a.info.endYMD < b.info.endYMD ? -1 : a.info.endYMD > b.info.endYMD ? 1 : 0))
    logInfo(pluginJson, `${candidates.length} Notiz(en) ohne Vorlage gefunden`)

    const missingText = missing.length > 0 ? `\n\nNicht gefunden und daher übersprungen: ${missing.map((m) => `'${m}'`).join(', ')}` : ''
    if (candidates.length === 0) {
      await showMessage(`Keine Notiz gefunden, die Inhalt, aber noch keine Vorlage hat.${missingText}`, 'OK', DIALOG_TITLE)
      return
    }

    const names = candidates.map((c) => c.note.filename.replace(/\.(md|txt)$/, ''))
    const preview = names.length > 12 ? `${names.slice(0, 12).join(', ')} … (und ${names.length - 12} weitere)` : names.join(', ')
    const answer = await showMessageYesNo(`${candidates.length} Notiz(en) bekommen die Vorlage:\n${preview}${missingText}\n\nFortfahren?`, ['Ja', 'Nein'], DIALOG_TITLE)
    if (answer !== 'Ja') return

    // Event tags need a daily/weekly note in the Editor: open today's note if something else is showing
    if (candidates.some((c) => c.template.needsRendering) && !editorHasDailyOrWeeklyNote()) {
      await Editor.openNoteByDate(new Date())
    }

    let changed = 0
    const failed: Array<string> = []
    for (const candidate of candidates) {
      if (await applyTemplate(candidate, config)) {
        changed++
      } else {
        failed.push(candidate.note.filename)
      }
    }
    const failedText = failed.length > 0 ? `\n\nNicht geändert (Vorlage ließ sich nicht rendern): ${failed.join(', ')}` : ''
    await showMessage(`${changed} Notiz(en) haben die Vorlage bekommen.${failedText}`, 'OK', DIALOG_TITLE)
  } catch (error) {
    logError(pluginJson, `vorlagenNachtragen: ${error.message}`)
    clo(error)
  }
}

/**
 * Command: put the template into the calendar note that is open in the Editor (whatever its date).
 */
export async function vorlageInDieseNotiz(): Promise<void> {
  try {
    const note = Editor.note
    if (!note || Editor.type !== 'Calendar') {
      await showMessage('Bitte zuerst eine Tages-, Wochen- oder Monatsnotiz öffnen.', 'OK', DIALOG_TITLE)
      return
    }
    const config = getConfig()
    const { templates } = loadTemplates(config)
    const candidate = asCandidate(note, templates, config, todayYMD(), true)
    if (!candidate) {
      await showMessage('Diese Notiz ist leer, hat die Vorlage schon, oder für ihren Typ ist keine Vorlage eingestellt.', 'OK', DIALOG_TITLE)
      return
    }
    if (candidate.template.needsRendering && !editorHasDailyOrWeeklyNote()) {
      await showMessage('Die Vorlage enthält Termin-Tags; die funktionieren nur in einer Tages- oder Wochennotiz.', 'OK', DIALOG_TITLE)
      return
    }
    if (!(await applyTemplate(candidate, config))) {
      await showMessage('Die Vorlage ließ sich nicht rendern; die Notiz wurde nicht geändert. Details stehen in der Plugin-Konsole.', 'OK', DIALOG_TITLE)
    }
  } catch (error) {
    logError(pluginJson, `vorlageInDieseNotiz: ${error.message}`)
    clo(error)
  }
}
