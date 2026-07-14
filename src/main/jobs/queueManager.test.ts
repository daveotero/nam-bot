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

function writeNamModel(filePath: string): void {
  writeFileSync(
    filePath,
    JSON.stringify({
      version: '0.0.0',
      architecture: 'WaveNet',
      config: {},
      weights: [],
      metadata: {}
    }),
    'utf-8'
  )
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

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
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
    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
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

  it('does not publish a partial model after a failed training exit', async () => {
    const queueManager = createQueueManager()
    const outputAudioDirectory = join(mockPaths.userDataPath, 'captures')
    const outputRootDir = join(mockPaths.userDataPath, 'failed-models')
    mkdirSync(outputAudioDirectory, { recursive: true })
    mkdirSync(outputRootDir, { recursive: true })
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({
      copyFinalModelToOutputAudioFolder: true,
      outputAudioPath: join(outputAudioDirectory, 'output.wav'),
      outputRootDir
    }))

    runNamFullMock.mockImplementation(async (_settings, args, hooks) => {
      writeNamModel(join(args.outputRootDir, 'partial.nam'))
      hooks.onStarted(1234)
      hooks.onExit(1)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => undefined),
        forceKillSync: vi.fn()
      }
    })

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(existsSync(join(outputRootDir, 'partial.nam'))).toBe(true)
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
    expect(existsSync(join(outputAudioDirectory, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('does not bind a new job to a recent artifact in an older run directory', async () => {
    const queueManager = createQueueManager()
    const outputRootDir = join(mockPaths.userDataPath, 'shared-models')
    const olderRunDirectory = join(outputRootDir, '2020-01-01-00-00-00')
    mkdirSync(olderRunDirectory, { recursive: true })
    const olderModelPath = join(olderRunDirectory, 'older-model.nam')
    writeNamModel(olderModelPath)
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({ outputRootDir }))

    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
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
    expect(runtime.status).toBe('failed')
    expect(runtime.errorCategory).toBe('missing_model_artifact')
    expect(runtime.resolvedRunDirectory).toBeNull()
    expect(existsSync(olderModelPath)).toBe(true)
    expect(existsSync(join(olderRunDirectory, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('does not publish a pre-existing fresh model from a shared output root', async () => {
    const queueManager = createQueueManager()
    const outputRootDir = join(mockPaths.userDataPath, 'shared-root-models')
    mkdirSync(outputRootDir, { recursive: true })
    const existingModelPath = join(outputRootDir, 'existing-model.nam')
    writeNamModel(existingModelPath)
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    queueManager.addToQueue(buildJobSpec({ outputRootDir }))

    runNamFullMock.mockImplementation(async (_settings, _args, hooks) => {
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
    expect(runtime.status).toBe('failed')
    expect(runtime.errorCategory).toBe('missing_model_artifact')
    expect(existsSync(existingModelPath)).toBe(true)
    expect(existsSync(join(outputRootDir, 'A2 Queued Diagnostics Job.nam'))).toBe(false)
  })

  it('cancels a job while latency preparation is still running', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    })
    queueManager.addToQueue(job)
    analyzeNamLatencyMock.mockImplementation(
      async (_settings, _inputPath, _outputPath, signal: AbortSignal) =>
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(analyzeNamLatencyMock).toHaveBeenCalledTimes(1)
    })
    await queueManager.cancelJob(job.id)
    await queuePromise

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('canceled')
    expect(runtime.errorCategory).toBe('stopped_by_user')
    expect(runNamFullMock).not.toHaveBeenCalled()
    expect(queueManager.getCurrentJob()).toBeNull()
  })

  it('uses one immutable backend settings snapshot for the complete run', async () => {
    const queueManager = createQueueManager()
    queueManager.setKnownNamVersion(defaultSettings, '0.13.0')
    const job = buildJobSpec({
      outputRootDir: join(mockPaths.userDataPath, 'snapshot-models'),
      trainingOverrides: {
        latencyMode: 'auto',
        latencySamples: 0
      }
    })
    queueManager.addToQueue(job)

    let releaseLatencyAnalysis: () => void = () => undefined
    analyzeNamLatencyMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releaseLatencyAnalysis = resolve
      })
      return {
        ok: true,
        recommendedLatency: 12,
        inputVersion: '3.0.0',
        strongInputMatch: true,
        warnings: null,
        delays: [12],
        errorMessage: null,
        output: 'NAM_BOT_LATENCY_ANALYSIS={"ok":true}'
      }
    })
    runNamFullMock.mockImplementation(async (settings, args, hooks) => {
      expect(settings.environmentName).toBe(defaultSettings.environmentName)
      mkdirSync(args.outputRootDir, { recursive: true })
      writeNamModel(join(args.outputRootDir, 'model.nam'))
      hooks.onStarted(1234)
      hooks.onExit(0)
      return {
        cancel: vi.fn(),
        forceKill: vi.fn(async () => undefined),
        forceKillSync: vi.fn()
      }
    })

    const queuePromise = queueManager.startQueue()
    await vi.waitFor(() => {
      expect(analyzeNamLatencyMock).toHaveBeenCalledTimes(1)
    })
    queueManager.setSettings({
      ...defaultSettings,
      environmentName: 'different-environment'
    })
    releaseLatencyAnalysis()
    await queuePromise

    expect(runNamFullMock).toHaveBeenCalledTimes(1)
    expect(queueManager.getQueue()[0]?.status).toBe('succeeded')
  })

  it('marks workspace setup errors failed and clears the active job', async () => {
    const invalidWorkspaceRoot = join(mockPaths.userDataPath, 'workspace-file')
    writeFileSync(invalidWorkspaceRoot, 'not a directory', 'utf-8')
    const queueManager = new QueueManager()
    queueManager.setSettings({
      ...defaultSettings,
      defaultWorkspaceRoot: invalidWorkspaceRoot
    })
    queueManager.addToQueue(buildJobSpec())

    await queueManager.startQueue()

    const [runtime] = queueManager.getQueue()
    expect(runtime.status).toBe('failed')
    expect(queueManager.getCurrentJob()).toBeNull()
    expect(queueManager.isQueueProcessing()).toBe(false)
  })
})
