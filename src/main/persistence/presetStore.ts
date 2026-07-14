import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import log from 'electron-log/main'
import {
  DEFAULT_PRESET_ID,
  TrainingPresetFile,
  builtInTrainingPresets,
  createTrainingPreset,
  getPresetArchitectureVersion,
  normalizeTrainingPreset,
  slugifyPresetName
} from '../types/jobs'
import { atomicWriteJsonSync } from './atomicFile'

const userPresetsPath = join(app.getPath('userData'), 'presets')

export function getUserPresetsPath(): string {
  return userPresetsPath
}
const epochRunnerRewardPresetId = 'epoch-runner-reward'
const epochRunnerRewardPresetName = 'Converged Night Run'

function isEpochRunnerRewardPreset(preset: TrainingPresetFile): boolean {
  return preset.id === epochRunnerRewardPresetId
    || preset.name === epochRunnerRewardPresetName
    || preset.description.includes('Epoch Runner')
}

function buildStoredPresetOrigin(preset: TrainingPresetFile): TrainingPresetFile['origin'] {
  return {
    app: preset.origin?.app?.trim() || 'NAM-BOT',
    version: preset.origin?.version?.trim() || app.getVersion()
  }
}

function ensurePresetDirectory(): void {
  if (!existsSync(userPresetsPath)) {
    mkdirSync(userPresetsPath, { recursive: true })
  }
}

function getPresetFilePath(presetId: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(presetId)) {
    throw new Error('Preset ID must contain only letters, numbers, underscores, and hyphens.')
  }

  const targetPath = resolve(userPresetsPath, `${presetId}.json`)
  const presetRoot = `${resolve(userPresetsPath)}${sep}`
  if (!targetPath.startsWith(presetRoot) || basename(targetPath) !== `${presetId}.json`) {
    throw new Error('Preset path must remain inside the preset directory.')
  }
  return targetPath
}

function listUserPresetsInternal(): TrainingPresetFile[] {
  ensurePresetDirectory()
  const presets: TrainingPresetFile[] = []

  for (const entry of readdirSync(userPresetsPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      continue
    }

    const fullPath = join(userPresetsPath, entry.name)
    try {
      const raw = JSON.parse(readFileSync(fullPath, 'utf-8')) as unknown
      const preset = normalizeTrainingPreset(raw)
      if (preset.builtIn) {
        continue
      }
      presets.push({ ...preset, builtIn: false, readOnly: false })
    } catch (error) {
      log.warn('Failed to read preset file:', fullPath, error)
    }
  }

  return presets
}

function getPresetSortBucket(preset: TrainingPresetFile): number {
  if (preset.builtIn) {
    return 2
  }

  if (isEpochRunnerRewardPreset(preset)) {
    return 1
  }

  return 0
}

function getPresetArchitectureSortBucket(preset: TrainingPresetFile): number {
  switch (getPresetArchitectureVersion(preset)) {
    case 'a2':
      return 0
    case 'a1':
      return 1
    case 'custom':
    default:
      return 2
  }
}

function sortTrainingPresets(presets: TrainingPresetFile[]): TrainingPresetFile[] {
  const builtInOrder = new Map<string, number>(
    builtInTrainingPresets.map((preset, index) => [preset.id, index])
  )

  return [...presets].sort((left, right) => {
    const leftArchitectureBucket = getPresetArchitectureSortBucket(left)
    const rightArchitectureBucket = getPresetArchitectureSortBucket(right)

    if (leftArchitectureBucket !== rightArchitectureBucket) {
      return leftArchitectureBucket - rightArchitectureBucket
    }

    const leftBucket = getPresetSortBucket(left)
    const rightBucket = getPresetSortBucket(right)

    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket
    }

    if (leftBucket === 2) {
      return (builtInOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (builtInOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    }

    return left.name.localeCompare(right.name)
  })
}

export function listTrainingPresets(): TrainingPresetFile[] {
  return sortTrainingPresets([...listUserPresetsInternal(), ...builtInTrainingPresets])
}

export function getTrainingPresetById(presetId: string | null | undefined): TrainingPresetFile {
  const allPresets = listTrainingPresets()
  return allPresets.find((entry) => entry.id === presetId)
    ?? allPresets.find((entry) => entry.id === DEFAULT_PRESET_ID)
    ?? builtInTrainingPresets[0]
}

export function saveTrainingPreset(input: unknown): TrainingPresetFile {
  const preset = normalizeTrainingPreset(input)
  if (preset.builtIn || preset.readOnly) {
    throw new Error('Built-in presets are read-only.')
  }

  ensurePresetDirectory()
  let presetId = preset.id
  const targetPath = getPresetFilePath(presetId)
  if (existsSync(targetPath)) {
    try {
      const existing = normalizeTrainingPreset(JSON.parse(readFileSync(targetPath, 'utf-8')) as unknown)
      const isSamePreset = existing.id === preset.id && existing.createdAt === preset.createdAt
      if (!isSamePreset) {
        presetId = `${slugifyPresetName(preset.name)}-${Date.now()}`
      }
    } catch {
      presetId = `${slugifyPresetName(preset.name)}-${Date.now()}`
    }
  }

  const normalized = createTrainingPreset({
    ...preset,
    id: presetId,
    builtIn: false,
    readOnly: false,
    visible: true,
    updatedAt: new Date().toISOString(),
    origin: buildStoredPresetOrigin(preset)
  })
  atomicWriteJsonSync(getPresetFilePath(normalized.id), normalized)
  return normalized
}

export function deleteTrainingPreset(presetId: string): void {
  const builtIn = builtInTrainingPresets.some((preset) => preset.id === presetId)
  if (builtIn) {
    return
  }

  const target = getPresetFilePath(presetId)
  if (existsSync(target)) {
    unlinkSync(target)
  }
}
