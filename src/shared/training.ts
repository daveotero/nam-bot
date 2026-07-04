export type JobStatus =
  | 'draft'
  | 'queued'
  | 'validating'
  | 'preparing'
  | 'running'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type JobStopMode = 'graceful' | 'force'

export type PresetCategory = 'quality' | 'speed' | 'architecture' | 'custom'
export type NamArchitectureVersion = 'a1' | 'a2' | 'custom'
export type ModelFamily = 'WaveNet' | 'PackedWaveNet' | 'LSTM'
export type ArchitectureSize = 'standard' | 'lite' | 'feather' | 'nano' | 'packed' | 'custom'
export type NamGearType = 'amp' | 'pedal' | 'pedal_amp' | 'amp_cab' | 'amp_pedal_cab' | 'preamp' | 'studio'
export type NamToneType = 'clean' | 'overdrive' | 'crunch' | 'hi_gain' | 'fuzz'
export type JobLatencyMode = 'manual' | 'auto'
export type JobLatencyAlignmentStatus = 'manual' | 'auto_pending' | 'auto_applied' | 'auto_skipped' | 'auto_failed'

export interface JobLogSummary {
  latestTerminalLine?: string | null
  latestStructuredLine?: string | null
}

export interface JobTerminalProgress {
  currentEpoch?: number | null
  totalEpochs?: number | null
  currentBatch?: number | null
  totalBatches?: number | null
  elapsed?: string | null
  rate?: string | null
  percent?: number | null
}

export interface JobDeviceSummary {
  torchVersion?: string | null
  acceleratorRequested?: string | null
  acceleratorUsed?: string | null
  cudaAvailable?: boolean | null
  cudaDeviceCount?: number | null
  deviceName?: string | null
  startupMessage?: string | null
}

export interface JobLatencyAlignmentSummary {
  mode: JobLatencyMode
  status: JobLatencyAlignmentStatus
  delaySamples?: number | null
  inputVersion?: string | null
  message?: string | null
}

export interface JobPackedSubmodelCheckpointSummary {
  submodelIndex: number
  submodelName?: string | null
  bestValidationEsr?: number | null
  epoch?: number | null
  step?: number | null
  checkpointPath?: string | null
}

export interface JobCheckpointSummary {
  checkpointCount: number
  latestCheckpointEpoch?: number | null
  bestValidationEsr?: number | null
  bestValidationMse?: number | null
  packedSubmodels?: JobPackedSubmodelCheckpointSummary[]
  bestCheckpointPath?: string | null
  modelFilePath?: string | null
  comparisonPlotPath?: string | null
}

export interface NamEmbeddedMetadata {
  name?: string
  modeledBy?: string
  gearType?: NamGearType | ''
  gearMake?: string
  gearModel?: string
  toneType?: NamToneType | ''
  inputLevelDbu?: number
  outputLevelDbu?: number
}

export interface JobTrainingOverrides {
  epochs?: number
  latencyMode?: JobLatencyMode
  latencySamples?: number
  packedSubmodels?: JobPackedSubmodelSelection[]
}

export interface JobPackedSubmodelSelection {
  submodelIndex: number
  submodelName?: string | null
}

export interface PackedPresetSubmodel extends JobPackedSubmodelSelection {
  channelCount?: number | null
}

export interface JobSpec {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  batchId?: string
  batchSourceName?: string
  presetId: string | null
  appendPresetToModelFileName: boolean
  appendEsrToModelFileName: boolean
  copyFinalModelToOutputAudioFolder: boolean
  inputAudioPath: string
  inputAudioIsDefault: boolean
  outputAudioPath: string
  outputRootDir: string
  outputRootDirIsDefault: boolean
  metadata: NamEmbeddedMetadata
  trainingOverrides: JobTrainingOverrides
  uiNotes?: string
}

export interface TrainingPresetValues {
  architectureVersion: NamArchitectureVersion
  modelFamily: ModelFamily
  architectureSize: ArchitectureSize
  epochs: number
  batchSize: number
  learningRate: number
  learningRateDecay: number
  ny: number
  fitMrstft: boolean
  mrstftWeight: number
  weightDecay: number
  outputNormalizeRmsDb: number | null
}

export interface TrainingPresetExpertBlocks {
  data?: Record<string, unknown>
  model?: Record<string, unknown>
  learning?: Record<string, unknown>
}

export interface TrainingPresetAuthor {
  name?: string
  url?: string
}

export interface TrainingPresetOrigin {
  app?: string
  version?: string
}

export interface TrainingPresetFile {
  schemaVersion: 1
  presetKind: 'training'
  id: string
  name: string
  description: string
  category: PresetCategory
  builtIn: boolean
  readOnly: boolean
  visible: boolean
  createdAt: string
  updatedAt: string
  lockedJobFields: Array<'epochs' | 'latencySamples'>
  values: TrainingPresetValues
  expert: TrainingPresetExpertBlocks
  author?: TrainingPresetAuthor
  origin?: TrainingPresetOrigin
}

export interface JobRuntimeState {
  jobId: string
  jobName: string
  status: JobStatus
  pid: number | null
  frozenJob: JobSpec
  queuedAt?: string
  startedAt?: string
  finishedAt?: string
  plannedEpochs?: number | null
  currentEpoch?: number | null
  exitCode?: number | null
  resolvedRunDirectory?: string | null
  workspaceDirectory?: string | null
  outputRootDir?: string | null
  generatedConfigPaths?: {
    dataConfig: string
    modelConfig: string
    learningConfig: string
  }
  terminalLogPath?: string | null
  publishedTerminalLogPath?: string | null
  publishedModelPath?: string | null
  logSummary?: JobLogSummary
  terminalProgress?: JobTerminalProgress
  deviceSummary?: JobDeviceSummary
  latencyAlignment?: JobLatencyAlignmentSummary
  checkpointSummary?: JobCheckpointSummary
  stopRequestedAt?: string
  stopMode?: JobStopMode | null
  userMessages: string[]
  errorCategory?: string | null
}

