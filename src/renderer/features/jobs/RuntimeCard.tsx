import {
  JobRuntimeState,
  TrainingPresetFile
} from '../../state/types'
import { handleCardToggleKeyDown, shouldIgnoreCardToggle } from '../../utils/card-toggle'
import {
  getDisplayState,
  getStatusSentence,
  getStopActionState,
  getProgressPercent,
  getCollapsedSummaryItems,
  getPlannedEpochsLabel,
  getDetailedDeviceLabel,
  getLatestTerminalLine,
  isActiveRuntime,
  getOutputPath,
  formatEsr,
  QueueDisplayState
} from './job-helpers'

interface RuntimeCardProps {
  runtime: JobRuntimeState
  presets: TrainingPresetFile[]
  nowMs: number
  isExpanded: boolean
  isLogsVisible: boolean
  terminalLog: string
  isLoadingLog: boolean
  onToggleExpanded: (jobId: string) => void
  onToggleLogs: (runtime: JobRuntimeState) => Promise<void>
  onUnqueue?: (jobId: string) => Promise<void>
  onCancel: (jobId: string) => Promise<void>
  onForceStop: (jobId: string) => Promise<void>
  onRetry: (jobId: string) => Promise<void>
  onOpenFolder: (jobId: string) => Promise<void>
  onClearFinished?: (jobId: string) => Promise<void>
}

export function renderDisplayBadge(displayState: QueueDisplayState) {
  return (
    <span className={`queue-status-badge ${displayState.toLowerCase()}${displayState === 'Running' ? ' processing-text' : ''}`}>
      {displayState}
    </span>
  )
}

