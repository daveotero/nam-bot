import { useState, useEffect, useRef } from 'react'
import { useAppStore, AppSettings, BackendValidationSummary } from '../../state/store'
import ConfirmDialog from '../../components/ConfirmDialog'

interface CheckResultProps {
  result: BackendValidationSummary['condaReachable'] | BackendValidationSummary['environmentReachable'] | BackendValidationSummary['pythonReachable'] | BackendValidationSummary['namInstalled'] | BackendValidationSummary['namFullAvailable']
}

function CheckResult({ result }: CheckResultProps) {
  return (
    <div style={{ 
      padding: '12px', 
      marginBottom: '8px',
      border: `2px solid ${result.ok ? 'var(--neon-green)' : 'var(--neon-magenta)'}`,
      backgroundColor: 'var(--bg-void)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ 
          color: result.ok ? 'var(--neon-green)' : 'var(--neon-magenta)',
          fontSize: '20px'
        }}>
          {result.ok ? '✓' : '✗'}
        </span>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: 'var(--text-ash)' }}>
          {result.title}
        </span>
      </div>
      <p style={{ marginTop: '4px', color: 'var(--text-steel)', fontSize: '14px' }}>
        {result.message}
      </p>
      {result.suggestion && (
        <p style={{ marginTop: '4px', color: 'var(--neon-cyan)', fontSize: '12px' }}>
          {result.suggestion}
        </p>
      )}
    </div>
  )
}

