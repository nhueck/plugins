// @flow
//-----------------------------------------------------------------------------
// Helper functions for Review plugin
// @jgclark
// Last updated 23.1.2022 for v0.6.0, @jgclark
//-----------------------------------------------------------------------------

import {
  daysBetween,
  getDateFromString,
  relativeDateFromNumber,
  toISODateString,
} from '../../helpers/dateTime'
import { calcOffsetDate } from '../../helpers/NPdateTime'
import { getFolderFromFilename } from '../../helpers/folders'
import { findNotesMatchingHashtags } from '../../helpers/note'
import {
  getContentFromBrackets,
  getStringFromList,
} from '../../helpers/general'
import { getOrMakeMetadataLine } from '../../helpers/paragraph'
import { showMessage } from '../../helpers/userInput'


/**
 * Calculate the next date to review, based on last review date and date interval.
 * If no last review date, then the answer is today's date.
 * @author @jgclark
 * @param {Date} lastReviewDate - JS Date
 * @param {string} interval - interval specified as nn[bdwmqy]
 * @return {Date} - JS Date
 */
export function calcNextReviewDate(lastReviewDate: Date, interval: string): Date {
  const reviewDate: Date =
    lastReviewDate != null
      ? calcOffsetDate(toISODateString(lastReviewDate), interval)
      : new Date() // today's date
  return reviewDate
}

/**
 * From an array of strings, return the first string that matches the
 * wanted parameterised @mention, or empty String.
 * @author @jgclark
 * @param {Array<string>} mentionList - list of strings to search
 * @param {string} mention - string to match (with a following '(' to indicate start of parameter)
 * @return {?Date} - JS Date version, if valid date found
 */
export  function getParamMentionFromList(
  mentionList: $ReadOnlyArray<string>,
  mention: string,
): string {
  // console.log(`getMentionFromList for: ${mention}`)
  const res = mentionList.filter((m) => m.startsWith(`${mention}(`))
  return res.length > 0 ? res[0] : ''
}

//-----------------------------------------------------------------------------

// TODO: make proper settings
const startMentionStr = '@start'
const completedMentionStr = '@completed'
const cancelledMentionStr = '@cancelled'
const dueMentionStr = '@due'
const reviewedMentionStr = '@reviewed'
const pref_SummaryFolder = 'Summaries'
const pref_completedListHeading = 'Completed Projects/Areas'

/**
 * Define 'Project' class to use in GTD.
 * Holds title, last reviewed date, due date, review interval, completion date,
 * number of closed, open & waiting for tasks.
 * To create a note call 'const x = new Project(note)'
 * @author @jgclark
*/
export class Project {
  // Types for the class properties
  note: TNote
  metadataPara: TParagraph
  noteType: string // project, area, other
  title: string
  startDate: ?Date
  dueDate: ?Date
  dueDays: ?number
  reviewedDate: ?Date
  reviewInterval: ?string
  nextReviewDate: ?Date
  nextReviewDays: ?number
  completedDate: ?Date
  cancelledDate: ?Date
  finishedDays: ?number // either days until completed or cancelled
  isCompleted: boolean
  openTasks: number
  completedTasks: number
  waitingTasks: number
  isArchived: boolean
  isActive: boolean
  isCancelled: boolean
  folder: string
  
