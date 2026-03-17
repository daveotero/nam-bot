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

export const defaultSettings: AppSettings = {
  condaExecutablePath: process.platform === 'win32' ? 'conda.exe' : 'conda',
  backendMode: 'conda-name',
  environmentName: 'nam',
  environmentPrefixPath: null,
  pythonExecutablePath: null,
  defaultOutputRoot: null,
  defaultWorkspaceRoot: null,
  preferredLaunchMode: 'nam-full',
  autoOpenResultsFolder: false,
  persistQueueOnExit: true,
  logRetentionDays: 30,
  defaultAuthorName: '',
  defaultAuthorUrl: ''
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
