import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type { AppCommand } from '../shared/appShell'
import type { UpdateStatus } from '../shared/update'

export interface NamBotApi {
  platform: string
  settings: {
    get: () => Promise<unknown>
    save: (settings: unknown) => Promise<void>
    validate: () => Promise<unknown>
    detectConda: () => Promise<unknown>
    getAcceleratorDiagnostics: () => Promise<unknown>
    chooseCondaPath: () => Promise<string | null>
    chooseDirectory: () => Promise<string | null>
    choosePythonPath: () => Promise<string | null>
  }
  jobs: {
    createDraft: (input?: unknown) => Promise<unknown>
    saveDraft: (job: unknown) => Promise<unknown>
    deleteDraft: (jobId: string) => Promise<void>
    listDrafts: () => Promise<unknown[]>
    enqueue: (jobId: string) => Promise<void>
    enqueueMany: (jobIds: string[]) => Promise<void>
    reorder: (jobIds: string[]) => Promise<void>
    unqueue: (jobId: string) => Promise<unknown>
    unqueueAll: () => Promise<unknown[]>
    cancel: (jobId: string) => Promise<void>
    forceStop: (jobId: string) => Promise<void>
    retry: (jobId: string) => Promise<unknown>
    clearFinished: () => Promise<void>
    clearItem: (jobId: string) => Promise<void>
    duplicate: (jobId: string) => Promise<unknown>
    listQueue: () => Promise<unknown[]>
    getRuntime: (jobId: string) => Promise<unknown | null>
    openResultFolder: (jobId: string) => Promise<void>
    chooseAudioFile: () => Promise<string | null>
    getDefaultInputAudioPath: () => Promise<string | null>
    saveDefaultAudioTo: () => Promise<string | null>
    getPathForFile: (file: File) => string
  }
  presets: {
    list: () => Promise<unknown[]>
    save: (preset: unknown) => Promise<unknown>
    delete: (presetId: string) => Promise<void>
    exportPreset: (preset: unknown) => Promise<string | null>
    importPreset: () => Promise<unknown | null>
  }
  logs: {
    getTerminal: (jobId: string) => Promise<string>
    getDiagnostics: () => Promise<string>
  }
  updates: {
    getStatus: () => Promise<UpdateStatus>
    openLatestRelease: () => Promise<void>
    openLatestChangelog: () => Promise<void>
  }
  events: {
    onQueueUpdated: (callback: (queue: unknown[]) => void) => () => void
    onJobUpdated: (callback: (state: unknown) => void) => () => void
    onBackendValidationUpdated: (callback: (summary: unknown) => void) => () => void
    onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void
    onAppCommand: (callback: (command: AppCommand) => void) => () => void
  }
}

