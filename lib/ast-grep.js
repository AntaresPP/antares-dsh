/**
 * antares-dsh ast-grep tools.
 *
 * Registered with raw JSON-Schema definitions (no @deepseek-ai/dsh-tools
 * import) so the plugin stays loadable in community dsh profiles.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolveAstGrepPath, describeInstallHint } from './ast-grep-bin.js'

export const LANGUAGES = [
  'bash', 'c', 'cpp', 'csharp', 'css', 'elixir', 'go', 'haskell', 'html',
  'java', 'javascript', 'json', 'kotlin', 'lua', 'nix', 'php', 'python',
  'ruby', 'rust', 'scala', 'solidity', 'swift', 'typescript', 'tsx', 'yaml',
]

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024
const DEFAULT_MAX_MATCHES = 500
const MAX_STRING = 2000
const MAX_LIST = 64
const MAX_CONTEXT = 10

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function assertSearchArgs(args) {
  if (!isNonEmptyString(args?.pattern)) throw new Error('pattern must be a non-empty string')
  if (!LANGUAGES.includes(args?.lang)) throw new Error(`lang must be one of: ${LANGUAGES.join(', ')}`)
  if (args.pattern.length > MAX_STRING) throw new Error(`pattern is too long (max ${MAX_STRING})`)
  if (args.paths !== undefined && (!Array.isArray(args.paths) || args.paths.length > MAX_LIST)) {
    throw new Error(`paths must be an array of at most ${MAX_LIST} strings`)
  }
  if (args.globs !== undefined && (!Array.isArray(args.globs) || args.globs.length > MAX_LIST)) {
    throw new Error(`globs must be an array of at most ${MAX_LIST} strings`)
  }
  if (args.context !== undefined && (!Number.isInteger(args.context) || args.context < 0 || args.context > MAX_CONTEXT)) {
    throw new Error(`context must be an integer between 0 and ${MAX_CONTEXT}`)
  }
}

function assertReplaceArgs(args) {
  assertSearchArgs(args)
  if (!isNonEmptyString(args.rewrite)) throw new Error('rewrite must be a non-empty string')
  if (args.rewrite.length > MAX_STRING) throw new Error(`rewrite is too long (max ${MAX_STRING})`)
  if (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') throw new Error('dryRun must be a boolean')
}

function buildArgs(options, { json = true } = {}) {
  const args = ['run', '-p', options.pattern, '--lang', options.lang]
  if (json) args.push('--json=compact')
  if (options.rewrite) {
    args.push('-r', options.rewrite)
    if (options.updateAll && !json) args.push('--update-all')
  }
  if (Number.isInteger(options.context) && options.context > 0) args.push('-C', String(options.context))
  for (const glob of options.globs ?? []) args.push('--globs', glob)
  const paths = Array.isArray(options.paths) && options.paths.length > 0 ? options.paths : ['.']
  args.push(...paths)
  return args
}

function parseAstGrepJson(stdout) {
  if (!stdout.trim()) return []
  try {
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : (parsed.matches ?? [])
  } catch {
    // Compact output is normally a JSON array; tolerate one-object-per-line.
    const out = []
    for (const line of stdout.split(String.fromCharCode(10))) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try { out.push(JSON.parse(trimmed)) } catch { /* skip malformed trailing line */ }
    }
    return out
  }
}

function normalizeMatches(rawMatches, { forReplace = false } = {}) {
  return rawMatches
    .slice(0, DEFAULT_MAX_MATCHES)
    .map((m) => ({
      file: String(m?.file ?? ''),
      line: Number(m?.range?.start?.line ?? -1) + 1,
      text: String(m?.text ?? m?.lines ?? ''),
      replacement: forReplace && m?.replacement != null ? String(m.replacement) : undefined,
    }))
    .filter((m) => m.file !== '' && m.line > 0)
}

async function runOne(binary, args, signal) {
  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  let truncated = false
  child.stdout.on('data', (chunk) => {
    if (stdout.length >= DEFAULT_MAX_OUTPUT_BYTES) return
    const rest = DEFAULT_MAX_OUTPUT_BYTES - stdout.length
    stdout += chunk.slice(0, rest)
    if (stdout.length >= DEFAULT_MAX_OUTPUT_BYTES) truncated = true
  })
  child.stderr.on('data', (chunk) => {
    if (stderr.length < DEFAULT_MAX_OUTPUT_BYTES) stderr += chunk.slice(0, DEFAULT_MAX_OUTPUT_BYTES - stderr.length)
  })

  const close = once(child, 'close')
  const timeoutId = setTimeout(() => child.kill(), DEFAULT_TIMEOUT_MS)
  const abort = () => child.kill()
  signal?.addEventListener('abort', abort, { once: true })

  let code
  try {
    ;[code] = await close
  } catch {
    code = null
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abort)
  }

  if (signal?.aborted) throw new Error('ast-grep cancelled')
  if (code === null && stdout.trim() === '' && !stderr.trim()) throw new Error('ast-grep timed out')
  return { code, stdout, stderr, truncated }
}

