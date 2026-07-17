import { tmpdir } from 'os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir()
  }
}))

import { compareVersions, parseNamLatencyAnalysisOutput } from './adapter'

describe('compareVersions', () => {
  it('orders NAM versions for A2 gating', () => {
    expect(compareVersions('0.13.0', '0.13.0')).toBe(0)
    expect(compareVersions('0.13.1', '0.13.0')).toBeGreaterThan(0)
    expect(compareVersions('0.12.3', '0.13.0')).toBeLessThan(0)
  })

  it('treats NAM prereleases as older than the matching stable release', () => {
    expect(compareVersions('0.13.0rc1', '0.13.0')).toBeLessThan(0)
    expect(compareVersions('0.13.0-rc.2', '0.13.0')).toBeLessThan(0)
    expect(compareVersions('0.13.0-beta3', '0.13.0')).toBeLessThan(0)
  })

  it('orders compact NAM prerelease revisions numerically', () => {
    expect(compareVersions('0.13.0rc10', '0.13.0rc2')).toBeGreaterThan(0)
    expect(compareVersions('v0.13.0a2', '0.13.0a10')).toBeLessThan(0)
  })

  it('ignores NAM build metadata', () => {
    expect(compareVersions('0.13.0+cuda', '0.13.0')).toBe(0)
  })
})

describe('parseNamLatencyAnalysisOutput', () => {
  it('parses a successful NAM latency analysis marker', () => {
    const result = parseNamLatencyAnalysisOutput([
      'Delay based on average is -41',
      'NAM_BOT_LATENCY_ANALYSIS={"ok":true,"recommendedLatency":-42,"inputVersion":"3.0.0","strongInputMatch":true,"warnings":{"matchesLookahead":false,"disagreementTooHigh":false,"notDetected":false},"delays":[-41],"errorMessage":null}'
    ].join('\n'))

    expect(result.ok).toBe(true)
    expect(result.recommendedLatency).toBe(-42)
    expect(result.inputVersion).toBe('3.0.0')
    expect(result.strongInputMatch).toBe(true)
    expect(result.warnings?.notDetected).toBe(false)
    expect(result.delays).toEqual([-41])
  })

  it('treats a missing recommendation as a failed analysis', () => {
    const result = parseNamLatencyAnalysisOutput(
      'NAM_BOT_LATENCY_ANALYSIS={"ok":false,"recommendedLatency":null,"inputVersion":"2.0.0","strongInputMatch":true,"warnings":{"matchesLookahead":false,"disagreementTooHigh":false,"notDetected":true},"delays":[],"errorMessage":"NAM did not detect a usable latency from the output audio."}'
    )

    expect(result.ok).toBe(false)
    expect(result.recommendedLatency).toBeNull()
    expect(result.inputVersion).toBe('2.0.0')
    expect(result.warnings?.notDetected).toBe(true)
    expect(result.errorMessage).toContain('did not detect')
  })
})
