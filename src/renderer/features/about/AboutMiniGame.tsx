import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY,
  EPOCH_RUNNER_STAGE_COUNT,
  EPOCH_RUNNER_TARGET_EPOCHS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_Y,
  PLAYER_HEIGHT,
  type EpochRunnerCollectible,
  type EpochRunnerInput,
  type EpochRunnerObstacle,
  type EpochRunnerRunStats,
  type EpochRunnerState,
  advanceEpochRunner,
  createInitialEpochRunnerState,
  retryEpochRunnerStage,
  startEpochRunner,
  stepEpochRunner
} from './about-game-engine'

interface AboutMiniGameProps {
  isRewardUnlocked: boolean
  onExit: () => void
  onUnlockReward: () => Promise<void>
}

interface OverlayConfig {
  title: string
  detail: string
  actionLabel: string
  lockedActionLabel: string
  diagnostics: string[]
}

function formatSeconds(timeMs: number): string {
  return (timeMs / 1000).toFixed(1)
}

function formatStageTimer(state: EpochRunnerState): string {
  return `${formatSeconds(state.stageTimeMs)}s`
}

function drawPixelRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): void {
  context.fillStyle = color
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
}

function drawPlayer(context: CanvasRenderingContext2D, state: EpochRunnerState, tickMs: number): void {
  const { player } = state
  const footPulse = Math.sin(tickMs / 80) > 0 ? 1 : -1

  if (player.duckDashMs > 0) {
    drawPixelRect(context, player.x - 20, player.y + 25, 24, 5, 'rgba(57,255,20,0.2)')
    drawPixelRect(context, player.x - 34, player.y + 30, 18, 4, 'rgba(0,240,255,0.18)')
  }

  if (player.isDucking) {
    drawPixelRect(context, player.x + 4, player.y + 23, 26, 13, '#93ff84')
    drawPixelRect(context, player.x + 18, player.y + 15, 12, 10, '#d9ffd1')
    drawPixelRect(context, player.x + 1, player.y + 29, 8, 6, '#93ff84')
    drawPixelRect(context, player.x + 26, player.y + 32, 10, 5, '#d9ffd1')
    drawPixelRect(context, player.x + 22, player.y + 18, 4, 4, '#001b00')
    return
  }

  drawPixelRect(context, player.x + 8, player.y + 6, 18, 26, '#93ff84')
  drawPixelRect(context, player.x + 12, player.y + 1, 10, 8, '#d9ffd1')
  drawPixelRect(context, player.x + 4, player.y + 14, 6, 10, '#93ff84')
  drawPixelRect(context, player.x + 24, player.y + 14, 6, 10, '#93ff84')
  drawPixelRect(context, player.x + 10, player.y + 31 + footPulse, 5, 10 - footPulse, '#d9ffd1')
  drawPixelRect(context, player.x + 20, player.y + 31 - footPulse, 5, 10 + footPulse, '#d9ffd1')
  drawPixelRect(context, player.x + 15, player.y + 13, 4, 4, '#001b00')
}

