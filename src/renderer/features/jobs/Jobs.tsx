import { useEffect, useMemo, useState, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useAppStore,
  type AppSettings,
  type JobEditorSession,
  type JobInputAudioMode,
  type JobOutputRootMode
} from '../../state/store'
import ConfirmDialog from '../../components/ConfirmDialog'
import {
  DEFAULT_PRESET_ID,
  JobSpec,
  JobRuntimeState,
  JobStatus,
  JobStopMode,
  NAM_GEAR_TYPE_OPTIONS,
  NAM_TONE_TYPE_OPTIONS,
  NamEmbeddedMetadata,
  NamGearType,
  NamToneType,
  TrainingPresetFile,
  defaultJobSpec
} from '../../state/types'
import {
  isActiveRuntime,
  isQueuedRuntime,
  isFinishedTraining,
  filenameWithoutExt,
  getBasename,
  getDirname,
  getDisplayState,
  getPlannedEpochsLabel
} from './job-helpers'
import RuntimeCard, { renderDisplayBadge } from './RuntimeCard'
import { handleCardToggleKeyDown, shouldIgnoreCardToggle } from '../../utils/card-toggle'
import { formatPresetNameWithRewardTag } from '../about/aboutRewardPreset'
import {
  buildJobEditorSession,
  getStoredAppendEsrToModelFileNamePreference,
  createNewJobDraft,
  getStoredAppendPresetToModelFileNamePreference,
  getPreferredOutputRootSelection,
  LAST_APPEND_ESR_STORAGE_KEY,
  LAST_APPEND_PRESET_NAME_STORAGE_KEY,
  LAST_USED_PRESET_STORAGE_KEY,
  persistOutputRootPreference,
  VIRTUAL_NEW_JOB_ID
} from './jobEditorSession'



interface FilePickerRowProps {
  value: string
  displayValue?: string
  onChange: (val: string) => void
  placeholder?: string
  onBrowse: () => Promise<string | null>
  disabled?: boolean
  id?: string
  error?: boolean
}

function FilePickerRow({ value, displayValue, onChange, placeholder, onBrowse, disabled, id, error }: FilePickerRowProps) {
  const handleBrowse = async () => {
    const picked = await onBrowse()
    if (picked) onChange(picked)
  }

  return (
    <div className="file-picker-row">
      <input
        id={id}
        type="text"
        className={`form-input${error ? ' input-error' : ''}`}
        value={displayValue ?? value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!!displayValue}
        title={value}
        style={{
          ...(disabled ? { color: 'var(--text-steel)', cursor: 'not-allowed' } : {}),
          ...(error ? { borderColor: 'var(--neon-magenta)' } : {})
        }}
      />
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={handleBrowse}
        disabled={disabled}
        style={{ flexShrink: 0 }}
      >
        Browse
      </button>
    </div>
  )
}

interface DraftCardProps {
  job: JobSpec
  presets: TrainingPresetFile[]
  onEdit: (job: JobSpec) => void
  onQueue: (jobId: string) => Promise<void>
  onDuplicate: (jobId: string) => Promise<void>
  onDelete: (job: JobSpec) => void
}

function DraftCard({ job, presets, onEdit, onQueue, onDuplicate, onDelete }: DraftCardProps) {
  const preset = presets.find(p => p.id === job.presetId)
  const presetName = preset ? formatPresetNameWithRewardTag(preset) : job.presetId || 'Unknown Preset'

  return (
    <div className="job-card">
      <div className="job-info">
        <h4>{job.name}</h4>
        <div className="job-meta">
          <div className="job-meta-main">
            {job.inputAudioIsDefault ? '[ Standard v3 Signal ]' : (getBasename(job.inputAudioPath) || 'No input')}
            {' -> '}
            {getBasename(job.outputAudioPath) || 'No output'}
          </div>
          <div className="job-meta-preset">
            <span className="meta-label">Preset:</span> {presetName}
          </div>
        </div>
      </div>
      <div className="job-actions">
        <button className="btn btn-sm btn-blue" onClick={() => onEdit(job)}>
          Edit
        </button>
        <button className="btn btn-sm btn-green" onClick={() => void onQueue(job.id)}>
          Queue
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => void onDuplicate(job.id)}>
          Copy
        </button>
        <button className="btn btn-sm btn-orange" onClick={() => onDelete(job)}>
          Delete
        </button>
      </div>
    </div>
  )
}

const JOB_EDITOR_FORM_ID = 'job-editor-form'

function serializeJobEditorSession(session: JobEditorSession): string {
  return JSON.stringify({
    job: session.job,
    inputMode: session.inputMode,
    outputRootMode: session.outputRootMode
  })
}

interface SortableQueueItemProps {
  runtime: JobRuntimeState
  queue: JobRuntimeState[]
  presets: TrainingPresetFile[]
  index: number
  onUnqueue: (jobId: string) => Promise<void>
}

