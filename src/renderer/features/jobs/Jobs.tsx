import { useEffect, useMemo, useState, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
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
import { useTerminalLogs } from '../../hooks/useTerminalLogs'
import {
  DEFAULT_PRESET_ID,
  JobSpec,
  JobPackedSubmodelSelection,
  JobRuntimeState,
  JobStatus,
  JobStopMode,
  JobLatencyMode,
  NAM_GEAR_TYPE_OPTIONS,
  NAM_TONE_TYPE_OPTIONS,
  NamEmbeddedMetadata,
  NamGearType,
  NamToneType,
  PackedPresetSubmodel,
  TrainingPresetFile,
  defaultJobSpec,
  formatPackedSubmodelDisplayName,
  formatPresetArchitectureTag,
  getPackedSubmodelSelectionKey,
  getPackedSubmodelsForPreset
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
  applyStoredReusableDefaults,
  getStoredAppendEsrToModelFileNamePreference,
  createNewJobDraft,
  getStoredAppendPresetToModelFileNamePreference,
  getOutputRootModeForJob,
  getPreferredOutputRootSelection,
  LAST_APPEND_ESR_STORAGE_KEY,
  LAST_APPEND_PRESET_NAME_STORAGE_KEY,
  LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
  LAST_USED_PRESET_STORAGE_KEY,
  persistOutputRootPreference,
  persistReusableJobDefaults,
  VIRTUAL_NEW_JOB_ID
} from './jobEditorSession'
import {
  buildDraftFromFrozenJob,
  buildDraftFromTemplateForOutput
} from './jobTemplateDrafts'

const BATCH_AUDIO_FILE_EXTENSIONS = ['.wav', '.mp3', '.flac']
const SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY = 'nam-bot:skip-draft-delete-confirm'

function toPackedSubmodelSelection(submodel: PackedPresetSubmodel): JobPackedSubmodelSelection {
  return {
    submodelIndex: submodel.submodelIndex,
    submodelName: submodel.submodelName ?? null
  }
}

function withPackedSubmodelSelection(
  trainingOverrides: JobSpec['trainingOverrides'],
  packedSubmodels: JobPackedSubmodelSelection[] | undefined
): JobSpec['trainingOverrides'] {
  const { packedSubmodels: _packedSubmodels, ...remainingOverrides } = trainingOverrides
  return packedSubmodels ? { ...remainingOverrides, packedSubmodels } : remainingOverrides
}

function isBatchAudioFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return BATCH_AUDIO_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function createBatchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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
  onBatchFromTemplate: (job: JobSpec) => void
  onDelete: (job: JobSpec) => void
  isQueueing: boolean
}

function DraftCard({ job, presets, onEdit, onQueue, onDuplicate, onBatchFromTemplate, onDelete, isQueueing }: DraftCardProps) {
  const preset = presets.find(p => p.id === job.presetId)
  const presetName = preset ? formatPresetNameWithRewardTag(preset) : job.presetId || 'Unknown Preset'
  const presetTag = preset ? formatPresetArchitectureTag(preset) : 'CUSTOM'

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
            <span className="meta-label">Preset:</span> <span className="queue-status-badge queued">{presetTag}</span> {presetName}
          </div>
          {job.batchSourceName && (
            <div className="job-batch-badge" title={`Created from ${job.batchSourceName}`}>
              Batch: {job.batchSourceName}
            </div>
          )}
        </div>
      </div>
      <div className="job-actions" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <button className="btn btn-sm btn-blue" onClick={() => onEdit(job)} disabled={isQueueing}>
          Edit
        </button>
        <button className={`btn btn-sm btn-green${isQueueing ? ' processing-text' : ''}`} onClick={() => void onQueue(job.id)} disabled={isQueueing}>
          {isQueueing ? 'Queueing...' : 'Queue'}
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => void onDuplicate(job.id)} disabled={isQueueing}>
          Copy
        </button>
        <button className="btn btn-sm btn-secondary" onClick={() => onBatchFromTemplate(job)} disabled={isQueueing} title="Create a batch from this draft">
          Create Batch
        </button>
        <button className="btn btn-sm btn-orange" onClick={() => onDelete(job)} disabled={isQueueing}>
          Delete
        </button>
      </div>
    </div>
  )
}

const JOB_EDITOR_FORM_ID = 'job-editor-form'

