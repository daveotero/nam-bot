import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AcceleratorDiagnosticsSummary,
  AppSettings,
  BackendCheckResult,
  BackendValidationSummary,
  NamVersionInfo,
  TrainingLaunchCheckResult,
  TrainingLaunchDiagnosticsSummary,
  shouldAutoLoadResource,
  useAppStore
} from '../../state/store'
import { MIN_A2_NAM_VERSION } from '../../state/types'

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
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null
  commands: {
    verifyPython: string
    verifyTorch: string
    verifyNam: string
    inspectLightningSecurity: string
    reinstallNam: string
    uninstallLightning: string
    installSafeLightning: string
    reinstallTorchCuda: string
    reinstallTorchDefault: string
    verifyRocm: string
  }
}

interface DiagnosticCommandSet {
  verifyPython: string
  verifyTorch: string
  verifyNam: string
  inspectLightning: string
  inspectLightningSecurity: string
  reinstallNam: string
  uninstallLightning: string
  installSafeLightning: string
  uninstallTorch: string
  reinstallTorchCuda: string
  reinstallTorchDefault: string
  verifyRocm: string
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
    inspectLightningSecurity: buildPipCommand(settings, 'show lightning pytorch-lightning'),
    reinstallNam: buildPipCommand(settings, 'install --upgrade "neural-amp-modeler>=0.13.0"'),
    uninstallLightning: buildPipCommand(settings, 'uninstall -y lightning pytorch-lightning pytorch_lightning'),
    installSafeLightning: buildPipCommand(settings, 'install "pytorch-lightning<=2.6.1"'),
    uninstallTorch: buildPipCommand(settings, 'uninstall -y torch'),
    reinstallTorchCuda: buildPipCommand(
      settings,
      'install --index-url https://download.pytorch.org/whl/cu130 --no-cache-dir torch==2.10.0+cu130'
    ),
    reinstallTorchDefault: buildPipCommand(settings, 'install --upgrade torch'),
    verifyRocm: buildPythonInlineCommand(
      settings,
      "import torch; print('CUDA Available:', torch.cuda.is_available()); print('HIP Version:', torch.version.hip if torch.version.hip else 'Not ROCm build')"
    )
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

function getAcceleratorLabelForIssue(issue: AcceleratorDiagnosticsSummary['issue']): string {
  if (issue === 'lightning_vulnerable') {
    return '✗ SECURITY BLOCKED'
  }
  if (issue === 'lightning_security_check_failed') {
    return '✗ SECURITY CHECK FAILED'
  }
  if (issue === 'rocm_ready') {
    return '✓ ROCM GPU READY'
  }
  if (issue === 'cuda_ready' || issue === 'mps_ready') {
    return '✓ GPU READY'
  }
  return getAcceleratorLabel('error')
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
    case 'lightning_security_check_failed':
      return {
        title: 'Security Check Required',
        body: 'NAM-BOT could not verify Lightning package versions without importing Python packages, so it skipped NAM and Lightning imports for safety.',
        setupSteps,
        note: `These commands target ${environmentReference}. Do not import Lightning manually until package metadata confirms it is not 2.6.2 or 2.6.3.`,
        steps: [
          { label: 'Verify Python Target', command: commands.verifyPython },
          { label: 'Inspect Lightning Metadata', command: commands.inspectLightningSecurity }
        ]
      }
    case 'lightning_vulnerable':
      return {
        title: 'Security Fix Required',
        body: 'This environment contains Lightning 2.6.2 or 2.6.3, which are known compromised PyPI releases. NAM-BOT blocked NAM commands before importing Lightning.',
        setupSteps,
        note: 'If this environment already imported Lightning while affected, treat it as potentially compromised and rotate credentials used on this machine.',
        steps: [
          { label: 'Inspect Lightning Metadata', command: commands.inspectLightningSecurity },
          { label: 'Remove Affected Lightning', command: commands.uninstallLightning },
          { label: 'Install Safe Lightning', command: commands.installSafeLightning },
          { label: 'Upgrade Neural Amp Modeler', command: commands.reinstallNam },
          { label: 'Verify NAM Import', command: commands.verifyNam }
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
    case 'rocm_ready':
      return {
        title: 'AMD ROCm GPU Detected',
        body: 'PyTorch has detected your AMD GPU via ROCm. NAM-BOT can use this AMD GPU for training acceleration. Your environment is correctly configured for ROCm-based training.',
        setupSteps,
        note: 'You are ready to train with AMD GPU acceleration. If a training run still falls back to CPU, check the job logs to see whether Lightning changes the accelerator decision at runtime.',
        steps: [
          { label: 'Verify ROCm PyTorch', command: buildPythonInlineCommand(settings, "import torch; print('CUDA Available:', torch.cuda.is_available()); print('HIP Version:', torch.version.hip)") }
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

function formatTrainingLaunchResultForPrompt(result: TrainingLaunchCheckResult): string {
  const parts: string[] = [`${result.status.toUpperCase()} (${result.code})`, compactText(result.message)]
  if (result.detail) {
    parts.push(`detail: ${compactText(result.detail)}`)
  }
  if (result.suggestion) {
    parts.push(`suggestion: ${compactText(result.suggestion)}`)
  }
  if (result.command) {
    parts.push(`command: ${result.command}`)
  }
  if (result.outputTail) {
    parts.push(`output tail: ${compactText(result.outputTail)}`)
  }
  return `- ${result.title}: ${parts.join(' | ')}`
}

function buildDiagnosticsExportPayload(
  settings: AppSettings | null,
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null
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
    trainingLaunchDiagnostics,
    commands: {
      verifyPython: commands.verifyPython,
      verifyTorch: commands.verifyTorch,
      verifyNam: commands.verifyNam,
      inspectLightningSecurity: commands.inspectLightningSecurity,
      reinstallNam: commands.reinstallNam,
      uninstallLightning: commands.uninstallLightning,
      installSafeLightning: commands.installSafeLightning,
      reinstallTorchCuda: commands.reinstallTorchCuda,
      reinstallTorchDefault: commands.reinstallTorchDefault,
      verifyRocm: commands.verifyRocm
    }
  }
}

function buildAiTroubleshootingPrompt(
  settings: AppSettings | null,
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null
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
        `- ROCm HIP version: ${formatMaybeText(acceleratorDiagnostics.hipVersion, 'Not reported')}`,
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

  const trainingLaunchLines = trainingLaunchDiagnostics
    ? [
        `- Status: ${trainingLaunchDiagnostics.status}`,
        `- Issue: ${trainingLaunchDiagnostics.issue}`,
        `- Headline: ${compactText(trainingLaunchDiagnostics.headline)}`,
        `- Detail: ${compactText(trainingLaunchDiagnostics.detail)}`,
        `- Suggestion: ${compactText(trainingLaunchDiagnostics.suggestion, 'None')}`,
        `- Workspace root: ${formatMaybeText(trainingLaunchDiagnostics.workspaceRoot, 'Not reported')}`,
        `- App executable: ${formatMaybeText(trainingLaunchDiagnostics.appExecutablePath, 'Not reported')}`,
        `- Process arch: ${trainingLaunchDiagnostics.processArch}`,
        `- node-pty helper path: ${formatMaybeText(trainingLaunchDiagnostics.nodePtyHelperPath, 'Not reported')}`,
        `- node-pty helper exists: ${formatMaybeBoolean(trainingLaunchDiagnostics.nodePtyHelperExists)}`,
        `- node-pty helper executable: ${formatMaybeBoolean(trainingLaunchDiagnostics.nodePtyHelperExecutable)}`,
        `- node-pty helper mode: ${formatMaybeText(trainingLaunchDiagnostics.nodePtyHelperMode, 'Not reported')}`,
        `- node-pty helper error: ${formatMaybeText(trainingLaunchDiagnostics.nodePtyHelperError, 'None')}`,
        ...trainingLaunchDiagnostics.checks.map(formatTrainingLaunchResultForPrompt),
        `- Launch errors: ${trainingLaunchDiagnostics.errors.length > 0 ? trainingLaunchDiagnostics.errors.map((entry) => compactText(entry)).join(' || ') : 'None'}`
      ].join('\n')
    : '- No training launch diagnostics available.'

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
    'Training launch diagnostics',
    trainingLaunchLines,
    '',
    'Useful commands already prepared for this exact NAM-BOT target',
    `- Verify Python target: ${commands.verifyPython}`,
    `- Verify torch: ${commands.verifyTorch}`,
    `- Verify NAM: ${commands.verifyNam}`,
    `- Inspect Lightning package metadata: ${commands.inspectLightningSecurity}`,
    `- Verify ROCm: ${commands.verifyRocm}`,
    `- Reinstall NAM: ${commands.reinstallNam}`,
    `- Remove Lightning: ${commands.uninstallLightning}`,
    `- Install safe Lightning: ${commands.installSafeLightning}`,
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

function getUpgradeCommands(settings: AppSettings | null): CopyableCodeBlockProps[] {
  const activationCommand = getEnvironmentActivationCommand(settings)
  const commands: CopyableCodeBlockProps[] = []

  if (activationCommand) {
    commands.push({
      label: 'Activate Environment',
      command: activationCommand
    })
  }

  commands.push({
    label: 'Upgrade NAM',
    command: buildPipCommand(settings, 'install --upgrade "neural-amp-modeler>=0.13.0"')
  })

  commands.push({
    label: 'Verify Upgrade',
    command: buildPythonInlineCommand(settings, "import nam; print(getattr(nam, '__version__', None))")
  })

  return commands
}

function getVersionStatusBadge(namVersionInfo: NamVersionInfo | null): {
  label: string
  color: string
  icon: string
} {
  if (!namVersionInfo) {
    return {
      label: 'Checking...',
      color: 'var(--text-steel)',
      icon: '…'
    }
  }

  if (namVersionInfo.checkStatus !== 'ok') {
    return {
      label: 'Unable to check',
      color: 'var(--text-steel)',
      icon: '?'
    }
  }

  if (namVersionInfo.isUpToDate === true) {
    return {
      label: 'Up to date',
      color: 'var(--neon-green)',
      icon: '✓'
    }
  }

  if (namVersionInfo.isUpToDate === false) {
    return {
      label: 'Update available',
      color: 'var(--neon-cyan)',
      icon: '↑'
    }
  }

  return {
    label: 'Unknown',
    color: 'var(--text-steel)',
    icon: '?'
  }
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

type MatrixStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface SummaryTile {
  title: string
  status: MatrixStatus
  label: string
  detail: string
  checkedAt: string | null
}

interface MatrixRow {
  status: MatrixStatus
  title: string
  message: string
  detail?: string
  suggestion?: string
  command?: string
  outputTail?: string
}

interface MatrixGroup {
  title: string
  rows: MatrixRow[]
}

interface ActionItem {
  title: string
  headline: string
  body: string
  steps: string[]
  commands: CopyableCodeBlockProps[]
  verify: string
  tone: MatrixStatus
  showSettingsAction?: boolean
}

function getStatusColor(status: MatrixStatus): string {
  switch (status) {
    case 'pass':
      return 'var(--neon-green)'
    case 'warn':
      return 'var(--neon-cyan)'
    case 'fail':
      return 'var(--neon-magenta)'
    case 'skip':
    default:
      return 'var(--text-steel)'
  }
}

function getStatusLabel(status: MatrixStatus): string {
  switch (status) {
    case 'pass':
      return 'PASS'
    case 'warn':
      return 'CHECK'
    case 'fail':
      return 'FAIL'
    case 'skip':
    default:
      return 'SKIP'
  }
}

function SummaryTileCard({ tile }: { tile: SummaryTile }) {
  const color = getStatusColor(tile.status)
  return (
    <div
      style={{
        border: `2px solid ${color}`,
        backgroundColor: 'rgba(9, 9, 11, 0.55)',
        padding: '12px',
        minHeight: '118px',
        display: 'grid',
        alignContent: 'space-between',
        gap: '8px'
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline', marginBottom: '8px' }}>
          <p style={{ color: 'var(--text-steel)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tile.title}</p>
          <span style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '16px' }}>{getStatusLabel(tile.status)}</span>
        </div>
        <p style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '22px', lineHeight: 1.05, marginBottom: '6px' }}>{tile.label}</p>
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', lineHeight: 1.35 }}>{tile.detail}</p>
      </div>
      <p style={{ color: 'var(--text-steel)', fontSize: '10px' }}>{tile.checkedAt ? `Checked ${new Date(tile.checkedAt).toLocaleTimeString()}` : 'Not checked yet'}</p>
    </div>
  )
}

function DiagnosticMatrixRow({ row }: { row: MatrixRow }) {
  const color = getStatusColor(row.status)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '70px minmax(150px, 220px) minmax(0, 1fr)',
        gap: '12px',
        padding: '9px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: row.status === 'fail' ? 'rgba(255, 0, 60, 0.06)' : 'rgba(9, 9, 11, 0.25)'
      }}
    >
      <span style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '16px' }}>{getStatusLabel(row.status)}</span>
      <span style={{ color: 'var(--text-ash)', fontFamily: 'var(--font-arcade)', fontSize: '16px' }}>{row.title}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.35 }}>{row.message}</p>
        {row.detail && <p style={{ color: 'var(--text-steel)', fontSize: '11px', lineHeight: 1.35, marginTop: '4px', wordBreak: 'break-word' }}>{row.detail}</p>}
        {row.suggestion && <p style={{ color: 'var(--neon-cyan)', fontSize: '12px', lineHeight: 1.35, marginTop: '4px' }}>→ {row.suggestion}</p>}
        {row.outputTail && <p style={{ color: 'var(--neon-gold)', fontSize: '11px', lineHeight: 1.35, marginTop: '4px', wordBreak: 'break-word' }}>{row.outputTail}</p>}
      </div>
    </div>
  )
}

