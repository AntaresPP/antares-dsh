import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deepworkActivationPrompt,
  loopActivationPrompt,
  reflectActivationPrompt,
  registerCommands,
  userMessage,
} from '../lib/commands.js'

test('deepwork activation prompt carries the task and dsh paths', () => {
  const text = deepworkActivationPrompt('refactor auth module')
  assert.match(text, /Use the deepwork skill/)
  assert.match(text, /refactor auth module/)
  assert.match(text, /\.dsh\/antares-dsh\/deepwork\//)
  assert.doesNotMatch(text, /\.slim\//)
  assert.doesNotMatch(text, /task_status/)
})

test('reflect activation prompt supports focus and session flags', () => {
  const base = reflectActivationPrompt('release workflow and checks')
  assert.match(base, /Use the reflect skill/)
  assert.match(base, /Focus:\nrelease workflow and checks/)

  const sessions = reflectActivationPrompt('--sessions --last 12')
  assert.match(sessions, /Session Reflection Mode/)
  assert.match(sessions, /session_search/)
  assert.match(sessions, /last 12 sessions/)
  assert.doesNotMatch(sessions, /--last/)
})

test('loop activation prompt requires goal/success/maxAttempts and writes history', () => {
  const text = loopActivationPrompt('fix tsc errors until typecheck passes, max 3 tries')
  assert.match(text, /goal, successCriteria, maxAttempts/)
  assert.match(text, /fix tsc errors/)
  assert.match(text, /\.dsh\/antares-dsh\/loop-history\//)
  assert.match(text, /fixer/)
  assert.match(text, /never exceed maxAttempts/)
})

test('registerCommands registers three commands and enqueues followup messages', () => {
  const definitions = []
  const followed = []
  const ctx = {
    commands: {
      register(def) {
        definitions.push(def)
        return () => {}
      },
    },
  }
  registerCommands(ctx)
  assert.deepEqual(definitions.map((d) => d.name), ['deepwork', 'reflect', 'loop'])

  const deepwork = definitions[0]
  const agent = { followup(message) { followed.push(message) } }
  const result = deepwork.handler({ rawInput: ' ship the feature ', agent })
  assert.equal(result.kind, 'success')
  assert.equal(followed.length, 1)
  assert.deepEqual(followed[0], userMessage(deepworkActivationPrompt('ship the feature')))
  assert.equal(followed[0].source.kind, 'plugin')
  assert.equal(followed[0].source.plugin, 'antares-dsh')

  const error = deepwork.handler({ rawInput: '   ', agent })
  assert.equal(error.kind, 'error')

  const loop = definitions[2]
  const loopResult = loop.handler({ rawInput: 'make tests pass, max 3', agent })
  assert.equal(loopResult.kind, 'success')
  assert.equal(followed.length, 2)

  const reflect = definitions[1]
  const reflectResult = reflect.handler({ rawInput: '', agent })
  assert.equal(reflectResult.kind, 'success')
  assert.equal(followed.length, 3)
})
