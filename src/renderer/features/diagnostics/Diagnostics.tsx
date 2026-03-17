import { useEffect, useState } from 'react'
import {
  AcceleratorDiagnosticsSummary,
  AppSettings,
  BackendCheckResult,
  BackendValidationSummary,
  useAppStore
} from '../../state/store'

interface CopyableCodeBlockProps {
  label: string
  command: string
}

interface AcceleratorGuidance {
  title: string
  body: string
  note?: string
  setupSteps?: CopyableCodeBlockProps[]
  steps: CopyableCodeBlockProps[]
}

interface DiagnosticsExportPayload {
  generatedAt: string
  host: {
    platform: string
    userAgent: string
    language: string
  }
  targetEnvironment: string
  settings: {
    backendMode: AppSettings['backendMode'] | null
    condaExecutablePath: string | null
    environmentName: string | null
    environmentPrefixPath: string | null
    pythonExecutablePath: string | null
    preferredLaunchMode: AppSettings['preferredLaunchMode'] | null
  }
  validation: BackendValidationSummary | null
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
  commands: {
    verifyPython: string
    verifyTorch: string
    verifyNam: string
    reinstallNam: string
    reinstallTorchCuda: string
    reinstallTorchDefault: string
  }
}

interface DiagnosticCommandSet {
  verifyPython: string
  verifyTorch: string
  verifyNam: string
  inspectLightning: string
  reinstallNam: string
  uninstallTorch: string
  reinstallTorchCuda: string
  reinstallTorchDefault: string
}

function copyText(value: string): void {
  void navigator.clipboard.writeText(value)
}

function CheckResult({ result }: { result: BackendCheckResult }) {
  return (
    <div
      style={{
        padding: '16px',
        marginBottom: '12px',
        border: `2px solid ${result.ok ? 'var(--neon-green)' : 'var(--neon-magenta)'}`,
        backgroundColor: 'var(--bg-void)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span
          style={{
            color: result.ok ? 'var(--neon-green)' : 'var(--neon-magenta)',
            fontSize: '24px',
            fontFamily: 'var(--font-arcade)'
          }}
        >
          {result.ok ? '✓ PASS' : '✗ FAIL'}
        </span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '20px', color: 'var(--text-ash)' }}>
          {result.title}
        </span>
      </div>
      <p style={{ color: 'var(--text-steel)', fontSize: '14px', marginBottom: result.suggestion ? '8px' : '0' }}>
        {result.message}
      </p>
      {result.suggestion && <p style={{ color: 'var(--neon-cyan)', fontSize: '13px' }}>→ {result.suggestion}</p>}
    </div>
  )
}

function CopyableCodeBlock({ label, command }: CopyableCodeBlockProps) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          backgroundColor: 'rgba(0, 255, 65, 0.05)',
          border: '1px solid var(--border-dim)',
          borderBottom: 'none',
          color: 'var(--text-steel)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}
      >
        <span>{label}</span>
        <button className="btn btn-sm btn-secondary" onClick={() => copyText(command)} style={{ padding: '2px 8px', fontSize: '10px' }}>
          Copy
        </button>
      </div>
      <pre
        style={{
          backgroundColor: 'var(--bg-void)',
          padding: '12px',
          border: '2px solid var(--border-dim)',
          color: 'var(--neon-green)',
          fontFamily: 'var(--font-arcade)',
          fontSize: '14px',
          overflowX: 'auto',
          margin: 0,
          whiteSpace: 'pre-wrap'
        }}
      >
        {command}
      </pre>
    </div>
  )
}

function DiagnosticFact({
  label,
  value
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-dim)',
        backgroundColor: 'rgba(9, 9, 11, 0.25)',
        gap: '16px'
      }}
    >
      <span
        style={{
          color: 'var(--text-steel)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: 'var(--text-ash)',
          fontSize: '12px',
          textAlign: 'right',
          wordBreak: 'break-all',
          fontFamily: 'Consolas, Monaco, monospace'
        }}
      >
        {value}
      </span>
    </div>
  )
}

function formatMaybeText(value: string | null | undefined, fallback = 'Unknown'): string {
  return value && value.trim().length > 0 ? value : fallback
}

function formatMaybeBoolean(
  value: boolean | null | undefined,
  trueLabel = 'Yes',
  falseLabel = 'No'
): string {
  if (value === true) {
    return trueLabel
  }
  if (value === false) {
    return falseLabel
  }
  return 'Unknown'
}

function compactText(value: string | null | undefined, fallback = 'Not reported'): string {
  if (!value || value.trim().length === 0) {
    return fallback
  }
  return value.replace(/\s+/g, ' ').trim()
}