export interface ImportedPresetResult {
  kind: 'full-preset' | 'expert-config' | 'wavenet-snippet' | 'lstm-snippet'
  preset: TrainingPresetFile
}

export const NAM_GEAR_TYPE_OPTIONS: Array<{ value: NamGearType; label: string }> = [
  { value: 'amp', label: 'Amp' },
  { value: 'pedal', label: 'Pedal' },
  { value: 'pedal_amp', label: 'Pedal + Amp' },
  { value: 'amp_cab', label: 'Amp + Cab' },
  { value: 'amp_pedal_cab', label: 'Amp + Pedal + Cab' },
  { value: 'preamp', label: 'Preamp' },
  { value: 'studio', label: 'Studio' }
]

export const NAM_TONE_TYPE_OPTIONS: Array<{ value: NamToneType; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'overdrive', label: 'Overdrive' },
  { value: 'crunch', label: 'Crunch' },
  { value: 'hi_gain', label: 'Hi Gain' },
  { value: 'fuzz', label: 'Fuzz' }
]

export const DEFAULT_PRESET_ID = 'a2-packed-wavenet'
export const A2_HEAVY_12_PRESET_ID = 'a2-packed-wavenet-heavy-12'
export const A2_ULTRA_20_PRESET_ID = 'a2-packed-wavenet-ultra-20'
export const A1_STANDARD_PRESET_ID = 'wavenet-standard'
export const LEGACY_LSTM_PRESET_ID = 'compat-lstm-standard'
export const MIN_A2_NAM_VERSION = '0.13.0'
const A2_DEFAULT_PACKED_CHANNELS = [3, 8] as const
const A2_HEAVY_12_PACKED_CHANNELS = [3, 8, 12] as const
const A2_ULTRA_20_PACKED_CHANNELS = [3, 8, 12, 16, 20] as const

export const DEFAULT_TRAINING_PRESET_VALUES: TrainingPresetValues = {
  architectureVersion: 'a2',
  modelFamily: 'PackedWaveNet',
  architectureSize: 'packed',
  epochs: 100,
  batchSize: 16,
  learningRate: 0.004,
  learningRateDecay: 0.006,
  ny: 8192,
  fitMrstft: true,
  mrstftWeight: 0.0005,
  weightDecay: 3.17e-7,
  outputNormalizeRmsDb: -18
}

export const A1_TRAINING_PRESET_VALUE_OVERRIDES: Pick<TrainingPresetValues, 'architectureVersion' | 'mrstftWeight' | 'weightDecay' | 'outputNormalizeRmsDb'> = {
  architectureVersion: 'a1',
  mrstftWeight: 0.0002,
  weightDecay: 0,
  outputNormalizeRmsDb: null
}