function resultFromStdout(stdout, truncated, forReplace) {
  const rawMatches = parseAstGrepJson(stdout)
  const matches = normalizeMatches(rawMatches, { forReplace })
  const totalMatches = rawMatches.length
  const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES
  return {
    matches,
    totalMatches,
    truncated: truncated || matchesTruncated,
    truncatedReason: truncated ? 'max_output_bytes' : matchesTruncated ? 'max_matches' : undefined,
  }
}

async function runSg(options, signal) {
  const binary = resolveAstGrepPath()
  if (!binary) throw new Error(describeInstallHint())

  // Step 1: always collect structured matches via compact JSON.
  const preview = await runOne(binary, buildArgs({ ...options, updateAll: false }), signal)
  if (preview.code !== 0 && !preview.stdout.trim()) {
    if (preview.stderr.includes('No files found')) return { matches: [], totalMatches: 0, truncated: false }
    throw new Error(preview.stderr.trim() || `ast-grep exited with code ${preview.code}`)
  }
  const result = resultFromStdout(preview.stdout, preview.truncated, options.rewrite != null)

  // Step 2: --update-all conflicts with --json, so apply with a second run
  // after the JSON preview already supplied the structured before/after view.
  if (options.updateAll && result.totalMatches > 0) {
    const apply = await runOne(binary, buildArgs({
      pattern: options.pattern,
      rewrite: options.rewrite,
      lang: options.lang,
      paths: options.paths,
      globs: options.globs,
      updateAll: true,
    }, { json: false }), signal)
    if (apply.code !== 0) throw new Error(apply.stderr.trim() || `ast-grep apply exited with code ${apply.code}`)
  }

  return result
}

function hintForEmptyResult(pattern, lang) {
  const src = pattern.trim()
  if (lang === 'python') {
    if ((src.startsWith('class ') || src.startsWith('def ') || src.startsWith('async def ')) && src.endsWith(':')) {
      return `Hint: Remove trailing colon. Try: "${src.slice(0, -1)}"`
    }
  }
  if (['javascript', 'typescript', 'tsx'].includes(lang)) {
    if (/^(export\s+)?(async\s+)?function\s+\$[A-Z_]+\s*$/i.test(src)) {
      return 'Hint: Function patterns need params and body. Try "function $NAME($$$) { $$$ }"'
    }
  }
  return null
}

function escapeOneLine(text, max = 100) {
  const one = String(text).replace(/\s*\n\s*/g, '\n')
  return one.length > max ? `${one.slice(0, max)}...` : one
}

function formatSearchText(value) {
  if (value.matches.length === 0) return 'No matches found.'
  const byFile = new Map()
  for (const match of value.matches) {
    const list = byFile.get(match.file) ?? []
    list.push(match)
    byFile.set(match.file, list)
  }
  const lines = []
  for (const [file, matches] of byFile) {
    lines.push(`\n${file}:`)
    for (const match of matches) lines.push(`  ${match.line}: ${escapeOneLine(match.text)}`)
  }
  lines.push(`\nFound ${value.total} matches in ${byFile.size} files`)
  if (value.truncated) lines.push(`(output truncated: ${value.truncatedReason})`)
  return lines.join('\n')
}

function formatReplaceText(value) {
  if (value.files.length === 0) return 'No matches found for replacement.'
  const lines = [value.applied ? '\n[APPLIED]' : '\n[DRY RUN]']
  for (const item of value.files) {
    lines.push(`${item.path}:${item.line}: "${escapeOneLine(item.before, 60)}" → "${escapeOneLine(item.after, 60)}"`)
  }
  lines.push(`\n${value.applied ? 'Applied' : 'Previewed'} ${value.total} replacement(s) in ${new Set(value.files.map((f) => f.path)).size} file(s)`)
  if (!value.applied) lines.push('To apply changes, run with dryRun=false')
  return lines.join('\n')
}

function searchResultValue(result) {
  return {
    matches: result.matches.map((m) => ({ file: m.file, line: m.line, text: m.text })),
    total: result.totalMatches,
    truncated: result.truncated,
    ...(result.truncatedReason ? { truncatedReason: result.truncatedReason } : {}),
  }
}

function replaceResultValue(result, applied) {
  return {
    files: result.matches.map((m) => ({
      path: m.file,
      line: m.line,
      before: m.text,
      after: m.replacement ?? '',
    })),
    total: result.totalMatches,
    applied,
    truncated: result.truncated,
    ...(result.truncatedReason ? { truncatedReason: result.truncatedReason } : {}),
  }
}

function textBlock(text) {
  return [{ type: 'text', text }]
}

