/* eslint-disable no-undef */
// --------------------------------------------------------------------------------------------------------------------
// Task Helpers plugin for NotePlan
// Jonathan Clark
// v0.3.0, 10.5.2021
// --------------------------------------------------------------------------------------------------------------------

// Settings from NotePlan
// var defaultFileExtension = (DataStore.defaultFileExtension != undefined) ? DataStore.defaultFileExtension : "md"
// let defaultTodoMarker = (DataStore.preference('defaultTodoCharacter') !== undefined) ? DataStore.preference('defaultTodoCharacter') : '*'

// Items that will come from the Preference framework in time:
var pref_inboxFilename = ""  // leave blank for daily note, or give relative filename (e.g. "Folder/Inbox.md")
var pref_addInboxPosition = "append"  // or "append"

// ------------------------------------------------------------------
// Helper function, not called by a command
function printNote(note) {
  if (note === undefined) {
    console.log('Note not found!')
    return
  }

  if (note.type === 'Notes') {
    console.log(
      'title: ' + note.title +
      '\n\tfilename: ' + note.filename +
      '\n\thashtags: ' + note.hashtags +
      '\n\tmentions: ' + note.mentions +
      '\n\tcreated: ' + note.createdDate +
      '\n\tchanged: ' + note.changedDate)
  } else {
    console.log(
      'date: ' + note.date +
      '\n\tfilename: ' + note.filename +
      '\n\thashtags: ' + note.hashtags +
      '\n\tmentions: ' + note.mentions)
  }
}

// ------------------------------------------------------------------
// This adds a task to a selected heading, based on EM's 'example25'.
// Problem here is that duplicate headings are not respected.
async function addTaskToNoteHeading() {
  // Ask for the todo title
  let todoTitle = await CommandBar.showInput('Type the task', "Add task '%@'")

  // Then ask for the note we want to add the todo
  let notes = DataStore.projectNotes
  // CommandBar.showOptions only takes [string] as input
  let re = await CommandBar.showOptions(notes.map((n) => n.title), 'Select note for new todo')
  let note = notes[re.index]

  // Finally, ask to which heading to add the todo
  let headings = note.paragraphs.filter((p) => p.type === 'title')
  let re2 = await CommandBar.showOptions(headings.map((p) => (p.prefix + p.content)), "Select a heading from note '" + note.title + "'")
  let heading = headings[re2.index]
  // console.log("Selected heading: " + heading.content)
  console.log('Adding todo: ' + todoTitle + ' to ' + note.title + ' in heading: ' + heading.content)

  // Add todo to the heading in the note (and add the heading if it doesn't exist)
  note.addTodoBelowHeadingTitle(todoTitle, heading.content, false, true)
}

// ------------------------------------------------------------------
// This adds a note to a selected note's heading.
// Problem here is that duplicate headings are not respected.
async function addTextToNoteHeading() {
  // Ask for the note text
  let text = await CommandBar.showInput('Type the text to add', "Add task '%@'")

  // Then ask for the note we want to add the text
  let notes = DataStore.projectNotes
  // CommandBar.showOptions only takes [string] as input
  let re = await CommandBar.showOptions(notes.map((n) => n.title), 'Select note to add this')
  let note = notes[re.index]

  // Finally, ask to which heading to add the text
  let headings = note.paragraphs.filter((p) => p.type === 'title')
  let re2 = await CommandBar.showOptions(headings.map((p) => (p.prefix + p.content)), "Select a heading from note '" + note.title + "'")
  let heading = headings[re2.index]
  // console.log("Selected heading: " + heading.content)
  console.log('Adding text: ' + text + ' to ' + note.title + ' in heading: ' + heading.content)

  // Add text to the heading in the note (and add the heading if it doesn't exist)
  note.addParagraphBelowHeadingTitle(text, "empty", heading.content, false, true)
}

// ------------------------------------------------------------------
// This adds a task to a special 'inbox' note. Possible configuration:
// - append or prepend to the inbox note (default: append)
// - add to today's daily note (default) or to a particular named note
async function addTaskToInbox() {

  // Ask for the todo title
  let todoTitle = await CommandBar.showInput('Type the task to add to your Inbox note', "Add task '%@'")
  let inboxNote
  // Get the relevant note from the Datastore
  if (pref_inboxFilename != "") {
    inboxNote = DataStore.projectNoteByFilename(pref_inboxFilename)
  } else {
    let todaysDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    inboxNote = DataStore.calendarNoteByDateString(todaysDate) // Add this todo to today's daily note
  }
  if (inboxNote !== undefined) {
    if (pref_addInboxPosition == "append") {
      inboxNote.appendTodo(todoTitle)
    } else {
      inboxNote.prependTodo(todoTitle)
    }
    console.log("Added todo to Inbox note '" + inboxNote.filename + "'")
  } else {
    console.log("ERROR: Couldn't find Inbox note '" + pref_inboxFilename + "'")
  }
}