import { ipcMain, dialog, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { loadSettings, saveSettings } from '../persistence/settingsStore'
import { detectCondaOnPath, inspectAcceleratorDiagnostics, validateBackend } from '../backend/adapter'
import { AppSettings } from '../types'
import { getQueueManager } from '../jobs/queueManager'

let cachedSettings: AppSettings | null = null

async function validateAndBroadcast(): Promise<ReturnType<typeof validateBackend> extends Promise<infer TResult> ? TResult : never> {
  const settings: AppSettings = cachedSettings || loadSettings()
  cachedSettings = settings
  const result = await validateBackend(settings)

  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('backend:validationUpdated', result)
  })

  return result
}

export function setupIpcHandlers(): void {
  log.info('Setting up IPC handlers')

  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    try {
      if (!cachedSettings) {
        cachedSettings = loadSettings()
      }
      return cachedSettings
    } catch (error) {
      log.error('Failed to get settings:', error)
      throw error
    }
  })

  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    try {
      saveSettings(settings)
      cachedSettings = settings
      // Keep queue runner in sync with latest settings without requiring restart.
      getQueueManager().setSettings(settings)
      log.info('Settings saved')
    } catch (error) {
      log.error('Failed to save settings:', error)
      throw error
    }
  })

  ipcMain.handle('settings:validate', async () => {
    try {
      return await validateAndBroadcast()
    } catch (error) {
      log.error('Failed to validate backend:', error)
      throw error
    }
  })

  ipcMain.handle('settings:detectConda', async () => {
    try {
      return await detectCondaOnPath()
    } catch (error) {
      log.error('Failed to detect Conda on PATH:', error)
      throw error
    }
  })

  ipcMain.handle('settings:getAcceleratorDiagnostics', async () => {
    try {
      const settings: AppSettings = cachedSettings || loadSettings()
      cachedSettings = settings
      return await inspectAcceleratorDiagnostics(settings)
    } catch (error) {
      log.error('Failed to inspect accelerator diagnostics:', error)
      throw error
    }
  })

  ipcMain.handle('settings:chooseCondaPath', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Conda Executable',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Executable', extensions: ['exe', 'bat', 'cmd'] }, { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  ipcMain.handle('settings:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Directory',
      properties: ['openDirectory', 'createDirectory']
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  ipcMain.handle('settings:choosePythonPath', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Python Executable',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Python', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  log.info('IPC handlers registered')
}

export async function validateBackendOnStartup(): Promise<void> {
  try {
    await validateAndBroadcast()
    log.info('Startup backend validation finished')
  } catch (error) {
    log.error('Startup backend validation failed:', error)
  }
}
