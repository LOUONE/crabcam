import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

test('activity: a subagent tool call shows as its latest action in the panel', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Stands in for the tool itself, beneath the plugin.
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Read things', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/foo.ts', agentId: 'a1' } as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /Read src\/foo\.ts/ })).toBeDefined()
})

test('activity: Grep shows its pattern, not the folder it searches', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  // Stands in for the tool itself, beneath the plugin.
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a2' }))
  await $.agent.spawn({ tool_use_id: 't2', prompt: 'p', description: 'Search', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

  await $.tool.call({ tool: 'Grep', pattern: 'useEffect', path: '/repo/src/hooks', agentId: 'a2' } as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /Grep useEffect/ })).toBeDefined()
})
