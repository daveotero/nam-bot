import { ChildProcess, execFileSync, execFile, spawn, SpawnOptionsWithoutStdio } from 'child_process'
import https from 'https'
import { createRequire } from 'module'
import { app } from 'electron'
import log from 'electron-log/main'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { spawn as spawnPty, IPty } from 'node-pty'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import {
  AcceleratorDiagnosticsSummary,
  AppSettings,
  BackendCheckResult,
  BackendValidationSummary,
  CondaDiscoverySummary,
  NamVersionInfo,
  TrainingLaunchCheckResult,
  TrainingLaunchDiagnosticsIssue,
  TrainingLaunchDiagnosticsStatus,
  TrainingLaunchDiagnosticsSummary
} from '../types'

export interface RunHooks {
  onTerminalData: (chunk: string) => void
  onStarted: (pid: number) => void
  onExit: (code: number | null) => void
  onError: (err: Error) => void
}

export interface TorchRuntimeSummary {
  torchVersion: string | null
  cudaAvailable: boolean | null
  cudaDeviceCount: number | null
  deviceName: string | null
  mpsAvailable: boolean | null
}

interface AcceleratorProbePayload {
  pythonVersion: string | null
  pythonExecutable: string | null
  pythonPlatform: string | null
  torchImportOk: boolean | null
  torchVersion: string | null
  torchCudaVersion: string | null
  hipVersion: string | null
  cudaAvailable: boolean | null
  cudaDeviceCount: number | null
  deviceName: string | null
  mpsAvailable: boolean | null
  namImportOk: boolean | null
  namVersion: string | null
  lightningImportOk: boolean | null
  lightningPackage: string | null
  lightningVersion: string | null
  lightningCudaAvailable: boolean | null
  errors: string[]
}

interface LightningPackageSecurityResult {
  name: string
  version: string | null
  vulnerable: boolean
}

interface LightningSecuritySummary {
  ok: boolean
  packages: LightningPackageSecurityResult[]
  output: string
}

interface HostNvidiaSummary {
  hostNvidiaSmiAvailable: boolean | null
  hostNvidiaGpuName: string | null
  hostDriverVersion: string | null
}

const VULNERABLE_LIGHTNING_VERSIONS = new Set(['2.6.2', '2.6.3'])
const LIGHTNING_SECURITY_PREFIX = 'NAM_BOT_LIGHTNING_SECURITY='
const LATENCY_ANALYSIS_PREFIX = 'NAM_BOT_LATENCY_ANALYSIS='
const TRAINING_LAUNCH_PTY_PREFIX = 'NAM_BOT_PTY_OK'
const TRAINING_LAUNCH_TIMEOUT_MS = 30_000
const LIGHTNING_SECURITY_RECENT_RESULT_TTL_MS = 5_000
const lightningSecurityInFlight = new Map<string, Promise<LightningSecuritySummary>>()
const lightningSecurityRecentResults = new Map<string, { checkedAt: number; summary: LightningSecuritySummary }>()
const mainRequire = createRequire(import.meta.url)

interface NodePtyHelperDiagnostics {
  nodePtyHelperPath: string | null
  nodePtyHelperExists: boolean | null
  nodePtyHelperExecutable: boolean | null
  nodePtyHelperMode: string | null
  nodePtyHelperError: string | null
}

interface PtyCommandResult {
  ok: boolean
  output: string
  exitCode: number | null
  timedOut: boolean
  errorMessage: string | null
}

export interface NamLatencyAnalysisWarnings {
  matchesLookahead: boolean
  disagreementTooHigh: boolean
  notDetected: boolean
}

export interface NamLatencyAnalysisResult {
  ok: boolean
  recommendedLatency: number | null
  inputVersion: string | null
  strongInputMatch: boolean | null
  warnings: NamLatencyAnalysisWarnings | null
  delays: number[]
  errorMessage: string | null
  output: string
}

export interface TrainingProcessController {
  cancel: () => void
  forceKill: () => Promise<void>
  forceKillSync: () => void
}

export interface NamBackendAdapter {
  validateConnection(settings: AppSettings): Promise<BackendValidationSummary>
  detectNamVersion(settings: AppSettings): Promise<string | null>
  getNamVersionInfo(settings: AppSettings): Promise<NamVersionInfo>
  runHelloWorld(settings: AppSettings): Promise<{ ok: boolean; output: string }>
  inspectTorchRuntime(settings: AppSettings): Promise<TorchRuntimeSummary | null>
  inspectAcceleratorDiagnostics(settings: AppSettings): Promise<AcceleratorDiagnosticsSummary>
  runTraining(
    settings: AppSettings,
    args: {
      dataConfigPath: string
      modelConfigPath: string
      learningConfigPath: string
      outputRootDir: string
      noShow?: boolean
      noPlots?: boolean
      cwd?: string
    },
    hooks: RunHooks
  ): Promise<TrainingProcessController>
}

function createCheckResult(
  ok: boolean,
  code: string,
  title: string,
  message: string,
  detail?: string,
  suggestion?: string
): BackendCheckResult {
  return { ok, code, title, message, detail, suggestion }
}

function createAcceleratorDiagnosticsSummary(
  status: AcceleratorDiagnosticsSummary['status'],
  issue: AcceleratorDiagnosticsSummary['issue'],
  headline: string,
  detail: string,
  extras?: Partial<Omit<AcceleratorDiagnosticsSummary, 'checkedAt' | 'status' | 'headline' | 'detail'>>
): AcceleratorDiagnosticsSummary {
  return {
    checkedAt: new Date().toISOString(),
    status,
    issue,
    headline,
    detail,
    suggestion: extras?.suggestion,
    pythonVersion: extras?.pythonVersion ?? null,
    pythonExecutable: extras?.pythonExecutable ?? null,
    pythonPlatform: extras?.pythonPlatform ?? null,
    torchImportOk: extras?.torchImportOk ?? null,
    torchVersion: extras?.torchVersion ?? null,
    torchCudaVersion: extras?.torchCudaVersion ?? null,
    namVersion: extras?.namVersion ?? null,
    lightningPackage: extras?.lightningPackage ?? null,
    lightningVersion: extras?.lightningVersion ?? null,
    cudaAvailable: extras?.cudaAvailable ?? null,
    cudaDeviceCount: extras?.cudaDeviceCount ?? null,
    deviceName: extras?.deviceName ?? null,
    mpsAvailable: extras?.mpsAvailable ?? null,
    namImportOk: extras?.namImportOk ?? null,
    lightningImportOk: extras?.lightningImportOk ?? null,
    lightningCudaAvailable: extras?.lightningCudaAvailable ?? null,
    hostNvidiaSmiAvailable: extras?.hostNvidiaSmiAvailable ?? null,
    hostNvidiaGpuName: extras?.hostNvidiaGpuName ?? null,
    hostDriverVersion: extras?.hostDriverVersion ?? null,
    errors: extras?.errors ?? []
  }
}

function createTrainingLaunchCheck(
  status: TrainingLaunchCheckResult['status'],
  code: string,
  title: string,
  message: string,
  extras?: Partial<Omit<TrainingLaunchCheckResult, 'status' | 'code' | 'title' | 'message'>>
): TrainingLaunchCheckResult {
  return {
    status,
    code,
    title,
    message,
    detail: extras?.detail,
    suggestion: extras?.suggestion,
    command: extras?.command,
    outputTail: extras?.outputTail
  }
}

function createTrainingLaunchDiagnosticsSummary(
  status: TrainingLaunchDiagnosticsStatus,
  issue: TrainingLaunchDiagnosticsIssue,
  headline: string,
  detail: string,
  extras?: Partial<Omit<TrainingLaunchDiagnosticsSummary, 'checkedAt' | 'status' | 'issue' | 'headline' | 'detail'>>
): TrainingLaunchDiagnosticsSummary {
  const nodePtyHelperDiagnostics = inspectNodePtySpawnHelper()

  return {
    checkedAt: new Date().toISOString(),
    status,
    issue,
    headline,
    detail,
    suggestion: extras?.suggestion,
    workspaceRoot: extras?.workspaceRoot ?? null,
    workspacePath: extras?.workspacePath ?? null,
    appExecutablePath: extras?.appExecutablePath ?? process.execPath,
    processArch: extras?.processArch ?? process.arch,
    nodePtyHelperPath: extras?.nodePtyHelperPath ?? nodePtyHelperDiagnostics.nodePtyHelperPath,
    nodePtyHelperExists: extras?.nodePtyHelperExists ?? nodePtyHelperDiagnostics.nodePtyHelperExists,
    nodePtyHelperExecutable: extras?.nodePtyHelperExecutable ?? nodePtyHelperDiagnostics.nodePtyHelperExecutable,
    nodePtyHelperMode: extras?.nodePtyHelperMode ?? nodePtyHelperDiagnostics.nodePtyHelperMode,
    nodePtyHelperError: extras?.nodePtyHelperError ?? nodePtyHelperDiagnostics.nodePtyHelperError,
    checks: extras?.checks ?? [],
    errors: extras?.errors ?? []
  }
}

function tailOutput(output: string, maxLength = 2_000): string {
  const trimmed = output.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return trimmed.slice(trimmed.length - maxLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseLatencyWarnings(value: unknown): NamLatencyAnalysisWarnings | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    matchesLookahead: value.matchesLookahead === true,
    disagreementTooHigh: value.disagreementTooHigh === true,
    notDetected: value.notDetected === true
  }
}

function parseNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry): number[] => (
    typeof entry === 'number' && Number.isFinite(entry) ? [entry] : []
  ))
}

function createFailedLatencyAnalysis(output: string, errorMessage: string): NamLatencyAnalysisResult {
  return {
    ok: false,
    recommendedLatency: null,
    inputVersion: null,
    strongInputMatch: null,
    warnings: null,
    delays: [],
    errorMessage,
    output: output.trim()
  }
}

