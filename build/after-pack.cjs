const { ensureMacNodePtySpawnHelpers } = require('./node-pty-macos.cjs')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  ensureMacNodePtySpawnHelpers(context.appOutDir)
}