function registerAstGrepTools(ctx) {
  ctx.tools.register({
    name: 'ast_grep_search',
    description: [
      'Search code patterns across the filesystem using AST-aware matching across 25 languages.',
      'Use meta-variables: $VAR (single node), $$$ (multiple nodes).',
      'IMPORTANT: Patterns must be complete AST nodes (valid code).',
      "For functions, include params and body: 'export async function $NAME($$$) { $$$ }', not 'export async function $NAME'.",
      "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'.",
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: {
        pattern: { type: 'string', description: 'AST pattern with meta-variables ($VAR, $$$). Must be a complete AST node.' },
        lang: { type: 'string', enum: LANGUAGES, description: 'Target language' },
        paths: { type: 'array', items: { type: 'string' }, description: "Paths to search (default: ['.'])" },
        globs: { type: 'array', items: { type: 'string' }, description: 'Include/exclude globs (prefix ! to exclude)' },
        context: { type: 'integer', description: 'Context lines around each match' },
      },
      required: ['pattern', 'lang'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                file: { type: 'string' },
                line: { type: 'integer' },
                text: { type: 'string' },
              },
              required: ['file', 'line', 'text'],
            },
          },
          total: { type: 'integer' },
          truncated: { type: 'boolean' },
          truncatedReason: { type: 'string' },
        },
        required: ['matches', 'total', 'truncated'],
      },
      render(_args, value) {
        const text = formatSearchText(value)
        const hint = value.matches.length === 0 ? hintForEmptyResult(_args.pattern, _args.lang) : null
        return textBlock(hint ? text + String.fromCharCode(10) + String.fromCharCode(10) + hint : text)
      },
      presentationMeta(_args, value) {
        return value
      },
    },    async execute(args, exec) {
      assertSearchArgs(args)
      const result = await runSg({ pattern: args.pattern, lang: args.lang, paths: args.paths, globs: args.globs, context: args.context }, exec?.signal)
      return searchResultValue(result)
    },
    presentCall(args) {
      return { card: 'generic', kind: 'search', title: `AST search (${args.lang})`, rawInput: args.pattern }
    },
    presentResult(_args, result) {
      const meta = result.meta
      if (!meta || !Array.isArray(meta.matches)) return undefined
      const byFile = new Map()
      for (const match of meta.matches) {
        const list = byFile.get(match.file) ?? []
        list.push({ lineNumber: match.line, line: match.text })
        byFile.set(match.file, list)
      }
      return {
        card: 'search',
        shape: 'matches',
        files: [...byFile.entries()].map(([path, matches]) => ({ path, matches })),
        truncated: Boolean(meta.truncated),
        total: Number(meta.total) || meta.matches.length,
      }
    },
  })

  ctx.tools.register({
    name: 'ast_grep_replace',
    description: [
      'Replace code patterns across the filesystem with AST-aware rewriting.',
      'Dry-run by default. Use meta-variables from the pattern in the rewrite.',
      "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'.",
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: {
        pattern: { type: 'string', description: 'AST pattern to match' },
        rewrite: { type: 'string', description: 'Replacement pattern (can use $VAR from pattern)' },
        lang: { type: 'string', enum: LANGUAGES, description: 'Target language' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Paths to search' },
        globs: { type: 'array', items: { type: 'string' }, description: 'Include/exclude globs' },
        dryRun: { type: 'boolean', description: 'Preview changes without applying (default: true)' },
      },
      required: ['pattern', 'rewrite', 'lang'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                line: { type: 'integer' },
                before: { type: 'string' },
                after: { type: 'string' },
              },
              required: ['path', 'line', 'before', 'after'],
            },
          },
          total: { type: 'integer' },
          applied: { type: 'boolean' },
          truncated: { type: 'boolean' },
          truncatedReason: { type: 'string' },
        },
        required: ['files', 'total', 'applied', 'truncated'],
      },
      render(_args, value) {
        return textBlock(formatReplaceText(value))
      },
    },
    async execute(args, exec) {
      assertReplaceArgs(args)
      const applied = args.dryRun === false
      const result = await runSg({
        pattern: args.pattern,
        rewrite: args.rewrite,
        lang: args.lang,
        paths: args.paths,
        globs: args.globs,
        updateAll: applied,
      }, exec?.signal)
      return replaceResultValue(result, applied)
    },
    presentCall(args) {
      return { card: 'generic', kind: 'edit', title: `AST replace (${args.lang})`, rawInput: `${args.pattern} → ${args.rewrite}` }
    },
    presentResult(_args, result) {
      return {
        card: 'generic',
        title: 'AST replace result',
        content: result.content,
      }
    },
  })
}

export { registerAstGrepTools, runSg, buildArgs, parseAstGrepJson, formatSearchText, formatReplaceText, assertSearchArgs, assertReplaceArgs }