export function parseNamLatencyAnalysisOutput(output: string): NamLatencyAnalysisResult {
  const markerLine = output
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(LATENCY_ANALYSIS_PREFIX))

  if (!markerLine) {
    return createFailedLatencyAnalysis(output, tailOutput(output) || 'NAM latency analyzer did not return a structured result.')
  }

  try {
    const payload = JSON.parse(markerLine.trim().slice(LATENCY_ANALYSIS_PREFIX.length)) as unknown
    if (!isRecord(payload)) {
      return createFailedLatencyAnalysis(output, 'NAM latency analyzer returned an invalid result payload.')
    }

    const recommendedLatency = asNullableNumber(payload.recommendedLatency)
    return {
      ok: payload.ok === true && recommendedLatency !== null,
      recommendedLatency,
      inputVersion: asNullableString(payload.inputVersion),
      strongInputMatch: asNullableBoolean(payload.strongInputMatch),
      warnings: parseLatencyWarnings(payload.warnings),
      delays: parseNumberList(payload.delays),
      errorMessage: asNullableString(payload.errorMessage),
      output: output.trim()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return createFailedLatencyAnalysis(output, `Failed to parse NAM latency analyzer result: ${message}`)
  }
}

function formatFileMode(mode: number): string {
  return `0${(mode & 0o777).toString(8)}`
}

function createEmptyNodePtyHelperDiagnostics(): NodePtyHelperDiagnostics {
  return {
    nodePtyHelperPath: null,
    nodePtyHelperExists: null,
    nodePtyHelperExecutable: null,
    nodePtyHelperMode: null,
    nodePtyHelperError: null
  }
}

function toAsarUnpackedPath(value: string): string {
  let nextValue = value
  if (!nextValue.includes('app.asar.unpacked')) {
    nextValue = nextValue.replace('app.asar', 'app.asar.unpacked')
  }
  if (!nextValue.includes('node_modules.asar.unpacked')) {
    nextValue = nextValue.replace('node_modules.asar', 'node_modules.asar.unpacked')
  }
  return nextValue
}

function inspectNodePtySpawnHelper(): NodePtyHelperDiagnostics {
  if (process.platform !== 'darwin') {
    return createEmptyNodePtyHelperDiagnostics()
  }

  try {
    const packagePath = mainRequire.resolve('node-pty/package.json')
    const packageRoot = dirname(packagePath)
    const unpackedPackageRoot = toAsarUnpackedPath(packageRoot)
    const roots = Array.from(new Set([packageRoot, unpackedPackageRoot]))
    const candidateRelativePaths = [
      join('build', 'Release', 'spawn-helper'),
      join('build', 'Debug', 'spawn-helper'),
      join('prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    ]
    const candidates = roots.flatMap((root) => candidateRelativePaths.map((relativePath) => join(root, relativePath)))

    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue
      }

      const stats = statSync(candidate)
      return {
        nodePtyHelperPath: candidate,
        nodePtyHelperExists: true,
        nodePtyHelperExecutable: (stats.mode & 0o111) !== 0,
        nodePtyHelperMode: formatFileMode(stats.mode),
        nodePtyHelperError: null
      }
    }

    return {
      nodePtyHelperPath: candidates[0] ?? null,
      nodePtyHelperExists: false,
      nodePtyHelperExecutable: false,
      nodePtyHelperMode: null,
      nodePtyHelperError: 'node-pty spawn-helper was not found at the expected packaged paths'
    }
  } catch (error) {
    return {
      nodePtyHelperPath: null,
      nodePtyHelperExists: null,
      nodePtyHelperExecutable: null,
      nodePtyHelperMode: null,
      nodePtyHelperError: error instanceof Error ? error.message : 'Unable to inspect node-pty spawn-helper'
    }
  }
}

function isBareExecutablePath(command: string): boolean {
  return !command.includes('\\') && !command.includes('/')
}

function resolveWorkspaceRoot(settings: AppSettings): string {
  const configuredRoot = settings.defaultWorkspaceRoot?.trim()
  if (configuredRoot && configuredRoot.length > 0) {
    return configuredRoot
  }

  return join(app.getPath('userData'), 'workspaces')
}

function formatCondaDiagnosticCommand(settings: AppSettings, args: string[]): string | undefined {
  if (!settings.condaExecutablePath) {
    return undefined
  }

  try {
    return formatCommandForLog(
      settings.condaExecutablePath,
      buildCondaArgv(settings, args, { noCaptureOutput: true })
    )
  } catch {
    return undefined
  }
}

function createMacAppLocationCheck(): TrainingLaunchCheckResult | null {
  if (process.platform !== 'darwin') {
    return null
  }

  const executablePath = process.execPath
  if (executablePath.includes('/AppTranslocation/')) {
    return createTrainingLaunchCheck(
      'warn',
      'mac_app_translocated',
      'App location',
      'macOS appears to be running NAM-BOT from a translocated app path.',
      {
        detail: executablePath,
        suggestion: 'Move NAM-BOT to /Applications, right-click it, choose Open, then re-run Diagnostics.'
      }
    )
  }

  if (executablePath.startsWith('/Volumes/')) {
    return createTrainingLaunchCheck(
      'warn',
      'mac_app_on_dmg',
      'App location',
      'NAM-BOT appears to be running from a mounted DMG or external volume.',
      {
        detail: executablePath,
        suggestion: 'Drag NAM-BOT into /Applications, open it from there, then re-run Diagnostics.'
      }
    )
  }

  return createTrainingLaunchCheck(
    'pass',
    'mac_app_location_ok',
    'App location',
    'NAM-BOT is not running from a common macOS translocation or DMG path.',
    { detail: executablePath }
  )
}

function hasMissingModuleMessage(errors: string[], moduleName: string): boolean {
  const singleQuoteNeedle = `No module named '${moduleName}'`
  const doubleQuoteNeedle = `No module named "${moduleName}"`
  return errors.some((entry) => entry.includes(singleQuoteNeedle) || entry.includes(doubleQuoteNeedle))
}

function getVulnerableLightningPackage(
  summary: LightningSecuritySummary
): LightningPackageSecurityResult | null {
  return summary.packages.find((entry) => entry.vulnerable) ?? null
}

function formatLightningPackageList(packages: LightningPackageSecurityResult[]): string {
  if (packages.length === 0) {
    return 'No Lightning distributions were found in this environment.'
  }

  return packages
    .map((entry) => `${entry.name}: ${entry.version ?? 'not installed'}`)
    .join('; ')
}

function createLightningSecurityDetail(packageResult: LightningPackageSecurityResult): string {
  return `${packageResult.name} ${packageResult.version} is one of the known compromised PyPI releases. NAM-BOT has not imported NAM or Lightning in this environment.`
}

function createLightningSecuritySuggestion(): string {
  return 'Remove the affected Lightning package, install a safe version, upgrade neural-amp-modeler, and rotate credentials if this environment imported Lightning while affected.'
}

function createLightningSecurityErrorMessage(packageResult: LightningPackageSecurityResult): string {
  return `${packageResult.name} ${packageResult.version} is blocked because Lightning 2.6.2 and 2.6.3 are known compromised PyPI releases. Remove the affected package before running NAM-BOT training.`
}

function formatCommandForLog(executable: string, args: string[]): string {
  const formattedArgs = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
  return [executable, ...formattedArgs].join(' ')
}

function buildCondaArgv(
  settings: AppSettings,
  args: string[],
  options?: { noCaptureOutput?: boolean }
): string[] {
  const condaArgs: string[] = ['run']

  switch (settings.backendMode) {
    case 'conda-name':
      if (!settings.environmentName) {
        throw new Error('Conda environment name is not configured')
      }
      condaArgs.push('--name', settings.environmentName)
      break
    case 'conda-prefix':
      if (!settings.environmentPrefixPath) {
        throw new Error('Conda environment prefix path is not configured')
      }
      condaArgs.push('--prefix', settings.environmentPrefixPath)
      break
    default:
      throw new Error('Unsupported backend mode for Conda commands')
  }

  if (options?.noCaptureOutput) {
    condaArgs.push('--no-capture-output')
  }

  condaArgs.push(...args)
  return condaArgs
}

function createTrainingEnv(): Record<string, string> {
  const nextEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      nextEnv[key] = value
    }
  }
  nextEnv.PYTHONUNBUFFERED = '1'
  nextEnv.PYTHONIOENCODING = 'utf-8'
  nextEnv.FORCE_COLOR = '0'
  nextEnv.TERM = 'xterm-256color'
  return nextEnv
}

function resolveExecutableOnPath(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const probeCommand: string = process.platform === 'win32' ? 'where' : 'which'
    const probe = execFile(probeCommand, [command], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }

      const match: string | undefined = stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0)

      resolve(match ?? null)
    })

    probe.on('error', () => resolve(null))
  })
}

async function isConfiguredCondaReachable(condaExecutablePath: string): Promise<boolean> {
  if (existsSync(condaExecutablePath)) {
    return true
  }

  // Allow simple commands like `conda.exe` when Conda has been added to PATH.
  if (!condaExecutablePath.includes('\\') && !condaExecutablePath.includes('/')) {
    return (await resolveExecutableOnPath(condaExecutablePath)) !== null
  }

  return false
}

function detectHostNvidia(): Promise<HostNvidiaSummary> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,driver_version', '--format=csv,noheader'],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          log.info('nvidia-smi not available or failed during host GPU probe', {
            message: error.message,
            stderr
          })
          resolve({
            hostNvidiaSmiAvailable: false,
            hostNvidiaGpuName: null,
            hostDriverVersion: null
          })
          return
        }

        const firstLine = stdout
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .find((entry) => entry.length > 0)

        if (!firstLine) {
          resolve({
            hostNvidiaSmiAvailable: true,
            hostNvidiaGpuName: null,
            hostDriverVersion: null
          })
          return
        }

        const [gpuName, driverVersion] = firstLine.split(',').map((entry) => entry.trim())
        resolve({
          hostNvidiaSmiAvailable: true,
          hostNvidiaGpuName: gpuName ?? null,
          hostDriverVersion: driverVersion ?? null
        })
      }
    )
  })
}

