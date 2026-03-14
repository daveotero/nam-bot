import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import { createDefaultUpdateStatus, type UpdateState, type UpdateStatus } from '../../shared/update'

interface StoredUpdateStatus {
  currentVersion?: string
  lastCheckedAt?: string | null
  state?: UpdateState
  latestVersion?: string | null
  releaseUrl?: string | null
  changelogUrl?: string | null
}

const userDataPath = app.getPath('userData')
const updateStatusPath = join(userDataPath, 'update-status.json')

function normalizeStoredStatus(input: StoredUpdateStatus | null | undefined): UpdateStatus {
  const baseStatus = createDefaultUpdateStatus(app.getVersion())

  return {
    currentVersion: typeof input?.currentVersion === 'string' && input.currentVersion.length > 0
      ? input.currentVersion
      : baseStatus.currentVersion,
    lastCheckedAt: typeof input?.lastCheckedAt === 'string' ? input.lastCheckedAt : null,
    state: input?.state ?? baseStatus.state,
    latestVersion: typeof input?.latestVersion === 'string' ? input.latestVersion : null,
    releaseUrl: typeof input?.releaseUrl === 'string' ? input.releaseUrl : null,
    changelogUrl: typeof input?.changelogUrl === 'string' ? input.changelogUrl : null
  }
}

export function loadUpdateStatus(): UpdateStatus {
  try {
    if (!existsSync(updateStatusPath)) {
      return createDefaultUpdateStatus(app.getVersion())
    }

    const data = readFileSync(updateStatusPath, 'utf-8')
    const parsed = JSON.parse(data) as StoredUpdateStatus
    return normalizeStoredStatus(parsed)
  } catch (error) {
    log.error('Failed to load update status:', error)
    return createDefaultUpdateStatus(app.getVersion())
  }
}

export function saveUpdateStatus(status: UpdateStatus): void {
  try {
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }

    writeFileSync(updateStatusPath, JSON.stringify(status, null, 2), 'utf-8')
  } catch (error) {
    log.error('Failed to save update status:', error)
  }
}
