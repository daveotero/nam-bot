import { app, ipcMain } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'
import { getQueueManager } from '../jobs/queueManager'
import { readLogChunk } from '../logs/logReader'

const userDataPath = app.getPath('userData')

export function setupLogsIpcHandlers(): void {
  log.info('Setting up logs IPC handlers')

  ipcMain.handle('logs:getTerminal', async (_event, jobId: string) => {
    const runtime = getQueueManager().getQueue().find((job) => job.jobId === jobId)
    const logPath = runtime?.terminalLogPath || join(userDataPath, 'workspaces', jobId, 'terminal.log')
    return (await readLogChunk(logPath, null)).content
  })

  ipcMain.handle('logs:getTerminalChunk', async (_event, jobId: string, offset: number | null) => {
    const runtime = getQueueManager().getQueue().find((job) => job.jobId === jobId)
    const logPath = runtime?.terminalLogPath || join(userDataPath, 'workspaces', jobId, 'terminal.log')
    return await readLogChunk(logPath, offset)
  })

  ipcMain.handle('logs:getDiagnostics', async () => {
    const diagPath = join(userDataPath, 'logs', 'nam-bot.log')
    const result = await readLogChunk(diagPath, null, {
      initialTailBytes: 512 * 1024,
      maxChunkBytes: 512 * 1024
    })
    return result.content || 'No diagnostics available'
  })

  log.info('Logs IPC handlers registered')
}
