import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useNavigate } from 'react-router-dom'

import type { AppCommand } from '../shared/appShell'
import { AcceleratorDiagnosticsSummary, BackendValidationSummary, useAppStore } from './state/store'
import type { UpdateStatus } from '../shared/update'
import { JobRuntimeState, TrainingPresetFile } from './state/types'
import Settings from './features/settings/Settings'
import Diagnostics from './features/diagnostics/Diagnostics'
import Jobs from './features/jobs/Jobs'
import Help from './features/help/Help'
import Presets from './features/presets/Presets'
import About from './features/about/About'
import RuntimeCard from './features/jobs/RuntimeCard'
import { buildJobEditorSession, createNewJobDraft } from './features/jobs/jobEditorSession'
import { buildNewPresetDraft, buildPresetEditorSession } from './features/presets/presetEditorSession'
import log from 'electron-log/renderer'

function getBackendSummary(validation: BackendValidationSummary | null): {
  label: string
  detail: string
  color: string
} {
  if (!validation) {
    return {
      label: 'Checking',
      detail: 'Waiting for backend validation results.',
      color: 'var(--text-steel)'
    }
  }

  if (validation.overallOk) {
    return {
      label: 'Validated',
      detail: `Last checked ${new Date(validation.checkedAt).toLocaleString()}.`,
      color: 'var(--neon-green)'
    }
  }

  return {
    label: 'Needs attention',
    detail: 'Open Diagnostics to see which backend checks failed.',
    color: 'var(--neon-magenta)'
  }
}

function getAcceleratorSummary(acceleratorDiagnostics: AcceleratorDiagnosticsSummary | null): {
  label: string
  detail: string
  color: string
} {
  if (!acceleratorDiagnostics) {
    return {
      label: 'Checking',
      detail: 'Waiting for GPU visibility diagnostics.',
      color: 'var(--text-steel)'
    }
  }

  switch (acceleratorDiagnostics.status) {
    case 'ready':
      if (acceleratorDiagnostics.issue === 'rocm_ready') {
        return {
          label: acceleratorDiagnostics.deviceName ? `AMD GPU: ${acceleratorDiagnostics.deviceName}` : 'AMD GPU ready',
          detail: acceleratorDiagnostics.detail,
          color: 'var(--neon-green)'
        }
      }
      return {
        label: acceleratorDiagnostics.deviceName ? `NVIDIA GPU: ${acceleratorDiagnostics.deviceName}` : 'NVIDIA GPU ready',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--neon-green)'
      }
    case 'advisory':
      return {
        label: 'GPU seen, check Lightning',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--neon-cyan)'
      }
    case 'cpu_only':
      return {
        label: 'CPU-only torch build',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--neon-magenta)'
      }
    case 'not_visible':
      return {
        label: 'CUDA not visible',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--neon-magenta)'
      }
    case 'not_checked':
      return {
        label: 'Not checked',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--text-steel)'
      }
    case 'error':
    default:
      return {
        label: 'Probe failed',
        detail: acceleratorDiagnostics.detail,
        color: 'var(--neon-magenta)'
      }
  }
}

