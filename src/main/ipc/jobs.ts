import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, copyFileSync, readFileSync, statSync } from 'fs'
import log from 'electron-log/main'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getQueueManager } from '../jobs/queueManager'
import { loadSettings } from '../persistence/settingsStore'
import { JobRuntimeState, JobSpec, defaultJobSpec, normalizeJobSpec } from '../types/jobs'
import {
  atomicWriteJsonSync,
  readJsonWithBackupSync,
  removeFileIfExistsSync
} from '../persistence/atomicFile'

const draftsPath = join(app.getPath('userData'), 'drafts.json')
const draftQueueTransactionPath = join(app.getPath('userData'), 'draft-queue-transaction.json')
const drafts: Map<string, JobSpec> = new Map()

interface DraftQueueTransaction {
  draftIds: string[]
  queuedJobIds: string[]
}

interface DraftBatchSource {
  kind: 'draft' | 'runtime'
  id: string
}

interface DraftBatchRequest {
  batchId: string
  batchSourceName: string
  drafts: unknown[]
  source: DraftBatchSource | null
}

type JobArtifactTarget = 'workspace' | 'output' | 'workspace-log' | 'run-log' | 'model'

function isJobArtifactTarget(value: unknown): value is JobArtifactTarget {
  return value === 'workspace'
    || value === 'output'
    || value === 'workspace-log'
    || value === 'run-log'
    || value === 'model'
}

function getJobArtifactPath(job: JobRuntimeState, target: JobArtifactTarget): string | null {
  if (target === 'workspace') {
    return job.workspaceDirectory ?? null
  }
  if (target === 'output') {
    return job.resolvedRunDirectory ?? job.outputRootDir ?? null
  }
  if (target === 'workspace-log') {
    return job.terminalLogPath ?? null
  }
  if (target === 'run-log') {
    return job.publishedTerminalLogPath ?? null
  }
  return job.publishedModelPath ?? null
}

async function openJobArtifactPath(targetPath: string): Promise<void> {
  if (!existsSync(targetPath)) {
    log.warn('Job artifact path does not exist:', targetPath)
    return
  }

  try {
    if (statSync(targetPath).isFile()) {
      shell.showItemInFolder(targetPath)
      return
    }
  } catch (error) {
    log.warn('Failed to inspect job artifact path:', targetPath, error)
  }

  const errorMessage = await shell.openPath(targetPath)
  if (errorMessage) {
    log.warn('Failed to open job artifact path:', targetPath, errorMessage)
  }
}

function cloneJobSpec(job: JobSpec): JobSpec {
  return JSON.parse(JSON.stringify(job)) as JobSpec
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function saveDraftCollection(collection: Map<string, JobSpec>): void {
  atomicWriteJsonSync(draftsPath, Array.from(collection.values()))
}

function saveDrafts(): void {
  saveDraftCollection(drafts)
}

function loadDrafts(): void {
  if (!existsSync(draftsPath)) {
    return
  }

  try {
    const parsed = readJsonWithBackupSync(draftsPath)
    if (!Array.isArray(parsed)) {
      return
    }
    drafts.clear()
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) {
        continue
      }
      const candidate = normalizeJobSpec(entry)
      if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        continue
      }
      drafts.set(candidate.id, candidate)
    }
  } catch (error) {
    log.error('Failed to load drafts:', error)
  }
}

function createDraftFromInput(input?: unknown): JobSpec {
  const now = new Date().toISOString()
  const normalized = normalizeJobSpec(input)
  const candidate = isRecord(input) ? input : {}
  return {
    ...JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>,
    ...normalized,
    id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : uuidv4(),
    name: normalized.name || 'New Job',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: now
  }
}

