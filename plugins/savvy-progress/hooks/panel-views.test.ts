import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const MODEL = 'claude-sonnet-5-5'
const USAGE = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

type Surface = 'terminal' | 'desktop'

// A stand-in engine: each spawned agent's id is its tool_use_id; Bash commands listed in
// `failing` come back as tool errors; a model request answers `answer`.
const host = (on: On) => {
  const s = { answer: '', failing: new Set<string>() }
  mock.clock(on, { now: 1000 })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', (_$, e) => ({ model: MODEL, agentId: (e as { tool_use_id: string }).tool_use_id }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', (_$, e) => {
    const cmd = String((e as { command?: unknown }).command ?? '')
    return (s.failing.has(cmd) ? { result: 'boom', isError: true } : { result: 'ok' }) as never
  })
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: s.answer, toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, ...USAGE } } as never
  })
  return s
}

const spawn = ($: Engine, id: string) =>
  $.agent.spawn({ tool_use_id: id, prompt: 'p', description: `Task ${id}`, subagentType: 'general-purpose', provider: 'engine', parentModel: MODEL, background: false, fork: false } as never)

const edit = ($: Engine, agentId: string, file = '/repo/src/shared.ts') =>
  $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b', agentId } as never)

const bash = ($: Engine, command: string, agentId = 'a1') => $.tool.call({ tool: 'Bash', command, agentId } as never)

const step = async ($: Engine, agentId = 'a1') => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: MODEL, messageCount: 1, agentId })
  for await (const _ of stream) void _
}

const finish = ($: Engine, agentId: string) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId, reason: 'answer', answer: 'ok', usage: { model: MODEL, ...USAGE } })

const mount = ($: Engine, surface: Surface) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })

type Mounted = Awaited<ReturnType<typeof mount>>

// Every Svg's drawing, one string per Svg.
const drawings = async (ui: Mounted): Promise<string[]> => (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source))
const drawn = async (ui: Mounted): Promise<string> => (await drawings(ui)).join('\n')

test('desktop: four view tabs, the active one marked; the list by default (old state without view)', async ($, on) => {
  host(on)
  await spawn($, 'a1')
  const ui = await mount($, 'desktop')
  for (const v of ['list', 'lanes', 'office', 'files']) expect(await ui.find({ key: `v-${v}` })).toBeDefined()
  expect((await ui.find({ key: 'v-list' }))?.props.label).toBe('● List')
  expect((await ui.find({ key: 'v-lanes' }))?.props.label).toBe('Lanes')
  // The list: the agent's row and its Details button.
  expect(await ui.find({ key: 'd-a1' })).toBeDefined()
  expect(await drawn(ui)).toMatch(/Task a1/)
})

test('desktop: each tab shows its view, List comes back', async ($, on) => {
  host(on)
  await spawn($, 'a1')
  await edit($, 'a1')
  const ui = await mount($, 'desktop')

  await ui.press({ key: 'v-lanes' })
  expect((await ui.find({ key: 'v-lanes' }))?.props.label).toBe('● Lanes')
  expect(await drawn(ui)).toMatch(/>Lanes</)
  expect(await ui.find({ key: 'log' })).toBeUndefined()
  expect(await ui.find({ key: 'd-a1' })).toBeUndefined()

  await ui.press({ key: 'v-office' })
  expect(await drawn(ui)).toMatch(/Workshop/)

  await ui.press({ key: 'v-files' })
  expect(await drawn(ui)).toMatch(/File map/)
  expect(await drawn(ui)).toMatch(/shared\.ts/)

  await ui.press({ key: 'v-list' })
  const all = await drawn(ui)
  expect(all).not.toMatch(/Workshop|File map/)
  expect(await ui.find({ key: 'd-a1' })).toBeDefined()
  expect(await ui.find({ key: 'log' })).toBeDefined()
})

test('desktop: every view draws with no agent at all', async ($, on) => {
  host(on)
  const ui = await mount($, 'desktop')
  for (const [v, mark] of [['lanes', /No subagents yet/], ['office', /Lounge/], ['files', /File map/]] as const) {
    await ui.press({ key: `v-${v}` })
    expect(await drawn(ui)).toMatch(mark)
  }
})

