/**
 * ast-grep binary resolution for antares-dsh.
 *
 * Resolution order:
 *   1. AST_GREP_SG environment override
 *   2. cached binary under the platform cache directory
 *   3. `@ast-grep/cli` package directory (sg / sg.exe)
 *   4. platform-specific package directory (ast-grep / ast-grep.exe)
 *   5. Homebrew locations on macOS
 *
 * v1 does NOT download binaries from GitHub. Missing binaries produce a
 * readable tool error; users can install `@ast-grep/cli` or put `sg` on PATH.
 */
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const MIN_BINARY_SIZE = 10_000

const PLATFORM_PACKAGES = {
  'darwin-arm64': '@ast-grep/cli-darwin-arm64',
  'darwin-x64': '@ast-grep/cli-darwin-x64',
  'linux-arm64': '@ast-grep/cli-linux-arm64-gnu',
  'linux-x64': '@ast-grep/cli-linux-x64-gnu',
  'win32-x64': '@ast-grep/cli-win32-x64-msvc',
  'win32-arm64': '@ast-grep/cli-win32-arm64-msvc',
  'win32-ia32': '@ast-grep/cli-win32-ia32-msvc',
}

export function isValidBinary(path) {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > MIN_BINARY_SIZE
  } catch {
    return false
  }
}

export function getBinaryName() {
  return process.platform === 'win32' ? 'sg.exe' : 'sg'
}

export function getCacheDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), 'AppData', 'Local')
    return join(base, 'antares-dsh', 'bin')
  }
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(base, 'antares-dsh', 'bin')
}

export function getCachedBinaryPath() {
  const path = join(getCacheDir(), getBinaryName())
  return isValidBinary(path) ? path : null
}

function resolvePackageJson(packageName) {
  try {
    const require = createRequire(import.meta.url)
    return dirname(require.resolve(`${packageName}/package.json`))
  } catch {
    return null
  }
}

function homebrewPaths() {
  return process.platform === 'darwin' ? ['/opt/homebrew/bin/sg', '/usr/local/bin/sg'] : []
}

export function resolveAstGrepPath() {
  if (process.env.AST_GREP_SG) {
    const path = process.env.AST_GREP_SG.trim()
    if (isValidBinary(path)) return path
  }

  const cached = getCachedBinaryPath()
  if (cached) return cached

  const cliDir = resolvePackageJson('@ast-grep/cli')
  if (cliDir) {
    const path = join(cliDir, getBinaryName())
    if (isValidBinary(path)) return path
  }

  const platformPkg = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`]
  if (platformPkg) {
    const pkgDir = resolvePackageJson(platformPkg)
    if (pkgDir) {
      const binaryName = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep'
      const path = join(pkgDir, binaryName)
      if (isValidBinary(path)) return path
    }
  }

  const brew = homebrewPaths().find((path) => isValidBinary(path))
  if (brew) return brew

  return null
}

export function describeInstallHint() {
  return [
    'ast-grep CLI binary not found.',
    'Install options:',
    '  npm install -D @ast-grep/cli',
    '  cargo install ast-grep --locked',
    '  brew install ast-grep',
    'Or set AST_GREP_SG to the absolute path of an existing `sg` binary.',
  ].join('\n')
}
