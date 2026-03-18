import { useState } from 'react'

type GuideMode = 'standard' | 'nvidia' | 'apple'

interface CodeBlockProps {
  label: string
  command: string
}

interface GuideOption {
  id: GuideMode
  label: string
  description: string
}

const guideOptions: GuideOption[] = [
  {
    id: 'standard',
    label: 'Standard / Unsure',
    description: 'Use this if you are not sure what GPU you have, or if you plan to run on CPU.'
  },
  {
    id: 'nvidia',
    label: 'NVIDIA CUDA',
    description: 'Use this if you have an NVIDIA GPU and want local CUDA acceleration for training.'
  },
  {
    id: 'apple',
    label: 'Apple Silicon',
    description: 'Use this if you are on an Apple Silicon Mac and want Metal acceleration.'
  }
]

function CopyableCodeBlock({ label, command }: CodeBlockProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(command)
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
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
      }}>
        <span>{label}</span>
        <button
          className="btn btn-sm btn-secondary"
          onClick={handleCopy}
          style={{ padding: '2px 8px', fontSize: '10px' }}
        >
          Copy
        </button>
      </div>
      <pre style={{
        backgroundColor: 'var(--bg-void)',
        padding: '12px',
        border: '2px solid var(--border-dim)',
        color: 'var(--neon-green)',
        fontFamily: 'var(--font-arcade)',
        fontSize: '14px',
        overflowX: 'auto',
        margin: 0,
        whiteSpace: 'pre-wrap'
      }}>
        {command}
      </pre>
    </div>
  )
}

function GuideToggle({
  option,
  isActive,
  onSelect
}: {
  option: GuideOption
  isActive: boolean
  onSelect: (mode: GuideMode) => void
}) {
  return (
    <button
      className={`btn guide-toggle-btn ${isActive ? 'btn-blue is-toggled' : 'btn-secondary'}`}
      onClick={() => onSelect(option.id)}
    >
      <span className="guide-toggle-label">{option.label}</span>
      <span className="guide-toggle-desc">
        {option.description}
      </span>
    </button>
  )
}

function renderGuideIntro(mode: GuideMode): JSX.Element {
  if (mode === 'nvidia') {
    return (
      <div style={{
        backgroundColor: 'rgba(0, 243, 255, 0.05)',
        padding: '12px',
        borderLeft: '4px solid var(--neon-cyan)',
        marginBottom: '16px'
      }}>
        <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
          <strong>NVIDIA path:</strong> This flow explicitly replaces a CPU-only PyTorch install with a CUDA-enabled build.
          If you previously installed the wrong torch build, follow the NVIDIA commands exactly and then verify the result in Diagnostics.
        </p>
      </div>
    )
  }

  if (mode === 'apple') {
    return (
      <div style={{
        backgroundColor: 'rgba(0, 243, 255, 0.05)',
        padding: '12px',
        borderLeft: '4px solid var(--neon-cyan)',
        marginBottom: '16px'
      }}>
        <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
          <strong>Apple Silicon path:</strong> Use the standard PyTorch install. NAM-BOT will check for MPS availability on the Diagnostics page.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: 'rgba(255, 0, 65, 0.05)',
      padding: '12px',
      borderLeft: '4px solid var(--neon-magenta)',
      marginBottom: '16px'
    }}>
      <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
        <strong>Standard path:</strong> This is the safest option if you are unsure about your GPU. You can always switch later after Diagnostics tells you what the environment can see.
      </p>
    </div>
  )
}

