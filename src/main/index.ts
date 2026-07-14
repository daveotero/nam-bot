import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  powerSaveBlocker,
  shell,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type NativeImage
} from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import log from 'electron-log/main'
import { existsSync, mkdirSync } from 'fs'
import { setupIpcHandlers, validateBackendOnStartup } from './ipc/settings'
import { setupJobIpcHandlers } from './ipc/jobs'
import { setupPresetIpcHandlers } from './ipc/presets'
import { setupLogsIpcHandlers } from './ipc/logs'
import { checkForUpdatesNow, checkForUpdatesOnStartup, setupUpdateIpcHandlers } from './ipc/updates'
import { getQueueManager } from './jobs/queueManager'
import type { JobRuntimeState, JobStatus } from './types/jobs'
import { installApplicationMenu } from './shell/appMenu'
import { loadSettings } from './persistence/settingsStore'
import { getUserPresetsPath } from './persistence/presetStore'
import type { AppCommand } from '../shared/appShell'

log.initialize()

const isDev = !app.isPackaged
const APP_ID = 'com.nambot.app'
const PROJECT_URL = 'https://github.com/daveotero/nam-bot'
const ISSUE_TRACKER_URL = 'https://github.com/daveotero/nam-bot/issues'
const NAM_GITHUB_URL = 'https://github.com/sdatkinson/neural-amp-modeler'
const ACTIVE_JOB_STATUSES: JobStatus[] = ['preparing', 'running', 'stopping']
const FINISHED_JOB_STATUSES: JobStatus[] = ['succeeded', 'failed', 'canceled']
const TRAINING_POWER_SAVE_BLOCKER_TYPE = process.platform === 'win32'
  ? 'prevent-display-sleep'
  : 'prevent-app-suspension'

log.transports.file.level = 'info'
log.transports.console.level = 'debug'

const userDataPath = app.getPath('userData')
const logPath = join(userDataPath, 'logs')
if (!existsSync(logPath)) {
  mkdirSync(logPath, { recursive: true })
}
log.transports.file.resolvePathFn = () => join(logPath, 'nam-bot.log')

log.info('=== NAM-BOT STARTING ===')
log.info(`Version: ${app.getVersion()}`)
log.info(`User data path: ${userDataPath}`)
log.info(`Is dev: ${isDev}`)

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error)
  getQueueManager().shutdownSync('unexpected error')
  stopTrainingPowerSaveBlocker()
  dialog.showErrorBox('Unexpected Error', `An unexpected error occurred:\n${error.message}`)
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason)
})


interface RendererErrorPayload {
  message: string
  stack?: string
  source?: string
  fileName?: string
  line?: number
  column?: number
  isUnhandledRejection?: boolean
}

let mainWindow: BrowserWindow | null = null
let allowUnsafeClose = false
let trainingPowerSaveBlockerId: number | null = null
const reportedFinishedStatuses: Map<string, JobStatus> = new Map()
const reportedDiagnosticBlocks: Set<string> = new Set()

function showMainMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  return mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options)
}

app.setAppUserModelId(APP_ID)

app.setAboutPanelOptions({
  applicationName: 'NAM-BOT',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: 'MIT License',
  website: PROJECT_URL
})

function sendAppCommand(command: AppCommand): void {
  mainWindow?.webContents.send('app:command', command)
}

async function openPathInShell(targetPath: string): Promise<void> {
  const errorMessage = await shell.openPath(targetPath)
  if (errorMessage) {
    log.warn(`Failed to open path "${targetPath}": ${errorMessage}`)
  }
}

function resolveWorkspaceRoot(): string {
  const configuredWorkspaceRoot = loadSettings().defaultWorkspaceRoot?.trim()
  return configuredWorkspaceRoot && configuredWorkspaceRoot.length > 0
    ? configuredWorkspaceRoot
    : join(userDataPath, 'workspaces')
}

function resolveWindowIcon(): NativeImage | undefined {
  const candidatePaths = [
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../../build/icon.ico'),
    join(__dirname, '../../../build/icon.png'),
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'icon.png')
  ]

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue
    }

    const icon = nativeImage.createFromPath(candidatePath)
    if (!icon.isEmpty()) {
      log.info(`Using window icon from: ${candidatePath}`)
      return icon
    }
  }

  log.warn('No usable window icon found for BrowserWindow.')
  return undefined
}

function hasActiveTrainingWork(): boolean {
  const queueManager = getQueueManager()
  return queueManager.isQueueProcessing()
    || queueManager.getQueue().some((runtime) => ACTIVE_JOB_STATUSES.includes(runtime.status))
}

function updateTrainingPowerSaveBlocker(): void {
  if (hasActiveTrainingWork()) {
    if (trainingPowerSaveBlockerId == null || !powerSaveBlocker.isStarted(trainingPowerSaveBlockerId)) {
      trainingPowerSaveBlockerId = powerSaveBlocker.start(TRAINING_POWER_SAVE_BLOCKER_TYPE)
      log.info(`Started training power save blocker (${TRAINING_POWER_SAVE_BLOCKER_TYPE}): ${trainingPowerSaveBlockerId}`)
    }
    return
  }

  stopTrainingPowerSaveBlocker()
}

