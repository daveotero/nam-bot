export interface LogChunk {
  content: string
  nextOffset: number
  reset: boolean
  truncated: boolean
}