export async function detectCondaOnPath(command = process.platform === 'win32' ? 'conda.exe' : 'conda'): Promise<CondaDiscoverySummary> {
  const resolvedPath: string | null = await resolveExecutableOnPath(command)

  return {
    checkedAt: new Date().toISOString(),
    isOnPath: resolvedPath !== null,
    command,
    resolvedPath
  }
}

function spawnCondaProcess(
  settings: AppSettings,
  args: string[],
  options?: { noCaptureOutput?: boolean; cwd?: string }
): ChildProcess {
  if (!settings.condaExecutablePath) {
    throw new Error('Conda not configured')
  }

  const condaArgs = buildCondaArgv(settings, args, { noCaptureOutput: options?.noCaptureOutput })
  const spawnOptions: SpawnOptionsWithoutStdio = {
    shell: false,
    windowsHide: true,
    cwd: options?.cwd,
    detached: process.platform !== 'win32'
  }

  log.info('Running conda command:', formatCommandForLog(settings.condaExecutablePath, condaArgs))
  return spawn(settings.condaExecutablePath, condaArgs, spawnOptions)
}

function spawnCondaPty(
  settings: AppSettings,
  args: string[],
  options?: { cwd?: string }
): IPty {
  if (!settings.condaExecutablePath) {
    throw new Error('Conda not configured')
  }

  const condaArgs = buildCondaArgv(settings, args, { noCaptureOutput: true })
  log.info('Running PTY conda command:', formatCommandForLog(settings.condaExecutablePath, condaArgs))

  return spawnPty(settings.condaExecutablePath, condaArgs, {
    name: 'xterm-color',
    cols: 120,
    rows: 40,
    cwd: options?.cwd,
    env: createTrainingEnv(),
    useConpty: process.platform === 'win32'
  })
}

function runCondaPtyCommand(
  settings: AppSettings,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number }
): Promise<PtyCommandResult> {
  return new Promise((resolve) => {
    let pty: IPty
    try {
      pty = spawnCondaPty(settings, args, { cwd: options?.cwd })
    } catch (error) {
      resolve({
        ok: false,
        output: '',
        exitCode: null,
        timedOut: false,
        errorMessage: error instanceof Error ? error.message : 'PTY process launch failed'
      })
      return
    }

    let output = ''
    let settled = false
    const timeoutMs = options?.timeoutMs ?? TRAINING_LAUNCH_TIMEOUT_MS
    let timeout: NodeJS.Timeout

    const settle = (result: PtyCommandResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    timeout = setTimeout(() => {
      void forceKillPtyProcessTree(pty).finally(() => {
        settle({
          ok: false,
          output,
          exitCode: null,
          timedOut: true,
          errorMessage: 'PTY command timed out'
        })
      })
    }, timeoutMs)

    pty.onData((data: string) => {
      output += data
      if (output.length > 20_000) {
        output = output.slice(output.length - 20_000)
      }
    })

    pty.onExit(({ exitCode }) => {
      settle({
        ok: exitCode === 0,
        output,
        exitCode,
        timedOut: false,
        errorMessage: null
      })
    })
  })
}

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T']
    if (force) {
      args.push('/F')
    }

    const killer = spawn('taskkill', args, {
      shell: false,
      windowsHide: true
    })

    killer.on('error', (error) => {
      log.warn('taskkill failed:', error)
      resolve()
    })

    killer.on('close', () => resolve())
  })
}

async function forceKillProcessTree(proc: ChildProcess): Promise<void> {
  if (!proc.pid) {
    return
  }

  if (process.platform === 'win32') {
    await taskkill(proc.pid, true)
    return
  }

  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch (error) {
    log.warn('Failed to SIGKILL process group, falling back to child.kill():', error)
    try {
      proc.kill('SIGKILL')
    } catch (innerError) {
      log.warn('Failed to SIGKILL child process:', innerError)
    }
  }
}

async function forceKillPtyProcessTree(pty: IPty): Promise<void> {
  if (!pty.pid) {
    return
  }

  if (process.platform === 'win32') {
    await taskkill(pty.pid, true)
    return
  }

  try {
    process.kill(-pty.pid, 'SIGKILL')
  } catch (error) {
    log.warn('Failed to SIGKILL PTY process group, falling back to pty.kill():', error)
    try {
      pty.kill()
    } catch (innerError) {
      log.warn('Failed to kill PTY process:', innerError)
    }
  }
}

function forceKillProcessTreeSync(proc: ChildProcess): void {
  if (!proc.pid) {
    return
  }

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    } catch (error) {
      log.warn('Synchronous taskkill failed:', error)
    }
    return
  }

  try {
    process.kill(-proc.pid, 'SIGKILL')
  } catch (error) {
    log.warn('Failed to synchronously SIGKILL process group:', error)
    try {
      proc.kill('SIGKILL')
    } catch (innerError) {
      log.warn('Failed to synchronously SIGKILL child process:', innerError)
    }
  }
}

function forceKillPtyProcessTreeSync(pty: IPty): void {
  if (!pty.pid) {
    return
  }

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pty.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      })
    } catch (error) {
      log.warn('Synchronous PTY taskkill failed:', error)
    }
    return
  }

  try {
    process.kill(-pty.pid, 'SIGKILL')
  } catch (error) {
    log.warn('Failed to synchronously SIGKILL PTY process group:', error)
    try {
      pty.kill()
    } catch (innerError) {
      log.warn('Failed to synchronously kill PTY process:', innerError)
    }
  }
}

function requestGracefulStop(proc: ChildProcess): void {
  if (!proc.pid) {
    return
  }

  if (process.platform === 'win32') {
    try {
      log.info(`Sending SIGINT to process ${proc.pid} for graceful stop`)
      proc.kill('SIGINT')
    } catch (error) {
      log.warn('Failed to request graceful Windows stop with SIGINT:', error)
    }
    return
  }

  try {
    process.kill(-proc.pid, 'SIGINT')
  } catch (error) {
    log.warn('Failed to SIGINT process group, falling back to child.kill():', error)
    try {
      proc.kill('SIGINT')
    } catch (innerError) {
      log.warn('Failed to SIGINT child process:', innerError)
    }
  }
}

function requestGracefulPtyStop(pty: IPty): void {
  try {
    log.info(`Sending CTRL+C to PTY process ${pty.pid}`)
    pty.write('\u0003')
  } catch (error) {
    log.warn('Failed to send CTRL+C to PTY process:', error)
    void forceKillPtyProcessTree(pty)
  }
}

export async function validateBackend(settings: AppSettings): Promise<BackendValidationSummary> {
  const results: BackendValidationSummary = {
    checkedAt: new Date().toISOString(),
    condaReachable: createCheckResult(false, 'unknown', 'Conda', 'Not checked'),
    environmentReachable: createCheckResult(false, 'unknown', 'Environment', 'Not checked'),
    pythonReachable: createCheckResult(false, 'unknown', 'Python', 'Not checked'),
    namInstalled: createCheckResult(false, 'unknown', 'NAM', 'Not checked'),
    namFullAvailable: createCheckResult(false, 'unknown', 'NAM Full', 'Not checked'),
    overallOk: false
  }

  if (!settings.condaExecutablePath) {
    results.condaReachable = createCheckResult(
      false,
      'conda_not_found',
      'Conda Executable',
      'Conda path not configured',
      'Please select your Conda executable in Settings',
      'Go to Settings and configure the Conda path'
    )
  } else if (!(await isConfiguredCondaReachable(settings.condaExecutablePath))) {
    results.condaReachable = createCheckResult(
      false,
      'conda_not_found',
      'Conda Executable',
      `Conda was not found: ${settings.condaExecutablePath}`,
      'NAM-BOT could not find this Conda executable directly or on PATH',
      'Verify the Conda setting or add Conda to PATH'
    )
  } else {
    results.condaReachable = createCheckResult(true, 'conda_ok', 'Conda Executable', 'Conda is reachable')
  }

  if (!results.condaReachable.ok) {
    results.environmentReachable = createCheckResult(
      false,
      'conda_not_ready',
      'Conda Environment',
      'Cannot check environment - Conda not available'
    )
  } else if (settings.backendMode === 'conda-name' && !settings.environmentName) {
    results.environmentReachable = createCheckResult(
      false,
      'env_not_configured',
      'Conda Environment',
      'Environment name not configured',
      'Please specify a Conda environment name',
      'Go to Settings and configure the environment name'
    )
  } else if (settings.backendMode === 'conda-prefix' && !settings.environmentPrefixPath) {
    results.environmentReachable = createCheckResult(
      false,
      'env_not_configured',
      'Conda Environment',
      'Environment prefix not configured',
      'Please specify a Conda environment prefix path',
      'Go to Settings and configure the environment prefix'
    )
  } else {
    const envCheck = await runCondaCommand(settings, ['python', '--version'])
    if (envCheck.ok) {
      results.environmentReachable = createCheckResult(true, 'env_ok', 'Conda Environment', 'Environment is configured')
    } else {
      results.environmentReachable = createCheckResult(
        false,
        'env_not_found',
        'Conda Environment',
        'Could not verify environment',
        envCheck.output,
        'Check that the environment name/prefix is correct'
      )
    }
  }

  if (results.environmentReachable.ok) {
    const pythonCheck = await runCondaCommand(settings, ['python', '--version'])
    if (pythonCheck.ok) {
      results.pythonReachable = createCheckResult(true, 'python_ok', 'Python', pythonCheck.output.trim())
    } else {
      results.pythonReachable = createCheckResult(
        false,
        'python_not_found',
        'Python',
        'Could not run Python in environment',
        pythonCheck.output,
        'Ensure Python is installed in the Conda environment'
      )
    }
  }

  if (results.pythonReachable.ok) {
    const lightningSecurity = await inspectLightningPackageSecurity(settings)
    const vulnerableLightningPackage = lightningSecurity.ok ? getVulnerableLightningPackage(lightningSecurity) : null

    if (!lightningSecurity.ok) {
      results.namInstalled = createCheckResult(
        false,
        'lightning_security_check_failed',
        'Lightning Security',
        'Could not verify Lightning package versions safely',
        lightningSecurity.output,
        'Verify Python package metadata manually before running NAM commands in this environment.'
      )
      results.namFullAvailable = createCheckResult(
        false,
        'blocked_until_security_check_passes',
        'NAM Full Trainer',
        'Skipped until Lightning package versions can be verified'
      )
    } else if (vulnerableLightningPackage) {
      results.namInstalled = createCheckResult(
        false,
        'lightning_vulnerable',
        'Lightning Security',
        `${vulnerableLightningPackage.name} ${vulnerableLightningPackage.version} is blocked`,
        createLightningSecurityDetail(vulnerableLightningPackage),
        createLightningSecuritySuggestion()
      )
      results.namFullAvailable = createCheckResult(
        false,
        'blocked_vulnerable_lightning',
        'NAM Full Trainer',
        'Skipped because this environment contains a compromised Lightning version',
        formatLightningPackageList(lightningSecurity.packages),
        createLightningSecuritySuggestion()
      )
    } else {
      const namCheck = await runCondaCommand(settings, ['nam-hello-world'])
      if (namCheck.ok) {
        results.namInstalled = createCheckResult(true, 'nam_ok', 'NAM', 'NAM is installed')
      } else {
        results.namInstalled = createCheckResult(
          false,
          'nam_not_installed',
          'NAM',
          'NAM is not installed in the environment',
          namCheck.output,
          'Install NAM in the Conda environment'
        )
      }
    }
  }

  if (results.namInstalled.ok) {
    const namFullCheck = await runCondaCommand(settings, ['nam-full', '--help'])
    if (namFullCheck.ok || namFullCheck.output.includes('usage') || namFullCheck.output.includes('Options')) {
      results.namFullAvailable = createCheckResult(true, 'nam_full_ok', 'NAM Full Trainer', 'nam-full command is available')
    } else {
      results.namFullAvailable = createCheckResult(
        false,
        'nam_full_unavailable',
        'NAM Full Trainer',
        'nam-full command not available',
        namFullCheck.output,
        'Ensure NAM is properly installed'
      )
    }
  }


  results.overallOk =
    results.condaReachable.ok &&
    results.environmentReachable.ok &&
    results.pythonReachable.ok &&
    results.namInstalled.ok &&
    results.namFullAvailable.ok

  log.info('Backend validation complete:', { overallOk: results.overallOk })
  return results
}