function stopTrainingPowerSaveBlocker(): void {
  if (trainingPowerSaveBlockerId == null) {
    return
  }

  if (powerSaveBlocker.isStarted(trainingPowerSaveBlockerId)) {
    powerSaveBlocker.stop(trainingPowerSaveBlockerId)
    log.info(`Stopped training power save blocker: ${trainingPowerSaveBlockerId}`)
  }

  trainingPowerSaveBlockerId = null
}

async function showAboutDialog(): Promise<void> {
  const result = await showMainMessageBox({
    type: 'info',
    title: 'About NAM-BOT',
    message: `NAM-BOT ${app.getVersion()}`,
    detail: 'Neural Amp Modeler Training Manager\nMIT licensed desktop frontend for creating, queueing, and monitoring NAM training jobs.',
    buttons: ['Close', 'Credits Screen', 'Project Website'],
    cancelId: 0,
    defaultId: 0,
    noLink: true
  })

  if (result.response === 1) {
    sendAppCommand({ type: 'navigate', path: '/about' })
  }

  if (result.response === 2) {
    await shell.openExternal(PROJECT_URL)
  }
}

async function showManualUpdateCheckDialog(): Promise<void> {
  try {
    const status = await checkForUpdatesNow()

    if (status.state === 'update-available' && status.latestVersion) {
      const result = await showMainMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `NAM-BOT ${status.latestVersion} is available.`,
        detail: `You are currently running NAM-BOT ${status.currentVersion}.`,
        buttons: status.releaseUrl ? ['Open Release Page', 'Close'] : ['Close'],
        cancelId: status.releaseUrl ? 1 : 0,
        defaultId: 0,
        noLink: true
      })

      if (result.response === 0 && status.releaseUrl) {
        await shell.openExternal(status.releaseUrl)
      }
      return
    }

    if (status.state === 'up-to-date') {
      await showMainMessageBox({
        type: 'info',
        title: 'No Updates Available',
        message: `NAM-BOT ${status.currentVersion} is up to date.`,
        detail: status.lastCheckedAt
          ? `Checked GitHub Releases at ${new Date(status.lastCheckedAt).toLocaleString()}.`
          : 'Checked GitHub Releases just now.',
        buttons: ['Close'],
        defaultId: 0,
        noLink: true
      })
      return
    }

    await showMainMessageBox({
      type: 'warning',
      title: 'Update Check Failed',
      message: 'NAM-BOT could not confirm the latest release right now.',
      detail: 'The app will keep your last known update state. Check your internet connection and try again.',
      buttons: ['Close'],
      defaultId: 0,
      noLink: true
    })
  } catch (error) {
    log.error('Manual update dialog flow failed:', error)
    await showMainMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'NAM-BOT could not complete the manual update check.',
      detail: error instanceof Error ? error.message : String(error),
      buttons: ['Close'],
      defaultId: 0,
      noLink: true
    })
  }
}

function focusMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

function updateWindowProgress(): void {
  if (!mainWindow) {
    return
  }

  const queue = getQueueManager().getQueue()
  const activeRuntime = queue.find((runtime) => ACTIVE_JOB_STATUSES.includes(runtime.status))

  if (!activeRuntime) {
    mainWindow.setProgressBar(-1)
    return
  }

  const percent = activeRuntime.terminalProgress?.percent
  if (typeof percent === 'number' && Number.isFinite(percent) && percent >= 0) {
    mainWindow.setProgressBar(Math.max(0, Math.min(1, percent / 100)))
    return
  }

  mainWindow.setProgressBar(2)
}

function maybeShowJobNotification(runtime: JobRuntimeState): void {
  if (runtime.status === 'queued' && runtime.errorCategory === 'a2_diagnostics_pending') {
    if (reportedDiagnosticBlocks.has(runtime.jobId)) {
      return
    }
    reportedDiagnosticBlocks.add(runtime.jobId)

    if (!Notification.isSupported()) {
      return
    }

    const notification = new Notification({
      title: 'Diagnostics needed before training',
      body: runtime.jobName
    })

    notification.on('click', () => {
      focusMainWindow()
      sendAppCommand({ type: 'navigate', path: '/diagnostics' })
    })

    notification.show()
    return
  }

  reportedDiagnosticBlocks.delete(runtime.jobId)

  if (!FINISHED_JOB_STATUSES.includes(runtime.status)) {
    return
  }

  if (reportedFinishedStatuses.get(runtime.jobId) === runtime.status) {
    return
  }
  reportedFinishedStatuses.set(runtime.jobId, runtime.status)

  if (!Notification.isSupported()) {
    return
  }

  const notification = new Notification({
    title:
      runtime.status === 'succeeded'
        ? 'Training completed'
        : runtime.status === 'failed'
          ? 'Training failed'
          : 'Training canceled',
    body: runtime.jobName
  })

  notification.on('click', () => {
    focusMainWindow()
    sendAppCommand({ type: 'navigate', path: '/jobs' })
  })

  notification.show()
}

