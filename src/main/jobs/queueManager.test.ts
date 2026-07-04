import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

const mockPaths = vi.hoisted(() => ({
  userDataPath: `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/nam-bot-queue-manager-${Date.now()}-${Math.random().toString(16).slice(2)}`
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataPath
  },
  shell: {
    openPath: vi.fn()
  }
}))

const runNamFullMock = vi.hoisted(() => vi.fn())
const inspectTorchRuntimeMock = vi.hoisted(() => vi.fn())
const analyzeNamLatencyMock = vi.hoisted(() => vi.fn())

vi.mock('../backend/adapter', () => {
  function compareVersions(left: string, right: string): number {
    const leftTokens = left.split(/[.-]/).map((token) => Number.parseInt(token, 10) || 0)
    const rightTokens = right.split(/[.-]/).map((token) => Number.parseInt(token, 10) || 0)
    const length = Math.max(leftTokens.length, rightTokens.length)

    for (let index = 0; index < length; index += 1) {
      const leftToken = leftTokens[index] ?? 0
      const rightToken = rightTokens[index] ?? 0
      if (leftToken !== rightToken) {
        return leftToken - rightToken
      }
    }

    return 0
  }

  return {
    analyzeNamLatency: analyzeNamLatencyMock,
    compareVersions,
    inspectTorchRuntime: inspectTorchRuntimeMock,
    runNamFull: runNamFullMock
  }
})

import { defaultSettings } from '../types'
import { DEFAULT_PRESET_ID, defaultJobSpec, type JobRuntimeState, type JobSpec } from '../types/jobs'
import { QueueManager } from './queueManager'

function buildJobSpec(overrides: Partial<JobSpec> = {}): JobSpec {
  const base: JobSpec = {
    ...defaultJobSpec,
    id: 'a2-queued-diagnostics-job',
    name: 'A2 Queued Diagnostics Job',
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    presetId: DEFAULT_PRESET_ID,
    inputAudioPath: `${mockPaths.userDataPath}/input.wav`,
    outputAudioPath: `${mockPaths.userDataPath}/output.wav`,
    outputRootDir: `${mockPaths.userDataPath}/models`,
    trainingOverrides: {
      ...defaultJobSpec.trainingOverrides,
      latencyMode: 'manual'
    }
  }

  return {
    ...base,
    ...overrides,
    trainingOverrides: {
      ...base.trainingOverrides,
      ...(overrides.trainingOverrides ?? {})
    }
  }
}

function createQueueManager(): QueueManager {
  const queueManager = new QueueManager()
  queueManager.setSettings(defaultSettings)
  return queueManager
}

beforeEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
  mkdirSync(mockPaths.userDataPath, { recursive: true })
  runNamFullMock.mockReset()
  inspectTorchRuntimeMock.mockReset()
  analyzeNamLatencyMock.mockReset()
  inspectTorchRuntimeMock.mockResolvedValue(null)
})

afterEach(() => {
  rmSync(mockPaths.userDataPath, { recursive: true, force: true })
})

describe('QueueManager A2 diagnostics gate', () => {
  it('allows enqueue validation while the A2 NAM version has not been confirmed', async () => {
    const queueManager = createQueueManager()

    await expect(queueManager.validateJobCanTrain(buildJobSpec())).resolves.toBeUndefined()
  })

  it('keeps a queued A2 job blocked instead of failing when diagnostics are pending', async () => {
    const queueManager = createQueueManager()
    queueManager.addToQueue(buildJobSpec())

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runNamFullMock).not.toHaveBeenCalled()
    expect(runtime.status).toBe('queued')
    expect(runtime.errorCategory).toBe('a2_diagnostics_pending')
    expect(runtime.startedAt).toBeUndefined()
    expect(runtime.finishedAt).toBeUndefined()
    expect(runtime.userMessages.at(-1)).toContain('has not confirmed the installed NAM version yet')
  })

  it('resumes a diagnostics-blocked A2 queue item after NAM version confirmation', async () => {
    const queueManager = createQueueManager()
    queueManager.addToQueue(buildJobSpec())
    await queueManager.startQueue()

    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => undefined),
        forceKillSync: vi.fn()
      }
    })

    const completedRuntime = new Promise<JobRuntimeState>((resolve) => {
      queueManager.on('jobUpdated', (runtime: JobRuntimeState) => {
        if (runtime.status === 'succeeded') {
          resolve(runtime)
        }
      })
    })
    const queueSettled = new Promise<void>((resolve) => {
      queueManager.on('queueUpdated', () => {
        if (queueManager.getQueue()[0]?.status === 'succeeded') {
          resolve()
        }
      })
    })

    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')

    await expect(completedRuntime).resolves.toMatchObject({
      status: 'succeeded',
      errorCategory: null
    })
    await queueSettled
    expect(runNamFullMock).toHaveBeenCalledTimes(1)
  })

  it('still rejects A2 queue validation when a confirmed NAM version is too old', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.12.3')

    await expect(queueManager.validateJobCanTrain(buildJobSpec())).rejects.toThrow('Installed: 0.12.3')
  })

  it('records auto-align delay in runtime details and terminal log', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    analyzeNamLatencyMock.mockResolvedValue({
      ok: true,
      recommendedLatency: 42,
      inputVersion: '3.0.0',
      strongInputMatch: true,
      warnings: {
        matchesLookahead: false,
        disagreementTooHigh: false,
        notDetected: false
      },
      delays: [42],
      errorMessage: null,
      output: 'NAM_BOT_LATENCY_ANALYSIS={"ok":true}'
    })
    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
      hooks.onStarted(1234)
      hooks.onTerminalData('training started\n')
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => undefined),
        forceKillSync: vi.fn()
      }
    })

    queueManager.addToQueue(buildJobSpec({
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    }))

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.latencyAlignment).toMatchObject({
      mode: 'auto',
      status: 'auto_applied',
      delaySamples: 42,
      inputVersion: '3.0.0'
    })
    expect(runtime.terminalLogPath).toBeTruthy()
    const terminalLog = readFileSync(runtime.terminalLogPath!, 'utf-8')
    expect(terminalLog).toContain('[NAM-BOT] Auto-aligning input/output latency with the NAM analyzer...')
    expect(terminalLog).toContain('[NAM-BOT] Auto-aligned latency using NAM input 3.0.0: 42 samples.')
    expect(terminalLog).toContain('training started')
  })

  it('copies the finalized model beside the output audio when requested', async () => {
    const queueManager = createQueueManager()
    const outputAudioDirectory = `${mockPaths.userDataPath}/captures`
    const outputRootDir = `${mockPaths.userDataPath}/models`
    mkdirSync(outputAudioDirectory, { recursive: true })
    mkdirSync(outputRootDir, { recursive: true })

    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({
      copyFinalModelToOutputAudioFolder: true,
      outputAudioPath: `${outputAudioDirectory}/output.wav`,
      outputRootDir
    }))

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeFileSync(
        `${args.outputRootDir}/model.nam`,
        JSON.stringify({
          version: '0.0.0',
          architecture: 'WaveNet',
          config: {},
          weights: [],
          metadata: {}
        }),
        'utf-8'
      )
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => undefined),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    const copiedModelPath = join(outputAudioDirectory, 'A2 Queued Diagnostics Job.nam')
    expect(runtime.status).toBe('succeeded')
    expect(runtime.publishedModelPath).toBe(copiedModelPath)
    expect(existsSync(copiedModelPath)).toBe(true)
    expect(readFileSync(copiedModelPath, 'utf-8')).toContain('WaveNet')
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(true)
  })
})