function parseDraftBatchRequest(input: unknown): DraftBatchRequest {
  if (!isRecord(input)
    || typeof input.batchId !== 'string'
    || input.batchId.trim().length === 0
    || typeof input.batchSourceName !== 'string'
    || !Array.isArray(input.drafts)
    || input.drafts.length === 0) {
    throw new Error('Invalid draft batch request.')
  }

  let source: DraftBatchSource | null = null
  if (isRecord(input.source)) {
    const kind = input.source.kind
    const id = input.source.id
    if ((kind === 'draft' || kind === 'runtime') && typeof id === 'string' && id.length > 0) {
      source = { kind, id }
    }
  }

  return {
    batchId: input.batchId,
    batchSourceName: input.batchSourceName.trim() || 'Batch Training',
    drafts: input.drafts,
    source
  }
}

function recoverDraftQueueTransaction(queueManager: ReturnType<typeof getQueueManager>): void {
  if (!existsSync(draftQueueTransactionPath)) {
    return
  }

  try {
    const parsed = readJsonWithBackupSync(draftQueueTransactionPath)
    if (!isRecord(parsed) || !Array.isArray(parsed.draftIds) || !Array.isArray(parsed.queuedJobIds)) {
      removeFileIfExistsSync(draftQueueTransactionPath)
      return
    }

    const draftIds = parsed.draftIds.filter((value): value is string => typeof value === 'string')
    const queuedJobIds = parsed.queuedJobIds.filter((value): value is string => typeof value === 'string')
    const durableQueueIds = new Set(queueManager.getQueue().map((runtime) => runtime.jobId))
    if (queuedJobIds.length > 0 && queuedJobIds.every((jobId) => durableQueueIds.has(jobId))) {
      for (const draftId of draftIds) {
        drafts.delete(draftId)
      }
      saveDrafts()
    }
    removeFileIfExistsSync(draftQueueTransactionPath)
  } catch (error) {
    log.error('Failed to recover draft-to-queue transaction:', error)
  }
}

function beginDraftQueueTransaction(transaction: DraftQueueTransaction): void {
  atomicWriteJsonSync(draftQueueTransactionPath, transaction)
}

function finishDraftQueueTransaction(): void {
  removeFileIfExistsSync(draftQueueTransactionPath)
}

function broadcastQueue(queue: JobRuntimeState[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('queue:updated', queue)
  })
}

function broadcastJob(runtime: JobRuntimeState): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('job:updated', runtime)
  })
}