  constructor(note: TNote) {
    const mentions: $ReadOnlyArray<string> = note.mentions
    const hashtags: $ReadOnlyArray<string> = note.hashtags
    this.note = note
    const mln = getOrMakeMetadataLine(note)
    this.metadataPara = note.paragraphs[mln]
    this.title = note.title ?? '(error)'
    console.log(`\tnew Project: ${this.title} with metadata in line ${this.metadataPara.lineIndex}`)
    this.folder = getFolderFromFilename(note.filename)

    // work out note type (or '')
    this.noteType = (hashtags.includes('#project'))
      ? 'project'
      : (hashtags.includes('#area'))
        ? 'area'
        : ''

    // read in start date (if found)
    let tempDateStr = getParamMentionFromList(mentions, startMentionStr)
    this.startDate = tempDateStr !== '' ? getDateFromString(tempDateStr) : undefined
    // read in due date (if found)
    tempDateStr = getParamMentionFromList(mentions, dueMentionStr)
    this.dueDate = tempDateStr !== '' ? getDateFromString(tempDateStr) : undefined
    // read in reviewed date (if found)
    tempDateStr = getParamMentionFromList(mentions, reviewedMentionStr)
    this.reviewedDate = tempDateStr !== '' ? getDateFromString(tempDateStr) : undefined
    // read in completed date (if found)
    tempDateStr = getParamMentionFromList(mentions, completedMentionStr)
    this.completedDate = tempDateStr !== '' ? getDateFromString(tempDateStr) : undefined
    // read in cancelled date (if found)
    tempDateStr = getParamMentionFromList(mentions, cancelledMentionStr)
    this.cancelledDate = tempDateStr !== '' ? getDateFromString(tempDateStr) : undefined
    // read in review interval (if found)
    this.reviewInterval = getContentFromBrackets(getParamMentionFromList(mentions, "@review")) ?? undefined
    // calculate the durations from these dates
    this.calcDurations()

    // count tasks
    this.openTasks = note.paragraphs.
      filter((p) => p.type === 'open').
      length
    this.completedTasks = note.paragraphs.
      filter((p) => p.type === 'done').
      length
    this.waitingTasks = note.paragraphs.
      filter((p) => p.type === 'open').
      filter((p) => p.content.match('#waiting')).
      length

    // make completed if @completed_date set
    this.isCompleted = (this.completedDate != null) ? true : false
    // make archived if #archive tag present
    this.isArchived = getStringFromList(hashtags, '#archive') !== ''
    // make cancelled if #cancelled or #someday flag set or @cancelled date set
    this.isCancelled = getStringFromList(hashtags, '#cancelled') !== ''
      || getStringFromList(hashtags, '#someday') !== ''
      || (this.completedDate != null)

    // set note to active if #active is set or a @review date found,
    // and not completed / cancelled.
    this.isActive = (
      (getStringFromList(hashtags, '#active') !== '' || this.reviewInterval != null)
      && !this.isCompleted
      && !this.isCancelled
      && !this.isArchived
    ) ? true : false
    console.log(`\tProject object created OK.`)
    console.log(`\tMetadata = '${this.generateMetadataLine()}'`)
  }

  /**
   * Is this project ready for review?
   * Return true if review is overdue and not archived or completed
   * @return {boolean}
  */
  get isReadyForReview(): boolean {
    // console.log(`isReadyForReview: ${this.title}:  ${this.nextReviewDays} ${this.isActive}`)
    return (this.nextReviewDays != null
      && this.nextReviewDays <= 0
      && this.isActive)
  }

  /**
   * From the metadata read in, calculate due/review/finished durations
  */
  calcDurations(): void {
    console.log(`calcDurations:`)
    const now = new Date()
    this.dueDays = (this.dueDate != null)
      // NB: Written while there was an error in EM's Calendar.unitsBetween() function
      ? daysBetween(now, this.dueDate)
      : undefined
    this.finishedDays = (this.completedDate != null && this.startDate != null)
      ? daysBetween(this.startDate, this.completedDate)
      : (this.cancelledDate != null && this.startDate != null)
        ? daysBetween(this.startDate, this.cancelledDate)
        : undefined
    if (this.reviewInterval != null) {
      if (this.reviewedDate != null) {
        this.nextReviewDate = calcNextReviewDate(this.reviewedDate, this.reviewInterval)
        this.nextReviewDays = daysBetween(now, this.nextReviewDate)
      } else {
        // no next review date, so set at today
        this.nextReviewDate = now
        this.nextReviewDays = 0
      }
    }
  }

  /**
  * Close a Project/Area note by updating the metadata and saving it:
  * - adding @completed(<today's date>) to the current note in the Editor
  * - add '#archive' flag to metadata line
  * @author @jgclark
  */
  completeProject(): boolean {
    // const todayStr = hyphenatedDateString(new Date())
    // const yearStr = todayStr.substring(0, 4)
    // const completedTodayString = `${completedMentionString}(${todayStr})`
    // const metadataLine = getOrMakeMetadataLine(note)

    // update the metadata fields
    this.isArchived = true
    this.isCompleted = true
    this.isCancelled = true
    this.completedDate = new Date()
    this.calcDurations()

    // re-write the note's metadata line
    console.log(`Completing ${this.title} ...`)
    const newMetadataLine = this.generateMetadataLine()
    console.log(`... metadata now '${newMetadataLine}'`)
    this.metadataPara.content = newMetadataLine

    // send update to Editor
    Editor.updateParagraph(this.metadataPara)
    return true
  }