function DiagnosticMatrix({ groups }: { groups: MatrixGroup[] }) {
  return (
    <div className="panel" style={{ marginBottom: '16px' }}>
      <div className="panel-header" style={{ marginBottom: '10px' }}>
        <h3>Check Matrix</h3>
      </div>
      <div style={{ display: 'grid', gap: '12px' }}>
        {groups.map((group) => (
          <div key={group.title} style={{ border: '1px solid var(--border-dim)' }}>
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-dim)', backgroundColor: 'rgba(9, 9, 11, 0.55)' }}>
              <p style={{ color: 'var(--neon-cyan)', fontFamily: 'var(--font-arcade)', fontSize: '18px', letterSpacing: '0.05em' }}>{group.title}</p>
            </div>
            {group.rows.map((row) => <DiagnosticMatrixRow key={`${group.title}-${row.title}-${row.message}`} row={row} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

function getBackendRows(validation: BackendValidationSummary | null): MatrixRow[] {
  if (!validation) {
    return [{ status: 'skip', title: 'Backend checks', message: 'Waiting for backend validation results.' }]
  }

  return [
    validation.condaReachable,
    validation.environmentReachable,
    validation.pythonReachable,
    validation.namInstalled,
    validation.namFullAvailable
  ].map((result) => ({
    status: result.ok ? 'pass' : result.message === 'Not checked' || result.code === 'unknown' ? 'skip' : 'fail',
    title: result.title,
    message: result.message,
    detail: result.detail,
    suggestion: result.suggestion
  }))
}

function getTrainingLaunchRows(trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null): MatrixRow[] {
  if (!trainingLaunchDiagnostics) {
    return [{ status: 'skip', title: 'Training launch', message: 'Waiting for training launch diagnostics.' }]
  }

  return trainingLaunchDiagnostics.checks.map((check) => ({
    status: check.status,
    title: check.title,
    message: check.message,
    detail: check.detail,
    suggestion: check.suggestion,
    command: check.command,
    outputTail: check.outputTail
  }))
}

function getAcceleratorRows(acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null): MatrixRow[] {
  if (!acceleratorDiagnostics) {
    return [{ status: 'skip', title: 'Accelerator probe', message: 'Waiting for accelerator diagnostics.' }]
  }

  const summaryStatus: MatrixStatus = acceleratorDiagnostics.status === 'ready' || (acceleratorDiagnostics.status === 'cpu_only' && !acceleratorDiagnostics.hostNvidiaSmiAvailable)
    ? 'pass'
    : acceleratorDiagnostics.status === 'advisory' || acceleratorDiagnostics.status === 'cpu_only'
    ? 'warn'
    : acceleratorDiagnostics.status === 'not_checked'
    ? 'skip'
    : 'fail'

  const rows: MatrixRow[] = [
    {
      status: summaryStatus,
      title: getAcceleratorLabel(acceleratorDiagnostics.status),
      message: acceleratorDiagnostics.headline,
      detail: acceleratorDiagnostics.detail,
      suggestion: acceleratorDiagnostics.suggestion
    }
  ]

  if (acceleratorDiagnostics.torchImportOk != null) {
    rows.push({
      status: acceleratorDiagnostics.torchImportOk ? 'pass' : 'fail',
      title: 'Torch import',
      message: acceleratorDiagnostics.torchImportOk ? `Torch ${formatMaybeText(acceleratorDiagnostics.torchVersion, 'version not reported')}` : 'Torch could not import.',
      detail: `CUDA build: ${formatMaybeText(acceleratorDiagnostics.torchCudaVersion, 'CPU-only or not reported')}; ROCm HIP: ${formatMaybeText(acceleratorDiagnostics.hipVersion, 'not reported')}`
    })
  }

  if (acceleratorDiagnostics.cudaAvailable != null || acceleratorDiagnostics.mpsAvailable != null) {
    rows.push({
      status: acceleratorDiagnostics.cudaAvailable || acceleratorDiagnostics.mpsAvailable ? 'pass' : acceleratorDiagnostics.hostNvidiaSmiAvailable ? 'fail' : 'pass',
      title: 'Hardware visibility',
      message: acceleratorDiagnostics.cudaAvailable
        ? `CUDA/ROCm visible: ${formatMaybeText(acceleratorDiagnostics.deviceName, 'device name not reported')}`
        : acceleratorDiagnostics.mpsAvailable
        ? 'Apple MPS is visible.'
        : acceleratorDiagnostics.hostNvidiaSmiAvailable
        ? 'Host NVIDIA GPU exists, but PyTorch cannot see CUDA.'
        : 'No supported GPU visible; CPU training can still work.',
      detail: `Device count: ${acceleratorDiagnostics.cudaDeviceCount != null ? String(acceleratorDiagnostics.cudaDeviceCount) : 'unknown'}`
    })
  }

  if (acceleratorDiagnostics.lightningImportOk != null) {
    rows.push({
      status: acceleratorDiagnostics.lightningImportOk ? (acceleratorDiagnostics.lightningCudaAvailable === false && acceleratorDiagnostics.cudaAvailable ? 'warn' : 'pass') : 'warn',
      title: 'Lightning',
      message: acceleratorDiagnostics.lightningImportOk
        ? `${formatMaybeText(acceleratorDiagnostics.lightningPackage, 'Lightning')} ${formatMaybeText(acceleratorDiagnostics.lightningVersion, 'version not reported')}`
        : 'Lightning was not importable or not reported.',
      detail: `Lightning CUDA available: ${formatMaybeBoolean(acceleratorDiagnostics.lightningCudaAvailable)}`
    })
  }

  return rows
}

function getVersionRows(namVersionInfo: NamVersionInfo | null): MatrixRow[] {
  if (!namVersionInfo) {
    return [{ status: 'skip', title: 'NAM version', message: 'Waiting for version check.' }]
  }

  if (namVersionInfo.checkStatus !== 'ok') {
    return [{ status: 'warn', title: 'NAM version', message: namVersionInfo.errorMessage ?? 'Version check could not complete.' }]
  }

  return [{
    status: namVersionInfo.isUpToDate === false ? 'warn' : 'pass',
    title: 'NAM version',
    message: namVersionInfo.isUpToDate === false
      ? `A newer NAM version is available. A2 training requires neural-amp-modeler ${MIN_A2_NAM_VERSION} or newer.`
      : `Installed NAM is up to date and meets the A2 training requirement of ${MIN_A2_NAM_VERSION} or newer.`,
    detail: `Installed: ${namVersionInfo.installedVersion ?? 'not detected'}; Latest: ${namVersionInfo.latestVersion ?? 'not reported'}`
  }]
}

function getSummaryTiles(
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null,
  namVersionInfo: NamVersionInfo | null
): SummaryTile[] {
  const acceleratorStatus: MatrixStatus = !acceleratorDiagnostics
    ? 'skip'
    : acceleratorDiagnostics.status === 'ready' || (acceleratorDiagnostics.status === 'cpu_only' && !acceleratorDiagnostics.hostNvidiaSmiAvailable)
    ? 'pass'
    : acceleratorDiagnostics.status === 'advisory' || acceleratorDiagnostics.status === 'cpu_only'
    ? 'warn'
    : acceleratorDiagnostics.status === 'not_checked'
    ? 'skip'
    : 'fail'

  return [
    {
      title: 'Backend',
      status: validation ? (validation.overallOk ? 'pass' : 'fail') : 'skip',
      label: validation ? (validation.overallOk ? 'Ready' : 'Needs Fix') : 'Checking',
      detail: validation ? (validation.overallOk ? 'Conda, Python, NAM, and nam-full are reachable.' : 'One or more backend checks failed.') : 'Waiting for backend validation.',
      checkedAt: validation?.checkedAt ?? null
    },
    {
      title: 'Accelerator',
      status: acceleratorStatus,
      label: acceleratorDiagnostics ? getAcceleratorLabelForIssue(acceleratorDiagnostics.issue).replace(/^✓ |^⚠ |^✗ /, '') : 'Checking',
      detail: acceleratorDiagnostics?.headline ?? 'Waiting for accelerator diagnostics.',
      checkedAt: acceleratorDiagnostics?.checkedAt ?? null
    },
    {
      title: 'Training Launch',
      status: trainingLaunchDiagnostics
        ? trainingLaunchDiagnostics.status === 'ready'
          ? 'pass'
          : trainingLaunchDiagnostics.status === 'advisory'
          ? 'warn'
          : trainingLaunchDiagnostics.status === 'not_checked'
          ? 'skip'
          : 'fail'
        : 'skip',
      label: trainingLaunchDiagnostics ? (trainingLaunchDiagnostics.status === 'ready' ? 'Ready' : trainingLaunchDiagnostics.status === 'advisory' ? 'Check Setup' : 'Blocked') : 'Checking',
      detail: trainingLaunchDiagnostics?.headline ?? 'Waiting for launch readiness diagnostics.',
      checkedAt: trainingLaunchDiagnostics?.checkedAt ?? null
    },
    {
      title: 'NAM Version',
      status: !namVersionInfo ? 'skip' : namVersionInfo.checkStatus !== 'ok' || namVersionInfo.isUpToDate === false ? 'warn' : 'pass',
      label: getVersionStatusBadge(namVersionInfo).label,
      detail: namVersionInfo?.checkStatus === 'ok'
        ? `Installed ${namVersionInfo.installedVersion ?? 'unknown'}; latest ${namVersionInfo.latestVersion ?? 'unknown'}. A2 training requires ${MIN_A2_NAM_VERSION}+.`
        : namVersionInfo?.errorMessage ?? 'Waiting for version check.',
      checkedAt: null
    }
  ]
}

function findFirstBackendFailure(validation: BackendValidationSummary | null): BackendCheckResult | null {
  if (!validation || validation.overallOk) {
    return null
  }

  return [
    validation.condaReachable,
    validation.environmentReachable,
    validation.pythonReachable,
    validation.namInstalled,
    validation.namFullAvailable
  ].find((result) => !result.ok && result.code !== 'unknown') ?? null
}

function buildBackendAction(settings: AppSettings | null, failure: BackendCheckResult): ActionItem {
  const commands = getDiagnosticCommands(settings)
  const condaLookupCommand = window.namBot.platform === 'win32' ? 'where conda' : 'which conda'

  if (failure.code.includes('conda')) {
    return {
      title: 'Fix This First',
      headline: 'Conda is not reachable',
      body: 'NAM-BOT cannot train until it can launch Conda from the desktop app.',
      steps: ['Open a terminal.', `Run ${condaLookupCommand}.`, 'Copy the full Conda executable path into Settings.', 'Return here and click Re-check All.'],
      commands: [{ label: 'Find Conda', command: condaLookupCommand }],
      verify: 'The Backend tile should change to Ready.',
      tone: 'fail'
    }
  }

  if (failure.code.includes('env')) {
    return {
      title: 'Fix This First',
      headline: 'The selected Conda environment is not ready',
      body: 'NAM-BOT needs the exact Conda environment name or prefix where NAM is installed.',
      steps: ['Open Settings.', 'Confirm the Conda environment name or prefix.', 'Use the exact name shown by Conda, then re-check Diagnostics.'],
      commands: [{ label: 'List Conda Environments', command: 'conda env list' }],
      verify: 'The Environment and Python rows should pass.',
      tone: 'fail'
    }
  }

  return {
    title: 'Fix This First',
    headline: failure.title,
    body: failure.message,
    steps: ['Repair the selected environment.', 'Keep NAM, torch, and Lightning in the same environment.', 'Re-run Diagnostics after the command completes.'],
    commands: failure.code.includes('nam') ? [{ label: 'Install or Repair NAM', command: commands.reinstallNam }] : [],
    verify: failure.suggestion ?? 'The failed backend row should pass after repair.',
    tone: 'fail'
  }
}

function buildTrainingLaunchAction(settings: AppSettings | null, diagnostics: TrainingLaunchDiagnosticsSummary): ActionItem | null {
  if (diagnostics.status === 'ready') {
    return null
  }

  const condaLookupCommand = window.namBot.platform === 'win32' ? 'where conda' : 'which conda'
  const failedCheck = diagnostics.checks.find((check) => check.status === 'fail')
  const warningCheck = diagnostics.checks.find((check) => check.status === 'warn')
  const primaryCheck = failedCheck ?? warningCheck

  if (diagnostics.issue === 'workspace_unwritable') {
    return {
      title: 'Fix This First',
      headline: 'Training workspace is not writable',
      body: 'NAM-BOT must create a temporary workspace before it launches training.',
      steps: ['Open Settings.', 'Set Default Workspace Root to a local folder you can write to.', 'Avoid iCloud, OneDrive, Dropbox, network drives, and external drives while troubleshooting.', 'Re-check Diagnostics.'],
      commands: [],
      verify: 'The Workspace write row should pass.',
      tone: 'fail'
    }
  }

  if (diagnostics.issue === 'pty_launch_failed') {
    return {
      title: 'Fix This First',
      headline: 'Training process could not start',
      body: 'NAM-BOT can see the environment, but the operating system would not launch the terminal process used by real training.',
      steps: ['Use a full Conda executable path instead of relying on PATH.', 'On macOS, move NAM-BOT to /Applications and open it from there.', 'Make sure the app build matches your CPU architecture.', 'Re-check Diagnostics.'],
      commands: settings && settings.condaExecutablePath && isBareCondaSetting(settings) ? [{ label: 'Find Conda', command: condaLookupCommand }] : [],
      verify: 'The PTY Python launch row should pass.',
      tone: 'fail'
    }
  }

  if (diagnostics.issue === 'mac_app_on_dmg' || diagnostics.issue === 'mac_app_translocated') {
    return {
      title: 'Recommended Setup Fix',
      headline: 'macOS app location may be fragile',
      body: primaryCheck?.message ?? diagnostics.detail,
      steps: ['Drag NAM-BOT into /Applications.', 'Right-click NAM-BOT and choose Open.', 'Run Diagnostics again from the installed app.'],
      commands: [],
      verify: 'The App location row should pass or disappear.',
      tone: 'warn'
    }
  }

  if (diagnostics.issue === 'bare_conda_path') {
    return {
      title: 'Recommended Setup Fix',
      headline: 'Conda path relies on PATH',
      body: 'Training launch currently works, but desktop apps can lose terminal PATH settings. A full Conda path is more reliable.',
      steps: ['Open a terminal.', `Run ${condaLookupCommand}.`, 'Paste the full executable path into Settings.', 'Re-check Diagnostics.'],
      commands: [{ label: 'Find Conda', command: condaLookupCommand }],
      verify: 'The Conda path style row should pass or disappear.',
      tone: 'warn'
    }
  }

  return {
    title: diagnostics.status === 'advisory' ? 'Recommended Setup Fix' : 'Fix This First',
    headline: diagnostics.headline,
    body: diagnostics.detail,
    steps: [primaryCheck?.suggestion ?? diagnostics.suggestion ?? 'Review the failing launch row, apply the suggested fix, then re-check Diagnostics.'],
    commands: primaryCheck?.command ? [{ label: primaryCheck.title, command: primaryCheck.command }] : [],
    verify: 'The Training Launch tile should change to Ready.',
    tone: diagnostics.status === 'advisory' ? 'warn' : 'fail'
  }
}

function isBareCondaSetting(settings: AppSettings): boolean {
  const condaPath = settings.condaExecutablePath ?? ''
  return condaPath.length > 0 && !condaPath.includes('\\') && !condaPath.includes('/')
}

function buildAcceleratorAction(
  settings: AppSettings | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  acceleratorGuidance: AcceleratorGuidance | null
): ActionItem | null {
  if (!acceleratorDiagnostics || !acceleratorGuidance) {
    return null
  }

  if (acceleratorDiagnostics.status === 'ready') {
    return null
  }

  if (acceleratorDiagnostics.status === 'cpu_only' && !acceleratorDiagnostics.hostNvidiaSmiAvailable) {
    return null
  }

  const commands = [...(acceleratorGuidance.setupSteps ?? []), ...acceleratorGuidance.steps]
  return {
    title: acceleratorDiagnostics.status === 'advisory' ? 'Recommended Setup Fix' : 'Fix This First',
    headline: acceleratorGuidance.title,
    body: acceleratorGuidance.body,
    steps: [acceleratorGuidance.note ?? acceleratorDiagnostics.suggestion ?? 'Run the suggested repair command, then re-check Diagnostics.'],
    commands,
    verify: `After repair, run: ${getDiagnosticCommands(settings).verifyTorch}`,
    tone: acceleratorDiagnostics.status === 'advisory' || acceleratorDiagnostics.status === 'cpu_only' ? 'warn' : 'fail'
  }
}

function buildVersionAction(settings: AppSettings | null, namVersionInfo: NamVersionInfo | null): ActionItem | null {
  if (!namVersionInfo || namVersionInfo.checkStatus !== 'ok' || namVersionInfo.isUpToDate !== false) {
    return null
  }

  return {
    title: 'Recommended Update',
    headline: 'A newer NAM version is available',
    body: `A2 local training requires neural-amp-modeler ${MIN_A2_NAM_VERSION} or newer. Updating NAM also brings newer training fixes and compatibility improvements.`,
    steps: ['Run the upgrade command in your selected environment.', 'Return to Diagnostics.', 'Click Re-check All.'],
    commands: getUpgradeCommands(settings),
    verify: 'The NAM Version tile should report Up to date.',
    tone: 'warn',
    showSettingsAction: false
  }
}

function buildActionItems(
  settings: AppSettings | null,
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null,
  namVersionInfo: NamVersionInfo | null,
  acceleratorGuidance: AcceleratorGuidance | null
): ActionItem[] {
  const backendFailure = findFirstBackendFailure(validation)
  const actions: ActionItem[] = []
  if (backendFailure) {
    actions.push(buildBackendAction(settings, backendFailure))
  }

  if (trainingLaunchDiagnostics) {
    const launchAction = buildTrainingLaunchAction(settings, trainingLaunchDiagnostics)
    if (launchAction) {
      actions.push(launchAction)
    }
  }

  const acceleratorAction = buildAcceleratorAction(settings, acceleratorDiagnostics, acceleratorGuidance)
  if (acceleratorAction) {
    actions.push(acceleratorAction)
  }

  const versionAction = buildVersionAction(settings, namVersionInfo)
  if (versionAction) {
    actions.push(versionAction)
  }

  return actions
}

function isSetupReady(
  validation: BackendValidationSummary | null,
  acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null,
  trainingLaunchDiagnostics: TrainingLaunchDiagnosticsSummary | null
): boolean {
  const acceleratorReady = acceleratorDiagnostics?.status === 'ready' || (acceleratorDiagnostics?.status === 'cpu_only' && !acceleratorDiagnostics.hostNvidiaSmiAvailable)
  return validation?.overallOk === true && acceleratorReady && trainingLaunchDiagnostics?.status === 'ready'
}

function ActionCenter({ actions, allReady, onOpenSettings }: { actions: ActionItem[]; allReady: boolean; onOpenSettings: () => void }) {
  if (actions.length === 0) {
    if (!allReady) {
      return (
        <div className="panel" style={{ marginBottom: '16px' }}>
          <p style={{ color: 'var(--text-steel)', fontFamily: 'var(--font-arcade)', fontSize: '24px', marginBottom: '4px' }}>Diagnostics Pending</p>
          <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.5 }}>
            NAM-BOT is still waiting for enough diagnostic data to make a setup recommendation.
          </p>
        </div>
      )
    }

    return (
      <div className="panel" style={{ marginBottom: '16px', borderColor: 'var(--neon-green)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-arcade)', fontSize: '28px', marginBottom: '4px' }}>Ready To Train</p>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.5 }}>
              NAM-BOT can reach the environment, inspect accelerator support, and launch the training process path successfully.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const primary = actions[0]
  const color = getStatusColor(primary.tone)
  return (
    <div className="panel" style={{ marginBottom: '16px', borderColor: color }}>
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color, fontFamily: 'var(--font-arcade)', fontSize: '28px', marginBottom: '4px' }}>{primary.title}</p>
            <p style={{ color: 'var(--text-ash)', fontSize: '18px', marginBottom: '6px' }}>{primary.headline}</p>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.55 }}>{primary.body}</p>
          </div>
          {primary.showSettingsAction !== false && (
            <button className="btn btn-sm btn-secondary" onClick={onOpenSettings}>Open Settings</button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <div style={{ border: '1px solid var(--border-dim)', padding: '12px', backgroundColor: 'rgba(9, 9, 11, 0.45)' }}>
            <p style={{ color: 'var(--text-ash)', fontFamily: 'var(--font-arcade)', fontSize: '18px', marginBottom: '8px' }}>How To Fix</p>
            <ol style={{ color: 'var(--text-steel)', paddingLeft: '18px', lineHeight: 1.55, fontSize: '13px' }}>
              {primary.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p style={{ color: 'var(--neon-cyan)', fontSize: '12px', lineHeight: 1.45, marginTop: '10px' }}>Verify: {primary.verify}</p>
          </div>
          <div style={{ display: 'grid', alignContent: 'start' }}>
            {primary.commands.length > 0 ? (
              primary.commands.slice(0, 2).map((command) => <CopyableCodeBlock key={command.label} label={command.label} command={command.command} />)
            ) : (
              <div style={{ border: '1px solid var(--border-dim)', padding: '12px', color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.45 }}>
                No command is needed for this fix. Update the setting, folder, or app location, then re-check.
              </div>
            )}
          </div>
        </div>

        {actions.length > 1 && (
          <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: '10px' }}>
            <p style={{ color: 'var(--text-steel)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>Also detected</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {actions.slice(1).map((action) => (
                <span key={action.headline} style={{ color: getStatusColor(action.tone), border: `1px solid ${getStatusColor(action.tone)}`, padding: '4px 8px', fontFamily: 'var(--font-arcade)', fontSize: '14px' }}>
                  {action.headline}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Diagnostics() {
  const navigate = useNavigate()
  const {
    settings,
    validation,
    acceleratorDiagnostics,
    trainingLaunchDiagnostics,
    namVersionInfo,
    isLoading,
    isBackendValidationLoading,
    isAcceleratorDiagnosticsLoading,
    isTrainingLaunchDiagnosticsLoading,
    isNamVersionInfoLoading,
    validationError,
    acceleratorDiagnosticsError,
    trainingLaunchDiagnosticsError,
    namVersionInfoError,
    loadSettings,
    validateBackend,
    loadAcceleratorDiagnostics,
    loadTrainingLaunchDiagnostics,
    loadNamVersionInfo
  } = useAppStore()

  const isChecking = isLoading || isBackendValidationLoading || isAcceleratorDiagnosticsLoading || isTrainingLaunchDiagnosticsLoading || isNamVersionInfoLoading
  const diagnosticErrors = [
    validationError,
    acceleratorDiagnosticsError,
    trainingLaunchDiagnosticsError,
    namVersionInfoError
  ].filter((message): message is string => Boolean(message))
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false)
  const acceleratorGuidance = getAcceleratorGuidance(acceleratorDiagnostics, settings)
  const diagnosticsJson = JSON.stringify(buildDiagnosticsExportPayload(settings, validation, acceleratorDiagnostics, trainingLaunchDiagnostics), null, 2)
  const aiTroubleshootingPrompt = buildAiTroubleshootingPrompt(settings, validation, acceleratorDiagnostics, trainingLaunchDiagnostics)
  const tiles = getSummaryTiles(validation, acceleratorDiagnostics, trainingLaunchDiagnostics, namVersionInfo)
  const actions = buildActionItems(settings, validation, acceleratorDiagnostics, trainingLaunchDiagnostics, namVersionInfo, acceleratorGuidance)
  const matrixGroups: MatrixGroup[] = [
    { title: 'Backend', rows: getBackendRows(validation) },
    { title: 'Training Launch', rows: getTrainingLaunchRows(trainingLaunchDiagnostics) },
    { title: 'Accelerator', rows: getAcceleratorRows(acceleratorDiagnostics) },
    { title: 'NAM Version', rows: getVersionRows(namVersionInfo) }
  ]

  useEffect(() => {
    if (!settings && !isLoading) {
      void loadSettings()
    }
    if (shouldAutoLoadResource(validation, isBackendValidationLoading, validationError)) {
      void validateBackend()
    }
    if (shouldAutoLoadResource(acceleratorDiagnostics, isAcceleratorDiagnosticsLoading, acceleratorDiagnosticsError)) {
      void loadAcceleratorDiagnostics()
    }
    if (shouldAutoLoadResource(trainingLaunchDiagnostics, isTrainingLaunchDiagnosticsLoading, trainingLaunchDiagnosticsError)) {
      void loadTrainingLaunchDiagnostics()
    }
    if (shouldAutoLoadResource(namVersionInfo, isNamVersionInfoLoading, namVersionInfoError)) {
      void loadNamVersionInfo()
    }
  }, [
    acceleratorDiagnostics,
    acceleratorDiagnosticsError,
    isAcceleratorDiagnosticsLoading,
    isBackendValidationLoading,
    isLoading,
    isNamVersionInfoLoading,
    isTrainingLaunchDiagnosticsLoading,
    loadAcceleratorDiagnostics,
    loadNamVersionInfo,
    loadSettings,
    loadTrainingLaunchDiagnostics,
    namVersionInfo,
    namVersionInfoError,
    settings,
    trainingLaunchDiagnostics,
    trainingLaunchDiagnosticsError,
    validation,
    validationError,
    validateBackend
  ])

  const handleRecheck = async () => {
    await Promise.all([validateBackend(), loadAcceleratorDiagnostics(), loadTrainingLaunchDiagnostics(), loadNamVersionInfo()])
  }

  if (isChecking && !validation && !acceleratorDiagnostics && !trainingLaunchDiagnostics) {
    return (
      <div className="layout-main">
        <div className="panel">
          <p className="processing-text" style={{ color: 'var(--text-steel)', textAlign: 'center', padding: '32px' }}>
            Running setup, accelerator, and launch diagnostics
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header" style={{ marginBottom: '12px' }}>
          <h3>Diagnostics</h3>
          <button className={`btn btn-sm btn-green ${isChecking ? 'processing-text' : ''}`} onClick={handleRecheck} disabled={isChecking}>
            {isChecking ? 'Checking' : 'Re-check All'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {tiles.map((tile) => <SummaryTileCard key={tile.title} tile={tile} />)}
        </div>
        {diagnosticErrors.length > 0 && (
          <div style={{ marginTop: '12px', color: 'var(--neon-magenta)', fontSize: '13px' }}>
            Diagnostics could not complete: {diagnosticErrors.join(' ')} Use Re-check All to try again.
          </div>
        )}
      </div>

      <ActionCenter actions={actions} allReady={isSetupReady(validation, acceleratorDiagnostics, trainingLaunchDiagnostics)} onOpenSettings={() => navigate('/settings')} />
      <DiagnosticMatrix groups={matrixGroups} />

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header" style={{ marginBottom: showAdvancedDetails ? '12px' : 0 }}>
          <h3>Advanced Details</h3>
          <button className={`btn btn-sm ${showAdvancedDetails ? 'btn-blue is-toggled' : 'btn-secondary'}`} onClick={() => setShowAdvancedDetails((value) => !value)}>
            {showAdvancedDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>

        {showAdvancedDetails && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', border: '1px solid var(--border-dim)' }}>
              <DiagnosticFact label="Target environment" value={getEnvironmentReference(settings)} />
              <DiagnosticFact label="Workspace root" value={formatMaybeText(trainingLaunchDiagnostics?.workspaceRoot, 'Not reported')} />
              <DiagnosticFact label="App executable" value={formatMaybeText(trainingLaunchDiagnostics?.appExecutablePath, 'Not reported')} />
              <DiagnosticFact label="Process arch" value={trainingLaunchDiagnostics?.processArch ?? 'Not reported'} />
              <DiagnosticFact label="node-pty helper" value={formatMaybeText(trainingLaunchDiagnostics?.nodePtyHelperPath, 'Not reported')} />
              <DiagnosticFact label="node-pty helper exists" value={formatMaybeBoolean(trainingLaunchDiagnostics?.nodePtyHelperExists)} />
              <DiagnosticFact label="node-pty helper executable" value={formatMaybeBoolean(trainingLaunchDiagnostics?.nodePtyHelperExecutable)} />
              <DiagnosticFact label="node-pty helper mode" value={formatMaybeText(trainingLaunchDiagnostics?.nodePtyHelperMode, 'Not reported')} />
              <DiagnosticFact label="node-pty helper error" value={formatMaybeText(trainingLaunchDiagnostics?.nodePtyHelperError, 'None')} />
              <DiagnosticFact label="Python version" value={formatMaybeText(acceleratorDiagnostics?.pythonVersion, 'Not reported')} />
              <DiagnosticFact label="Python executable" value={formatMaybeText(acceleratorDiagnostics?.pythonExecutable, 'Not reported')} />
              <DiagnosticFact label="Python platform" value={formatMaybeText(acceleratorDiagnostics?.pythonPlatform, 'Not reported')} />
              <DiagnosticFact label="Host NVIDIA" value={formatMaybeBoolean(acceleratorDiagnostics?.hostNvidiaSmiAvailable)} />
              <DiagnosticFact label="Host GPU" value={formatMaybeText(acceleratorDiagnostics?.hostNvidiaGpuName, 'Not detected')} />
              <DiagnosticFact label="NVIDIA driver" value={formatMaybeText(acceleratorDiagnostics?.hostDriverVersion, 'Not reported')} />
              <DiagnosticFact label="Torch version" value={formatMaybeText(acceleratorDiagnostics?.torchVersion, 'Not reported')} />
              <DiagnosticFact label="Torch CUDA build" value={formatMaybeText(acceleratorDiagnostics?.torchCudaVersion, 'CPU-only or not reported')} />
              <DiagnosticFact label="ROCm HIP version" value={formatMaybeText(acceleratorDiagnostics?.hipVersion, 'Not reported')} />
              <DiagnosticFact label="CUDA available" value={formatMaybeBoolean(acceleratorDiagnostics?.cudaAvailable)} />
              <DiagnosticFact label="MPS available" value={formatMaybeBoolean(acceleratorDiagnostics?.mpsAvailable)} />
              <DiagnosticFact label="NAM version" value={formatMaybeText(acceleratorDiagnostics?.namVersion, 'Not reported')} />
              <DiagnosticFact label="Lightning package" value={formatMaybeText(acceleratorDiagnostics?.lightningPackage, 'Not installed or not importable')} />
              <DiagnosticFact label="Lightning version" value={formatMaybeText(acceleratorDiagnostics?.lightningVersion, 'Not reported')} />
            </div>

            <div style={{ border: '1px solid var(--border-dim)', backgroundColor: 'rgba(9, 9, 11, 0.45)', padding: '14px' }}>
              <p style={{ color: 'var(--text-ash)', fontFamily: 'var(--font-arcade)', fontSize: '18px', marginBottom: '8px' }}>Troubleshooting Export</p>
              <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.5, marginBottom: '12px' }}>
                These exports include backend checks, accelerator state, training launch readiness, host context, and prepared repair commands.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: showAiPrompt || showRawJson ? '12px' : 0 }}>
                <button className="btn btn-primary" onClick={() => copyText(aiTroubleshootingPrompt)}>Copy AI Prompt</button>
                <button className={`btn ${showAiPrompt ? 'btn-blue is-toggled' : 'btn-secondary'}`} onClick={() => setShowAiPrompt((value) => !value)}>
                  {showAiPrompt ? 'Hide AI Prompt' : 'Show AI Prompt'}
                </button>
                <button className="btn btn-secondary" onClick={() => copyText(diagnosticsJson)}>Copy Raw JSON</button>
                <button className={`btn ${showRawJson ? 'btn-blue is-toggled' : 'btn-secondary'}`} onClick={() => setShowRawJson((value) => !value)}>
                  {showRawJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
                </button>
              </div>
              {showAiPrompt && <CopyableCodeBlock label="AI Troubleshooting Prompt" command={aiTroubleshootingPrompt} />}
              {showRawJson && <CopyableCodeBlock label="Raw Diagnostics JSON" command={diagnosticsJson} />}
            </div>

            {(acceleratorDiagnostics?.errors.length ?? 0) > 0 && (
              <div style={{ border: '1px solid var(--border-dim)', backgroundColor: 'rgba(9, 9, 11, 0.45)', padding: '14px' }}>
                <p style={{ color: 'var(--text-ash)', fontFamily: 'var(--font-arcade)', fontSize: '18px', marginBottom: '8px' }}>Probe Notes</p>
                {acceleratorDiagnostics?.errors.map((entry) => (
                  <p key={entry} style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: 1.45, marginBottom: '8px' }}>{entry}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