export default function Settings() {
  const {
    settings,
    validation,
    condaDiscovery,
    isSettingsSaving,
    isBackendValidationLoading,
    settingsSaveError,
    validationError,
    loadSettings,
    saveSettings,
    validateBackend,
    detectConda
  } = useAppStore()
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null)
  const [useCustomCondaPath, setUseCustomCondaPath] = useState(false)
  const saveTimerRef = useRef<number | null>(null)
  const latestSettingsRef = useRef<AppSettings | null>(null)
  const persistedSettingsRef = useRef<AppSettings | null>(null)

  useEffect(() => {
    void loadSettings()
    void detectConda()
  }, [detectConda, loadSettings])

  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings)
      setUseCustomCondaPath(
        Boolean(settings.condaExecutablePath && (settings.condaExecutablePath.includes('\\') || settings.condaExecutablePath.includes('/')))
      )
    }
  }, [settings, localSettings])

  useEffect(() => {
    latestSettingsRef.current = localSettings
    persistedSettingsRef.current = settings
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!localSettings || !settings || JSON.stringify(localSettings) === JSON.stringify(settings)) {
      return
    }

    const settingsSnapshot = localSettings
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveSettings(settingsSnapshot).catch(() => undefined)
    }, 500)
  }, [localSettings, settings, saveSettings])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }
    const latestSettings = latestSettingsRef.current
    const persistedSettings = persistedSettingsRef.current
    if (latestSettings && JSON.stringify(latestSettings) !== JSON.stringify(persistedSettings)) {
      void saveSettings(latestSettings).catch(() => undefined)
    }
  }, [saveSettings])

  const handleSave = async (): Promise<boolean> => {
    if (!localSettings) {
      return false
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    try {
      await saveSettings(localSettings)
      return true
    } catch {
      return false
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (localSettings && JSON.stringify(localSettings) !== JSON.stringify(settings)) {
      const saved = await handleSave()
      if (!saved) {
        return
      }
    }
    await validateBackend()
  }

  const chooseCondaPath = async () => {
    const path = await window.namBot.settings.chooseCondaPath()
    if (path && localSettings) {
      setLocalSettings({ ...localSettings, condaExecutablePath: path })
    }
  }

  const chooseDirectory = async (field: 'defaultOutputRoot' | 'defaultWorkspaceRoot') => {
    const path = await window.namBot.settings.chooseDirectory()
    if (path && localSettings) {
      setLocalSettings({ ...localSettings, [field]: path })
    }
  }

  if (!localSettings) {
    return (
      <div className="layout-main">
        <div className="panel">
          <p className="processing-text" style={{ color: 'var(--text-steel)' }}>Loading</p>
        </div>
      </div>
    )
  }

  const usingPathConda: boolean = Boolean(condaDiscovery?.isOnPath && !useCustomCondaPath)
  const displayedCondaPath: string = usingPathConda
    ? (condaDiscovery?.resolvedPath || localSettings.condaExecutablePath || (window.namBot.platform === 'win32' ? 'conda.exe' : 'conda'))
    : (localSettings.condaExecutablePath || '')
  const hasUnsavedChanges = JSON.stringify(localSettings) !== JSON.stringify(settings)
  const isBackendBusy = isSettingsSaving || isBackendValidationLoading

  return (
    <div className="layout-main">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Settings</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: settingsSaveError ? 'var(--neon-magenta)' : 'var(--text-steel)', fontFamily: 'var(--font-arcade)' }}>
              {settingsSaveError ? `Save failed: ${settingsSaveError}` : isSettingsSaving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
            </span>
            <button
              type="button"
              className={`btn btn-sm ${hasUnsavedChanges ? 'btn-green' : 'btn-secondary'}`}
              disabled={!hasUnsavedChanges || isBackendBusy}
              onClick={() => void handleSave()}
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Backend Configuration</h3>
        </div>

        <div className="form-group">
          <label className="form-label">Conda Executable Path</label>
          {condaDiscovery?.isOnPath && (
            <div className="toggle-group" style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className={`btn btn-sm ${!useCustomCondaPath ? 'btn-green' : 'btn-secondary'}`}
                onClick={() => {
                  setUseCustomCondaPath(false)
                  setLocalSettings({ ...localSettings, condaExecutablePath: window.namBot.platform === 'win32' ? 'conda.exe' : 'conda' })
                }}
              >
                Use PATH
              </button>
              <button
                type="button"
                className={`btn btn-sm ${useCustomCondaPath ? 'btn-blue' : 'btn-secondary'}`}
                onClick={() => {
                  setUseCustomCondaPath(true)
                }}
              >
                Custom Path
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              value={displayedCondaPath}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, condaExecutablePath: e.target.value || null })
              }}
              placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\miniconda3\\Scripts\\conda.exe' : '/opt/homebrew/bin/conda'}
              disabled={usingPathConda}
            />
            <button className="btn btn-secondary" onClick={chooseCondaPath} disabled={usingPathConda}>
              Browse
            </button>
          </div>
          {usingPathConda && condaDiscovery?.resolvedPath && (
            <p style={{ marginTop: '6px', color: 'var(--text-steel)', fontSize: '12px' }}>
              Using Conda from PATH: {condaDiscovery.resolvedPath}
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Backend Mode</label>
          <select
            className="form-select"
            value={localSettings.backendMode}
            onChange={(e) => {
              setLocalSettings({ ...localSettings, backendMode: e.target.value as AppSettings['backendMode'] })
            }}
          >
            <option value="conda-name">Conda Environment Name</option>
            <option value="conda-prefix">Conda Environment Prefix</option>
            <option value="direct-python">Direct Python Path</option>
          </select>
        </div>

        {localSettings.backendMode === 'conda-name' && (
          <div className="form-group">
            <label className="form-label">Environment Name</label>
            <input
              type="text"
              className="form-input"
              value={localSettings.environmentName || ''}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, environmentName: e.target.value || null })
              }}
              placeholder="nam"
            />
          </div>
        )}

        {localSettings.backendMode === 'conda-prefix' && (
          <div className="form-group">
            <label className="form-label">Environment Prefix Path</label>
            <input
              type="text"
              className="form-input"
              value={localSettings.environmentPrefixPath || ''}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, environmentPrefixPath: e.target.value || null })
              }}
              placeholder="C:\Users\...\miniconda3\envs\nam"
            />
          </div>
        )}

        {localSettings.backendMode === 'direct-python' && (
          <div className="form-group">
            <label className="form-label">Python Executable Path</label>
            <input
              type="text"
              className="form-input"
              value={localSettings.pythonExecutablePath || ''}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, pythonExecutablePath: e.target.value || null })
              }}
              placeholder={window.namBot.platform === 'win32' ? 'C:\\Users\\...\\python.exe' : '/usr/bin/python3'}
            />
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <button 
            className={`btn btn-green ${isBackendBusy ? 'processing-text' : ''}`}
            onClick={handleValidate} 
            disabled={isBackendBusy}
          >
            {isBackendValidationLoading ? 'Validating' : (!hasUnsavedChanges && validation?.overallOk ? '✓ Backend Ready' : 'Validate Backend')}
          </button>
          {validationError && (
            <p style={{ marginTop: '8px', color: 'var(--neon-magenta)', fontSize: '13px' }}>
              Validation failed: {validationError}
            </p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Output Configuration</h3>
        </div>

        <div className="form-group">
          <label className="form-label">Default Model Output Root</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              value={localSettings.defaultOutputRoot || ''}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, defaultOutputRoot: e.target.value || null })
              }}
              placeholder="C:\Users\...\NAM\outputs"
            />
            <button className="btn btn-secondary" onClick={() => chooseDirectory('defaultOutputRoot')}>
              Browse
            </button>
          </div>
          <p style={{ marginTop: '6px', color: 'var(--text-steel)', fontSize: '12px' }}>
            New drafts use this folder first for trained model output unless you switch the output-root mode in the job editor.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Workspace Root</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              value={localSettings.defaultWorkspaceRoot || ''}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, defaultWorkspaceRoot: e.target.value || null })
              }}
              placeholder="C:\Users\...\nam-bot\workspaces"
            />
            <button className="btn btn-secondary" onClick={() => chooseDirectory('defaultWorkspaceRoot')}>
              Browse
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>User Information</h3>
        </div>

        <div className="form-group">
          <label className="form-label">Default Author Name</label>
          <input
            type="text"
            className="form-input"
            value={localSettings.defaultAuthorName || ''}
            onChange={(e) => {
              setLocalSettings({ ...localSettings, defaultAuthorName: e.target.value })
            }}
            placeholder="Your Name (e.g., ToneMaster)"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Default Author URL</label>
          <input
            type="text"
            className="form-input"
            value={localSettings.defaultAuthorUrl || ''}
            onChange={(e) => {
              setLocalSettings({ ...localSettings, defaultAuthorUrl: e.target.value })
            }}
            placeholder="https://social.link/user or Tone 3000 profile"
          />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h3>Application Settings</h3>
        </div>

        <div className="form-group">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={localSettings.autoOpenResultsFolder}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, autoOpenResultsFolder: e.target.checked })
              }}
            />
            <span className="checkmark"></span>
            <span className="label-text">Automatically open results folder after training</span>
          </label>
        </div>

        <div className="form-group">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={localSettings.persistQueueOnExit}
              onChange={(e) => {
                setLocalSettings({ ...localSettings, persistQueueOnExit: e.target.checked })
              }}
            />
            <span className="checkmark"></span>
            <span className="label-text">Persist queue on exit</span>
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Log Retention (days)</label>
          <input
            type="number"
            className="form-input"
            value={localSettings.logRetentionDays}
            onChange={(e) => {
              setLocalSettings({ ...localSettings, logRetentionDays: parseInt(e.target.value) || 30 })
            }}
            min={1}
            max={365}
            style={{ width: '100px' }}
          />
        </div>
      </div>
    </div>
  )
}
