// @flow
//-----------------------------------------------------------------------------
// Save search but with flexible options presented as HTML dialog to user first
// Jonathan Clark
// Last updated 2025-03-14 for v2.0.0.b1, @jgclark
//-----------------------------------------------------------------------------
// TODO: fix Cancel button not working on iOS

import pluginJson from '../plugin.json'
import { saveSearch } from './saveSearch'
import type { TSavedSearch, TSearchOptions } from './searchHelpers'
import { getNoteTypesFromString, getParaTypesFromString, getSavedSearches, getSearchSettings, normaliseParaTypesString } from './searchHelpers'
import { clo, logDebug, logError, logWarn } from '@helpers/dev'
import { type HtmlWindowOptions, showHTMLV2 } from '@helpers/HTMLView'
import { closeWindowFromCustomId, logWindowsList } from '@helpers/NPWindows'
import { showMessage } from '@helpers/userInput'

const pluginID = "nhueck.search"

// Name of the preference that holds the list of saved searches offered by the currently-open dialog (as JSON)
const SAVED_SEARCHES_PREF = `${pluginID}.flexiSavedSearches`

// All the paragraph types that can be chosen in the dialog
const ALL_PARA_TYPES_STR = 'open,scheduled,done,cancelled,checklist,checklistScheduled,checklistDone,checklistCancelled,list,quote,title,text'