function quoteShell(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

function getEnvironmentReference(settings: AppSettings | null): string {
  if (!settings) {
    return 'Settings not loaded'
  }

  switch (settings.backendMode) {
    case 'conda-name':
      return settings.environmentName ? `Conda environment "${settings.environmentName}"` : 'Conda environment not configured'
    case 'conda-prefix':
      return settings.environmentPrefixPath
        ? `Conda prefix "${settings.environmentPrefixPath}"`
        : 'Conda prefix not configured'
    case 'direct-python':
      return settings.pythonExecutablePath
        ? `Python executable "${settings.pythonExecutablePath}"`
        : 'Python executable not configured'
    default:
      return 'Unknown backend target'
  }
}

function getRuntimePrefix(settings: AppSettings | null): string | null {
  if (!settings) {
    return null
  }

  switch (settings.backendMode) {
    case 'conda-name':
      return settings.environmentName
        ? `${quoteShell(settings.condaExecutablePath ?? (window.namBot.platform === 'win32' ? 'conda.exe' : 'conda'))} run --name ${quoteShell(settings.environmentName)}`
        : null
    case 'conda-prefix':
      return settings.environmentPrefixPath
        ? `${quoteShell(settings.condaExecutablePath ?? (window.namBot.platform === 'win32' ? 'conda.exe' : 'conda'))} run --prefix ${quoteShell(settings.environmentPrefixPath)}`
        : null
    case 'direct-python':
      return settings.pythonExecutablePath ? quoteShell(settings.pythonExecutablePath) : null
    default:
      return null
  }
}

function buildPythonInlineCommand(settings: AppSettings | null, snippet: string): string {
  const runtimePrefix = getRuntimePrefix(settings)
  if (!runtimePrefix) {
    return `python -c "${snippet}"`
  }
  if (settings?.backendMode === 'direct-python') {
    return `${runtimePrefix} -c "${snippet}"`
  }
  return `${runtimePrefix} python -c "${snippet}"`
}

function buildPipCommand(settings: AppSettings | null, pipArgs: string): string {
  const runtimePrefix = getRuntimePrefix(settings)
  if (!runtimePrefix) {
    return `pip ${pipArgs}`
  }
  if (settings?.backendMode === 'direct-python') {
    return `${runtimePrefix} -m pip ${pipArgs}`
  }
  return `${runtimePrefix} pip ${pipArgs}`
}

function getDiagnosticCommands(settings: AppSettings | null): DiagnosticCommandSet {
  return {
    verifyPython: buildPythonInlineCommand(settings, 'import platform, sys; print(sys.executable); print(sys.version); print(platform.platform())'),
    verifyTorch: buildPythonInlineCommand(
      settings,
      "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.device_count()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)"
    ),
    verifyNam: buildPythonInlineCommand(settings, "import nam; print(getattr(nam, '__version__', None))"),
    inspectLightning: buildPythonInlineCommand(
      settings,
      "import importlib.util, importlib, torch; print(torch.__version__); print(torch.cuda.is_available()); print(importlib.import_module('lightning').__version__ if importlib.util.find_spec('lightning') else 'lightning not installed'); print(importlib.import_module('pytorch_lightning').__version__ if importlib.util.find_spec('pytorch_lightning') else 'pytorch_lightning not installed')"
    ),
    reinstallNam: buildPipCommand(settings, 'install --upgrade neural-amp-modeler'),
    uninstallTorch: buildPipCommand(settings, 'uninstall -y torch'),
    reinstallTorchCuda: buildPipCommand(
      settings,
      'install --index-url https://download.pytorch.org/whl/cu130 --no-cache-dir torch==2.10.0+cu130'
    ),
    reinstallTorchDefault: buildPipCommand(settings, 'install --upgrade torch')
  }
}

function getEnvironmentActivationCommand(settings: AppSettings | null): string | null {
  if (!settings) {
    return null
  }

  switch (settings.backendMode) {
    case 'conda-name':
      return settings.environmentName ? `conda activate ${settings.environmentName}` : null
    case 'conda-prefix':
      return settings.environmentPrefixPath ? `conda activate "${settings.environmentPrefixPath}"` : null
    case 'direct-python':
      return null
    default:
      return null
  }
}

function getAcceleratorAccent(status: AcceleratorDiagnosticsSummary['status']): string {
  switch (status) {
    case 'ready':
      return 'var(--neon-green)'
    case 'advisory':
      return 'var(--neon-cyan)'
    case 'not_checked':
      return 'var(--text-steel)'
    case 'cpu_only':
    case 'not_visible':
    case 'error':
    default:
      return 'var(--neon-magenta)'
  }
}

function getAcceleratorLabel(status: AcceleratorDiagnosticsSummary['status']): string {
  switch (status) {
    case 'ready':
      return '✓ GPU READY'
    case 'advisory':
      return '◌ CHECK LIGHTNING'
    case 'cpu_only':
      return '✗ CPU-ONLY TORCH'
    case 'not_visible':
      return '✗ CUDA NOT VISIBLE'
    case 'not_checked':
      return '… NOT CHECKED'
    case 'error':
    default:
      return '✗ PROBE FAILED'
  }
}

function getAcceleratorGuidance(
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  settings: AppSettings | null
): AcceleratorGuidance | null {
  if (!acceleratorDiagnostics) {
    return null
  }

  const commands = getDiagnosticCommands(settings)
  const environmentReference = getEnvironmentReference(settings)
  const activationCommand = getEnvironmentActivationCommand(settings)
  const setupSteps: CopyableCodeBlockProps[] = activationCommand
    ? [{ label: 'Activate Environment', command: activationCommand }]
    : []

  switch (acceleratorDiagnostics.issue) {
    case 'torch_missing':
      return {
        title: 'Do This Now',
        body: acceleratorDiagnostics.hostNvidiaSmiAvailable
          ? 'PyTorch is not installed in the selected environment. NAM-BOT can already see an NVIDIA GPU on this machine, so the direct fix is to install the CUDA-enabled torch build into that same environment.'
          : 'PyTorch is not installed in the selected environment. Install torch into that same environment, then come back here and re-run diagnostics.',
        setupSteps,
        note: acceleratorDiagnostics.hostNvidiaSmiAvailable
          ? 'After the install finishes, return to Diagnostics and click Re-check. Success looks like a torch version ending in +cu130 and CUDA Available switching to Yes.'
          : 'After the install finishes, return to Diagnostics and click Re-check.',
        steps: [
          {
            label: acceleratorDiagnostics.hostNvidiaSmiAvailable ? 'Install CUDA Torch' : 'Install Torch',
            command: acceleratorDiagnostics.hostNvidiaSmiAvailable
              ? commands.reinstallTorchCuda
              : commands.reinstallTorchDefault
          }
        ]
      }
    case 'torch_import_failed':
      return {
        title: 'Recommended Check',
        body: 'PyTorch is present, but the import itself is failing. That usually means a broken package install, a DLL/runtime problem, or conflicting packages inside the environment.',
        setupSteps,
        note: 'Start by confirming the Python interpreter NAM-BOT is using. If torch still fails to import, use the AI troubleshooting export below with the exact probe notes.',
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Verify Torch Import', command: commands.verifyTorch },
          {
            label: 'Reinstall Torch',
            command: acceleratorDiagnostics.hostNvidiaSmiAvailable ? commands.reinstallTorchCuda : commands.reinstallTorchDefault
          }
        ]
      }
    case 'nam_missing':
      return {
        title: 'Recommended Fix',
        body: 'PyTorch imports correctly, but Neural Amp Modeler itself is missing from this environment. Install NAM into the same environment NAM-BOT is configured to use.',
        setupSteps,
        note: `These commands target ${environmentReference}.`,
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Install Neural Amp Modeler', command: commands.reinstallNam },
          { label: 'Verify NAM Import', command: commands.verifyNam }
        ]
      }
    case 'nam_import_failed':
      return {
        title: 'Recommended Check',
        body: 'PyTorch imports, but NAM still fails to import. That points to a broken NAM install or a dependency conflict inside this environment.',
        setupSteps,
        note: 'If reinstalling NAM does not clear the import error, use the AI troubleshooting export below so the exact import failure is included.',
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Verify NAM Import', command: commands.verifyNam },
          { label: 'Reinstall Neural Amp Modeler', command: commands.reinstallNam }
        ]
      }
    case 'torch_cpu_only':
      if (acceleratorDiagnostics.hostNvidiaSmiAvailable) {
        return {
          title: 'Recommended Fix',
          body: 'This machine exposes an NVIDIA GPU, but the selected environment is using a CPU-only torch build. Replace torch inside this same environment and verify CUDA immediately.',
          setupSteps,
          note: `These commands target ${environmentReference}.`,
          steps: [
            { label: 'Verify Python Target', command: commands.verifyPython },
            { label: 'Remove Current Torch', command: commands.uninstallTorch },
            { label: 'Install CUDA Torch', command: commands.reinstallTorchCuda },
            { label: 'Verify Torch Runtime', command: commands.verifyTorch }
          ]
        }
      }

      return {
        title: 'CPU Training Only',
        body: 'NAM-BOT does not currently see a supported GPU path for this machine, so a CPU-only torch build is expected here. You do not need to install CUDA torch unless you know this machine should expose a supported accelerator.',
        setupSteps,
        note: 'You can keep training on CPU. If you believe the hardware detection is wrong, use the AI troubleshooting prompt or raw diagnostics below for a deeper check.',
        steps: [{ label: 'Verify Torch Runtime', command: commands.verifyTorch }]
      }
    case 'cuda_not_visible':
      return {
        title: 'Recommended Check',
        body: acceleratorDiagnostics.hostNvidiaSmiAvailable
          ? 'The host sees an NVIDIA GPU, and torch looks CUDA-capable, but the selected environment still cannot use the GPU. That usually means the wrong environment is selected or the torch install inside that environment is inconsistent.'
          : 'Torch looks CUDA-capable, but no GPU is visible from the selected environment. Start by checking the host GPU state, then verify the exact environment NAM-BOT is using.',
        setupSteps,
        note: `These checks target ${environmentReference}.`,
        steps: [
          { label: 'Check Host NVIDIA Driver', command: 'nvidia-smi' },
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Verify Torch Runtime', command: commands.verifyTorch }
        ]
      }
    case 'lightning_mismatch':
      return {
        title: 'Recommended Check',
        body: 'PyTorch sees CUDA, but Lightning does not agree. That usually means the environment has mixed torch and Lightning installs or stale packages left behind.',
        setupSteps,
        note: `These checks target ${environmentReference}. If they still disagree, use the AI troubleshooting export below so the full package picture is included.`,
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Inspect Torch And Lightning', command: commands.inspectLightning },
          { label: 'Verify Torch Runtime', command: commands.verifyTorch }
        ]
      }
    case 'probe_launch_failed':
    case 'probe_payload_missing':
    case 'probe_payload_malformed':
      return {
        title: 'Recommended Check',
        body: 'NAM-BOT could not complete its own accelerator probe. Start by confirming the Python runtime, torch, and NAM manually in the same environment, then use the AI export if the failure stays unclear.',
        setupSteps,
        note: `These checks target ${environmentReference}.`,
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Verify Torch Runtime', command: commands.verifyTorch },
          { label: 'Verify NAM Import', command: commands.verifyNam }
        ]
      }
    default:
      return null
  }
}

