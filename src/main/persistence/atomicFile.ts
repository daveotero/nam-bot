import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'

interface AtomicWriteOptions {
  backup?: boolean
}

function writeTemporaryFile(targetPath: string, contents: string): string {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  const descriptor = openSync(temporaryPath, 'wx')
  try {
    writeFileSync(descriptor, contents, 'utf-8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  return temporaryPath
}

export function atomicWriteFileSync(
  targetPath: string,
  contents: string,
  options?: AtomicWriteOptions
): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  let temporaryPath: string | null = writeTemporaryFile(targetPath, contents)

  try {
    if (options?.backup !== false && existsSync(targetPath)) {
      const backupPath = `${targetPath}.bak`
      const backupContents = readFileSync(targetPath, 'utf-8')
      atomicWriteFileSync(backupPath, backupContents, { backup: false })
    }

    renameSync(temporaryPath, targetPath)
    temporaryPath = null
  } finally {
    if (temporaryPath && existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function atomicWriteJsonSync(targetPath: string, value: unknown): void {
  atomicWriteFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`)
}

export function readJsonWithBackupSync(targetPath: string): unknown {
  try {
    return JSON.parse(readFileSync(targetPath, 'utf-8')) as unknown
  } catch (primaryError) {
    const backupPath = `${targetPath}.bak`
    if (!existsSync(backupPath)) {
      throw primaryError
    }
    return JSON.parse(readFileSync(backupPath, 'utf-8')) as unknown
  }
}

export function removeFileIfExistsSync(targetPath: string): void {
  rmSync(targetPath, { force: true })
}
