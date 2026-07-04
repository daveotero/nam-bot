import { EventEmitter } from 'events'
import { app, shell } from 'electron'
import { basename, dirname, extname, join } from 'path'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'fs'
import log from 'electron-log/main'
import { v4 as uuidv4 } from 'uuid'
import {
  analyzeNamLatency,
  compareVersions,
  inspectTorchRuntime,
  runNamFull,
  TorchRuntimeSummary,
  TrainingProcessController
} from '../backend/adapter'
import { buildJobConfigs } from '../config/configBuilder'
import { getTrainingPresetById } from '../persistence/presetStore'
import {
  JobCheckpointSummary,
  JobDeviceSummary,
  JobLatencyAlignmentStatus,
  JobLatencyAlignmentSummary,
  JobPackedSubmodelCheckpointSummary,
  JobRuntimeState,
  JobSpec,
  JobStatus,
  JobTerminalProgress,
  MIN_A2_NAM_VERSION,
  buildNamMetadataPatch,
  defaultJobSpec,
  isA2TrainingPreset,
  normalizeJobSpec,
  TrainingPresetFile
} from '../types/jobs'
import { AppSettings } from '../types'
import {
  buildUpdatedNamModelMetadata,
  hasNamModelMetadataUpdates,
  type ConfirmedNamTrainingMetadata,
  type NamExportDateMetadata
} from './namModelMetadata'
import { selectOutputRunDirectory } from './runDirectoryResolver'

const userDataPath = app.getPath('userData')
const queuePath = join(userDataPath, 'queue.json')
const workspacesPath = join(userDataPath, 'workspaces')
const ACTIVE_JOB_STATUSES: JobStatus[] = ['preparing', 'running', 'stopping']
const QUEUED_JOB_STATUSES: JobStatus[] = ['queued', 'validating']
const FINISHED_JOB_STATUSES: JobStatus[] = ['succeeded', 'failed', 'canceled']
const NUMERIC_TOKEN_PATTERN = '[+-]?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?'
const BEST_CHECKPOINT_PATTERN = new RegExp(
  `^(\\d{4})_(\\d+)_(${NUMERIC_TOKEN_PATTERN})_(${NUMERIC_TOKEN_PATTERN})\\.ckpt$`,
  'i'
)
const GUI_BEST_CHECKPOINT_PATTERN = new RegExp(
  `^checkpoint_best_(\\d{4})_(\\d+)_(${NUMERIC_TOKEN_PATTERN})_(${NUMERIC_TOKEN_PATTERN})\\.ckpt$`,
  'i'
)
const LIGHTNING_BEST_CHECKPOINT_PATTERN = new RegExp(
  `^epoch=(\\d{4})_step=(\\d+)_ESR=(${NUMERIC_TOKEN_PATTERN})_MSE=(${NUMERIC_TOKEN_PATTERN})\\.ckpt$`,
  'i'
)
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const OSC_PATTERN = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001a\u007f]/g
const LATENCY_ALIGNMENT_STATUSES: JobLatencyAlignmentStatus[] = ['manual', 'auto_pending', 'auto_applied', 'auto_skipped', 'auto_failed']
type RunJobResult = 'completed' | 'blocked'

interface KnownNamVersion {
  settingsKey: string
  version: string | null
}

class A2DiagnosticsPendingError extends Error {
  constructor() {
    super(
      `A2 training requires neural-amp-modeler ${MIN_A2_NAM_VERSION} or newer, but NAM-BOT has not confirmed the installed NAM version yet. Open Diagnostics or click Re-check All to verify this environment before training starts.`
    )
    this.name = 'A2DiagnosticsPendingError'
  }
}

interface TranscriptAccumulator {
  currentLine: string
}

interface ParsedEpochProgress {
  epochIndex: number
  currentEpoch: number
  totalEpochs: number | null
  currentBatch: number | null
  totalBatches: number | null
}

function formatLatencyAnalysisVersion(inputVersion: string | null): string {
  return inputVersion ? ` using NAM input ${inputVersion}` : ''
}