type BatchTemplateSource =
  | { kind: 'draft'; template: JobSpec }
  | { kind: 'runtime'; template: JobSpec; runtimeId: string }

interface BatchOutputFile {
  outputAudioPath: string
  outputFileName: string
}

interface BatchEditorState {
  editorSession: JobEditorSession
  outputFiles: BatchOutputFile[]
  source: BatchTemplateSource | null
  batchId: string
}

function serializeJobEditorSession(session: JobEditorSession): string {
  return JSON.stringify({
    job: session.job,
    inputMode: session.inputMode,
    outputRootMode: session.outputRootMode
  })
}

interface SortableDraftItemProps extends DraftCardProps {
  id: string
}

function SortableDraftItem({ id, ...props }: SortableDraftItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    position: 'relative' as const,
    zIndex: isDragging ? 1000 : 1
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DraftCard {...props} />
    </div>
  )
}

interface SortableQueueItemProps {
  runtime: JobRuntimeState
  queue: JobRuntimeState[]
  presets: TrainingPresetFile[]
  index: number
  onUnqueue: (jobId: string) => Promise<void>
  onBatchFromRuntime: (runtime: JobRuntimeState) => void
}

function SortableQueueItem({ runtime, queue, presets, index, onUnqueue, onBatchFromRuntime }: SortableQueueItemProps) {
  const preset = presets.find(p => p.id === runtime.frozenJob.presetId)
  const presetName = preset?.name || runtime.frozenJob.presetId || 'Unknown'
  const presetTag = preset ? formatPresetArchitectureTag(preset) : 'CUSTOM'
  const headline = runtime.status === 'validating'
    ? 'Validating job before queue'
    : index === 0
      ? `Next to train - 1 of ${queue.length}`
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
                  <span><span className="queue-status-badge queued">{presetTag}</span> {presetName}</span>
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
          <button className="btn btn-sm btn-secondary" onClick={() => onBatchFromRuntime(runtime)}>Create Batch</button>
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

  useEffect(() => {
    const active = queue.some(r => r.status === 'preparing' || r.status === 'running' || r.status === 'stopping')
    setIsTraining(active)
  }, [queue, setIsTraining])
  const [isDragOver, setIsDragOver] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({})
  const { logContents, loadingLogIds, loadTerminalLog, clearTerminalLog } = useTerminalLogs()
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [pendingDeleteJob, setPendingDeleteJob] = useState<JobSpec | null>(null)
  const [skipDraftDeleteConfirm, setSkipDraftDeleteConfirm] = useState(false)
  const [queueingDraftIds, setQueueingDraftIds] = useState<Set<string>>(() => new Set())
  const [batchEditorState, setBatchEditorState] = useState<BatchEditorState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const batchFileInputRef = useRef<HTMLInputElement>(null)
  const batchTemplateRef = useRef<BatchTemplateSource | null>(null)
  const queueingDraftIdsRef = useRef<Set<string>>(new Set())

  const loadData = async () => {
    await loadJobs()
  }

  const markDraftQueueing = (jobId: string): boolean => {
    if (queueingDraftIdsRef.current.has(jobId)) {
      return false
    }

    queueingDraftIdsRef.current.add(jobId)
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
    return true
  }

  const clearDraftQueueing = (jobId: string): void => {
    queueingDraftIdsRef.current.delete(jobId)
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const setManyDraftsQueueing = (jobIds: string[]): void => {
    for (const jobId of jobIds) {
      queueingDraftIdsRef.current.add(jobId)
    }
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const clearManyDraftsQueueing = (jobIds: string[]): void => {
    for (const jobId of jobIds) {
      queueingDraftIdsRef.current.delete(jobId)
    }
    setQueueingDraftIds(new Set(queueingDraftIdsRef.current))
  }

  const buildBatchOutputFiles = (files: File[]): BatchOutputFile[] => files.map((file) => ({
    outputAudioPath: window.namBot.jobs.getPathForFile(file) || file.name,
    outputFileName: file.name
  }))

  const openBatchEditor = async (files: File[], source: BatchTemplateSource | null): Promise<void> => {
    const audioFiles = files.filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      return
    }

    const outputFiles = buildBatchOutputFiles(audioFiles)
    const firstOutput = outputFiles[0]
    const firstOutputStem = filenameWithoutExt(firstOutput.outputFileName || firstOutput.outputAudioPath).trim() || 'Batch Training'
    const template = source?.template ?? createNewJobDraft({ presets, settings })
    const outputRootSelection = getPreferredOutputRootSelection(settings, firstOutput.outputAudioPath)
    const outputRootMode = source
      ? getOutputRootModeForJob(template, settings)
      : outputRootSelection.mode
    const outputRootFollowsAudio = outputRootMode === 'output-audio'
    const batchTemplate: JobSpec = {
      ...(JSON.parse(JSON.stringify(template)) as JobSpec),
      name: source ? template.name : firstOutputStem,
      outputAudioPath: firstOutput.outputAudioPath,
      outputRootDir: outputRootFollowsAudio
        ? getDirname(firstOutput.outputAudioPath)
        : source
          ? template.outputRootDir
          : outputRootSelection.outputRootDir,
      outputRootDirIsDefault: outputRootFollowsAudio,
      metadata: {
        ...template.metadata,
        name: ''
      },
      batchId: undefined,
      batchSourceName: undefined
    }

    setBatchEditorState({
      editorSession: buildJobEditorSession(`Batch Training (${outputFiles.length} files)`, batchTemplate, settings),
      outputFiles,
      source,
      batchId: createBatchId()
    })
  }

  useEffect(() => {
    void loadPresets()
    void loadData()
  }, [loadPresets, loadJobs])

  const hasActiveRuntimeClock = queue.some(
    (runtime) => runtime.status === 'preparing' || runtime.status === 'running' || runtime.status === 'stopping'
  )
  useEffect(() => {
    if (!hasActiveRuntimeClock) {
      return
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [hasActiveRuntimeClock])

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
        void loadTerminalLog(jobId)
      })
    }, 1500)

    return () => window.clearInterval(interval)
  }, [loadTerminalLog, openLogs])

  const handleCreateJob = () => {
    setJobEditorSession(buildJobEditorSession('New Job', createNewJobDraft({ presets, settings }), settings))
  }

  const handleDropFiles = async (files: FileList) => {
    setIsDragOver(false)
    const audioFiles = Array.from(files).filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      return
    }

    if (audioFiles.length > 1) {
      await openBatchEditor(audioFiles, null)
      return
    }

    const defaultInputRef = await window.namBot.jobs.getDefaultInputAudioPath() as string | null
    const visiblePresets = presets.filter((preset) => preset.visible)
    const storedPresetId = window.localStorage.getItem(LAST_USED_PRESET_STORAGE_KEY)
    const appendPresetToModelFileName = getStoredAppendPresetToModelFileNamePreference()
    const appendEsrToModelFileName = getStoredAppendEsrToModelFileNamePreference()
    const copyFinalModelToOutputAudioFolder = window.localStorage.getItem(LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY) === 'true'
    const fallbackPreset = visiblePresets.find((preset) => preset.id === DEFAULT_PRESET_ID)
      ?? visiblePresets.find((preset) => preset.id === storedPresetId)
      ?? visiblePresets[0]
    const createdJobs: JobSpec[] = []

    for (const file of audioFiles) {
      const filePath = window.namBot.jobs.getPathForFile(file) || file.name
      const outputStem = filenameWithoutExt(file.name)
      const preferredOutputRootSelection = getPreferredOutputRootSelection(settings, filePath)
      const draftInput = applyStoredReusableDefaults({
        ...defaultJobSpec,
        name: outputStem,
        presetId: fallbackPreset?.id ?? DEFAULT_PRESET_ID,
        appendPresetToModelFileName,
        appendEsrToModelFileName,
        copyFinalModelToOutputAudioFolder,
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
          name: outputStem
        }
      }, settings)
      const newJob = await window.namBot.jobs.createDraft(draftInput) as JobSpec
      createdJobs.push(newJob)
    }

    if (createdJobs.length > 0) {
      setDrafts((prev) => [...prev, ...createdJobs])
    }
  }

  const handleBatchFromTemplate = (job: JobSpec): void => {
    batchTemplateRef.current = {
      kind: 'draft',
      template: job
    }
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = ''
      batchFileInputRef.current.click()
    }
  }

  const handleUseRuntimeAsTemplate = (runtime: JobRuntimeState): void => {
    batchTemplateRef.current = {
      kind: 'runtime',
      template: runtime.frozenJob,
      runtimeId: runtime.jobId
    }
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = ''
      batchFileInputRef.current.click()
    }
  }

  const handleCreateDraftFromRuntime = async (runtime: JobRuntimeState): Promise<void> => {
    const newJob = await window.namBot.jobs.createDraft(buildDraftFromFrozenJob(runtime.frozenJob)) as JobSpec
    setDrafts((prev) => [...prev, newJob])
  }

  const handleBatchFilesSelected = async (files: FileList | null): Promise<void> => {
    const source = batchTemplateRef.current
    batchTemplateRef.current = null

    if (!source || !files) {
      return
    }

    const audioFiles = Array.from(files).filter(isBatchAudioFile)
    if (audioFiles.length === 0) {
      return
    }

    await openBatchEditor(audioFiles, source)
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

  const handleSaveBatch = async (job: JobSpec): Promise<void> => {
    if (!batchEditorState) {
      return
    }

    const batchId = batchEditorState.batchId
    const batchSourceName = job.name.trim() || 'Batch Training'
    const sharedMetadataName = job.metadata.name?.trim() || ''
    const template: JobSpec = {
      ...job,
      batchId,
      batchSourceName,
      metadata: {
        ...job.metadata,
        name: sharedMetadataName
      }
    }

    const draftInputs = batchEditorState.outputFiles.map((outputFile) => (
      buildDraftFromTemplateForOutput({
        template,
        outputAudioPath: outputFile.outputAudioPath,
        outputFileName: outputFile.outputFileName,
        batchId,
        batchSourceName,
        useSharedMetadataName: sharedMetadataName.length > 0
      })
    ))

    await window.namBot.jobs.createDraftBatch({
      batchId,
      batchSourceName,
      drafts: draftInputs,
      source: batchEditorState.source?.kind === 'draft'
        ? { kind: 'draft', id: batchEditorState.source.template.id }
        : batchEditorState.source?.kind === 'runtime'
          ? { kind: 'runtime', id: batchEditorState.source.runtimeId }
          : null
    })

    setBatchEditorState(null)
    await loadData()
  }

  const handleDeleteJob = async (jobId: string) => {
    await window.namBot.jobs.deleteDraft(jobId)
    setDrafts((current) => current.filter((draft) => draft.id !== jobId))
    setPendingDeleteJob(null)
    setSkipDraftDeleteConfirm(false)
    if (jobEditorSession?.job.id === jobId) {
      clearJobEditorSession()
    }
  }

  const handleRequestDeleteJob = (job: JobSpec): void => {
    if (window.localStorage.getItem(SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY) === 'true') {
      void handleDeleteJob(job.id)
      return
    }

    setSkipDraftDeleteConfirm(false)
    setPendingDeleteJob(job)
  }

  const handleEnqueue = async (jobId: string) => {
    if (!markDraftQueueing(jobId)) {
      return
    }

    const job = drafts.find(d => d.id === jobId)
    if (job && (!job.name.trim() || !job.inputAudioPath.trim() || !job.outputAudioPath.trim() || !job.outputRootDir.trim())) {
      clearDraftQueueing(jobId)
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
    } finally {
      clearDraftQueueing(jobId)
    }
  }

  const handleQueueAll = async () => {
    if (drafts.length === 0 || queueingDraftIdsRef.current.size > 0) {
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
    const validDraftIds = validDrafts.map((draft) => draft.id)
    setManyDraftsQueueing(validDraftIds)

    try {
      await window.namBot.jobs.enqueueMany(validDraftIds)
      await loadData()
      if (skippedCount > 0) {
        setQueueError(`Queued ${validDrafts.length} jobs. ${skippedCount} jobs were skipped because they are missing required fields.`)
      } else {
        setQueueError(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setQueueError(`Queue failed: ${message}`)
    } finally {
      clearManyDraftsQueueing(validDraftIds)
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

  const handleDraftDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const visualDrafts = [...drafts].reverse()
      const oldIndex = visualDrafts.findIndex((draft) => draft.id === active.id)
      const newIndex = visualDrafts.findIndex((draft) => draft.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedVisualDrafts = arrayMove(visualDrafts, oldIndex, newIndex)
        const nextLogicalDrafts = [...updatedVisualDrafts].reverse()
        setDrafts(nextLogicalDrafts)
        await window.namBot.jobs.reorderDrafts(nextLogicalDrafts.map((draft) => draft.id))
      }
    }
  }

  const handleQueueDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const queuedJobs = queue.filter((runtime) => runtime.status === 'queued' || runtime.status === 'validating')
      const reversedQueued = [...queuedJobs].reverse()
      const oldIndex = reversedQueued.findIndex((j) => j.jobId === active.id)
      const newIndex = reversedQueued.findIndex((j) => j.jobId === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const updatedReversed = arrayMove(reversedQueued, oldIndex, newIndex)
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
    clearTerminalLog(jobId)
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
  const visualDrafts = [...drafts].reverse()
  const trainingJobs = [...queue.filter((runtime) => isActiveRuntime(runtime.status))]
    .sort((left, right) => Date.parse(right.startedAt || right.queuedAt || '0') - Date.parse(left.startedAt || left.queuedAt || '0'))
  const finishedJobs = [...queue.filter((runtime) => isFinishedTraining(runtime))]
    .sort((left, right) => {
      return Date.parse(right.finishedAt || right.startedAt || right.queuedAt || '0') - Date.parse(left.finishedAt || left.startedAt || left.queuedAt || '0')
    })

  const isEmpty = drafts.length === 0 && queue.length === 0
  const isAnyDraftQueueing = queueingDraftIds.size > 0

  if (batchEditorState) {
    return (
      <JobEditor
        session={batchEditorState.editorSession}
        settings={settings}
        presets={presets}
        onSessionChange={(editorSession) => setBatchEditorState({ ...batchEditorState, editorSession })}
        onSave={handleSaveBatch}
        onCancel={() => setBatchEditorState(null)}
        batchOutputFiles={batchEditorState.outputFiles}
        saveLabel="Create Batch"
        allowSaveWithoutChanges
      />
    )
  }

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
        <input
          type="file"
          ref={batchFileInputRef}
          multiple
          accept=".wav,.mp3,.flac"
          style={{ display: 'none' }}
          onChange={(event) => {
            void handleBatchFilesSelected(event.target.files)
            event.target.value = ''
          }}
        />

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
              accept=".wav,.mp3,.flac"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) void handleDropFiles(e.target.files)
                e.target.value = ''
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
                <button className={`btn btn-sm btn-secondary${isAnyDraftQueueing ? ' processing-text' : ''}`} onClick={() => void handleQueueAll()} disabled={drafts.length === 0 || isAnyDraftQueueing}>
                  {isAnyDraftQueueing ? 'Queueing...' : 'Queue All'}
                </button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDraftDragEnd}
              >
                <SortableContext
                  items={visualDrafts.map((job) => job.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visualDrafts.map((job) => (
                    <SortableDraftItem
                      key={job.id}
                      id={job.id}
                      job={job}
                      presets={presets}
                      onEdit={(j) => setJobEditorSession(buildJobEditorSession('Edit Job', j, settings))}
                      onQueue={handleEnqueue}
                      onDuplicate={handleDuplicate}
                      onBatchFromTemplate={handleBatchFromTemplate}
                      onDelete={handleRequestDeleteJob}
                      isQueueing={queueingDraftIds.has(job.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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
                  onDragEnd={handleQueueDragEnd}
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
                        onBatchFromRuntime={handleUseRuntimeAsTemplate}
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
                      isLoadingLog={loadingLogIds.has(runtime.jobId)}
                      onToggleExpanded={toggleExpanded}
                      onToggleLogs={(entry) => toggleLogs(entry.jobId)}
                      onCancel={handleCancel}
                      onForceStop={handleForceStop}
                      onCreateDraftFromRuntime={handleCreateDraftFromRuntime}
                      onUseRuntimeAsTemplate={handleUseRuntimeAsTemplate}
                      onOpenFolder={async (jobId) => { await window.namBot.jobs.openResultFolder(jobId) }}
                      onOpenArtifact={async (jobId, target) => { await window.namBot.jobs.openArtifact(jobId, target) }}
                      onClearFinished={handleClearItem}
                    />
                  )
                })}
              </div>
              </div>
            )}

            {finishedJobs.length > 0 && (
              <div>
              <div className="panel-header" style={{ marginBottom: '12px' }}>
                <h3>Finished ({finishedJobs.length})</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => void handleClearFinished()}>
                  Clear Finished
                </button>
              </div>
              <div className="job-list">
                {finishedJobs.map((runtime) => {
                  return (
                    <RuntimeCard
                      key={runtime.jobId}
                      runtime={runtime}
                      presets={presets}
                      nowMs={nowMs}
                      isExpanded={expandedJobs[runtime.jobId] === true}
                      isLogsVisible={openLogs[runtime.jobId] === true}
                      terminalLog={logContents[runtime.jobId] || ''}
                      isLoadingLog={loadingLogIds.has(runtime.jobId)}
                      onToggleExpanded={toggleExpanded}
                      onToggleLogs={(entry) => toggleLogs(entry.jobId)}
                      onCancel={handleCancel}
                      onForceStop={handleForceStop}
                      onCreateDraftFromRuntime={handleCreateDraftFromRuntime}
                      onUseRuntimeAsTemplate={handleUseRuntimeAsTemplate}
                      onOpenFolder={async (jobId) => { await window.namBot.jobs.openResultFolder(jobId) }}
                      onOpenArtifact={async (jobId, target) => { await window.namBot.jobs.openArtifact(jobId, target) }}
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
        checkboxLabel="Don't show this again"
        checkboxChecked={skipDraftDeleteConfirm}
        onCheckboxChange={setSkipDraftDeleteConfirm}
        onCancel={() => {
          setSkipDraftDeleteConfirm(false)
          setPendingDeleteJob(null)
        }}
        onConfirm={() => {
          if (!pendingDeleteJob) {
            return
          }
          if (skipDraftDeleteConfirm) {
            window.localStorage.setItem(SKIP_DRAFT_DELETE_CONFIRM_STORAGE_KEY, 'true')
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
  onCancel,
  batchOutputFiles,
  saveLabel = 'Save Job',
  allowSaveWithoutChanges = false
}: {
  session: JobEditorSession
  settings: AppSettings | null
  presets: TrainingPresetFile[]
  onSessionChange: (session: JobEditorSession) => void
  onSave: (job: JobSpec) => Promise<void> | void
  onCancel: () => void
  batchOutputFiles?: BatchOutputFile[]
  saveLabel?: string
  allowSaveWithoutChanges?: boolean
}) {
  const { title, job, inputMode, outputRootMode, showValidationErrors } = session
  const editedJob = job
  const isBatchMode = !!batchOutputFiles && batchOutputFiles.length > 0
  const [defaultAudioPath, setDefaultAudioPath] = useState<string | null>(null)
  const [savingDefault, setSavingDefault] = useState(false)
  const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const saveInFlightRef = useRef(false)
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
  const latencyMode = editedJob.trainingOverrides?.latencyMode ?? 'manual'
  const latencyInputDisabled = latencyLocked || latencyMode === 'auto'
  const packedSubmodelOptions = useMemo(
    () => selectedPreset ? getPackedSubmodelsForPreset(selectedPreset) : [],
    [selectedPreset]
  )
  const showPackedSubmodelSelector = packedSubmodelOptions.length >= 3
  const effectivePackedSubmodels = showPackedSubmodelSelector
    ? (editedJob.trainingOverrides.packedSubmodels ?? packedSubmodelOptions.map(toPackedSubmodelSelection))
    : []
  const selectedPackedSubmodelKeys = new Set(effectivePackedSubmodels.map(getPackedSubmodelSelectionKey))
  const selectedPackedSubmodelOptionCount = packedSubmodelOptions.filter((submodel) => (
    selectedPackedSubmodelKeys.has(getPackedSubmodelSelectionKey(toPackedSubmodelSelection(submodel)))
  )).length
  const isPackedSubmodelSelectionValid = !showPackedSubmodelSelector || selectedPackedSubmodelOptionCount > 0

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

  const outputFilenameStem = filenameWithoutExt(editedJob.outputAudioPath).trim()

  const isNameValid = editedJob.name.trim().length > 0
  const isInputValid = editedJob.inputAudioPath.trim().length > 0
  const isOutputValid = editedJob.outputAudioPath.trim().length > 0
  const isRootDirValid = editedJob.outputRootDir.trim().length > 0
  const isValid = isNameValid && isInputValid && isOutputValid && isRootDirValid && isPackedSubmodelSelectionValid
  const isDirty = session.initialSnapshot !== serializeJobEditorSession(session)
  const canSave = (allowSaveWithoutChanges || isDirty) && isValid

  const performSave = async (): Promise<void> => {
    if (saveInFlightRef.current) {
      return
    }
    if (!isValid) {
      onSessionChange({
        ...session,
        showValidationErrors: true
      })
      return Promise.resolve()
    }
    saveInFlightRef.current = true
    setIsSaving(true)
    try {
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
      window.localStorage.setItem(
        LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
        editedJob.copyFinalModelToOutputAudioFolder ? 'true' : 'false'
      )
      persistOutputRootPreference(outputRootMode, editedJob.outputRootDir)
      persistReusableJobDefaults(editedJob, inputMode)
      await Promise.resolve(onSave(editedJob))
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
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

  const updatePackedSubmodelSelection = (submodel: PackedPresetSubmodel, checked: boolean): void => {
    const submodelSelection = toPackedSubmodelSelection(submodel)
    const submodelKey = getPackedSubmodelSelectionKey(submodelSelection)
    const currentSelections = effectivePackedSubmodels
    const currentKeys = new Set(currentSelections.map(getPackedSubmodelSelectionKey))

    if (checked) {
      currentKeys.add(submodelKey)
    } else if (selectedPackedSubmodelOptionCount > 1) {
      currentKeys.delete(submodelKey)
    } else {
      return
    }

    const nextSelections = packedSubmodelOptions
      .map(toPackedSubmodelSelection)
      .filter((selection) => currentKeys.has(getPackedSubmodelSelectionKey(selection)))
    const packedOverride = nextSelections.length === packedSubmodelOptions.length ? undefined : nextSelections

    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        trainingOverrides: withPackedSubmodelSelection(editedJob.trainingOverrides, packedOverride)
      }
    })
  }

  const updateLatencyMode = (nextMode: JobLatencyMode): void => {
    onSessionChange({
      ...session,
      job: {
        ...editedJob,
        trainingOverrides: {
          ...editedJob.trainingOverrides,
          latencyMode: nextMode,
          latencySamples: editedJob.trainingOverrides?.latencySamples ?? 0
        }
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
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving...' : saveLabel}
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={handleAttemptExit} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>

        <form id={JOB_EDITOR_FORM_ID} onSubmit={handleSubmit}>

          {/* ── Job Name ── */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="job-name">
                {isBatchMode ? 'Batch Label' : 'Job Name'} {showValidationErrors && !isNameValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
              </label>
              {!isBatchMode && (
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  disabled={!outputFilenameStem}
                  onClick={() => onSessionChange({
                    ...session,
                    job: { ...editedJob, name: outputFilenameStem }
                  })}
                >
                  Use Output Filename
                </button>
              )}
            </div>
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
            {isBatchMode && (
              <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                Generated drafts still use each output filename as their job name. This label identifies the batch.
              </p>
            )}
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
              {isBatchMode ? `Output Audio Files (${batchOutputFiles?.length ?? 0})` : 'Output Audio (Re-amped Signal)'} {showValidationErrors && !isOutputValid && <span style={{ color: 'var(--neon-magenta)', fontSize: '12px' }}>(Required)</span>}
            </label>
            {isBatchMode ? (
              <div className="batch-output-list">
                {batchOutputFiles?.map((outputFile, index) => (
                  <div className="batch-output-item" key={`${outputFile.outputAudioPath}:${index}`}>
                    <span className="batch-output-index">{index + 1}</span>
                    <span className="batch-output-name">{getBasename(outputFile.outputAudioPath) || outputFile.outputFileName}</span>
                    <span className="batch-output-path">{outputFile.outputAudioPath}</span>
                  </div>
                ))}
              </div>
            ) : (
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
            )}
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
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '30px', color: 'var(--text-steel)', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={editedJob.copyFinalModelToOutputAudioFolder}
                  onChange={(event) => {
                    window.localStorage.setItem(
                      LAST_COPY_FINAL_MODEL_TO_OUTPUT_AUDIO_FOLDER_STORAGE_KEY,
                      event.target.checked ? 'true' : 'false'
                    )
                    onSessionChange({
                      ...session,
                      job: {
                        ...editedJob,
                        copyFinalModelToOutputAudioFolder: event.target.checked
                      }
                    })
                  }}
                />
                <span>Copy model to output audio folder</span>
              </label>
            </div>

            <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '0', marginBottom: '10px' }}>
              Uses the Settings default first when configured. Otherwise it can follow the training output file folder, or you can lock this draft to a custom folder. The copy option adds a convenient `.nam` copy next to the selected output audio file.
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

            <div className="training-settings-grid">
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
                    const currentEpochs = editedJob.trainingOverrides.epochs
                    const shouldUseNextPresetEpochs = currentEpochs == null || currentEpochs === selectedPreset?.values.epochs
                    const nextTrainingOverrides = withPackedSubmodelSelection({
                      ...editedJob.trainingOverrides,
                      epochs: shouldUseNextPresetEpochs ? nextPreset.values.epochs : currentEpochs
                    }, undefined)
                    onSessionChange({
                      ...session,
                      job: {
                        ...editedJob,
                        presetId: nextPreset.id,
                        trainingOverrides: nextTrainingOverrides
                      }
                    })
                  }}
                >
                  {visiblePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      [{formatPresetArchitectureTag(preset)}] {formatPresetNameWithRewardTag(preset)}
                    </option>
                  ))}
                </select>
                {selectedPreset && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                    <span className="queue-status-badge queued">{formatPresetArchitectureTag(selectedPreset)}</span> {selectedPreset.values.modelFamily} / {selectedPreset.values.architectureSize}. {selectedPreset.description}
                  </p>
                )}
              </div>

              {showPackedSubmodelSelector && (
                <div className="form-group packed-submodel-panel">
                  <label className="form-label">Advanced Packed Submodels</label>
                  <p className="packed-submodel-helper">
                    Choose the packed tiers written into this run's <code>model.json</code>. All tiers are selected by default.
                  </p>
                  <div className="packed-submodel-options">
                    {packedSubmodelOptions.map((submodel) => {
                      const selection = toPackedSubmodelSelection(submodel)
                      const selectionKey = getPackedSubmodelSelectionKey(selection)
                      const isSelected = selectedPackedSubmodelKeys.has(selectionKey)
                      const isLastSelected = isSelected && selectedPackedSubmodelOptionCount === 1

                      return (
                        <label key={selectionKey} className="packed-submodel-option">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isLastSelected}
                            onChange={(event) => updatePackedSubmodelSelection(submodel, event.target.checked)}
                          />
                          <span>{formatPackedSubmodelDisplayName(submodel)}</span>
                        </label>
                      )
                    })}
                  </div>
                  {!isPackedSubmodelSelectionValid && (
                    <p style={{ color: 'var(--neon-magenta)', fontSize: '12px', marginBottom: 0 }}>
                      Select at least one packed submodel.
                    </p>
                  )}
                </div>
              )}

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
                <div className="toggle-group" style={{ marginBottom: '10px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${latencyMode === 'manual' ? 'btn-blue' : 'btn-secondary'}`}
                    disabled={latencyLocked}
                    onClick={() => updateLatencyMode('manual')}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${latencyMode === 'auto' ? 'btn-green' : 'btn-secondary'}`}
                    disabled={latencyLocked}
                    onClick={() => updateLatencyMode('auto')}
                  >
                    Auto-align
                  </button>
                </div>
                <input
                  id="latency-samples"
                  type="number"
                  className="form-input"
                  value={editedJob.trainingOverrides?.latencySamples ?? 0}
                  disabled={latencyInputDisabled}
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
                  Manual writes this exact value to `data.common.delay`; `0` means no latency correction. Auto-align runs NAM's standard-input analyzer before training and fills in the calculated delay.
                </p>
                {latencyLocked && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px' }}>
                    This preset locks delay through its expert data config, so NAM-BOT will not run auto-align for this job.
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
                <div className="form-label-row">
                  <label className="form-label" htmlFor="meta-name">{isBatchMode ? 'Shared Model Name' : 'Model Name'}</label>
                  {!isBatchMode && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      disabled={!outputFilenameStem}
                      onClick={() => updateMeta({ name: outputFilenameStem })}
                    >
                      Use Output Filename
                    </button>
                  )}
                </div>
                <input
                  id="meta-name"
                  type="text"
                  className="form-input"
                  value={editedJob.metadata?.name || ''}
                  placeholder={isBatchMode ? 'Leave blank to use each output filename' : 'e.g. My Plexi'}
                  onChange={(e) => updateMeta({ name: e.target.value })}
                />
                {isBatchMode && (
                  <p style={{ color: 'var(--text-steel)', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                    Leave blank to embed each output filename as that model's metadata name. Type a value here only if every generated model should share the same embedded name.
                  </p>
                )}
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
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving...' : saveLabel}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleAttemptExit} disabled={isSaving}>
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
        alternateLabel={canSave ? saveLabel : undefined}
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