//-----------------------------------------------------------------------------
const flexiSearchDialogHTML = `
<div class="dialogBox">
 <form type="dialog" id="searchOptions">
  <div class="dialogSection" id="savedSearchSection">
    <b>Edit saved search</b>
    <select id="savedSearch" name="savedSearch">
      <option value="">(none: new search)</option>
    </select>
    <div id="editInfo" class="editInfo"></div>
  </div>

  <div class="dialogSection">
    <div class="searchTermsHeader">
		<b>Search Terms</b>
    <div class="tooltip">
      <i class="fa-regular fa-circle-question"></i>
      <div class="tooltipUnderLeft">
      Searches match on whole or partial words.<br />
      Separate search terms by spaces; surround an exact phrase in double quotes.<br />
      Must find: <kbd>+term</kbd><br />
      Must not find in same line: <kbd>-term</kbd><br />
      Must not find in note: <kbd>!term</kbd><br />
      Several of each kind are allowed, e.g. <kbd>#bestellung +amazon -#standard -#erledigt</kbd><br />
      Only exclusions (e.g. <kbd>-#standard</kbd>) finds all lines of the chosen types without that term.<br />
      <a href="https://github.com/NotePlan/plugins/tree/main/jgclark.SearchExtensions/" target="_blank">Full documentation.</a>
      <u></u> <!-- used to trigger extra bit that mimics speech bubble -->
      </div>
	</div>
    </div>
    <textarea id="searchTerms" name="searchTerms" rows="3" autofocus tabindex="1" placeholder="term +must -exclude !excludeNote"></textarea>

	<div class="dialogSection">
		<b>Save results to </b>
    <input type="radio" name="savetype" id="quick" value="quick" />
    <label for="notetype">'Quick Search' note</label>
    <input type="radio" name="savetype" id="newnote" value="newnote" />
    <label for="notetype">Specific note</label>
    <div class="noteNameRow">
      <label for="noteName">named</label>
      <input type="text" id="noteName" name="noteName" value="" placeholder="(optional) your own name for the note" tabindex="2" />
    </div>
  </div>

	<div class="dialogSection">
		<b>Case sensitive searching?</b>
    <label for="casesens" class="switch">
      <input type="checkbox" id="casesens" name="casesens" value="casesens"/>
    </label>
    <span class="gap-right"></span>
    <b>Match full words only?</b>
    <label for="fullword" class="switch">
      <input type="checkbox" id="fullword" name="fullword" value="fullword" />
    </label>
  </div>

  <div class="dialogSection">
		<b>Include </b>
    <input type="checkbox" name="notetype" id="notes" value="notes" />
    <label for="notes">Regular notes</label>
    <input type="checkbox" name="notetype" id="calendar" value="calendar" />
    <label for="calendar">Calendar notes</label>
    <!-- following will normally be hidden by CSS -->
    <span id="noteTypeWarning" class="validationWarning">[Please select at least one!]</span>
  </div>

  <div class="dialogSection">
	<b>Line Types to include</b>

  <div class="grid-container">
    <div class="grid-item dialogList">Tasks:</div>
    <div class="grid-item">
      <input type="checkbox" id="taskOpen" name="task" value="open" />
      <label for="taskOpen"><i class="fa-regular fa-circle"></i>Open</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" id="taskScheduled" name="task" value="scheduled" />
      <label for="taskScheduled"><i class="fa-regular fa-clock"></i>Scheduled</label>
		</div>
		 <div class="grid-item">
      <input type="checkbox" id="taskDone" name="task" value="done"  />
      <label for="taskDone"><i class="fa-regular fa-circle-check"></i>Complete</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" id="taskCancelled" name="task" value="cancelled" />
      <label for="taskCancelled"><i class="fa-regular fa-circle-xmark"></i>Cancelled</label>
		</div>

    <div class="grid-item dialogList">Checklists:</div>
		<div class="grid-item">
      <input type="checkbox" id="checklistOpen" name="checklist"
      value="checklist" checked />
      <label for="checklistOpen"><i class="fa-regular fa-square"></i>Open</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" id="checklistScheduled" name="checklist"
      value="checklistScheduled" />
      <label for="checklistScheduled"><i class="fa-regular fa-square-chevron-right"></i>Scheduled</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" id="checklistDone" name="checklist" value="checklistDone" checked />
      <label for="checklistDone"><i class="fa-regular fa-square-check"></i>Complete</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" id="checklistCancelled" name="checklist" value="checklistCancelled" />
      <label for="checklistCancelled"><i class="fa-regular fa-square-xmark"></i>Cancelled</label>
		</div>

    <div class="grid-item dialogList">Other line types:</div>
    <div class="grid-item">
      <input type="checkbox" name="other" id="list" value="list" checked />
      <label for="list"><kbd>-</kbd>Bullet lists</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" name="other" id="quote" value="quote" checked />
      <label for="quote"><kbd>&gt;</kbd>Quotations</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" name="other" id="headings" value="title" checked />
      <label for="other"><kbd>#</kbd>Headings</label>
		</div>
		<div class="grid-item">
      <input type="checkbox" name="other" id="text" value="text" checked />
      <label for="text">Note lines</label>
		</div>
  </div>

  <!-- following will normally be hidden by CSS -->
  <span id="paraTypeWarning" class="validationWarning">[Please select at least one!]</span>
	</div>

  <div class="dialogSection">
    <div class="buttonRow">
    <input type="submit" value="Search" class="mainButton" tabindex="2"/>
    <!-- remove for now as it doesn't work on iOS/iPadOS and there's an alternative on macOS
    <input type="submit" value="Cancel" id="displayFirst" tabindex="3"/> -->
    </div>
  </div>
 </form>
</div>
`

// Script to send the search options to the plugin and start it
const JSStartSearchInPlugin = JSON.stringify(`
(async function() {
  await DataStore.invokePluginCommandByName('flexiSearchHandler', 'nhueck.search', ['%%SEARCHTERMS%%', '%%SAVETYPE%%', '%%CASE%%', '%%FULLWORD%%', '%%NOTETYPES%%', '%%PARATYPES%%', '%%NOTENAME%%', '%%EDITINDEX%%'] )
})()
`)

// Script to close the dialog box
const JSCloseDialog = JSON.stringify(`
(async function() {
  await DataStore.invokePluginCommandByName('closeDialogWindow', 'nhueck.search', ['flexiSearchDialog'] )
})()
`)

// Script to save item to DataStore.preference
const JSUpdatePref = JSON.stringify(`
(async function() {
  await DataStore.invokePluginCommandByName('savePluginPreference', 'nhueck.search', ['%%KEY%%', '%%VALUE%%'] )
})()
`)