function normalizeLatencySamples(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function getManualLatencySamples(jobSpec: JobSpec): number {
  return normalizeLatencySamples(jobSpec.trainingOverrides.latencySamples) ?? 0
}

function formatLatencySamples(samples: number): string {
  return `${samples} sample${Math.abs(samples) === 1 ? '' : 's'}`
}

function createInitialLatencyAlignment(jobSpec: JobSpec): JobLatencyAlignmentSummary {
  if (jobSpec.trainingOverrides.latencyMode === 'auto') {
    return {
      mode: 'auto',
      status: 'auto_pending',
      delaySamples: null,
      inputVersion: null,
      message: 'Waiting to run NAM latency analyzer.'
    }
  }

  const delaySamples = getManualLatencySamples(jobSpec)
  return {
    mode: 'manual',
    status: 'manual',
    delaySamples,
    inputVersion: null,
    message: `Manual delay: ${formatLatencySamples(delaySamples)}.`
  }
}

function getPresetLockedLatencySamples(preset: TrainingPresetFile): number | null {
  const dataCommon = isRecord(preset.expert.data) && isRecord(preset.expert.data.common)
    ? preset.expert.data.common
    : null
  return normalizeLatencySamples(dataCommon?.delay)
}

function buildBackendSettingsKey(settings: AppSettings): string {
  return JSON.stringify({
    condaExecutablePath: settings.condaExecutablePath,
    backendMode: settings.backendMode,
    environmentName: settings.environmentName,
    environmentPrefixPath: settings.environmentPrefixPath,
    pythonExecutablePath: settings.pythonExecutablePath
  })
}

function cloneJobSpec(jobSpec: JobSpec): JobSpec {
  return JSON.parse(JSON.stringify(jobSpec)) as JobSpec
}

function resolveWorkspaceRoot(settings: AppSettings | null): string {
  const configuredRoot = settings?.defaultWorkspaceRoot?.trim()
  if (configuredRoot && configuredRoot.length > 0) {
    return configuredRoot
  }
  return workspacesPath
}

function buildDefaultSpecTemplate(jobId: string, jobName: string, outputRootDir: string): JobSpec {
  return {
    ...JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>,
    id: jobId,
    name: jobName,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    outputRootDir
  }
}

function normalizePersistedJobSpec(value: unknown, fallbackId: string, fallbackName: string, fallbackOutputRootDir: string): JobSpec {
  if (typeof value !== 'object' || value === null) {
    return buildDefaultSpecTemplate(fallbackId, fallbackName, fallbackOutputRootDir)
  }

  const candidate = value as Record<string, unknown>
  const fallback = buildDefaultSpecTemplate(fallbackId, fallbackName, fallbackOutputRootDir)
  const normalized = normalizeJobSpec(candidate)
  return {
    ...fallback,
    ...normalized,
    id: typeof candidate.id === 'string' ? candidate.id : fallback.id,
    name: typeof candidate.name === 'string' ? candidate.name : normalized.name,
    outputRootDir: typeof candidate.outputRootDir === 'string' ? candidate.outputRootDir : fallback.outputRootDir
  }
}

function sanitizeFilenameStem(jobName: string, jobId: string): string {
  const fallback = `job-${jobId.slice(0, 8)}`
  const sanitized = jobName
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
  return sanitized || fallback
}

function buildPublishedModelStem(jobSpec: JobSpec): string {
  const segments = [jobSpec.name.trim()]

  if (jobSpec.appendPresetToModelFileName && jobSpec.presetId) {
    const presetName = getTrainingPresetById(jobSpec.presetId).name.trim()
    if (presetName) {
      segments.push(presetName)
    }
  }

  return sanitizeFilenameStem(segments.join(' - '), jobSpec.id)
}

function buildPublishedModelPath(runtime: JobRuntimeState, modelPath: string): string {
  const segments = [buildPublishedModelStem(runtime.frozenJob)]
  const bestValidationEsr = runtime.checkpointSummary?.bestValidationEsr

  if (runtime.frozenJob.appendEsrToModelFileName && bestValidationEsr != null) {
    segments.push(`ESR ${bestValidationEsr.toFixed(4)}`)
  }

  return join(dirname(modelPath), `${sanitizeFilenameStem(segments.join(' - '), runtime.frozenJob.id)}.nam`)
}

function buildUniqueSiblingPath(targetPath: string): string {
  if (!existsSync(targetPath)) {
    return targetPath
  }

  const targetDirectory = dirname(targetPath)
  const extension = extname(targetPath)
  const baseName = basename(targetPath, extension)
  for (let index = 2; index < 1000; index += 1) {
    const candidatePath = join(targetDirectory, `${baseName} - ${index}${extension}`)
    if (!existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return join(targetDirectory, `${baseName} - ${Date.now()}${extension}`)
}

function stripTerminalControlSequences(value: string): string {
  return value.replace(OSC_PATTERN, '').replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '')
}

function parseNumericToken(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isA2DiagnosticsPendingError(value: unknown): value is A2DiagnosticsPendingError {
  return value instanceof A2DiagnosticsPendingError
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function buildNamExportDate(date: Date): NamExportDateMetadata {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds()
  }
}

function deriveTrainedEpochs(runtime: JobRuntimeState): number | null {
  const latestCheckpointEpoch = runtime.checkpointSummary?.latestCheckpointEpoch
  if (typeof latestCheckpointEpoch === 'number' && Number.isInteger(latestCheckpointEpoch) && latestCheckpointEpoch >= 0) {
    return latestCheckpointEpoch + 1
  }

  if (isPositiveInteger(runtime.currentEpoch)) {
    return runtime.currentEpoch
  }

  if (runtime.status === 'succeeded' && isPositiveInteger(runtime.plannedEpochs)) {
    return runtime.plannedEpochs
  }

  return null
}

function readConfirmedTrainingMetadata(runtime: JobRuntimeState): ConfirmedNamTrainingMetadata {
  const trainingMetadata: ConfirmedNamTrainingMetadata = {}
  const bestValidationEsr = runtime.checkpointSummary?.bestValidationEsr
  if (bestValidationEsr != null) {
    trainingMetadata.validationEsr = bestValidationEsr
  }

  const packedSubmodels = runtime.checkpointSummary?.packedSubmodels
  if (packedSubmodels && packedSubmodels.length > 0) {
    trainingMetadata.packedSubmodels = packedSubmodels.map((submodel) => ({
      submodelIndex: submodel.submodelIndex,
      submodelName: submodel.submodelName ?? null,
      validationEsr: submodel.bestValidationEsr ?? null,
      epoch: submodel.epoch ?? null,
      step: submodel.step ?? null
    }))
  }

  const dataConfigPath = runtime.generatedConfigPaths?.dataConfig
  if (!dataConfigPath || !existsSync(dataConfigPath)) {
    return trainingMetadata
  }

  try {
    const parsed = JSON.parse(readFileSync(dataConfigPath, 'utf-8')) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.common)) {
      const trainedEpochs = deriveTrainedEpochs(runtime)
      if (trainedEpochs != null) {
        trainingMetadata.trainedEpochs = trainedEpochs
      }

      const presetName = getTrainingPresetById(runtime.frozenJob.presetId).name.trim()
      if (presetName) {
        trainingMetadata.presetName = presetName
      }

      return trainingMetadata
    }

    const delay = parsed.common.delay
    if (typeof delay === 'number' && Number.isFinite(delay)) {
      if (runtime.frozenJob.trainingOverrides.latencyMode === 'auto') {
        trainingMetadata.autoLatency = delay
      } else {
        trainingMetadata.manualLatency = delay
      }
    }
  } catch (error) {
    log.warn('Failed to read generated data config for NAM training metadata:', error)
  }

  const trainedEpochs = deriveTrainedEpochs(runtime)
  if (trainedEpochs != null) {
    trainingMetadata.trainedEpochs = trainedEpochs
  }

  const presetName = getTrainingPresetById(runtime.frozenJob.presetId).name.trim()
  if (presetName) {
    trainingMetadata.presetName = presetName
  }

  return trainingMetadata
}

function buildStructuredProgressLine(progress: JobTerminalProgress): string | null {
  if (progress.currentEpoch && progress.totalEpochs && progress.currentBatch && progress.totalBatches) {
    return `Epoch ${progress.currentEpoch} of ${progress.totalEpochs} - batch ${progress.currentBatch}/${progress.totalBatches}`
  }
  if (progress.currentEpoch && progress.totalEpochs) {
    return `Epoch ${progress.currentEpoch} of ${progress.totalEpochs}`
  }
  if (progress.currentBatch && progress.totalBatches) {
    return `Batch ${progress.currentBatch}/${progress.totalBatches}`
  }
  return null
}

function computeOverallProgressPercent(progress: JobTerminalProgress): number | null {
  if (progress.currentEpoch && progress.totalEpochs && progress.currentBatch && progress.totalBatches && progress.totalBatches > 0) {
    const completedEpochs = Math.max(0, progress.currentEpoch - 1)
    const epochFraction = progress.currentBatch / progress.totalBatches
    return Number((((completedEpochs + epochFraction) / progress.totalEpochs) * 100).toFixed(1))
  }
  if (progress.currentEpoch && progress.totalEpochs && progress.totalEpochs > 0) {
    return Number(((Math.max(0, progress.currentEpoch - 1) / progress.totalEpochs) * 100).toFixed(1))
  }
  if (progress.currentBatch && progress.totalBatches && progress.totalBatches > 0) {
    return Number(((progress.currentBatch / progress.totalBatches) * 100).toFixed(1))
  }
  return null
}

function parseEpochProgressLine(trimmed: string, plannedEpochs: number | null | undefined): ParsedEpochProgress | null {
  const epochProgressMatch = /Epoch\s+(\d+)(?:\/(\d+))?.*?(\d+)\/(\d+)(?![\d/])/i.exec(trimmed)
  if (epochProgressMatch) {
    const epochIndex = parseInt(epochProgressMatch[1], 10)
    const totalEpochIndex = epochProgressMatch[2] ? parseInt(epochProgressMatch[2], 10) : null
    return {
      epochIndex,
      currentEpoch: epochIndex + 1,
      totalEpochs: plannedEpochs ?? (totalEpochIndex != null ? totalEpochIndex + 1 : null),
      currentBatch: parseInt(epochProgressMatch[3], 10),
      totalBatches: parseInt(epochProgressMatch[4], 10)
    }
  }

  const epochOnlyMatch = /Epoch\s+(\d+)(?:\/(\d+))?/i.exec(trimmed)
  if (!epochOnlyMatch) {
    return null
  }

  const epochIndex = parseInt(epochOnlyMatch[1], 10)
  const totalEpochIndex = epochOnlyMatch[2] ? parseInt(epochOnlyMatch[2], 10) : null
  return {
    epochIndex,
    currentEpoch: epochIndex + 1,
    totalEpochs: plannedEpochs ?? (totalEpochIndex != null ? totalEpochIndex + 1 : null),
    currentBatch: null,
    totalBatches: null
  }
}

function chooseAccelerator(torchRuntime: TorchRuntimeSummary | null): string {
  if (torchRuntime?.cudaAvailable) {
    return 'gpu'
  }
  if (torchRuntime?.mpsAvailable) {
    return 'mps'
  }
  if (torchRuntime) {
    return 'cpu'
  }
  return 'auto'
}

function buildDeviceSummary(
  torchRuntime: TorchRuntimeSummary | null,
  acceleratorRequested: string
): JobDeviceSummary {
  return {
    torchVersion: torchRuntime?.torchVersion ?? null,
    acceleratorRequested,
    acceleratorUsed: null,
    cudaAvailable: torchRuntime?.cudaAvailable ?? null,
    cudaDeviceCount: torchRuntime?.cudaDeviceCount ?? null,
    deviceName: torchRuntime?.deviceName ?? null,
    startupMessage: null
  }
}

function parseCheckpointFile(
  filePath: string
): {
  epoch: number | null
  esr: number | null
  mse: number | null
} | null {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop()
  if (!fileName) {
    return null
  }

  const bestMatch =
    BEST_CHECKPOINT_PATTERN.exec(fileName)
    ?? GUI_BEST_CHECKPOINT_PATTERN.exec(fileName)
    ?? LIGHTNING_BEST_CHECKPOINT_PATTERN.exec(fileName)
  if (bestMatch) {
    return {
      epoch: parseInt(bestMatch[1], 10),
      esr: parseNumericToken(bestMatch[3]),
      mse: parseNumericToken(bestMatch[4])
    }
  }

  const epochMatch = /^checkpoint_epoch_(?:epoch=)?(\d{4})\.ckpt$/i.exec(fileName)
  if (epochMatch) {
    return {
      epoch: parseInt(epochMatch[1], 10),
      esr: null,
      mse: null
    }
  }

  const lastMatch = /^checkpoint_last_(\d{4})_(\d+)\.ckpt$/i.exec(fileName)
  if (lastMatch) {
    return {
      epoch: parseInt(lastMatch[1], 10),
      esr: null,
      mse: null
    }
  }

  return null
}

function readPackedBestSubmodels(outputRunDirectory: string): JobPackedSubmodelCheckpointSummary[] {
  const metadataPath = join(outputRunDirectory, 'packed_best.json')
  if (!existsSync(metadataPath)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, 'utf-8')) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.submodels)) {
      return []
    }

    return parsed.submodels.flatMap((entry): JobPackedSubmodelCheckpointSummary[] => {
      if (!isRecord(entry)) {
        return []
      }

      const submodelIndex = typeof entry.submodel_index === 'number' && Number.isInteger(entry.submodel_index)
        ? entry.submodel_index
        : null
      if (submodelIndex == null) {
        return []
      }

      return [{
        submodelIndex,
        submodelName: typeof entry.submodel_name === 'string' ? entry.submodel_name : null,
        bestValidationEsr: typeof entry.best_metric === 'number' && Number.isFinite(entry.best_metric) ? entry.best_metric : null,
        epoch: typeof entry.epoch === 'number' && Number.isFinite(entry.epoch) ? entry.epoch : null,
        step: typeof entry.step === 'number' && Number.isFinite(entry.step) ? entry.step : null,
        checkpointPath: typeof entry.checkpoint_path === 'string' ? entry.checkpoint_path : null
      }]
    })
  } catch (error) {
    log.warn('Failed to read packed A2 checkpoint metadata:', metadataPath, error)
    return []
  }
}

function getSubmodelChannelCount(submodel: JobPackedSubmodelCheckpointSummary): number | null {
  const match = /^channels_(\d+)$/i.exec(submodel.submodelName ?? '')
  if (!match) {
    return null
  }
  const channelCount = Number(match[1])
  return Number.isFinite(channelCount) ? channelCount : null
}