async function runCondaCommand(
  settings: AppSettings,
  args: string[]
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let proc: ChildProcess
    try {
      proc = spawnCondaProcess(settings, args)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid backend configuration'
      log.error('Failed to start conda command:', message)
      resolve({ ok: false, output: message })
      return
    }

    let output = ''
    let errorOutput = ''
    let settled = false

    const settle = (result: { ok: boolean; output: string }): void => {
      if (settled) {
        return
      }
      settled = true
      resolve(result)
    }

    proc.stdout?.on('data', (data: Buffer | string) => {
      output += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer | string) => {
      errorOutput += data.toString()
    })

    proc.on('close', (code) => {
      settle({
        ok: code === 0,
        output: output + errorOutput
      })
    })

    proc.on('error', (err) => {
      settle({ ok: false, output: err.message })
    })

    setTimeout(async () => {
      if (settled) {
        return
      }
      await forceKillProcessTree(proc)
      settle({ ok: false, output: 'Command timed out' })
    }, 30000)
  })
}

async function runPythonScriptInEnvironment(
  settings: AppSettings,
  script: string,
  scriptName: string
): Promise<{ ok: boolean; output: string }> {
  const tempDir = mkdtempSync(join(tmpdir(), 'nam-bot-probe-'))
  const scriptPath = join(tempDir, scriptName)

  try {
    writeFileSync(scriptPath, script, 'utf8')
    return await runCondaCommand(settings, ['python', scriptPath])
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function getLightningSecurityCacheKey(settings: AppSettings): string {
  return JSON.stringify({
    backendMode: settings.backendMode,
    condaExecutablePath: settings.condaExecutablePath ?? null,
    environmentName: settings.environmentName ?? null,
    environmentPrefixPath: settings.environmentPrefixPath ?? null,
    pythonExecutablePath: settings.pythonExecutablePath ?? null
  })
}

async function runLightningPackageSecurityProbe(settings: AppSettings): Promise<LightningSecuritySummary> {
  const script = [
    'import json',
    'from importlib.metadata import PackageNotFoundError, version',
    '',
    "blocked_versions = {'2.6.2', '2.6.3'}",
    'packages = []',
    "for package_name in ('lightning', 'pytorch-lightning'):",
    '    try:',
    '        package_version = version(package_name)',
    '    except PackageNotFoundError:',
    '        package_version = None',
    '    packages.append({',
    "        'name': package_name,",
    "        'version': package_version,",
    "        'vulnerable': package_version in blocked_versions,",
    '    })',
    '',
    `print('${LIGHTNING_SECURITY_PREFIX}' + json.dumps({'packages': packages}))`
  ].join('\n')

  const result = await runPythonScriptInEnvironment(settings, script, 'lightning-security-probe.py')
  const line = result.output
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(LIGHTNING_SECURITY_PREFIX))

  if (!result.ok || !line) {
    return {
      ok: false,
      packages: [],
      output: result.output.trim()
    }
  }

  try {
    const payload = JSON.parse(line.trim().slice(LIGHTNING_SECURITY_PREFIX.length)) as {
      packages?: Array<{ name?: string; version?: string | null; vulnerable?: boolean }>
    }
    const packages = (payload.packages ?? [])
      .filter((entry) => typeof entry.name === 'string')
      .map((entry) => ({
        name: entry.name ?? 'unknown',
        version: entry.version ?? null,
        vulnerable: VULNERABLE_LIGHTNING_VERSIONS.has(entry.version ?? '') || entry.vulnerable === true
      }))

    return {
      ok: true,
      packages,
      output: result.output.trim()
    }
  } catch (error) {
    log.warn('Failed to parse Lightning security probe:', error)
    return {
      ok: false,
      packages: [],
      output: result.output.trim()
    }
  }
}

async function inspectLightningPackageSecurity(
  settings: AppSettings,
  options?: { allowRecentResult?: boolean }
): Promise<LightningSecuritySummary> {
  const cacheKey = getLightningSecurityCacheKey(settings)
  const allowRecentResult = options?.allowRecentResult ?? true
  const recentResult = lightningSecurityRecentResults.get(cacheKey)
  if (allowRecentResult && recentResult && Date.now() - recentResult.checkedAt < LIGHTNING_SECURITY_RECENT_RESULT_TTL_MS) {
    log.info('Reusing recent Lightning security probe result')
    return recentResult.summary
  }

  const inFlight = lightningSecurityInFlight.get(cacheKey)
  if (inFlight) {
    log.info('Reusing in-flight Lightning security probe')
    return inFlight
  }

  const probe = runLightningPackageSecurityProbe(settings)
    .then((summary) => {
      lightningSecurityRecentResults.set(cacheKey, { checkedAt: Date.now(), summary })
      return summary
    })
    .finally(() => {
      lightningSecurityInFlight.delete(cacheKey)
    })
  lightningSecurityInFlight.set(cacheKey, probe)
  return probe
}

async function assertLightningPackageSafe(settings: AppSettings): Promise<void> {
  const lightningSecurity = await inspectLightningPackageSecurity(settings, { allowRecentResult: false })
  if (!lightningSecurity.ok) {
    throw new Error('NAM-BOT could not verify Lightning package versions safely. Verify package metadata manually before running NAM commands in this environment.')
  }

  const vulnerableLightningPackage = getVulnerableLightningPackage(lightningSecurity)
  if (vulnerableLightningPackage) {
    throw new Error(createLightningSecurityErrorMessage(vulnerableLightningPackage))
  }
}

export async function inspectTorchRuntime(settings: AppSettings): Promise<TorchRuntimeSummary | null> {
  const script = [
    'import json',
    'import torch',
    "mps_backend = getattr(torch.backends, 'mps', None)",
    "mps_available = bool(mps_backend and mps_backend.is_available())",
    'payload = {',
    "  'torchVersion': getattr(torch, '__version__', None),",
    "  'cudaAvailable': bool(torch.cuda.is_available()),",
    "  'cudaDeviceCount': int(torch.cuda.device_count()),",
    "  'deviceName': torch.cuda.get_device_name(0) if torch.cuda.is_available() and torch.cuda.device_count() > 0 else None,",
    "  'mpsAvailable': mps_available,",
    '}',
    "print('NAM_BOT_TORCH=' + json.dumps(payload))"
  ].join('\n')

  const result = await runPythonScriptInEnvironment(settings, script, 'torch-runtime-probe.py')
  if (!result.ok && !result.output.includes('NAM_BOT_TORCH=')) {
    return null
  }

  const line = result.output
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('NAM_BOT_TORCH='))

  if (!line) {
    return null
  }

  try {
    const payload = JSON.parse(line.trim().slice('NAM_BOT_TORCH='.length)) as TorchRuntimeSummary
    return {
      torchVersion: payload.torchVersion ?? null,
      cudaAvailable: payload.cudaAvailable ?? null,
      cudaDeviceCount: payload.cudaDeviceCount ?? null,
      deviceName: payload.deviceName ?? null,
      mpsAvailable: payload.mpsAvailable ?? null
    }
  } catch (error) {
    log.warn('Failed to parse torch runtime info:', error)
    return null
  }
}