const flexiSearchDialogPostBodyScripts = `
<script type="text/javascript">
  window.addEventListener("load", () => {
    console.log('onLoad script running ...')

		// Set defaults to use.
		// Note following code assumes case sensitive matching, and that the values are distinct and not subset strings of each other.
    // Their values are substituted before the script is loaded
    let saveType = '%%SAVETYPEPREF%%'
    let caseSensitiveSearching = '%%CASESENSPREF%%'
    let fullWordSearching = '%%FULLWORDPREF%%'
		let noteTypesStr = '%%NOTETYPESSTRPREF%%'
		let paraTypesStr = '%%PARATYPESSTRPREF%%'
    // The saved searches that can be edited (values substituted before the script is loaded), and which one to start with ('' = none)
    const savedSearches = %%SAVEDSEARCHESJSON%%
    const preselectIndex = '%%PRESELECTINDEX%%'
    // Index (as string) of the saved search being edited, or '' for a new search
    let editIndex = ''
    // The settings to go back to for a new search
    const defaults = { saveType: saveType, noteTypesStr: noteTypesStr, paraTypesStr: paraTypesStr }
    const formID = "searchOptions"
		// Get the form element + input controls
    const form = document.getElementById(formID)
		const inputs = form.elements
    const savedSearchSelect = document.getElementById('savedSearch')
    const searchButton = form.querySelector('input[type="submit"]')

		// Iterate over checkbox controls setting whether they're checked or not, from the current values of the variables above.
    // (The two switches are only set when the dialog is first shown.)
		function initDialogState(includeSwitches) {
			console.log('initDialogState()')
      const noteTypesArr = noteTypesStr.split(',')
      const paraTypesArr = paraTypesStr.replace(/,{2,}/g, ',').replace(/,$/, '').replace(/^,/, '').split(',')
			for (let i = 0; i < inputs.length; i++) {
        const val = inputs[i].value
        if (inputs[i].name === "notetype") {
          inputs[i].checked = noteTypesArr.includes(val)
        } else if (inputs[i].name === "savetype") {
          inputs[i].checked = (saveType === val)
        } else if (inputs[i].name === "casesens") {
          if (includeSwitches) inputs[i].checked = (caseSensitiveSearching === val)
        } else if (inputs[i].name === "fullword") {
          if (includeSwitches) inputs[i].checked = (fullWordSearching === val)
        } else if (inputs[i].type === "checkbox") {
          inputs[i].checked = paraTypesArr.includes(val)
        }
			}
		}

    // Show or hide the two validation warnings
    function updateWarnings() {
      document.getElementById('noteTypeWarning').style.display = (noteTypesStr === '') ? 'block' : 'none'
      document.getElementById('paraTypeWarning').style.display = (paraTypesStr === '') ? 'block' : 'none'
    }

    // Load the details of the chosen saved search into the dialog, or go back to the defaults for a new search (indexStr = '')
    function selectSavedSearch(indexStr) {
      const savedSearch = (indexStr === '') ? null : savedSearches[Number(indexStr)]
      editIndex = savedSearch ? indexStr : ''
      if (savedSearch) {
        saveType = savedSearch.saveType
        noteTypesStr = savedSearch.noteTypesStr
        paraTypesStr = savedSearch.paraTypesStr
        inputs["searchTerms"].value = savedSearch.searchTerms
        inputs["noteName"].value = savedSearch.noteName
      } else {
        saveType = defaults.saveType
        noteTypesStr = defaults.noteTypesStr
        paraTypesStr = defaults.paraTypesStr
      }
      document.getElementById('editInfo').textContent = savedSearch ? savedSearch.info : ''
      searchButton.value = savedSearch ? 'Save & Search' : 'Search'
      initDialogState(false)
      updateWarnings()
    }

    // Fill the list of saved searches (or hide it, if there are none)
    if (savedSearches.length === 0) {
      document.getElementById('savedSearchSection').style.display = 'none'
    }
    for (let i = 0; i < savedSearches.length; i++) {
      const option = document.createElement('option')
      option.value = String(i)
      option.textContent = savedSearches[i].label
      savedSearchSelect.appendChild(option)
    }

		initDialogState(true)
    if (preselectIndex !== '') {
      savedSearchSelect.value = preselectIndex
      selectSavedSearch(preselectIndex)
    }

    // save which items are checked in the Dialog by putting them in two comma-separated strings,
    // which get sent to hidden plugin command 'savePluginPreference'
    // Note: this also updates the variables that are used when the form is submitted.
    // Note: while a saved search is being edited its details are not saved as the defaults for the next new search.
		function saveDialogState() {
			console.log('saveDialogState()')
      saveType = ''
			let caseSens = ''
			let fullWord = ''
			noteTypesStr = ''
			paraTypesStr = ''
			// Iterate over the optional controls
			for (let i = 0; i < inputs.length; i++) {
				console.log(inputs[i].nodeName, inputs[i].type, inputs[i].checked, inputs[i].value)
				if (inputs[i].checked && inputs[i].name === "notetype") {
					// Add this checked value to a CSV string
					noteTypesStr += inputs[i].value + ','
				}
				if (inputs[i].checked && (inputs[i].name === "savetype")) {
					// Set this
					saveType = inputs[i].value
				}
				if (inputs[i].checked && (inputs[i].name === "casesens")) {
					// Set this
					caseSens = inputs[i].value
				}
				if (inputs[i].checked && (inputs[i].name === "fullword")) {
					// Set this
					fullWord = inputs[i].value
				}
				if (inputs[i].checked && (inputs[i].name === "task" || inputs[i].name === "checklist" || inputs[i].name === "other")) {
					// Add this checked value to a CSV string
					paraTypesStr += inputs[i].value + ','
				}
			}
      caseSensitiveSearching = caseSens
      fullWordSearching = fullWord
			console.log('Saving ' + saveType + ' / ' + caseSens + ' / ' + fullWord + ' / ' + noteTypesStr + ' / ' + paraTypesStr)
      window.webkit.messageHandlers.jsBridge.postMessage({
        code: ${JSUpdatePref}.replace('%%KEY%%', 'caseSensitiveSearching').replace('%%VALUE%%', caseSens),
        onHandle: "neededDummyFunc",
        id: "1"
      })
      window.webkit.messageHandlers.jsBridge.postMessage({
        code: ${JSUpdatePref}.replace('%%KEY%%', 'fullWordSearching').replace('%%VALUE%%', fullWord),
        onHandle: "neededDummyFunc",
        id: "1"
      })
      if (editIndex === '') {
        defaults.saveType = saveType
        defaults.noteTypesStr = noteTypesStr
        defaults.paraTypesStr = paraTypesStr
        window.webkit.messageHandlers.jsBridge.postMessage({
          code: ${JSUpdatePref}.replace('%%KEY%%', 'saveType').replace('%%VALUE%%', saveType),
          onHandle: "neededDummyFunc",
          id: "1"
        })
        window.webkit.messageHandlers.jsBridge.postMessage({
          code: ${JSUpdatePref}.replace('%%KEY%%', 'noteTypesStr').replace('%%VALUE%%', noteTypesStr),
          onHandle: "neededDummyFunc",
          id: "1"
        })
        window.webkit.messageHandlers.jsBridge.postMessage({
          code: ${JSUpdatePref}.replace('%%KEY%%', 'paraTypesStr').replace('%%VALUE%%', paraTypesStr),
          onHandle: "neededDummyFunc",
          id: "1"
        })
      }

      // if noteTypesStr or paraTypesStr is empty, then we have no options set, so warn user
      updateWarnings()
      console.log('end of saveDialogState()')
    }

    // Add 'change' event handler to form
		form.addEventListener("change", (event) => {
      if (event.target === savedSearchSelect) {
        // a different saved search (or none) was chosen
        selectSavedSearch(savedSearchSelect.value)
        return
      }
			saveDialogState()
		})

    // In the (multi-line) search terms box, Return starts the search rather than adding a new line
    form.elements["searchTerms"].addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault()
        form.requestSubmit(searchButton)
      }
    })

    // Add 'submit' event handler to form
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const submitterValue = event.submitter ? event.submitter.value : 'Search'
      console.log('submit event fired with value ' + submitterValue)

      // Close if user has cancelled
      if (submitterValue === 'Cancel') {
        console.log('cancel event fired ...')
        // Note: can't just do 'window.close()' as the window wasn't opened by a window.open() command
        window.webkit.messageHandlers.jsBridge.postMessage({
          code: ${JSCloseDialog},
          onHandle: "neededDummyFunc",
          id: "1"
        })
        return
      }

			// Get the text input
			// Note: any line breaks (e.g. from pasted text) are turned into spaces, as the terms are passed on in a single-line string.
			// (No regex with backslashes here, as this script lives inside a JS template literal.)
			const searchTerms = inputs["searchTerms"].value.split(String.fromCharCode(13)).join(' ').split(String.fromCharCode(10)).join(' ').trim()

      // Get the optional note name. Note: straight quotes are swapped for a typographic one, as the name is passed on inside a quoted string.
      const noteName = inputs["noteName"].value.split("'").join("’").split('"').join("’").trim()

      // Remove any multiple or leading or trailing comma(s)
      let noteTypes = noteTypesStr.replace(/,{2,}/g, ',').replace(/,$/, '').replace(/^,/, '')
      noteTypes = (noteTypes === 'notes,calendar') ? 'both' : noteTypes
      let paraTypes = paraTypesStr.replace(/,{2,}/g, ',').replace(/,$/, '').replace(/^,/, '')

      if (paraTypes === '' || noteTypes === '') {
        console.log("** cancel submit form as we don't have valid options set yet ... **")
        return
      }

      // The search terms and note name are passed on inside a single-quoted string, so escape backslashes and single quotes.
      // (Built from character codes, as this script lives inside a JS template literal.)
      const backslash = String.fromCharCode(92)
      const escapeForQuotedString = (str) => str.split(backslash).join(backslash + backslash).split("'").join(backslash + "'")

      // Update the JS to send to the plugin based on the form values, and then send
      // Note: free text is inserted through functions, so that any '$' in it is not treated as a replacement pattern.
      window.webkit.messageHandlers.jsBridge.postMessage({
        code: ${JSStartSearchInPlugin}
          .replace('%%SEARCHTERMS%%', () => escapeForQuotedString(searchTerms))
          .replace('%%SAVETYPE%%', saveType)
          .replace('%%CASE%%', caseSensitiveSearching)
          .replace('%%FULLWORD%%', fullWordSearching)
          .replace('%%NOTETYPES%%', noteTypes)
          .replace('%%PARATYPES%%', paraTypes)
          .replace('%%NOTENAME%%', () => escapeForQuotedString(noteName))
          .replace('%%EDITINDEX%%', editIndex),
        onHandle: "neededDummyFunc",
        id: "1"
      })
    })
  })

  // placeholder function; not sure why it's needed, but it is!
  function neededDummyFunc(re, id) {
  }

</script>
`

