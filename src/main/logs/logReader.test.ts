import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { readLogChunk } from './logReader'

const temporaryDirectories: string[] = []

function createLog(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'nam-bot-log-reader-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'terminal.log')
  writeFileSync(filePath, contents, 'utf-8')
  return filePath
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('readLogChunk', () => {
  it('returns only an initial bounded tail for a large log', async () => {
    const filePath = createLog('first line\nsecond line\nthird line\n')
    const result = await readLogChunk(filePath, null, { initialTailBytes: 24, maxChunkBytes: 24 })

    expect(result.reset).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.content).toContain('[Earlier log output omitted]')
    expect(result.content).toContain('third line')
  })

  it('returns the complete initial tail even when incremental chunks are smaller', async () => {
    const filePath = createLog('first line\nsecond line\nthird line\n')
    const result = await readLogChunk(filePath, null, { initialTailBytes: 24, maxChunkBytes: 5 })

    expect(result.nextOffset).toBe(Buffer.byteLength('first line\nsecond line\nthird line\n'))
    expect(result.content).toContain('third line')
  })

  it('reads only bytes appended after the previous offset', async () => {
    const filePath = createLog('first\n')
    const first = await readLogChunk(filePath, null)
    writeFileSync(filePath, 'first\nsecond\n', 'utf-8')
    const second = await readLogChunk(filePath, first.nextOffset)

    expect(second.reset).toBe(false)
    expect(second.content).toBe('second\n')
  })

  it('resets safely when a log is replaced with a shorter file', async () => {
    const filePath = createLog('a much longer original log\n')
    const first = await readLogChunk(filePath, null)
    writeFileSync(filePath, 'new\n', 'utf-8')
    const second = await readLogChunk(filePath, first.nextOffset)

    expect(second.reset).toBe(true)
    expect(second.content).toBe('new\n')
    expect(second.nextOffset).toBe(4)
  })
})