export default function RuntimeCard({
  runtime,
  presets,
  nowMs,
  isExpanded,
  isLogsVisible,
  terminalLog,
  isLoadingLog,
  onToggleExpanded,
  onToggleLogs,
  onUnqueue,
  onCancel,
  onForceStop,
  onRetry,
  onOpenFolder,
  onClearFinished
}: RuntimeCardProps) {
  const displayState = getDisplayState(runtime)
  const statusSentence = getStatusSentence(runtime)
  const stopAction = getStopActionState(runtime, nowMs)
  const progressPercent = runtime.status === 'running' || runtime.status === 'stopping' ? getProgressPercent(runtime) : null
  const hasTerminalToggle = displayState !== 'Queued'
  const outputPath = getOutputPath(runtime)
  const presetName = presets.find((preset) => preset.id === runtime.frozenJob.presetId)?.name || runtime.frozenJob.presetId || 'Unknown'
  const collapsedSummaryItems = getCollapsedSummaryItems(runtime, presetName, nowMs)

  return (
    <div
      key={runtime.jobId}
      className={`job-card queue-card queue-card-${displayState.toLowerCase()}`}
      role={hasTerminalToggle ? 'button' : undefined}
      tabIndex={hasTerminalToggle ? 0 : undefined}
      onClick={hasTerminalToggle ? (event) => {
        if (shouldIgnoreCardToggle(event.target)) {
          return
        }
        onToggleExpanded(runtime.jobId)
      } : undefined}
      onKeyDown={hasTerminalToggle ? (event) => handleCardToggleKeyDown(event, () => onToggleExpanded(runtime.jobId)) : undefined}
    >
      <div className="queue-card-summary">
        <div className="job-info queue-card-main">
          <h4>{runtime.jobName}</h4>
          <div className="queue-card-status-row">
            {renderDisplayBadge(displayState)}
            <p
              className={`queue-card-headline${displayState === 'Error' ? ' queue-card-headline-error' : ''}`}
              title={statusSentence}
            >
              {statusSentence}
            </p>
          </div>

          {collapsedSummaryItems.length > 0 && (
            <div className="queue-card-stat-row">
              {collapsedSummaryItems.map((item) => (
                <span key={`${runtime.jobId}-${item.label}`} className={`queue-card-stat${item.tone === 'error' ? ' queue-card-stat-error' : ''}`}>
                  <span className="meta-label">{item.label}</span>
                  <span>{item.value}</span>
                </span>
              ))}
            </div>
          )}

          {(runtime.status === 'running' || runtime.status === 'stopping') && progressPercent != null && (
            <div className="training-progress-group">
              <div className="training-progress-bar" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="training-progress-meta">
                <span>{`${Math.round(progressPercent)}% complete`}</span>
              </div>
            </div>
          )}
        </div>

        <div className="job-actions queue-card-actions">
          {displayState === 'Queued' && onUnqueue && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => void onUnqueue(runtime.jobId)}
            >
              Unqueue
            </button>
          )}

          {displayState === 'Running' && stopAction && (
            <button
              className="btn btn-sm btn-orange"
              onClick={() => void (stopAction.isForce ? onForceStop(runtime.jobId) : onCancel(runtime.jobId))}
              disabled={stopAction.disabled}
            >
              {stopAction.label}
            </button>
          )}

          {hasTerminalToggle && (
            <button
              className={`btn btn-sm btn-secondary${isExpanded ? ' is-toggled' : ''}`}
              onClick={() => onToggleExpanded(runtime.jobId)}
            >
              {isExpanded ? 'Hide Details' : 'Show Details'}
            </button>
          )}

          {displayState === 'Successful' && outputPath && (
            <button className="btn btn-sm btn-green" onClick={() => void onOpenFolder(runtime.jobId)}>
              Open Folder
            </button>
          )}

          {(displayState === 'Successful' || displayState === 'Error') && (
            <button className={`btn btn-sm ${displayState === 'Error' ? 'btn-gold' : 'btn-secondary'}`} onClick={() => void onRetry(runtime.jobId)}>
              {displayState === 'Successful' ? 'Re-queue' : 'Retry'}
            </button>
          )}

          {(displayState === 'Successful' || displayState === 'Error') && onClearFinished && (
            <button className="btn btn-sm btn-secondary" onClick={() => void onClearFinished(runtime.jobId)}>
              Clear
            </button>
          )}

          {hasTerminalToggle && (
            <button
              className={`btn btn-sm btn-secondary${isLogsVisible ? ' is-toggled' : ''}`}
              onClick={() => void onToggleLogs(runtime)}
              disabled={isLoadingLog}
            >
              {isLoadingLog ? 'Loading...' : isLogsVisible ? 'Hide Logs' : 'Show Logs'}
            </button>
          )}
        </div>
      </div>

      {hasTerminalToggle && isExpanded && (
        <div className="queue-card-details">
          <div className="queue-details-grid">
            <div className="queue-detail-stat">
              <span className="stat-label">Preset</span>
              <span className="stat-value">{presetName}</span>
            </div>
            <div className="queue-detail-stat">
              <span className="stat-label">Epochs</span>
              <span className="stat-value">{getPlannedEpochsLabel(runtime)}</span>
            </div>
            {(displayState === 'Running' || displayState === 'Successful') && (
              <>
                <div className="queue-detail-stat">
                  <span className="stat-label">Best ESR</span>
                  <span className="stat-value">{formatEsr(runtime.checkpointSummary?.bestValidationEsr)}</span>
                </div>
                <div className="queue-detail-stat">
                  <span className="stat-label">Checkpoints</span>
                  <span className="stat-value">{runtime.checkpointSummary?.checkpointCount ?? 0}</span>
                </div>
              </>
            )}
            <div className="queue-detail-stat">
              <span className="stat-label">Device</span>
              <span className="stat-value">{getDetailedDeviceLabel(runtime)}</span>
            </div>
          </div>
          
          <div className="queue-details-paths">
            <div className="detail-path-row">
              <span className="path-label">Workspace Log</span>
              <span className="path-value text-selectable" title={runtime.terminalLogPath || ''}>{runtime.terminalLogPath || 'Not yet available'}</span>
            </div>
            <div className="detail-path-row">
              <span className="path-label">Output Folder</span>
              <span className="path-value text-selectable" title={getOutputPath(runtime)}>{getOutputPath(runtime) || 'Waiting for output folder'}</span>
            </div>
            {runtime.publishedTerminalLogPath && (
              <div className="detail-path-row">
                <span className="path-label">Saved Run Log</span>
                <span className="path-value text-selectable" title={runtime.publishedTerminalLogPath}>{runtime.publishedTerminalLogPath}</span>
              </div>
            )}
            {runtime.publishedModelPath && (
              <div className="detail-path-row">
                <span className="path-label">Model File</span>
                <span className="path-value text-selectable" title={runtime.publishedModelPath}>{runtime.publishedModelPath}</span>
              </div>
            )}
          </div>

          {(displayState === 'Running' || displayState === 'Error') && getLatestTerminalLine(runtime) && (
            <div className="queue-details-terminal">
              <span className="terminal-label">Latest terminal line</span>
              <div className="terminal-value">{getLatestTerminalLine(runtime)}</div>
            </div>
          )}
        </div>
      )}

      {isLogsVisible && (
        <div className="queue-inline-log" data-no-card-toggle="true">
          <div className="queue-inline-log-header">
            <span>Terminal Output</span>
            {isActiveRuntime(runtime.status) && <span>Auto-refreshing while active</span>}
          </div>
          <pre className="queue-inline-log-body">{terminalLog || '[no terminal output yet]'}</pre>
        </div>
      )}
    </div>
  )
}
