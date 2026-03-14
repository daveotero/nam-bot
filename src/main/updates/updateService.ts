import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { createDefaultUpdateStatus, type UpdateStatus } from '../../shared/update'
import { loadUpdateStatus, saveUpdateStatus } from '../persistence/updateStore'

interface GitHubReleasePayload {
  tag_name?: string
  html_url?: string
}

const GITHUB_LATEST_RELEASE_API_URL = 'https://api.github.com/repos/daveotero/nam-bot/releases/latest'
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const SPOOF_UPDATE_VERSION_ENV = 'NAM_BOT_SPOOF_UPDATE_VERSION'
const SPOOF_UPDATE_URL_ENV = 'NAM_BOT_SPOOF_UPDATE_URL'

let cachedStatus: UpdateStatus | null = null
let activeCheckPromise: Promise<UpdateStatus> | null = null

function broadcastUpdateStatus(status: UpdateStatus): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('updates:statusChanged', status)
  })
}

function getCachedStatus(): UpdateStatus {
  if (!cachedStatus) {
    cachedStatus = loadUpdateStatus()
  }

  const currentVersion = app.getVersion()
  if (cachedStatus.currentVersion !== currentVersion) {
    const latestVersion = cachedStatus.latestVersion
    const isStillOutdated =
      typeof latestVersion === 'string'
      && latestVersion.length > 0
      && compareVersions(latestVersion, currentVersion) > 0

    cachedStatus = {
      ...cachedStatus,
      currentVersion,
      state: isStillOutdated ? 'update-available' : 'idle',
      releaseUrl: isStillOutdated ? cachedStatus.releaseUrl : null,
      changelogUrl: isStillOutdated ? cachedStatus.changelogUrl : null,
      latestVersion: isStillOutdated ? latestVersion : null
    }
  }

  return cachedStatus
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function parseVersion(version: string): number[] {
  return normalizeVersion(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

function shouldUseCachedStatus(status: UpdateStatus): boolean {
  if (!status.lastCheckedAt) {
    return false
  }

  const lastCheckedTime = new Date(status.lastCheckedAt).getTime()
  if (!Number.isFinite(lastCheckedTime)) {
    return false
  }

  return (Date.now() - lastCheckedTime) < UPDATE_CHECK_INTERVAL_MS
}

function getSpoofedUpdateStatus(): UpdateStatus | null {
  const spoofedVersion = process.env[SPOOF_UPDATE_VERSION_ENV]?.trim()
  if (!spoofedVersion) {
    return null
  }

  const currentVersion = app.getVersion()
  const normalizedSpoofedVersion = normalizeVersion(spoofedVersion)
  if (compareVersions(normalizedSpoofedVersion, currentVersion) <= 0) {
    return null
  }

  const releaseUrl = process.env[SPOOF_UPDATE_URL_ENV]?.trim() || 'https://github.com/daveotero/nam-bot/releases/latest'
  return {
    currentVersion,
    lastCheckedAt: new Date().toISOString(),
    state: 'update-available',
    latestVersion: normalizedSpoofedVersion,
    releaseUrl,
    changelogUrl: releaseUrl
  }
}

async function fetchLatestRelease(): Promise<GitHubReleasePayload> {
  const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `NAM-BOT/${app.getVersion()}`
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub update check failed with status ${response.status}`)
  }

  return await response.json() as GitHubReleasePayload
}

function buildSuccessStatus(previousStatus: UpdateStatus, payload: GitHubReleasePayload): UpdateStatus {
  const nowIso = new Date().toISOString()
  const latestVersion = normalizeVersion(payload.tag_name ?? '')
  const releaseUrl = payload.html_url ?? null
  const isUpdateAvailable =
    latestVersion.length > 0
    && compareVersions(latestVersion, previousStatus.currentVersion) > 0

  return {
    currentVersion: previousStatus.currentVersion,
    lastCheckedAt: nowIso,
    state: isUpdateAvailable ? 'update-available' : 'up-to-date',
    latestVersion: latestVersion.length > 0 ? latestVersion : null,
    releaseUrl: isUpdateAvailable ? releaseUrl : null,
    changelogUrl: isUpdateAvailable ? releaseUrl : null
  }
}

function buildErrorStatus(previousStatus: UpdateStatus): UpdateStatus {
  const nowIso = new Date().toISOString()

  if (previousStatus.state === 'update-available' || previousStatus.state === 'up-to-date') {
    return {
      ...previousStatus,
      lastCheckedAt: nowIso
    }
  }

  return {
    ...createDefaultUpdateStatus(previousStatus.currentVersion),
    lastCheckedAt: nowIso,
    state: 'error'
  }
}

function persistAndCache(status: UpdateStatus, shouldBroadcast: boolean): UpdateStatus {
  cachedStatus = status
  saveUpdateStatus(status)
  if (shouldBroadcast) {
    broadcastUpdateStatus(status)
  }
  return status
}

export function getUpdateStatus(): UpdateStatus {
  return getCachedStatus()
}

export async function checkForUpdates(force = false): Promise<UpdateStatus> {
  const spoofedStatus = getSpoofedUpdateStatus()
  if (spoofedStatus) {
    return persistAndCache(spoofedStatus, true)
  }

  const currentStatus = getCachedStatus()
  if (!force && shouldUseCachedStatus(currentStatus)) {
    return currentStatus
  }

  if (activeCheckPromise) {
    return await activeCheckPromise
  }

  activeCheckPromise = (async (): Promise<UpdateStatus> => {
    try {
      const latestRelease = await fetchLatestRelease()
      const nextStatus = buildSuccessStatus(currentStatus, latestRelease)
      return persistAndCache(nextStatus, true)
    } catch (error) {
      log.error('Background update check failed:', error)
      const nextStatus = buildErrorStatus(currentStatus)
      return persistAndCache(nextStatus, currentStatus.state !== nextStatus.state)
    } finally {
      activeCheckPromise = null
    }
  })()

  return await activeCheckPromise
}