const resourceLinksInHeader = `
  <!-- Load in FlexiSearch-specific CSS -->
  <link href="flexiSearch.css" rel="stylesheet">

  <!-- Load in fontawesome assets (licensed for NotePlan) -->
  <link href="../np.Shared/fontawesome.css" rel="stylesheet">
  <link href="../np.Shared/regular.min.flat4NP.css" rel="stylesheet">
  <link href="../np.Shared/solid.min.flat4NP.css" rel="stylesheet">
  <link href="../np.Shared/light.min.flat4NP.css" rel="stylesheet">

  <!-- Tell the browser to render the page at 1x to make it work on iOS -->
  <meta name="viewport" content="width=device-width, initial-scale=1" />
`

// ------------------------------------------------------------------------

/**
 * Display the flexiSearch dialog to user, using saved settings and preferences to pre-populate the various controls on the dialog.
 * The dialog also lists the existing saved searches, any of which can be loaded into the dialog to edit it.
 * This in turn will call back to flexiSearchHandler() below.
 * @author @jgclark
 * @param {string?} filenameToEdit optional filename of a saved search note, to load into the dialog straight away
*/
export async function showFlexiSearchDialog(
  filenameToEdit?: string = '',
): Promise<void> {
  try {
    // Look up the 5 preferences from local store
    // Note: extra commas aren't typos
    const saveType = String(DataStore.preference(`${pluginID}.saveType`) ?? 'quick')
    const caseSensitiveSearching = String(DataStore.preference(`${pluginID}.caseSensitiveSearching`) ?? false)
    const fullWordSearching = String(DataStore.preference(`${pluginID}.fullWordSearching`) ?? false)
    const noteTypesStr = String(DataStore.preference(`${pluginID}.noteTypesStr`) ?? 'notes,calendar,')
    const paraTypesStr = normaliseParaTypesString(String(DataStore.preference(`${pluginID}.paraTypesStr`) ?? 'open,done,checklist,checklistDone,list,quote,title,text,'))

    // Get the saved searches that can be edited. The list is also kept in a preference, so that flexiSearchHandler() can tell which one was edited.
    const config = await getSearchSettings()
    const savedSearches: Array<TSavedSearch> = getSavedSearches(config)
    DataStore.setPreference(SAVED_SEARCHES_PREF, JSON.stringify(savedSearches))
    const savedSearchesForDialog = savedSearches.map((ss) => {
      const isQuick = ss.destination === 'quick'
      const isPeriod = ss.fromDateStr !== ''
      return {
        label: ss.title,
        searchTerms: ss.searchTerms,
        saveType: isQuick ? 'quick' : 'newnote',
        noteTypesStr: ss.noteTypes === 'both' ? 'notes,calendar,' : `${ss.noteTypes},`,
        paraTypesStr: ss.paraTypes !== '' ? ss.paraTypes : ALL_PARA_TYPES_STR,
        noteName: ss.noteTitle,
        info: isQuick
          ? ''
          : isPeriod
            ? `Searches Calendar notes from ${ss.fromDateStr} to ${ss.toDateStr}. This period and the automatic note name are kept; the results go back into the same note.`
            : `The results go back into the same note. Its name follows the search terms, unless you give your own.`,
      }
    })
    const preselectIndex = (filenameToEdit !== '') ? savedSearches.findIndex((ss) => ss.filename === filenameToEdit) : -1
    logDebug(pluginJson, `showFlexiSearchDialog: ${savedSearches.length} saved searches found; filenameToEdit='${filenameToEdit}' -> index ${preselectIndex}`)

    // Note: values are inserted through functions, so that any '$' in them is not treated as a replacement pattern.
    // The JSON is made safe to sit inside a <script> tag.
    const savedSearchesJSON = JSON.stringify(savedSearchesForDialog).replace(/</g, '\\u003c')
    const flexiSearchDialogPostBodyScriptsWithPrefValues = flexiSearchDialogPostBodyScripts
      .replace('%%SAVETYPEPREF%%', () => saveType)
      .replace('%%CASESENSPREF%%', () => caseSensitiveSearching)
      .replace('%%FULLWORDPREF%%', () => fullWordSearching)
      .replace('%%NOTETYPESSTRPREF%%', () => noteTypesStr)
      .replace('%%PARATYPESSTRPREF%%', () => paraTypesStr)
      .replace('%%SAVEDSEARCHESJSON%%', () => savedSearchesJSON)
      .replace('%%PRESELECTINDEX%%', () => (preselectIndex >= 0 ? String(preselectIndex) : ''))

    // write HTML to capture relevant search options
    const opts: HtmlWindowOptions = {
      windowTitle: 'FlexiSearch',
      customId: 'flexiSearchDialog',
      headerTags: resourceLinksInHeader,
      generalCSSIn: '', // i.e. generate from theme
      specificCSS: '',
      makeModal: false, // modal doesn't actually help us here
      postBodyScript: flexiSearchDialogPostBodyScriptsWithPrefValues,
      savedFilename: '../../nhueck.search/flexiSearchDialog.html',
      width: 580,
      height: 640,
      reuseUsersWindowRect: true,
      shouldFocus: true,
    }
    // show dialog as non-modal HTML window
    await showHTMLV2(flexiSearchDialogHTML, opts)
  }
  catch (err) {
    logError(pluginJson, `showFlexiSearchDialog: ${err.message}`)
  }
}