export async function inspectAcceleratorDiagnostics(
  settings: AppSettings
): Promise<AcceleratorDiagnosticsSummary> {
  const hostNvidia = await detectHostNvidia()

  if (!settings.condaExecutablePath) {
    return createAcceleratorDiagnosticsSummary(
      'not_checked',
      'conda_not_configured',
      'GPU diagnostics unavailable',
      'Configure a Conda executable before checking accelerator visibility.',
      {
        ...hostNvidia,
        suggestion: 'Go to Settings and configure the Conda path first.'
      }
    )
  }

  if (!(await isConfiguredCondaReachable(settings.condaExecutablePath))) {
    return createAcceleratorDiagnosticsSummary(
      'not_checked',
      'conda_unreachable',
      'GPU diagnostics unavailable',
      `Conda is not reachable at ${settings.condaExecutablePath}.`,
      {
        ...hostNvidia,
        suggestion: 'Fix the Conda path in Settings, then re-run diagnostics.'
      }
    )
  }

  if (settings.backendMode === 'conda-name' && !settings.environmentName) {
    return createAcceleratorDiagnosticsSummary(
      'not_checked',
      'environment_not_configured',
      'GPU diagnostics unavailable',
      'No Conda environment name is configured.',
      {
        ...hostNvidia,
        suggestion: 'Set the environment name in Settings, then re-run diagnostics.'
      }
    )
  }

  if (settings.backendMode === 'conda-prefix' && !settings.environmentPrefixPath) {
    return createAcceleratorDiagnosticsSummary(
      'not_checked',
      'environment_not_configured',
      'GPU diagnostics unavailable',
      'No Conda environment prefix is configured.',
      {
        ...hostNvidia,
        suggestion: 'Set the environment prefix path in Settings, then re-run diagnostics.'
      }
    )
  }

  const lightningSecurity = await inspectLightningPackageSecurity(settings)
  const vulnerableLightningPackage = lightningSecurity.ok ? getVulnerableLightningPackage(lightningSecurity) : null

  if (!lightningSecurity.ok) {
    return createAcceleratorDiagnosticsSummary(
      'error',
      'lightning_security_check_failed',
      'Lightning security check failed',
      'NAM-BOT could not verify Lightning package versions without importing the Python packages, so accelerator probing was skipped.',
      {
        ...hostNvidia,
        suggestion: 'Verify package metadata manually before running NAM commands in this environment.',
        errors: [lightningSecurity.output].filter((entry) => entry.length > 0)
      }
    )
  }

  if (vulnerableLightningPackage) {
    return createAcceleratorDiagnosticsSummary(
      'error',
      'lightning_vulnerable',
      'Compromised Lightning version detected',
      createLightningSecurityDetail(vulnerableLightningPackage),
      {
        ...hostNvidia,
        lightningPackage: vulnerableLightningPackage.name,
        lightningVersion: vulnerableLightningPackage.version,
        suggestion: createLightningSecuritySuggestion(),
        errors: [formatLightningPackageList(lightningSecurity.packages)]
      }
    )
  }

  const script = [
    'import importlib',
    'import json',
    'import platform',
    'import sys',
    '',
    'payload = {',
    "  'pythonVersion': sys.version.split()[0],",
    "  'pythonExecutable': sys.executable,",
    "  'pythonPlatform': platform.platform(),",
    "  'torchImportOk': None,",
    "  'torchVersion': None,",
    "  'torchCudaVersion': None,",
    "  'hipVersion': None,",
    "  'cudaAvailable': None,",
    "  'cudaDeviceCount': None,",
    "  'deviceName': None,",
    "  'mpsAvailable': None,",
    "  'namImportOk': None,",
    "  'namVersion': None,",
    "  'lightningImportOk': None,",
    "  'lightningPackage': None,",
    "  'lightningVersion': None,",
    "  'lightningCudaAvailable': None,",
    "  'errors': [],",
    '}',
    '',
    'try:',
    '    import torch',
    "    payload['torchImportOk'] = True",
    "    payload['torchVersion'] = getattr(torch, '__version__', None)",
    "    payload['torchCudaVersion'] = getattr(getattr(torch, 'version', None), 'cuda', None)",
    "    payload['hipVersion'] = getattr(getattr(torch, 'version', None), 'hip', None)",
    "    payload['cudaAvailable'] = bool(torch.cuda.is_available())",
    "    payload['cudaDeviceCount'] = int(torch.cuda.device_count())",
    "    payload['deviceName'] = torch.cuda.get_device_name(0) if payload['cudaAvailable'] and payload['cudaDeviceCount'] > 0 else None",
    "    mps_backend = getattr(torch.backends, 'mps', None)",
    "    payload['mpsAvailable'] = bool(mps_backend and mps_backend.is_available())",
    'except Exception as exc:',
    "    payload['torchImportOk'] = False",
    "    payload['errors'].append(f'torch: {exc}')",
    '',
    'try:',
    '    import nam',
    "    payload['namImportOk'] = True",
    "    payload['namVersion'] = getattr(nam, '__version__', None)",
    'except Exception as exc:',
    "    payload['namImportOk'] = False",
    "    payload['errors'].append(f'nam: {exc}')",
    '',
    "for package_name, accelerator_root in [('lightning', 'lightning.pytorch.accelerators'), ('pytorch_lightning', 'pytorch_lightning.accelerators')]:",
    '    try:',
    '        lightning_module = importlib.import_module(package_name)',
    "        payload['lightningImportOk'] = True",
    "        payload['lightningPackage'] = package_name",
    "        payload['lightningVersion'] = getattr(lightning_module, '__version__', None)",
    '        try:',
    "            cuda_module = importlib.import_module(accelerator_root + '.cuda')",
    "            payload['lightningCudaAvailable'] = bool(cuda_module.CUDAAccelerator.is_available())",
    '        except Exception as exc:',
    "            payload['errors'].append(f'{package_name}.cuda: {exc}')",
    '        break',
    '    except Exception:',
    '        continue',
    '',
    "if payload['lightningImportOk'] is None:",
    "    payload['lightningImportOk'] = False",
    '',
    "print('NAM_BOT_ACCEL=' + json.dumps(payload))"
  ].join('\n')

  const result = await runPythonScriptInEnvironment(settings, script, 'accelerator-diagnostics-probe.py')
  if (!result.ok && !result.output.includes('NAM_BOT_ACCEL=')) {
    return createAcceleratorDiagnosticsSummary(
      'error',
      'probe_launch_failed',
      'GPU probe failed',
      'NAM-BOT could not inspect the Python runtime in this environment.',
      {
        suggestion: 'Open Settings, verify the environment, and make sure Python, torch, and NAM import cleanly.',
        ...hostNvidia,
        errors: [result.output.trim()].filter((entry) => entry.length > 0)
      }
    )
  }

  const line = result.output
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('NAM_BOT_ACCEL='))

  if (!line) {
    return createAcceleratorDiagnosticsSummary(
      'error',
      'probe_payload_missing',
      'GPU probe failed',
      'The environment command ran, but it did not return accelerator diagnostics.',
      {
        ...hostNvidia,
        suggestion: 'Try re-running diagnostics. If this keeps happening, inspect the Python environment manually.'
      }
    )
  }

  let payload: AcceleratorProbePayload
  try {
    payload = JSON.parse(line.trim().slice('NAM_BOT_ACCEL='.length)) as AcceleratorProbePayload
  } catch (error) {
    log.warn('Failed to parse accelerator diagnostics:', error)
    return createAcceleratorDiagnosticsSummary(
      'error',
      'probe_payload_malformed',
      'GPU probe failed',
      'The environment returned malformed accelerator diagnostics.',
      {
        ...hostNvidia,
        suggestion: 'Try re-running diagnostics. If this keeps happening, inspect the environment manually.'
      }
    )
  }

  const summaryExtras = {
    ...hostNvidia,
    torchVersion: payload.torchVersion ?? null,
    torchCudaVersion: payload.torchCudaVersion ?? null,
    hipVersion: payload.hipVersion ?? null,
    pythonVersion: payload.pythonVersion ?? null,
    pythonExecutable: payload.pythonExecutable ?? null,
    pythonPlatform: payload.pythonPlatform ?? null,
    torchImportOk: payload.torchImportOk ?? null,
    namVersion: payload.namVersion ?? null,
    lightningPackage: payload.lightningPackage ?? null,
    lightningVersion: payload.lightningVersion ?? null,
    cudaAvailable: payload.cudaAvailable ?? null,
    cudaDeviceCount: payload.cudaDeviceCount ?? null,
    deviceName: payload.deviceName ?? null,
    mpsAvailable: payload.mpsAvailable ?? null,
    namImportOk: payload.namImportOk ?? null,
    lightningImportOk: payload.lightningImportOk ?? null,
    lightningCudaAvailable: payload.lightningCudaAvailable ?? null,
    errors: payload.errors ?? []
  }

  if (payload.torchImportOk !== true) {
    const isTorchMissing = hasMissingModuleMessage(payload.errors ?? [], 'torch')
    return createAcceleratorDiagnosticsSummary(
      'error',
      isTorchMissing ? 'torch_missing' : 'torch_import_failed',
      isTorchMissing ? 'PyTorch is not installed' : 'Torch is not importable',
      isTorchMissing
        ? 'This environment does not currently have PyTorch installed, so NAM-BOT cannot inspect accelerator support.'
        : 'This environment could not import PyTorch cleanly, so NAM-BOT cannot determine GPU visibility.',
      {
        ...summaryExtras,
        suggestion: hostNvidia.hostNvidiaSmiAvailable
          ? 'Install PyTorch in the selected environment, and if this machine uses NVIDIA, prefer the CUDA-enabled PyTorch build.'
          : 'Install PyTorch in the selected environment and re-run diagnostics.'
      }
    )
  }

  if (payload.namImportOk !== true) {
    const isNamMissing = hasMissingModuleMessage(payload.errors ?? [], 'nam')
    return createAcceleratorDiagnosticsSummary(
      'error',
      isNamMissing ? 'nam_missing' : 'nam_import_failed',
      isNamMissing ? 'NAM is not installed' : 'NAM is not importable',
      isNamMissing
        ? 'PyTorch imported correctly, but Neural Amp Modeler is not installed in this environment.'
        : 'PyTorch imported correctly, but Neural Amp Modeler still failed to import in this environment.',
      {
        ...summaryExtras,
        suggestion: 'Install or repair neural-amp-modeler in this same environment, then re-run diagnostics.'
      }
    )
  }

  if (payload.cudaAvailable && (payload.cudaDeviceCount ?? 0) > 0) {
    const isRocmBuild = payload.hipVersion != null

    if (payload.lightningImportOk && payload.lightningCudaAvailable === false) {
      return createAcceleratorDiagnosticsSummary(
        'advisory',
        'lightning_mismatch',
        'PyTorch sees GPU, but Lightning did not confirm it',
        isRocmBuild
          ? 'ROCm GPU is visible to torch, but Lightning did not report the accelerator as available. NAM may still fall back to CPU until that mismatch is resolved.'
          : 'CUDA is visible to torch, but Lightning did not report the accelerator as available. NAM may still fall back to CPU until that mismatch is resolved.',
        {
          ...summaryExtras,
          suggestion: 'Check for mixed torch / lightning installs in this environment and confirm they were installed against the same GPU-enabled PyTorch build.'
        }
      )
    }

    if (isRocmBuild) {
      return createAcceleratorDiagnosticsSummary(
        'ready',
        'rocm_ready',
        'ROCm (AMD) GPU is visible',
        payload.deviceName
          ? `PyTorch can see ${payload.deviceName} (ROCm ${payload.hipVersion}), so NAM should be able to request AMD GPU acceleration in this environment.`
          : `PyTorch reports AMD GPU acceleration with ROCm ${payload.hipVersion} in this environment, so NAM should be able to request GPU acceleration.`,
        {
          ...summaryExtras,
          suggestion: 'If a training run still falls back to CPU, compare this page with the job log to see whether Lightning changes the accelerator decision at runtime.'
        }
      )
    }

    return createAcceleratorDiagnosticsSummary(
      'ready',
      'cuda_ready',
      'CUDA GPU is visible',
      payload.deviceName
        ? `PyTorch can see ${payload.deviceName}, so NAM should be able to request GPU acceleration in this environment.`
        : 'PyTorch reports at least one CUDA device in this environment, so NAM should be able to request GPU acceleration.',
      {
        ...summaryExtras,
        suggestion: 'If a training run still falls back to CPU, compare this page with the job log to see whether Lightning changes the accelerator decision at runtime.'
      }
    )
  }

  if (payload.mpsAvailable) {
    return createAcceleratorDiagnosticsSummary(
      'ready',
      'mps_ready',
      'MPS accelerator is visible',
      'PyTorch reports an Apple Metal accelerator in this environment.',
      {
        ...summaryExtras
      }
    )
  }

  const isCpuOnlyTorch =
    (payload.torchVersion ?? '').includes('+cpu') ||
    (payload.torchCudaVersion == null && payload.hipVersion == null)

  if (isCpuOnlyTorch) {
    return createAcceleratorDiagnosticsSummary(
      'cpu_only',
      'torch_cpu_only',
      hostNvidia.hostNvidiaSmiAvailable
        ? 'This PyTorch build is CPU-only'
        : 'No supported GPU is currently visible',
      hostNvidia.hostNvidiaSmiAvailable
        ? 'PyTorch imported correctly, but it is not a CUDA-enabled build in this environment.'
        : 'PyTorch imported correctly, but this environment is currently set up for CPU training only. NAM-BOT did not detect an NVIDIA CUDA device or an Apple Metal accelerator for this target.',
      {
        ...summaryExtras,
        suggestion: hostNvidia.hostNvidiaSmiAvailable
          ? 'This machine exposes an NVIDIA GPU, but the environment is using CPU-only PyTorch. Reinstall torch with the CUDA wheel inside this same environment.'
          : 'CPU training can still work on this machine. If you expected GPU acceleration, double-check the hardware and use the troubleshooting export for a deeper review.'
      }
    )
  }

  return createAcceleratorDiagnosticsSummary(
    'not_visible',
    'cuda_not_visible',
    'No CUDA GPU is visible to PyTorch',
    'This environment appears to have a CUDA-capable torch build, but torch.cuda.is_available() is still false.',
    {
      ...summaryExtras,
      suggestion: hostNvidia.hostNvidiaSmiAvailable
        ? 'The machine sees an NVIDIA GPU, but this environment still cannot use it. Re-check the active environment, torch build, and any mixed torch/lightning installs.'
        : 'Check the NVIDIA driver, confirm the GPU is visible on the host, and make sure NAM-BOT is pointing at the environment where the CUDA-enabled PyTorch build is installed.'
    }
  )
}

