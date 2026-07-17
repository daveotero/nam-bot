const assert = require('node:assert/strict')
const test = require('node:test')

const {
  getPreviewMetadata,
  getReleaseMetadata,
  parsePackageVersion
} = require('./release-metadata.cjs')

test('accepts matching stable release metadata', () => {
  assert.deepEqual(
    getReleaseMetadata('{"version":"1.2.3"}', '## [1.2.3] - 2026-07-16\n', 'v1.2.3'),
    { version: '1.2.3', releaseTag: 'v1.2.3', prerelease: false }
  )
})

test('marks prerelease package versions as prereleases', () => {
  assert.deepEqual(
    getReleaseMetadata('{"version":"1.2.3-rc.2"}', '## [1.2.3-rc.2]\n', 'v1.2.3-rc.2'),
    { version: '1.2.3-rc.2', releaseTag: 'v1.2.3-rc.2', prerelease: true }
  )
})

test('does not mistake hyphenated build metadata for a prerelease', () => {
  assert.deepEqual(
    getReleaseMetadata('{"version":"1.2.3+build-2"}', '## [1.2.3+build-2]\n', 'v1.2.3+build-2'),
    { version: '1.2.3+build-2', releaseTag: 'v1.2.3+build-2', prerelease: false }
  )
})

test('rejects a release tag that differs from package.json', () => {
  assert.throws(
    () => getReleaseMetadata('{"version":"1.2.3"}', '## [1.2.3]\n', 'v1.2.4'),
    /does not match/
  )
})

test('rejects a release without a matching changelog section', () => {
  assert.throws(
    () => getReleaseMetadata('{"version":"1.2.3"}', '## [Unreleased]\n', 'v1.2.3'),
    /missing a release section/
  )
})

test('rejects non-SemVer package versions', () => {
  assert.throws(() => parsePackageVersion('{"version":"1.02.3"}'), /Semantic Version/)
})

test('creates a unique SemVer preview version from the run and commit', () => {
  assert.deepEqual(
    getPreviewMetadata('{"version":"1.2.3"}', '42', 'ABCDEF0123456789'),
    {
      baseVersion: '1.2.3',
      previewVersion: '1.2.3-preview.42.gabcdef0',
      shortSha: 'abcdef0',
      previewTag: 'preview-main-42-abcdef0'
    }
  )
})

test('keeps an all-numeric short SHA valid as a SemVer identifier', () => {
  const metadata = getPreviewMetadata('{"version":"1.2.3"}', '42', '0123456789abcdef')

  assert.equal(metadata.previewVersion, '1.2.3-preview.42.g0123456')
  assert.equal(parsePackageVersion(`{"version":"${metadata.previewVersion}"}`), metadata.previewVersion)
})