export function setupJobIpcHandlers(): void {
  log.info('Setting up job IPC handlers')
  loadDrafts()

  const queueManager = getQueueManager()
  queueManager.setSettings(loadSettings())
  recoverDraftQueueTransaction(queueManager)

  queueManager.on('queueUpdated', (queue: JobRuntimeState[]) => {
    broadcastQueue(queue)
  })

  queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
    broadcastJob(runtime)
  })

  ipcMain.handle('jobs:createDraft', async (_event, input?: Partial<JobSpec>) => {
    const job = createDraftFromInput(input)
    drafts.set(job.id, job)
    saveDrafts()
    return job
  })

  ipcMain.handle('jobs:createDraftBatch', async (_event, input: unknown) => {
    const request = parseDraftBatchRequest(input)
    const existing = Array.from(drafts.values()).filter((draft) => draft.batchId === request.batchId)
    if (existing.length > 0) {
      const existingPaths = new Set(existing.map((draft) => draft.outputAudioPath))
      const requestedPaths = new Set(request.drafts.map((draft) => normalizeJobSpec(draft).outputAudioPath))
      if (existingPaths.size !== requestedPaths.size
        || Array.from(requestedPaths).some((outputPath) => !existingPaths.has(outputPath))) {
        throw new Error(`Batch ${request.batchId} already exists with different output files.`)
      }
      return existing
    }

    const created = request.drafts.map((draftInput) => createDraftFromInput({
      ...normalizeJobSpec(draftInput),
      batchId: request.batchId,
      batchSourceName: request.batchSourceName
    }))
    const nextDrafts = new Map(drafts)
    for (const draft of created) {
      nextDrafts.set(draft.id, draft)
    }
    if (request.source?.kind === 'draft') {
      const sourceDraft = nextDrafts.get(request.source.id)
      if (sourceDraft) {
        nextDrafts.set(sourceDraft.id, {
          ...sourceDraft,
          batchId: request.batchId,
          batchSourceName: request.batchSourceName,
          updatedAt: new Date().toISOString()
        })
      }
    }

    saveDraftCollection(nextDrafts)
    drafts.clear()
    for (const [draftId, draft] of nextDrafts) {
      drafts.set(draftId, draft)
    }

    if (request.source?.kind === 'runtime') {
      try {
        queueManager.tagQueueItemBatch(
          request.source.id,
          request.batchId,
          request.batchSourceName
        )
      } catch (error) {
        log.error('Batch drafts were saved, but tagging the runtime source failed:', error)
      }
    }
    return created
  })

  ipcMain.handle('jobs:saveDraft', async (_event, job: JobSpec) => {
    const updated = {
      ...normalizeJobSpec(job),
      id: job.id,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString()
    }
    drafts.set(updated.id, updated)
    saveDrafts()
    return updated
  })

  ipcMain.handle('jobs:deleteDraft', async (_event, jobId: string) => {
    drafts.delete(jobId)
    saveDrafts()
  })

  ipcMain.handle('jobs:listDrafts', async () => {
    return Array.from(drafts.values())
  })

  ipcMain.handle('jobs:reorderDrafts', async (_event, draftIds: string[]) => {
    const orderedDrafts: JobSpec[] = []
    for (const draftId of draftIds) {
      const draft = drafts.get(draftId)
      if (draft) {
        orderedDrafts.push(draft)
      }
    }

    for (const draft of drafts.values()) {
      if (!draftIds.includes(draft.id)) {
        orderedDrafts.push(draft)
      }
    }

    drafts.clear()
    for (const draft of orderedDrafts) {
      drafts.set(draft.id, draft)
    }
    saveDrafts()
  })

  ipcMain.handle('jobs:enqueue', async (_event, draftId: string) => {
    const draft = drafts.get(draftId)
    if (!draft) {
      throw new Error(`Cannot enqueue unknown job: ${draftId}`)
    }

    const frozenSpec = cloneJobSpec(draft)
    const taskId = uuidv4()
    frozenSpec.id = taskId
    frozenSpec.updatedAt = new Date().toISOString()
    await queueManager.validateJobCanTrain(frozenSpec)
    beginDraftQueueTransaction({ draftIds: [draftId], queuedJobIds: [frozenSpec.id] })
    try {
      queueManager.addToQueue(frozenSpec)
    } catch (error) {
      finishDraftQueueTransaction()
      throw error
    }
    drafts.delete(draftId)
    try {
      saveDrafts()
      finishDraftQueueTransaction()
    } catch (error) {
      log.error('Queue item is durable; draft cleanup will be recovered on restart:', error)
    }
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:enqueueMany', async (_event, draftIds: string[]) => {
    const specsToEnqueue: Array<{ draftId: string; spec: JobSpec }> = []
    for (const draftId of draftIds) {
      const draft = drafts.get(draftId)
      if (!draft) {
        continue
      }
      const frozenSpec = cloneJobSpec(draft)
      const taskId = uuidv4()
      frozenSpec.id = taskId
      frozenSpec.updatedAt = new Date().toISOString()
      specsToEnqueue.push({ draftId, spec: frozenSpec })
    }

    if (specsToEnqueue.length === 0) {
      throw new Error('No valid jobs were provided to enqueueMany')
    }

    for (const entry of specsToEnqueue) {
      await queueManager.validateJobCanTrain(entry.spec)
    }

    beginDraftQueueTransaction({
      draftIds: specsToEnqueue.map((entry) => entry.draftId),
      queuedJobIds: specsToEnqueue.map((entry) => entry.spec.id)
    })
    try {
      queueManager.addManyToQueue(specsToEnqueue.map((entry) => entry.spec))
    } catch (error) {
      finishDraftQueueTransaction()
      throw error
    }
    for (const entry of specsToEnqueue) {
      drafts.delete(entry.draftId)
    }
    try {
      saveDrafts()
      finishDraftQueueTransaction()
    } catch (error) {
      log.error('Queued jobs are durable; draft cleanup will be recovered on restart:', error)
    }
    void queueManager.startQueue()
  })

  ipcMain.handle('jobs:unqueue', async (_event, jobId: string) => {
    const restored = queueManager.unqueueJob(jobId)
    if (restored) {
      drafts.set(restored.id, restored)
      saveDrafts()
    }
    return restored
  })

  ipcMain.handle('jobs:unqueueAll', async () => {
    const restoredDrafts = queueManager.unqueueAll()
    for (const restored of restoredDrafts) {
      drafts.set(restored.id, restored)
    }
    saveDrafts()
    return restoredDrafts
  })

  ipcMain.handle('jobs:cancel', async (_event, jobId: string) => {
    await queueManager.cancelJob(jobId)
  })

  ipcMain.handle('jobs:forceStop', async (_event, jobId: string) => {
    await queueManager.forceStopJob(jobId)
  })

  ipcMain.handle('jobs:retry', async (_event, jobId: string) => {
    const runtime = queueManager.retryJob(jobId)
    if (runtime) {
      void queueManager.startQueue()
    }
    return runtime
  })

  ipcMain.handle('jobs:clearFinished', async () => {
    queueManager.clearFinished()
  })

  ipcMain.handle('jobs:clearItem', async (_event, jobId: string) => {
    queueManager.removeQueueItem(jobId)
  })

  ipcMain.handle('jobs:tagBatchSource', async (_event, jobId: string, batchId: string, batchSourceName: string) => {
    return queueManager.tagQueueItemBatch(jobId, batchId, batchSourceName)
  })

  ipcMain.handle('jobs:duplicate', async (_event, jobId: string) => {
    const job = drafts.get(jobId)
    if (!job) {
      return null
    }
    const newJob = {
      ...cloneJobSpec(job),
      id: uuidv4(),
      name: `${job.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    drafts.set(newJob.id, newJob)
    saveDrafts()
    return newJob
  })
  ipcMain.handle('jobs:reorder', async (_event, jobIds: string[]) => {
    queueManager.reorderQueue(jobIds)
  })

  ipcMain.handle('jobs:listQueue', async () => {
    return queueManager.getQueue()
  })

  ipcMain.handle('jobs:getRuntime', async (_event, jobId: string) => {
    return queueManager.getQueue().find((job) => job.jobId === jobId) || null
  })

  ipcMain.handle('jobs:openResultFolder', async (_event, jobId: string) => {
    const job = queueManager.getQueue().find((entry) => entry.jobId === jobId)
    const targetPath = job?.resolvedRunDirectory || job?.outputRootDir || job?.workspaceDirectory
    if (targetPath) {
      shell.openPath(targetPath)
    }
  })

  ipcMain.handle('jobs:openArtifact', async (_event, jobId: string, target: unknown) => {
    if (!isJobArtifactTarget(target)) {
      return
    }

    const job = queueManager.getQueue().find((entry) => entry.jobId === jobId)
    if (!job) {
      return
    }

    const targetPath = getJobArtifactPath(job, target)
    if (targetPath) {
      await openJobArtifactPath(targetPath)
    }
  })

  ipcMain.handle('jobs:chooseAudioFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Audio File',
      properties: ['openFile'],
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'aiff', 'aif'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('jobs:getDefaultInputAudioPath', async () => {
    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'v3_0_0.wav')
      : join(app.getAppPath(), 'resources', 'v3_0_0.wav')
    if (existsSync(resourcesPath)) {
      return resourcesPath
    }
    log.warn('Default input audio not found at:', resourcesPath)
    return null
  })

  ipcMain.handle('jobs:saveDefaultAudioTo', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save Default Training Signal',
      defaultPath: 'v3_0_0.wav',
      filters: [{ name: 'WAV Audio', extensions: ['wav'] }]
    })
    if (result.canceled || !result.filePath) return null
    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'v3_0_0.wav')
      : join(app.getAppPath(), 'resources', 'v3_0_0.wav')
    copyFileSync(resourcesPath, result.filePath)
    log.info('Default audio saved to:', result.filePath)
    return result.filePath
  })

  log.info('Job IPC handlers registered')
}
