import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LANGUAGES,
  assertReplaceArgs,
  assertSearchArgs,
  buildArgs,
  formatReplaceText,
  formatSearchText,
  parseAstGrepJson,
} from '../lib/ast-grep.js'

test('LANGUAGES matches the slim 25-language set', () => {
  assert.equal(LANGUAGES.length, 25)
  assert.ok(LANGUAGES.includes('typescript'))
  assert.ok(LANGUAGES.includes('tsx'))
  assert.ok(LANGUAGES.includes('python'))
  assert.ok(LANGUAGES.includes('yaml'))
})

test('buildArgs produces search args with defaults', () => {
  const args = buildArgs({ pattern: 'console.log($MSG)', lang: 'typescript' })
  assert.deepEqual(args, ['run', '-p', 'console.log($MSG)', '--lang', 'typescript', '--json=compact', '.'])
})

test('buildArgs adds rewrite/context/globs/paths for JSON preview', () => {
  const args = buildArgs({
    pattern: 'console.log($MSG)',
    rewrite: 'logger.info($MSG)',
    lang: 'typescript',
    updateAll: true,
    context: 2,
    globs: ['src/**', '!vendor/**'],
    paths: ['src'],
  })
  assert.deepEqual(args, [
    'run', '-p', 'console.log($MSG)', '--lang', 'typescript', '--json=compact',
    '-r', 'logger.info($MSG)', '-C', '2',
    '--globs', 'src/**', '--globs', '!vendor/**', 'src',
  ])
})

test('buildArgs apply mode omits json and adds update-all', () => {
  const args = buildArgs({
    pattern: 'console.log($MSG)',
    rewrite: 'logger.info($MSG)',
    lang: 'typescript',
    updateAll: true,
    paths: ['src'],
  }, { json: false })
  assert.deepEqual(args, [
    'run', '-p', 'console.log($MSG)', '--lang', 'typescript',
    '-r', 'logger.info($MSG)', '--update-all', 'src',
  ])
})

test('buildArgs omits context when 0', () => {
  const args = buildArgs({ pattern: 'x', lang: 'python', context: 0 })
  assert.ok(!args.includes('-C'))
})

test('parseAstGrepJson accepts array and ndjson', () => {
  const match = { file: 'a.ts', range: { start: { line: 2 } }, text: 'x' }
  assert.deepEqual(parseAstGrepJson(JSON.stringify([match])), [match])
  const ndjson = `${JSON.stringify(match)}\n${JSON.stringify({ ...match, file: 'b.ts' })}\n`
  assert.equal(parseAstGrepJson(ndjson).length, 2)
})

test('assertSearchArgs validates required and bounded inputs', () => {
  assert.throws(() => assertSearchArgs({}), /pattern/)
  assert.throws(() => assertSearchArgs({ pattern: 'x', lang: 'nope' }), /lang/)
  assert.throws(() => assertSearchArgs({ pattern: 'x'.repeat(2001), lang: 'tsx' }), /too long/)
  assert.throws(() => assertSearchArgs({ pattern: 'x', lang: 'tsx', context: 11 }), /context/)
  assert.doesNotThrow(() => assertSearchArgs({ pattern: 'x', lang: 'tsx', paths: ['src'], globs: ['**'], context: 0 }))
})

test('assertReplaceArgs requires rewrite and validates dryRun', () => {
  assert.throws(() => assertReplaceArgs({ pattern: 'x', lang: 'tsx' }), /rewrite/)
  assert.throws(() => assertReplaceArgs({ pattern: 'x', rewrite: 'y', lang: 'tsx', dryRun: 'no' }), /dryRun/)
  assert.doesNotThrow(() => assertReplaceArgs({ pattern: 'x', rewrite: 'y', lang: 'tsx', dryRun: false }))
})

test('formatSearchText groups matches by file and reports truncation', () => {
  const value = {
    matches: [
      { file: 'a.ts', line: 3, text: 'console.log(x)' },
      { file: 'a.ts', line: 7, text: 'console.log(y)' },
      { file: 'b.ts', line: 1, text: 'x' },
    ],
    total: 3,
    truncated: true,
    truncatedReason: 'max_matches',
  }
  const text = formatSearchText(value)
  assert.match(text, /\na\.ts:/)
  assert.match(text, /3: console\.log\(x\)/)
  assert.match(text, /b\.ts:/)
  assert.match(text, /Found 3 matches in 2 files/)
  assert.match(text, /max_matches/)
})

test('formatReplaceText shows dry-run by default and applied mode', () => {
  const value = {
    files: [{ path: 'a.ts', line: 3, before: 'console.log(x)', after: 'logger.info(x)' }],
    total: 1,
    applied: false,
    truncated: false,
  }
  const dry = formatReplaceText(value)
  assert.match(dry, /DRY RUN/)
  assert.match(dry, /dryRun=false/)
  const applied = formatReplaceText({ ...value, applied: true })
  assert.match(applied, /APPLIED/)
  assert.doesNotMatch(applied, /dryRun=false/)
})
