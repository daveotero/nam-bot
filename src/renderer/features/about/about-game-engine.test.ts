import { describe, expect, it } from 'vitest'
import {
  EPOCH_RUNNER_STAGE_COUNT,
  EPOCH_RUNNER_STARTING_LIVES,
  EPOCH_RUNNER_TARGET_EPOCHS,
  GAME_WIDTH,
  GROUND_Y,
  PLAYER_HEIGHT,
  type EpochRunnerCollectible,
  type EpochRunnerInput,
  type EpochRunnerObstacle,
  type EpochRunnerState,
  advanceEpochRunner,
  createInitialEpochRunnerState,
  retryEpochRunnerStage,
  startEpochRunner,
  stepEpochRunner
} from './about-game-engine'

const stageTargets = [66, 120, 140, 160, 180]

function fixedRng(value: number): () => number {
  return () => value
}

function seededRng(seed: number): () => number {
  let currentSeed = seed

  return () => {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296
    return currentSeed / 4294967296
  }
}

function buildInput(overrides: Partial<EpochRunnerInput> = {}): EpochRunnerInput {
  return {
    jumpPressed: false,
    jumpHeld: false,
    duckPressed: false,
    duckHeld: false,
    ...overrides
  }
}

function buildOverlappingCollectible(
  id: number,
  state: EpochRunnerState,
  value: number
): EpochRunnerCollectible {
  return {
    id,
    type: value === 5 ? 'epoch-bundle' : 'epoch',
    value,
    x: state.player.x + 8,
    y: state.player.y + 10,
    width: value === 5 ? 30 : 22,
    height: value === 5 ? 30 : 22,
    bobPhase: 0
  }
}

function buildOverlappingObstacle(
  id: number,
  state: EpochRunnerState,
  type: EpochRunnerObstacle['type']
): EpochRunnerObstacle {
  if (type === 'signal-beam' || type === 'signal-tunnel') {
    return {
      id,
      type,
      x: state.player.x + 2,
      y: type === 'signal-tunnel' ? GROUND_Y - 140 : GROUND_Y - 48,
      width: type === 'signal-tunnel' ? 86 : 74,
      height: type === 'signal-tunnel' ? 118 : 22
    }
  }

  return {
    id,
    type,
    x: state.player.x + 2,
    y: GROUND_Y - 38,
    width: 34,
    height: 38
  }
}

