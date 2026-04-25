export const EPOCH_RUNNER_STAGE_COUNT = 5
export const EPOCH_RUNNER_STARTING_LIVES = 3
export const EPOCH_RUNNER_BEST_SCORE_STORAGE_KEY = 'nam-bot:epoch-runner-best-score'

export const GAME_WIDTH = 800
export const GAME_HEIGHT = 280
export const GROUND_HEIGHT = 42
export const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT
export const PLAYER_X = 112
export const PLAYER_WIDTH = 34
export const PLAYER_HEIGHT = 42

const PLAYER_DUCK_HEIGHT = 24
const GRAVITY = 1750
const FALL_GRAVITY_MULTIPLIER = 1.12
const JUMP_RELEASE_GRAVITY_MULTIPLIER = 2.35
const JUMP_VELOCITY = -610
const JUMP_BUFFER_MS = 120
const COYOTE_TIME_MS = 92
const DUCK_DASH_DURATION_MS = 540
const DUCK_DASH_COOLDOWN_MS = 0
const MAX_DELTA_MS = 40
const PATTERN_RETRY_MS = 90

const STAGE_TARGET_EPOCHS = [66, 120, 140, 160, 180]

export const EPOCH_RUNNER_TARGET_EPOCHS = STAGE_TARGET_EPOCHS.reduce(
  (total, stageTarget) => total + stageTarget,
  0
)

export type EpochRunnerOutcome = 'none' | 'crashed' | 'won'
export type EpochRunnerStateStatus = 'ready' | 'running' | 'stage-complete' | 'cutscene' | 'crashed' | 'game-over' | 'won'
export type EpochRunnerObstacleType = 'amp-stack' | 'noise-burst' | 'cab-wall' | 'signal-beam' | 'signal-tunnel'
export type EpochRunnerCollectibleType = 'epoch' | 'epoch-bundle'

type EpochRunnerPatternKind =
  | 'single-hop'
  | 'low-burst'
  | 'staggered-hop'
  | 'cab-hop'
  | 'epoch-line'
  | 'epoch-bundle'
  | 'duck-beam-tutorial'
  | 'duck-beam'
  | 'dash-tunnel'
  | 'dash-cache'
  | 'mixed-gate'
  | 'final-sprint'

type CollectibleLane = 'ground' | 'hop' | 'high'
type EpochRunnerRandom = () => number

interface StageConfig {
  baseSpeed: number
  maxSpeedBonus: number
  speedRamp: number
  minPatternGapPx: number
  cooldownMinMs: number
  cooldownMaxMs: number
}

interface PatternBuildResult {
  obstacles: EpochRunnerObstacle[]
  collectibles: EpochRunnerCollectible[]
  nextSpawnId: number
}

export interface EpochRunnerInput {
  jumpPressed: boolean
  jumpHeld: boolean
  duckPressed: boolean
  duckHeld: boolean
}

export interface EpochRunnerStepOptions {
  rng?: EpochRunnerRandom
}

export interface EpochRunnerPlayer {
  x: number
  y: number
  width: number
  height: number
  velocityY: number
  isGrounded: boolean
  isDucking: boolean
  jumpBufferMs: number
  coyoteTimeMs: number
  duckDashMs: number
  duckCooldownMs: number
}

export interface EpochRunnerObstacle {
  id: number
  x: number
  y: number
  width: number
  height: number
  type: EpochRunnerObstacleType
}

export interface EpochRunnerCollectible {
  id: number
  x: number
  y: number
  width: number
  height: number
  type: EpochRunnerCollectibleType
  value: number
  bobPhase: number
}

export interface EpochRunnerRunStats {
  epochsCollected: number
  stageEpochs: number
  stageTargetEpochs: number
  stageTimeMs: number
  livesRemaining: number
  score: number
  distance: number
  timeMs: number
}

export interface EpochRunnerState extends EpochRunnerRunStats {
  status: EpochRunnerStateStatus
  outcome: EpochRunnerOutcome
  player: EpochRunnerPlayer
  obstacles: EpochRunnerObstacle[]
  collectibles: EpochRunnerCollectible[]
  speed: number
  currentStage: number
  stageDistance: number
  stageStartEpochs: number
  stageStartScore: number
  duckDashUnlocked: boolean
  patternCooldownMs: number
  patternsSpawnedInStage: number
  nextSpawnId: number
  resultHeadline: string
  resultDetail: string
}

