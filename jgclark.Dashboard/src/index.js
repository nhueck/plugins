// @flow

// ----------------------------------------------------------------------------
// Dashboard plugin for NotePlan
// Jonathan Clark
// last updated 14.1.2024 for v0.7.5+, @jgclark
// ----------------------------------------------------------------------------

// allow changes in plugin.json to trigger recompilation
import pluginJson from '../plugin.json'
import { showDashboardHTML } from './main'
import { clo, JSP, logDebug, logError, logInfo, logWarn } from '@helpers/dev'
import { getPluginJson, pluginUpdated, updateSettingData } from '@helpers/NPConfiguration'
import { editSettings } from '@helpers/NPSettings'
import { isHTMLWindowOpen, logWindowsList } from '@helpers/NPWindows'
import { showMessage } from '@helpers/userInput'

// import { getNPWeekData } from '@helpers/NPdateTime'
import { getDateStringFromCalendarFilename } from '@helpers/dateTime'
import moment from 'moment/min/moment-with-locales'

export { getDemoDataForDashboard } from './demoDashboard'
export { addTask, addChecklist, refreshDashboard, showDashboardHTML, showDemoDashboardHTML, resetDashboardWinSize } from './main'
export { decideWhetherToUpdateDashboard } from './dashboardTriggers'
export { onMessageFromHTMLView } from './pluginToHTMLBridge'
export { getDataForDashboard, logDashboardData } from './dataGeneration'

const thisPluginID = 'jgclark.Dashboard'

/**
 * Check things each time this plugin's commands are run
 */
export async function init(): Promise<void> {
  try {
    // Check for the latest version of the plugin, and if a minor update is available, install it and show a message
    DataStore.installOrUpdatePluginsByID([pluginJson['plugin.id']], false, false, false)
  } catch (error) {
    logError(`${thisPluginID}/init`, JSP(error))
  }
}

export async function onSettingsUpdated(): Promise<any> {
  // FIXME(Eduard): this fails because the Editor is out of scope when the settings screen is shown
  if (isHTMLWindowOpen(pluginJson['plugin.id'])) {
    await showDashboardHTML('refresh', false) // probably don't need await
  }
}

export async function onUpdateOrInstall(): Promise<void> {
  try {
    // Tell user the plugin has been updated (if there's something to say, and not on iPhone (as it doesn't run there))
    if (pluginJson['plugin.lastUpdateInfo'] !== undefined && NotePlan.environment.platform !== 'iOS') {
      await showMessage(pluginJson['plugin.lastUpdateInfo'], 'OK, thanks', `Plugin ${pluginJson['plugin.name']}\nupdated to v${pluginJson['plugin.version']}`)
    }
  } catch (error) {
    logError(pluginJson, JSP(error))
  }
}

/**
 * Update Settings/Preferences (for iOS etc)
 * Plugin entrypoint for command: "/<plugin>: Update Plugin Settings/Preferences"
 * @author @dwertheimer
 */
export async function updateSettings() {
  try {
    logDebug(pluginJson, `updateSettings running`)
    const res = await editSettings(pluginJson)
  } catch (error) {
    logError(pluginJson, JSP(error))
  }
}