function SortableQueueItem({ runtime, queue, presets, index, onUnqueue }: SortableQueueItemProps) {
  const presetName = presets.find(p => p.id === runtime.frozenJob.presetId)?.name || runtime.frozenJob.presetId || 'Unknown'
  const headline = runtime.status === 'validating'
    ? 'Validating job before queue'
    : `Waiting in queue - ${index + 1} of ${queue.length}`
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: runtime.jobId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    position: 'relative' as const,
    zIndex: isDragging ? 1000 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="job-card queue-card queue-card-queued"
      {...attributes}
      {...listeners}
    >
      <div className="queue-card-summary">
        <div className="job-info queue-card-main">
          <h4>{runtime.jobName}</h4>
          <div className="queue-card-status-row">
            {renderDisplayBadge('Queued')}
            <div className="queue-card-headline-group">
              <p className="queue-card-headline">{headline}</p>
              <div className="queue-card-stat-row">
                <span className="queue-card-stat">
                  <span className="meta-label">Preset</span>
                  <span>{presetName}</span>
                </span>
                <span className="queue-card-stat">
                  <span className="meta-label">Epochs</span>
                  <span>{getPlannedEpochsLabel(runtime)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="job-actions queue-card-actions" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn btn-sm btn-secondary" onClick={() => void onUnqueue(runtime.jobId)}>Unqueue</button>
        </div>
      </div>
    </div>
  )
}