/**
 * Edit a saved search in the flexiSearch dialog.
 * If the note open in the Editor is a saved search, that one is loaded into the dialog; otherwise it can be chosen from the list in the dialog.
 * Called by the user, or by the 'Edit' button in a saved search note.
 */
export async function editSavedSearch(): Promise<void> {
  try {
    const config = await getSearchSettings()
    const savedSearches = getSavedSearches(config)
    if (savedSearches.length === 0) {
      await showMessage(`I can't find any saved searches in folder '${config.folderToStore}'.`)
      return
    }
    const openFilename = Editor.note?.filename ?? ''
    const openNoteIsSavedSearch = savedSearches.some((ss) => ss.filename === openFilename)
    logDebug(pluginJson, `editSavedSearch: open note '${openFilename}' ${openNoteIsSavedSearch ? 'is' : 'is NOT'} a saved search`)
    await showFlexiSearchDialog(openNoteIsSavedSearch ? openFilename : '')
  }
  catch (err) {
    logError(pluginJson, `editSavedSearch: ${err.message}`)
  }
}

/**
 * Get the saved search that was edited in the dialog, from the list that showFlexiSearchDialog() kept.
 * @param {string} editIndexStr index into that list, or '' if this is a new search
 * @returns {?TSavedSearch}
 */