export async function inspectTrainingLaunchDiagnostics(
  settings: AppSettings
): Promise<TrainingLaunchDiagnosticsSummary> {
  const checks: TrainingLaunchCheckResult[] = []
  const appLocationCheck = createMacAppLocationCheck()
  if (appLocationCheck) {
    checks.push(appLocationCheck)
  }

  if (settings.backendMode === 'direct-python') {
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'direct_python_unsupported',
        'Training launch mode',
        'Direct Python mode is not supported by the current training launch path.',
        {
          detail: settings.pythonExecutablePath ?? 'No Python executable configured',
          suggestion: 'Use Conda environment name or Conda prefix mode for training launch readiness.'
        }
      ),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped because direct Python launch is not wired to the trainer yet.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped because direct Python launch is not wired to the trainer yet.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'error',
      'direct_python_unsupported',
      'Training launch is not ready',
      'NAM-BOT currently launches training through Conda, but Settings is using Direct Python mode.',
      {
        checks,
        suggestion: 'Switch Settings to a Conda environment name or prefix before training.'
      }
    )
  }

  const condaExecutablePath = settings.condaExecutablePath?.trim() ?? ''
  if (!condaExecutablePath) {
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'conda_not_configured',
        'Conda executable',
        'No Conda executable is configured.',
        { suggestion: 'Open Settings and select your Conda executable before running training.' }
      ),
      createTrainingLaunchCheck('skip', 'workspace_skipped', 'Workspace write', 'Skipped until Conda is configured.'),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped until Conda is configured.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until Conda is configured.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'not_checked',
      'conda_not_configured',
      'Training launch was not checked',
      'Configure Conda before NAM-BOT can test the real training launch path.',
      {
        checks,
        suggestion: 'Open Settings and select your Conda executable.'
      }
    )
  }

  if (!(await isConfiguredCondaReachable(condaExecutablePath))) {
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'conda_unreachable',
        'Conda executable',
        `Conda is not reachable at ${condaExecutablePath}.`,
        { suggestion: 'Use the full Conda executable path in Settings, then re-run Diagnostics.' }
      ),
      createTrainingLaunchCheck('skip', 'workspace_skipped', 'Workspace write', 'Skipped until Conda is reachable.'),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped until Conda is reachable.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until Conda is reachable.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'not_checked',
      'conda_unreachable',
      'Training launch was not checked',
      'NAM-BOT cannot test the training launch path until Conda is reachable.',
      {
        checks,
        suggestion: 'Fix the Conda executable path in Settings.'
      }
    )
  }

  checks.push(
    createTrainingLaunchCheck(
      'pass',
      'conda_reachable',
      'Conda executable',
      'Conda is reachable for launch testing.',
      { detail: condaExecutablePath }
    )
  )

  if (process.platform !== 'win32' && isBareExecutablePath(condaExecutablePath)) {
    checks.push(
      createTrainingLaunchCheck(
        'warn',
        'bare_conda_path',
        'Conda path style',
        `Conda is configured as "${condaExecutablePath}" instead of a full executable path.`,
        { suggestion: 'If launch fails on this machine, paste the full Conda path into Settings instead of relying on PATH.' }
      )
    )
  }

  if (settings.backendMode === 'conda-name' && !settings.environmentName) {
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'environment_not_configured',
        'Conda environment',
        'No Conda environment name is configured.',
        { suggestion: 'Set the Conda environment name in Settings.' }
      ),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped until the Conda environment is configured.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until the Conda environment is configured.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'not_checked',
      'environment_not_configured',
      'Training launch was not checked',
      'Choose a Conda environment before NAM-BOT can test the real training launch path.',
      { checks, suggestion: 'Set the Conda environment name in Settings.' }
    )
  }

  if (settings.backendMode === 'conda-prefix' && !settings.environmentPrefixPath) {
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'environment_not_configured',
        'Conda environment',
        'No Conda environment prefix is configured.',
        { suggestion: 'Set the Conda environment prefix path in Settings.' }
      ),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped until the Conda environment is configured.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until the Conda environment is configured.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'not_checked',
      'environment_not_configured',
      'Training launch was not checked',
      'Choose a Conda environment prefix before NAM-BOT can test the real training launch path.',
      { checks, suggestion: 'Set the Conda environment prefix path in Settings.' }
    )
  }

  const lightningSecurity = await inspectLightningPackageSecurity(settings)
  const vulnerableLightningPackage = lightningSecurity.ok ? getVulnerableLightningPackage(lightningSecurity) : null
  if (!lightningSecurity.ok || vulnerableLightningPackage) {
    const detail = vulnerableLightningPackage
      ? createLightningSecurityDetail(vulnerableLightningPackage)
      : 'NAM-BOT could not verify Lightning package metadata safely.'
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        vulnerableLightningPackage ? 'lightning_vulnerable' : 'lightning_security_check_failed',
        'Lightning safety',
        vulnerableLightningPackage ? `${vulnerableLightningPackage.name} ${vulnerableLightningPackage.version} is blocked.` : 'Lightning package safety could not be verified.',
        {
          detail,
          suggestion: createLightningSecuritySuggestion(),
          outputTail: tailOutput(lightningSecurity.output)
        }
      ),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until Lightning package safety is resolved.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'error',
      vulnerableLightningPackage ? 'lightning_vulnerable' : 'lightning_security_check_failed',
      'Training launch is blocked',
      detail,
      {
        checks,
        suggestion: createLightningSecuritySuggestion(),
        errors: [lightningSecurity.output.trim()].filter((entry) => entry.length > 0)
      }
    )
  }

  const workspaceRoot = resolveWorkspaceRoot(settings)
  let workspacePath: string | null = null

  try {
    if (!existsSync(workspaceRoot)) {
      mkdirSync(workspaceRoot, { recursive: true })
    }
    workspacePath = mkdtempSync(join(workspaceRoot, 'diagnostics-'))
    const writeProbePath = join(workspacePath, 'write-test.txt')
    writeFileSync(writeProbePath, 'NAM_BOT_WORKSPACE_OK', 'utf8')
    rmSync(writeProbePath, { force: true })
    checks.push(
      createTrainingLaunchCheck(
        'pass',
        'workspace_writable',
        'Workspace write',
        'NAM-BOT can create and write to a temporary training workspace.',
        { detail: workspacePath }
      )
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workspace write failed'
    checks.push(
      createTrainingLaunchCheck(
        'fail',
        'workspace_unwritable',
        'Workspace write',
        'NAM-BOT could not create or write to the training workspace.',
        {
          detail: message,
          suggestion: 'Set Default Workspace Root to a local writable folder in Settings.'
        }
      ),
      createTrainingLaunchCheck('skip', 'pty_python_skipped', 'PTY Python launch', 'Skipped until the training workspace is writable.'),
      createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until the training workspace is writable.')
    )

    return createTrainingLaunchDiagnosticsSummary(
      'error',
      'workspace_unwritable',
      'Training workspace is not writable',
      'NAM-BOT must be able to create a workspace before it can launch training.',
      {
        workspaceRoot,
        workspacePath,
        checks,
        suggestion: 'Choose a local writable Default Workspace Root in Settings.',
        errors: [message]
      }
    )
  }

  try {
    const pythonArgs = ['python', '-c', `print('${TRAINING_LAUNCH_PTY_PREFIX}')`]
    const pythonCommand = formatCondaDiagnosticCommand(settings, pythonArgs)
    const pythonResult = await runCondaPtyCommand(settings, pythonArgs, { cwd: workspacePath })

    if (pythonResult.timedOut) {
      checks.push(
        createTrainingLaunchCheck(
          'fail',
          'pty_launch_timeout',
          'PTY Python launch',
          'The training-style terminal launch timed out before Python responded.',
          {
            command: pythonCommand,
            outputTail: tailOutput(pythonResult.output),
            suggestion: 'Conda may be slow or stuck. Re-run Diagnostics, and if it repeats, verify the environment manually in Terminal.'
          }
        ),
        createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until PTY Python launch works.')
      )

      return createTrainingLaunchDiagnosticsSummary(
        'error',
        'pty_launch_timeout',
        'Training launch timed out',
        'NAM-BOT could not confirm that the training terminal launch path can start Python in time.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: 'Try again once. If it still times out, inspect the Conda environment from Terminal.',
          errors: [tailOutput(pythonResult.output)].filter((entry) => entry.length > 0)
        }
      )
    }

    if (!pythonResult.ok) {
      const errorDetail = pythonResult.errorMessage ?? (tailOutput(pythonResult.output) || 'PTY launch failed')
      checks.push(
        createTrainingLaunchCheck(
          'fail',
          'pty_launch_failed',
          'PTY Python launch',
          'NAM-BOT could not start the terminal process used for training.',
          {
            detail: errorDetail,
            command: pythonCommand,
            outputTail: tailOutput(pythonResult.output),
            suggestion: isBareExecutablePath(condaExecutablePath)
              ? 'Use the full Conda executable path in Settings instead of relying on PATH.'
              : 'Move the app to a normal local application folder and verify that security software is not blocking child processes.'
          }
        ),
        createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until PTY Python launch works.')
      )

      return createTrainingLaunchDiagnosticsSummary(
        'error',
        'pty_launch_failed',
        'Training launch failed before NAM started',
        'The configured environment passed basic checks, but NAM-BOT could not start the same terminal process used by real training.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: isBareExecutablePath(condaExecutablePath)
            ? 'Paste the full Conda executable path into Settings, then re-run Diagnostics.'
            : 'Check the app location, app architecture, workspace folder, and security software.',
          errors: [errorDetail]
        }
      )
    }

    if (!pythonResult.output.includes(TRAINING_LAUNCH_PTY_PREFIX)) {
      checks.push(
        createTrainingLaunchCheck(
          'fail',
          'pty_payload_missing',
          'PTY Python launch',
          'The terminal process started, but Python did not return the expected readiness marker.',
          {
            command: pythonCommand,
            outputTail: tailOutput(pythonResult.output),
            suggestion: 'Inspect the output below and verify the selected Conda environment can run Python cleanly.'
          }
        ),
        createTrainingLaunchCheck('skip', 'nam_full_pty_skipped', 'nam-full PTY launch', 'Skipped until PTY Python launch returns the expected marker.')
      )

      return createTrainingLaunchDiagnosticsSummary(
        'error',
        'pty_payload_missing',
        'Training launch returned unexpected output',
        'NAM-BOT started the training terminal process, but did not receive the expected readiness marker from Python.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: 'Verify Python in the selected environment and re-run Diagnostics.',
          errors: [tailOutput(pythonResult.output)].filter((entry) => entry.length > 0)
        }
      )
    }

    checks.push(
      createTrainingLaunchCheck(
        'pass',
        'pty_python_ok',
        'PTY Python launch',
        'NAM-BOT can launch Python through the same terminal path used for training.',
        { command: pythonCommand }
      )
    )

    const namFullArgs = ['nam-full', '--help']
    const namFullCommand = formatCondaDiagnosticCommand(settings, namFullArgs)
    const namFullResult = await runCondaPtyCommand(settings, namFullArgs, { cwd: workspacePath })
    const namFullOutput = namFullResult.output
    const namFullHelpOk = namFullResult.ok || namFullOutput.includes('usage') || namFullOutput.includes('Options')

    if (namFullResult.timedOut) {
      checks.push(
        createTrainingLaunchCheck(
          'fail',
          'nam_full_pty_timeout',
          'nam-full PTY launch',
          'The trainer command timed out when launched through the training terminal path.',
          {
            command: namFullCommand,
            outputTail: tailOutput(namFullOutput),
            suggestion: 'Re-run Diagnostics. If it repeats, verify that nam-full --help returns promptly in Terminal.'
          }
        )
      )

      return createTrainingLaunchDiagnosticsSummary(
        'error',
        'nam_full_pty_timeout',
        'Trainer launch timed out',
        'Python can launch through NAM-BOT, but the NAM trainer command did not return in time.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: 'Repair or reinstall neural-amp-modeler in this environment if nam-full hangs in Terminal too.',
          errors: [tailOutput(namFullOutput)].filter((entry) => entry.length > 0)
        }
      )
    }

    if (!namFullHelpOk) {
      const errorDetail = namFullResult.errorMessage ?? (tailOutput(namFullOutput) || 'nam-full launch failed')
      checks.push(
        createTrainingLaunchCheck(
          'fail',
          'nam_full_pty_failed',
          'nam-full PTY launch',
          'NAM-BOT could not launch the NAM trainer command through the training terminal path.',
          {
            detail: errorDetail,
            command: namFullCommand,
            outputTail: tailOutput(namFullOutput),
            suggestion: 'Repair neural-amp-modeler in this environment, then re-run Diagnostics.'
          }
        )
      )

      return createTrainingLaunchDiagnosticsSummary(
        'error',
        'nam_full_pty_failed',
        'Trainer command is not launch-ready',
        'The terminal launch path works for Python, but not for the NAM trainer command.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: 'Install or repair neural-amp-modeler in this same environment.',
          errors: [errorDetail]
        }
      )
    }

    checks.push(
      createTrainingLaunchCheck(
        'pass',
        'nam_full_pty_ok',
        'nam-full PTY launch',
        'NAM-BOT can launch the NAM trainer command through the training terminal path.',
        { command: namFullCommand }
      )
    )

    const warningCheck = checks.find((check) => check.status === 'warn')
    if (warningCheck) {
      const issue: TrainingLaunchDiagnosticsIssue =
        warningCheck.code === 'mac_app_on_dmg' || warningCheck.code === 'mac_app_translocated' || warningCheck.code === 'bare_conda_path'
          ? warningCheck.code
          : 'bare_conda_path'

      return createTrainingLaunchDiagnosticsSummary(
        'advisory',
        issue,
        'Training launch works with advisory notes',
        'NAM-BOT can launch the training path, but one setup detail may be fragile on some machines.',
        {
          workspaceRoot,
          workspacePath,
          checks,
          suggestion: warningCheck.suggestion
        }
      )
    }

    return createTrainingLaunchDiagnosticsSummary(
      'ready',
      'ready',
      'Training launch is ready',
      'NAM-BOT can create a training workspace and launch the NAM trainer through the same terminal path used by real jobs.',
      {
        workspaceRoot,
        workspacePath,
        checks
      }
    )
  } finally {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  }
}

