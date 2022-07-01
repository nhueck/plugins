// @flow

/*
REMEMBER: Always build a flow cancel path every time you offer a prompt
TODO: new search?text=noteplan or search?filter=Upcoming
TODO: add back button to return to previous step (@qualitativeeasing)
TODO: maybe create choosers based on arguments text
*/

import { log, logError, clo, JSP } from '../../helpers/dev'
import { createOpenNoteCallbackUrl, createAddTextCallbackUrl, createCallbackUrl } from '../../helpers/general'
import { chooseRunPluginXCallbackURL } from '@helpers/NPdev'
import pluginJson from '../plugin.json'
import { chooseOption, showMessage, chooseHeading, chooseFolder, chooseNote, getInput } from '@helpers/userInput'
import { showMessageYesNo } from '../../helpers/userInput'

// https://help.noteplan.co/article/49-x-callback-url-scheme#addnote

/**
 * Create a callback URL for openNote or addText (they are very similar)
 * @param {string} command - 'openNote' | 'addText' (default: 'openNote')
 * @returns {string} the URL or false if user canceled
 */
async function getAddTextOrOpenNoteURL(command: 'openNote' | 'addText' = 'openNote'): Promise<string | false> {
  let url = '',
    note,
    addTextParams,
    fields
  const date = await askAboutDate() // returns date or '' or false
  if (date === false) return false
  if (date === '') {
    note = await chooseNote()
    log(pluginJson, `getAddTextOrOpenNoteURL: ${note?.filename || 'no note filename'}`)
    if (command === 'addText' && note) {
      fields = await getAddTextAdditions()
      if (fields === false) {
        url = false
      } else {
        url = createAddTextCallbackUrl(note, fields)
      }
    } else if (command === 'openNote' && note?.filename) {
      url = createOpenNoteCallbackUrl(note?.filename ?? '', 'filename')
    }
  } else {
    if (command === 'addText') {
      fields = await getAddTextAdditions()
      if (fields === false) {
        url = false
      } else {
        url = createAddTextCallbackUrl(date, fields)
      }
    } else if (command === 'openNote') {
      url = createOpenNoteCallbackUrl(date, 'date')
    }
  }
  if (url !== '') {
    return url
  } else {
    return 'An error occurred. Could not get URL. Check plugin console for details.'
  }
}

export async function filter() {
  const filters = DataStore.filters
  if (filters.length) {
    const opts = filters.map((f) => ({ label: f, value: f }))
    opts.push({ label: 'None of these; I need to make a new one', value: '__new__' })
    const chosen = await chooseOption('Choose a filter', opts, opts[0].value)
    if (chosen === '__new__') {
      NotePlan.openURL(`noteplan://x-callback-url/search?filter=__new__`)
      return
    } else {
      return createCallbackUrl('search', { filter: chosen })
    }
  } else {
    showMessage('No filters found. Please add a filter before running this command')
  }
}

export async function search(): Promise<string> {
  const searchText = await getInput('Text to search for', 'Submit', 'Search Text', '')
  if (searchText) {
    return createCallbackUrl('search', { text: searchText })
  } else {
    return ''
  }
}

/**
 * Ask user what type of note to get, and if they want a date, get the date from them
 * @returns {Promise<string>} YYYYMMDD like '20180122' or use 'today', 'yesterday', 'tomorrow' instead of a date; '' if they want to enter a title, or false if date entry failed
 */
async function askAboutDate(): Promise<string | false> {
  let opts = [
    { label: 'Open/use a Calendar/Daily Note', value: 'date' },
    { label: 'Open/use a Project Note (by title)', value: '' },
  ]
  let choice = await chooseOption('What kind of note do you want to use/open?', opts, opts[0].value)
  if (choice === 'date') {
    let opts = [
      { label: 'Enter a specific date', value: 'nameDate' },
      { label: 'today (always current day)', value: 'today' },
      { label: "tomorrow (always tomorrow's date)", value: 'tomorrow' },
      { label: 'yesterday (always yesterday)', value: 'yesterday' },
    ]
    choice = await chooseOption('What date?', opts, opts[0].value)
    if (choice === 'nameDate') {
      choice = await getInput('Enter a date in YYYYMMDD format (no dashes)')
      if (!choice || choice == '' || /^\d{8}$/.test(choice) === false) {
        showMessage(`You entered "${String(choice)}", but that is not in the correct format (YYYYMMDD).`)
        return false
      }
    }
  }
  return choice || ''
}

