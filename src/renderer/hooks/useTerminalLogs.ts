import { useCallback, useRef, useState } from 'react'

const MAX_RENDERED_LOG_CHARACTERS = 512 * 1024
const CLIENT_TRUNCATION_NOTICE = '[Earlier displayed log output omitted]\n'

function limitRenderedLog(content: string): string {
  if (content.length <= MAX_RENDERED_LOG_CHARACTERS) {
    return content
  }
  return `${CLIENT_TRUNCATION_NOTICE}${content.slice(-MAX_RENDERED_LOG_CHARACTERS)}`
}

interface TerminalLogsState {
  logContents: Record<string, string>
  loadingLogIds: Set<string>
  loadTerminalLog: (jobId: string) => Promise<void>
  clearTerminalLog: (jobId: string) => void
}

export function useTerminalLogs(): TerminalLogsState {
  const [logContents, setLogContents] = useState<Record<string, string>>({})
  const [loadingLogIds, setLoadingLogIds] = useState<Set<string>>(() => new Set())
  const offsetsRef = useRef<Record<string, number>>({})
  const inFlightRef = useRef<Set<string>>(new Set())

  const loadTerminalLog = useCallback(async (jobId: string): Promise<void> => {
    if (inFlightRef.current.has(jobId)) {
      return
    }

    inFlightRef.current.add(jobId)
    setLoadingLogIds((current) => new Set(current).add(jobId))
    try {
      const offset = offsetsRef.current[jobId] ?? null
      const chunk = await window.namBot.logs.getTerminalChunk(jobId, offset)
      offsetsRef.current[jobId] = chunk.nextOffset
      if (chunk.content.length === 0 && !chunk.reset) {
        return
      }
      setLogContents((current) => ({
        ...current,
        [jobId]: limitRenderedLog(chunk.reset
          ? chunk.content
          : `${current[jobId] ?? ''}${chunk.content}`)
      }))
    } catch (error) {
      console.error(`Failed to load terminal log for ${jobId}:`, error)
    } finally {
      inFlightRef.current.delete(jobId)
      setLoadingLogIds((current) => {
        const next = new Set(current)
        next.delete(jobId)
        return next
      })
    }
  }, [])

  const clearTerminalLog = useCallback((jobId: string): void => {
    delete offsetsRef.current[jobId]
    setLogContents((current) => {
      const next = { ...current }
      delete next[jobId]
      return next
    })
  }, [])

  return {
    logContents,
    loadingLogIds,
    loadTerminalLog,
    clearTerminalLog
  }
}