function renderTorchInstall(mode: GuideMode): JSX.Element {
  if (mode === 'nvidia') {
    return (
      <>
        <CopyableCodeBlock
          label="Step C: Remove Wrong Torch Build"
          command="pip uninstall -y torch"
        />
        <CopyableCodeBlock
          label="Step D: Install CUDA PyTorch"
          command="pip install --index-url https://download.pytorch.org/whl/cu130 --no-cache-dir torch==2.10.0+cu130"
        />
        <CopyableCodeBlock
          label="Step E: Verify CUDA Torch"
          command={'python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.device_count()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)"'}
        />
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          Expected result: the version string should include <strong>+cu130</strong> and <strong>torch.cuda.is_available()</strong> should print <strong>True</strong>.
        </p>
      </>
    )
  }

  return (
    <>
      <CopyableCodeBlock
        label="Step C: Install PyTorch"
        command="pip install torch"
      />
      {mode === 'apple' && (
        <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '-8px', marginBottom: '16px' }}>
          On Apple Silicon, NAM-BOT will later check whether PyTorch can use MPS on your machine.
        </p>
      )}
    </>
  )
}

export default function Help() {
  const [guideMode, setGuideMode] = useState<GuideMode>('standard')

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>NAM-BOT Setup</h3>
        </div>

        <div style={{ color: 'var(--text-ash)', lineHeight: '1.8' }}>
          <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
            If you already have Neural Amp Modeler working on this machine, you probably do not need to rebuild your environment.
            In that case, NAM-BOT mainly needs the correct backend settings so it can point at the same Conda environment you already use for NAM training.
          </p>

          <div style={{
            backgroundColor: 'rgba(0, 243, 255, 0.05)',
            padding: '12px',
            borderLeft: '4px solid var(--neon-cyan)',
            marginBottom: '16px'
          }}>
            <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
              <strong>Use this path if:</strong> you can already run NAM training from its built-in GUI or from your existing terminal workflow and just want NAM-BOT to use that same environment.
            </p>
          </div>

          <div style={{
            backgroundColor: 'rgba(0, 243, 255, 0.05)',
            padding: '12px',
            borderLeft: '4px solid var(--neon-cyan)',
            marginBottom: '16px'
          }}>
            <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
              <strong>macOS note:</strong> use <strong>Terminal</strong> instead of Command Prompt or PowerShell, expect the Conda command to be <code style={{ color: 'var(--neon-cyan)' }}>conda</code>, and on Apple Silicon the accelerator path is <strong>MPS</strong> rather than CUDA.
            </p>
          </div>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '16px', marginBottom: '8px' }}>
            1. Open Settings
          </h4>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', marginBottom: '16px' }}>
            <li>Go to <strong>Settings</strong> in the left menu</li>
            <li>Set the Conda executable path if your setup does not use the default executable shown in Settings</li>
            <li>Set the backend mode to match how you launch NAM today</li>
            <li>Enter the Conda environment name or environment path that already contains your working NAM install</li>
          </ol>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            2. Save Settings
          </h4>
          <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
            Click <strong>Save Settings</strong>. NAM-BOT will automatically re-run backend validation and GPU diagnostics against the environment you just selected.
          </p>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            3. Check Diagnostics
          </h4>
          <p style={{ color: 'var(--text-steel)', marginBottom: '8px' }}>
            Open <strong>Diagnostics</strong> and confirm:
          </p>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px', marginBottom: '16px' }}>
            <li>The backend status says <strong>Validated</strong></li>
            <li>The accelerator section shows the GPU you expect, if you plan to train with GPU acceleration</li>
          </ol>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            4. Start Using NAM-BOT
          </h4>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
            <li>Go to <strong>Jobs</strong></li>
            <li>Click <strong>+ New Job</strong></li>
            <li>Select your audio and output files</li>
            <li>Save the job, then queue it</li>
          </ol>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Set Up NAM From Scratch</h3>
        </div>

        <div style={{ color: 'var(--text-ash)', lineHeight: '1.8' }}>
          <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
            Use this section if you do <strong>not</strong> already have a working NAM environment and need to build one from the beginning.
            Pick the setup path that matches your machine so you only see the PyTorch instructions that apply to you.
          </p>

          <div className="guide-toggle-grid">
            {guideOptions.map((option) => (
              <GuideToggle
                key={option.id}
                option={option}
                isActive={guideMode === option.id}
                onSelect={setGuideMode}
              />
            ))}
          </div>

          {renderGuideIntro(guideMode)}

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '16px', marginBottom: '8px' }}>
            1. Install Miniconda
          </h4>
          <p style={{ color: 'var(--text-steel)', marginBottom: '8px' }}>
            Navigate to: <a href="https://www.anaconda.com/download" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)' }}>https://www.anaconda.com/download</a>
          </p>
          <p style={{ color: 'var(--text-steel)' }}>
            Install Miniconda and make sure <code style={{ color: 'var(--neon-cyan)' }}>conda</code> is added to your PATH.
          </p>
          <div style={{
            backgroundColor: 'rgba(0, 243, 255, 0.05)',
            padding: '12px',
            borderLeft: '4px solid var(--neon-cyan)',
            marginBottom: '16px'
          }}>
            <p style={{ color: 'var(--text-steel)', margin: 0, fontSize: '14px' }}>
              <strong>Important:</strong> Scroll to the bottom of the Anaconda download page to find the <strong>Miniconda</strong> installers.
              If prompted, allow Miniconda to add itself to PATH.
            </p>
          </div>
          <p style={{ color: 'var(--text-steel)', fontSize: '13px', marginTop: '-4px', marginBottom: '16px' }}>
            On Apple Silicon, choose the Apple Silicon installer. On macOS beta builds, you may need to right-click the app and choose <strong>Open</strong> on first launch if Gatekeeper warns about an unsigned app.
          </p>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            2. Create NAM Environment
          </h4>
          <p style={{ color: 'var(--text-steel)', marginBottom: '16px' }}>
            Open Terminal on macOS, or Command Prompt / PowerShell on Windows, and run these commands <strong>one at a time</strong>:
          </p>

          <CopyableCodeBlock
            label="Step A: Create Environment"
            command="conda create -n nam python=3.11 -y"
          />
          <CopyableCodeBlock
            label="Step B: Activate"
            command="conda activate nam"
          />

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            3. Install PyTorch for This Machine
          </h4>
          {renderTorchInstall(guideMode)}

          <CopyableCodeBlock
            label={guideMode === 'nvidia' ? 'Step F: Install Neural Amp Modeler' : 'Step D: Install Neural Amp Modeler'}
            command="pip install neural-amp-modeler"
          />

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            4. Configure NAM-BOT
          </h4>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
            <li>Go to <strong>Settings</strong></li>
            <li>Leave the default Conda executable unchanged unless your install needs a custom path</li>
            <li>Leave the default environment name as <code style={{ color: 'var(--neon-cyan)' }}>nam</code> unless you intentionally created a different environment</li>
            <li>Choose an output directory</li>
            <li>Click <strong>Save Settings</strong></li>
          </ol>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            5. Validate
          </h4>
          <p style={{ color: 'var(--text-steel)' }}>
            NAM-BOT validates the backend automatically on startup. You can always go to <strong>Diagnostics</strong> and click <strong>Re-check</strong> to inspect both backend readiness and GPU visibility.
          </p>
          <p style={{ color: 'var(--text-steel)', fontSize: '13px', marginTop: '8px' }}>
            On Windows, GPU diagnostics mostly focus on CUDA and NVIDIA visibility. On Apple Silicon, the same screen also reports whether PyTorch can see <strong>MPS</strong>.
          </p>

          <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginTop: '24px', marginBottom: '8px' }}>
            6. Create a Job
          </h4>
          <ol style={{ color: 'var(--text-steel)', paddingLeft: '20px' }}>
            <li>Go to <strong>Jobs</strong></li>
            <li>Click <strong>+ New Job</strong></li>
            <li>Select input and output audio files</li>
            <li>Adjust training settings</li>
            <li>Click <strong>Save Job</strong>, then <strong>Queue</strong></li>
          </ol>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Links</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a href="https://github.com/sdatkinson/neural-amp-modeler" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            NAM GitHub
          </a>
          <a href="https://www.anaconda.com/download" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Anaconda / Miniconda
          </a>
          <a href="https://pytorch.org/get-started/locally/" target="_blank" rel="noopener noreferrer" className="btn btn-green">
            PyTorch Install Guide
          </a>
        </div>
      </div>
    </div>
  )
}
