const { ensureMacNodePtySpawnHelpers } = require('./node-pty-macos.cjs')

const root = process.argv[2] || 'release'

try {
  ensureMacNodePtySpawnHelpers(root)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
