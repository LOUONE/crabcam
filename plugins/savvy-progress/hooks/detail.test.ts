import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const USAGE = { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// One running worker that reads a file, edits it and runs the tests; `calls` counts narrator requests.
const worker = async ($: Engine, on: On) => {
  const calls: string[] = []
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('model.complete', (_$, e) => {
    calls.push(String((e as { model?: string }).model))
    return { value: { isAnswered: true, text: 'Il corrige le parseur dans foo.ts puis relance les tests.', usage: USAGE } } as never
  })
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Fix the parser', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/foo.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/foo.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1' } as never)
  return calls
}

test('terminal: Details opens one agent with its files, timeline and phase', async ($, on) => {
  await worker($, on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  await ui.press({ key: 'd-a1' })

  expect(await ui.find({ type: 'Text', text: /src\/foo\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1× (read|lu)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /npm test/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Running|Exécute/ })).toBeDefined()

  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'd-a1' })).toBeDefined()
})

test('desktop: Details draws the hero, files and timeline cards', async ($, on) => {
  await worker($, on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  await ui.press({ key: 'd-a1' })

  // Svg cards carry their drawing in `source` and a summary in `alt`.
  const svgs = (await ui.findAll({ type: 'Svg' })).map(el => `${String(el.props.alt)}\n${String(el.props.source)}`)
  const all = svgs.join('\n')
  expect(all).toMatch(/Fix the parser/)
  expect(all).toMatch(/foo\.ts/)
  expect(all).toMatch(/npm test/)
  expect(svgs.length).toBeGreaterThanOrEqual(4)

  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'd-a1' })).toBeDefined()
})

test('narrator: opening an agent asks Haiku once and shows its sentence', async ($, on) => {
  const calls = await worker($, on)
  expect(calls.length).toBe(0)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  await ui.press({ key: 'd-a1' })

  expect(calls).toEqual(['claude-haiku-5-5'])
  expect(await ui.find({ type: 'Text', text: /corrige le parseur/ })).toBeDefined()
})

test('narrator: off never calls a model', { options: { narrator: 'off' } }, async ($, on) => {
  const calls = await worker($, on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  await ui.press({ key: 'd-a1' })
  await $.tool.call({ tool: 'Bash', command: 'npm run build', agentId: 'a1' } as never)

  expect(calls).toEqual([])
})

test('narrator: closed detail view, no call however busy the agent', async ($, on) => {
  const calls = await worker($, on)
  for (let i = 0; i < 10; i++) await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.ts`, agentId: 'a1' } as never)

  expect(calls.length).toBe(0)
})
