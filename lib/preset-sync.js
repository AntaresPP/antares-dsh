/**
 * antares-dsh — bundled agent preset sync.
 *
 * First-install-only policy: if the target preset directory already exists,
 * it is the user's copy and is left untouched. Delete it and restart (or
 * remove the directory manually) to refresh from the package. This is the
 * deliberate opposite of oh-my-opencode-slim's auto-update skill sync: no
 * distribution/update machinery, per the approved scope.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRESET_ID = 'antares-dsh'

/** Expand a leading `~`, `~/` or `~\` to the current user's home directory. */
export function expandTilde(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || (path.startsWith('~') && path.charCodeAt(1) === 92)) return join(homedir(), path.slice(2))
  return path
}

/** Resolve the harness home (DSH_HOME overrides the conventional ~/.dsh). */
export function dshHome() {
  const override = process.env.DSH_HOME
  if (override === undefined) return join(homedir(), '.dsh')
  const trimmed = override.trim()
  return trimmed === '' ? join(homedir(), '.dsh') : expandTilde(trimmed)
}

/** Absolute path of the bundled preset tree inside this package. */
export function bundledPresetsRoot() {
  return fileURLToPath(new URL('../agent-presets/', import.meta.url))
}

/**
 * Install one preset directory when the target does not exist.
 *
 * @param sourceDir - bundled preset directory.
 * @param targetDir - destination directory.
 * @returns 'installed' | 'existing'
 */
export function installPresetIfMissing(sourceDir, targetDir) {
  if (existsSync(targetDir)) {
    return 'existing'
  }
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`bundled preset source is missing or not a directory: ${sourceDir}`)
  }
  mkdirSync(targetDir, { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
  return 'installed'
}

/**
 * Install every bundled preset directory under `targetRoot` when missing.
 * Returns one record per bundled preset id.
 */
export function installPresetsIfMissing(sourceRoot, targetRoot) {
  const result = { installed: [], existing: [], failed: [] }
  mkdirSync(targetRoot, { recursive: true })
  if (!existsSync(sourceRoot)) return result
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry)
    if (!statSync(source).isDirectory()) continue
    const id = basename(source)
    try {
      const status = installPresetIfMissing(source, join(targetRoot, id))
      result[status === 'installed' ? 'installed' : 'existing'].push(id)
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