function selectPrimaryPackedSubmodel(
  submodels: JobPackedSubmodelCheckpointSummary[]
): JobPackedSubmodelCheckpointSummary | null {
  if (submodels.length === 0) {
    return null
  }

  const metricSubmodels = submodels.filter((submodel) => submodel.bestValidationEsr != null)
  const candidates = metricSubmodels.length > 0 ? metricSubmodels : submodels

  return [...candidates].sort((left, right) => {
    const leftChannels = getSubmodelChannelCount(left)
    const rightChannels = getSubmodelChannelCount(right)
    if (leftChannels != null && rightChannels != null && leftChannels !== rightChannels) {
      return rightChannels - leftChannels
    }
    if (leftChannels != null && rightChannels == null) {
      return -1
    }
    if (leftChannels == null && rightChannels != null) {
      return 1
    }
    return right.submodelIndex - left.submodelIndex
  })[0]
}

function walkTrainingArtifacts(rootDir: string, depth: number): string[] {
  if (!existsSync(rootDir) || depth < 0) {
    return []
  }

  const files: string[] = []
  const entries = readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkTrainingArtifacts(fullPath, depth - 1))
      continue
    }
    files.push(fullPath)
  }
  return files
}

function getFileModifiedAt(filePath: string): number {
  return statSync(filePath).mtimeMs
}

function buildCheckpointSummary(
  outputRunDirectory: string,
  startedAt: string | undefined,
  usesPackedA2: boolean
): JobCheckpointSummary | null {
  if (!existsSync(outputRunDirectory)) {
    return null
  }

  const startedAtMs = startedAt ? Date.parse(startedAt) : 0
  const files = walkTrainingArtifacts(outputRunDirectory, 4).filter((filePath) => {
    try {
      return getFileModifiedAt(filePath) >= startedAtMs - 15_000
    } catch (error) {
      log.warn('Failed to stat training artifact:', filePath, error)
      return false
    }
  })

  let checkpointCount = 0
  let latestCheckpointEpoch: number | null = null
  let bestValidationEsr: number | null = null
  let bestValidationMse: number | null = null
  let bestCheckpointPath: string | null = null
  let modelFilePath: string | null = null
  let comparisonPlotPath: string | null = null
  const packedSubmodels = readPackedBestSubmodels(outputRunDirectory)
  const primaryPackedSubmodel = usesPackedA2 ? selectPrimaryPackedSubmodel(packedSubmodels) : null

  for (const filePath of files) {
    const normalized = filePath.toLowerCase()
    if (normalized.endsWith('.nam')) {
      modelFilePath = filePath
    } else if (normalized.endsWith('comparison.png')) {
      comparisonPlotPath = filePath
    }

    if (!normalized.endsWith('.ckpt')) {
      continue
    }

    checkpointCount += 1
    const parsed = parseCheckpointFile(filePath)
    if (!parsed) {
      continue
    }

    if (parsed.epoch != null) {
      latestCheckpointEpoch = latestCheckpointEpoch == null ? parsed.epoch : Math.max(latestCheckpointEpoch, parsed.epoch)
    }

    if (parsed.esr != null && (bestValidationEsr == null || parsed.esr < bestValidationEsr)) {
      bestValidationEsr = parsed.esr
      bestValidationMse = parsed.mse
      bestCheckpointPath = filePath
    }
  }

  if (checkpointCount === 0 && packedSubmodels.length === 0 && !modelFilePath && !comparisonPlotPath) {
    return null
  }

  return {
    checkpointCount,
    latestCheckpointEpoch,
    bestValidationEsr: primaryPackedSubmodel ? primaryPackedSubmodel.bestValidationEsr ?? null : bestValidationEsr,
    bestValidationMse: primaryPackedSubmodel ? null : bestValidationMse,
    packedSubmodels: packedSubmodels.length > 0 ? packedSubmodels : undefined,
    bestCheckpointPath: primaryPackedSubmodel?.checkpointPath ?? bestCheckpointPath,
    modelFilePath,
    comparisonPlotPath
  }
}

function checkpointSummariesEqual(
  left: JobCheckpointSummary | undefined,
  right: JobCheckpointSummary | undefined
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function normalizeJobStatus(value: unknown): JobStatus {
  const allowedStatuses = new Set<JobStatus>([
    'draft',
    'queued',
    'validating',
    'preparing',
    'running',
    'stopping',
    'succeeded',
    'failed',
    'canceled'
  ])

  if (typeof value === 'string' && allowedStatuses.has(value as JobStatus)) {
    return value as JobStatus
  }
  return 'queued'
}

function normalizePackedSubmodels(value: unknown): JobPackedSubmodelCheckpointSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const submodels = value.flatMap((entry): JobPackedSubmodelCheckpointSummary[] => {
    if (!isRecord(entry)) {
      return []
    }

    const submodelIndex = typeof entry.submodelIndex === 'number' && Number.isInteger(entry.submodelIndex)
      ? entry.submodelIndex
      : null
    if (submodelIndex == null) {
      return []
    }

    return [{
      submodelIndex,
      submodelName: typeof entry.submodelName === 'string' ? entry.submodelName : null,
      bestValidationEsr: typeof entry.bestValidationEsr === 'number' && Number.isFinite(entry.bestValidationEsr)
        ? entry.bestValidationEsr
        : typeof entry.bestValidationMetric === 'number' && Number.isFinite(entry.bestValidationMetric)
          ? entry.bestValidationMetric
          : null,
      epoch: typeof entry.epoch === 'number' && Number.isFinite(entry.epoch) ? entry.epoch : null,
      step: typeof entry.step === 'number' && Number.isFinite(entry.step) ? entry.step : null,
      checkpointPath: typeof entry.checkpointPath === 'string' ? entry.checkpointPath : null
    }]
  })

  return submodels.length > 0 ? submodels : undefined
}

function normalizeLatencyAlignment(value: unknown): JobLatencyAlignmentSummary | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const mode = value.mode === 'auto' || value.mode === 'manual' ? value.mode : null
  const status = typeof value.status === 'string' && LATENCY_ALIGNMENT_STATUSES.includes(value.status as JobLatencyAlignmentStatus)
    ? value.status as JobLatencyAlignmentStatus
    : null

  if (!mode || !status) {
    return undefined
  }

  return {
    mode,
    status,
    delaySamples: normalizeLatencySamples(value.delaySamples),
    inputVersion: typeof value.inputVersion === 'string' ? value.inputVersion : null,
    message: typeof value.message === 'string' ? value.message : null
  }
}

function normalizeProgress(value: unknown): JobTerminalProgress | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const candidate = value as Record<string, unknown>
  return {
    currentEpoch: typeof candidate.currentEpoch === 'number' ? candidate.currentEpoch : null,
    totalEpochs: typeof candidate.totalEpochs === 'number' ? candidate.totalEpochs : null,
    currentBatch: typeof candidate.currentBatch === 'number' ? candidate.currentBatch : null,
    totalBatches: typeof candidate.totalBatches === 'number' ? candidate.totalBatches : null,
    percent: typeof candidate.percent === 'number' ? candidate.percent : null,
    elapsed: typeof candidate.elapsed === 'string' ? candidate.elapsed : null,
    rate: typeof candidate.rate === 'string' ? candidate.rate : null
  }
}