function getEditedSavedSearch(editIndexStr: string): ?TSavedSearch {
  if (editIndexStr === '') return null
  try {
    const list = JSON.parse(String(DataStore.preference(SAVED_SEARCHES_PREF) ?? '[]'))
    const item = Array.isArray(list) ? list[Number(editIndexStr)] : null
    return (item && typeof item.filename === 'string') ? item : null
  }
  catch (err) {
    logWarn(pluginJson, `getEditedSavedSearch: couldn't read list of saved searches: ${err.message}`)
    return null
  }
}

/**
 * Handle search request from the flexiSearch dialog.
 * @param {string} searchTerms 
 * @param {string} saveType 
 * @param {string} caseSensitiveSearchingAsStr Note: string due to limit of bridge to plugin. either 'casesens' or ''
 * @param {string} fullWordSearchingAsStr Note: string due to limit of bridge to plugin. either 'fullword' or ''
 * @param {string} noteType 'notes' | 'calendar' | 'both'
 * @param {string} paraTypes
 * @param {string} noteName optional user-chosen name for the results note
 * @param {string} editIndexStr if a saved search was edited: its index in the list of saved searches shown in the dialog. Otherwise ''.
 * @returns {any} but in practice empty object
 */
export async function flexiSearchHandler(
  searchTerms: string,
  saveType: string,
  caseSensitiveSearchingAsStr: string,
  fullWordSearchingAsStr: string,
  noteType: string,
  paraTypes: string,
  noteName: string = '',
  editIndexStr: string = '',
): Promise<void> {
  try {
    logDebug(pluginJson, `flexiSearchHandler called with [${searchTerms}] / ${saveType} / ${caseSensitiveSearchingAsStr} / ${fullWordSearchingAsStr} / ${noteType} / ${paraTypes} / '${noteName}' / edit '${editIndexStr}'`)
    // First close the window
    closeDialogWindow('flexiSearchDialog')

    // Was an existing saved search edited? If so, its results note is re-used.
    // A search over a period keeps its period (which the dialog can't change) and stays a Calendar-only search with an automatic note name, as that is all its Refresh button can express.
    const editedSearch = (saveType === 'quick') ? null : getEditedSavedSearch(editIndexStr)
    const targetNoteFilename = (editedSearch != null && editedSearch.destination !== 'quick') ? editedSearch.filename : ''
    const fromDateStr = editedSearch != null ? editedSearch.fromDateStr : ''
    const toDateStr = editedSearch != null ? editedSearch.toDateStr : ''
    const isPeriodSearch = fromDateStr !== ''
    if (editedSearch != null) {
      logDebug(pluginJson, `- editing saved search in note '${editedSearch.filename}'${isPeriodSearch ? ` for period ${fromDateStr} - ${toDateStr}` : ''}`)
    }

    // Take saveType and noteType add create originatorCommand from it
    const originatorCommand =
      (saveType === 'quick') ? 'quickSearch'
        : isPeriodSearch ? 'searchPeriod'
          : (noteType === 'notes') ? 'searchOverNotes'
            : (noteType === 'calendar') ? 'searchOverCalendar'
              : 'search' // which defaults to 'both'

    // Then call main saveSearch function (no need to await for it)
    const caseSensitiveSearching: boolean = getPluginPreference('caseSensitiveSearching') === 'casesens'
    const fullWordSearching: boolean = getPluginPreference('fullWordSearching') === 'fullword'
    // saveSearch(searchTerms, noteType, originatorCommand, paraTypes, 'Searching', caseSensitiveSearching, fullWordSearching)
    const searchOptions: TSearchOptions = {
      noteTypesToInclude: isPeriodSearch ? ['calendar'] : getNoteTypesFromString(noteType),
      paraTypesToInclude: getParaTypesFromString(paraTypes),
      caseSensitiveSearching,
      fullWordSearching,
      originatorCommand,
      noteTitle: isPeriodSearch ? '' : noteName,
    }
    if (isPeriodSearch) {
      searchOptions.fromDateStr = fromDateStr
      searchOptions.toDateStr = toDateStr
    }
    if (targetNoteFilename !== '') {
      searchOptions.targetNoteFilename = targetNoteFilename
    }
    await saveSearch(searchOptions, searchTerms) // Note: no need to await, but done for consistency
    return
  }
  catch (err) {
    logError(pluginJson, `flexiSearchHandler: ${err.message}`)
    return
  }
}

