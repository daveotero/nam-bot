const { appendFileSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function parsePackageVersion(packageJsonContent) {
  let parsed
  try {
    parsed = JSON.parse(packageJsonContent)
  } catch (error) {
    throw new Error(`package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!parsed || typeof parsed.version !== 'string' || !SEMVER_PATTERN.test(parsed.version)) {
    throw new Error('package.json version must be a valid Semantic Version')
  }

  return parsed.version
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getReleaseMetadata(packageJsonContent, changelogContent, releaseTag) {
  const version = parsePackageVersion(packageJsonContent)
  const versionMatch = SEMVER_PATTERN.exec(version)
  if (!versionMatch) {
    throw new Error('Unable to parse package.json version')
  }
  const expectedTag = `v${version}`

  if (releaseTag !== expectedTag) {
    throw new Error(`Release tag ${JSON.stringify(releaseTag)} does not match package.json version ${JSON.stringify(expectedTag)}`)
  }

  const changelogHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+.+)?\\s*$`, 'm')
  if (!changelogHeading.test(changelogContent)) {
    throw new Error(`CHANGELOG.md is missing a release section for ${version}`)
  }

  return {
    version,
    releaseTag: expectedTag,
    prerelease: versionMatch[4] != null
  }
}

function getPreviewMetadata(packageJsonContent, runNumber, commitSha) {
  const packageVersion = parsePackageVersion(packageJsonContent)
  const match = SEMVER_PATTERN.exec(packageVersion)
  if (!match) {
    throw new Error('Unable to parse package.json version')
  }
  if (!/^[1-9]\d*$/.test(runNumber)) {
    throw new Error('GITHUB_RUN_NUMBER must be a positive integer')
  }
  if (!/^[0-9a-fA-F]{7,40}$/.test(commitSha)) {
    throw new Error('GITHUB_SHA must be a 7-40 character hexadecimal commit hash')
  }

  const baseVersion = `${match[1]}.${match[2]}.${match[3]}`
  const shortSha = commitSha.slice(0, 7).toLowerCase()
  return {
    baseVersion,
    previewVersion: `${baseVersion}-preview.${runNumber}.g${shortSha}`,
    shortSha,
    previewTag: `preview-main-${runNumber}-${shortSha}`
  }
}

function writeOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${String(value)}`)
  if (outputPath) {
    appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

function run() {
  const command = process.argv[2]
  const packageJsonContent = readFileSync(resolve('package.json'), 'utf8')

  if (command === 'release') {
    const changelogContent = readFileSync(resolve('CHANGELOG.md'), 'utf8')
    const metadata = getReleaseMetadata(packageJsonContent, changelogContent, process.env.RELEASE_TAG || '')
    writeOutputs({
      version: metadata.version,
      release_tag: metadata.releaseTag,
      prerelease: metadata.prerelease
    })
    return
  }

  if (command === 'preview') {
    const metadata = getPreviewMetadata(
      packageJsonContent,
      process.env.GITHUB_RUN_NUMBER || '',
      process.env.GITHUB_SHA || ''
    )
    writeOutputs({
      base_version: metadata.baseVersion,
      preview_version: metadata.previewVersion,
      short_sha: metadata.shortSha,
      preview_tag: metadata.previewTag
    })
    return
  }

  throw new Error('Usage: node build/release-metadata.cjs <release|preview>')
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  getPreviewMetadata,
  getReleaseMetadata,
  parsePackageVersion
}