const idleInput: EpochRunnerInput = {
  jumpPressed: false,
  jumpHeld: false,
  duckPressed: false,
  duckHeld: false
}

function createInitialPlayer(): EpochRunnerPlayer {
  return {
    x: PLAYER_X,
    y: GROUND_Y - PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    velocityY: 0,
    isGrounded: true,
    isDucking: false,
    jumpBufferMs: 0,
    coyoteTimeMs: COYOTE_TIME_MS,
    duckDashMs: 0,
    duckCooldownMs: 0
  }
}

function getStageTargetEpochs(stage: number): number {
  const target = STAGE_TARGET_EPOCHS[Math.max(0, Math.min(stage - 1, STAGE_TARGET_EPOCHS.length - 1))]
  return target ?? STAGE_TARGET_EPOCHS[STAGE_TARGET_EPOCHS.length - 1]
}

function getStageConfig(stage: number): StageConfig {
  if (stage === 1) {
    return {
      baseSpeed: 232,
      maxSpeedBonus: 68,
      speedRamp: 2.2,
      minPatternGapPx: 218,
      cooldownMinMs: 1180,
      cooldownMaxMs: 1580
    }
  }

  if (stage === 2) {
    return {
      baseSpeed: 252,
      maxSpeedBonus: 82,
      speedRamp: 2.45,
      minPatternGapPx: 202,
      cooldownMinMs: 1040,
      cooldownMaxMs: 1440
    }
  }

  if (stage === 3) {
    return {
      baseSpeed: 264,
      maxSpeedBonus: 90,
      speedRamp: 2.55,
      minPatternGapPx: 192,
      cooldownMinMs: 990,
      cooldownMaxMs: 1340
    }
  }

  if (stage === 4) {
    return {
      baseSpeed: 282,
      maxSpeedBonus: 104,
      speedRamp: 2.7,
      minPatternGapPx: 178,
      cooldownMinMs: 900,
      cooldownMaxMs: 1240
    }
  }

  return {
    baseSpeed: 300,
    maxSpeedBonus: 118,
    speedRamp: 2.85,
    minPatternGapPx: 166,
    cooldownMinMs: 800,
    cooldownMaxMs: 1120
  }
}

function rectsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  )
}

function randomBetween(min: number, max: number, rng: EpochRunnerRandom): number {
  return min + (rng() * (max - min))
}

function pickOne<T>(items: T[], rng: EpochRunnerRandom): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length))
  return items[index]
}

function buildObstacle(
  id: number,
  type: EpochRunnerObstacleType,
  x: number
): EpochRunnerObstacle {
  if (type === 'amp-stack') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 38,
      width: 34,
      height: 38
    }
  }

  if (type === 'noise-burst') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 26,
      width: 30,
      height: 26
    }
  }

  if (type === 'cab-wall') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 52,
      width: 44,
      height: 52
    }
  }

  if (type === 'signal-tunnel') {
    return {
      id,
      type,
      x,
      y: GROUND_Y - 140,
      width: 86,
      height: 118
    }
  }

  return {
    id,
    type,
    x,
    y: GROUND_Y - 48,
    width: 74,
    height: 22
  }
}

function getCollectibleY(lane: CollectibleLane, value: number): number {
  if (lane === 'ground') {
    return GROUND_Y - (value === 5 ? 48 : 44)
  }

  if (lane === 'hop') {
    return GROUND_Y - (value === 5 ? 88 : 82)
  }

  return GROUND_Y - (value === 5 ? 122 : 116)
}

function buildCollectible(
  id: number,
  x: number,
  lane: CollectibleLane,
  value: number,
  rng: EpochRunnerRandom
): EpochRunnerCollectible {
  const type: EpochRunnerCollectibleType = value === 5 ? 'epoch-bundle' : 'epoch'
  const size = value === 5 ? 30 : 22

  return {
    id,
    type,
    value,
    x,
    y: getCollectibleY(lane, value),
    width: size,
    height: size,
    bobPhase: rng() * Math.PI * 2
  }
}