function formatBackendResultForPrompt(result: BackendCheckResult): string {
  const parts: string[] = [`${result.ok ? 'PASS' : 'FAIL'} (${result.code})`, compactText(result.message)]
  if (result.detail) {
    parts.push(`detail: ${compactText(result.detail)}`)
  }
  if (result.suggestion) {
    parts.push(`suggestion: ${compactText(result.suggestion)}`)
  }
  return `- ${result.title}: ${parts.join(' | ')}`
}

function buildDiagnosticsExportPayload(
  settings: AppSettings | null,
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
): DiagnosticsExportPayload {
  const commands = getDiagnosticCommands(settings)
  return {
    generatedAt: new Date().toISOString(),
    host: {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language
    },
    targetEnvironment: getEnvironmentReference(settings),
    settings: {
      backendMode: settings?.backendMode ?? null,
      condaExecutablePath: settings?.condaExecutablePath ?? null,
      environmentName: settings?.environmentName ?? null,
      environmentPrefixPath: settings?.environmentPrefixPath ?? null,
      pythonExecutablePath: settings?.pythonExecutablePath ?? null,
      preferredLaunchMode: settings?.preferredLaunchMode ?? null
    },
    validation,
    acceleratorDiagnostics,
    commands: {
      verifyPython: commands.verifyPython,
      verifyTorch: commands.verifyTorch,
      verifyNam: commands.verifyNam,
      reinstallNam: commands.reinstallNam,
      reinstallTorchCuda: commands.reinstallTorchCuda,
      reinstallTorchDefault: commands.reinstallTorchDefault
    }
  }
}