function normalizeRuntimeState(value: unknown): JobRuntimeState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.jobId !== 'string') {
    return null
  }

  const fallbackName = typeof candidate.jobName === 'string' ? candidate.jobName : 'Recovered Job'
  const fallbackOutputRootDir = typeof candidate.outputRootDir === 'string' ? candidate.outputRootDir : ''
  return {
    jobId: candidate.jobId,
    jobName: fallbackName,
    status: normalizeJobStatus(candidate.status),
    pid: typeof candidate.pid === 'number' ? candidate.pid : null,
    queuedAt: typeof candidate.queuedAt === 'string' ? candidate.queuedAt : undefined,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : undefined,
    finishedAt: typeof candidate.finishedAt === 'string' ? candidate.finishedAt : undefined,
    plannedEpochs: typeof candidate.plannedEpochs === 'number' ? candidate.plannedEpochs : null,
    currentEpoch: typeof candidate.currentEpoch === 'number' ? candidate.currentEpoch : null,
    exitCode: typeof candidate.exitCode === 'number' ? candidate.exitCode : null,
    resolvedRunDirectory:
      typeof candidate.resolvedRunDirectory === 'string' ? candidate.resolvedRunDirectory : null,
    workspaceDirectory:
      typeof candidate.workspaceDirectory === 'string' ? candidate.workspaceDirectory : null,
    outputRootDir: fallbackOutputRootDir,
    generatedConfigPaths:
      typeof candidate.generatedConfigPaths === 'object' && candidate.generatedConfigPaths !== null
        ? {
            dataConfig:
              typeof (candidate.generatedConfigPaths as Record<string, unknown>).dataConfig === 'string'
                ? String((candidate.generatedConfigPaths as Record<string, unknown>).dataConfig)
                : '',
            modelConfig:
              typeof (candidate.generatedConfigPaths as Record<string, unknown>).modelConfig === 'string'
                ? String((candidate.generatedConfigPaths as Record<string, unknown>).modelConfig)
                : '',
            learningConfig:
              typeof (candidate.generatedConfigPaths as Record<string, unknown>).learningConfig === 'string'
                ? String((candidate.generatedConfigPaths as Record<string, unknown>).learningConfig)
                : ''
          }
        : undefined,
    terminalLogPath: typeof candidate.terminalLogPath === 'string' ? candidate.terminalLogPath : null,
    publishedTerminalLogPath:
      typeof candidate.publishedTerminalLogPath === 'string' ? candidate.publishedTerminalLogPath : null,
    publishedModelPath:
      typeof candidate.publishedModelPath === 'string' ? candidate.publishedModelPath : null,
    logSummary:
      typeof candidate.logSummary === 'object' && candidate.logSummary !== null
        ? {
            latestTerminalLine:
              typeof (candidate.logSummary as Record<string, unknown>).latestTerminalLine === 'string'
                ? String((candidate.logSummary as Record<string, unknown>).latestTerminalLine)
                : null,
            latestStructuredLine:
              typeof (candidate.logSummary as Record<string, unknown>).latestStructuredLine === 'string'
                ? String((candidate.logSummary as Record<string, unknown>).latestStructuredLine)
                : null
          }
        : undefined,
    terminalProgress: normalizeProgress(candidate.terminalProgress ?? candidate.progress),
    deviceSummary: typeof candidate.deviceSummary === 'object' && candidate.deviceSummary !== null
      ? {
          torchVersion:
            typeof (candidate.deviceSummary as Record<string, unknown>).torchVersion === 'string'
              ? String((candidate.deviceSummary as Record<string, unknown>).torchVersion)
              : null,
          acceleratorRequested:
            typeof (candidate.deviceSummary as Record<string, unknown>).acceleratorRequested === 'string'
              ? String((candidate.deviceSummary as Record<string, unknown>).acceleratorRequested)
              : null,
          acceleratorUsed:
            typeof (candidate.deviceSummary as Record<string, unknown>).acceleratorUsed === 'string'
              ? String((candidate.deviceSummary as Record<string, unknown>).acceleratorUsed)
              : null,
          cudaAvailable:
            typeof (candidate.deviceSummary as Record<string, unknown>).cudaAvailable === 'boolean'
              ? Boolean((candidate.deviceSummary as Record<string, unknown>).cudaAvailable)
              : null,
          cudaDeviceCount:
            typeof (candidate.deviceSummary as Record<string, unknown>).cudaDeviceCount === 'number'
              ? Number((candidate.deviceSummary as Record<string, unknown>).cudaDeviceCount)
              : null,
          deviceName:
            typeof (candidate.deviceSummary as Record<string, unknown>).deviceName === 'string'
              ? String((candidate.deviceSummary as Record<string, unknown>).deviceName)
              : null,
          startupMessage:
            typeof (candidate.deviceSummary as Record<string, unknown>).startupMessage === 'string'
              ? String((candidate.deviceSummary as Record<string, unknown>).startupMessage)
              : null
        }
      : undefined,
    latencyAlignment: normalizeLatencyAlignment(candidate.latencyAlignment),
    checkpointSummary: typeof candidate.checkpointSummary === 'object' && candidate.checkpointSummary !== null
      ? {
          checkpointCount:
            typeof (candidate.checkpointSummary as Record<string, unknown>).checkpointCount === 'number'
              ? Number((candidate.checkpointSummary as Record<string, unknown>).checkpointCount)
              : 0,
          latestCheckpointEpoch:
            typeof (candidate.checkpointSummary as Record<string, unknown>).latestCheckpointEpoch === 'number'
              ? Number((candidate.checkpointSummary as Record<string, unknown>).latestCheckpointEpoch)
              : null,
          bestValidationEsr:
            typeof (candidate.checkpointSummary as Record<string, unknown>).bestValidationEsr === 'number'
              ? Number((candidate.checkpointSummary as Record<string, unknown>).bestValidationEsr)
              : null,
          bestValidationMse:
            typeof (candidate.checkpointSummary as Record<string, unknown>).bestValidationMse === 'number'
              ? Number((candidate.checkpointSummary as Record<string, unknown>).bestValidationMse)
              : null,
          packedSubmodels: normalizePackedSubmodels((candidate.checkpointSummary as Record<string, unknown>).packedSubmodels),
          bestCheckpointPath:
            typeof (candidate.checkpointSummary as Record<string, unknown>).bestCheckpointPath === 'string'
              ? String((candidate.checkpointSummary as Record<string, unknown>).bestCheckpointPath)
              : null,
          modelFilePath:
            typeof (candidate.checkpointSummary as Record<string, unknown>).modelFilePath === 'string'
              ? String((candidate.checkpointSummary as Record<string, unknown>).modelFilePath)
              : null,
          comparisonPlotPath:
            typeof (candidate.checkpointSummary as Record<string, unknown>).comparisonPlotPath === 'string'
              ? String((candidate.checkpointSummary as Record<string, unknown>).comparisonPlotPath)
              : null
        }
      : undefined,
    stopRequestedAt: typeof candidate.stopRequestedAt === 'string' ? candidate.stopRequestedAt : undefined,
    stopMode:
      candidate.stopMode === 'graceful' || candidate.stopMode === 'force'
        ? candidate.stopMode
        : null,
    userMessages: Array.isArray(candidate.userMessages)
      ? candidate.userMessages.filter((entry): entry is string => typeof entry === 'string')
      : [],
    errorCategory: typeof candidate.errorCategory === 'string' ? candidate.errorCategory : null,
    frozenJob: normalizePersistedJobSpec(candidate.frozenJob ?? candidate.jobSpecSnapshot, candidate.jobId, fallbackName, fallbackOutputRootDir)
  }
}

export class QueueManager extends EventEmitter {
  private queue: JobRuntimeState[] = []
  private currentJob: JobRuntimeState | null = null
  private settings: AppSettings | null = null
  private isRunning: boolean = false
  private activeController: TrainingProcessController | null = null
  private outputPollTimer: NodeJS.Timeout | null = null
  private knownNamVersion: KnownNamVersion | null = null

  private appendTerminalAnnotation(runtime: JobRuntimeState, message: string): void {
    if (!runtime.terminalLogPath) {
      return
    }

    const annotation = `[NAM-BOT] ${message.replace(/\r?\n/g, '\n[NAM-BOT] ')}\n`
    appendFileSync(runtime.terminalLogPath, annotation, 'utf-8')
    if (runtime.publishedTerminalLogPath) {
      appendFileSync(runtime.publishedTerminalLogPath, annotation, 'utf-8')
    }
  }

  private appendUserMessage(runtime: JobRuntimeState, message: string, options?: { persistToTerminalLog?: boolean }): void {
    if (runtime.userMessages[runtime.userMessages.length - 1] === message) {
      return
    }
    runtime.userMessages.push(message)
    if (runtime.userMessages.length > 250) {
      runtime.userMessages = runtime.userMessages.slice(-250)
    }
    if (options?.persistToTerminalLog) {
      this.appendTerminalAnnotation(runtime, message)
    }
  }

  private ensurePublishedTerminalLog(runtime: JobRuntimeState): boolean {
    if (!runtime.resolvedRunDirectory || !runtime.terminalLogPath) {
      return false
    }

    const targetPath = join(runtime.resolvedRunDirectory, `${sanitizeFilenameStem(runtime.jobName, runtime.jobId)}.log`)
    if (runtime.publishedTerminalLogPath === targetPath && existsSync(targetPath)) {
      return false
    }

    copyFileSync(runtime.terminalLogPath, targetPath)
    runtime.publishedTerminalLogPath = targetPath
    return true
  }

  private syncPublishedTerminalLog(runtime: JobRuntimeState): void {
    if (!runtime.terminalLogPath || !runtime.publishedTerminalLogPath) {
      return
    }

    copyFileSync(runtime.terminalLogPath, runtime.publishedTerminalLogPath)
  }

  private processTerminalChunk(
    runtime: JobRuntimeState,
    accumulator: TranscriptAccumulator,
    chunk: string,
    flush: boolean
  ): string[] {
    const cleaned = stripTerminalControlSequences(chunk)
    let persistedText = ''
    const lines: string[] = []

    const pushCurrentLine = (): void => {
      const nextLine = accumulator.currentLine.replace(/\s+$/g, '')
      accumulator.currentLine = ''
      if (!nextLine) {
        return
      }
      persistedText += `${nextLine}\n`
      lines.push(nextLine)
    }

    for (const character of cleaned) {
      if (character === '\r' || character === '\n') {
        pushCurrentLine()
        continue
      }
      accumulator.currentLine += character
    }

    if (flush) {
      pushCurrentLine()
    }

    if (persistedText && runtime.terminalLogPath) {
      appendFileSync(runtime.terminalLogPath, persistedText, 'utf-8')
      if (runtime.publishedTerminalLogPath) {
        appendFileSync(runtime.publishedTerminalLogPath, persistedText, 'utf-8')
      }
    }

    return lines
  }

  private renameExportedModel(runtime: JobRuntimeState): void {
    const modelPath = runtime.checkpointSummary?.modelFilePath
    if (!modelPath || !existsSync(modelPath)) {
      return
    }

    if (basename(modelPath).toLowerCase() !== 'model.nam') {
      runtime.publishedModelPath = modelPath
      return
    }

    const nextPath = buildPublishedModelPath(runtime, modelPath)
    if (existsSync(nextPath)) {
      runtime.publishedModelPath = modelPath
      this.appendUserMessage(
        runtime,
        `Training completed, but the final model could not be renamed because ${basename(nextPath)} already exists.`
      )
      return
    }

    try {
      renameSync(modelPath, nextPath)
      runtime.publishedModelPath = nextPath
      if (runtime.checkpointSummary) {
        runtime.checkpointSummary.modelFilePath = nextPath
      }
    } catch (error) {
      runtime.publishedModelPath = modelPath
      this.appendUserMessage(runtime, `Training completed, but renaming the final model failed: ${String(error)}`)
    }
  }