export const defaultJobSpec: Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'New Job',
  presetId: DEFAULT_PRESET_ID,
  appendPresetToModelFileName: false,
  appendEsrToModelFileName: false,
  copyFinalModelToOutputAudioFolder: false,
  inputAudioPath: '',
  inputAudioIsDefault: true,
  outputAudioPath: '',
  outputRootDir: '',
  outputRootDirIsDefault: true,
  metadata: {
    name: '',
    modeledBy: '',
    gearType: '',
    gearMake: '',
    gearModel: '',
    toneType: '',
    inputLevelDbu: undefined,
    outputLevelDbu: undefined
  },
  trainingOverrides: {
    epochs: 200,
    latencyMode: 'auto',
    latencySamples: 0
  },
  uiNotes: ''
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNullableFiniteNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) {
    return null
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeLatencyMode(value: unknown, fallback: JobLatencyMode): JobLatencyMode {
  return value === 'manual' || value === 'auto' ? value : fallback
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeArchitectureVersion(value: unknown): NamArchitectureVersion | null {
  return value === 'a1' || value === 'a2' || value === 'custom' ? value : null
}

function normalizeModelFamily(value: unknown): ModelFamily {
  if (value === 'LSTM' || value === 'PackedWaveNet') {
    return value
  }
  return 'WaveNet'
}

function normalizeArchitectureSize(value: unknown): ArchitectureSize {
  return value === 'lite'
    || value === 'feather'
    || value === 'nano'
    || value === 'packed'
    || value === 'custom'
    ? value
    : 'standard'
}

function inferArchitectureVersion(values: Record<string, unknown>, expert: TrainingPresetExpertBlocks): NamArchitectureVersion {
  const expertNet = isRecord(expert.model) && isRecord(expert.model.net) ? expert.model.net : null
  const netName = typeof expertNet?.name === 'string' ? expertNet.name : values.modelFamily

  if (netName === 'PackedWaveNet') {
    return 'a2'
  }

  if (netName !== 'WaveNet' && netName !== 'LSTM') {
    return 'custom'
  }

  return 'a1'
}

function getExpertNetName(expert: TrainingPresetExpertBlocks): string | null {
  const expertNet = isRecord(expert.model) && isRecord(expert.model.net) ? expert.model.net : null
  return typeof expertNet?.name === 'string' ? expertNet.name : null
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneJson(value)
}

function normalizeWaveNetLayerConfigForCurrentNam(value: Record<string, unknown>): Record<string, unknown> {
  const layerConfig = cloneRecord(value)
  if (!isRecord(layerConfig.head) && typeof layerConfig.head_size === 'number') {
    layerConfig.head = {
      out_channels: layerConfig.head_size,
      kernel_size: 1,
      bias: typeof layerConfig.head_bias === 'boolean' ? layerConfig.head_bias : false
    }
    delete layerConfig.head_size
    delete layerConfig.head_bias
  }
  return layerConfig
}

function normalizeWaveNetConfigForCurrentNam(value: Record<string, unknown>): Record<string, unknown> {
  const config = cloneRecord(value)
  if (Array.isArray(config.layers_configs)) {
    config.layers_configs = config.layers_configs.map((entry) => isRecord(entry)
      ? normalizeWaveNetLayerConfigForCurrentNam(entry)
      : entry)
  }
  return config
}

function normalizeCanonicalModelOverride(value: Record<string, unknown>): Record<string, unknown> {
  const model = cloneRecord(value)
  if (!isRecord(model.net) || model.net.name !== 'WaveNet' || !isRecord(model.net.config)) {
    return model
  }

  model.net = {
    ...model.net,
    config: normalizeWaveNetConfigForCurrentNam(model.net.config)
  }
  return model
}

function isLegacyWaveNetConfig(value: Record<string, unknown>): boolean {
  return Array.isArray(value.layers_configs)
}

function isLegacyLstmConfig(value: Record<string, unknown>): boolean {
  return typeof value.num_layers === 'number' && typeof value.hidden_size === 'number'
}

function isCanonicalModelOverride(value: Record<string, unknown>): boolean {
  return isRecord(value.net)
    || isRecord(value.loss)
    || isRecord(value.optimizer)
    || isRecord(value.lr_scheduler)
}

function normalizeExpertModelShape(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (isCanonicalModelOverride(value)) {
    return normalizeCanonicalModelOverride(value)
  }

  const rawConfig = cloneRecord(value)

  if (isLegacyWaveNetConfig(rawConfig)) {
    return {
      net: {
        name: 'WaveNet',
        config: normalizeWaveNetConfigForCurrentNam(rawConfig)
      }
    }
  }

  if (isLegacyLstmConfig(rawConfig)) {
    return {
      net: {
        name: 'LSTM',
        config: rawConfig
      }
    }
  }

  return cloneRecord(value)
}

function normalizeTrainingPresetAuthor(value: unknown): TrainingPresetAuthor | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const name = asOptionalTrimmedString(value.name)
  const url = asOptionalTrimmedString(value.url)

  if (!name && !url) {
    return undefined
  }

  return {
    name,
    url
  }
}

function normalizeTrainingPresetOrigin(value: unknown): TrainingPresetOrigin | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const app = asOptionalTrimmedString(value.app)
  const version = asOptionalTrimmedString(value.version)

  if (!app && !version) {
    return undefined
  }

  return {
    app,
    version
  }
}

export function slugifyPresetName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'custom-preset'
}