function addObstacle(
  obstacles: EpochRunnerObstacle[],
  nextId: number,
  type: EpochRunnerObstacleType,
  x: number
): number {
  obstacles.push(buildObstacle(nextId, type, x))
  return nextId + 1
}

function addCollectible(
  collectibles: EpochRunnerCollectible[],
  nextId: number,
  x: number,
  lane: CollectibleLane,
  value: number,
  rng: EpochRunnerRandom
): number {
  collectibles.push(buildCollectible(nextId, x, lane, value, rng))
  return nextId + 1
}

function buildPattern(
  pattern: EpochRunnerPatternKind,
  nextSpawnId: number,
  rng: EpochRunnerRandom
): PatternBuildResult {
  const obstacles: EpochRunnerObstacle[] = []
  const collectibles: EpochRunnerCollectible[] = []
  const startX = GAME_WIDTH + 24
  let nextId = nextSpawnId

  if (pattern === 'epoch-line') {
    nextId = addCollectible(collectibles, nextId, startX + 80, 'ground', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 150, 'hop', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 220, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'single-hop') {
    nextId = addCollectible(collectibles, nextId, startX + 86, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, pickOne(['amp-stack', 'noise-burst'], rng), startX + 168)
    nextId = addCollectible(collectibles, nextId, startX + 182, 'hop', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 270, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'low-burst') {
    nextId = addCollectible(collectibles, nextId, startX + 90, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, 'noise-burst', startX + 156)
    nextId = addCollectible(collectibles, nextId, startX + 162, 'hop', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 238, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'staggered-hop') {
    nextId = addObstacle(obstacles, nextId, 'amp-stack', startX + 126)
    nextId = addCollectible(collectibles, nextId, startX + 144, 'hop', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 230, 'ground', 5, rng)
    nextId = addObstacle(obstacles, nextId, 'noise-burst', startX + 328)
    nextId = addCollectible(collectibles, nextId, startX + 342, 'hop', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'cab-hop') {
    nextId = addCollectible(collectibles, nextId, startX + 86, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, 'cab-wall', startX + 164)
    nextId = addCollectible(collectibles, nextId, startX + 178, 'high', 5, rng)
    nextId = addCollectible(collectibles, nextId, startX + 284, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'epoch-bundle') {
    nextId = addCollectible(collectibles, nextId, startX + 94, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, 'amp-stack', startX + 176)
    nextId = addCollectible(collectibles, nextId, startX + 188, 'hop', 5, rng)
    nextId = addCollectible(collectibles, nextId, startX + 296, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'duck-beam-tutorial') {
    nextId = addCollectible(collectibles, nextId, startX + 76, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, 'signal-beam', startX + 156)
    nextId = addCollectible(collectibles, nextId, startX + 174, 'ground', 5, rng)
    nextId = addCollectible(collectibles, nextId, startX + 276, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'duck-beam') {
    nextId = addObstacle(obstacles, nextId, 'signal-beam', startX + 126)
    nextId = addCollectible(collectibles, nextId, startX + 150, 'ground', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 232, 'ground', 5, rng)
    nextId = addObstacle(obstacles, nextId, 'signal-beam', startX + 338)
    nextId = addCollectible(collectibles, nextId, startX + 364, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'dash-tunnel') {
    nextId = addCollectible(collectibles, nextId, startX + 74, 'ground', 1, rng)
    nextId = addObstacle(obstacles, nextId, 'signal-tunnel', startX + 148)
    nextId = addCollectible(collectibles, nextId, startX + 174, 'ground', 5, rng)
    nextId = addCollectible(collectibles, nextId, startX + 300, 'ground', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'dash-cache') {
    nextId = addObstacle(obstacles, nextId, 'signal-tunnel', startX + 112)
    nextId = addCollectible(collectibles, nextId, startX + 136, 'ground', 5, rng)
    nextId = addCollectible(collectibles, nextId, startX + 244, 'ground', 5, rng)
    nextId = addObstacle(obstacles, nextId, 'noise-burst', startX + 392)
    nextId = addCollectible(collectibles, nextId, startX + 408, 'hop', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  if (pattern === 'mixed-gate') {
    nextId = addObstacle(obstacles, nextId, 'signal-beam', startX + 126)
    nextId = addCollectible(collectibles, nextId, startX + 154, 'ground', 1, rng)
    nextId = addCollectible(collectibles, nextId, startX + 230, 'ground', 5, rng)
    nextId = addObstacle(obstacles, nextId, pickOne(['amp-stack', 'noise-burst'], rng), startX + 330)
    nextId = addCollectible(collectibles, nextId, startX + 344, 'hop', 1, rng)
    return { obstacles, collectibles, nextSpawnId: nextId }
  }

  nextId = addObstacle(obstacles, nextId, 'amp-stack', startX + 110)
  nextId = addCollectible(collectibles, nextId, startX + 126, 'hop', 1, rng)
  nextId = addObstacle(obstacles, nextId, 'signal-beam', startX + 296)
  nextId = addCollectible(collectibles, nextId, startX + 318, 'ground', 5, rng)
  nextId = addObstacle(obstacles, nextId, 'noise-burst', startX + 492)
  nextId = addCollectible(collectibles, nextId, startX + 506, 'hop', 1, rng)
  return { obstacles, collectibles, nextSpawnId: nextId }
}

function choosePattern(state: EpochRunnerState, rng: EpochRunnerRandom): EpochRunnerPatternKind {
  if (state.currentStage === 1 && state.patternsSpawnedInStage === 0) {
    return 'epoch-line'
  }

  if (state.currentStage === 3 && state.patternsSpawnedInStage === 0) {
    return 'duck-beam-tutorial'
  }

  if (state.currentStage === 1) {
    return pickOne(['single-hop', 'low-burst', 'epoch-line'], rng)
  }

  if (state.currentStage === 2) {
    return pickOne(['single-hop', 'staggered-hop', 'cab-hop', 'epoch-bundle'], rng)
  }

  if (state.currentStage === 3) {
    return pickOne(['duck-beam', 'single-hop', 'low-burst', 'epoch-bundle'], rng)
  }

  if (state.currentStage === 4) {
    return pickOne(['dash-tunnel', 'dash-cache', 'mixed-gate', 'duck-beam', 'staggered-hop', 'epoch-bundle'], rng)
  }

  return pickOne(['final-sprint', 'dash-tunnel', 'dash-cache', 'mixed-gate', 'duck-beam', 'staggered-hop', 'epoch-bundle'], rng)
}

function getRightmostObstacleX(obstacles: EpochRunnerObstacle[]): number {
  return obstacles.reduce((rightmost, obstacle) => Math.max(rightmost, obstacle.x + obstacle.width), -Infinity)
}

function getNextPatternCooldownMs(state: EpochRunnerState, rng: EpochRunnerRandom): number {
  const config = getStageConfig(state.currentStage)
  const rampReduction = Math.min(160, state.stageDistance * 1.35)
  const min = Math.max(680, config.cooldownMinMs - rampReduction)
  const max = Math.max(min + 120, config.cooldownMaxMs - (rampReduction * 0.65))
  return randomBetween(min, max, rng)
}

function getPlayerHitBox(player: EpochRunnerPlayer): { x: number; y: number; width: number; height: number } {
  if (player.isDucking) {
    return {
      x: player.x + 6,
      y: player.y + PLAYER_HEIGHT - PLAYER_DUCK_HEIGHT + 3,
      width: player.width - 10,
      height: PLAYER_DUCK_HEIGHT - 7
    }
  }

  return {
    x: player.x + 6,
    y: player.y + 4,
    width: player.width - 12,
    height: player.height - 8
  }
}

function getObstacleHitBox(
  obstacle: EpochRunnerObstacle
): { x: number; y: number; width: number; height: number } {
  if (obstacle.type === 'signal-beam' || obstacle.type === 'signal-tunnel') {
    return {
      x: obstacle.x + 6,
      y: obstacle.y + 4,
      width: obstacle.width - 12,
      height: obstacle.height - 8
    }
  }

  return {
    x: obstacle.x + 4,
    y: obstacle.y + 4,
    width: obstacle.width - 8,
    height: obstacle.height - 6
  }
}

function getFailureCopy(rng: EpochRunnerRandom): [string, string] {
  const failureLines: [string, string][] = [
    ['MODEL DIVERGED', 'Gradient spike detected in the signal path.'],
    ['SIGNAL LOST', 'The capture rig vanished into the noise floor.'],
    ['TRAINING ABORTED', 'Waveform terrain exceeded safe limits.'],
    ['LOW-PROFILE MISS', 'The signal beam clipped NAM-BOT on the way through.']
  ]

  return pickOne(failureLines, rng)
}

function resolveStageComplete(state: EpochRunnerState): EpochRunnerState {
  if (state.currentStage >= EPOCH_RUNNER_STAGE_COUNT) {
    return {
      ...state,
      status: 'won',
      outcome: 'won',
      score: state.score + 1400,
      resultHeadline: 'TRAINING CONVERGED',
      resultDetail: 'CAPTURE COMPLETE. Reward preset manifest unlocked.'
    }
  }

  if (state.currentStage === 2 && !state.duckDashUnlocked) {
    return {
      ...state,
      status: 'cutscene',
      resultHeadline: 'RELIC DISCOVERED',
      resultDetail: 'NAM-BOT enters the hallowed hall and claims the ancient phase relic.'
    }
  }

  return {
    ...state,
    status: 'stage-complete',
    resultHeadline: `TRAINING RUN ${state.currentStage} COMPLETE`,
    resultDetail: 'Epoch buffer synchronized. Stand by for the next pass.'
  }
}

function stepPlayer(
  previousPlayer: EpochRunnerPlayer,
  input: EpochRunnerInput,
  deltaSeconds: number,
  deltaMs: number,
  duckDashUnlocked: boolean
): EpochRunnerPlayer {
  const player = { ...previousPlayer }
  const groundPlayerY = GROUND_Y - player.height

  player.jumpBufferMs = input.jumpPressed ? JUMP_BUFFER_MS : Math.max(0, player.jumpBufferMs - deltaMs)
  player.coyoteTimeMs = player.isGrounded ? COYOTE_TIME_MS : Math.max(0, player.coyoteTimeMs - deltaMs)
  player.duckCooldownMs = Math.max(0, player.duckCooldownMs - deltaMs)
  player.duckDashMs = Math.max(0, player.duckDashMs - deltaMs)

  const canDuckDash = duckDashUnlocked && player.isGrounded && player.duckCooldownMs === 0
  if (input.duckPressed && canDuckDash) {
    player.duckDashMs = DUCK_DASH_DURATION_MS
    player.duckCooldownMs = DUCK_DASH_COOLDOWN_MS
  }

  if (player.duckDashMs > 0 && !input.duckHeld) {
    player.duckDashMs = 0
  }

  player.isDucking = duckDashUnlocked && player.isGrounded && player.duckDashMs > 0 && input.duckHeld

  const canJump = player.jumpBufferMs > 0 && (player.isGrounded || player.coyoteTimeMs > 0) && !player.isDucking
  if (canJump) {
    player.velocityY = JUMP_VELOCITY
    player.isGrounded = false
    player.isDucking = false
    player.jumpBufferMs = 0
    player.coyoteTimeMs = 0
  }

  const gravityMultiplier = player.velocityY < 0 && !input.jumpHeld
    ? JUMP_RELEASE_GRAVITY_MULTIPLIER
    : player.velocityY > 0
      ? FALL_GRAVITY_MULTIPLIER
      : 1

  player.velocityY += GRAVITY * gravityMultiplier * deltaSeconds
  player.y += player.velocityY * deltaSeconds

  if (player.y >= groundPlayerY) {
    player.y = groundPlayerY
    player.velocityY = 0
    player.isGrounded = true
    player.coyoteTimeMs = COYOTE_TIME_MS
  }

  if (player.isGrounded && player.jumpBufferMs > 0 && !player.isDucking) {
    player.velocityY = JUMP_VELOCITY
    player.isGrounded = false
    player.isDucking = false
    player.jumpBufferMs = 0
    player.coyoteTimeMs = 0
  }

  const targetX = player.isDucking && duckDashUnlocked ? PLAYER_X + 24 : PLAYER_X
  player.x += (targetX - player.x) * Math.min(1, deltaSeconds * 16)

  if (!player.isGrounded) {
    player.isDucking = false
  }

  return player
}

export function createInitialEpochRunnerState(): EpochRunnerState {
  return {
    status: 'ready',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    epochsCollected: 0,
    stageEpochs: 0,
    stageTargetEpochs: getStageTargetEpochs(1),
    stageTimeMs: 0,
    livesRemaining: EPOCH_RUNNER_STARTING_LIVES,
    score: 0,
    distance: 0,
    stageDistance: 0,
    stageStartEpochs: 0,
    stageStartScore: 0,
    timeMs: 0,
    speed: getStageConfig(1).baseSpeed,
    currentStage: 1,
    duckDashUnlocked: false,
    patternCooldownMs: 520,
    patternsSpawnedInStage: 0,
    nextSpawnId: 1,
    resultHeadline: '',
    resultDetail: ''
  }
}

export function startEpochRunner(_state: EpochRunnerState): EpochRunnerState {
  return {
    ...createInitialEpochRunnerState(),
    status: 'running',
    patternCooldownMs: 420
  }
}

export function advanceEpochRunner(previousState: EpochRunnerState): EpochRunnerState {
  if (previousState.status !== 'stage-complete' && previousState.status !== 'cutscene') {
    return previousState
  }

  const nextStage = Math.min(EPOCH_RUNNER_STAGE_COUNT, previousState.currentStage + 1)

  return {
    ...previousState,
    status: 'running',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    currentStage: nextStage,
    stageEpochs: 0,
    stageTargetEpochs: getStageTargetEpochs(nextStage),
    stageTimeMs: 0,
    stageDistance: 0,
    stageStartEpochs: previousState.epochsCollected,
    stageStartScore: previousState.score,
    speed: getStageConfig(nextStage).baseSpeed,
    duckDashUnlocked: previousState.duckDashUnlocked || previousState.status === 'cutscene',
    patternCooldownMs: previousState.status === 'cutscene' ? 520 : 440,
    patternsSpawnedInStage: 0,
    resultHeadline: '',
    resultDetail: ''
  }
}

export function retryEpochRunnerStage(previousState: EpochRunnerState): EpochRunnerState {
  if (previousState.status !== 'crashed' || previousState.livesRemaining <= 0) {
    return previousState
  }

  return {
    ...previousState,
    status: 'running',
    outcome: 'none',
    player: createInitialPlayer(),
    obstacles: [],
    collectibles: [],
    epochsCollected: previousState.stageStartEpochs,
    stageEpochs: 0,
    stageTimeMs: 0,
    stageDistance: 0,
    score: previousState.stageStartScore,
    speed: getStageConfig(previousState.currentStage).baseSpeed,
    patternCooldownMs: previousState.currentStage === 3 ? 520 : 440,
    patternsSpawnedInStage: 0,
    resultHeadline: '',
    resultDetail: ''
  }
}

export function stepEpochRunner(
  previousState: EpochRunnerState,
  deltaMs: number,
  input: EpochRunnerInput = idleInput,
  options: EpochRunnerStepOptions = {}
): EpochRunnerState {
  if (previousState.status !== 'running') {
    return previousState
  }

  const rng = options.rng ?? Math.random
  const clampedDeltaMs = Math.max(0, Math.min(MAX_DELTA_MS, deltaMs))
  const deltaSeconds = clampedDeltaMs / 1000
  const stageConfig = getStageConfig(previousState.currentStage)
  const speed = stageConfig.baseSpeed + Math.min(stageConfig.maxSpeedBonus, previousState.stageDistance * stageConfig.speedRamp)
  const distanceGain = speed * deltaSeconds * 0.12
  const distance = previousState.distance + distanceGain
  const stageDistance = previousState.stageDistance + distanceGain
  const stageTimeMs = previousState.stageTimeMs + clampedDeltaMs
  const player = stepPlayer(previousState.player, input, deltaSeconds, clampedDeltaMs, previousState.duckDashUnlocked)

  let nextSpawnId = previousState.nextSpawnId
  const obstacles = previousState.obstacles
    .map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - (speed * deltaSeconds)
    }))
    .filter((obstacle) => obstacle.x + obstacle.width > -20)

  const collectibles = previousState.collectibles
    .map((collectible) => ({
      ...collectible,
      x: collectible.x - (speed * deltaSeconds),
      bobPhase: collectible.bobPhase + (deltaSeconds * 4)
    }))
    .filter((collectible) => collectible.x + collectible.width > -20)

  let patternCooldownMs = previousState.patternCooldownMs - clampedDeltaMs
  let patternsSpawnedInStage = previousState.patternsSpawnedInStage
  if (patternCooldownMs <= 0) {
    const rightmostObstacleX = getRightmostObstacleX(obstacles)
    if (rightmostObstacleX > GAME_WIDTH - stageConfig.minPatternGapPx) {
      patternCooldownMs = PATTERN_RETRY_MS
    } else {
      const pattern = choosePattern(previousState, rng)
      const buildResult = buildPattern(pattern, nextSpawnId, rng)
      obstacles.push(...buildResult.obstacles)
      collectibles.push(...buildResult.collectibles)
      nextSpawnId = buildResult.nextSpawnId
      patternsSpawnedInStage += 1
      patternCooldownMs = getNextPatternCooldownMs(
        {
          ...previousState,
          stageDistance,
          patternsSpawnedInStage
        },
        rng
      )
    }
  }

  const playerHitBox = getPlayerHitBox(player)
  const collidedObstacle = obstacles.find((obstacle) => rectsOverlap(playerHitBox, getObstacleHitBox(obstacle)))
  if (collidedObstacle) {
    const [headline, detail] = getFailureCopy(rng)
    const score = Math.max(previousState.score, Math.round(distance * 8) + (previousState.epochsCollected * 150))
    const livesRemaining = Math.max(0, previousState.livesRemaining - 1)
    const isGameOver = livesRemaining === 0

    return {
      ...previousState,
      status: isGameOver ? 'game-over' : 'crashed',
      outcome: 'crashed',
      player,
      obstacles,
      collectibles,
      livesRemaining,
      speed,
      distance,
      stageDistance,
      stageTimeMs,
      timeMs: previousState.timeMs + clampedDeltaMs,
      score,
      patternCooldownMs,
      patternsSpawnedInStage,
      nextSpawnId,
      resultHeadline: isGameOver ? 'TRAINING RUN FAILED' : headline,
      resultDetail: isGameOver ? 'NAM-BOT dissolved into the noise floor. Reboot sequence required.' : detail
    }
  }

  let epochsCollected = previousState.epochsCollected
  let stageEpochs = previousState.stageEpochs
  let score = previousState.score
  const remainingCollectibles: EpochRunnerCollectible[] = []

  for (const collectible of collectibles) {
    if (rectsOverlap(playerHitBox, collectible)) {
      const remainingStageEpochs = Math.max(0, previousState.stageTargetEpochs - stageEpochs)
      const remainingTotalEpochs = Math.max(0, EPOCH_RUNNER_TARGET_EPOCHS - epochsCollected)
      const earnedEpochs = Math.min(collectible.value, remainingStageEpochs, remainingTotalEpochs)
      epochsCollected += earnedEpochs
      stageEpochs += earnedEpochs
      score += collectible.value * 140
      continue
    }

    remainingCollectibles.push(collectible)
  }

  score = Math.max(score, Math.round(distance * 8) + (epochsCollected * 150) + (previousState.currentStage * 90))

  const runningState: EpochRunnerState = {
    ...previousState,
    player,
    obstacles,
    collectibles: remainingCollectibles,
    epochsCollected,
    stageEpochs,
    stageTimeMs,
    score,
    distance,
    stageDistance,
    timeMs: previousState.timeMs + clampedDeltaMs,
    speed,
    patternCooldownMs,
    patternsSpawnedInStage,
    nextSpawnId
  }

  if (
    stageEpochs >= previousState.stageTargetEpochs
  ) {
    return resolveStageComplete(runningState)
  }

  return runningState
}
