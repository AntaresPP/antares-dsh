import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const presetDir = new URL('../agent-presets/antares-dsh/', import.meta.url)
const yml = readFileSync(new URL('agent.cordis.yml', presetDir), 'utf8')

const EXPECTED_TOOLS = ['explorer', 'oracle', 'librarian', 'designer', 'fixer', 'council', 'councillor-alpha', 'councillor-beta']

test('preset contains the full specialist tool matrix', () => {
  for (const tool of EXPECTED_TOOLS) {
    assert.match(yml, new RegExp(`toolName: ${tool}\\b`), `missing toolName ${tool}`)
  }
  assert.equal(yml.split('- id: agent-').length - 1, 8)
})

test('preset contains official service rows', () => {
  for (const pkg of [
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-tool-fs',
    '@deepseek-ai/dsh-tool-fs-search',
    '@deepseek-ai/dsh-tool-jobs',
    '@deepseek-ai/dsh-plan-mode',
    '@deepseek-ai/dsh-tool-subagent-control',
    '@deepseek-ai/dsh-tool-skill',
    '@deepseek-ai/dsh-tool-web',
  ]) {
    assert.ok(yml.includes(pkg), `missing ${pkg}`)
  }
})

test('preset has no opencode/slim leftovers in executable rows', () => {
  const NL = String.fromCharCode(10)
  const rows = yml.split(NL).filter((line) => !line.trimStart().startsWith('#'))
  const executable = rows.join(NL)
  assert.equal(executable.includes('.slim/'), false)
  assert.equal(executable.includes('.opencode/'), false)
})
test('platform shell filter is computed per platform', () => {
  assert.match(yml, /process\.platform === 'win32'/)
  assert.match(yml, /'pwsh'/)
  assert.match(yml, /'bash'/)
})

test('skills directory contains exactly the 8 approved skills with valid frontmatter', () => {
  const skillsRoot = new URL('skills/', presetDir)
  const dirs = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  assert.deepEqual(dirs, ['antares-dsh', 'clonedeps', 'codemap', 'deepwork', 'reflect', 'simplify', 'verification-planning', 'worktrees'])

  for (const dir of dirs) {
    const body = readFileSync(new URL(`${dir}/SKILL.md`, skillsRoot), 'utf8').split(String.fromCharCode(13,10)).join(String.fromCharCode(10))
    assert.match(body, new RegExp(`^---\s*\nname: ${dir}\s*\n`), `${dir} frontmatter name mismatch`)
    assert.match(body, /^description: .+\n/m, `${dir} missing description`)
  }
})

test('package files referenced by the bundle manifest exist', () => {
  for (const rel of ['lib/index.js', 'cordis.patch.yml', 'agent-presets/antares-dsh/preset.yml']) {
    assert.ok(existsSync(new URL(rel, root)), `missing ${rel}`)
  }
})

test('host plugin has no runtime import of @deepseek-ai packages', () => {
  const index = readFileSync(new URL('lib/index.js', root), 'utf8')
  const commands = readFileSync(new URL('lib/commands.js', root), 'utf8')
  const ast = readFileSync(new URL('lib/ast-grep.js', root), 'utf8')
  for (const source of [index, commands, ast]) {
    assert.doesNotMatch(source, /from ['"]@deepseek-ai\//)
    assert.doesNotMatch(source, /require\(['"]@deepseek-ai\//)
  }
})
