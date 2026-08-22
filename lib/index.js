/**
 * antares-dsh — host half.
 *
 * Mounted on the host plane by the bundle patch. Contributes:
 *   1. first-install sync of the bundled agent preset,
 *   2. slash commands /deepwork, /reflect, /loop,
 *   3. ast_grep_search / ast_grep_replace tools.
 *
 * The plugin imports no @deepseek-ai package at runtime; all integration goes
 * through Cordis services (ctx.commands / ctx.tools) and plain object shapes.
 */
import { join } from 'node:path'
import { bundledPresetsRoot, bundledSkillsRoot, dshHome, installPresetsIfMissing, installUserSkillsIfMissing, userSkillsRoot } from './preset-sync.js'
import { registerCommands } from './commands.js'
import { registerAstGrepTools } from './ast-grep.js'

/** Stable Cordis plugin name. */
export const name = 'antares-dsh'

/** Services this plugin needs. */
export const inject = ['commands', 'tools']

function syncPreset(ctx) {
  const targetRoot = join(dshHome(), '.agent-presets')
  try {
    const result = installPresetsIfMissing(bundledPresetsRoot(), targetRoot)
    for (const { id, error } of result.failed) {
      ctx.logger?.warn?.(`antares-dsh: preset ${id} sync failed: ${error}`)
    }
    if (result.installed.length > 0) {
      ctx.logger?.info?.(`antares-dsh: installed preset(s) into ${targetRoot}: ${result.installed.join(', ')}`)
    }
    if (result.existing.length > 0) {
      ctx.logger?.info?.(`antares-dsh: preset(s) already present, left untouched: ${result.existing.join(', ')}`)
    }
  } catch (error) {
    ctx.logger?.warn?.(`antares-dsh: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function syncUserSkills(ctx) {
  try {
    const result = installUserSkillsIfMissing(bundledSkillsRoot(), userSkillsRoot())
    for (const { id, error } of result.failed) {
      ctx.logger?.warn?.(`antares-dsh: user skill ${id} sync failed: ${error}`)
    }
    if (result.installed.length > 0) {
      ctx.logger?.info?.(`antares-dsh: installed user skill(s) into ${userSkillsRoot()}: ${result.installed.join(', ')}`)
    }
    if (result.existing.length > 0) {
      ctx.logger?.info?.(`antares-dsh: user skill(s) already present, left untouched: ${result.existing.join(', ')}`)
    }
  } catch (error) {
    ctx.logger?.warn?.(`antares-dsh: user skill sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function apply(ctx) {
  syncPreset(ctx)
  syncUserSkills(ctx)
  try {
    registerCommands(ctx)
  } catch (error) {
    ctx.logger?.warn?.(`antares-dsh: command registration failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    registerAstGrepTools(ctx)
  } catch (error) {
    ctx.logger?.warn?.(`antares-dsh: ast-grep tool registration failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
