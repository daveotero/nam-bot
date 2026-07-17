import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log/main'
import { AppSettings, BackendMode, defaultSettings } from '../types'
import { atomicWriteJsonSync, readJsonWithBackupSync } from './atomicFile'

const userDataPath = app.getPath('userData')
const settingsPath = join(userDataPath, 'settings.json')

function normalizeNullableString(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' ? value : fallback
}

function normalizeBackendMode(value: unknown): BackendMode {
  return value === 'conda-prefix' ? 'conda-prefix' : 'conda-name'
}

function getSetting(input: unknown, key: keyof AppSettings): unknown {
  return typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
}

export function normalizeSettings(input: unknown): AppSettings {
  const backendMode = normalizeBackendMode(getSetting(input, 'backendMode'))
  const condaExecutablePath = normalizeNullableString(
    getSetting(input, 'condaExecutablePath'),
    defaultSettings.condaExecutablePath
  ) || defaultSettings.condaExecutablePath
  const environmentName = normalizeNullableString(
    getSetting(input, 'environmentName'),
    defaultSettings.environmentName
  )

  return {
    condaExecutablePath,
    backendMode,
    environmentName: backendMode === 'conda-name'
      ? environmentName || defaultSettings.environmentName
      : environmentName,
    environmentPrefixPath: normalizeNullableString(
      getSetting(input, 'environmentPrefixPath'),
      defaultSettings.environmentPrefixPath
    ),
    defaultOutputRoot: normalizeNullableString(
      getSetting(input, 'defaultOutputRoot'),
      defaultSettings.defaultOutputRoot
    ),
    defaultWorkspaceRoot: normalizeNullableString(
      getSetting(input, 'defaultWorkspaceRoot'),
      defaultSettings.defaultWorkspaceRoot
    ),
    autoOpenResultsFolder: typeof getSetting(input, 'autoOpenResultsFolder') === 'boolean'
      ? getSetting(input, 'autoOpenResultsFolder') === true
      : defaultSettings.autoOpenResultsFolder,
    defaultAuthorName: normalizeNullableString(
      getSetting(input, 'defaultAuthorName'),
      defaultSettings.defaultAuthorName
    ) ?? defaultSettings.defaultAuthorName,
    defaultAuthorUrl: normalizeNullableString(
      getSetting(input, 'defaultAuthorUrl'),
      defaultSettings.defaultAuthorUrl
    ) ?? defaultSettings.defaultAuthorUrl
  }
}

export function loadSettings(): AppSettings {
  try {
    if (existsSync(settingsPath)) {
      const parsed: unknown = readJsonWithBackupSync(settingsPath)
      log.info('Settings loaded from:', settingsPath)
      return normalizeSettings(parsed)
    }
  } catch (error) {
    log.error('Failed to load settings:', error)
  }
  log.info('Using default settings')
  return normalizeSettings(defaultSettings)
}

export function saveSettings(settings: AppSettings): AppSettings {
  try {
    const normalizedSettings = normalizeSettings(settings)
    const dir = userDataPath
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    atomicWriteJsonSync(settingsPath, normalizedSettings)
    log.info('Settings saved to:', settingsPath)
    return normalizedSettings
  } catch (error) {
    log.error('Failed to save settings:', error)
    throw error
  }
}
