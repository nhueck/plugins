// @flow
//-----------------------------------------------------------------------------
// Vorlagen (nhueck): Vorlagen in Kalendernotizen nachtragen
//-----------------------------------------------------------------------------

import pluginJson from '../plugin.json'
import { JSP, logError, logInfo } from '@helpers/dev'
import { updateSettingData } from '@helpers/NPConfiguration'

export { vorlagenNachtragen, vorlageInDieseNotiz } from './vorlagen'

export function init(): void {
  // nothing to do: this is a local plugin with no online version to check for
}

export function onSettingsUpdated(): void {
  // nothing to do: settings are read afresh on every run
}

export function onUpdateOrInstall(): void {
  try {
    const result = updateSettingData(pluginJson)
    logInfo(pluginJson, `onUpdateOrInstall: updateSettingData code ${String(result)}`)
  } catch (error) {
    logError(pluginJson, JSP(error))
  }
}
