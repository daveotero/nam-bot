import { create } from 'zustand'
import { getPresetArchitectureVersion, type JobSpec, type TrainingPresetFile, type JobRuntimeState } from '../../shared/training'
import { createDefaultUpdateStatus, type UpdateStatus } from '../../shared/update'

const epochRunnerRewardPresetId = 'epoch-runner-reward'
const epochRunnerRewardPresetName = 'Converged Night Run'

function isEpochRunnerRewardPreset(preset: TrainingPresetFile): boolean {
  return preset.id === epochRunnerRewardPresetId
    || preset.name === epochRunnerRewardPresetName
    || preset.description.includes('Epoch Runner')
}

function getPresetSortBucket(preset: TrainingPresetFile): number {
  if (preset.builtIn) {
    return 2
  }

  if (isEpochRunnerRewardPreset(preset)) {
    return 1
  }

  return 0
}

function getPresetArchitectureSortBucket(preset: TrainingPresetFile): number {
  switch (getPresetArchitectureVersion(preset)) {
    case 'a2':
      return 0
    case 'a1':
      return 1
    case 'custom':
    default:
      return 2
  }
}

function sortPresets(presets: TrainingPresetFile[]): TrainingPresetFile[] {
  return [...presets].sort((left, right) => {
    const leftArchitectureBucket = getPresetArchitectureSortBucket(left)
    const rightArchitectureBucket = getPresetArchitectureSortBucket(right)

    if (leftArchitectureBucket !== rightArchitectureBucket) {
      return leftArchitectureBucket - rightArchitectureBucket
    }

    const leftBucket = getPresetSortBucket(left)
    const rightBucket = getPresetSortBucket(right)

    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket
    }

    return left.name.localeCompare(right.name)
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function shouldAutoLoadResource(
  value: unknown,
  loading: boolean,
  error: string | null
): boolean {
  return value == null && !loading && error == null
}

export type BackendMode = 'conda-name' | 'conda-prefix' | 'direct-python'

export interface AppSettings {
  condaExecutablePath: string | null
  backendMode: BackendMode
  environmentName: string | null
  environmentPrefixPath: string | null
  pythonExecutablePath: string | null
  defaultOutputRoot: string | null
  defaultWorkspaceRoot: string | null
  preferredLaunchMode: 'nam-full' | 'python-wrapper'
  autoOpenResultsFolder: boolean
  persistQueueOnExit: boolean
  logRetentionDays: number
  defaultAuthorName: string
  defaultAuthorUrl: string
}

export interface BackendCheckResult {
  ok: boolean
  code: string
  title: string
  message: string
  detail?: string
  suggestion?: string
}

export interface BackendValidationSummary {
  checkedAt: string
  condaReachable: BackendCheckResult
  environmentReachable: BackendCheckResult
  pythonReachable: BackendCheckResult
  namInstalled: BackendCheckResult
  namFullAvailable: BackendCheckResult
  overallOk: boolean
}

export type AcceleratorDiagnosticsStatus =
  | 'ready'
  | 'advisory'
  | 'cpu_only'
  | 'not_visible'
  | 'not_checked'
  | 'error'

export type AcceleratorDiagnosticsIssue =
  | 'not_checked'
  | 'conda_not_configured'
  | 'conda_unreachable'
  | 'environment_not_configured'
  | 'probe_launch_failed'
  | 'probe_payload_missing'
  | 'probe_payload_malformed'
  | 'lightning_security_check_failed'
  | 'lightning_vulnerable'
  | 'torch_missing'
  | 'torch_import_failed'
  | 'nam_missing'
  | 'nam_import_failed'
  | 'lightning_mismatch'
  | 'torch_cpu_only'
  | 'cuda_not_visible'
  | 'cuda_ready'
  | 'mps_ready'
  | 'rocm_ready'

export interface AcceleratorDiagnosticsSummary {
  checkedAt: string
  status: AcceleratorDiagnosticsStatus
  issue: AcceleratorDiagnosticsIssue
  headline: string
  detail: string
  suggestion?: string
  pythonVersion: string | null
  pythonExecutable: string | null
  pythonPlatform: string | null
  torchImportOk: boolean | null
  torchVersion: string | null
  torchCudaVersion: string | null
  hipVersion: string | null
  namVersion: string | null
  lightningPackage: string | null
  lightningVersion: string | null
  cudaAvailable: boolean | null
  cudaDeviceCount: number | null
  deviceName: string | null
  mpsAvailable: boolean | null
  namImportOk: boolean | null
  lightningImportOk: boolean | null
  lightningCudaAvailable: boolean | null
  hostNvidiaSmiAvailable: boolean | null
  hostNvidiaGpuName: string | null
  hostDriverVersion: string | null
  errors: string[]
}

export type TrainingLaunchDiagnosticsStatus =
  | 'ready'
  | 'advisory'
  | 'not_checked'
  | 'error'

export type TrainingLaunchDiagnosticsIssue =
  | 'ready'
  | 'not_checked'
  | 'conda_not_configured'
  | 'conda_unreachable'
  | 'environment_not_configured'
  | 'direct_python_unsupported'
  | 'lightning_security_check_failed'
  | 'lightning_vulnerable'
  | 'workspace_unwritable'
  | 'pty_launch_failed'
  | 'pty_launch_timeout'
  | 'pty_payload_missing'
  | 'nam_full_pty_failed'
  | 'nam_full_pty_timeout'
  | 'mac_app_on_dmg'
  | 'mac_app_translocated'
  | 'bare_conda_path'

export type TrainingLaunchCheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface TrainingLaunchCheckResult {
  status: TrainingLaunchCheckStatus
  code: string
  title: string
  message: string
  detail?: string
  suggestion?: string
  command?: string
  outputTail?: string
}

export interface TrainingLaunchDiagnosticsSummary {
  checkedAt: string
  status: TrainingLaunchDiagnosticsStatus
  issue: TrainingLaunchDiagnosticsIssue
  headline: string
  detail: string
  suggestion?: string
  workspaceRoot: string | null
  workspacePath: string | null
  appExecutablePath: string | null
  processArch: string
  nodePtyHelperPath: string | null
  nodePtyHelperExists: boolean | null
  nodePtyHelperExecutable: boolean | null
  nodePtyHelperMode: string | null
  nodePtyHelperError: string | null
  checks: TrainingLaunchCheckResult[]
  errors: string[]
}

export interface CondaDiscoverySummary {
  checkedAt: string
  isOnPath: boolean
  command: string
  resolvedPath: string | null
}

export interface NamVersionInfo {
  installedVersion: string | null
  latestVersion: string | null
  isUpToDate: boolean | null
  latestReleaseUrl: string | null
  publishedAt: string | null
  checkStatus: 'ok' | 'offline' | 'rate_limited' | 'error'
  errorMessage?: string
}

export type PresetEditorMode = 'manual' | 'import'

export interface PresetEditorSession {
  title: string
  initialSnapshot: string
  preset: TrainingPresetFile
  dataJson: string
  modelJson: string
  learningJson: string
  editorMode: PresetEditorMode
  importJson: string
}

export type JobInputAudioMode = 'default' | 'custom'
export type JobOutputRootMode = 'output-audio' | 'settings-default' | 'custom'

export interface JobEditorSession {
  title: string
  initialSnapshot: string
  job: JobSpec
  inputMode: JobInputAudioMode
  outputRootMode: JobOutputRootMode
  showValidationErrors: boolean
}

interface AppState {
  settings: AppSettings | null
  validation: BackendValidationSummary | null
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null
  condaDiscovery: CondaDiscoverySummary | null
  namVersionInfo: NamVersionInfo | null
  updateStatus: UpdateStatus
  presets: TrainingPresetFile[]
  presetEditorSession: PresetEditorSession | null
  jobEditorSession: JobEditorSession | null
  isLoading: boolean;
  isSettingsSaving: boolean;
  isBackendValidationLoading: boolean;
  isAcceleratorDiagnosticsLoading: boolean;
  isTrainingLaunchDiagnosticsLoading: boolean;
  isNamVersionInfoLoading: boolean;
  settingsLoadError: string | null;
  settingsSaveError: string | null;
  validationError: string | null;
  acceleratorDiagnosticsError: string | null;
  trainingLaunchDiagnosticsError: string | null;
  namVersionInfoError: string | null;
  settingsRevision: number;
  isTraining: boolean;
  drafts: JobSpec[];
  queue: JobRuntimeState[];
  
  setSettings: (settings: AppSettings) => void
  setValidation: (validation: BackendValidationSummary) => void
  setAcceleratorDiagnostics: (diagnostics: AcceleratorDiagnosticsSummary) => void
  setTrainingLaunchDiagnostics: (diagnostics: TrainingLaunchDiagnosticsSummary) => void
  setCondaDiscovery: (condaDiscovery: CondaDiscoverySummary) => void
  setNamVersionInfo: (namVersionInfo: NamVersionInfo | null) => void
  setUpdateStatus: (updateStatus: UpdateStatus) => void
  setPresets: (presets: TrainingPresetFile[]) => void
  setPresetEditorSession: (session: PresetEditorSession | null) => void
  clearPresetEditorSession: () => void
  setJobEditorSession: (session: JobEditorSession | null) => void
  clearJobEditorSession: () => void
  setLoading: (loading: boolean) => void
  setAcceleratorDiagnosticsLoading: (loading: boolean) => void
  setTrainingLaunchDiagnosticsLoading: (loading: boolean) => void
  setIsTraining: (isTraining: boolean) => void
  setDrafts: (drafts: JobSpec[] | ((prev: JobSpec[]) => JobSpec[])) => void
  setQueue: (queue: JobRuntimeState[] | ((prev: JobRuntimeState[]) => JobRuntimeState[])) => void
  
  loadSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  validateBackend: () => Promise<void>
  loadAcceleratorDiagnostics: () => Promise<void>
  loadTrainingLaunchDiagnostics: () => Promise<void>
  loadNamVersionInfo: () => Promise<void>
  detectConda: () => Promise<void>
  loadUpdateStatus: () => Promise<void>
  loadPresets: () => Promise<void>
  loadJobs: () => Promise<void>
  subscribeToJobEvents: () => (() => void)
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  validation: null,
  acceleratorDiagnostics: null,
  trainingLaunchDiagnostics: null,
  condaDiscovery: null,
  namVersionInfo: null,
  updateStatus: createDefaultUpdateStatus('0.0.0'),
  presets: [],
  presetEditorSession: null,
  jobEditorSession: null,
  isLoading: false,
  isSettingsSaving: false,
  isBackendValidationLoading: false,
  isAcceleratorDiagnosticsLoading: false,
  isTrainingLaunchDiagnosticsLoading: false,
  isNamVersionInfoLoading: false,
  settingsLoadError: null,
  settingsSaveError: null,
  validationError: null,
  acceleratorDiagnosticsError: null,
  trainingLaunchDiagnosticsError: null,
  namVersionInfoError: null,
  settingsRevision: 0,
  isTraining: false,
  drafts: [],
  queue: [],
  
  setSettings: (settings) => set({ settings }),
  setValidation: (validation) => set({ validation, validationError: null }),
  setAcceleratorDiagnostics: (acceleratorDiagnostics) => set({ acceleratorDiagnostics, acceleratorDiagnosticsError: null }),
  setTrainingLaunchDiagnostics: (trainingLaunchDiagnostics) => set({ trainingLaunchDiagnostics, trainingLaunchDiagnosticsError: null }),
  setCondaDiscovery: (condaDiscovery) => set({ condaDiscovery }),
  setNamVersionInfo: (namVersionInfo) => set({ namVersionInfo, namVersionInfoError: null }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  setPresets: (presets) => set({ presets: sortPresets(presets) }),
  setPresetEditorSession: (presetEditorSession) => set({ presetEditorSession }),
  clearPresetEditorSession: () => set({ presetEditorSession: null }),
  setJobEditorSession: (jobEditorSession) => set({ jobEditorSession }),
  clearJobEditorSession: () => set({ jobEditorSession: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setAcceleratorDiagnosticsLoading: (isAcceleratorDiagnosticsLoading) => set({ isAcceleratorDiagnosticsLoading }),
  setTrainingLaunchDiagnosticsLoading: (isTrainingLaunchDiagnosticsLoading) => set({ isTrainingLaunchDiagnosticsLoading }),
  setIsTraining: (isTraining) => set({ isTraining }),
  setDrafts: (drafts) => set((state) => ({ 
    drafts: typeof drafts === 'function' ? drafts(state.drafts) : drafts 
  })),
  setQueue: (queue) => set((state) => ({ 
    queue: typeof queue === 'function' ? queue(state.queue) : queue 
  })),
  
  loadSettings: async () => {
    set({ isLoading: true, settingsLoadError: null })
    try {
      const settings = await window.namBot.settings.get() as AppSettings
      set({ settings })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ settingsLoadError: getErrorMessage(error) })
    } finally {
      set({ isLoading: false })
    }
  },
  
  saveSettings: async (settings) => {
    set({ isSettingsSaving: true, settingsSaveError: null })
    try {
      await window.namBot.settings.save(settings)
      set((state) => ({
        settings,
        settingsRevision: state.settingsRevision + 1,
        validation: null,
        acceleratorDiagnostics: null,
        trainingLaunchDiagnostics: null,
        namVersionInfo: null,
        validationError: null,
        acceleratorDiagnosticsError: null,
        trainingLaunchDiagnosticsError: null,
        namVersionInfoError: null
      }))
    } catch (error) {
      console.error('Failed to save settings:', error)
      set({ settingsSaveError: getErrorMessage(error) })
      throw error
    } finally {
      set({ isSettingsSaving: false })
    }
  },
  
  validateBackend: async () => {
    if (get().isBackendValidationLoading) {
      return
    }
    const revision = get().settingsRevision
    set({ isBackendValidationLoading: true, validationError: null })
    try {
      const validation = await window.namBot.settings.validate() as BackendValidationSummary
      if (get().settingsRevision === revision) {
        set({ validation })
      }
    } catch (error) {
      console.error('Failed to validate backend:', error)
      if (get().settingsRevision === revision) {
        set({ validationError: getErrorMessage(error) })
      }
    } finally {
      set({ isBackendValidationLoading: false })
    }
  },

  loadAcceleratorDiagnostics: async () => {
    if (get().isAcceleratorDiagnosticsLoading) {
      return
    }
    const revision = get().settingsRevision
    set({ isAcceleratorDiagnosticsLoading: true, acceleratorDiagnosticsError: null })
    try {
      const acceleratorDiagnostics =
        await window.namBot.settings.getAcceleratorDiagnostics() as AcceleratorDiagnosticsSummary
      if (get().settingsRevision === revision) {
        set({ acceleratorDiagnostics })
      }
    } catch (error) {
      console.error('Failed to load accelerator diagnostics:', error)
      if (get().settingsRevision === revision) {
        set({ acceleratorDiagnosticsError: getErrorMessage(error) })
      }
    } finally {
      set({ isAcceleratorDiagnosticsLoading: false })
    }
  },

  loadTrainingLaunchDiagnostics: async () => {
    if (get().isTrainingLaunchDiagnosticsLoading) {
      return
    }
    const revision = get().settingsRevision
    set({ isTrainingLaunchDiagnosticsLoading: true, trainingLaunchDiagnosticsError: null })
    try {
      const trainingLaunchDiagnostics =
        await window.namBot.settings.getTrainingLaunchDiagnostics() as TrainingLaunchDiagnosticsSummary
      if (get().settingsRevision === revision) {
        set({ trainingLaunchDiagnostics })
      }
    } catch (error) {
      console.error('Failed to load training launch diagnostics:', error)
      if (get().settingsRevision === revision) {
        set({ trainingLaunchDiagnosticsError: getErrorMessage(error) })
      }
    } finally {
      set({ isTrainingLaunchDiagnosticsLoading: false })
    }
  },

  loadNamVersionInfo: async () => {
    if (get().isNamVersionInfoLoading) {
      return
    }
    const revision = get().settingsRevision
    set({ isNamVersionInfoLoading: true, namVersionInfoError: null })
    try {
      const namVersionInfo = await window.namBot.settings.getNamVersionInfo() as NamVersionInfo
      if (get().settingsRevision === revision) {
        set({ namVersionInfo })
      }
    } catch (error) {
      console.error('Failed to load NAM version info:', error)
      if (get().settingsRevision === revision) {
        set({ namVersionInfo: null, namVersionInfoError: getErrorMessage(error) })
      }
    } finally {
      set({ isNamVersionInfoLoading: false })
    }
  },

  detectConda: async () => {
    try {
      const condaDiscovery = await window.namBot.settings.detectConda() as CondaDiscoverySummary
      set({ condaDiscovery })
    } catch (error) {
      console.error('Failed to detect Conda on PATH:', error)
    }
  },

  loadUpdateStatus: async () => {
    try {
      const updateStatus = await window.namBot.updates.getStatus()
      set({ updateStatus })
    } catch (error) {
      console.error('Failed to load update status:', error)
    }
  },
  
  loadPresets: async () => {
    try {
      const presets = await window.namBot.presets.list() as TrainingPresetFile[]
      set({ presets: sortPresets(presets) })
    } catch (error) {
      console.error('Failed to load presets:', error)
    }
  },

  loadJobs: async () => {
    try {
      const [drafts, queue] = await Promise.all([
        window.namBot.jobs.listDrafts(),
        window.namBot.jobs.listQueue()
      ])
      set({ drafts: drafts as JobSpec[], queue: queue as JobRuntimeState[] })
    } catch (error) {
      console.error('Failed to load jobs:', error)
    }
  },

  subscribeToJobEvents: () => {
    const unsubQueue = window.namBot.events.onQueueUpdated((updatedQueue) => {
      set({ queue: updatedQueue as JobRuntimeState[] })
    })

    const unsubJob = window.namBot.events.onJobUpdated((updatedState) => {
      const runtime = updatedState as JobRuntimeState
      const { queue: previousQueue } = get()
      const existingIndex = previousQueue.findIndex((entry) => entry.jobId === runtime.jobId)
      if (existingIndex !== -1) {
        const nextQueue = [...previousQueue]
        nextQueue[existingIndex] = runtime
        set({ queue: nextQueue })
      }
    })

    return () => {
      unsubQueue()
      unsubJob()
    }
  }
}))
