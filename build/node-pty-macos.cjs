const { readdirSync, statSync, chmodSync } = require('fs')
const { join, sep } = require('path')

function findNodePtySpawnHelpers(root) {
  const matches = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      const normalized = fullPath.split(sep).join('/')
      if (entry.isFile() && entry.name === 'spawn-helper' && normalized.includes('/node_modules/node-pty/')) {
        matches.push(fullPath)
      }
    }
  }

  return matches.sort()
}

function formatMode(mode) {
  return `0${(mode & 0o777).toString(8)}`
}

function ensureMacNodePtySpawnHelpers(root, options = {}) {
  const logger = options.logger ?? console
  const helpers = findNodePtySpawnHelpers(root)

  if (helpers.length === 0) {
    throw new Error(`node-pty spawn-helper was not found under ${root}`)
  }

  for (const helper of helpers) {
    const before = statSync(helper)
    if ((before.mode & 0o111) === 0) {
      chmodSync(helper, 0o755)
    }

    const after = statSync(helper)
    if ((after.mode & 0o111) === 0) {
      throw new Error(`node-pty spawn-helper is not executable after chmod: ${helper} (${formatMode(after.mode)})`)
    }

    logger.log(`Verified node-pty spawn-helper: ${helper} (${formatMode(after.mode)})`)
  }

  return helpers
}

module.exports = {
  ensureMacNodePtySpawnHelpers,
  findNodePtySpawnHelpers,
  formatMode
}
