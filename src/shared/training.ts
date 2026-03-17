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
export type ModelFamily = 'WaveNet' | 'LSTM'
export type ArchitectureSize = 'standard' | 'lite' | 'feather' | 'nano' | 'custom'
export type NamGearType = 'amp' | 'pedal' | 'pedal_amp' | 'amp_cab' | 'amp_pedal_cab' | 'preamp' | 'studio'
export type NamToneType = 'clean' | 'overdrive' | 'crunch' | 'hi_gain' | 'fuzz'

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
  remaining?: string | null
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

export interface JobCheckpointSummary {
  checkpointCount: number
  latestCheckpointEpoch?: number | null
  bestValidationEsr?: number | null
  bestValidationMse?: number | null
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
  latencySamples?: number
}

export interface JobSpec {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  presetId: string | null
  appendPresetToModelFileName: boolean
  appendEsrToModelFileName: boolean
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
  modelFamily: ModelFamily
  architectureSize: ArchitectureSize
  epochs: number
  batchSize: number
  learningRate: number
  learningRateDecay: number
  ny: number
  fitMrstft: boolean
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

export const DEFAULT_PRESET_ID = 'wavenet-standard'
export const LEGACY_LSTM_PRESET_ID = 'compat-lstm-standard'

export const DEFAULT_TRAINING_PRESET_VALUES: TrainingPresetValues = {
  modelFamily: 'WaveNet',
  architectureSize: 'standard',
  epochs: 100,
  batchSize: 16,
  learningRate: 0.004,
  learningRateDecay: 0.007,
  ny: 8192,
  fitMrstft: true
}

export const defaultJobSpec: Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'New Job',
  presetId: DEFAULT_PRESET_ID,
  appendPresetToModelFileName: false,
  appendEsrToModelFileName: false,
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
    epochs: DEFAULT_TRAINING_PRESET_VALUES.epochs,
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

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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
  const configs: Record<Exclude<ArchitectureSize, 'custom'>, Record<string, unknown>> = {
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

  if (size === 'custom') {
    return cloneJson(configs.standard)
  }

  return cloneJson(configs[size])
}

export function buildLstmConfig(size: ArchitectureSize): Record<string, unknown> {
  const configs: Record<Exclude<ArchitectureSize, 'custom'>, Record<string, unknown>> = {
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

  if (size === 'custom') {
    return cloneJson(configs.standard)
  }

  return cloneJson(configs[size])
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
  const expert: TrainingPresetExpertBlocks = {
    data: isRecord(partial.expert) && isRecord(partial.expert.data) ? partial.expert.data : undefined,
    model: isRecord(partial.expert) && isRecord(partial.expert.model) ? partial.expert.model : undefined,
    learning: isRecord(partial.expert) && isRecord(partial.expert.learning) ? partial.expert.learning : undefined
  }
  const author = normalizeTrainingPresetAuthor(partial.author)
  const origin = normalizeTrainingPresetOrigin(partial.origin)

  const rawValues = isRecord(partial.values) ? partial.values : {}
  const values: TrainingPresetValues = {
    modelFamily: rawValues.modelFamily === 'LSTM' ? 'LSTM' : 'WaveNet',
    architectureSize:
      rawValues.architectureSize === 'lite'
      || rawValues.architectureSize === 'feather'
      || rawValues.architectureSize === 'nano'
      || rawValues.architectureSize === 'custom'
        ? rawValues.architectureSize
        : 'standard',
    epochs: asPositiveInt(rawValues.epochs, DEFAULT_TRAINING_PRESET_VALUES.epochs),
    batchSize: asPositiveInt(rawValues.batchSize, DEFAULT_TRAINING_PRESET_VALUES.batchSize),
    learningRate: asFiniteNumber(rawValues.learningRate, DEFAULT_TRAINING_PRESET_VALUES.learningRate),
    learningRateDecay: asFiniteNumber(rawValues.learningRateDecay, DEFAULT_TRAINING_PRESET_VALUES.learningRateDecay),
    ny: asPositiveInt(rawValues.ny, DEFAULT_TRAINING_PRESET_VALUES.ny),
    fitMrstft: asBoolean(rawValues.fitMrstft, DEFAULT_TRAINING_PRESET_VALUES.fitMrstft)
  }

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
  const trainingOverrides = isRecord(value.trainingOverrides) ? value.trainingOverrides : {}
  const legacyModelType = asString(legacyModelSettings.modelType, '')

  let presetId = typeof value.presetId === 'string' ? value.presetId : base.presetId
  if (!presetId) {
    presetId = legacyModelType.toLowerCase() === 'lstm' ? LEGACY_LSTM_PRESET_ID : DEFAULT_PRESET_ID
  }

  return {
    id: asString(value.id, base.id),
    name: asString(value.name, base.name),
    createdAt: asString(value.createdAt, base.createdAt),
    updatedAt: asString(value.updatedAt, base.updatedAt),
    presetId,
    appendPresetToModelFileName: typeof value.appendPresetToModelFileName === 'boolean'
      ? value.appendPresetToModelFileName
      : false,
    appendEsrToModelFileName: typeof value.appendEsrToModelFileName === 'boolean'
      ? value.appendEsrToModelFileName
      : false,
    inputAudioPath: asString(value.inputAudioPath, ''),
    inputAudioIsDefault: typeof value.inputAudioIsDefault === 'boolean' ? value.inputAudioIsDefault : true,
    outputAudioPath: asString(value.outputAudioPath, ''),
    outputRootDir: asString(value.outputRootDir, ''),
    outputRootDirIsDefault: typeof value.outputRootDirIsDefault === 'boolean' ? value.outputRootDirIsDefault : true,
    metadata: normalizeNamMetadata(value.metadata),
    trainingOverrides: {
      epochs: asPositiveInt(trainingOverrides.epochs, asPositiveInt(legacyLearningSettings.epochs, defaultJobSpec.trainingOverrides.epochs ?? 100)),
      latencySamples: Math.round(
        asFiniteNumber(
          trainingOverrides.latencySamples,
          defaultJobSpec.trainingOverrides.latencySamples ?? 0
        )
      )
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

  if (Array.isArray(parsed.layers_configs)) {
    return {
      kind: 'wavenet-snippet',
      preset: createTrainingPreset({
        name: nameHint || 'Imported WaveNet Snippet',
        description: 'Created from an imported WaveNet JSON snippet.',
        category: 'custom',
        values: {
          ...DEFAULT_TRAINING_PRESET_VALUES,
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
          modelFamily: 'LSTM',
          architectureSize: 'custom',
          learningRate: 0.01,
          learningRateDecay: 0.005
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
    return {
      kind: 'expert-config',
      preset: createTrainingPreset({
        name: nameHint || 'Imported Expert Config',
        description: 'Created from imported raw NAM config blocks.',
        category: 'custom',
        expert: {
          data: isRecord(parsed.data) ? parsed.data : undefined,
          model: isRecord(parsed.model) ? parsed.model : undefined,
          learning: isRecord(parsed.learning) ? parsed.learning : undefined
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
      name: 'Standard WaveNet',
      description: 'Official NAM WaveNet standard architecture.',
      category: 'quality',
      builtIn: true,
      readOnly: true,
      visible: true,
      values: {
        ...DEFAULT_TRAINING_PRESET_VALUES,
        modelFamily: 'WaveNet',
        architectureSize: 'standard'
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
        modelFamily: 'WaveNet',
        architectureSize: 'lite'
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
        modelFamily: 'WaveNet',
        architectureSize: 'feather'
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
        modelFamily: 'WaveNet',
        architectureSize: 'nano'
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
        modelFamily: 'LSTM',
        architectureSize: 'standard',
        learningRate: 0.01,
        learningRateDecay: 0.005,
        fitMrstft: false
      }
    })
  ]
}

export const builtInTrainingPresets = buildBuiltInPresets()

export function getBuiltInPreset(presetId: string | null | undefined): TrainingPresetFile {
  const preset = builtInTrainingPresets.find((entry) => entry.id === presetId)
  return preset ?? builtInTrainingPresets.find((entry) => entry.id === DEFAULT_PRESET_ID) ?? builtInTrainingPresets[0]
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