describe('Epoch Runner engine', () => {
  it('uses 666 total epochs across the five training runs', () => {
    expect(stageTargets.reduce((total, stageTarget) => total + stageTarget, 0)).toBe(666)
    expect(EPOCH_RUNNER_TARGET_EPOCHS).toBe(666)
  })

  it('uses buffered jump input when NAM-BOT lands', () => {
    const runningState = startEpochRunner(createInitialEpochRunnerState())
    const landingState: EpochRunnerState = {
      ...runningState,
      player: {
        ...runningState.player,
        y: GROUND_Y - PLAYER_HEIGHT - 1,
        velocityY: 420,
        isGrounded: false,
        coyoteTimeMs: 0
      }
    }

    const nextState = stepEpochRunner(
      landingState,
      16,
      buildInput({ jumpPressed: true, jumpHeld: true }),
      { rng: fixedRng(0.1) }
    )

    expect(nextState.player.isGrounded).toBe(false)
    expect(nextState.player.velocityY).toBeLessThan(0)
  })

  it('allows a coyote-time jump shortly after leaving the ground', () => {
    const runningState = startEpochRunner(createInitialEpochRunnerState())
    const coyoteState: EpochRunnerState = {
      ...runningState,
      player: {
        ...runningState.player,
        y: GROUND_Y - PLAYER_HEIGHT - 4,
        velocityY: 0,
        isGrounded: false,
        coyoteTimeMs: 60
      }
    }

    const nextState = stepEpochRunner(
      coyoteState,
      16,
      buildInput({ jumpPressed: true, jumpHeld: true }),
      { rng: fixedRng(0.1) }
    )

    expect(nextState.player.velocityY).toBeLessThan(-500)
    expect(nextState.player.isGrounded).toBe(false)
  })

  it('collects +1 epochs and +5 bundles in the same frame', () => {
    const runningState = startEpochRunner(createInitialEpochRunnerState())
    const collectibleState: EpochRunnerState = {
      ...runningState,
      collectibles: [
        buildOverlappingCollectible(1, runningState, 1),
        buildOverlappingCollectible(2, runningState, 5)
      ]
    }

    const nextState = stepEpochRunner(
      collectibleState,
      0,
      buildInput(),
      { rng: fixedRng(0.1) }
    )

    expect(nextState.stageEpochs).toBe(6)
    expect(nextState.epochsCollected).toBe(6)
    expect(nextState.collectibles).toHaveLength(0)
  })

  it('advances through five stages and gates duck dash behind the Stage 2 cutscene', () => {
    let state = startEpochRunner(createInitialEpochRunnerState())
    let completedTotal = 0

    for (let stage = 1; stage <= EPOCH_RUNNER_STAGE_COUNT; stage += 1) {
      const stageTarget = stageTargets[stage - 1]
      const almostCompleteState: EpochRunnerState = {
        ...state,
        status: 'running',
        currentStage: stage,
        stageTargetEpochs: stageTarget,
        stageEpochs: stageTarget - 1,
        epochsCollected: completedTotal + stageTarget - 1,
        obstacles: [],
        collectibles: [buildOverlappingCollectible(stage, state, 1)]
      }

      const completedState = stepEpochRunner(
        almostCompleteState,
        0,
        buildInput(),
        { rng: fixedRng(0.1) }
      )

      completedTotal += stageTarget

      if (stage === 2) {
        expect(completedState.status).toBe('cutscene')
        expect(completedState.duckDashUnlocked).toBe(false)
        state = advanceEpochRunner(completedState)
        expect(state.currentStage).toBe(3)
        expect(state.duckDashUnlocked).toBe(true)
      } else if (stage < EPOCH_RUNNER_STAGE_COUNT) {
        expect(completedState.status).toBe('stage-complete')
        state = advanceEpochRunner(completedState)
        expect(state.currentStage).toBe(stage + 1)
      } else {
        expect(completedState.status).toBe('won')
        expect(completedState.epochsCollected).toBe(EPOCH_RUNNER_TARGET_EPOCHS)
      }
    }
  })

  it('completes a stage as soon as its epoch target is reached', () => {
    const runningState = startEpochRunner(createInitialEpochRunnerState())
    const almostCompleteState: EpochRunnerState = {
      ...runningState,
      stageEpochs: runningState.stageTargetEpochs - 1,
      collectibles: [buildOverlappingCollectible(1, runningState, 1)]
    }

    const completedState = stepEpochRunner(
      almostCompleteState,
      0,
      buildInput(),
      { rng: fixedRng(0.1) }
    )

    expect(completedState.status).toBe('stage-complete')
    expect(completedState.stageEpochs).toBe(runningState.stageTargetEpochs)
  })

  it('retries the current stage while lives remain and reboots after the final life', () => {
    const stageThreeState: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 3,
      stageTargetEpochs: 140,
      duckDashUnlocked: true,
      stageStartEpochs: 186,
      stageStartScore: 5000,
      epochsCollected: 193,
      stageEpochs: 7,
      score: 6200
    }
    const hazard = buildOverlappingObstacle(1, stageThreeState, 'amp-stack')

    const firstCrash = stepEpochRunner(
      { ...stageThreeState, obstacles: [hazard] },
      16,
      buildInput(),
      { rng: fixedRng(0.1) }
    )
    expect(firstCrash.status).toBe('crashed')
    expect(firstCrash.livesRemaining).toBe(EPOCH_RUNNER_STARTING_LIVES - 1)

    const retryState = retryEpochRunnerStage(firstCrash)
    expect(retryState.status).toBe('running')
    expect(retryState.currentStage).toBe(3)
    expect(retryState.epochsCollected).toBe(186)
    expect(retryState.stageEpochs).toBe(0)
    expect(retryState.score).toBe(5000)

    const secondCrash = stepEpochRunner(
      { ...retryState, obstacles: [buildOverlappingObstacle(2, retryState, 'amp-stack')] },
      16,
      buildInput(),
      { rng: fixedRng(0.1) }
    )
    const secondRetry = retryEpochRunnerStage(secondCrash)
    const finalCrash = stepEpochRunner(
      { ...secondRetry, obstacles: [buildOverlappingObstacle(3, secondRetry, 'amp-stack')] },
      16,
      buildInput(),
      { rng: fixedRng(0.1) }
    )

    expect(finalCrash.status).toBe('game-over')
    expect(finalCrash.livesRemaining).toBe(0)
    expect(finalCrash.resultHeadline).toBe('TRAINING RUN FAILED')
    expect(finalCrash.resultDetail).toContain('NAM-BOT dissolved')
  })

  it('requires duck dash to clear signal beams after the upgrade', () => {
    const runningState: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 3,
      stageTargetEpochs: 140,
      duckDashUnlocked: true
    }
    const hazard = buildOverlappingObstacle(1, runningState, 'signal-beam')

    const crashedState = stepEpochRunner(
      { ...runningState, obstacles: [hazard] },
      0,
      buildInput(),
      { rng: fixedRng(0.1) }
    )
    expect(crashedState.status).toBe('crashed')

    const duckingState = stepEpochRunner(
      { ...runningState, obstacles: [hazard] },
      16,
      buildInput({ duckPressed: true, duckHeld: true }),
      { rng: fixedRng(0.1) }
    )
    expect(duckingState.status).toBe('running')
    expect(duckingState.player.isDucking).toBe(true)
  })

  it('ends duck dash early when the dash button is released', () => {
    const runningState: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 3,
      stageTargetEpochs: 140,
      duckDashUnlocked: true
    }

    const heldDashState = stepEpochRunner(
      runningState,
      16,
      buildInput({ duckPressed: true, duckHeld: true }),
      { rng: fixedRng(0.1) }
    )
    expect(heldDashState.player.isDucking).toBe(true)
    expect(heldDashState.player.duckDashMs).toBeGreaterThan(400)

    const releasedDashState = stepEpochRunner(
      heldDashState,
      16,
      buildInput(),
      { rng: fixedRng(0.1) }
    )
    expect(releasedDashState.player.isDucking).toBe(false)
    expect(releasedDashState.player.duckDashMs).toBe(0)

    const secondDashState = stepEpochRunner(
      releasedDashState,
      16,
      buildInput({ duckPressed: true, duckHeld: true }),
      { rng: fixedRng(0.1) }
    )
    expect(secondDashState.player.isDucking).toBe(true)
    expect(secondDashState.player.duckDashMs).toBeGreaterThan(400)
  })

  it('uses Stage 4 signal tunnels as dash-only gates', () => {
    const runningState: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 4,
      stageTargetEpochs: 160,
      duckDashUnlocked: true
    }
    const tunnel = buildOverlappingObstacle(1, runningState, 'signal-tunnel')

    const jumpingState: EpochRunnerState = {
      ...runningState,
      player: {
        ...runningState.player,
        y: GROUND_Y - PLAYER_HEIGHT - 100,
        velocityY: 0,
        isGrounded: false,
        coyoteTimeMs: 0
      }
    }

    const jumpAttemptState = stepEpochRunner(
      { ...jumpingState, obstacles: [tunnel] },
      16,
      buildInput({ jumpHeld: true }),
      { rng: fixedRng(0.1) }
    )
    expect(jumpAttemptState.status).toBe('crashed')

    const dashState = stepEpochRunner(
      { ...runningState, obstacles: [tunnel] },
      16,
      buildInput({ duckPressed: true, duckHeld: true }),
      { rng: fixedRng(0.1) }
    )
    expect(dashState.status).toBe('running')
    expect(dashState.player.duckDashMs).toBeGreaterThan(400)
  })

  it('still collides with ground hazards while ducking', () => {
    const runningState: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 3,
      stageTargetEpochs: 140,
      duckDashUnlocked: true
    }
    const hazard = buildOverlappingObstacle(1, runningState, 'amp-stack')

    const nextState = stepEpochRunner(
      { ...runningState, obstacles: [hazard] },
      16,
      buildInput({ duckPressed: true, duckHeld: true }),
      { rng: fixedRng(0.1) }
    )

    expect(nextState.status).toBe('crashed')
  })

  it('keeps directed obstacle patterns safely spaced under seeded randomness', () => {
    const rng = seededRng(42)
    let state: EpochRunnerState = {
      ...startEpochRunner(createInitialEpochRunnerState()),
      currentStage: 5,
      stageTargetEpochs: 175,
      duckDashUnlocked: true,
      player: {
        ...createInitialEpochRunnerState().player,
        x: -300
      }
    }

    for (let frame = 0; frame < 900; frame += 1) {
      state = stepEpochRunner(state, 16, buildInput(), { rng })

      const visibleObstacles = state.obstacles
        .filter((obstacle) => obstacle.x > 0 && obstacle.x < GAME_WIDTH + 520)
        .sort((left, right) => left.x - right.x)

      for (let index = 1; index < visibleObstacles.length; index += 1) {
        const previousObstacle = visibleObstacles[index - 1]
        const currentObstacle = visibleObstacles[index]
        expect(currentObstacle.x - previousObstacle.x).toBeGreaterThanOrEqual(88)
      }
    }
  })
})
