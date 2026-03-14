export type UpdateState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'error'

export interface UpdateStatus {
  currentVersion: string
  lastCheckedAt: string | null
  state: UpdateState
  latestVersion: string | null
  releaseUrl: string | null
  changelogUrl: string | null
}

export function createDefaultUpdateStatus(currentVersion: string): UpdateStatus {
  return {
    currentVersion,
    lastCheckedAt: null,
    state: 'idle',
    latestVersion: null,
    releaseUrl: null,
    changelogUrl: null
  }
}