export default function Jobs() {
  const { setIsTraining } = useAppStore()
  const settings = useAppStore((state) => state.settings)
  const presets = useAppStore((state) => state.presets)
  const loadPresets = useAppStore((state) => state.loadPresets)
  const jobEditorSession = useAppStore((state) => state.jobEditorSession)
  const setJobEditorSession = useAppStore((state) => state.setJobEditorSession)
  const clearJobEditorSession = useAppStore((state) => state.clearJobEditorSession)
  const drafts = useAppStore((state) => state.drafts)
  const setDrafts = useAppStore((state) => state.setDrafts)
  const queue = useAppStore((state) => state.queue)
  const setQueue = useAppStore((state) => state.setQueue)
  const loadJobs = useAppStore((state) => state.loadJobs)
  const subscribeToJobEvents = useAppStore((state) => state.subscribeToJobEvents)

  useEffect(() => {
    const active = queue.some(r => r.status === 'preparing' || r.status === 'running' || r.status === 'stopping')
    setIsTraining(active)
  }, [queue, setIsTraining])
  const [isDragOver, setIsDragOver] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const [logContents, setLogContents] = useState<Record<string, string>>({})
  const [loadingLogJobId, setLoadingLogJobId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [pendingDeleteJob, setPendingDeleteJob] = useState<JobSpec | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    await loadJobs()
  }

  useEffect(() => {
    void loadPresets()
    void loadData()

    const unsub = subscribeToJobEvents()
    return unsub
  }, [loadPresets, loadJobs, subscribeToJobEvents])

  useEffect(() => {
    const hasActiveRuntimeClock = queue.some(
      (runtime) => runtime.status === 'preparing' || runtime.status === 'running' || runtime.status === 'stopping'
    )
    if (!hasActiveRuntimeClock) {
      return
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [queue])

  const loadTerminalLog = async (jobId: string, backgroundRefresh: boolean = false) => {
    if (!backgroundRefresh) {
      setLoadingLogJobId(jobId)
    }
    try {
      const content = await window.namBot.logs.getTerminal(jobId)
      setLogContents((current) => ({
        ...current,
        [jobId]: String(content || '')
      }))
    } finally {
      if (!backgroundRefresh) {
        setLoadingLogJobId((current) => (current === jobId ? null : current))
      }
    }
  }

  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => {
    const hasAnyOpenLogs = Object.values(openLogs).some(Boolean)
    if (!hasAnyOpenLogs) {
      return
    }

    const interval = window.setInterval(() => {
      // Find which of the open logs are for active jobs
      const activeVisibleLogIds = queueRef.current
        .filter((runtime: JobRuntimeState) => openLogs[runtime.jobId] && isActiveRuntime(runtime.status))
        .map((runtime: JobRuntimeState) => runtime.jobId)

      activeVisibleLogIds.forEach((jobId: string) => {
        void loadTerminalLog(jobId, true)
      })
    }, 1500)

    return () => window.clearInterval(interval)
  }, [openLogs])

  const handleCreateJob = () => {
    setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
  }

  const handleDropFiles = async (files: FileList) => {
    setIsDragOver(false)
    const wavFiles = Array.from(files).filter((file) =>
      file.name.toLowerCase().endsWith('.wav') ||
      file.name.toLowerCase().endsWith('.mp3') ||
      file.name.toLowerCase().endsWith('.flac')
    )
    if (wavFiles.length === 0) {
      return
    }

    const defaultInputRef = await window.namBot.jobs.getDefaultInputAudioPath() as string | null
    const visiblePresets = presets.filter((preset) => preset.visible)
    const storedPresetId = window.localStorage.getItem(LAST_USED_PRESET_STORAGE_KEY)
    const appendPresetToModelFileName = getStoredAppendPresetToModelFileNamePreference()
    const appendEsrToModelFileName = getStoredAppendEsrToModelFileNamePreference()
    const fallbackPreset = visiblePresets.find((preset) => preset.id === storedPresetId)
      ?? visiblePresets.find((preset) => preset.id === DEFAULT_PRESET_ID)
      ?? visiblePresets[0]
    for (const file of wavFiles) {
      const filePath = window.namBot.jobs.getPathForFile(file) || file.name
      const preferredOutputRootSelection = getPreferredOutputRootSelection(settings, filePath)
      const newJob = await window.namBot.jobs.createDraft({
        ...defaultJobSpec,
        name: filenameWithoutExt(file.name),
        presetId: fallbackPreset?.id ?? DEFAULT_PRESET_ID,
        appendPresetToModelFileName,
        appendEsrToModelFileName,
        inputAudioPath: defaultInputRef || '',
        outputAudioPath: filePath,
        outputRootDir: preferredOutputRootSelection.outputRootDir,
        inputAudioIsDefault: true,
        outputRootDirIsDefault: preferredOutputRootSelection.outputRootDirIsDefault,
        trainingOverrides: {
          ...defaultJobSpec.trainingOverrides,
          epochs: fallbackPreset?.values.epochs ?? defaultJobSpec.trainingOverrides.epochs
        },
        metadata: {
          ...defaultJobSpec.metadata,
          modeledBy: settings?.defaultAuthorName || ''
        }
      }) as JobSpec
      setDrafts((prev) => [...prev, newJob])
    }
  }

  const handleSaveJob = async (job: JobSpec) => {
    if (job.id === VIRTUAL_NEW_JOB_ID) {
      // Create a new draft on the backend (omitting the virtual ID)
      const { id: _unused, ...specWithoutId } = job
      const created = await window.namBot.jobs.createDraft(specWithoutId) as JobSpec
      setDrafts((prev) => [...prev, created])
    } else {
      // Save existing draft
      const updated = await window.namBot.jobs.saveDraft(job) as JobSpec
      setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft))
    }
    clearJobEditorSession()
  }

  const handleDeleteJob = async (jobId: string) => {
    await window.namBot.jobs.deleteDraft(jobId)
    setDrafts((current) => current.filter((draft) => draft.id !== jobId))
    setPendingDeleteJob(null)
    if (jobEditorSession?.job.id === jobId) {
      clearJobEditorSession()
    }
  }

  const handleEnqueue = async (jobId: string) => {
    const job = drafts.find(d => d.id === jobId)
    if (job && (!job.name.trim() || !job.inputAudioPath.trim() || !job.outputAudioPath.trim() || !job.outputRootDir.trim())) {
      setQueueError('Cannot queue job: Some required fields are missing. Please Edit the job first.')
      return
    }

    try {
      await window.namBot.jobs.enqueue(jobId)
      await loadData()
      setQueueError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQueueError(`Queue failed: ${message}`)
    }
  }

  const handleQueueAll = async () => {
    if (drafts.length === 0) {
      return
    }

    const validDrafts = drafts.filter(job => 
      job.name.trim() && job.inputAudioPath.trim() && job.outputAudioPath.trim() && job.outputRootDir.trim()
    )

    if (validDrafts.length === 0) {
      setQueueError('Cannot queue: No valid jobs found. Make sure all jobs have a name, input/output audio, and root directory.')
      return
    }

    const skippedCount = drafts.length - validDrafts.length

    try {
      await window.namBot.jobs.enqueueMany(validDrafts.map((draft) => draft.id))
      await loadData()
      if (skippedCount > 0) {
        setQueueError(`Queued ${validDrafts.length} jobs. ${skippedCount} jobs were skipped because they are missing required fields.`)
      } else {
        setQueueError(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQueueError(`Queue failed: ${message}`)
    }
  }

  const handleUnqueue = async (jobId: string) => {
    await window.namBot.jobs.unqueue(jobId)
    await loadData()
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const queuedJobs = queue.filter((runtime) => runtime.status === 'queued' || runtime.status === 'validating')
      // The UI shows the list reversed, so we work with the reversed list for indices
      const reversedQueued = [...queuedJobs].reverse()
      const oldIndex = reversedQueued.findIndex((j) => j.jobId === active.id)
      const newIndex = reversedQueued.findIndex((j) => j.jobId === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedReversed = arrayMove(reversedQueued, oldIndex, newIndex)
        // Reverse back to get the logical order (NextJob at index 0)
        const newLogicalOrder = [...updatedReversed].reverse()
        
        // Optimistic update
        const otherJobs = queue.filter((runtime) => runtime.status !== 'queued' && runtime.status !== 'validating')
        setQueue([...otherJobs.filter(j => isActiveRuntime(j.status)), ...newLogicalOrder, ...otherJobs.filter(j => isFinishedTraining(j))])
        
        await window.namBot.jobs.reorder(newLogicalOrder.map(j => j.jobId))
      }
    }
  }

  const handleUnqueueAll = async () => {
    await window.namBot.jobs.unqueueAll()
    await loadData()
  }

  const handleCancel = async (jobId: string) => {
    await window.namBot.jobs.cancel(jobId)
  }

  const handleForceStop = async (jobId: string) => {
    await window.namBot.jobs.forceStop(jobId)
  }

  const handleRetry = async (jobId: string) => {
    await window.namBot.jobs.retry(jobId)
    await loadData()
  }

  const handleDuplicate = async (jobId: string) => {
    const newJob = await window.namBot.jobs.duplicate(jobId) as JobSpec | null
    if (newJob) {
      setDrafts((prev) => [...prev, newJob])
    }
  }

  const handleClearFinished = async () => {
    await window.namBot.jobs.clearFinished()
    await loadData()
  }

  const handleClearItem = async (jobId: string) => {
    await window.namBot.jobs.clearItem(jobId)
    setExpandedJobs((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    setOpenLogs((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    setLogContents((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
    await loadData()
  }

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs((current) => ({
      ...current,
      [jobId]: !current[jobId]
    }))
  }

  const toggleLogs = async (jobId: string) => {
    const isOpen = openLogs[jobId] === true
    if (isOpen) {
      setOpenLogs((current) => ({ ...current, [jobId]: false }))
      return
    }
    await loadTerminalLog(jobId)
    setOpenLogs((current) => ({ ...current, [jobId]: true }))
  }

  const queuedJobs = queue.filter((runtime) => runtime.status === 'queued' || runtime.status === 'validating')
  const trainingJobs = [...queue.filter((runtime) => runtime.status !== 'queued' && runtime.status !== 'validating')]
    .sort((left, right) => {
      const leftActive = isActiveRuntime(left.status) ? 1 : 0
      const rightActive = isActiveRuntime(right.status) ? 1 : 0
      if (leftActive !== rightActive) {
        return rightActive - leftActive
      }
      return Date.parse(right.startedAt || right.finishedAt || right.queuedAt || '0') - Date.parse(left.startedAt || left.finishedAt || left.queuedAt || '0')
    })

  const isEmpty = drafts.length === 0 && queue.length === 0

  if (jobEditorSession) {
    return (
      <JobEditor
        session={jobEditorSession}
        settings={settings}
        presets={presets}
        onSessionChange={setJobEditorSession}
        onSave={handleSaveJob}
        onCancel={clearJobEditorSession}
      />
    )
  }

  return (
    <div className="layout-main">
      <div
        className={`panel drop-zone-panel${isDragOver ? ' drop-zone-active' : ''}`}
        style={{ marginBottom: '16px', position: 'relative' }}
        onDragOver={(event) => { event.preventDefault(); setIsDragOver(true) }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragOver(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          void handleDropFiles(event.dataTransfer.files)
        }}
      >
        {isDragOver && (
          <div className="drop-overlay">
            <div className="drop-zone-empty">
              <h3>Drop output audio files</h3>
              <p>Release to create draft jobs from the files you dropped.</p>
            </div>
          </div>
        )}

        <div className="panel-header">
          <h3>Jobs</h3>
          <button className="btn btn-green" onClick={() => void handleCreateJob()}>
            New Job
          </button>
        </div>

        {queueError && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', border: '2px solid var(--neon-magenta)', color: 'var(--neon-magenta)' }}>
            {queueError}
          </div>
        )}

        {isEmpty ? (
          <div className="drop-zone-empty">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".wav"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void handleDropFiles(e.target.files)
              }}
            />
            <div className="drop-zone-icon-container">
              <svg width="84" height="67" viewBox="0 0 48 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 2H4C2.9 2 2.01 2.9 2.01 4L2 34C2 35.1 2.9 36 4 36H44C45.1 36 46 35.1 46 34V8C46 6.9 45.1 6 44 6H22L18 2Z" fill="var(--neon-gold)" />
              </svg>
            </div>
            <h2 className="drop-zone-headline">DRAG AND DROP YOUR AUDIO HERE</h2>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '18px', padding: '10px 20px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              CLICK TO BROWSE FILES
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {drafts.length > 0 && (
              <div className="job-list">
              <div className="panel-header" style={{ marginBottom: '0px' }}>
                <h3>Drafts ({drafts.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleQueueAll()} disabled={drafts.length === 0}>
                  Queue All
                </button>
              </div>
              {drafts.map((job) => (
                <DraftCard
                  key={job.id}
                  job={job}
                  presets={presets}
                  onEdit={(j) => setJobEditorSession(buildJobEditorSession('Edit Job', j, settings))}
                  onQueue={handleEnqueue}
                  onDuplicate={handleDuplicate}
                  onDelete={setPendingDeleteJob}
                />
              ))}
              </div>
            )}

            {queuedJobs.length > 0 && (
              <div>
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Queue ({queuedJobs.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleUnqueueAll()} disabled={queuedJobs.length === 0}>
                  Unqueue All
                </button>
              </div>
              <div className="job-list">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={[...queuedJobs].reverse().map(j => j.jobId)}
                    strategy={verticalListSortingStrategy}
                  >
                    {[...queuedJobs].reverse().map((runtime, index) => (
                      <SortableQueueItem
                        key={runtime.jobId}
                        runtime={runtime}
                        queue={queuedJobs} // Logical queue for index calculation
                        presets={presets}
                        index={queuedJobs.length - 1 - index} // Logical index
                        onUnqueue={handleUnqueue}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
              </div>
            )}

            {trainingJobs.length > 0 && (
              <div>
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Training ({trainingJobs.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleClearFinished()} disabled={trainingJobs.every((runtime) => isActiveRuntime(runtime.status))}>
                  Clear Finished
                </button>
              </div>
              <div className="job-list">
                {trainingJobs.map((runtime) => {
                  return (
                    <RuntimeCard
                      key={runtime.jobId}
                      runtime={runtime}
                      presets={presets}
                      nowMs={nowMs}
                      isExpanded={expandedJobs[runtime.jobId] === true}
                      isLogsVisible={openLogs[runtime.jobId] === true}
                      terminalLog={logContents[runtime.jobId] || ''}
                      isLoadingLog={loadingLogJobId === runtime.jobId}
                      onToggleExpanded={toggleExpanded}
                      onToggleLogs={(entry) => toggleLogs(entry.jobId)}
                      onCancel={handleCancel}
                      onForceStop={handleForceStop}
                      onRetry={handleRetry}
                      onOpenFolder={async (jobId) => { await window.namBot.jobs.openResultFolder(jobId) }}
                      onClearFinished={handleClearItem}
                    />
                  )
                })}
              </div>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={pendingDeleteJob !== null}
        title="Delete Draft Job"
        message={pendingDeleteJob
          ? `Delete "${pendingDeleteJob.name}"? This removes the draft from NAM-BOT, but it does not delete any audio files on disk.`
          : ''}
        confirmLabel="Delete"
        onCancel={() => setPendingDeleteJob(null)}
        onConfirm={() => {
          if (!pendingDeleteJob) {
            return
          }
          void handleDeleteJob(pendingDeleteJob.id)
        }}
      />
    </div>
  )
}

function JobEditor({
  session,
  settings,
  presets,
  onSessionChange,
  onSave,
  onCancel
}: {
  session: JobEditorSession
  settings: AppSettings | null
  presets: TrainingPresetFile[]
  onSessionChange: (session: JobEditorSession) => void
  onSave: (job: JobSpec) => Promise<void> | void
  onCancel: () => void
}) {
  const { title, job, inputMode, outputRootMode, showValidationErrors } = session
  const editedJob = job
  const [defaultAudioPath, setDefaultAudioPath] = useState<string | null>(null)
  const [savingDefault, setSavingDefault] = useState(false)
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false)
  const settingsDefaultOutputRoot = settings?.defaultOutputRoot?.trim() || null
  const visiblePresets = useMemo(
    () => presets.filter((preset) => preset.visible || preset.id === editedJob.presetId),
    [editedJob.presetId, presets]
  )
  const selectedPreset = visiblePresets.find((preset) => preset.id === editedJob.presetId)
    ?? visiblePresets.find((preset) => preset.id === DEFAULT_PRESET_ID)
    ?? visiblePresets[0]
  const epochsLocked = selectedPreset?.lockedJobFields.includes('epochs') ?? false
  const latencyLocked = selectedPreset?.lockedJobFields.includes('latencySamples') ?? false

  // Auto-sync output root dir when following the output-audio directory mode.
  useEffect(() => {
    if (outputRootMode === 'output-audio' && editedJob.outputAudioPath) {
      const dir = getDirname(editedJob.outputAudioPath)
      if (dir !== editedJob.outputRootDir) {
        onSessionChange({
          ...session,
          job: { ...editedJob, outputRootDir: dir }
        })
      }
    }
  }, [editedJob, onSessionChange, outputRootMode, session])

  useEffect(() => {
    if (outputRootMode === 'settings-default') {
      if (settingsDefaultOutputRoot && editedJob.outputRootDir !== settingsDefaultOutputRoot) {
        onSessionChange({
          ...session,
          job: {
            ...editedJob,
            outputRootDir: settingsDefaultOutputRoot,
            outputRootDirIsDefault: false
          }
        })
        return
      }

      if (!settingsDefaultOutputRoot) {
        onSessionChange({
          ...session,
          outputRootMode: 'output-audio',
          job: {
            ...editedJob,
            outputRootDirIsDefault: true,
            outputRootDir: editedJob.outputAudioPath ? getDirname(editedJob.outputAudioPath) : ''
          }
        })
      }
    }
  }, [editedJob, onSessionChange, outputRootMode, session, settingsDefaultOutputRoot])

  useEffect(() => {
    window.namBot.jobs.getDefaultInputAudioPath().then((p) => {
      const path = p as string | null
      setDefaultAudioPath(path)
      // If mode is default and path has been resolved, fill it in
      if (session.inputMode === 'default' && path && editedJob.inputAudioPath !== path) {
        onSessionChange({
          ...session,
          job: { ...editedJob, inputAudioPath: path, inputAudioIsDefault: true }
        })
      }
    })
  }, [editedJob, onSessionChange, session])

  const handleInputModeChange = async (mode: JobInputAudioMode) => {
    if (mode === 'default') {
      const path = defaultAudioPath || (await window.namBot.jobs.getDefaultInputAudioPath() as string | null)
      onSessionChange({
        ...session,
        inputMode: mode,
        job: { ...editedJob, inputAudioPath: path || '', inputAudioIsDefault: true }
      })
    } else {
      onSessionChange({
        ...session,
        inputMode: mode,
        job: { ...editedJob, inputAudioPath: '', inputAudioIsDefault: false }
      })
    }
  }

  const handleSaveDefaultAudio = async () => {
    setSavingDefault(true)
    try {
      await window.namBot.jobs.saveDefaultAudioTo()
    } finally {
      setSavingDefault(false)
    }
  }

  const isNameValid = editedJob.name.trim().length > 0
  const isInputValid = editedJob.inputAudioPath.trim().length > 0
  const isOutputValid = editedJob.outputAudioPath.trim().length > 0
  const isRootDirValid = editedJob.outputRootDir.trim().length > 0
  const isValid = isNameValid && isInputValid && isOutputValid && isRootDirValid
  const isDirty = session.initialSnapshot !== serializeJobEditorSession(session)
  const canSave = isDirty && isValid

  const performSave = async (): Promise<void> => {
    if (!isValid) {
      onSessionChange({
        ...session,
        showValidationErrors: true
      })
      return Promise.resolve()
    }
    if (editedJob.presetId) {
      window.localStorage.setItem(LAST_USED_PRESET_STORAGE_KEY, editedJob.presetId)
    }
    window.localStorage.setItem(
      LAST_APPEND_PRESET_NAME_STORAGE_KEY,
      editedJob.appendPresetToModelFileName ? 'true' : 'false'
    )
    window.localStorage.setItem(
      LAST_APPEND_ESR_STORAGE_KEY,
      editedJob.appendEsrToModelFileName ? 'true' : 'false'
    )
    persistOutputRootPreference(outputRootMode, editedJob.outputRootDir)
    await Promise.resolve(onSave(editedJob))
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await performSave()
  }

  const updateMeta = (patch: Partial<NamEmbeddedMetadata>) => {
    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        metadata: { ...editedJob.metadata, ...patch }
      }
    })
  }

  const handleAttemptExit = (): void => {
    if (!isDirty) {
      onCancel()
      return
    }

    setIsUnsavedConfirmOpen(true)
  }

  const handleSaveAndExit = async (): Promise<void> => {
    if (!canSave) {
      return
    }

    await performSave()
    setIsUnsavedConfirmOpen(false)
  }

  return (
    <div className="layout-main">
      <div className="panel">
        <div className="panel-header">
          <h3>{title}</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="submit"
              form={JOB_EDITOR_FORM_ID}
              className={`btn btn-sm ${canSave ? 'btn-green' : 'btn-secondary'}`}
              disabled={!canSave}
            >
              Save Job
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleAttemptExit}>
              Cancel
            </button>
          </div>
        </div>

        <form id={JOB_EDITOR_FORM_ID} onSubmit={handleSubmit}>

          {/* ── Job Name ── */}
          <div className="form-group">
            <label className="form-label" htmlFor="job-name">
              Job Name {showValidationErrors && !isNameValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
            </label>
            <input
              id="job-name"
              type="text"
              className={`form-input${showValidationErrors && !isNameValid ? ' input-error' : ''}`}
              style={showValidationErrors && !isNameValid ? { borderColor: 'var(--neon-magenta)' } : {}}
              value={editedJob.name}
              onChange={(e) => onSessionChange({
                ...session,
                job: { ...editedJob, name: e.target.value }
              })}
            />
          </div>

          {/* ── Input Audio ── */}
          <div className="form-group">
            <label className="form-label">
              Input Audio (Training Signal) {showValidationErrors && !isInputValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
            </label>

            {/* Toggle buttons */}
            <div className="toggle-group" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'default' ? 'btn-green' : 'btn-secondary'}`}
                onClick={() => handleInputModeChange('default')}
              >
                Default
              </button>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'custom' ? 'btn-blue' : 'btn-secondary'}`}
                onClick={() => handleInputModeChange('custom')}
              >
                Custom
              </button>
              {inputMode === 'default' && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={handleSaveDefaultAudio}
                  disabled={savingDefault}
                  title="Save the bundled v3_0_0.wav training signal to your system"
                >
                  {savingDefault ? 'Saving...' : 'Save Default to Disk'}
                </button>
              )}
            </div>

            <FilePickerRow
              id="input-audio-path"
              value={editedJob.inputAudioPath}
              displayValue={getBasename(editedJob.inputAudioPath)}
              onChange={(val) => onSessionChange({
                ...session,
                job: { ...editedJob, inputAudioPath: val }
              })}
              placeholder="C:\path\to\v3_0_0.wav"
              disabled={inputMode === 'default'}
              onBrowse={() => window.namBot.jobs.chooseAudioFile() as Promise<string | null>}
              error={showValidationErrors && !isInputValid}
            />
            {inputMode === 'default' && (
              <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                Using the bundled NAM v3 standard training signal. Switch to "Custom" to point to your own file.
              </p>
            )}
          </div>

          {/* ── Output Audio ── */}
          <div className="form-group">
            <label className="form-label" htmlFor="output-audio-path">
              Output Audio (Re-amped Signal) {showValidationErrors && !isOutputValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
            </label>
            <FilePickerRow
              id="output-audio-path"
              value={editedJob.outputAudioPath}
              displayValue={getBasename(editedJob.outputAudioPath)}
              onChange={(val) => onSessionChange({
                ...session,
                job: { ...editedJob, outputAudioPath: val }
              })}
              placeholder="C:\path\to\reamped.wav"
              onBrowse={() => window.namBot.jobs.chooseAudioFile() as Promise<string | null>}
              error={showValidationErrors && !isOutputValid}
            />
          </div>

          {/* ── Output Root Dir ── */}
          <div className="form-group">
            <label className="form-label" htmlFor="output-root-dir">
              Output Root Directory {showValidationErrors && !isRootDirValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
            </label>

            {/* Toggle buttons */}
            <div className="toggle-group" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className={`btn btn-sm ${outputRootMode === 'settings-default' ? 'btn-green' : 'btn-secondary'}`}
                onClick={() => {
                  if (!settingsDefaultOutputRoot) {
                    return
                  }
                  onSessionChange({
                    ...session,
                    outputRootMode: 'settings-default',
                    job: {
                      ...editedJob,
                      outputRootDirIsDefault: false,
                      outputRootDir: settingsDefaultOutputRoot
                    }
                  })
                }}
                disabled={!settingsDefaultOutputRoot}
                title={
                  settingsDefaultOutputRoot
                    ? `Use Settings > Default Model Output Root (${settingsDefaultOutputRoot})`
                    : 'Set Settings > Default Model Output Root to enable this option'
                }
              >
                Settings Default
              </button>
              <button
                type="button"
                className={`btn btn-sm ${outputRootMode === 'output-audio' ? 'btn-blue' : 'btn-secondary'}`}
                onClick={() => {
                  const dir = getDirname(editedJob.outputAudioPath)
                  onSessionChange({
                    ...session,
                    outputRootMode: 'output-audio',
                    job: {
                      ...editedJob,
                      outputRootDirIsDefault: true,
                      outputRootDir: dir
                    }
                  })
                }}
              >
                Training Output File Folder
              </button>
              <button
                type="button"
                className={`btn btn-sm ${outputRootMode === 'custom' ? 'btn-blue' : 'btn-secondary'}`}
                onClick={() => {
                  onSessionChange({
                    ...session,
                    outputRootMode: 'custom',
                    job: { ...editedJob, outputRootDirIsDefault: false }
                  })
                }}
              >
                Custom Folder
              </button>
            </div>

            <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '0', marginBottom: '10px' }}>
              Uses the Settings default first when configured. Otherwise it can follow the training output file folder, or you can lock this draft to a custom folder.
            </p>

            <FilePickerRow
              id="output-root-dir"
              value={editedJob.outputRootDir}
              onChange={(val) => onSessionChange({
                ...session,
                job: { ...editedJob, outputRootDir: val }
              })}
              placeholder="C:\Users\...\NAM\outputs"
              disabled={outputRootMode !== 'custom'}
              onBrowse={() => window.namBot.settings.chooseDirectory() as Promise<string | null>}
              error={showValidationErrors && !isRootDirValid}
            />

            <div style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--border-dim)', borderRadius: '8px', background: 'rgba(5, 17, 24, 0.45)' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Final Model Filename
              </p>
              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--text-steel)', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={editedJob.appendPresetToModelFileName}
                    onChange={(event) => {
                      window.localStorage.setItem(
                        LAST_APPEND_PRESET_NAME_STORAGE_KEY,
                        event.target.checked ? 'true' : 'false'
                      )
                      onSessionChange({
                        ...session,
                        job: {
                          ...editedJob,
                          appendPresetToModelFileName: event.target.checked
                        }
                      })
                    }}
                  />
                  <span>Append preset name</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px', color: 'var(--text-steel)', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={editedJob.appendEsrToModelFileName}
                    onChange={(event) => {
                      window.localStorage.setItem(
                        LAST_APPEND_ESR_STORAGE_KEY,
                        event.target.checked ? 'true' : 'false'
                      )
                      onSessionChange({
                        ...session,
                        job: {
                          ...editedJob,
                          appendEsrToModelFileName: event.target.checked
                        }
                      })
                    }}
                  />
                  <span>Append final ESR</span>
                </label>
              </div>
            </div>
          </div>

          {/* ── Training Settings ── */}
          <div style={{ borderTop: '2px solid var(--border-dim)', marginTop: '16px', paddingTop: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginBottom: '12px' }}>
              Training Settings
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="preset-select">Preset</label>
                <select
                  id="preset-select"
                  className="form-select"
                  value={selectedPreset?.id || ''}
                  onChange={(e) => {
                    const nextPreset = presets.find((preset) => preset.id === e.target.value)
                    if (!nextPreset) {
                      return
                    }
                    onSessionChange({
                      ...session,
                      job: {
                        ...editedJob,
                        presetId: nextPreset.id,
                        trainingOverrides: {
                          ...editedJob.trainingOverrides,
                          epochs: editedJob.trainingOverrides.epochs ?? nextPreset.values.epochs
                        }
                      }
                    })
                  }}
                >
                  {visiblePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {formatPresetNameWithRewardTag(preset)}
                    </option>
                  ))}
                </select>
                {selectedPreset && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                    {selectedPreset.values.modelFamily} / {selectedPreset.values.architectureSize}. {selectedPreset.description}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="epochs">Epochs</label>
                <input
                  id="epochs"
                  type="number"
                  className="form-input"
                  value={editedJob.trainingOverrides?.epochs || selectedPreset?.values.epochs || 100}
                  disabled={epochsLocked}
                  onChange={(e) => onSessionChange({
                    ...session,
                    job: {
                      ...editedJob,
                      trainingOverrides: {
                        ...editedJob.trainingOverrides,
                        epochs: Math.max(1, parseInt(e.target.value, 10) || selectedPreset?.values.epochs || 100)
                      }
                    }
                  })}
                />
                {epochsLocked && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                    This preset locks epoch count through its expert learning config.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="latency-samples">Latency / Delay (samples)</label>
                <input
                  id="latency-samples"
                  type="number"
                  className="form-input"
                  value={editedJob.trainingOverrides?.latencySamples ?? 0}
                  disabled={latencyLocked}
                  onChange={(e) => onSessionChange({
                    ...session,
                    job: {
                      ...editedJob,
                      trainingOverrides: {
                        ...editedJob.trainingOverrides,
                        latencySamples: parseInt(e.target.value, 10) || 0
                      }
                    }
                  })}
                />
                <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                  This writes to `data.common.delay` for `nam-full`. Use `0` only if the files are already aligned.
                </p>
                {latencyLocked && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                    This preset locks delay through its expert data config.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── NAM Embedded Metadata ── */}
          <div style={{ borderTop: '2px solid var(--border-dim)', marginTop: '16px', paddingTop: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-arcade)', color: 'var(--neon-cyan)', marginBottom: '4px' }}>
              NAM Metadata
            </h4>
            <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginBottom: '16px' }}>
              These fields are written back into the final `.nam` file after `nam-full` finishes.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="meta-name">Model Name</label>
                <input
                  id="meta-name"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.name || ''}
                  placeholder="e.g. My Plexi"
                  onChange={(e) => updateMeta({ name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-modeled-by">Modeled By</label>
                <input
                  id="meta-modeled-by"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.modeledBy || ''}
                  placeholder="Your name or handle"
                  onChange={(e) => updateMeta({ modeledBy: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-make">Gear Make</label>
                <input
                  id="meta-gear-make"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.gearMake || ''}
                  placeholder="e.g. Marshall"
                  onChange={(e) => updateMeta({ gearMake: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-model">Gear Model</label>
                <input
                  id="meta-gear-model"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.gearModel || ''}
                  placeholder="e.g. JCM800"
                  onChange={(e) => updateMeta({ gearModel: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-gear-type">Gear Type</label>
                <select
                  id="meta-gear-type"
                  className="form-select"
                  value={editedJob.metadata?.gearType || ''}
                  onChange={(e) => updateMeta({ gearType: e.target.value as NamGearType | '' })}
                >
                  <option value="">— Select —</option>
                  {NAM_GEAR_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-tone-type">Tone Type</label>
                <select
                  id="meta-tone-type"
                  className="form-select"
                  value={editedJob.metadata?.toneType || ''}
                  onChange={(e) => updateMeta({ toneType: e.target.value as NamToneType | '' })}
                >
                  <option value="">— Select —</option>
                  {NAM_TONE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-input-dbu">Send Level (dBu)</label>
                <input
                  id="meta-input-dbu"
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={editedJob.metadata?.inputLevelDbu ?? ''}
                  placeholder="e.g. +4"
                  onChange={(e) => updateMeta({ inputLevelDbu: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="meta-output-dbu">Return Level (dBu)</label>
                <input
                  id="meta-output-dbu"
                  type="number"
                  step="0.1"
                  className="form-input"
                  value={editedJob.metadata?.outputLevelDbu ?? ''}
                  placeholder="e.g. -10"
                  onChange={(e) => updateMeta({ outputLevelDbu: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="submit"
              className={`btn ${canSave ? 'btn-green' : 'btn-secondary'}`}
              disabled={!canSave}
            >
              Save Job
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleAttemptExit}>
              Cancel
            </button>
            {showValidationErrors && !isValid && (
              <span style={{ color: 'var(--neon-magenta)', fontSize: '13px', fontWeight: 'bold' }}>
                Please fill in all required fields to save.
              </span>
            )}
          </div>
        </form>
      </div>
      <ConfirmDialog
        isOpen={isUnsavedConfirmOpen}
        title="Discard Unsaved Job Changes?"
        message="This job has unsaved edits. Save it now, keep editing, or discard your changes."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        alternateLabel={canSave ? 'Save Job' : undefined}
        alternateClassName="btn btn-green"
        onConfirm={() => {
          setIsUnsavedConfirmOpen(false)
          onCancel()
        }}
        onAlternate={() => void handleSaveAndExit()}
        onCancel={() => setIsUnsavedConfirmOpen(false)}
      />
    </div>
  )
}
