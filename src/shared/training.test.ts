import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildJobConfigs } from '../main/config/configBuilder'
import { normalizeTrainingPreset, type JobSpec } from './training'

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nam-bot-issue-8-'))
  tempDirs.push(dir)
  return dir
}

function buildTestJobSpec(): JobSpec {
  return {
    id: 'job-issue-8',
    name: 'Issue 8 Regression',
    createdAt: '2026-03-28T00:00:00.000Z',
    updatedAt: '2026-03-28T00:00:00.000Z',
    presetId: 'legacy-custom-preset',
    appendPresetToModelFileName: false,
    appendEsrToModelFileName: false,
    inputAudioPath: 'C:\\input.wav',
    inputAudioIsDefault: false,
    outputAudioPath: 'C:\\output.wav',
    outputRootDir: 'C:\\models',
    outputRootDirIsDefault: false,
    metadata: {},
    trainingOverrides: {
      epochs: 200,
      latencySamples: 0
    },
    uiNotes: ''
  }
}

const legacyWaveNetPresetInput = {
  schemaVersion: 1,
  presetKind: 'training',
  id: 'legacy-custom-preset',
  name: 'Legacy Custom Preset',
  description: '',
  category: 'custom',
  builtIn: false,
  readOnly: false,
  visible: true,
  createdAt: '2026-03-28T00:00:00.000Z',
  updatedAt: '2026-03-28T00:00:00.000Z',
  lockedJobFields: [],
  values: {
    modelFamily: 'WaveNet',
    architectureSize: 'custom',
    epochs: 200,
    batchSize: 16,
    learningRate: 0.0032,
    learningRateDecay: 0.007,
    ny: 8192,
    fitMrstft: true
  },
  expert: {
    model: {
      head_scale: 0.99,
      layers_configs: [
        {
          gated: false,
          channels: 8,
          dilations: [1024, 256, 64, 16, 4, 1],
          head_bias: false,
          head_size: 8,
          activation: 'Tanh',
          input_size: 1,
          kernel_size: 5,
          condition_size: 1
        },
        {
          gated: false,
          channels: 8,
          dilations: [1024, 256, 64, 16, 4, 1],
          head_bias: true,
          head_size: 1,
          activation: 'Tanh',
          input_size: 8,
          kernel_size: 5,
          condition_size: 1
        }
      ]
    }
  }
} as const

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('legacy custom preset compatibility', () => {
  it('normalizes legacy flat model snippets into net.config', () => {
    const preset = normalizeTrainingPreset(legacyWaveNetPresetInput)
    const net = preset.expert.model?.net as Record<string, unknown> | undefined
    const config = net?.config as Record<string, unknown> | undefined

    expect(net?.name).toBe('WaveNet')
    expect(Array.isArray(config?.layers_configs)).toBe(true)
    expect((preset.expert.model as Record<string, unknown>).layers_configs).toBeUndefined()
  })

  it('generates model.json with the legacy custom architecture instead of the standard template', () => {
    const preset = normalizeTrainingPreset(legacyWaveNetPresetInput)
    const tempDir = createTempDir()
    const paths = buildJobConfigs(buildTestJobSpec(), tempDir, preset)
    const modelConfig = JSON.parse(readFileSync(paths.modelConfig, 'utf-8')) as {
      net?: { config?: { head_scale?: number; layers_configs?: Array<{ channels?: number; kernel_size?: number }> } }
      layers_configs?: unknown
    }

    expect(modelConfig.net?.config?.head_scale).toBe(0.99)
    expect(modelConfig.net?.config?.layers_configs).toEqual(
      legacyWaveNetPresetInput.expert.model.layers_configs
    )
    expect(modelConfig.layers_configs).toBeUndefined()
    expect(modelConfig.net?.config?.layers_configs?.[0]?.channels).toBe(8)
    expect(modelConfig.net?.config?.layers_configs?.[0]?.kernel_size).toBe(5)
  })
})