  private injectMetadataIntoExportedModel(runtime: JobRuntimeState): void {
    const modelPath = runtime.publishedModelPath ?? runtime.checkpointSummary?.modelFilePath
    if (!modelPath || !existsSync(modelPath)) {
      return
    }

    const metadataPatch = buildNamMetadataPatch(runtime.frozenJob.metadata)
    const confirmedTrainingMetadata = readConfirmedTrainingMetadata(runtime)
    const exportDate = buildNamExportDate(new Date())
    if (!hasNamModelMetadataUpdates(metadataPatch, confirmedTrainingMetadata)) {
      return
    }

    try {
      const parsed = JSON.parse(readFileSync(modelPath, 'utf-8')) as Record<string, unknown>
      const currentMetadata = typeof parsed.metadata === 'object' && parsed.metadata !== null
        ? parsed.metadata as Record<string, unknown>
        : {}

      parsed.metadata = buildUpdatedNamModelMetadata({
        currentMetadata,
        metadataPatch,
        confirmedTrainingMetadata,
        exportDate
      })
      writeFileSync(modelPath, JSON.stringify(parsed), 'utf-8')
    } catch (error) {
      this.appendUserMessage(runtime, `Training completed, but writing NAM metadata failed: ${String(error)}`)
    }
  }

  private copyPublishedModelToOutputAudioFolder(runtime: JobRuntimeState): void {
    if (!runtime.frozenJob.copyFinalModelToOutputAudioFolder) {
      return
    }

    const sourcePath = runtime.publishedModelPath ?? runtime.checkpointSummary?.modelFilePath
    if (!sourcePath || !existsSync(sourcePath)) {
      this.appendUserMessage(runtime, 'Training completed, but there was no final model file to copy beside the output audio.')
      return
    }

    const outputAudioDirectory = dirname(runtime.frozenJob.outputAudioPath)
    if (!outputAudioDirectory || outputAudioDirectory === '.') {
      this.appendUserMessage(runtime, 'Training completed, but the output audio folder could not be resolved for the final model copy.')
      return
    }

    const targetPath = join(outputAudioDirectory, basename(sourcePath))
    if (sourcePath.toLowerCase() === targetPath.toLowerCase()) {
      runtime.publishedModelPath = sourcePath
      return
    }

    const destinationPath = buildUniqueSiblingPath(targetPath)
    try {
      copyFileSync(sourcePath, destinationPath)
      runtime.publishedModelPath = destinationPath
      this.appendUserMessage(runtime, `Final model copied to output audio folder: ${destinationPath}`)
    } catch (error) {
      this.appendUserMessage(runtime, `Training completed, but copying the final model to the output audio folder failed: ${String(error)}`)
    }
  }

  constructor() {
    super()
    this.ensureDirectories()
    this.loadQueue()
    this.recoverInterruptedQueue()
  }

  private ensureDirectories(): void {
    if (!existsSync(workspacesPath)) {
      mkdirSync(workspacesPath, { recursive: true })
    }
  }

  private loadQueue(): void {
    try {
      if (!existsSync(queuePath)) {
        return
      }
      const parsed = JSON.parse(readFileSync(queuePath, 'utf-8')) as unknown
      if (!Array.isArray(parsed)) {
        this.queue = []
        return
      }
      this.queue = parsed
        .map((runtime) => normalizeRuntimeState(runtime))
        .filter((runtime): runtime is JobRuntimeState => runtime !== null)
      log.info('Queue loaded:', this.queue.length, 'jobs')
    } catch (error) {
      log.error('Failed to load queue:', error)
      this.queue = []
    }
  }

  private recoverInterruptedQueue(): void {
    let changed = false
    for (const runtime of this.queue) {
      if (ACTIVE_JOB_STATUSES.includes(runtime.status)) {
        runtime.status = 'failed'
        runtime.finishedAt = new Date().toISOString()
        runtime.errorCategory = 'process_state_lost'
        this.appendUserMessage(
          runtime,
          'NAM-BOT restarted before this run finished, so its previous training process is no longer attached.'
        )
        changed = true
      }
    }
    if (changed) {
      this.saveQueue()
    }
  }

  private saveQueue(): void {
    try {
      writeFileSync(queuePath, JSON.stringify(this.queue, null, 2), 'utf-8')
    } catch (error) {
      log.error('Failed to save queue:', error)
    }
  }

  private stopOutputPolling(): void {
    if (this.outputPollTimer) {
      clearInterval(this.outputPollTimer)
      this.outputPollTimer = null
    }
  }

  private refreshTrainingArtifacts(runtime: JobRuntimeState): boolean {
    if (!runtime.outputRootDir || !runtime.startedAt) {
      return false
    }

    let changed = false
    const previousRunDirectory = runtime.resolvedRunDirectory
    const runDirectorySelection = selectOutputRunDirectory(
      runtime.outputRootDir,
      runtime.startedAt,
      previousRunDirectory
    )
    const detectedRunDirectory = runDirectorySelection.detectedRunDirectory

    if (detectedRunDirectory && detectedRunDirectory !== previousRunDirectory) {
      runtime.resolvedRunDirectory = detectedRunDirectory
      if (previousRunDirectory) {
        log.info('Rebound output run directory for active job:', {
          jobId: runtime.jobId,
          from: previousRunDirectory,
          to: detectedRunDirectory,
          kind: runDirectorySelection.kind,
          reason: runDirectorySelection.reason
        })
        this.appendUserMessage(runtime, `Training folder updated: ${detectedRunDirectory}`)
      } else {
        log.info('Resolved output run directory for active job:', {
          jobId: runtime.jobId,
          to: detectedRunDirectory,
          kind: runDirectorySelection.kind,
          reason: runDirectorySelection.reason
        })
        this.appendUserMessage(runtime, `Training folder is ready: ${detectedRunDirectory}`)
      }
      changed = true
    }

    if (runtime.resolvedRunDirectory && this.ensurePublishedTerminalLog(runtime)) {
      changed = true
    }

    const artifactDirectory = runtime.resolvedRunDirectory ?? runtime.outputRootDir
    const previousSummary = runtime.checkpointSummary
    const preset = getTrainingPresetById(runtime.frozenJob.presetId)
    const nextSummary = buildCheckpointSummary(artifactDirectory, runtime.startedAt, isA2TrainingPreset(preset)) ?? undefined

    if (!checkpointSummariesEqual(previousSummary, nextSummary)) {
      runtime.checkpointSummary = nextSummary
      if (nextSummary?.latestCheckpointEpoch != null) {
        const completedEpochs = nextSummary.latestCheckpointEpoch + 1
        runtime.currentEpoch = runtime.plannedEpochs == null
          ? completedEpochs
          : Math.min(runtime.plannedEpochs, completedEpochs)
      }

      const previousCheckpointCount = previousSummary?.checkpointCount ?? 0
      const nextCheckpointCount = nextSummary?.checkpointCount ?? 0
      if (nextCheckpointCount > previousCheckpointCount) {
        const bestEsr = nextSummary?.bestValidationEsr
        if (bestEsr != null) {
          this.appendUserMessage(
            runtime,
            `Checkpoint ${nextCheckpointCount} saved. Best validation ESR so far: ${bestEsr.toFixed(4)}.`
          )
        } else {
          this.appendUserMessage(runtime, `Checkpoint ${nextCheckpointCount} saved.`)
        }
      }

      if (!previousSummary?.modelFilePath && nextSummary?.modelFilePath) {
        this.appendUserMessage(runtime, 'A model file has been exported to the training folder.')
      }

      changed = true
    }

    return changed
  }

  private startOutputPolling(runtime: JobRuntimeState): void {
    this.stopOutputPolling()

    const poll = () => {
      if (!this.currentJob || this.currentJob.jobId !== runtime.jobId) {
        this.stopOutputPolling()
        return
      }

      try {
        if (this.refreshTrainingArtifacts(runtime)) {
          this.emitJobUpdate(runtime)
        }
      } catch (error) {
        log.warn('Failed to refresh training artifacts:', error)
      }
    }

    poll()
    this.outputPollTimer = setInterval(poll, 2000)
  }

  private async prepareLearningConfigForRuntime(
    configPaths: {
      dataConfig: string
      modelConfig: string
      learningConfig: string
    },
    runtime: JobRuntimeState
  ): Promise<void> {
    if (!this.settings) {
      return
    }

    const torchRuntime = await inspectTorchRuntime(this.settings)
    const acceleratorRequested = chooseAccelerator(torchRuntime)
    runtime.deviceSummary = buildDeviceSummary(torchRuntime, acceleratorRequested)

    const learningConfigText = readFileSync(configPaths.learningConfig, 'utf-8')
    const learningConfig = JSON.parse(learningConfigText) as {
      train_dataloader?: { pin_memory?: boolean }
      trainer?: { accelerator?: string; devices?: number; max_epochs?: number }
    }

    const trainer = learningConfig.trainer ?? {}
    trainer.accelerator = acceleratorRequested
    trainer.devices = 1
    learningConfig.trainer = trainer

    if (acceleratorRequested !== 'gpu') {
      const trainDataloader = learningConfig.train_dataloader ?? {}
      trainDataloader.pin_memory = false
      learningConfig.train_dataloader = trainDataloader
    }

    writeFileSync(configPaths.learningConfig, JSON.stringify(learningConfig, null, 2), 'utf-8')

    if (acceleratorRequested === 'gpu' && torchRuntime?.deviceName) {
      this.appendUserMessage(runtime, `CUDA is available. Training will request GPU: ${torchRuntime.deviceName}.`)
      return
    }

    if (acceleratorRequested === 'mps') {
      this.appendUserMessage(runtime, 'Apple Silicon acceleration is available. Training will request MPS.')
      return
    }

    if (torchRuntime?.torchVersion?.includes('+cpu')) {
      this.appendUserMessage(
        runtime,
        `PyTorch ${torchRuntime.torchVersion} is a CPU-only build, so this run will stay on CPU. NAM does not use a separate CUDA flag.`
      )
      return
    }

    if (torchRuntime) {
      this.appendUserMessage(runtime, 'No GPU accelerator is available in this Python environment, so this run will use CPU.')
      return
    }

    this.appendUserMessage(runtime, 'Could not inspect the PyTorch runtime in advance. NAM-BOT will let NAM choose the device automatically.')
  }

