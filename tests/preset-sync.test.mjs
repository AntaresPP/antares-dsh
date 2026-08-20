import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { installPresetIfMissing, installPresetsIfMissing } from '../lib/preset-sync.js'

function fixtureSource() {
  const dir = mkdtempSync(join(tmpdir(), 'antares-dsh-source-'))
  mkdirSync(join(dir, 'antares-dsh', 'skills'), { recursive: true })
  writeFileSync(join(dir, 'antares-dsh', 'agent.cordis.yml'), '# test\n')
  writeFileSync(join(dir, 'antares-dsh', 'skills', '.gitkeep'), '')
  return dir
}

test('installs a preset when the target is missing', () => {
  const source = fixtureSource()
  const target = mkdtempSync(join(tmpdir(), 'antares-dsh-target-'))
  try {
    const status = installPresetIfMissing(join(source, 'antares-dsh'), join(target, 'antares-dsh'))
    assert.equal(status, 'installed')
    assert.ok(existsSync(join(target, 'antares-dsh', 'agent.cordis.yml')))
    assert.equal(readFileSync(join(target, 'antares-dsh', 'agent.cordis.yml'), 'utf8'), '# test\n')
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  }
})

test('leaves an existing target untouched', () => {
  const source = fixtureSource()
  const target = mkdtempSync(join(tmpdir(), 'antares-dsh-target-'))
  try {
    mkdirSync(join(target, 'antares-dsh'), { recursive: true })
    writeFileSync(join(target, 'antares-dsh', 'agent.cordis.yml'), '# user edit\n')
    const status = installPresetIfMissing(join(source, 'antares-dsh'), join(target, 'antares-dsh'))
    assert.equal(status, 'existing')
    assert.equal(readFileSync(join(target, 'antares-dsh', 'agent.cordis.yml'), 'utf8'), '# user edit\n')
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  }
})

test('installPresetsIfMissing aggregates statuses', () => {
  const source = fixtureSource()
  const target = mkdtempSync(join(tmpdir(), 'antares-dsh-target-'))
  try {
    const first = installPresetsIfMissing(source, target)
    assert.deepEqual(first.installed, ['antares-dsh'])
    assert.deepEqual(first.existing, [])
    const second = installPresetsIfMissing(source, target)
    assert.deepEqual(second.installed, [])
    assert.deepEqual(second.existing, ['antares-dsh'])
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(target, { recursive: true, force: true })
  }
})