const api: NamBotApi = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
    validate: () => ipcRenderer.invoke('settings:validate'),
    detectConda: () => ipcRenderer.invoke('settings:detectConda'),
    getAcceleratorDiagnostics: () => ipcRenderer.invoke('settings:getAcceleratorDiagnostics'),
    chooseCondaPath: () => ipcRenderer.invoke('settings:chooseCondaPath'),
    chooseDirectory: () => ipcRenderer.invoke('settings:chooseDirectory'),
    choosePythonPath: () => ipcRenderer.invoke('settings:choosePythonPath')
  },
  jobs: {
    createDraft: (input) => ipcRenderer.invoke('jobs:createDraft', input),
    saveDraft: (job) => ipcRenderer.invoke('jobs:saveDraft', job),
    deleteDraft: (jobId) => ipcRenderer.invoke('jobs:deleteDraft', jobId),
    listDrafts: () => ipcRenderer.invoke('jobs:listDrafts'),
    enqueue: (jobId) => ipcRenderer.invoke('jobs:enqueue', jobId),
    enqueueMany: (jobIds) => ipcRenderer.invoke('jobs:enqueueMany', jobIds),
    reorder: (jobIds) => ipcRenderer.invoke('jobs:reorder', jobIds),
    unqueue: (jobId) => ipcRenderer.invoke('jobs:unqueue', jobId),
    unqueueAll: () => ipcRenderer.invoke('jobs:unqueueAll'),
    cancel: (jobId) => ipcRenderer.invoke('jobs:cancel', jobId),
    forceStop: (jobId) => ipcRenderer.invoke('jobs:forceStop', jobId),
    retry: (jobId) => ipcRenderer.invoke('jobs:retry', jobId),
    clearFinished: () => ipcRenderer.invoke('jobs:clearFinished'),
    clearItem: (jobId) => ipcRenderer.invoke('jobs:clearItem', jobId),
    duplicate: (jobId) => ipcRenderer.invoke('jobs:duplicate', jobId),
    listQueue: () => ipcRenderer.invoke('jobs:listQueue'),
    getRuntime: (jobId) => ipcRenderer.invoke('jobs:getRuntime', jobId),
    openResultFolder: (jobId) => ipcRenderer.invoke('jobs:openResultFolder', jobId),
    chooseAudioFile: () => ipcRenderer.invoke('jobs:chooseAudioFile'),
    getDefaultInputAudioPath: () => ipcRenderer.invoke('jobs:getDefaultInputAudioPath'),
    saveDefaultAudioTo: () => ipcRenderer.invoke('jobs:saveDefaultAudioTo'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  presets: {
    list: () => ipcRenderer.invoke('presets:list'),
    save: (preset) => ipcRenderer.invoke('presets:save', preset),
    delete: (presetId) => ipcRenderer.invoke('presets:delete', presetId),
    exportPreset: (preset) => ipcRenderer.invoke('presets:export', preset),
    importPreset: () => ipcRenderer.invoke('presets:import')
  },
  logs: {
    getTerminal: (jobId) => ipcRenderer.invoke('logs:getTerminal', jobId),
    getDiagnostics: () => ipcRenderer.invoke('logs:getDiagnostics')
  },
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:getStatus'),
    openLatestRelease: () => ipcRenderer.invoke('updates:openLatestRelease'),
    openLatestChangelog: () => ipcRenderer.invoke('updates:openLatestChangelog')
  },
  events: {
    onQueueUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, queue: unknown[]) => callback(queue)
      ipcRenderer.on('queue:updated', handler)
      return () => ipcRenderer.removeListener('queue:updated', handler)
    },
    onJobUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
      ipcRenderer.on('job:updated', handler)
      return () => ipcRenderer.removeListener('job:updated', handler)
    },
    onBackendValidationUpdated: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, summary: unknown) => callback(summary)
      ipcRenderer.on('backend:validationUpdated', handler)
      return () => ipcRenderer.removeListener('backend:validationUpdated', handler)
    },
    onUpdateStatusChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
      ipcRenderer.on('updates:statusChanged', handler)
      return () => ipcRenderer.removeListener('updates:statusChanged', handler)
    },
    onAppCommand: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) => callback(command)
      ipcRenderer.on('app:command', handler)
      return () => ipcRenderer.removeListener('app:command', handler)
    }
  }
}

contextBridge.exposeInMainWorld('namBot', api)

type RendererErrorPayload = {
  message: string
  stack?: string
  source?: string
  fileName?: string
  line?: number
  column?: number
  isUnhandledRejection?: boolean
}

const reportRendererError = (payload: RendererErrorPayload) => {
  ipcRenderer.send('renderer:error', payload)
}

window.addEventListener('error', (event) => {
  reportRendererError({
    message: event.message ?? 'Unknown renderer error',
    stack: event.error?.stack,
    source: event.filename,
    fileName: event.filename,
    line: event.lineno,
    column: event.colno,
    isUnhandledRejection: false
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection')
  const stack = reason instanceof Error ? reason.stack : undefined
  reportRendererError({
    message,
    stack,
    isUnhandledRejection: true
  })
})