function Dashboard() {
  const { 
    validation, 
    acceleratorDiagnostics, 
    loadAcceleratorDiagnostics, 
    drafts, 
    queue,
    presets,
    loadPresets
  } = useAppStore()
  
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())
  const [visibleLogJobIds, setVisibleLogJobIds] = useState<Set<string>>(new Set())
  const [logContents, setLogContents] = useState<Record<string, string>>({})
  const [loadingLogs, setLoadingLogs] = useState<Set<string>>(new Set())

  const backendSummary = getBackendSummary(validation)
  const acceleratorSummary = getAcceleratorSummary(acceleratorDiagnostics)

  const trainingJobs = queue.filter(r => r.status === 'preparing' || r.status === 'running' || r.status === 'stopping')
  const queuedJobs = queue.filter(r => r.status === 'queued' || r.status === 'validating')
  const completedJobs = queue.filter(r => r.status === 'succeeded')
  const errorJobs = queue.filter(r => r.status === 'failed' || r.status === 'canceled')

  useEffect(() => {
    if (!acceleratorDiagnostics) {
      void loadAcceleratorDiagnostics()
    }
    if (presets.length === 0) {
      void loadPresets()
    }
  }, [acceleratorDiagnostics, loadAcceleratorDiagnostics, presets.length, loadPresets])

  const stats = [
    { label: 'Drafts', count: drafts.length, color: 'var(--text-steel)' },
    { label: 'Queued', count: queuedJobs.length, color: 'var(--neon-cyan)' },
    { label: 'Training', count: trainingJobs.length, color: 'var(--neon-gold)' },
    { label: 'Completed', count: completedJobs.length, color: 'var(--neon-green)' },
    { label: 'Errors', count: errorJobs.length, color: 'var(--neon-magenta)' }
  ]

  const toggleExpanded = (jobId: string) => {
    setExpandedJobIds(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const toggleLogs = async (runtime: JobRuntimeState) => {
    const { jobId } = runtime
    if (visibleLogJobIds.has(jobId)) {
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
      return
    }

    setLoadingLogs(prev => {
      const next = new Set(prev)
      next.add(jobId)
      return next
    })
    try {
      const logContent = await window.namBot.logs.getTerminal(jobId)
      setLogContents(prev => ({ ...prev, [jobId]: logContent }))
      setVisibleLogJobIds(prev => {
        const next = new Set(prev)
        next.add(jobId)
        return next
      })
    } catch (err) {
      log.error('Failed to load log for dashboard:', err)
    } finally {
      setLoadingLogs(prev => {
        const next = new Set(prev)
        next.delete(jobId)
        return next
      })
    }
  }

  const nowMs = Date.now()

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Jobs Overview</h3>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '8px',
          marginBottom: '16px'
        }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              padding: '8px',
              border: `1px solid ${stat.count > 0 ? stat.color : 'rgba(255,255,255,0.08)'}`,
              backgroundColor: 'rgba(9, 9, 11, 0.45)',
              textAlign: 'center'
            }}>
              <p style={{
                color: 'var(--text-steel)',
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: '4px'
              }}>
                {stat.label}
              </p>
              <p style={{
                color: stat.count > 0 ? stat.color : 'var(--text-steel)',
                fontFamily: 'var(--font-arcade)',
                fontSize: stat.count > 99 ? '18px' : '22px',
                margin: 0
              }}>
                {stat.count}
              </p>
            </div>
          ))}
        </div>
      </div>

      {trainingJobs.length > 0 && (
        <div className="panel" style={{ marginBottom: '16px' }}>
          <div className="panel-header">
            <h3 className="processing-text" style={{ color: 'var(--neon-gold)' }}>Active Training</h3>
          </div>
          <div className="job-list" style={{ marginTop: '12px' }}>
             {trainingJobs.map(job => (
               <RuntimeCard
                  key={job.jobId}
                  runtime={job}
                  presets={presets}
                  nowMs={nowMs}
                 isExpanded={expandedJobIds.has(job.jobId)}
                 isLogsVisible={visibleLogJobIds.has(job.jobId)}
                 terminalLog={logContents[job.jobId] || ''}
                 isLoadingLog={loadingLogs.has(job.jobId)}
                 onToggleExpanded={toggleExpanded}
                 onToggleLogs={toggleLogs}
                 onCancel={async (id: string) => { await window.namBot.jobs.cancel(id) }}
                 onForceStop={async (id: string) => { await window.namBot.jobs.forceStop(id) }}
                 onRetry={async (id: string) => { await window.namBot.jobs.retry(id) }}
                 onOpenFolder={async (id: string) => { await window.namBot.jobs.openResultFolder(id) }}
               />
             ))}
          </div>
        </div>
      )}

      {/* ── END LIVE TRAINING ── */}

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Backend Status</h3>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px'
        }}>
          <div style={{
            padding: '14px',
            border: `1px solid ${backendSummary.color}`,
            backgroundColor: 'rgba(9, 9, 11, 0.45)'
          }}>
            <p style={{
              color: 'var(--text-steel)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '8px'
            }}>
              Backend
            </p>
            <p style={{
              color: backendSummary.color,
              fontFamily: 'var(--font-arcade)',
              fontSize: '24px',
              marginBottom: '8px'
            }}>
              {backendSummary.label}
            </p>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: '1.5' }}>
              {backendSummary.detail}
            </p>
          </div>

          <div style={{
            padding: '14px',
            border: `1px solid ${acceleratorSummary.color}`,
            backgroundColor: 'rgba(9, 9, 11, 0.45)'
          }}>
            <p style={{
              color: 'var(--text-steel)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '8px'
            }}>
              Accelerator
            </p>
            <p style={{
              color: acceleratorSummary.color,
              fontFamily: 'var(--font-arcade)',
              fontSize: '24px',
              marginBottom: '8px'
            }}>
              {acceleratorSummary.label}
            </p>
            <p style={{ color: 'var(--text-steel)', fontSize: '13px', lineHeight: '1.5' }}>
              {acceleratorSummary.detail}
            </p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a href="#/settings" className="btn btn-primary">Configure Backend</a>
          <a href="#/diagnostics" className="btn btn-green">Run Diagnostics</a>
          <a href="#/jobs" className="btn btn-secondary">Create Job</a>
        </div>
      </div>
    </div>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const { isTraining } = useAppStore()
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const queue = useAppStore((state) => state.queue)
  const updateStatus = useAppStore((state) => state.updateStatus)
  const loadSettings = useAppStore((state) => state.loadSettings)
  const detectConda = useAppStore((state) => state.detectConda)
  const loadUpdateStatus = useAppStore((state) => state.loadUpdateStatus)
  const setValidation = useAppStore((state) => state.setValidation)
  const setUpdateStatus = useAppStore((state) => state.setUpdateStatus)
  const setIsTraining = useAppStore((state) => state.setIsTraining)
  const setJobEditorSession = useAppStore((state) => state.setJobEditorSession)
  const setPresetEditorSession = useAppStore((state) => state.setPresetEditorSession)
  const loadJobs = useAppStore((state) => state.loadJobs)
  const subscribeToJobEvents = useAppStore((state) => state.subscribeToJobEvents)
  const hasUpdateAvailable = updateStatus.state === 'update-available'

  useEffect(() => {
    void loadSettings()
    void detectConda()
    void loadJobs()
    void loadUpdateStatus()
    
    const unsub = subscribeToJobEvents()
    return unsub
  }, [detectConda, loadSettings, loadJobs, loadUpdateStatus, subscribeToJobEvents])

  useEffect(() => {
    return window.namBot.events.onBackendValidationUpdated((summary: unknown) => {
      setValidation(summary as Parameters<typeof setValidation>[0])
    })
  }, [setValidation])

  useEffect(() => {
    return window.namBot.events.onUpdateStatusChanged((status: UpdateStatus) => {
      setUpdateStatus(status)
    })
  }, [setUpdateStatus])

  useEffect(() => {
    const isActive = queue.some((runtime) =>
      runtime.status === 'preparing' || runtime.status === 'running' || runtime.status === 'stopping'
    )
    setIsTraining(isActive)
  }, [queue, setIsTraining])

  useEffect(() => {
    return window.namBot.events.onAppCommand((command: AppCommand) => {
      switch (command.type) {
        case 'navigate':
          navigate(command.path)
          return
        case 'new-job':
          setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
          navigate('/jobs')
          return
        case 'new-preset':
          setPresetEditorSession(buildPresetEditorSession('New Preset', buildNewPresetDraft(settings)))
          navigate('/presets')
          return
        default:
          return
      }
    })
  }, [navigate, presets, setJobEditorSession, setPresetEditorSession, settings])

  return (
    <>
      <header>
        <h1>NAM-BOT</h1>
        <p className="subtitle">Neural Amp Modeler Training Manager</p>
      </header>

      <main>
        <div className="layout-two-column">
          <nav className="nav-sidebar">
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/jobs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${isTraining ? 'processing-text' : ''}`}>
              Jobs
            </NavLink>
            <NavLink to="/presets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Presets
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Settings
            </NavLink>
            <NavLink to="/diagnostics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Diagnostics
            </NavLink>
            <NavLink to="/help" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Setup Guide
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span>About</span>
              {hasUpdateAvailable && <span className="nav-update-indicator" aria-label="Update available" />}
            </NavLink>
          </nav>

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/presets" element={<Presets />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/help" element={<Help />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </main>
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  )
}