function setupShellIntegrations(): void {
  const queueManager = getQueueManager()

  queueManager.on('queueUpdated', () => {
    updateTrainingPowerSaveBlocker()
    updateWindowProgress()
  })

  queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
    updateTrainingPowerSaveBlocker()
    updateWindowProgress()
    maybeShowJobNotification(runtime)
  })
}

function createWindow(): void {
  log.info('Creating main window...')
  const windowIcon = resolveWindowIcon()
  const bundledRendererPath = join(__dirname, '../renderer/index.html')
  const bundledRendererUrl = pathToFileURL(bundledRendererPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#09090b',
    icon: windowIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready to show')
    if (windowIcon) {
      mainWindow?.setIcon(windowIcon)
    }
    mainWindow?.show()
    updateWindowProgress()
  })

  const trustedExternalHosts = new Set([
    'github.com',
    'daveotero.com',
    'flatlineaudio.com',
    'ko-fi.com',
    'www.anaconda.com',
    'pytorch.org',
    'www.pytorch.org'
  ])
  const isTrustedRendererUrl = (targetUrl: string): boolean => {
    try {
      const parsedUrl = new URL(targetUrl)
      if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        return parsedUrl.origin === new URL(process.env['ELECTRON_RENDERER_URL']).origin
      }
      return parsedUrl.protocol === 'file:' && parsedUrl.pathname === bundledRendererUrl.pathname
    } catch {
      return false
    }
  }

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) {
      event.preventDefault()
      log.warn('Blocked unexpected renderer navigation:', targetUrl)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const targetUrl = new URL(details.url)
      if (targetUrl.protocol === 'https:' && trustedExternalHosts.has(targetUrl.hostname)) {
        void shell.openExternal(targetUrl.toString())
      } else {
        log.warn('Blocked untrusted external URL:', details.url)
      }
    } catch {
      log.warn('Blocked malformed external URL:', details.url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  mainWindow.on('close', (event) => {
    if (allowUnsafeClose || !hasActiveTrainingWork()) {
      return
    }

    event.preventDefault()
    void showMainMessageBox({
      type: 'warning',
      title: 'Training is still running',
      message: 'Closing NAM-BOT right now will force-stop the active training job.',
      detail: 'Choose "Keep Training" to leave the app open, or "Quit and Stop Training" to close the app and terminate the training process.',
      buttons: ['Keep Training', 'Quit and Stop Training'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    }).then((result) => {
      if (result.response !== 1) {
        return
      }

      allowUnsafeClose = true
      app.quit()
    })
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    log.info(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    log.info('Loading production build')
    mainWindow.loadFile(bundledRendererPath)
  }

  mainWindow.webContents.once('did-finish-load', () => {
    void validateBackendOnStartup()
    void checkForUpdatesOnStartup()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupRendererErrorLogging(): void {
  ipcMain.on('renderer:error', (_event, payload: RendererErrorPayload) => {
    const label = payload.isUnhandledRejection ? 'Renderer unhandled rejection' : 'Renderer error'
    log.error(`${label}: ${payload.message}`, {
      source: payload.source ?? payload.fileName,
      line: payload.line,
      column: payload.column
    })
    if (payload.stack) {
      log.error(payload.stack)
    }
  })
}

app.whenReady().then(() => {
  log.info('App ready')
  
  // Setup IPC handlers
  setupIpcHandlers()
  setupJobIpcHandlers()
  setupPresetIpcHandlers()
  setupLogsIpcHandlers()
  setupUpdateIpcHandlers()
  setupRendererErrorLogging()
  setupShellIntegrations()
  installApplicationMenu({
    isDev,
    checkForUpdates: () => {
      void showManualUpdateCheckDialog()
    },
    openLogsFolder: () => {
      if (!existsSync(logPath)) {
        mkdirSync(logPath, { recursive: true })
      }
      void openPathInShell(logPath)
    },
    openWorkspaceFolder: () => {
      const workspaceRoot = resolveWorkspaceRoot()
      if (!existsSync(workspaceRoot)) {
        mkdirSync(workspaceRoot, { recursive: true })
      }
      void openPathInShell(workspaceRoot)
    },
    openPresetsFolder: () => {
      const presetsPath = getUserPresetsPath()
      if (!existsSync(presetsPath)) {
        mkdirSync(presetsPath, { recursive: true })
      }
      void openPathInShell(presetsPath)
    },
    sendAppCommand,
    showAboutDialog: () => {
      void showAboutDialog()
    },
    openProjectSite: () => {
      void shell.openExternal(PROJECT_URL)
    },
    openIssueTracker: () => {
      void shell.openExternal(ISSUE_TRACKER_URL)
    },
    openNamGitHub: () => {
      void shell.openExternal(NAM_GITHUB_URL)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  getQueueManager().shutdownSync('app shutdown')
  stopTrainingPowerSaveBlocker()
  log.info('=== NAM-BOT SHUTTING DOWN ===')
})