export function buildWaveNetConfig(size: ArchitectureSize): Record<string, unknown> {
  const configs: Record<'standard' | 'lite' | 'feather' | 'nano', Record<string, unknown>> = {
    standard: {
      layers_configs: [
        {
          input_size: 1,
          condition_size: 1,
          channels: 16,
          head_size: 8,
          kernel_size: 3,
          dilations: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          activation: 'Tanh',
          gated: false,
          head_bias: false
        },
        {
          condition_size: 1,
          input_size: 16,
          channels: 8,
          head_size: 1,
          kernel_size: 3,
          dilations: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          activation: 'Tanh',
          gated: false,
          head_bias: true
        }
      ],
      head_scale: 0.02
    },
    lite: {
      layers_configs: [
        {
          input_size: 1,
          condition_size: 1,
          channels: 12,
          head_size: 6,
          kernel_size: 3,
          dilations: [1, 2, 4, 8, 16, 32, 64],
          activation: 'Tanh',
          gated: false,
          head_bias: false
        },
        {
          condition_size: 1,
          input_size: 12,
          channels: 6,
          head_size: 1,
          kernel_size: 3,
          dilations: [128, 256, 512, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          activation: 'Tanh',
          gated: false,
          head_bias: true
        }
      ],
      head_scale: 0.02
    },
    feather: {
      layers_configs: [
        {
          input_size: 1,
          condition_size: 1,
          channels: 8,
          head_size: 4,
          kernel_size: 3,
          dilations: [1, 2, 4, 8, 16, 32, 64],
          activation: 'Tanh',
          gated: false,
          head_bias: false
        },
        {
          condition_size: 1,
          input_size: 8,
          channels: 4,
          head_size: 1,
          kernel_size: 3,
          dilations: [128, 256, 512, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          activation: 'Tanh',
          gated: false,
          head_bias: true
        }
      ],
      head_scale: 0.02
    },
    nano: {
      layers_configs: [
        {
          input_size: 1,
          condition_size: 1,
          channels: 4,
          head_size: 2,
          kernel_size: 3,
          dilations: [1, 2, 4, 8, 16, 32, 64],
          activation: 'Tanh',
          gated: false,
          head_bias: false
        },
        {
          condition_size: 1,
          input_size: 4,
          channels: 2,
          head_size: 1,
          kernel_size: 3,
          dilations: [128, 256, 512, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          activation: 'Tanh',
          gated: false,
          head_bias: true
        }
      ],
      head_scale: 0.02
    }
  }

  if (size === 'custom' || size === 'packed') {
    return cloneJson(configs.standard)
  }

  return normalizeWaveNetConfigForCurrentNam(configs[size])
}

export function buildLstmConfig(size: ArchitectureSize): Record<string, unknown> {
  const configs: Record<'standard' | 'lite' | 'feather' | 'nano', Record<string, unknown>> = {
    standard: {
      num_layers: 1,
      hidden_size: 24,
      train_burn_in: 4096,
      train_truncate: 512
    },
    lite: {
      num_layers: 2,
      hidden_size: 8,
      train_burn_in: 4096,
      train_truncate: 512
    },
    feather: {
      num_layers: 1,
      hidden_size: 16,
      train_burn_in: 4096,
      train_truncate: 512
    },
    nano: {
      num_layers: 1,
      hidden_size: 12,
      train_burn_in: 4096,
      train_truncate: 512
    }
  }

  if (size === 'custom' || size === 'packed') {
    return cloneJson(configs.standard)
  }

  return cloneJson(configs[size])
}

function buildA2SubmodelConfig(channels: number): Record<string, unknown> {
  return {
    layers_configs: [
      {
        input_size: 1,
        condition_size: 1,
        channels,
        kernel_sizes: [
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          15,
          15,
          6,
          6,
          6,
          6,
          6,
          6,
          6
        ],
        dilations: [
          1,
          3,
          7,
          17,
          41,
          101,
          239,
          1,
          3,
          7,
          17,
          41,
          101,
          239,
          1,
          13,
          1,
          3,
          7,
          17,
          41,
          101,
          239
        ],
        activation: 'LeakyReLU',
        gated: false,
        head: {
          out_channels: 1,
          kernel_size: 16,
          bias: true
        }
      }
    ],
    head_scale: 0.01
  }
}

function buildA2PackedSubmodels(channels: readonly number[]): Array<{ name: string; config: Record<string, unknown> }> {
  return channels.map((channel) => ({
    name: `channels_${channel}`,
    config: buildA2SubmodelConfig(channel)
  }))
}

function buildA2PackedNetConfig(channels: readonly number[] = A2_DEFAULT_PACKED_CHANNELS): Record<string, unknown> {
  return {
    name: 'PackedWaveNet',
    config: {
      submodels: buildA2PackedSubmodels(channels),
      export: {
        container_max_values: 'uniform'
      }
    }
  }
}

export function buildA2PackedModelConfig(
  values: TrainingPresetValues = DEFAULT_TRAINING_PRESET_VALUES,
  channels: readonly number[] = A2_DEFAULT_PACKED_CHANNELS
): Record<string, unknown> {
  const schedulerGamma = Math.max(0, 1 - values.learningRateDecay)
  return {
    net: buildA2PackedNetConfig(channels),
    loss: {
      val_loss: 'esr',
      ...(values.mrstftWeight > 0 ? { mrstft_weight: values.mrstftWeight } : {})
    },
    optimizer: {
      lr: values.learningRate,
      ...(values.weightDecay > 0 ? { weight_decay: values.weightDecay } : {})
    },
    lr_scheduler: {
      class: 'ExponentialLR',
      kwargs: {
        gamma: schedulerGamma
      }
    }
  }
}

function getPackedSubmodelChannelCount(submodelName: string | null, config: Record<string, unknown> | null): number | null {
  const namedChannelMatch = /^channels_(\d+)$/i.exec(submodelName ?? '')
  if (namedChannelMatch) {
    const channelCount = Number(namedChannelMatch[1])
    return Number.isFinite(channelCount) ? channelCount : null
  }

  const firstLayer = Array.isArray(config?.layers_configs) && isRecord(config.layers_configs[0])
    ? config.layers_configs[0]
    : null
  const channelCount = firstLayer?.channels
  return typeof channelCount === 'number' && Number.isFinite(channelCount) ? channelCount : null
}

export function getPackedSubmodelSelectionKey(selection: JobPackedSubmodelSelection): string {
  return `${selection.submodelIndex}:${selection.submodelName ?? ''}`
}

function getA2PackedTierName(channelCount: number | null | undefined): string | null {
  if (channelCount == null || !Number.isFinite(channelCount)) {
    return null
  }
  if (channelCount <= 3) {
    return 'A2 Lite'
  }
  if (channelCount <= 8) {
    return 'A2 Full'
  }
  if (channelCount <= 12) {
    return 'A2 Heavy'
  }
  if (channelCount <= 16) {
    return 'A2 Ultra'
  }
  if (channelCount <= 20) {
    return 'A2 Mammoth'
  }
  if (channelCount <= 24) {
    return 'A2 Colossal'
  }
  if (channelCount <= 28) {
    return 'A2 Leviathan'
  }
  return null
}

export function formatPackedSubmodelDisplayName(submodel: PackedPresetSubmodel): string {
  const tierName = getA2PackedTierName(submodel.channelCount)
  if (tierName && submodel.channelCount != null) {
    return `${tierName} (${submodel.channelCount} ch)`
  }
  if (submodel.channelCount != null) {
    return submodel.submodelName ? `${submodel.submodelName} (${submodel.channelCount} ch)` : `${submodel.channelCount} ch`
  }
  return submodel.submodelName ?? `Submodel ${submodel.submodelIndex + 1}`
}

export function getPackedSubmodelsForPreset(preset: TrainingPresetFile): PackedPresetSubmodel[] {
  if (preset.values.modelFamily !== 'PackedWaveNet') {
    return []
  }

  const expertNetConfig = isRecord(preset.expert.model)
    && isRecord(preset.expert.model.net)
    && isRecord(preset.expert.model.net.config)
      ? preset.expert.model.net.config
      : null
  const rawSubmodels = Array.isArray(expertNetConfig?.submodels)
    ? expertNetConfig.submodels
    : buildA2PackedSubmodels(A2_DEFAULT_PACKED_CHANNELS)

  return rawSubmodels.flatMap((entry, submodelIndex): PackedPresetSubmodel[] => {
    if (!isRecord(entry)) {
      return []
    }

    const submodelName = typeof entry.name === 'string' ? entry.name : null
    const config = isRecord(entry.config) ? entry.config : null
    return [{
      submodelIndex,
      submodelName,
      channelCount: getPackedSubmodelChannelCount(submodelName, config)
    }]
  })
}

function computeLockedJobFields(expert: TrainingPresetExpertBlocks): Array<'epochs' | 'latencySamples'> {
  const lockedFields: Array<'epochs' | 'latencySamples'> = []
  const learningTrainer = isRecord(expert.learning) && isRecord(expert.learning.trainer) ? expert.learning.trainer : null
  const dataCommon = isRecord(expert.data) && isRecord(expert.data.common) ? expert.data.common : null

  if (learningTrainer && typeof learningTrainer.max_epochs === 'number') {
    lockedFields.push('epochs')
  }
  if (dataCommon && typeof dataCommon.delay === 'number') {
    lockedFields.push('latencySamples')
  }

  return lockedFields
}

export function createTrainingPreset(partial?: Partial<TrainingPresetFile>): TrainingPresetFile {
  const now = new Date().toISOString()
  const values = {
    ...DEFAULT_TRAINING_PRESET_VALUES,
    ...(partial?.values ?? {})
  }
  const author = normalizeTrainingPresetAuthor(partial?.author)
  const rawOrigin = normalizeTrainingPresetOrigin(partial?.origin)
  const origin: TrainingPresetOrigin = {
    app: rawOrigin?.app ?? 'NAM-BOT',
    version: rawOrigin?.version
  }
  const expert: TrainingPresetExpertBlocks = {
    data: partial?.expert?.data ? cloneJson(partial.expert.data) : undefined,
    model: partial?.expert?.model ? cloneJson(partial.expert.model) : undefined,
    learning: partial?.expert?.learning ? cloneJson(partial.expert.learning) : undefined
  }

  return {
    schemaVersion: 1,
    presetKind: 'training',
    id: partial?.id ?? slugifyPresetName(partial?.name ?? now),
    name: partial?.name ?? 'Custom Preset',
    description: partial?.description ?? '',
    category: partial?.category ?? 'custom',
    builtIn: partial?.builtIn ?? false,
    readOnly: partial?.readOnly ?? false,
    visible: partial?.visible ?? true,
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    lockedJobFields: partial?.lockedJobFields ?? computeLockedJobFields(expert),
    values,
    expert,
    author,
    origin
  }
}

export function normalizeTrainingPreset(value: unknown): TrainingPresetFile {
  if (!isRecord(value)) {
    return createTrainingPreset()
  }

  const partial = value as Record<string, unknown>
  const rawValues = isRecord(partial.values) ? partial.values : {}
  const rawExpert = isRecord(partial.expert) ? partial.expert : {}
  const expert: TrainingPresetExpertBlocks = {
    data: isRecord(rawExpert.data) ? cloneRecord(rawExpert.data) : undefined,
    model: normalizeExpertModelShape(rawExpert.model),
    learning: isRecord(rawExpert.learning) ? cloneRecord(rawExpert.learning) : undefined
  }
  const expertNetName = getExpertNetName(expert)
  const inferredArchitectureVersion = inferArchitectureVersion(rawValues, expert)
  const architectureVersion = expertNetName
    ? inferredArchitectureVersion
    : normalizeArchitectureVersion(rawValues.architectureVersion) ?? inferredArchitectureVersion
  const values: TrainingPresetValues = {
    architectureVersion,
    modelFamily: expertNetName ? normalizeModelFamily(expertNetName) : normalizeModelFamily(rawValues.modelFamily),
    architectureSize: expertNetName === 'PackedWaveNet' ? 'packed' : normalizeArchitectureSize(rawValues.architectureSize),
    epochs: asPositiveInt(rawValues.epochs, DEFAULT_TRAINING_PRESET_VALUES.epochs),
    batchSize: asPositiveInt(rawValues.batchSize, DEFAULT_TRAINING_PRESET_VALUES.batchSize),
    learningRate: asFiniteNumber(rawValues.learningRate, DEFAULT_TRAINING_PRESET_VALUES.learningRate),
    learningRateDecay: asFiniteNumber(rawValues.learningRateDecay, DEFAULT_TRAINING_PRESET_VALUES.learningRateDecay),
    ny: asPositiveInt(rawValues.ny, DEFAULT_TRAINING_PRESET_VALUES.ny),
    fitMrstft: asBoolean(rawValues.fitMrstft, DEFAULT_TRAINING_PRESET_VALUES.fitMrstft),
    mrstftWeight: asFiniteNumber(
      rawValues.mrstftWeight,
      asBoolean(rawValues.fitMrstft, DEFAULT_TRAINING_PRESET_VALUES.fitMrstft)
        ? (architectureVersion === 'a2' ? DEFAULT_TRAINING_PRESET_VALUES.mrstftWeight : 0.0002)
        : 0
    ),
    weightDecay: asFiniteNumber(rawValues.weightDecay, architectureVersion === 'a2' ? DEFAULT_TRAINING_PRESET_VALUES.weightDecay : 0),
    outputNormalizeRmsDb: asNullableFiniteNumber(rawValues.outputNormalizeRmsDb, architectureVersion === 'a2' ? DEFAULT_TRAINING_PRESET_VALUES.outputNormalizeRmsDb : null)
  }
  const author = normalizeTrainingPresetAuthor(partial.author)
  const origin = normalizeTrainingPresetOrigin(partial.origin)

  return createTrainingPreset({
    id: asString(partial.id, slugifyPresetName(asString(partial.name, 'custom-preset'))),
    name: asString(partial.name, 'Custom Preset'),
    description: asString(partial.description, ''),
    category:
      partial.category === 'quality'
      || partial.category === 'speed'
      || partial.category === 'architecture'
      || partial.category === 'custom'
        ? partial.category
        : 'custom',
    builtIn: asBoolean(partial.builtIn, false),
    readOnly: asBoolean(partial.readOnly, false),
    visible: asBoolean(partial.visible, true),
    createdAt: asString(partial.createdAt, new Date().toISOString()),
    updatedAt: asString(partial.updatedAt, new Date().toISOString()),
    values,
    expert,
    author,
    origin
  })
}

function normalizeLegacyGearType(value: unknown): NamGearType | '' {
  switch (value) {
    case 'amp':
    case 'pedal':
    case 'pedal_amp':
    case 'amp_cab':
    case 'amp_pedal_cab':
    case 'preamp':
    case 'studio':
      return value
    case 'amp+cab':
    case 'cab':
      return 'amp_cab'
    case 'other':
    default:
      return ''
  }
}

function normalizeLegacyToneType(value: unknown): NamToneType | '' {
  switch (value) {
    case 'clean':
    case 'overdrive':
    case 'crunch':
    case 'hi_gain':
    case 'fuzz':
      return value
    case 'high-gain':
    case 'lead':
      return 'hi_gain'
    case 'other':
    default:
      return ''
  }
}

export function normalizeNamMetadata(value: unknown): NamEmbeddedMetadata {
  if (!isRecord(value)) {
    return cloneJson(defaultJobSpec.metadata)
  }

  return {
    name: asString(value.name, ''),
    modeledBy: asString(value.modeledBy, ''),
    gearType: normalizeLegacyGearType(value.gearType),
    gearMake: asString(value.gearMake, ''),
    gearModel: asString(value.gearModel, ''),
    toneType: normalizeLegacyToneType(value.toneType),
    inputLevelDbu: typeof value.inputLevelDbu === 'number' && Number.isFinite(value.inputLevelDbu) ? value.inputLevelDbu : undefined,
    outputLevelDbu: typeof value.outputLevelDbu === 'number' && Number.isFinite(value.outputLevelDbu) ? value.outputLevelDbu : undefined
  }
}

function normalizePackedSubmodelSelections(value: unknown): JobPackedSubmodelSelection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const selections = value.flatMap((entry): JobPackedSubmodelSelection[] => {
    if (!isRecord(entry)) {
      return []
    }
    const submodelIndex = entry.submodelIndex
    if (typeof submodelIndex !== 'number' || !Number.isInteger(submodelIndex) || submodelIndex < 0) {
      return []
    }

    return [{
      submodelIndex,
      submodelName: typeof entry.submodelName === 'string' ? entry.submodelName : null
    }]
  })

  return selections.length > 0 ? selections : undefined
}

export function normalizeJobSpec(value: unknown): JobSpec {
  const base: JobSpec = {
    ...cloneJson(defaultJobSpec),
    id: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  if (!isRecord(value)) {
    return base
  }

  const legacyLearningSettings = isRecord(value.learningSettings) ? value.learningSettings : {}
  const legacyModelSettings = isRecord(value.modelSettings) ? value.modelSettings : {}
  const hasTrainingOverrides = isRecord(value.trainingOverrides)
  const trainingOverrides = hasTrainingOverrides ? value.trainingOverrides : {}
  const legacyModelType = asString(legacyModelSettings.modelType, '')
  const hasLegacyLatencySamples = Object.prototype.hasOwnProperty.call(trainingOverrides, 'latencySamples')
  const latencyModeFallback: JobLatencyMode = Object.prototype.hasOwnProperty.call(trainingOverrides, 'latencyMode')
    ? defaultJobSpec.trainingOverrides.latencyMode ?? 'auto'
    : hasLegacyLatencySamples ? 'manual' : defaultJobSpec.trainingOverrides.latencyMode ?? 'auto'

  let presetId = typeof value.presetId === 'string' ? value.presetId : base.presetId
  if (!presetId) {
    presetId = legacyModelType.toLowerCase() === 'lstm' ? LEGACY_LSTM_PRESET_ID : DEFAULT_PRESET_ID
  }

  return {
    id: asString(value.id, base.id),
    name: asString(value.name, base.name),
    createdAt: asString(value.createdAt, base.createdAt),
    updatedAt: asString(value.updatedAt, base.updatedAt),
    batchId: asOptionalTrimmedString(value.batchId),
    batchSourceName: asOptionalTrimmedString(value.batchSourceName),
    presetId,
    appendPresetToModelFileName: typeof value.appendPresetToModelFileName === 'boolean'
      ? value.appendPresetToModelFileName
      : false,
    appendEsrToModelFileName: typeof value.appendEsrToModelFileName === 'boolean'
      ? value.appendEsrToModelFileName
      : false,
    copyFinalModelToOutputAudioFolder: typeof value.copyFinalModelToOutputAudioFolder === 'boolean'
      ? value.copyFinalModelToOutputAudioFolder
      : false,
    inputAudioPath: asString(value.inputAudioPath, ''),
    inputAudioIsDefault: typeof value.inputAudioIsDefault === 'boolean' ? value.inputAudioIsDefault : true,
    outputAudioPath: asString(value.outputAudioPath, ''),
    outputRootDir: asString(value.outputRootDir, ''),
    outputRootDirIsDefault: typeof value.outputRootDirIsDefault === 'boolean' ? value.outputRootDirIsDefault : true,
    metadata: normalizeNamMetadata(value.metadata),
    trainingOverrides: {
      epochs: asPositiveInt(trainingOverrides.epochs, asPositiveInt(legacyLearningSettings.epochs, defaultJobSpec.trainingOverrides.epochs ?? 100)),
      latencyMode: normalizeLatencyMode(trainingOverrides.latencyMode, latencyModeFallback),
      latencySamples: Math.round(
        asFiniteNumber(
          trainingOverrides.latencySamples,
          defaultJobSpec.trainingOverrides.latencySamples ?? 0
        )
      ),
      packedSubmodels: normalizePackedSubmodelSelections(trainingOverrides.packedSubmodels)
    },
    uiNotes: asString(value.uiNotes, '')
  }
}

export function createImportedPreset(rawJson: string, nameHint?: string): ImportedPresetResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!isRecord(parsed)) {
    throw new Error('Imported JSON must be an object.')
  }

  if (parsed.presetKind === 'training' || parsed.schemaVersion === 1) {
    return {
      kind: 'full-preset',
      preset: normalizeTrainingPreset(parsed)
    }
  }

  if (isCanonicalModelOverride(parsed)) {
    const net = isRecord(parsed.net) ? parsed.net : null
    const netName = typeof net?.name === 'string' ? net.name : 'WaveNet'
    const architectureVersion = netName === 'PackedWaveNet' ? 'a2' : netName === 'WaveNet' || netName === 'LSTM' ? 'a1' : 'custom'
    return {
      kind: 'expert-config',
      preset: createTrainingPreset({
        name: nameHint || 'Imported Model Config',
        description: 'Created from an imported NAM model config.',
        category: 'custom',
        values: {
          ...DEFAULT_TRAINING_PRESET_VALUES,
          ...(architectureVersion === 'a1' ? A1_TRAINING_PRESET_VALUE_OVERRIDES : {}),
          architectureVersion,
          modelFamily: normalizeModelFamily(netName),
          architectureSize: netName === 'PackedWaveNet' ? 'packed' : 'custom'
        },
        expert: {
          model: parsed
        }
      })
    }
  }

  if (Array.isArray(parsed.layers_configs)) {
    return {
      kind: 'wavenet-snippet',
      preset: createTrainingPreset({
        name: nameHint || 'Imported WaveNet Snippet',
        description: 'Created from an imported WaveNet JSON snippet.',
        category: 'custom',
        values: {
          ...DEFAULT_TRAINING_PRESET_VALUES,
          ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
          modelFamily: 'WaveNet',
          architectureSize: 'custom'
        },
        expert: {
          model: {
            net: {
              name: 'WaveNet',
              config: parsed
            }
          }
        }
      })
    }
  }

  if (typeof parsed.num_layers === 'number' && typeof parsed.hidden_size === 'number') {
    return {
      kind: 'lstm-snippet',
      preset: createTrainingPreset({
        name: nameHint || 'Imported LSTM Snippet',
        description: 'Created from an imported LSTM JSON snippet.',
        category: 'custom',
        values: {
          ...DEFAULT_TRAINING_PRESET_VALUES,
          ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
          modelFamily: 'LSTM',
          architectureSize: 'custom',
          learningRate: 0.01,
          learningRateDecay: 0.005,
          fitMrstft: false,
          mrstftWeight: 0
        },
        expert: {
          model: {
            net: {
              name: 'LSTM',
              config: parsed
            }
          }
        }
      })
    }
  }

  if (parsed.data || parsed.model || parsed.learning) {
    const expert: TrainingPresetExpertBlocks = {
      data: isRecord(parsed.data) ? parsed.data : undefined,
      model: isRecord(parsed.model) ? normalizeExpertModelShape(parsed.model) : undefined,
      learning: isRecord(parsed.learning) ? parsed.learning : undefined
    }
    const architectureVersion = inferArchitectureVersion({}, expert)
    const net = isRecord(expert.model) && isRecord(expert.model.net) ? expert.model.net : null
    const netName = typeof net?.name === 'string' ? net.name : undefined

    return {
      kind: 'expert-config',
      preset: createTrainingPreset({
        name: nameHint || 'Imported Expert Config',
        description: 'Created from imported raw NAM config blocks.',
        category: 'custom',
        values: {
          ...DEFAULT_TRAINING_PRESET_VALUES,
          ...(architectureVersion === 'a1' ? A1_TRAINING_PRESET_VALUE_OVERRIDES : {}),
          architectureVersion,
          ...(netName ? { modelFamily: normalizeModelFamily(netName) } : {}),
          architectureSize: netName === 'PackedWaveNet' ? 'packed' : netName ? 'custom' : DEFAULT_TRAINING_PRESET_VALUES.architectureSize
        },
        expert: {
          data: expert.data,
          model: expert.model,
          learning: expert.learning
        }
      })
    }
  }

  throw new Error('Unsupported JSON shape. Paste a full preset, a data/model/learning config object, or a WaveNet/LSTM model snippet.')
}

export function buildBuiltInPresets(): TrainingPresetFile[] {
  return [
    createTrainingPreset({
      id: DEFAULT_PRESET_ID,
      name: 'A2 Packed WaveNet',
      description: 'Official NAM A2 packed architecture. Trains one model that contains A2-Full and A2-Lite submodels.',
      category: 'quality',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        architectureVersion: 'a2',
        modelFamily: 'PackedWaveNet',
        architectureSize: 'packed',
        epochs: 200
      }
    }),
    createTrainingPreset({
      id: A2_HEAVY_12_PRESET_ID,
      name: 'A2 Packed WaveNet Heavy 12',
      description: 'Experimental A2 packed architecture with official A2-Lite and A2-Full submodels plus a 12-channel heavy tier for higher-quality captures at increased CPU cost.',
      category: 'quality',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        architectureVersion: 'a2',
        modelFamily: 'PackedWaveNet',
        architectureSize: 'packed',
        epochs: 400
      },
      expert: {
        model: {
          net: buildA2PackedNetConfig(A2_HEAVY_12_PACKED_CHANNELS)
        }
      }
    }),
    createTrainingPreset({
      id: A2_ULTRA_20_PRESET_ID,
      name: 'A2 Packed WaveNet Ultra 20',
      description: 'Experimental A2 packed architecture with A2-Lite, A2-Full, A2-Heavy, A2-Ultra, and A2-Mammoth submodels for maximum-quality local testing at substantially increased CPU cost.',
      category: 'quality',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        architectureVersion: 'a2',
        modelFamily: 'PackedWaveNet',
        architectureSize: 'packed',
        epochs: 666
      },
      expert: {
        model: {
          net: buildA2PackedNetConfig(A2_ULTRA_20_PACKED_CHANNELS)
        }
      }
    }),
    createTrainingPreset({
      id: A1_STANDARD_PRESET_ID,
      name: 'Standard WaveNet',
      description: 'NAM A1 WaveNet standard architecture.',
      category: 'quality',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
        modelFamily: 'WaveNet',
        architectureSize: 'standard',
        learningRateDecay: 0.007
      }
    }),
    createTrainingPreset({
      id: 'wavenet-lite',
      name: 'Lite WaveNet',
      description: 'Official NAM WaveNet lite architecture.',
      category: 'architecture',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
        modelFamily: 'WaveNet',
        architectureSize: 'lite',
        learningRateDecay: 0.007
      }
    }),
    createTrainingPreset({
      id: 'wavenet-feather',
      name: 'Feather WaveNet',
      description: 'Official NAM WaveNet feather architecture.',
      category: 'architecture',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
        modelFamily: 'WaveNet',
        architectureSize: 'feather',
        learningRateDecay: 0.007
      }
    }),
    createTrainingPreset({
      id: 'wavenet-nano',
      name: 'Nano WaveNet',
      description: 'Official NAM WaveNet nano architecture.',
      category: 'speed',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
        modelFamily: 'WaveNet',
        architectureSize: 'nano',
        learningRateDecay: 0.007
      }
    }),
    createTrainingPreset({
      id: LEGACY_LSTM_PRESET_ID,
      name: 'LSTM Standard (Compatibility)',
      description: 'Compatibility preset to preserve older LSTM drafts.',
      category: 'custom',
      builtIn: true,
      readOnly: true,
      visible: false,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        ...A1_TRAINING_PRESET_VALUE_OVERRIDES,
        modelFamily: 'LSTM',
        architectureSize: 'standard',
        learningRate: 0.01,
        learningRateDecay: 0.005,
        fitMrstft: false,
        mrstftWeight: 0
      }
    })
  ]
}

