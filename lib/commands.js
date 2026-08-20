/**
 * antares-dsh slash commands: /deepwork, /reflect, /loop.
 *
 * dsh commands execute directly and return a UI result. To make the model
 * actually run the workflow, the handler enqueues one follow-up user message
 * containing the activation prompt. This mirrors the official Agent API
 * (`agent.followup`) and avoids importing any @deepseek-ai package.
 */

const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'antares-dsh' }

export function userMessage(text) {
  return { content: [{ type: 'text', text }], source: PLUGIN_SOURCE }
}

export function deepworkActivationPrompt(task) {
  return [
    'Use the deepwork skill for this task. Treat it as a heavy coding session.',
    '',
    'Deepwork requirements:',
    '- before planning, delegation, or creating state, inspect existing `.gitignore` and `.ignore`; add only missing entries without duplicates: `.gitignore` must contain `.dsh/antares-dsh/deepwork/`, and `.ignore` must contain `!.dsh/antares-dsh/deepwork/` and `!.dsh/antares-dsh/deepwork/**`;',
    '- create/update a progress file at `.dsh/antares-dsh/deepwork/<task-slug>.md`;',
    '- save code/doc deliverables to project paths (e.g. `src/`, `docs/`); reserve `.dsh/antares-dsh/deepwork/` strictly for progress files;',
    '- keep `todo_write` synced with the current phase;',
    '- draft a phased implementation/delegation plan with a small number of coherent phases based on dependencies and natural delivery boundaries; do not split work merely to reduce review scope;',
    '- before execution, show the user a compact overview with phase titles/order, delegated specialists and ownership/scope, plus the oracle review total, gate after each phase, and a short reason for each;',
    '- execute phase by phase with background specialists where useful;',
    '- wait for the runtime completion notice of each background subagent, reconcile results, validate and update state, then call the `oracle` tool to review every planned phase before continuing;',
    '- batch material actionable oracle findings, including simplify/readability feedback, into one bounded remediation pass and validate it with focused evidence; only re-review when the remediation changes the reviewed decision/risk or the original concern cannot otherwise be verified.',
    '',
    'Task:',
    task,
  ].join('\n')
}

export function reflectActivationPrompt(rawInput = '') {
  const args = String(rawInput ?? '').trim()
  const isSessionMode = args.includes('--sessions')
  const lastMatch = args.match(/--last\s+(\d+)/)
  const last = lastMatch ? Math.min(parseInt(lastMatch[1], 10), 100) : 50
  const focus = args.replace(/--sessions/g, '').replace(/--last\s+\d+/g, '').trim()

  const focusBlock = focus
    ? ['Focus:', focus]
    : [
        'Focus:',
        isSessionMode
          ? 'Analyze recent sessions to find repeated patterns, friction, and improvement opportunities.'
          : 'Review recent work broadly and identify repeated workflow friction worth improving.',
      ]

  const modeBlock = isSessionMode
    ? [
        '',
        'Session Reflection Mode:',
        `- Analyze roughly the last ${last} sessions (adjust the scope yourself; the session_search tool has no per-call limit parameter)`,
        '- If the official `session_search` / `session_event_*` tools are visible in your tool catalog, use them to discover and inspect prior sessions in this workspace;',
        '- If those tools are NOT available, say so explicitly and fall back to the current conversation plus project artifacts — do not invent historical sessions or read raw session files',
        '- Analyze each session for patterns and friction',
        '- Aggregate findings across sessions',
        '- Report with scope (global/cross-repo/project-specific), confidence, and impact',
      ]
    : []

  return [
    'Use the reflect skill for this request.',
    '',
    'Reflect requirements:',
    '- inspect existing skills, commands, agents, prompt overrides, permissions, config, and project playbooks before suggesting anything new;',
    '- find repeated workflow patterns from the current conversation, project notes, local memories, logs, or session artifacts that are available and safe to inspect;',
    '- prefer evidence from repeated recent behavior over speculation;',
    '- recommend the smallest useful improvement: prompt/config rule, skill, command, custom agent, tool/permission change, project playbook, or skip;',
    '- treat creating nothing as a valid result when evidence is weak;',
    '- ask before changing prompts, skills, commands, agents, tool access, or config unless the user explicitly requested the exact edit;',
    '- return a compact report with findings, recommended changes, skipped candidates, and items needing more evidence.',
    ...modeBlock,
    '',
    ...focusBlock,
  ].join('\n')
}

export function loopActivationPrompt(rawInput = '') {
  const text = String(rawInput ?? '').trim()
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  const dir = `.dsh/antares-dsh/loop-history/loop-${stamp}-${rand}`
  return [
    'The user ran `/loop`. From the text below, extract: goal, successCriteria, maxAttempts.',
    '',
    'If ANY are missing or unclear - push back and ask the user to clarify with `ask_user_question`.',
    'Do not assume or guess. All three must be explicit.',
    '',
    'Once all three are clear, run the loop:',
    '',
    text,
    '',
    'For each attempt:',
    `1. Read \`${dir}/\` for prior results`,
    '2. Dispatch the `fixer` tool with the goal (give it the failure reasons from prior attempts when retrying)',
    '3. Verify per the successCriteria',
    `4. Write result to \`${dir}/history-{NNN}.md\` (PASS/FAIL + reason)`,
    '5. PASS -> stop. FAIL under maxAttempts -> retry. FAIL at maxAttempts -> escalate to the user.',
    '',
    'Hard guards: never exceed maxAttempts; always read prior history before dispatching a new attempt; do not use a real while loop — advance one attempt per turn and let the fixer completion notice bring you back.',
  ].join('\n')
}

function commandDefinition(name, description, hint, makePrompt, { allowEmpty = false } = {}) {
  return {
    name,
    description,
    ...(hint ? { input: { hint } } : {}),
    recordInput: true,
    handler(invocation) {
      const raw = String(invocation.rawInput ?? '').trim()
      if (!allowEmpty && !raw) {
        return { kind: 'error', text: makePrompt.usage() }
      }
      const text = makePrompt.prompt(raw)
      invocation.agent.followup(userMessage(text))
      return { kind: 'success', text: `${name} started` }
    },
  }
}

export function registerCommands(ctx) {
  ctx.commands.register(commandDefinition(
    'deepwork',
    'Start a deepwork session for a complex coding task',
    '<task>',
    {
      prompt: deepworkActivationPrompt,
      usage: () => 'Usage: /deepwork <task>\nDescribe the heavy coding task to manage.',
    },
  ))

  ctx.commands.register(commandDefinition(
    'reflect',
    'Review repeated work and suggest workflow improvements',
    '[focus] [--sessions] [--last N]',
    {
      prompt: reflectActivationPrompt,
      usage: () => 'Usage: /reflect [focus] [--sessions] [--last N]',
    },
    { allowEmpty: true },
  ))

  ctx.commands.register(commandDefinition(
    'loop',
    'Run an automated execute-verify loop',
    '<goal, success criteria, max attempts>',
    {
      prompt: loopActivationPrompt,
      usage: () => [
        'Usage: /loop <description>',
        '',
        'Describe what to accomplish, what success looks like, and how many tries.',
        '',
        'Examples:',
        '  /loop fix typescript errors until typecheck passes, max 3 tries',
        '  /loop improve api performance until response under 500ms, try 5 times',
        '  /loop refactor auth module, tests must pass, 4 attempts max',
      ].join('\n'),
    },
  ))
}
