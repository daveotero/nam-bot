import { ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import { checkForUpdates, getUpdateStatus } from '../updates/updateService'

export function setupUpdateIpcHandlers(): void {
  ipcMain.handle('updates:getStatus', async () => {
    try {
      return getUpdateStatus()
    } catch (error) {
      log.error('Failed to get update status:', error)
      throw error
    }
  })

  ipcMain.handle('updates:openLatestRelease', async () => {
    const status = getUpdateStatus()
    if (!status.releaseUrl) {
      return
    }

    await shell.openExternal(status.releaseUrl)
  })

  ipcMain.handle('updates:openLatestChangelog', async () => {
    const status = getUpdateStatus()
    if (!status.changelogUrl) {
      return
    }

    await shell.openExternal(status.changelogUrl)
  })
}

export async function checkForUpdatesOnStartup(): Promise<void> {
  try {
    await checkForUpdates()
  } catch (error) {
    log.error('Startup update check failed:', error)
  }
}
