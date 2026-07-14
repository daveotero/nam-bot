import { describe, expect, it } from 'vitest'

import { shouldAutoLoadResource } from './store'

describe('diagnostic auto-loading', () => {
  it('loads an idle resource once', () => {
    expect(shouldAutoLoadResource(null, false, null)).toBe(true)
  })

  it('does not automatically retry a failed resource', () => {
    expect(shouldAutoLoadResource(null, false, 'probe failed')).toBe(false)
  })

  it('does not overlap an in-flight request', () => {
    expect(shouldAutoLoadResource(null, true, null)).toBe(false)
  })
})