  private updateLatestLogLine(runtime: JobRuntimeState, line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) {
      return false
    }

    const currentSummary = runtime.logSummary ?? {}
    if (currentSummary.latestTerminalLine === trimmed) {
      return false
    }

    const progress: JobTerminalProgress = runtime.terminalProgress ?? {}
    runtime.logSummary = { ...currentSummary, latestTerminalLine: trimmed }

    if (trimmed.includes('GPU available:')) {
      const match = /GPU available:\s*(True|False)(?:\s*\(.*?\))?,\s*used:\s*(True|False)/i.exec(trimmed)
      const usedGpu = match?.[2]?.toLowerCase() === 'true'
      const deviceSummary = runtime.deviceSummary ?? buildDeviceSummary(null, 'auto')
      runtime.deviceSummary = {
        ...deviceSummary,
        acceleratorUsed: usedGpu ? 'gpu' : 'cpu',
        startupMessage: trimmed
      }
      this.appendUserMessage(runtime, usedGpu ? 'Lightning confirmed GPU training has started.' : 'Lightning confirmed this run is using CPU.')
    }

    if (trimmed.includes('You are using a CUDA device')) {
      const deviceMatch = /You are using a CUDA device \('(.*?)'\)/i.exec(trimmed)
      if (deviceMatch) {
        const deviceSummary = runtime.deviceSummary ?? buildDeviceSummary(null, 'auto')
        runtime.deviceSummary = {
          ...deviceSummary,
          acceleratorUsed: 'gpu',
          deviceName: deviceMatch[1]
        }
      }
    }

    const parsedEpochProgress = parseEpochProgressLine(trimmed, runtime.plannedEpochs)
    if (parsedEpochProgress) {
      progress.currentEpoch = parsedEpochProgress.currentEpoch
      progress.totalEpochs = parsedEpochProgress.totalEpochs
      progress.currentBatch = parsedEpochProgress.currentBatch
      progress.totalBatches = parsedEpochProgress.totalBatches
      progress.percent = computeOverallProgressPercent(progress)

      if (runtime.currentEpoch !== parsedEpochProgress.currentEpoch) {
        runtime.currentEpoch = runtime.plannedEpochs == null
          ? parsedEpochProgress.currentEpoch
          : Math.min(runtime.plannedEpochs, parsedEpochProgress.currentEpoch)
      }

      const structuredProgressLine = buildStructuredProgressLine(progress)
      if (structuredProgressLine) {
        runtime.logSummary = {
          ...runtime.logSummary,
          latestTerminalLine: trimmed,
          latestStructuredLine: structuredProgressLine
        }
      }
    }

    const timingMatch = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[•·]\s*([\-:0-9]+)\s+([0-9.]+it\/s)/.exec(trimmed)
    if (timingMatch) {
      progress.elapsed = timingMatch[1]
      progress.rate = timingMatch[3].trim()
    }

    runtime.terminalProgress = progress

    if (trimmed.includes('Sanity Checking')) {
      this.appendUserMessage(runtime, 'NAM is running its initial validation checks.')
      runtime.logSummary = {
        ...runtime.logSummary,
        latestStructuredLine: 'Running startup validation checks'
      }
    }

    if (trimmed.includes('Training interrupted by user.')) {
      this.appendUserMessage(runtime, 'NAM acknowledged the stop request and is wrapping up the run.')
    }