function buildAiTroubleshootingPrompt(
  settings: AppSettings | null,
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
): string {
  const commands = getDiagnosticCommands(settings)
  const backendLines = validation
    ? [
        formatBackendResultForPrompt(validation.condaReachable),
        formatBackendResultForPrompt(validation.environmentReachable),
        formatBackendResultForPrompt(validation.pythonReachable),
        formatBackendResultForPrompt(validation.namInstalled),
        formatBackendResultForPrompt(validation.namFullAvailable)
      ].join('\n')
    : '- No backend validation results available.'

  const acceleratorLines = acceleratorDiagnostics
    ? [
        `- Status: ${acceleratorDiagnostics.status}`,
        `- Issue: ${acceleratorDiagnostics.issue}`,
        `- Headline: ${compactText(acceleratorDiagnostics.headline)}`,
        `- Detail: ${compactText(acceleratorDiagnostics.detail)}`,
        `- Suggestion: ${compactText(acceleratorDiagnostics.suggestion, 'None')}`,
        `- Host NVIDIA visible: ${formatMaybeBoolean(acceleratorDiagnostics.hostNvidiaSmiAvailable)}`,
        `- Host GPU: ${formatMaybeText(acceleratorDiagnostics.hostNvidiaGpuName, 'Not detected')}`,
        `- NVIDIA driver: ${formatMaybeText(acceleratorDiagnostics.hostDriverVersion, 'Not reported')}`,
        `- Python version: ${formatMaybeText(acceleratorDiagnostics.pythonVersion, 'Not reported')}`,
        `- Python executable: ${formatMaybeText(acceleratorDiagnostics.pythonExecutable, 'Not reported')}`,
        `- Python platform: ${formatMaybeText(acceleratorDiagnostics.pythonPlatform, 'Not reported')}`,
        `- Torch import OK: ${formatMaybeBoolean(acceleratorDiagnostics.torchImportOk)}`,
        `- Torch version: ${formatMaybeText(acceleratorDiagnostics.torchVersion, 'Not reported')}`,
        `- Torch CUDA build: ${formatMaybeText(acceleratorDiagnostics.torchCudaVersion, 'CPU-only or not reported')}`,
        `- CUDA available: ${formatMaybeBoolean(acceleratorDiagnostics.cudaAvailable)}`,
        `- CUDA device count: ${acceleratorDiagnostics.cudaDeviceCount != null ? String(acceleratorDiagnostics.cudaDeviceCount) : 'Unknown'}`,
        `- Primary device: ${formatMaybeText(acceleratorDiagnostics.deviceName, 'Not reported')}`,
        `- MPS available: ${formatMaybeBoolean(acceleratorDiagnostics.mpsAvailable)}`,
        `- NAM import OK: ${formatMaybeBoolean(acceleratorDiagnostics.namImportOk)}`,
        `- NAM version: ${formatMaybeText(acceleratorDiagnostics.namVersion, 'Not reported')}`,
        `- Lightning package: ${formatMaybeText(acceleratorDiagnostics.lightningPackage, 'Not installed or not importable')}`,
        `- Lightning version: ${formatMaybeText(acceleratorDiagnostics.lightningVersion, 'Not reported')}`,
        `- Lightning CUDA available: ${formatMaybeBoolean(acceleratorDiagnostics.lightningCudaAvailable)}`,
        `- Probe notes: ${acceleratorDiagnostics.errors.length > 0 ? acceleratorDiagnostics.errors.map((entry) => compactText(entry)).join(' || ') : 'None'}`
      ].join('\n')
    : '- No accelerator diagnostics available.'

  return [
    'I am troubleshooting a NAM-BOT local training environment.',
    'The user is likely a novice, so explain the root cause plainly and give step-by-step commands.',
    'Prefer the smallest safe fix that preserves the existing environment when possible.',
    '',
    'Host context',
    `- Generated at: ${new Date().toLocaleString()}`,
    `- OS / platform: ${navigator.platform}`,
    `- User agent: ${navigator.userAgent}`,
    '',
    'NAM-BOT configuration',
    `- Target environment: ${getEnvironmentReference(settings)}`,
    `- Backend mode: ${settings?.backendMode ?? 'Not configured'}`,
    `- Conda executable: ${settings?.condaExecutablePath ?? 'Not configured'}`,
    `- Environment name: ${settings?.environmentName ?? 'Not configured'}`,
    `- Environment prefix: ${settings?.environmentPrefixPath ?? 'Not configured'}`,
    `- Direct Python path: ${settings?.pythonExecutablePath ?? 'Not configured'}`,
    `- Preferred launch mode: ${settings?.preferredLaunchMode ?? 'Not configured'}`,
    '',
    'Backend validation',
    backendLines,
    '',
    'Accelerator diagnostics',
    acceleratorLines,
    '',
    'Useful commands already prepared for this exact NAM-BOT target',
    `- Verify Python target: ${commands.verifyPython}`,
    `- Verify torch: ${commands.verifyTorch}`,
    `- Verify NAM: ${commands.verifyNam}`,
    `- Reinstall NAM: ${commands.reinstallNam}`,
    `- Reinstall torch default: ${commands.reinstallTorchDefault}`,
    `- Reinstall torch CUDA: ${commands.reinstallTorchCuda}`,
    '',
    'Please answer with:',
    '1. The most likely root cause.',
    '2. Exact commands to run next for this machine.',
    '3. How to verify the fix succeeded.',
    '4. Whether NAM training should use GPU after the fix.'
  ].join('\n')
}

