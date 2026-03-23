import { create } from 'zustand'
import type { JobSpec, TrainingPresetFile, JobRuntimeState } from '../../shared/training'
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

function sortPresets(presets: TrainingPresetFile[]): TrainingPresetFile[] {
  return [...presets].sort((left, right) => {
    const leftBucket = getPresetSortBucket(left)
    const rightBucket = getPresetSortBucket(right)

    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket
    }

    return left.name.localeCompare(right.name)
  })
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
  | 'torch_missing'
  | 'torch_import_failed'
  | 'nam_missing'
  | 'nam_import_failed'
  | 'lightning_mismatch'
  | 'torch_cpu_only'
  | 'cuda_not_visible'
  | 'cuda_ready'
  | 'mps_ready'

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
  condaDiscovery: CondaDiscoverySummary | null
  namVersionInfo: NamVersionInfo | null
  updateStatus: UpdateStatus
  presets: TrainingPresetFile[]
  presetEditorSession: PresetEditorSession | null
  jobEditorSession: JobEditorSession | null
  isLoading: boolean;
  isAcceleratorDiagnosticsLoading: boolean;
  isTraining: boolean;
  drafts: JobSpec[];
  queue: JobRuntimeState[];
  
  setSettings: (settings: AppSettings) => void
  setValidation: (validation: BackendValidationSummary) => void
  setAcceleratorDiagnostics: (diagnostics: AcceleratorDiagnosticsSummary) => void
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
  setIsTraining: (isTraining: boolean) => void
  setDrafts: (drafts: JobSpec[] | ((prev: JobSpec[]) => JobSpec[])) => void
  setQueue: (queue: JobRuntimeState[] | ((prev: JobRuntimeState[]) => JobRuntimeState[])) => void
  
  loadSettings: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  validateBackend: () => Promise<void>
  loadAcceleratorDiagnostics: () => Promise<void>
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
  condaDiscovery: null,
  namVersionInfo: null,
  updateStatus: createDefaultUpdateStatus('0.0.0'),
  presets: [],
  presetEditorSession: null,
  jobEditorSession: null,
  isLoading: false,
  isAcceleratorDiagnosticsLoading: false,
  isTraining: false,
  drafts: [],
  queue: [],
  
  setSettings: (settings) => set({ settings }),
  setValidation: (validation) => set({ validation }),
  setAcceleratorDiagnostics: (acceleratorDiagnostics) => set({ acceleratorDiagnostics }),
  setCondaDiscovery: (condaDiscovery) => set({ condaDiscovery }),
  setNamVersionInfo: (namVersionInfo) => set({ namVersionInfo }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  setPresets: (presets) => set({ presets: sortPresets(presets) }),
  setPresetEditorSession: (presetEditorSession) => set({ presetEditorSession }),
  clearPresetEditorSession: () => set({ presetEditorSession: null }),
  setJobEditorSession: (jobEditorSession) => set({ jobEditorSession }),
  clearJobEditorSession: () => set({ jobEditorSession: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setAcceleratorDiagnosticsLoading: (isAcceleratorDiagnosticsLoading) => set({ isAcceleratorDiagnosticsLoading }),
  setIsTraining: (isTraining) => set({ isTraining }),
  setDrafts: (drafts) => set((state) => ({ 
    drafts: typeof drafts === 'function' ? drafts(state.drafts) : drafts 
  })),
  setQueue: (queue) => set((state) => ({ 
    queue: typeof queue === 'function' ? queue(state.queue) : queue 
  })),
  
  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const settings = await window.namBot.settings.get() as AppSettings
      set({ settings })
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      set({ isLoading: false })
    }
  },
  
  saveSettings: async (settings) => {
    set({ isLoading: true })
    try {
      await window.namBot.settings.save(settings)
      set({ settings })
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      set({ isLoading: false })
    }
  },
  
  validateBackend: async () => {
    set({ isLoading: true, validation: null })
    try {
      const validation = await window.namBot.settings.validate() as BackendValidationSummary
      set({ validation })
    } catch (error) {
      console.error('Failed to validate backend:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadAcceleratorDiagnostics: async () => {
    set({ isAcceleratorDiagnosticsLoading: true, acceleratorDiagnostics: null })
    try {
      const acceleratorDiagnostics =
        await window.namBot.settings.getAcceleratorDiagnostics() as AcceleratorDiagnosticsSummary
      set({ acceleratorDiagnostics })
    } catch (error) {
      console.error('Failed to load accelerator diagnostics:', error)
    } finally {
      set({ isAcceleratorDiagnosticsLoading: false })
    }
  },

  loadNamVersionInfo: async () => {
    try {
      const namVersionInfo = await window.namBot.settings.getNamVersionInfo() as NamVersionInfo
      set({ namVersionInfo })
    } catch (error) {
      console.error('Failed to load NAM version info:', error)
      set({ namVersionInfo: null })
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