async function getAddTextAdditions(): Promise<{ text: string, mode: string, openNote: string } | false> {
  let text = await getInput('Enter text to add to the note', 'OK', 'Text to Add', 'PLACEHOLDER')
  log(pluginJson, `getAddTextAdditions: ${text || ''}`)
  if (text === false) return false
  let opts = [
    { label: 'Prepend text to the top of the note', value: 'prepend' },
    { label: 'Append text to the end of the note', value: 'append' },
  ]
  let mode = await chooseOption('How would you like to add the text?', opts, opts[0].value)
  if (mode === false) return false
  let openNote = await chooseOption(
    'Open the note after adding the text?',
    [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    'yes',
  )
  return openNote === false ? false : { text: text ? text : '', mode, openNote }
}

/*
noteTitle optional, will be prepended if it is used
text optional, text will be added to the note
openNote optional, values: yes (opens the note, if not already selected), no
folder optional, define which folder the note should be added to. The folder will be created.
subWindow optional (only Mac), values: yes (opens note in a subwindow) and no
splitView optional (only Mac), values: yes (opens note in a split view) and no. Note: Available from v3.4
useExistingSubWindow optional (only Mac), values: yes (looks for an existing subwindow and opens the note there, instead of opening a new one) and no (default). Note: Available from v3.2
*/
export async function addNote(): Promise<string> {
  const vars = {}
  vars.noteTitle = await getInput(`What's the title?\n(optional - click OK to leave blank)`, `OK`, `Title of Note`, '')
  if (vars.noteTitle === false) return ''
  vars.folder = await chooseFolder(`What folder?`)
  vars.noteText = await getInput(
    `What text for content?\n(optional - click OK to leave blank)`,
    `OK`,
    `Note Content`,
    '',
  )
  if (vars.noteText === false) return ''
  vars.openNote = await showMessageYesNo(`Open note automatically?`, ['yes', 'no'], `Open Note`)
  vars.subWindow = await showMessageYesNo(`Open in Floating Window?`, ['yes', 'no'], `Open in Window`)
  vars.splitView = await showMessageYesNo(`Open in Split View?`, ['yes', 'no'], `Open in Split View`)
  vars.useExistingSubWindow = await showMessageYesNo(
    `Open in Already-opened Floating Window?`,
    ['yes', 'no'],
    `Open in Existing Window`,
  )
  for (const key in vars) {
    if (['openNote', 'subWindow', 'splitView', 'useExistingSubWindow'].indexOf(key) > -1 && vars[key] === 'no') {
      delete vars[key]
    }

    if (['noteTitle', 'folder', 'noteText'].indexOf(key) > -1 && vars[key] === '') {
      delete vars[key]
    }
  }
  let params = ''
  let i = 0
  for (const key in vars) {
    params += `${params.length ? '&' : '?'}${key}=${encodeURIComponent(vars[key])}`
  }
  const xcb = `noteplan://x-callback-url/addText${params}`
  Editor.insertTextAtCursor(xcb)
  console.log(xcb)
}

export async function runShortcut(): Promise<string> {
  const name = await getInput('Enter the name of the shortcut', 'OK', 'Shortcut Name', '')
  if (name && name.length) {
    return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`
  }
  return ''
}

/**
 * Walk user through creation of a xcallback url
 * @param {string} incoming - text coming in from a runPlugin link
 */
export async function xCallbackWizard(incoming: ?string = ''): Promise<void> {
  try {
    let url = '',
      canceled = false

    const options = [
      { label: 'OPEN a note', value: 'openNote' },
      { label: 'NEW NOTE with title and text', value: 'addNote' },
      { label: 'ADD text to a note', value: 'addText' },
      { label: 'FILTER Notes by Preset', value: 'filter' },
      { label: 'SEARCH for text in notes', value: 'search' },
      { label: 'RUN a Plugin Command', value: 'runPlugin' },
      { label: 'RUN a Shortcut', value: 'runShortcut' },
      /*
      { label: 'DELETE a note by title', value: 'deleteNote' },
      { label: 'Select a TAG in the sidebar', value: 'selectTag' },
      { label: 'Get NOTE INFO (x-success) for use in another app', value: 'noteInfo' },
      */
    ]
    const res = await chooseOption(`Select an X-Callback type`, options, '')

    let runplugin
    switch (res) {
      case '':
        log(pluginJson, 'No option selected')
        canceled = true
        break
      case 'openNote':
        url = await getAddTextOrOpenNoteURL('openNote')
        break
      case 'addText':
        url = await getAddTextOrOpenNoteURL('addText')
        break
      case 'filter':
        url = await filter()
        break
      case 'search':
        url = await search()
        break
      case 'runShortcut':
        url = await runShortcut()
        break
      case 'addNote':
        url = await addNote()
        break
      case 'runPlugin':
        runplugin = await chooseRunPluginXCallbackURL()
        if (runplugin) {
          url = runplugin.url
        }
        break
      default:
        showMessage(`${res}: This type is not yet available in this plugin`, 'OK', 'Sorry!')
        break
    }
    if (url === false) canceled = true // user hit cancel on one of the input prompts
    // ask if they want x-success and add it if so

    if (!canceled && url) {
      const op = [
        { label: `Raw/long URL (${url})`, value: 'raw' },
        { label: '[Pretty link](hide long URL)', value: 'pretty' },
      ]
      if (res === 'runPlugin') {
        op.push({ label: 'Templating <% runPlugin %> command', value: 'template' })
      }
      const urlType = await chooseOption(`What type of URL do you want?`, op, 'raw')
      if (urlType === 'pretty') {
        const linkText = await getInput('Enter short text to use for the link', 'OK', 'Link Text', 'Text')
        if (linkText) {
          url = `[${linkText}](${url})`
        }
      } else if (urlType === 'template' && runplugin && typeof runplugin !== 'boolean') {
        //  static invokePluginCommandByName(command: string, pluginID: string, arguments ?: $ReadOnlyArray < mixed >): Promise < any >;
        // { pluginID, command, args, url: createRunPluginCallbackUrl(pluginID, command, args) }

        url = `<% await DataStore.invokePluginCommandByName("${runplugin.command}","${
          runplugin.pluginID
        }",${JSON.stringify(runplugin.args)})  %>`
      }
      Editor.insertTextAtCursor(url)
      Clipboard.string = url
    }
  } catch (error) {
    logError(pluginJson, JSP(error))
  }
}