  /**
  * Cancel a Project/Area note by updating the metadata and saving it:
  * - adding @cancelled(<today's date>)
  * - add '#archive' flag to metadata line
  * @author @jgclark
  */
  cancelProject(): boolean {
    // update the metadata fields
    this.isArchived = true
    this.isCompleted = false
    this.isCancelled = true
    this.cancelledDate = new Date()
    this.calcDurations()

    // re-write the note's metadata line
    console.log(`Cancelling ${this.title} ...`)
    const newMetadataLine = this.generateMetadataLine()
    console.log(`... metadata now '${newMetadataLine}'`)
    this.metadataPara.content = newMetadataLine

    // send update to Editor
    Editor.updateParagraph(this.metadataPara)
    return true
  }

  generateMetadataLine(): string {
    let output = ''
    // output = (this.isActive) ? '#active ' : ''
    // output = (this.isCancelled) ? '#cancelled ' : ''
    output = (this.isArchived) ? '#archive ' : ''
    output += (this.noteType === 'project' || this.noteType === 'area') ? `#${this.noteType} ` : ''
    output += (this.startDate) ? `${startMentionStr}(${toISODateString(this.startDate)}) ` : ''
    output += (this.dueDate) ? `${dueMentionStr}(${toISODateString(this.dueDate)}) ` : ''
    output += (this.reviewInterval) ? `@review(${this.reviewInterval}) ` : ''
    output += (this.reviewedDate) ? `${reviewedMentionStr}(${toISODateString(this.reviewedDate)}) ` : ''
    output += (this.completedDate) ? `${completedMentionStr}(${toISODateString(this.completedDate)}) ` : ''
    output += (this.cancelledDate) ? `${cancelledMentionStr}(${toISODateString(this.cancelledDate)}) ` : ''
    return output
  }

  /**
   * Returns CSV line showing days until next review + title
   * @return {string}
  */
  machineSummaryLine(): string {
    const numString = this.nextReviewDays?.toString() ?? ''
    return `${numString}\t${this.title}`
  }

  /**
   * return title of note as folder name + internal link, 
   * also showing complete or cancelled where relevant
   * @param {boolean} includeFolderName whether to include folder name at the start of the entry.
   * @return {string} - title as wikilink
  */
  decoratedProjectTitle(includeFolderName: boolean): string {
    let folderNamePart = (includeFolderName) ? (this.folder+'/') : ''
    if (this.isCompleted) {
      return `[x] ${folderNamePart}[[${this.title ?? ''}]]`
    } else if (this.isCancelled) {
      return `[-] ${folderNamePart}[[${this.title ?? ''}]]`
    } else {
      return `${folderNamePart}[[${this.title ?? ''}]]`
    }
  }

  /**
   * Returns line showing more detailed summary of the project, for output to a note.
   * TODO: when tables are supported, make this write a table row.
   * @param {boolean} includeFolderName at the start of the entry
   * @return {string}
  */
  detailedSummaryLine(includeFolderName: boolean): string {
    let output = '- '
    output += `${this.decoratedProjectTitle(includeFolderName)}`
    if (this.completedDate != null) {
      // $FlowIgnore[incompatible-call]
      output += `\t(Completed ${relativeDateFromNumber(this.finishedDays)})`
    }
    else if (this.cancelledDate != null) {
      // $FlowIgnore[incompatible-call]
      output += `\t(Cancelled ${relativeDateFromNumber(this.finishedDays)})`
    }
    output += `\to${this.openTasks} / c${this.completedTasks} / w${this.waitingTasks}`
    if (!this.isCompleted && !this.isCancelled) {
      output = (this.nextReviewDays != null)
        ? ( (this.nextReviewDays > 0)
          ? `${output} / ${relativeDateFromNumber(this.nextReviewDays)}`
          : `${output} / **${relativeDateFromNumber(this.nextReviewDays)}**`) 
        : `${output} / -`
      output = (this.dueDays != null)
        ? `${output} / ${relativeDateFromNumber(this.dueDays)}`
        : `${output} / -`
    }
    return output
  }
}