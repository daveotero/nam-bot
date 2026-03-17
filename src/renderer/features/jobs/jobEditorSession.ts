import type { AppSettings, JobEditorSession } from '../../state/store'
import {
  DEFAULT_PRESET_ID,
  type JobSpec,
  type TrainingPresetFile,
  defaultJobSpec
} from '../../state/types'

export const LAST_USED_PRESET_STORAGE_KEY = 'nam-bot:last-used-preset-id'
export const LAST_APPEND_PRESET_NAME_STORAGE_KEY = 'nam-bot:last-append-preset-name'
export const LAST_APPEND_ESR_STORAGE_KEY = 'nam-bot:last-append-esr'
export const VIRTUAL_NEW_JOB_ID = 'new-draft-virtual'

interface CreateNewJobDraftOptions {
  presets: TrainingPresetFile[]
  settings: AppSettings | null
}

export function getStoredAppendPresetToModelFileNamePreference(): boolean {
  return window.localStorage.getItem(LAST_APPEND_PRESET_NAME_STORAGE_KEY) === 'true'
}

export function getStoredAppendEsrToModelFileNamePreference(): boolean {
  return window.localStorage.getItem(LAST_APPEND_ESR_STORAGE_KEY) === 'true'
}

export function buildJobEditorSession(title: string, job: JobSpec): JobEditorSession {
  const sessionContent = {
    job,
    inputMode: job.inputAudioIsDefault ? 'default' as const : 'custom' as const,
    outputRootMode: job.outputRootDirIsDefault ? 'output-audio' as const : 'custom' as const
  }

  return {
    title,
    initialSnapshot: JSON.stringify(sessionContent),
    ...sessionContent,
    showValidationErrors: false
  }
}

export function createNewJobDraft(options: CreateNewJobDraftOptions): JobSpec {
  const visiblePresets = options.presets.filter((preset) => preset.visible)
  const storedPresetId = window.localStorage.getItem(LAST_USED_PRESET_STORAGE_KEY)
  const fallbackPreset = visiblePresets.find((preset) => preset.id === storedPresetId)
    ?? visiblePresets.find((preset) => preset.id === DEFAULT_PRESET_ID)
    ?? visiblePresets[0]

  const newJob: JobSpec = {
    ...(JSON.parse(JSON.stringify(defaultJobSpec)) as Omit<JobSpec, 'id' | 'createdAt' | 'updatedAt'>),
    id: VIRTUAL_NEW_JOB_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    presetId: fallbackPreset?.id ?? DEFAULT_PRESET_ID,
    appendPresetToModelFileName: getStoredAppendPresetToModelFileNamePreference(),
    appendEsrToModelFileName: getStoredAppendEsrToModelFileNamePreference()
  }

  if (options.settings?.defaultAuthorName) {
    newJob.metadata.modeledBy = options.settings.defaultAuthorName
  }

  if (fallbackPreset) {
    newJob.trainingOverrides.epochs = fallbackPreset.values.epochs
  }

  return newJob
}
