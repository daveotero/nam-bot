import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'test-user-data'
  }
}))

vi.mock('electron-log/main', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn()
  }
}))

import { defaultSettings } from '../types'
import { normalizeSettings } from './settingsStore'

describe('normalizeSettings', () => {
  it('migrates unsupported legacy settings to supported defaults and drops dead fields', () => {
    const normalized = normalizeSettings({
      backendMode: 'direct-python',
      pythonExecutablePath: 'C:\\Python\\python.exe',
      preferredLaunchMode: 'python-wrapper',
      persistQueueOnExit: false,
      logRetentionDays: 7
    })

    expect(normalized.backendMode).toBe('conda-name')
    expect(normalized.environmentName).toBe(defaultSettings.environmentName)
    expect(normalized).not.toHaveProperty('pythonExecutablePath')
    expect(normalized).not.toHaveProperty('preferredLaunchMode')
    expect(normalized).not.toHaveProperty('persistQueueOnExit')
    expect(normalized).not.toHaveProperty('logRetentionDays')
  })

  it('keeps valid supported settings and repairs invalid field types', () => {
    const normalized = normalizeSettings({
      backendMode: 'conda-prefix',
      environmentPrefixPath: 'C:\\envs\\nam',
      autoOpenResultsFolder: 'yes',
      defaultAuthorName: 'Dave'
    })

    expect(normalized.backendMode).toBe('conda-prefix')
    expect(normalized.environmentPrefixPath).toBe('C:\\envs\\nam')
    expect(normalized.autoOpenResultsFolder).toBe(defaultSettings.autoOpenResultsFolder)
    expect(normalized.defaultAuthorName).toBe('Dave')
  })
})
