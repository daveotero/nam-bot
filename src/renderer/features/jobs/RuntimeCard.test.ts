import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { defaultJobSpec, type JobRuntimeState } from '../../state/types'
import RuntimeCard, { type RuntimeArtifactTarget } from './RuntimeCard'

(globalThis as unknown as { React: typeof React }).React = React

function buildRuntime(overrides: Partial<JobRuntimeState> = {}): JobRuntimeState {
  return {
    jobId: 'failed-runtime-card',
    jobName: 'Failed Runtime Card',
    status: 'failed',
    pid: null,
    frozenJob: {
      ...defaultJobSpec,
      id: 'failed-runtime-card',
      name: 'Failed Runtime Card',
      createdAt: '2026-07-03T12:00:00.000Z',
      updatedAt: '2026-07-03T12:00:00.000Z'
    },
    userMessages: ['Training exited with code 1.'],
    ...overrides
  }
}

function renderRuntimeCard(runtime: JobRuntimeState): string {
  return renderToStaticMarkup(React.createElement(RuntimeCard, {
    runtime,
    presets: [],
    nowMs: Date.parse('2026-07-03T12:00:00.000Z'),
    isExpanded: false,
    isLogsVisible: false,
    terminalLog: '',
    isLoadingLog: false,
    onToggleExpanded: () => undefined,
    onToggleLogs: async () => undefined,
    onCancel: async () => undefined,
    onForceStop: async () => undefined,
    onCreateDraftFromRuntime: async () => undefined,
    onOpenFolder: async () => undefined,
    onOpenArtifact: async (_jobId: string, _target: RuntimeArtifactTarget) => undefined
  }))
}

describe('RuntimeCard finished recovery actions', () => {
  it('uses Create Draft instead of Retry for failed jobs', () => {
    const html = renderRuntimeCard(buildRuntime())

    expect(html).toContain('Create Draft')
    expect(html).toContain('Create an editable draft from this failed or stopped job')
    expect(html).not.toContain('Retry')
  })
})
