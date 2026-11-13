import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

// A session where the pane's open state is tracked like the host's: `opened` lists each open.
const host = (on: On) => {
  const state = { isOpen: false, opened: 0 }
  mock.clock(on)
  on('ui.open', () => {
    state.isOpen = true
    state.opened++
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: state.isOpen ? [{ id: 'savvy-agents' }] : [] }) as never)
  // Stands for Claude Code's own drawing beneath the band.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e as never)
    return <Text>prompt</Text>
  })
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: (e as { tool_use_id: string }).tool_use_id }) as never)
  return state
}

const spawn = ($: Engine, id: string, type = 'general-purpose') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description: `Task ${id}`, subagentType: type, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)

test('auto-open: any subagent opens the panel, not only savvy workers', async ($, on) => {
  const state = host(on)
  await spawn($, 'a1')
  expect(state.opened).toBe(1)
})

test('auto-open: a closed panel comes back with the next subagent', async ($, on) => {
  const state = host(on)
  await spawn($, 'a1')
  state.isOpen = false
  await spawn($, 'a2')
  expect(state.opened).toBe(2)
})

test('auto-open: an open panel is left alone', async ($, on) => {
  const state = host(on)
  await spawn($, 'a1')
  await spawn($, 'a2')
  expect(state.opened).toBe(1)
})

test('auto-open: savvy keeps the old once-per-flow rule', { options: { autoOpen: 'savvy' } }, async ($, on) => {
  const state = host(on)
  await spawn($, 'a1')
  expect(state.opened).toBe(0)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: without a flow, the band offers the panel while there are agents`, async ($, on) => {
    const state = host(on)
    const empty = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await empty.find({ key: 'savvy-open' })).toBeUndefined()
    await empty.unmount()

    await spawn($, 'a1')
    state.isOpen = false
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(await ui.find({ key: 'savvy-open' })).toBeDefined()
    await ui.press({ key: 'savvy-open' })
    expect(state.isOpen).toBe(true)

    // Dismissed, the line stays away until another agent starts.
    await ui.press({ key: 'savvy-band-hide' })
    expect(await ui.find({ key: 'savvy-open' })).toBeUndefined()
    await spawn($, 'a2')
    expect(await ui.find({ key: 'savvy-open' })).toBeDefined()
  })
}