function getExportPanelCopy(
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
): { title: string; body: string } {
  if (!validation?.overallOk || (acceleratorDiagnostics && acceleratorDiagnostics.status !== 'ready')) {
    return {
      title: 'Troubleshooting Export',
      body: 'If the built-in guidance does not fully solve the problem, copy the AI prompt or the raw JSON below. Both exports package the exact backend checks, GPU probe results, host GPU state, and current NAM-BOT target environment.'
    }
  }

  return {
    title: 'Diagnostics Export',
    body: 'Everything looks healthy right now, but you can still copy the AI prompt or raw JSON if you want to keep a support snapshot of this machine and environment.'
  }
}

function shouldShowTroubleshootingExport(
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null
): boolean {
  if (!validation?.overallOk) {
    return true
  }

  if (!acceleratorDiagnostics) {
    return true
  }

  return acceleratorDiagnostics.status !== 'ready'
}

export default function Diagnostics() {
  const {
    settings,
    validation,
    acceleratorDiagnostics,
    isLoading,
    isAcceleratorDiagnosticsLoading,
    loadSettings,
    validateBackend,
    loadAcceleratorDiagnostics
  } = useAppStore()

  const isChecking = isLoading || isAcceleratorDiagnosticsLoading
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [showAcceleratorExtended, setShowAcceleratorExtended] = useState(false)
  const acceleratorGuidance = getAcceleratorGuidance(acceleratorDiagnostics, settings)
  const exportPanelCopy = getExportPanelCopy(validation, acceleratorDiagnostics)
  const showTroubleshootingExport = shouldShowTroubleshootingExport(validation, acceleratorDiagnostics)
  const diagnosticsJson = JSON.stringify(buildDiagnosticsExportPayload(settings, validation, acceleratorDiagnostics), null, 2)
  const aiTroubleshootingPrompt = buildAiTroubleshootingPrompt(settings, validation, acceleratorDiagnostics)

  useEffect(() => {
    if (!settings) {
      void loadSettings()
    }
    if (!validation) {
      void validateBackend()
    }
    if (!acceleratorDiagnostics) {
      void loadAcceleratorDiagnostics()
    }
  }, [acceleratorDiagnostics, loadAcceleratorDiagnostics, loadSettings, settings, validation, validateBackend])

  const handleRecheck = async () => {
    await Promise.all([validateBackend(), loadAcceleratorDiagnostics()])
  }

  if (isChecking && !validation && !acceleratorDiagnostics) {
    return (
      <div className="layout-main">
        <div className="panel">
          <p className="processing-text" style={{ color: 'var(--text-steel)', textAlign: 'center', padding: '40px' }}>
            Running backend and accelerator diagnostics
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Backend Diagnostics</h3>
          <button className={`btn btn-sm btn-green ${isChecking ? 'processing-text' : ''}`} onClick={handleRecheck} disabled={isChecking}>
            {isChecking ? 'Checking' : 'Re-check'}
          </button>
        </div>

        {validation ? (
          <>
            <div
              style={{
                padding: '20px',
                marginBottom: '20px',
                border: `2px solid ${validation.overallOk ? 'var(--neon-green)' : 'var(--neon-magenta)'}`,
                backgroundColor: 'var(--bg-void)',
                textAlign: 'center'
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '32px',
                  color: validation.overallOk ? 'var(--neon-green)' : 'var(--neon-magenta)',
                  marginBottom: '8px'
                }}
              >
                {validation.overallOk ? '✓ BACKEND READY' : '✗ BACKEND NOT READY'}
              </h2>
              <p style={{ color: 'var(--text-steel)' }}>Last checked: {new Date(validation.checkedAt).toLocaleString()}</p>
            </div>

            <CheckResult result={validation.condaReachable} />
            <CheckResult result={validation.environmentReachable} />
            <CheckResult result={validation.pythonReachable} />
            <CheckResult result={validation.namInstalled} />
            <CheckResult result={validation.namFullAvailable} />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>No validation results yet.</p>
            <button className={`btn btn-primary ${isChecking ? 'processing-text' : ''}`} onClick={handleRecheck} disabled={isChecking}>
              {isChecking ? 'Validating' : 'Run Validation'}
            </button>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Accelerator Diagnostics</h3>
          <button 
            className="btn btn-sm btn-secondary" 
            onClick={() => setShowAcceleratorExtended(!showAcceleratorExtended)}
            style={{ minWidth: '100px' }}
          >
            {showAcceleratorExtended ? 'Hide Details' : 'Show Details'}
          </button>
        </div>

        {acceleratorDiagnostics ? (
          <>
            <div
              style={{
                padding: '20px',
                marginBottom: '20px',
                border: `2px solid ${getAcceleratorAccent(acceleratorDiagnostics.status)}`,
                backgroundColor: 'var(--bg-void)'
              }}
            >
              <p
                style={{
                  color: getAcceleratorAccent(acceleratorDiagnostics.status),
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '28px',
                  marginBottom: '10px'
                }}
              >
                {getAcceleratorLabel(acceleratorDiagnostics.status)}
              </p>
              <p style={{ color: 'var(--text-ash)', fontSize: '18px', marginBottom: '8px' }}>{acceleratorDiagnostics.headline}</p>
              <p
                style={{
                  color: 'var(--text-steel)',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  marginBottom: acceleratorDiagnostics.suggestion ? '10px' : '8px'
                }}
              >
                {acceleratorDiagnostics.detail}
              </p>
              {acceleratorDiagnostics.suggestion && (
                <p style={{ color: 'var(--neon-cyan)', fontSize: '13px', lineHeight: '1.5' }}>→ {acceleratorDiagnostics.suggestion}</p>
              )}
              <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '10px' }}>
                Last checked: {new Date(acceleratorDiagnostics.checkedAt).toLocaleString()}
              </p>
            </div>
            
            {showAcceleratorExtended && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    border: '1px solid var(--border-dim)',
                    marginBottom: acceleratorDiagnostics.errors.length > 0 || acceleratorGuidance ? '16px' : '0'
                  }}
                >
                  <DiagnosticFact label="Probe issue" value={formatMaybeText(acceleratorDiagnostics.issue, 'Unknown')} />
                  <DiagnosticFact label="Target environment" value={getEnvironmentReference(settings)} />
                  <DiagnosticFact label="Python version" value={formatMaybeText(acceleratorDiagnostics.pythonVersion, 'Not reported')} />
                  <DiagnosticFact label="Python executable" value={formatMaybeText(acceleratorDiagnostics.pythonExecutable, 'Not reported')} />
                  <DiagnosticFact label="Python platform" value={formatMaybeText(acceleratorDiagnostics.pythonPlatform, 'Not reported')} />
                  <DiagnosticFact label="Host NVIDIA" value={formatMaybeBoolean(acceleratorDiagnostics.hostNvidiaSmiAvailable)} />
                  <DiagnosticFact label="Host GPU" value={formatMaybeText(acceleratorDiagnostics.hostNvidiaGpuName, 'Not detected')} />
                  <DiagnosticFact label="NVIDIA driver" value={formatMaybeText(acceleratorDiagnostics.hostDriverVersion, 'Not reported')} />
                  <DiagnosticFact label="Torch import" value={formatMaybeBoolean(acceleratorDiagnostics.torchImportOk)} />
                  <DiagnosticFact label="Torch version" value={formatMaybeText(acceleratorDiagnostics.torchVersion, 'Not reported')} />
                  <DiagnosticFact label="Torch CUDA build" value={formatMaybeText(acceleratorDiagnostics.torchCudaVersion, 'CPU-only or not reported')} />
                  <DiagnosticFact label="CUDA available" value={formatMaybeBoolean(acceleratorDiagnostics.cudaAvailable)} />
                  <DiagnosticFact
                    label="CUDA device count"
                    value={acceleratorDiagnostics.cudaDeviceCount != null ? String(acceleratorDiagnostics.cudaDeviceCount) : 'Unknown'}
                  />
                  <DiagnosticFact label="Primary device" value={formatMaybeText(acceleratorDiagnostics.deviceName, 'No CUDA device detected')} />
                  <DiagnosticFact label="NAM import" value={formatMaybeBoolean(acceleratorDiagnostics.namImportOk)} />
                  <DiagnosticFact label="NAM version" value={formatMaybeText(acceleratorDiagnostics.namVersion, 'Not reported')} />
                  <DiagnosticFact label="Lightning package" value={formatMaybeText(acceleratorDiagnostics.lightningPackage, 'Not installed or not importable')} />
                  <DiagnosticFact label="Lightning version" value={formatMaybeText(acceleratorDiagnostics.lightningVersion, 'Not reported')} />
                  <DiagnosticFact label="Lightning CUDA check" value={formatMaybeBoolean(acceleratorDiagnostics.lightningCudaAvailable)} />
                  <DiagnosticFact label="MPS available" value={formatMaybeBoolean(acceleratorDiagnostics.mpsAvailable)} />
                </div>

                {acceleratorGuidance && (
                  <div
                    style={{
                      border: '1px solid var(--border-dim)',
                      backgroundColor: 'rgba(9, 9, 11, 0.45)',
                      padding: '14px',
                      marginBottom: '16px'
                    }}
                  >
                    <p
                      style={{
                        color: 'var(--text-ash)',
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '18px',
                        marginBottom: '8px'
                      }}
                    >
                      {acceleratorGuidance.title}
                    </p>
                    <p
                      style={{
                        color: 'var(--text-steel)',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        marginBottom: '12px'
                      }}
                    >
                      {acceleratorGuidance.body}
                    </p>
                    {acceleratorGuidance.setupSteps?.map((step) => (
                      <CopyableCodeBlock key={step.label} label={step.label} command={step.command} />
                    ))}
                    {acceleratorGuidance.steps.map((step) => (
                      <CopyableCodeBlock key={step.label} label={step.label} command={step.command} />
                    ))}
                    {acceleratorGuidance.note && (
                      <p style={{ color: 'var(--neon-cyan)', fontSize: '13px', lineHeight: '1.5' }}>→ {acceleratorGuidance.note}</p>
                    )}
                  </div>
                )}

                {showTroubleshootingExport && (
                  <div
                    style={{
                      border: '1px solid var(--border-dim)',
                      backgroundColor: 'rgba(9, 9, 11, 0.45)',
                      padding: '14px',
                      marginBottom: acceleratorDiagnostics.errors.length > 0 ? '16px' : '0'
                    }}
                  >
                    <p
                      style={{
                        color: 'var(--text-ash)',
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '18px',
                        marginBottom: '8px'
                      }}
                    >
                      {exportPanelCopy.title}
                    </p>
                    <p
                      style={{
                        color: 'var(--text-steel)',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        marginBottom: '12px'
                      }}
                    >
                      {exportPanelCopy.body}
                    </p>
                    <div style={{ display: 'grid', gap: '12px', marginBottom: showAiPrompt || showRawJson ? '12px' : '10px' }}>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={() => copyText(aiTroubleshootingPrompt)}>
                          Copy AI Troubleshooting Prompt
                        </button>
                        <button
                          className={`btn ${showAiPrompt ? 'btn-blue is-toggled' : 'btn-secondary'}`}
                          onClick={() => setShowAiPrompt((value) => !value)}
                        >
                          {showAiPrompt ? 'Hide AI Prompt' : 'Show AI Prompt'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-secondary" onClick={() => copyText(diagnosticsJson)}>
                          Copy Raw Diagnostics JSON
                        </button>
                        <button
                          className={`btn ${showRawJson ? 'btn-blue is-toggled' : 'btn-secondary'}`}
                          onClick={() => setShowRawJson((value) => !value)}
                        >
                          {showRawJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
                        </button>
                      </div>
                    </div>
                    {showAiPrompt && <CopyableCodeBlock label="AI Troubleshooting Prompt" command={aiTroubleshootingPrompt} />}
                    {showRawJson && <CopyableCodeBlock label="Raw Diagnostics JSON" command={diagnosticsJson} />}
                    <p style={{ color: 'var(--neon-cyan)', fontSize: '13px', lineHeight: '1.5' }}>
                      → The AI prompt asks for root cause, exact commands, verification steps, and whether NAM should use GPU after the fix.
                    </p>
                  </div>
                )}

                {acceleratorDiagnostics.errors.length > 0 && (
                  <div
                    style={{
                      border: '1px solid var(--border-dim)',
                      backgroundColor: 'rgba(9, 9, 11, 0.45)',
                      padding: '14px'
                    }}
                  >
                    <p
                      style={{
                        color: 'var(--text-ash)',
                        fontFamily: 'var(--font-arcade)',
                        fontSize: '18px',
                        marginBottom: '10px'
                      }}
                    >
                      Probe Notes
                    </p>
                    {acceleratorDiagnostics.errors.map((entry) => (
                      <p
                        key={entry}
                        style={{
                          color: 'var(--text-steel)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          marginBottom: '8px'
                        }}
                      >
                        {entry}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--text-steel)' }}>No accelerator diagnostics yet.</p>
          </div>
        )}
      </div>

      {!validation?.overallOk && (
        <div className="panel">
          <div className="panel-header">
            <h3>Next Steps</h3>
          </div>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', lineHeight: '1.8' }}>
            <li>Go to Settings and configure your Conda executable path</li>
            <li>Use <strong>conda</strong> on PATH or set a full Conda path in Settings</li>
            <li>Set your Conda environment name or prefix. The default environment name is <strong>nam</strong></li>
            <li>Click "Re-check" to verify everything is working</li>
          </ol>
        </div>
      )}
    </div>
  )
}
