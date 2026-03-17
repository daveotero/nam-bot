import { ChildProcess, execFileSync, execFile, spawn, SpawnOptionsWithoutStdio } from 'child_process'
import log from 'electron-log/main'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { spawn as spawnPty, IPty } from 'node-pty'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  AcceleratorDiagnosticsSummary,
  AppSettings,
  BackendCheckResult,
  BackendValidationSummary,
  CondaDiscoverySummary
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

interface HostNvidiaSummary {
  hostNvidiaSmiAvailable: boolean | null
  hostNvidiaGpuName: string | null
  hostDriverVersion: string | null
}

export interface TrainingProcessController {
  cancel: () => void
  forceKill: () => Promise<void>
  forceKillSync: () => void
}

export interface NamBackendAdapter {
  validateConnection(settings: AppSettings): Promise<BackendValidationSummary>
  detectNamVersion(settings: AppSettings): Promise<string | null>
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

function hasMissingModuleMessage(errors: string[], moduleName: string): boolean {
  const singleQuoteNeedle = `No module named '${moduleName}'`
  const doubleQuoteNeedle = `No module named "${moduleName}"`
  return errors.some((entry) => entry.includes(singleQuoteNeedle) || entry.includes(doubleQuoteNeedle))
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
    if (payload.lightningImportOk && payload.lightningCudaAvailable === false) {
      return createAcceleratorDiagnosticsSummary(
        'advisory',
        'lightning_mismatch',
        'PyTorch sees CUDA, but Lightning did not confirm it',
        'CUDA is visible to torch, but Lightning did not report the accelerator as available. NAM may still fall back to CPU until that mismatch is resolved.',
        {
          ...summaryExtras,
          suggestion: 'Check for mixed torch / lightning installs in this environment and confirm they were installed against the same CUDA-enabled PyTorch build.'
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
    payload.torchCudaVersion == null

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

export async function runNamHelloWorld(
  settings: AppSettings
): Promise<{ ok: boolean; output: string }> {
  return runCondaCommand(settings, ['nam-hello-world'])
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