export const builtInTrainingPresets = buildBuiltInPresets()

export function getBuiltInPreset(presetId: string | null | undefined): TrainingPresetFile {
  const preset = builtInTrainingPresets.find((entry) => entry.id === presetId)
  return preset ?? builtInTrainingPresets.find((entry) => entry.id === DEFAULT_PRESET_ID) ?? builtInTrainingPresets[0]
}

export function getPresetArchitectureVersion(preset: TrainingPresetFile): NamArchitectureVersion {
  return preset.values.architectureVersion
}

export function isA2TrainingPreset(preset: TrainingPresetFile): boolean {
  return getPresetArchitectureVersion(preset) === 'a2'
}

export function formatPresetArchitectureTag(preset: TrainingPresetFile): string {
  return getPresetArchitectureVersion(preset).toUpperCase()
}

export function buildNamMetadataPatch(metadata: NamEmbeddedMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (metadata.name?.trim()) {
    result.name = metadata.name.trim()
  }
  if (metadata.modeledBy?.trim()) {
    result.modeled_by = metadata.modeledBy.trim()
  }
  if (metadata.gearMake?.trim()) {
    result.gear_make = metadata.gearMake.trim()
  }
  if (metadata.gearModel?.trim()) {
    result.gear_model = metadata.gearModel.trim()
  }
  if (metadata.gearType) {
    result.gear_type = metadata.gearType
  }
  if (metadata.toneType) {
    result.tone_type = metadata.toneType
  }
  if (typeof metadata.inputLevelDbu === 'number' && Number.isFinite(metadata.inputLevelDbu)) {
    result.input_level_dbu = metadata.inputLevelDbu
  }
  if (typeof metadata.outputLevelDbu === 'number' && Number.isFinite(metadata.outputLevelDbu)) {
    result.output_level_dbu = metadata.outputLevelDbu
  }

  return result
}