    return true
  }

  private emitQueueUpdate(): void {
    this.saveQueue()
    this.emit('queueUpdated', this.getQueue())
  }

  private emitJobUpdate(runtime: JobRuntimeState): void {
    this.saveQueue()
    this.emit('jobUpdated', runtime)
  }

  setSettings(settings: AppSettings): void {
    const previousKey = this.settings ? buildBackendSettingsKey(this.settings) : null
    const nextKey = buildBackendSettingsKey(settings)
    this.settings = settings
    if (previousKey !== nextKey) {
      this.knownNamVersion = null
    }
  }

  private blockRuntimeForPendingA2Diagnostics(runtime: JobRuntimeState, message: string): void {
    runtime.status = 'queued'
    runtime.pid = null
    runtime.queuedAt = new Date().toISOString()
    runtime.startedAt = undefined
    runtime.finishedAt = undefined
    runtime.exitCode = undefined
    runtime.resolvedRunDirectory = null
    runtime.workspaceDirectory = null
    runtime.generatedConfigPaths = undefined
    runtime.terminalLogPath = null
    runtime.publishedTerminalLogPath = null
    runtime.publishedModelPath = null
    runtime.logSummary = {
      latestTerminalLine: null,
      latestStructuredLine: 'Waiting for Diagnostics to confirm NAM version'
    }
    runtime.terminalProgress = {
      currentEpoch: 0,
      totalEpochs: runtime.plannedEpochs ?? runtime.frozenJob.trainingOverrides.epochs ?? null,
      currentBatch: null,
      totalBatches: null,
      elapsed: null,
      rate: null,
      percent: 0
    }
    runtime.deviceSummary = undefined
    runtime.latencyAlignment = undefined
    runtime.checkpointSummary = undefined
    runtime.stopRequestedAt = undefined
    runtime.stopMode = null
    runtime.errorCategory = 'a2_diagnostics_pending'
    this.appendUserMessage(runtime, message)
  }

  setKnownNamVersion(settings: AppSettings, version: string | null): void {
    this.knownNamVersion = {
      settingsKey: buildBackendSettingsKey(settings),
      version
    }

    const hasBlockedA2Jobs = this.queue.some((runtime) => runtime.errorCategory === 'a2_diagnostics_pending')
    if (hasBlockedA2Jobs && version) {
      void this.startQueue()
    }
  }

  private async assertTrainingRequirements(jobSpec: JobSpec): Promise<void> {
    if (!this.settings) {
      throw new Error('Cannot validate training requirements because settings are not loaded.')
    }

    const preset = getTrainingPresetById(jobSpec.presetId)
    if (!isA2TrainingPreset(preset)) {
      return
    }

    const settingsKey = buildBackendSettingsKey(this.settings)
    const installedVersion = this.knownNamVersion?.settingsKey === settingsKey
      ? this.knownNamVersion.version
      : null
    if (!installedVersion) {
      throw new A2DiagnosticsPendingError()
    }

    if (compareVersions(installedVersion, MIN_A2_NAM_VERSION) < 0) {
      throw new Error(
        `A2 training requires neural-amp-modeler ${MIN_A2_NAM_VERSION} or newer. Installed: ${installedVersion}. Run pip install --upgrade "neural-amp-modeler>=${MIN_A2_NAM_VERSION}" in the configured environment, then re-check Diagnostics.`
      )
    }
  }

  async validateJobCanTrain(jobSpec: JobSpec): Promise<void> {
    try {
      await this.assertTrainingRequirements(jobSpec)
    } catch (error) {
      if (isA2DiagnosticsPendingError(error)) {
        return
      }
      throw error
    }
  }

  getQueue(): JobRuntimeState[] {
    return [...this.queue]
  }

  getCurrentJob(): JobRuntimeState | null {
    return this.currentJob
  }

  isQueueProcessing(): boolean {
    return this.isRunning
  }

  addToQueue(jobSpec: JobSpec): JobRuntimeState {
    const runtime: JobRuntimeState = {
      jobId: jobSpec.id,
      jobName: jobSpec.name,
      status: 'queued',
      pid: null,
      frozenJob: cloneJobSpec(jobSpec),
      queuedAt: new Date().toISOString(),
      plannedEpochs: jobSpec.trainingOverrides.epochs ?? null,
      currentEpoch: 0,
      outputRootDir: jobSpec.outputRootDir,
      terminalLogPath: null,
      publishedTerminalLogPath: null,
      publishedModelPath: null,
      terminalProgress: {
        currentEpoch: 0,
        totalEpochs: jobSpec.trainingOverrides.epochs ?? null,
        currentBatch: null,
        totalBatches: null,
        elapsed: null,
        rate: null,
        percent: 0
      },
      latencyAlignment: createInitialLatencyAlignment(jobSpec),
      userMessages: ['Job queued and waiting for training to start.'],
      stopMode: null,
      logSummary: {
        latestTerminalLine: null,
        latestStructuredLine: 'Waiting in queue'
      }
    }
    this.queue.push(runtime)
    this.emitQueueUpdate()
    log.info('Job added to queue:', jobSpec.id)
    return runtime
  }

  removeQueueItem(jobId: string): void {
    const index = this.queue.findIndex((jobRuntime) => jobRuntime.jobId === jobId)
    if (index < 0) {
      return
    }

    if (ACTIVE_JOB_STATUSES.includes(this.queue[index].status)) {
      return
    }

    this.queue.splice(index, 1)
    this.emitQueueUpdate()
  }

  tagQueueItemBatch(jobId: string, batchId: string, batchSourceName: string): JobRuntimeState | null {
    const runtime = this.queue.find((jobRuntime) => jobRuntime.jobId === jobId)
    if (!runtime) {
      return null
    }

    runtime.frozenJob.batchId = batchId
    runtime.frozenJob.batchSourceName = batchSourceName
    this.emitQueueUpdate()
    return runtime
  }

  unqueueJob(jobId: string): JobSpec | null {
    const index = this.queue.findIndex((jobRuntime) => jobRuntime.jobId === jobId)
    if (index < 0) {
      return null
    }

    const runtime = this.queue[index]
    if (!QUEUED_JOB_STATUSES.includes(runtime.status)) {
      return null
    }

    this.queue.splice(index, 1)
    this.emitQueueUpdate()
    return cloneJobSpec(runtime.frozenJob)
  }

  unqueueAll(): JobSpec[] {
    const restoredDrafts: JobSpec[] = []
    this.queue = this.queue.filter((runtime) => {
      if (QUEUED_JOB_STATUSES.includes(runtime.status)) {
        restoredDrafts.push(cloneJobSpec(runtime.frozenJob))
        return false
      }
      return true
    })
    this.emitQueueUpdate()
    return restoredDrafts
  }

  private resetRuntimeForRetry(runtime: JobRuntimeState): void {
    runtime.status = 'queued'
    runtime.pid = null
    runtime.queuedAt = new Date().toISOString()
    runtime.startedAt = undefined
    runtime.finishedAt = undefined
    runtime.currentEpoch = 0
    runtime.exitCode = undefined
    runtime.resolvedRunDirectory = null
    runtime.workspaceDirectory = null
    runtime.generatedConfigPaths = undefined
    runtime.terminalLogPath = null
    runtime.publishedTerminalLogPath = null
    runtime.publishedModelPath = null
    runtime.logSummary = undefined
    runtime.terminalProgress = undefined
    runtime.deviceSummary = undefined
    runtime.latencyAlignment = undefined
    runtime.checkpointSummary = undefined
    runtime.stopRequestedAt = undefined
    runtime.stopMode = null
    runtime.errorCategory = null
    runtime.userMessages = ['Retry requested. Job re-queued and waiting for training to start.']
  }

  async startQueue(): Promise<void> {
    if (this.isRunning || this.queue.length === 0) {
      return
    }

    if (!this.settings) {
      log.error('Cannot start queue: settings not set')
      return
    }

    this.isRunning = true
    try {
      while (true) {
        const runtime = this.queue.find((jobRuntime) => jobRuntime.status === 'queued')
        if (!runtime) {
          break
        }

        const jobSpec = cloneJobSpec(runtime.frozenJob)
        runtime.jobName = jobSpec.name
        runtime.plannedEpochs = jobSpec.trainingOverrides.epochs ?? null
        runtime.outputRootDir = jobSpec.outputRootDir
        this.currentJob = runtime
        const result = await this.runJob(jobSpec, runtime)
        this.currentJob = null
        if (result === 'blocked') {
          break
        }
      }
    } finally {
      this.activeController = null
      this.stopOutputPolling()
      this.isRunning = false
      this.emitQueueUpdate()
    }
  }

  private async runJob(jobSpec: JobSpec, runtime: JobRuntimeState): Promise<RunJobResult> {
    const workspaceId = uuidv4()
    const workspaceRoot = resolveWorkspaceRoot(this.settings)
    const workspaceDir = join(workspaceRoot, workspaceId)
    const terminalPath = join(workspaceDir, 'terminal.log')

    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true })
    }

    runtime.status = 'preparing'
    runtime.startedAt = new Date().toISOString()
    runtime.finishedAt = undefined
    runtime.exitCode = undefined
    runtime.errorCategory = null
    runtime.currentEpoch = 0
    runtime.workspaceDirectory = workspaceDir
    runtime.resolvedRunDirectory = null
    runtime.outputRootDir = jobSpec.outputRootDir
    runtime.terminalLogPath = terminalPath
    runtime.publishedTerminalLogPath = null
    runtime.publishedModelPath = null
    runtime.logSummary = {
      latestTerminalLine: null,
      latestStructuredLine: 'Preparing NAM training environment'
    }
    runtime.terminalProgress = {
      currentEpoch: 0,
      totalEpochs: jobSpec.trainingOverrides.epochs ?? null,
      currentBatch: null,
      totalBatches: null,
      elapsed: null,
      rate: null,
      percent: 0
    }
    runtime.latencyAlignment = createInitialLatencyAlignment(jobSpec)
    runtime.checkpointSummary = undefined
    runtime.stopRequestedAt = undefined
    runtime.stopMode = null
    writeFileSync(terminalPath, '', 'utf-8')
    if (runtime.latencyAlignment.mode === 'manual') {
      const delaySamples = runtime.latencyAlignment.delaySamples ?? 0
      this.appendUserMessage(runtime, `Using manual latency delay: ${formatLatencySamples(delaySamples)}.`, { persistToTerminalLog: true })
    }
    this.emitJobUpdate(runtime)

    const transcriptAccumulator: TranscriptAccumulator = { currentLine: '' }

    const waitForCompletion = async (): Promise<void> => {
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (runtime.status === 'succeeded' || runtime.status === 'failed' || runtime.status === 'canceled') {
            clearInterval(checkInterval)
            resolve()
          }
        }, 250)
      })
    }

    const finalizeSuccessfulRun = async (): Promise<void> => {
      try {
        this.refreshTrainingArtifacts(runtime)
        this.renameExportedModel(runtime)
        this.injectMetadataIntoExportedModel(runtime)
        this.copyPublishedModelToOutputAudioFolder(runtime)
        this.refreshTrainingArtifacts(runtime)
        this.syncPublishedTerminalLog(runtime)
      } catch (error) {
        log.warn('Failed to refresh final training artifacts:', error)
      }

      if (runtime.status === 'succeeded' && this.settings?.autoOpenResultsFolder && runtime.resolvedRunDirectory) {
        shell.openPath(runtime.resolvedRunDirectory)
      }
    }

    const runTrainingProcess = async (configPaths: {
      dataConfig: string
      modelConfig: string
      learningConfig: string
    }): Promise<void> => {
      let controller: TrainingProcessController | null = null

      controller = await runNamFull(
        this.settings!,
        {
          dataConfigPath: configPaths.dataConfig,
          modelConfigPath: configPaths.modelConfig,
          learningConfigPath: configPaths.learningConfig,
          outputRootDir: jobSpec.outputRootDir,
          noShow: true,
          noPlots: true,
          cwd: workspaceDir
        },
        {
          onTerminalData: (chunk) => {
            const lines = this.processTerminalChunk(runtime, transcriptAccumulator, chunk, false)
            let changed = false
            for (const line of lines) {
              changed = this.updateLatestLogLine(runtime, line) || changed
            }
            if (changed) {
              this.emitJobUpdate(runtime)
            }
          },
          onStarted: (pid) => {
            runtime.pid = pid
            runtime.status = 'running'
            this.startOutputPolling(runtime)
            this.emitJobUpdate(runtime)
          },
          onExit: (code) => {
            log.info(`PTY exited for job ${runtime.jobId} with code ${code}`)
            this.stopOutputPolling()
            const trailingLines = this.processTerminalChunk(runtime, transcriptAccumulator, '', true)
            for (const line of trailingLines) {
              this.updateLatestLogLine(runtime, line)
            }
            runtime.exitCode = code
            runtime.finishedAt = new Date().toISOString()
            runtime.pid = null

            if (runtime.stopMode) {
              runtime.status = 'canceled'
              runtime.errorCategory = runtime.stopMode === 'force' ? 'force_stopped' : 'stopped_by_user'
              this.appendUserMessage(
                runtime,
                runtime.stopMode === 'force'
                  ? 'Training was force-stopped immediately.'
                  : 'Training was stopped by user request.'
              )
            } else if (code === 0) {
              runtime.status = 'succeeded'
              this.appendUserMessage(runtime, 'Training completed successfully.')
            } else {
              const terminalTail = existsSync(terminalPath)
                ? readFileSync(terminalPath, 'utf-8').trim().split(/\r?\n/).slice(-8).join('\n')
                : ''
              runtime.status = 'failed'
              runtime.errorCategory = 'training_failed'
              this.appendUserMessage(
                runtime,
                terminalTail
                  ? `Training exited with code ${String(code)}. Recent terminal output:\n${terminalTail}`
                  : `Training exited with code ${String(code)}. No terminal output was captured.`
              )
            }

            this.activeController = null
            this.syncPublishedTerminalLog(runtime)
            this.emitJobUpdate(runtime)
          },
          onError: (err) => {
            this.stopOutputPolling()
            runtime.pid = null
            runtime.finishedAt = new Date().toISOString()
            runtime.status = runtime.stopMode ? 'canceled' : 'failed'
            runtime.errorCategory = runtime.stopMode ? 'stopped_by_user' : 'process_launch_failed'
            this.appendUserMessage(runtime, `Training process error: ${err.message}`)
            this.activeController = null
            this.syncPublishedTerminalLog(runtime)
            this.emitJobUpdate(runtime)
          }
        }
      )

      this.activeController = controller
      await waitForCompletion()
    }

    try {
      await this.assertTrainingRequirements(jobSpec)
      const preset = getTrainingPresetById(jobSpec.presetId)
      const latencyLocked = preset.lockedJobFields.includes('latencySamples')
      let jobSpecForConfig = jobSpec

      if (jobSpec.trainingOverrides.latencyMode === 'auto' && !latencyLocked) {
        runtime.latencyAlignment = {
          mode: 'auto',
          status: 'auto_pending',
          delaySamples: null,
          inputVersion: null,
          message: 'Running NAM latency analyzer.'
        }
        this.appendUserMessage(runtime, 'Auto-aligning input/output latency with the NAM analyzer...', { persistToTerminalLog: true })
        runtime.logSummary = {
          ...runtime.logSummary,
          latestStructuredLine: 'Auto-aligning latency'
        }
        this.emitJobUpdate(runtime)

        const latencyAnalysis = await analyzeNamLatency(this.settings!, jobSpec.inputAudioPath, jobSpec.outputAudioPath)
        if (!latencyAnalysis.ok || latencyAnalysis.recommendedLatency == null) {
          const failureReason = latencyAnalysis.errorMessage ?? 'NAM could not calculate a recommended delay. Switch latency to Manual and enter a value, or use a recognized NAM standard input file.'
          const failureMessage = `Auto latency alignment failed: ${failureReason}`
          runtime.latencyAlignment = {
            mode: 'auto',
            status: 'auto_failed',
            delaySamples: null,
            inputVersion: latencyAnalysis.inputVersion,
            message: failureReason
          }
          this.appendUserMessage(runtime, failureMessage, { persistToTerminalLog: true })
          throw new Error(
            failureMessage
          )
        }

        const resolvedLatencySamples = Math.round(latencyAnalysis.recommendedLatency)
        jobSpecForConfig = {
          ...jobSpec,
          trainingOverrides: {
            ...jobSpec.trainingOverrides,
            latencySamples: resolvedLatencySamples
          }
        }

        const versionLabel = formatLatencyAnalysisVersion(latencyAnalysis.inputVersion)
        const alignmentMessage = `Auto-aligned latency${versionLabel}: ${formatLatencySamples(resolvedLatencySamples)}.`
        runtime.latencyAlignment = {
          mode: 'auto',
          status: 'auto_applied',
          delaySamples: resolvedLatencySamples,
          inputVersion: latencyAnalysis.inputVersion,
          message: alignmentMessage
        }
        this.appendUserMessage(runtime, alignmentMessage, { persistToTerminalLog: true })

        if (latencyAnalysis.warnings?.matchesLookahead) {
          this.appendUserMessage(runtime, 'Latency warning: the detected delay matched NAM analyzer lookahead, which can indicate unusual capture data.', { persistToTerminalLog: true })
        }
        if (latencyAnalysis.warnings?.disagreementTooHigh) {
          this.appendUserMessage(runtime, 'Latency warning: detected responses disagreed more than expected. If the model sounds wrong, try measuring latency manually.', { persistToTerminalLog: true })
        }
      } else if (jobSpec.trainingOverrides.latencyMode === 'auto' && latencyLocked) {
        const lockedLatencySamples = getPresetLockedLatencySamples(preset)
        const lockedDelaySuffix = lockedLatencySamples == null ? '' : ` (${formatLatencySamples(lockedLatencySamples)})`
        runtime.latencyAlignment = {
          mode: 'auto',
          status: 'auto_skipped',
          delaySamples: lockedLatencySamples,
          inputVersion: null,
          message: `Selected preset locks delay in its expert data config${lockedDelaySuffix}.`
        }
        this.appendUserMessage(runtime, `Skipping auto latency alignment because the selected preset locks delay in its expert data config${lockedDelaySuffix}.`, { persistToTerminalLog: true })
      }

      this.appendUserMessage(runtime, 'Generating NAM training configuration files...', { persistToTerminalLog: true })
      const configPaths = buildJobConfigs(jobSpecForConfig, workspaceDir, preset)
      runtime.generatedConfigPaths = configPaths
      await this.prepareLearningConfigForRuntime(configPaths, runtime)

      this.appendUserMessage(runtime, 'Starting NAM training...', { persistToTerminalLog: true })
      this.appendUserMessage(runtime, `Training output root: ${jobSpec.outputRootDir}`, { persistToTerminalLog: true })
      this.emitJobUpdate(runtime)

      await runTrainingProcess(configPaths)
      await finalizeSuccessfulRun()
      return 'completed'
    } catch (error) {
      if (isA2DiagnosticsPendingError(error)) {
        this.blockRuntimeForPendingA2Diagnostics(runtime, error.message)
        this.emitJobUpdate(runtime)
        return 'blocked'
      }

      runtime.status = 'failed'
      runtime.errorCategory = 'unknown_error'
      runtime.finishedAt = new Date().toISOString()
      this.appendUserMessage(runtime, `Training setup failed: ${String(error)}`)
      this.emitJobUpdate(runtime)
      return 'completed'
    } finally {
      this.activeController = null
      this.stopOutputPolling()
      this.syncPublishedTerminalLog(runtime)
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    if (!this.currentJob || this.currentJob.jobId !== jobId || !this.activeController) {
      return
    }

    this.currentJob.status = 'stopping'
    this.currentJob.stopRequestedAt = new Date().toISOString()
    this.currentJob.stopMode = 'graceful'
    this.appendUserMessage(this.currentJob, 'Stop requested. NAM-BOT is asking the trainer to stop cleanly.')
    this.emitJobUpdate(this.currentJob)
    this.activeController.cancel()

    // Watchdog: escalate to force kill if the process doesn't exit within 15 seconds
    const watchdogJobId = jobId
    setTimeout(async () => {
      const job = this.queue.find((j) => j.jobId === watchdogJobId)
      if (job && job.status === 'stopping' && job.stopMode === 'graceful') {
        log.warn(`Watchdog: Job ${watchdogJobId} is still 'stopping' after 15s. Escalating to force stop.`)
        await this.forceStopJob(watchdogJobId)
      }
    }, 15000)
  }

  async forceStopJob(jobId: string): Promise<void> {
    if (!this.currentJob || this.currentJob.jobId !== jobId || !this.activeController) {
      return
    }

    this.currentJob.status = 'stopping'
    this.currentJob.stopRequestedAt = new Date().toISOString()
    this.currentJob.stopMode = 'force'
    this.appendUserMessage(this.currentJob, 'Force stop requested. NAM-BOT is killing the full training process tree.')
    this.emitJobUpdate(this.currentJob)
    await this.activeController.forceKill()
  }

  retryJob(jobId: string): JobRuntimeState | null {
    const index = this.queue.findIndex((jobRuntime) => jobRuntime.jobId === jobId)
    if (index < 0) {
      log.warn('Cannot retry unknown queue item:', jobId)
      return null
    }

    const runtime = this.queue[index]
    if (ACTIVE_JOB_STATUSES.includes(runtime.status)) {
      log.warn('Cannot retry active queue item:', jobId, runtime.status)
      return null
    }

    if (!FINISHED_JOB_STATUSES.includes(runtime.status)) {
      log.warn('Cannot retry queue item with status:', jobId, runtime.status)
      return null
    }

    const now = new Date().toISOString()
    const clonedJob = cloneJobSpec(runtime.frozenJob)
    clonedJob.id = uuidv4()
    clonedJob.createdAt = now
    clonedJob.updatedAt = now
    const clonedRuntime = this.addToQueue(clonedJob)
    this.emitQueueUpdate()
    this.emitJobUpdate(clonedRuntime)
    log.info('Re-queued job for retry:', jobId)
    return clonedRuntime
  }

  clearFinished(): void {
    this.queue = this.queue.filter((runtime) => !FINISHED_JOB_STATUSES.includes(runtime.status))
    this.emitQueueUpdate()
    log.info('Cleared finished jobs.')
  }

  reorderQueue(jobIds: string[]): void {
    const moveableJobs = this.queue.filter((j) => QUEUED_JOB_STATUSES.includes(j.status))
    const nonMoveableJobs = this.queue.filter((j) => !QUEUED_JOB_STATUSES.includes(j.status))

    // Create a map for quick lookup
    const moveableMap = new Map(moveableJobs.map(j => [j.jobId, j]))
    
    // Build the new moveable list based on the provided IDs
    const newMoveableOrder: JobRuntimeState[] = []
    for (const id of jobIds) {
      const job = moveableMap.get(id)
      if (job) {
        newMoveableOrder.push(job)
        moveableMap.delete(id)
      }
    }
    
    // Add any remaining moveable jobs that weren't in the provided list (sanity check)
    newMoveableOrder.push(...moveableMap.values())

    // Update the queue: keep non-moveable jobs in their relative positions? 
    // Actually, usually finished jobs are at the end, active at the top.
    // Let's just reconstruct the queue: Active first, then the new Queued order, then Finished.
    const active = nonMoveableJobs.filter(j => ACTIVE_JOB_STATUSES.includes(j.status))
    const finished = nonMoveableJobs.filter(j => FINISHED_JOB_STATUSES.includes(j.status))
    
    this.queue = [...active, ...newMoveableOrder, ...finished]
    this.emitQueueUpdate()
    log.info('Queue reordered. New moveable count:', newMoveableOrder.length)
  }

  shutdownSync(reason: string): void {
    if (!this.currentJob || !this.activeController) {
      return
    }

    this.appendUserMessage(
      this.currentJob,
      `NAM-BOT is closing (${reason}), so the training process is being force-stopped to avoid leaving it running in the background.`
    )
    this.currentJob.status = 'canceled'
    this.currentJob.stopMode = 'force'
    this.currentJob.finishedAt = new Date().toISOString()
    this.currentJob.pid = null
    this.stopOutputPolling()
    this.activeController.forceKillSync()
    this.activeController = null
    this.saveQueue()
  }
}

let queueManagerInstance: QueueManager | null = null

export function getQueueManager(): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager()
  }
  return queueManagerInstance
}