function drawObstacle(context: CanvasRenderingContext2D, obstacle: EpochRunnerObstacle, tickMs: number): void {
  if (obstacle.type === 'amp-stack') {
    drawPixelRect(context, obstacle.x, obstacle.y + 12, obstacle.width, obstacle.height - 12, '#39ff88')
    drawPixelRect(context, obstacle.x + 6, obstacle.y + 4, obstacle.width - 12, 10, '#a7ffce')
    drawPixelRect(context, obstacle.x + 6, obstacle.y + 22, obstacle.width - 12, 6, '#001b00')
    drawPixelRect(context, obstacle.x + 24, obstacle.y + 18, 4, 4, '#001b00')
    return
  }

  if (obstacle.type === 'cab-wall') {
    drawPixelRect(context, obstacle.x, obstacle.y, obstacle.width, obstacle.height, '#39ff88')
    drawPixelRect(context, obstacle.x + 6, obstacle.y + 6, obstacle.width - 12, obstacle.height - 12, '#001b00')
    drawPixelRect(context, obstacle.x + 10, obstacle.y + 10, obstacle.width - 20, obstacle.height - 20, '#a7ffce')
    drawPixelRect(context, obstacle.x + 16, obstacle.y + 16, obstacle.width - 32, obstacle.height - 32, '#001b00')
    return
  }

  if (obstacle.type === 'signal-beam') {
    const pulse = Math.sin(tickMs / 90) > 0 ? '#ff5b84' : '#ff003c'
    drawPixelRect(context, obstacle.x, obstacle.y + 2, obstacle.width, 6, pulse)
    drawPixelRect(context, obstacle.x + 6, obstacle.y + 12, obstacle.width - 12, 5, '#ff9bb3')
    drawPixelRect(context, obstacle.x + 2, obstacle.y - 8, 8, obstacle.height + 16, '#39ff88')
    drawPixelRect(context, obstacle.x + obstacle.width - 10, obstacle.y - 8, 8, obstacle.height + 16, '#39ff88')
    drawPixelRect(context, obstacle.x + 16, obstacle.y + 20, obstacle.width - 32, 2, 'rgba(255,255,255,0.35)')
    return
  }

  if (obstacle.type === 'signal-tunnel') {
    const pulse = Math.sin(tickMs / 82) > 0 ? '#ff5b84' : '#ff003c'
    drawPixelRect(context, obstacle.x, obstacle.y, obstacle.width, 8, pulse)
    drawPixelRect(context, obstacle.x + 6, obstacle.y + 16, obstacle.width - 12, 8, '#ff9bb3')
    drawPixelRect(context, obstacle.x + 12, obstacle.y + 32, obstacle.width - 24, 8, pulse)
    drawPixelRect(context, obstacle.x + 18, obstacle.y + 50, obstacle.width - 36, 8, '#ff9bb3')
    drawPixelRect(context, obstacle.x + 2, obstacle.y - 10, 8, obstacle.height + 18, '#39ff88')
    drawPixelRect(context, obstacle.x + obstacle.width - 10, obstacle.y - 10, 8, obstacle.height + 18, '#39ff88')
    drawPixelRect(context, obstacle.x + 16, obstacle.y + obstacle.height - 6, obstacle.width - 32, 3, 'rgba(57,255,20,0.5)')
    return
  }

  drawPixelRect(context, obstacle.x + 2, obstacle.y + 6, obstacle.width - 4, obstacle.height - 6, '#39ff88')
  drawPixelRect(context, obstacle.x + 8, obstacle.y, obstacle.width - 16, obstacle.height, '#a7ffce')
  drawPixelRect(context, obstacle.x + 12, obstacle.y + 7, obstacle.width - 24, 4, '#001b00')
}

function drawCollectible(
  context: CanvasRenderingContext2D,
  collectible: EpochRunnerCollectible
): void {
  const bobOffset = Math.sin(collectible.bobPhase) * (collectible.value === 5 ? 3 : 4)
  const x = collectible.x
  const y = collectible.y + bobOffset

  if (collectible.value === 5) {
    drawPixelRect(context, x + 8, y, 14, 30, '#ffe66b')
    drawPixelRect(context, x, y + 8, 30, 14, '#49ff95')
    drawPixelRect(context, x + 7, y + 7, 16, 16, '#001b00')
    drawPixelRect(context, x + 11, y + 10, 8, 10, '#ffe66b')
    return
  }

  drawPixelRect(context, x + 6, y, 10, 22, '#d8ffd8')
  drawPixelRect(context, x, y + 6, 22, 10, '#49ff95')
  drawPixelRect(context, x + 8, y + 8, 6, 6, '#001b00')
}

function renderGameFrame(context: CanvasRenderingContext2D, state: EpochRunnerState, tickMs: number): void {
  context.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  context.imageSmoothingEnabled = false

  const gradient = context.createLinearGradient(0, 0, 0, GAME_HEIGHT)
  gradient.addColorStop(0, '#011006')
  gradient.addColorStop(1, '#000000')
  context.fillStyle = gradient
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

  for (let row = 0; row < 14; row += 1) {
    context.fillStyle = row % 2 === 0 ? 'rgba(25,255,120,0.04)' : 'rgba(0,0,0,0)'
    context.fillRect(0, row * 20, GAME_WIDTH, 10)
  }

  const scroll = -(state.distance * 6) % 70
  context.strokeStyle = 'rgba(70, 255, 140, 0.18)'
  context.lineWidth = 1
  for (let index = -1; index < 14; index += 1) {
    const x = scroll + (index * 70)
    context.beginPath()
    context.moveTo(x, GROUND_Y - 2)
    context.lineTo(x + 30, GROUND_Y - 40)
    context.lineTo(x + 60, GROUND_Y - 2)
    context.stroke()
  }

  drawPixelRect(context, 0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, '#04260d')
  for (let index = 0; index < 26; index += 1) {
    const x = ((index * 40) + scroll * 1.2) % (GAME_WIDTH + 40)
    drawPixelRect(context, x, GROUND_Y + 8, 18, 8, 'rgba(97,255,149,0.22)')
  }

  state.collectibles.forEach((collectible) => drawCollectible(context, collectible))
  state.obstacles.forEach((obstacle) => drawObstacle(context, obstacle, tickMs))
  drawPlayer(context, state, tickMs)

  const stageProgressWidth = 180
  const stageProgress = state.stageTargetEpochs > 0 ? state.stageEpochs / state.stageTargetEpochs : 0
  drawPixelRect(context, 16, 32, stageProgressWidth, 6, 'rgba(160, 255, 200, 0.16)')
  drawPixelRect(context, 16, 32, stageProgressWidth * Math.min(1, stageProgress), 6, '#39ff88')

  context.fillStyle = 'rgba(160, 255, 200, 0.86)'
  context.font = '12px monospace'
  context.fillText(`TRAINING RUN ${state.currentStage}/${EPOCH_RUNNER_STAGE_COUNT}`, 16, 20)
  context.fillText(`SPD ${Math.round(state.speed)}`, GAME_WIDTH - 90, 20)
  context.fillText(`LIVES ${state.livesRemaining}`, GAME_WIDTH - 90, 40)
  if (state.duckDashUnlocked) {
    context.fillText('DUCK_DASH.SYS ONLINE', GAME_WIDTH - 188, 60)
  }

  if (state.status === 'ready') {
    const pulse = 0.55 + (Math.sin(tickMs / 240) * 0.25)
    context.fillStyle = `rgba(210,255,220,${pulse})`
    context.font = '20px monospace'
    context.fillText('PRESS SPACE TO START', 230, 126)
    context.font = '12px monospace'
    context.fillText(`Complete 5 training runs. Collect ${EPOCH_RUNNER_TARGET_EPOCHS} epochs. Avoid the waveform hazards.`, 150, 154)
    context.fillText('NAM-BOT has three lives before the run fully reboots.', 218, 174)
  }
}