/**
 * Way for an HTML window to request that it be closed.
 * Is there a simpler way? I can't find one yet.
 * @param {customId} customId
 * @returns {any} not used, but has to be present
 */
export function closeDialogWindow(customId: string): any {
  try {
    // logDebug(pluginJson, `closeDialogWindow('${customId}') called`)
    closeWindowFromCustomId(customId)

    return {} // apparently required to avoid error in log
  }
  catch (err) {
    logError(pluginJson, `closeDialogWindow: ${err.message}`)
    return {}
  }
}

/**
 * Helper function for HTML views to set a DataStore.preference value (as a string)
 * @param {string} key to set
 * @param {string} value to set
 * @returns {any}
 */
export function savePluginPreference(key: string, value: string): any {
  try {
    const prefName = `${pluginID}.${key}`
    logDebug(pluginJson, `savePluginPreference('${key}', '${value}') called for ${pluginID}`)
    DataStore.setPreference(prefName, value)
    logDebug(pluginJson, `-> ${String(DataStore.preference(prefName))}`)

    return {} // apparently required to avoid error in log
  }
  catch (err) {
    logError(pluginJson, `savePluginPreference: ${err.message}`)
    return {}
  }
}

/**
 * Helper function for HTML views to get DataStore.preference value
 * @param {string} key to read
 * @returns {any}
 */
export function getPluginPreference(key: string): any {
  try {
    const prefName = `${pluginID}.${key}`
    const prefValue = DataStore.preference(prefName)
    logDebug(pluginJson, `getPluginPreference('${key}') called for ${pluginID} → ${String(prefValue)}`)
    return prefValue
  }
  catch (err) {
    logError(pluginJson, `getPluginPreference: ${err.message}`)
    return {}
  }
}