export async function runNamHelloWorld(
  settings: AppSettings
): Promise<{ ok: boolean; output: string }> {
  try {
    await assertLightningPackageSafe(settings)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lightning package security check failed'
    return { ok: false, output: message }
  }

  return runCondaCommand(settings, ['nam-hello-world'])
}

function buildNamLatencyAnalysisScript(inputPath: string, outputPath: string): string {
  const inputPathLiteral = JSON.stringify(inputPath)
  const outputPathLiteral = JSON.stringify(outputPath)
  const prefixLiteral = JSON.stringify(LATENCY_ANALYSIS_PREFIX)

  return [
    'import json',
    'import traceback',
    'from nam.train import core',
    '',
    `input_path = ${inputPathLiteral}`,
    `output_path = ${outputPathLiteral}`,
    `prefix = ${prefixLiteral}`,
    '',
    'def get_warning_payload(warnings):',
    '    if warnings is None:',
    '        return None',
    '    return {',
    "        'matchesLookahead': bool(getattr(warnings, 'matches_lookahead', False)),",
    "        'disagreementTooHigh': bool(getattr(warnings, 'disagreement_too_high', False)),",
    "        'notDetected': bool(getattr(warnings, 'not_detected', False)),",
    '    }',
    '',
    'try:',
    '    input_version, strong_match = core._detect_input_version(input_path)',
    '    try:',
    '        latency = core._analyze_latency(None, input_version, input_path, output_path, silent=True, _override_suppress_plots=True)',
    '    except TypeError:',
    '        latency = core._analyze_latency(None, input_version, input_path, output_path, silent=True)',
    '    calibration = getattr(latency, "calibration", None)',
    '    recommended = getattr(calibration, "recommended", None)',
    '    warnings = getattr(calibration, "warnings", None)',
    '    delays = getattr(calibration, "delays", []) or []',
    '    payload = {',
    "        'ok': recommended is not None,",
    "        'recommendedLatency': int(recommended) if recommended is not None else None,",
    "        'inputVersion': str(input_version),",
    "        'strongInputMatch': bool(strong_match),",
    "        'warnings': get_warning_payload(warnings),",
    "        'delays': [int(delay) for delay in delays],",
    "        'errorMessage': None if recommended is not None else 'NAM did not detect a usable latency from the output audio.',",
    '    }',
    'except Exception as error:',
    '    payload = {',
    "        'ok': False,",
    "        'recommendedLatency': None,",
    "        'inputVersion': None,",
    "        'strongInputMatch': None,",
    "        'warnings': None,",
    "        'delays': [],",
    "        'errorMessage': str(error) or traceback.format_exc(),",
    '    }',
    'print(prefix + json.dumps(payload))'
  ].join('\n')
}