test('desktop: two agents editing one file show the conflict, in the list and in lanes', async ($, on) => {
  host(on)
  await spawn($, 'a1')
  await spawn($, 'a2')
  await edit($, 'a1')
  await edit($, 'a2')
  const ui = await mount($, 'desktop')
  expect(await drawn(ui)).toMatch(/Edited by several agents/)
  await ui.press({ key: 'v-lanes' })
  const lanes = await drawings(ui)
  expect(lanes.some(src => /Edited by several agents/.test(src))).toBe(true)
  expect(lanes.some(src => />Lanes</.test(src))).toBe(true)
})

test('desktop: no conflict banner for one editor', async ($, on) => {
  host(on)
  await spawn($, 'a1')
  await edit($, 'a1')
  const ui = await mount($, 'desktop')
  expect(await drawn(ui)).not.toMatch(/Edited by several agents/)
})

test('desktop: a finished flow with every agent done throws the party', async ($, on) => {
  host(on)
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Task a1', tier: 'light' }] } as never)
  await spawn($, 'a1')
  const ui = await mount($, 'desktop')
  expect(await drawn(ui)).not.toMatch(/All accepted/)
  await finish($, 'a1')
  expect(await drawn(ui)).not.toMatch(/All accepted/)
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  expect(await drawn(ui)).toMatch(/All accepted/)
})

test('desktop: a failing call counts in the row; three identical ones say it goes in circles', async ($, on) => {
  const s = host(on)
  s.failing.add('npm test')
  await spawn($, 'a1')
  await bash($, 'npm test')
  const ui = await mount($, 'desktop')
  const row = (await drawings(ui)).find(src => /Task a1/.test(src)) ?? ''
  expect(row).toMatch(/✗ 1</)
  expect(row).toMatch(/fill="#D0453F"/)
  expect(row).not.toMatch(/going in circles/)

  await bash($, 'npm test')
  await bash($, 'npm test')
  const looping = (await drawings(ui)).find(src => /Task a1/.test(src)) ?? ''
  expect(looping).toMatch(/✗ 3</)
  expect(looping).toMatch(/going in circles/)
})

test('desktop: Details shows the agent in its own words and the cost card', async ($, on) => {
  const s = host(on)
  await spawn($, 'a1')
  s.answer = 'Reading the parser before touching it.'
  await step($)
  const ui = await mount($, 'desktop')
  await ui.press({ key: 'd-a1' })
  const all = await drawings(ui)
  expect(all.some(src => /In its own words/.test(src) && /Reading the parser/.test(src))).toBe(true)
  expect(all.some(src => /Cost and context/.test(src))).toBe(true)
})

test('desktop: Details marks errors and the loop', async ($, on) => {
  const s = host(on)
  s.failing.add('npm test')
  await spawn($, 'a1')
  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  const ui = await mount($, 'desktop')
  await ui.press({ key: 'd-a1' })
  const all = await drawn(ui)
  expect(all).toMatch(/↻ going in circles · Bash npm test ×3/)
  expect(all).toMatch(/>errors </)
  expect(all).toMatch(/✗ Bash npm test/)
  expect(all).toMatch(/stroke="#D0453F" stroke-width="1\.5"/)
})

test('terminal: conflict, errors and the loop as text', async ($, on) => {
  const s = host(on)
  s.failing.add('npm test')
  await spawn($, 'a1')
  await spawn($, 'a2')
  await edit($, 'a1')
  await edit($, 'a2')
  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /⚠ Edited by several agents: shared\.ts — Task a1 · Task a2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✗ 3/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /going in circles/ })).toBeDefined()
})

test('terminal: the party line once the flow is finished', async ($, on) => {
  host(on)
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', phase: 'delegate', tasks: [{ title: 'Task a1', tier: 'light' }] } as never)
  await spawn($, 'a1')
  await finish($, 'a1')
  await $.tool.call({ tool: PROGRESS, finished: true } as never)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /✓ All accepted/ })).toBeDefined()
})

test('terminal: Details shows the agent in its own words, its errors and the loop', async ($, on) => {
  const s = host(on)
  s.failing.add('npm test')
  await spawn($, 'a1')
  s.answer = 'Reading the parser before touching it.'
  await step($)
  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'd-a1' })
  expect(await ui.find({ type: 'Text', text: /In its own words: Reading the parser/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✗ 3 errors/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↻ going in circles/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✗ Bash npm test/ })).toBeDefined()
})

