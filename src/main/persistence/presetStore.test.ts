import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPaths = vi.hoisted(() => ({
  userDataPath: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-preset-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataPath,
    getVersion: () => '0.6.2'
  }
}))

import { createTrainingPreset } from '../../shared/training'
import { deleteTrainingPreset, saveTrainingPreset } from './presetStore'

beforeEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
  mkdirSync(mockPaths.userDataPath, { recursive: true })
})

afterEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
})

describe('preset path validation', () => {
  it('rejects traversal IDs for save and delete', () => {
    const unsafePreset = createTrainingPreset({
      id: '../settings',
      name: 'Unsafe preset'
    })

    expect(() => saveTrainingPreset(unsafePreset)).toThrow('Preset ID')
    expect(() => deleteTrainingPreset('..\\settings')).toThrow('Preset ID')
    expect(existsSync(join(mockPaths.userDataPath, 'settings.json'))).toBe(false)
  })

  it('saves a valid preset inside the preset directory', () => {
    const preset = createTrainingPreset({
      id: 'safe-preset_1',
      name: 'Safe preset'
    })

    const saved = saveTrainingPreset(preset)

    expect(saved.id).toBe('safe-preset_1')
    expect(existsSync(join(mockPaths.userDataPath, 'presets', 'safe-preset_1.json'))).toBe(true)
  })
})