function loadBestScore(): number {
  const raw = window.localStorage.getItem(EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function createFrameInput(
  jumpPressed: boolean,
  jumpHeld: boolean,
  duckPressed: boolean,
  duckHeld: boolean
): EpochRunnerInput {
  return {
    jumpPressed,
    jumpHeld,
    duckPressed,
    duckHeld
  }
}

function isDuckKey(key: string): boolean {
  return key === 'ArrowDown' || key.toLowerCase() === 's'
}

function getOverlayLockMs(status: EpochRunnerState['status']): number {
  if (status === 'cutscene') {
    return 2600
  }

  if (status === 'game-over') {
    return 2200
  }

  if (status === 'stage-complete' || status === 'crashed' || status === 'won') {
    return 1400
  }

  return 0
}

export default function AboutMiniGame({
  isRewardUnlocked,
  onExit,
  onUnlockReward
}: AboutMiniGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const jumpPressedRef = useRef<boolean>(false)
  const jumpHeldRef = useRef<boolean>(false)
  const duckPressedRef = useRef<boolean>(false)
  const duckHeldRef = useRef<boolean>(false)
  const spaceRequiresReleaseRef = useRef<boolean>(false)
  const overlayLockedUntilMsRef = useRef<number>(0)
  const stateRef = useRef<EpochRunnerState>(createInitialEpochRunnerState())
  const lastFrameMsRef = useRef<number | null>(null)
  const [viewState, setViewState] = useState<EpochRunnerState>(() => createInitialEpochRunnerState())
  const [bestScore, setBestScore] = useState<number>(() => loadBestScore())
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [overlayLockedUntilMs, setOverlayLockedUntilMs] = useState<number>(0)

  useEffect(() => {
    stateRef.current = createInitialEpochRunnerState()
    setViewState(stateRef.current)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
        return
      }

      if (event.key === ' ') {
        event.preventDefault()
        const currentState = stateRef.current
        const needsFreshPress = (
          currentState.status === 'stage-complete'
          || currentState.status === 'cutscene'
          || currentState.status === 'crashed'
          || currentState.status === 'game-over'
          || currentState.status === 'won'
        )

        if (needsFreshPress && (spaceRequiresReleaseRef.current || event.repeat)) {
          return
        }

        if (needsFreshPress && Date.now() < overlayLockedUntilMsRef.current) {
          return
        }

        if (currentState.status === 'ready') {
          const nextState = startEpochRunner(currentState)
          stateRef.current = nextState
          setViewState(nextState)
          setUnlockError(null)
          overlayLockedUntilMsRef.current = 0
          setOverlayLockedUntilMs(0)
          return
        }

        if (currentState.status === 'stage-complete' || currentState.status === 'cutscene') {
          const nextState = advanceEpochRunner(currentState)
          stateRef.current = nextState
          setViewState(nextState)
          setUnlockError(null)
          overlayLockedUntilMsRef.current = 0
          setOverlayLockedUntilMs(0)
          return
        }

        if (currentState.status === 'crashed') {
          const nextState = retryEpochRunnerStage(currentState)
          stateRef.current = nextState
          setViewState(nextState)
          setUnlockError(null)
          overlayLockedUntilMsRef.current = 0
          setOverlayLockedUntilMs(0)
          return
        }

        if (currentState.status === 'game-over' || currentState.status === 'won') {
          const nextState = createInitialEpochRunnerState()
          stateRef.current = nextState
          setViewState(nextState)
          setUnlockError(null)
          overlayLockedUntilMsRef.current = 0
          setOverlayLockedUntilMs(0)
          return
        }

        if (!event.repeat) {
          jumpPressedRef.current = true
        }
        jumpHeldRef.current = true
        return
      }

      if (isDuckKey(event.key)) {
        event.preventDefault()
        if (!event.repeat) {
          duckPressedRef.current = true
        }
        duckHeldRef.current = true
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') {
        jumpHeldRef.current = false
        spaceRequiresReleaseRef.current = false
        return
      }

      if (isDuckKey(event.key)) {
        duckHeldRef.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [onExit])

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) {
      return
    }

    let animationFrameId = 0

    const frame = (timestamp: number): void => {
      if (lastFrameMsRef.current == null) {
        lastFrameMsRef.current = timestamp
      }

      const deltaMs = Math.min(32, timestamp - lastFrameMsRef.current)
      lastFrameMsRef.current = timestamp

      const currentState = stateRef.current
      const input = createFrameInput(
        jumpPressedRef.current,
        jumpHeldRef.current,
        duckPressedRef.current,
        duckHeldRef.current
      )
      const nextState = stepEpochRunner(currentState, deltaMs, input)
      jumpPressedRef.current = false
      duckPressedRef.current = false

      if (nextState !== currentState) {
        if (currentState.status === 'running' && nextState.status !== 'running' && input.jumpHeld) {
          spaceRequiresReleaseRef.current = true
          jumpHeldRef.current = false
        }

        if (currentState.status === 'running' && nextState.status !== 'running') {
          const lockMs = getOverlayLockMs(nextState.status)
          const lockedUntilMs = lockMs > 0 ? Date.now() + lockMs : 0
          overlayLockedUntilMsRef.current = lockedUntilMs
          setOverlayLockedUntilMs(lockedUntilMs)
        }

        stateRef.current = nextState
        setViewState(nextState)

        if ((nextState.status === 'game-over' || nextState.status === 'won') && nextState.score > bestScore) {
          setBestScore(nextState.score)
          window.localStorage.setItem(EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY, String(nextState.score))
        }
      }

      renderGameFrame(context, stateRef.current, timestamp)
      animationFrameId = window.requestAnimationFrame(frame)
    }

    animationFrameId = window.requestAnimationFrame(frame)
    return () => {
      window.cancelAnimationFrame(animationFrameId)
      lastFrameMsRef.current = null
    }
  }, [bestScore])

  useEffect(() => {
    if (overlayLockedUntilMs <= 0) {
      return
    }

    const remainingMs = Math.max(0, overlayLockedUntilMs - Date.now())
    const timerId = window.setTimeout(() => {
      overlayLockedUntilMsRef.current = 0
      setOverlayLockedUntilMs(0)
    }, remainingMs)

    return () => window.clearTimeout(timerId)
  }, [overlayLockedUntilMs])

  const overlay = useMemo<OverlayConfig | null>(() => {
    if (viewState.status === 'ready') {
      return null
    }

    if (viewState.status === 'stage-complete') {
      return {
        title: viewState.resultHeadline,
        detail: viewState.resultDetail,
        actionLabel: 'Press SPACE to start the next run',
        lockedActionLabel: 'Writing run report...',
        diagnostics: [
          `RUN ${viewState.currentStage} / ${EPOCH_RUNNER_STAGE_COUNT} COMPLETE`,
          `STAGE EPOCHS: ${viewState.stageEpochs}`,
          `TOTAL EPOCHS: ${viewState.epochsCollected} / ${EPOCH_RUNNER_TARGET_EPOCHS}`,
          `RUN TIME: ${formatSeconds(viewState.stageTimeMs)}s`
        ]
      }
    }

    if (viewState.status === 'cutscene') {
      return {
        title: viewState.resultHeadline,
        detail: viewState.resultDetail,
        actionLabel: 'Press SPACE to continue to Run 3',
        lockedActionLabel: 'The relic hums...',
        diagnostics: [
          'NAM-BOT enters the hallowed hall.',
          'Ancient relic acquired: PHASE SLIDER',
          'ABILITY UNLOCKED: DUCK DASH',
          'Hold S or ArrowDown for the full dash. Release to cancel early.'
        ]
      }
    }

    if (viewState.status === 'crashed') {
      return {
        title: viewState.resultHeadline,
        detail: viewState.resultDetail,
        actionLabel: `Press SPACE to retry Run ${viewState.currentStage}`,
        lockedActionLabel: 'Rebuilding checkpoint...',
        diagnostics: [
          `RUN ${viewState.currentStage} LIFE LOST`,
          `LIVES REMAINING: ${viewState.livesRemaining}`,
          `TOTAL EPOCHS: ${viewState.epochsCollected} / ${EPOCH_RUNNER_TARGET_EPOCHS}`,
          'Stage buffer will rewind to the last checkpoint.'
        ]
      }
    }

    if (viewState.status === 'game-over') {
      return {
        title: viewState.resultHeadline,
        detail: viewState.resultDetail,
        actionLabel: 'Press SPACE to reboot from Run 1',
        lockedActionLabel: 'NAM-BOT is dissolving...',
        diagnostics: [
          'ALL LIVES LOST',
          `FINAL EPOCHS: ${viewState.epochsCollected} / ${EPOCH_RUNNER_TARGET_EPOCHS}`,
          'Particle trail archived. Full training sequence reset required.'
        ]
      }
    }

    if (viewState.status === 'won') {
      return {
        title: viewState.resultHeadline,
        detail: viewState.resultDetail,
        actionLabel: 'Press SPACE to victory-lap',
        lockedActionLabel: 'Finalizing reward manifest...',
        diagnostics: [
          'ALL TRAINING RUNS COMPLETE',
          `EPOCHS COLLECTED: ${viewState.epochsCollected} / ${EPOCH_RUNNER_TARGET_EPOCHS}`,
          'Reward preset manifest ready.'
        ]
      }
    }

    return null
  }, [viewState])

  const isOverlayLocked = overlayLockedUntilMs > Date.now()

  const handleUnlockClick = async (): Promise<void> => {
    setIsUnlocking(true)
    setUnlockError(null)

    try {
      await onUnlockReward()
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsUnlocking(false)
    }
  }

  const stats: EpochRunnerRunStats = {
    epochsCollected: viewState.epochsCollected,
    stageEpochs: viewState.stageEpochs,
    stageTargetEpochs: viewState.stageTargetEpochs,
    stageTimeMs: viewState.stageTimeMs,
    livesRemaining: viewState.livesRemaining,
    score: viewState.score,
    distance: viewState.distance,
    timeMs: viewState.timeMs
  }

  return (
    <div className="epoch-runner-shell">
      <div className="epoch-runner-header">
        <span className="epoch-runner-title">EPOCH RUNNER</span>
        <span className="epoch-runner-help">
          {viewState.duckDashUnlocked
            ? 'SPACE jump / start / retry | S or ArrowDown duck dash | ESC exit'
            : 'SPACE jump / start / retry | ESC exit'}
        </span>
      </div>

      <div className="epoch-runner-stage">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="epoch-runner-canvas"
        />

        {overlay && (
          <div className={`epoch-runner-overlay ${viewState.status === 'cutscene' ? 'is-cutscene' : ''}`}>
            <h3>{overlay.title}</h3>
            <p>{overlay.detail}</p>
            {viewState.status === 'cutscene' && (
              <div className="epoch-runner-cutscene" aria-label="NAM-BOT dash ability cutscene">
                <div className="epoch-runner-hall">
                  <span className="hall-column hall-column-left" />
                  <span className="hall-column hall-column-right" />
                  <span className="hall-arch" />
                  <span className="hall-floor" />
                  <span className="relic-beam relic-beam-left" />
                  <span className="relic-beam relic-beam-right" />
                  <span className="ancient-relic" />
                  <span className="cutscene-manbot">
                    <span className="cutscene-manbot-head" />
                    <span className="cutscene-manbot-body" />
                    <span className="cutscene-manbot-leg cutscene-manbot-leg-left" />
                    <span className="cutscene-manbot-leg cutscene-manbot-leg-right" />
                  </span>
                </div>
                <div className="epoch-runner-unlock-callout">
                  <span>ABILITY UNLOCKED</span>
                  <strong>DUCK DASH</strong>
                  <span>Hold S or ArrowDown to slide farther. Release to stop early.</span>
                </div>
              </div>
            )}
            {viewState.status === 'stage-complete' && (
              <div className="epoch-runner-stage-report" aria-label="Epoch Runner stage report">
                <span className="stage-report-line stage-report-line-1" />
                <span className="stage-report-line stage-report-line-2" />
                <span className="stage-report-line stage-report-line-3" />
                <span className="stage-report-line stage-report-line-4" />
                <span className="stage-report-cursor" />
              </div>
            )}
            {viewState.status === 'game-over' && (
              <div className="epoch-runner-game-over-scene" aria-label="NAM-BOT game over dissolve">
                <span className="game-over-nambot">
                  <span className="game-over-head" />
                  <span className="game-over-body" />
                  <span className="game-over-leg game-over-leg-left" />
                  <span className="game-over-leg game-over-leg-right" />
                </span>
                <span className="dissolve-particle particle-1" />
                <span className="dissolve-particle particle-2" />
                <span className="dissolve-particle particle-3" />
                <span className="dissolve-particle particle-4" />
                <span className="dissolve-particle particle-5" />
                <span className="dissolve-particle particle-6" />
                <span className="dissolve-wave" />
              </div>
            )}
            <div className="epoch-runner-diagnostics" aria-label="Epoch Runner diagnostics">
              {overlay.diagnostics.map((line) => (
                <span key={line}>&gt; {line}</span>
              ))}
            </div>
            <p className="epoch-runner-overlay-action">
              {isOverlayLocked ? overlay.lockedActionLabel : overlay.actionLabel}
            </p>

            {viewState.status === 'won' && (
              <>
                <button
                  type="button"
                  className={`btn btn-sm ${isRewardUnlocked ? 'btn-secondary' : 'btn-green'}`}
                  onClick={() => void handleUnlockClick()}
                  disabled={isRewardUnlocked || isUnlocking}
                >
                  {isRewardUnlocked ? 'Reward Preset Already Added' : isUnlocking ? 'Adding Reward...' : 'Add Reward Preset'}
                </button>
                {unlockError && <p className="epoch-runner-error">{unlockError}</p>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="epoch-runner-hud">
        <div className="epoch-runner-hud-stat">
          <span className="label">Run</span>
          <span className="value">{viewState.currentStage} / {EPOCH_RUNNER_STAGE_COUNT}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Stage Epochs</span>
          <span className="value">{stats.stageEpochs} / {stats.stageTargetEpochs}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Total Epochs</span>
          <span className="value">{stats.epochsCollected} / {EPOCH_RUNNER_TARGET_EPOCHS}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Runtime</span>
          <span className="value">{formatStageTimer(viewState)}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Lives</span>
          <span className="value">{stats.livesRemaining}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Score</span>
          <span className="value">{stats.score}</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Time</span>
          <span className="value">{formatSeconds(stats.timeMs)}s</span>
        </div>
        <div className="epoch-runner-hud-stat">
          <span className="label">Best Score</span>
          <span className="value">{bestScore}</span>
        </div>
      </div>

      {viewState.status === 'won' && isRewardUnlocked && (
        <p className="epoch-runner-success">Reward preset is already in your library and ready in Jobs.</p>
      )}

      <style>{`
        .epoch-runner-shell {
          margin-top: 18px;
          border: 1px solid rgba(110, 255, 150, 0.35);
          padding: 14px;
          background: rgba(0, 12, 2, 0.82);
          box-shadow: inset 0 0 40px rgba(0, 255, 128, 0.06);
          position: relative;
          z-index: 3;
        }

        .epoch-runner-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .epoch-runner-title {
          color: var(--neon-cyan);
          letter-spacing: 0.18em;
          font-size: 16px;
        }

        .epoch-runner-help {
          color: var(--text-steel);
          font-size: 11px;
        }

        .epoch-runner-stage {
          position: relative;
          border: 1px solid rgba(140, 255, 182, 0.28);
          background: #000;
        }

        .epoch-runner-canvas {
          display: block;
          width: 100%;
          height: auto;
          image-rendering: pixelated;
          aspect-ratio: ${GAME_WIDTH} / ${GAME_HEIGHT};
        }

        .epoch-runner-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.76);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          gap: 10px;
        }

        .epoch-runner-overlay.is-cutscene {
          background:
            linear-gradient(rgba(0, 30, 10, 0.82), rgba(0, 0, 0, 0.88)),
            repeating-linear-gradient(0deg, rgba(57, 255, 20, 0.08) 0, rgba(57, 255, 20, 0.08) 1px, transparent 1px, transparent 4px);
        }

        .epoch-runner-overlay h3 {
          color: var(--neon-green);
          font-size: 24px;
          margin: 0;
        }

        .epoch-runner-overlay p {
          color: var(--text-steel);
          margin: 0;
          max-width: 520px;
        }

        .epoch-runner-diagnostics {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: min(460px, 100%);
          border: 1px solid rgba(102, 255, 146, 0.24);
          background: rgba(0, 14, 4, 0.72);
          padding: 10px 12px;
          color: var(--neon-cyan);
          font-size: 12px;
          text-align: left;
        }

        .epoch-runner-cutscene {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) minmax(180px, 0.72fr);
          gap: 14px;
          width: min(560px, 100%);
          align-items: stretch;
        }

        .epoch-runner-hall {
          position: relative;
          min-height: 118px;
          overflow: hidden;
          border: 1px solid rgba(102, 255, 146, 0.26);
          background:
            linear-gradient(90deg, rgba(0, 240, 255, 0.08), transparent 24%, transparent 76%, rgba(0, 240, 255, 0.08)),
            linear-gradient(180deg, rgba(0, 0, 0, 0.2), rgba(57, 255, 20, 0.08));
        }

        .hall-column,
        .hall-arch,
        .hall-floor,
        .relic-beam,
        .ancient-relic,
        .cutscene-manbot,
        .cutscene-manbot span {
          position: absolute;
          display: block;
        }

        .hall-column {
          top: 14px;
          width: 18px;
          height: 88px;
          background: #39ff88;
          box-shadow: inset 0 0 0 5px #001b00;
          opacity: 0.72;
        }

        .hall-column-left {
          left: 24px;
        }

        .hall-column-right {
          right: 24px;
        }

        .hall-arch {
          left: 50%;
          top: 8px;
          width: 146px;
          height: 72px;
          border-top: 8px solid rgba(57, 255, 136, 0.7);
          border-left: 8px solid rgba(57, 255, 136, 0.5);
          border-right: 8px solid rgba(57, 255, 136, 0.5);
          transform: translateX(-50%);
        }

        .hall-floor {
          left: 0;
          right: 0;
          bottom: 14px;
          height: 8px;
          background: repeating-linear-gradient(90deg, rgba(57,255,136,0.36) 0 18px, rgba(0,240,255,0.18) 18px 26px);
        }

        .relic-beam {
          left: 50%;
          top: 26px;
          width: 5px;
          height: 72px;
          background: rgba(0, 240, 255, 0.72);
          transform-origin: bottom;
          animation: relicBeamPulse 0.72s steps(3, end) infinite;
        }

        .relic-beam-left {
          transform: translateX(-50%) rotate(-18deg);
        }

        .relic-beam-right {
          transform: translateX(-50%) rotate(18deg);
        }

        .ancient-relic {
          left: 50%;
          top: 42px;
          width: 24px;
          height: 24px;
          background: var(--neon-gold);
          box-shadow: 0 0 10px rgba(255, 204, 0, 0.9), 0 0 24px rgba(255, 204, 0, 0.45);
          transform: translateX(-50%) rotate(45deg);
          animation: relicFloat 1.1s steps(4, end) infinite;
        }

        .ancient-relic::after {
          content: '';
          position: absolute;
          inset: 7px;
          background: #001b00;
        }

        .cutscene-manbot {
          left: 36px;
          bottom: 24px;
          width: 34px;
          height: 46px;
          animation: manbotEnterHall 2.4s steps(8, end) infinite;
        }

        .cutscene-manbot-head {
          left: 12px;
          top: 0;
          width: 11px;
          height: 9px;
          background: #d9ffd1;
        }

        .cutscene-manbot-body {
          left: 8px;
          top: 9px;
          width: 19px;
          height: 27px;
          background: #93ff84;
        }

        .cutscene-manbot-leg {
          bottom: 0;
          width: 6px;
          height: 11px;
          background: #d9ffd1;
        }

        .cutscene-manbot-leg-left {
          left: 9px;
        }

        .cutscene-manbot-leg-right {
          right: 8px;
        }

        .epoch-runner-unlock-callout {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          border: 1px solid rgba(255, 204, 0, 0.45);
          background: rgba(24, 16, 0, 0.52);
          padding: 12px;
          text-align: left;
          color: var(--text-steel);
          font-size: 12px;
        }

        .epoch-runner-unlock-callout strong {
          color: var(--neon-gold);
          font-size: 20px;
          letter-spacing: 0.12em;
          text-shadow: 0 0 12px rgba(255, 204, 0, 0.6);
        }

        .epoch-runner-stage-report {
          position: relative;
          width: min(420px, 100%);
          height: 74px;
          overflow: hidden;
          border: 1px solid rgba(102, 255, 146, 0.26);
          background: rgba(0, 16, 5, 0.68);
        }

        .stage-report-line,
        .stage-report-cursor {
          position: absolute;
          display: block;
          left: 18px;
          height: 6px;
          background: rgba(57, 255, 136, 0.78);
          transform-origin: left;
          animation: stageReportWrite 1.2s steps(8, end) infinite;
        }

        .stage-report-line-1 {
          top: 16px;
          width: 62%;
        }

        .stage-report-line-2 {
          top: 30px;
          width: 82%;
          animation-delay: 0.12s;
          background: rgba(0, 240, 255, 0.62);
        }

        .stage-report-line-3 {
          top: 44px;
          width: 46%;
          animation-delay: 0.24s;
        }

        .stage-report-line-4 {
          top: 58px;
          width: 70%;
          animation-delay: 0.36s;
          background: rgba(255, 204, 0, 0.62);
        }

        .stage-report-cursor {
          left: auto;
          right: 18px;
          top: 56px;
          width: 10px;
          height: 10px;
          animation: blink 0.8s step-end infinite;
        }

        .epoch-runner-game-over-scene {
          position: relative;
          width: min(420px, 100%);
          height: 104px;
          overflow: hidden;
          border: 1px solid rgba(255, 0, 60, 0.34);
          background:
            repeating-linear-gradient(0deg, rgba(255, 0, 60, 0.08) 0 2px, transparent 2px 7px),
            linear-gradient(180deg, rgba(26, 0, 8, 0.7), rgba(0, 0, 0, 0.86));
        }

        .game-over-nambot,
        .game-over-nambot span,
        .dissolve-particle,
        .dissolve-wave {
          position: absolute;
          display: block;
        }

        .game-over-nambot {
          left: 50%;
          bottom: 26px;
          width: 34px;
          height: 46px;
          transform: translateX(-50%);
          animation: gameOverNambotFade 1.9s steps(6, end) infinite;
        }

        .game-over-head {
          left: 12px;
          top: 0;
          width: 11px;
          height: 9px;
          background: #d9ffd1;
        }

        .game-over-body {
          left: 8px;
          top: 9px;
          width: 19px;
          height: 27px;
          background: #93ff84;
        }

        .game-over-leg {
          bottom: 0;
          width: 6px;
          height: 11px;
          background: #d9ffd1;
        }

        .game-over-leg-left {
          left: 9px;
        }

        .game-over-leg-right {
          right: 8px;
        }

        .dissolve-particle {
          left: 50%;
          bottom: 58px;
          width: 6px;
          height: 6px;
          background: var(--neon-green);
          opacity: 0;
          animation: dissolveParticle 1.9s steps(6, end) infinite;
        }

        .particle-1 { --particle-x: -78px; --particle-y: -30px; animation-delay: 0.04s; }
        .particle-2 { --particle-x: -48px; --particle-y: -52px; animation-delay: 0.12s; background: var(--neon-cyan); }
        .particle-3 { --particle-x: -18px; --particle-y: -72px; animation-delay: 0.2s; }
        .particle-4 { --particle-x: 22px; --particle-y: -62px; animation-delay: 0.28s; background: var(--neon-cyan); }
        .particle-5 { --particle-x: 54px; --particle-y: -42px; animation-delay: 0.36s; }
        .particle-6 { --particle-x: 82px; --particle-y: -22px; animation-delay: 0.44s; background: var(--neon-magenta); }

        .dissolve-wave {
          left: 18%;
          right: 18%;
          bottom: 22px;
          height: 4px;
          background: rgba(255, 0, 60, 0.7);
          box-shadow: 0 0 12px rgba(255, 0, 60, 0.6);
          animation: dissolveWave 1.9s steps(5, end) infinite;
        }

        .epoch-runner-overlay-action {
          color: var(--neon-cyan) !important;
        }

        @keyframes relicFloat {
          0%, 100% {
            transform: translateX(-50%) translateY(0) rotate(45deg);
          }

          50% {
            transform: translateX(-50%) translateY(-8px) rotate(45deg);
          }
        }

        @keyframes relicBeamPulse {
          0%, 100% {
            opacity: 0.35;
          }

          50% {
            opacity: 1;
          }
        }

        @keyframes manbotEnterHall {
          0% {
            transform: translateX(0);
          }

          45%, 100% {
            transform: translateX(118px);
          }
        }

        @keyframes stageReportWrite {
          0% {
            transform: scaleX(0.08);
            opacity: 0.45;
          }

          55%, 100% {
            transform: scaleX(1);
            opacity: 1;
          }
        }

        @keyframes gameOverNambotFade {
          0%, 32% {
            opacity: 1;
            filter: none;
          }

          70%, 100% {
            opacity: 0;
            filter: blur(1px);
          }
        }

        @keyframes dissolveParticle {
          0%, 18% {
            opacity: 0;
            transform: translate(-50%, 0);
          }

          34% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--particle-x)), var(--particle-y));
          }
        }

        @keyframes dissolveWave {
          0% {
            transform: scaleX(0.18);
            opacity: 0;
          }

          32% {
            opacity: 1;
          }

          100% {
            transform: scaleX(1);
            opacity: 0;
          }
        }

        .epoch-runner-hud {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .epoch-runner-hud-stat {
          border: 1px solid rgba(102, 255, 146, 0.22);
          background: rgba(7, 17, 8, 0.65);
          padding: 8px;
          min-width: 0;
        }

        .epoch-runner-hud-stat .label {
          display: block;
          color: var(--text-steel);
          font-size: 10px;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .epoch-runner-hud-stat .value {
          color: var(--neon-green);
          font-size: 15px;
          white-space: nowrap;
        }

        .epoch-runner-success {
          margin-top: 10px;
          color: var(--neon-cyan);
          font-size: 12px;
        }

        .epoch-runner-error {
          color: var(--neon-magenta) !important;
          font-size: 12px;
        }

        @media (max-width: 700px) {
          .epoch-runner-hud {
            grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
          }

          .epoch-runner-cutscene {
            grid-template-columns: 1fr;
          }

          .epoch-runner-hall {
            min-height: 104px;
          }

          .epoch-runner-unlock-callout strong {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  )
}