export async function analyzeNamLatency(
  settings: AppSettings,
  inputPath: string,
  outputPath: string
): Promise<NamLatencyAnalysisResult> {
  try {
    await assertLightningPackageSafe(settings)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lightning package security check failed'
    return createFailedLatencyAnalysis('', message)
  }

  const script = buildNamLatencyAnalysisScript(inputPath, outputPath)
  const result = await runPythonScriptInEnvironment(settings, script, 'latency-analysis.py')
  const parsed = parseNamLatencyAnalysisOutput(result.output)

  if (!result.ok && !parsed.errorMessage) {
    return createFailedLatencyAnalysis(result.output, tailOutput(result.output) || 'NAM latency analyzer failed to run.')
  }

  return parsed
}

export async function runNamFull(
  settings: AppSettings,
  args: {
    dataConfigPath: string
    modelConfigPath: string
    learningConfigPath: string
    outputRootDir: string
    noShow?: boolean
    noPlots?: boolean
    cwd?: string
  },
  hooks: RunHooks
): Promise<TrainingProcessController> {
  await assertLightningPackageSafe(settings)

  return new Promise((resolve, reject) => {
    const namArgs = [
      'nam-full',
      args.dataConfigPath,
      args.modelConfigPath,
      args.learningConfigPath,
      args.outputRootDir
    ]

    if (args.noShow) {
      namArgs.push('--no-show')
    }

    if (args.noPlots) {
      namArgs.push('--no-plots')
    }

    let pty: IPty
    try {
      pty = spawnCondaPty(settings, namArgs, {
        cwd: args.cwd
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid backend configuration'
      const runtimeError = error instanceof Error ? error : new Error(message)
      hooks.onError(runtimeError)
      reject(runtimeError)
      return
    }

    hooks.onStarted(pty.pid)

    pty.onData((data: string) => {
      hooks.onTerminalData(data)
    })

    pty.onExit(({ exitCode }) => {
      hooks.onExit(exitCode)
    })

    resolve({
      cancel: () => {
        log.info('Requesting graceful stop for nam-full PTY process')
        requestGracefulPtyStop(pty)
      },
      forceKill: async () => {
        log.info('Force-killing nam-full PTY process tree')
        await forceKillPtyProcessTree(pty)
      },
      forceKillSync: () => {
        log.info('Synchronously force-killing nam-full PTY process tree')
        forceKillPtyProcessTreeSync(pty)
      }
    })
  })
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  published_at: string
}

interface VersionCache {
  version: string
  url: string
  publishedAt: string
  checkedAt: number
}

const VERSION_CACHE_FILE = join(app.getPath('userData'), 'nam-version-cache.json')
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function loadVersionCache(): VersionCache | null {
  try {
    if (!existsSync(VERSION_CACHE_FILE)) {
      return null
    }
    const data = JSON.parse(readFileSync(VERSION_CACHE_FILE, 'utf8')) as VersionCache
    const age = Date.now() - data.checkedAt
    if (age > VERSION_CACHE_TTL_MS) {
      log.info('NAM version cache expired')
      return null
    }
    return data
  } catch (error) {
    log.warn('Failed to load NAM version cache:', error)
    return null
  }
}

function saveVersionCache(cache: VersionCache): void {
  try {
    const cacheDir = dirname(VERSION_CACHE_FILE)
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }
    writeFileSync(VERSION_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
  } catch (error) {
    log.warn('Failed to save NAM version cache:', error)
  }
}

export async function fetchLatestNamVersion(): Promise<{
  version: string
  url: string
  publishedAt: string
  status: 'ok' | 'offline' | 'rate_limited' | 'error'
  errorMessage?: string
} | null> {
  const cached = loadVersionCache()
  if (cached) {
    log.info('Using cached NAM version:', cached.version)
    return {
      version: cached.version,
      url: cached.url,
      publishedAt: cached.publishedAt,
      status: 'ok'
    }
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/sdatkinson/neural-amp-modeler/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'NAM-BOT',
        'Accept': 'application/vnd.github.v3+json'
      }
    }

    const req = https.request(options, (res) => {
      let data = ''

      if (res.statusCode === 403) {
        log.warn('GitHub API rate limited')
        resolve({
          version: '',
          url: '',
          publishedAt: '',
          status: 'rate_limited',
          errorMessage: 'GitHub API rate limit exceeded. Try again later.'
        })
        return
      }

      if (res.statusCode !== 200) {
        log.warn('Failed to fetch latest NAM version, status:', res.statusCode)
        resolve({
          version: '',
          url: '',
          publishedAt: '',
          status: 'error',
          errorMessage: `Failed to fetch latest version (HTTP ${res.statusCode})`
        })
        return
      }

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const release = JSON.parse(data) as GitHubRelease
          const version = release.tag_name.replace(/^v/, '')
          const result = {
            version,
            url: release.html_url,
            publishedAt: release.published_at,
            status: 'ok' as const
          }
          
          saveVersionCache({
            version,
            url: release.html_url,
            publishedAt: release.published_at,
            checkedAt: Date.now()
          })
          
          resolve(result)
        } catch (error) {
          log.error('Failed to parse GitHub release:', error)
          resolve({
            version: '',
            url: '',
            publishedAt: '',
            status: 'error',
            errorMessage: 'Failed to parse GitHub release data'
          })
        }
      })
    })

    req.on('error', (error) => {
      log.error('Failed to fetch latest NAM version:', error)
      resolve({
        version: '',
        url: '',
        publishedAt: '',
        status: 'offline',
        errorMessage: error.message
      })
    })

    req.setTimeout(10000, () => {
      req.destroy()
      resolve({
        version: '',
        url: '',
        publishedAt: '',
        status: 'offline',
        errorMessage: 'Request timed out'
      })
    })

    req.end()
  })
}

export async function detectNamVersion(settings: AppSettings): Promise<string | null> {
  try {
    await assertLightningPackageSafe(settings)
  } catch (error) {
    log.warn('Skipped NAM version detection because Lightning security preflight failed:', error)
    return null
  }

  const script = [
    'import json',
    'import nam',
    "version = getattr(nam, '__version__', None)",
    'print(json.dumps({\'version\': version}))'
  ].join('\n')

  const result = await runPythonScriptInEnvironment(settings, script, 'nam-version-probe.py')
  if (!result.ok) {
    log.warn('Failed to detect NAM version:', result.output)
    return null
  }

  try {
    const line = result.output.split(/\r?\n/).find((entry) => entry.trim().startsWith('{'))
    if (!line) {
      return null
    }
    const payload = JSON.parse(line.trim())
    return payload.version ?? null
  } catch (error) {
    log.warn('Failed to parse NAM version:', error)
    return null
  }
}

export async function getNamVersionInfo(settings: AppSettings): Promise<NamVersionInfo> {
  const [installedVersion, latestResult] = await Promise.all([
    detectNamVersion(settings),
    fetchLatestNamVersion()
  ])

  if (!latestResult) {
    return {
      installedVersion,
      latestVersion: null,
      isUpToDate: null,
      latestReleaseUrl: null,
      publishedAt: null,
      checkStatus: 'error',
      errorMessage: 'Failed to fetch latest version'
    }
  }

  if (latestResult.status !== 'ok') {
    return {
      installedVersion,
      latestVersion: null,
      isUpToDate: null,
      latestReleaseUrl: null,
      publishedAt: null,
      checkStatus: latestResult.status,
      errorMessage: latestResult.errorMessage
    }
  }

  const isUpToDate = installedVersion !== null && compareVersions(installedVersion, latestResult.version) >= 0

  return {
    installedVersion,
    latestVersion: latestResult.version,
    isUpToDate,
    latestReleaseUrl: latestResult.url,
    publishedAt: latestResult.publishedAt,
    checkStatus: 'ok'
  }
}

export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((part) => parseInt(part.replace(/[^0-9]/g, ''), 10) || 0)
  const bParts = b.split('.').map((part) => parseInt(part.replace(/[^0-9]/g, ''), 10) || 0)
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] ?? 0
    const bPart = bParts[i] ?? 0
    if (aPart !== bPart) {
      return aPart - bPart
    }
  }
  
  return 0
}
