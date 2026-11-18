import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { AgentRun } from '../types'

const MODEL = 'claude-sonnet-5-5'
const USAGE = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// What the stand-in engine answers: the next step's text and usage, and which commands fail.
type Script = { answer: string; usage: typeof USAGE | null; failing: Set<string> }

// The panel's latest agents list, as the plugin writes it: the test engine offers no `$.state`,
// so a hook beneath the plugin, above the kit's store, watches the writes go by.
let written: AgentRun[] = []

// One running worker 'a1'; Bash calls whose command is in `failing` come back as tool errors.
const worker = async ($: Engine, on: On): Promise<Script> => {
  const s: Script = { answer: '', usage: USAGE, failing: new Set() }
  mock.clock(on, { now: 1000 })
  written = []
  on('state.set', (_$, e, next) => {
    const w = e as unknown as { plugin?: string; key?: string; value?: unknown }
    if (w.plugin === 'savvy-progress' && w.key === 'agents') written = (w.value ?? []) as AgentRun[]
    return next(e)
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: MODEL, agentId: 'a1' }))
  on('tool.call', (_$, e) => {
    const cmd = String((e as { command?: unknown }).command ?? '')
    return (s.failing.has(cmd) ? { result: 'boom', text: `failed: ${cmd}`, isError: true, ref: 7 } : { result: 'fine', text: `ok: ${cmd}`, ref: 8 }) as never
  })
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: s.answer, toolUses: [], stopReason: 'end_turn', usage: s.usage ? { model: MODEL, ...s.usage } : null } as never
  })
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Data work', subagentType: 'general-purpose', provider: 'engine', parentModel: MODEL, background: false, fork: false } as never)
  return s
}

const step = async ($: Engine) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: MODEL, messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) void _
}

const bash = ($: Engine, command: string, agentId = 'a1') =>
  $.tool.call({ tool: 'Bash', command, agentId } as never) as Promise<Record<string, unknown>>

// The agent's row as last written.
const agent = async (_$: Engine): Promise<AgentRun> => {
  const a = written.find(x => x.agentId === 'a1')
  if (!a) throw new Error('no row for a1')
  return a
}

test('said: an answer sets said and grows thoughts, collapsed, clipped and capped at 6', async ($, on) => {
  const s = await worker($, on)
  s.answer = '  Reading   the parser\n\nfirst.  '
  await step($)
  let a = await agent($)
  expect(a.said?.text).toBe('Reading the parser first.')
  expect(typeof a.said?.at).toBe('number')
  expect(a.thoughts?.length).toBe(1)

  for (let i = 0; i < 7; i++) {
    s.answer = `thought ${i}`
    await step($)
  }
  s.answer = 'x'.repeat(1000)
  await step($)
  a = await agent($)
  expect(a.thoughts?.length).toBe(6)
  expect(a.thoughts?.[0]?.text).toBe('thought 2')
  expect(a.said?.text.length).toBe(400)
  expect(a.said?.text.endsWith('…')).toBe(true)
  expect(a.thoughts?.[5]?.text).toBe(a.said?.text)
})

test('said: an empty answer leaves said alone', async ($, on) => {
  const s = await worker($, on)
  s.answer = 'Hello there'
  await step($)
  s.answer = '   \n  '
  await step($)
  const a = await agent($)
  expect(a.said?.text).toBe('Hello there')
  expect(a.thoughts?.length).toBe(1)
})

test('said: recorded on a step without usage, cost untouched', async ($, on) => {
  const s = await worker($, on)
  s.usage = null
  s.answer = 'No usage here'
  await step($)
  const a = await agent($)
  expect(a.said?.text).toBe('No usage here')
  expect(a.costUsd).toBe(0)
  expect(a.tokens).toBe(0)
  expect(a.samples ?? []).toEqual([])
})

test('samples: one per step with cumulative cost and context, capped at 120', async ($, on) => {
  await worker($, on)
  await step($)
  await step($)
  let a = await agent($)
  expect(a.samples?.length).toBe(2)
  expect(a.samples?.[1]?.costUsd).toBe(a.costUsd)
  expect(a.samples?.[1]?.costUsd).toBeGreaterThan(a.samples?.[0]?.costUsd ?? Infinity)
  expect(a.samples?.[1]?.ctx).toBeGreaterThanOrEqual(0)
  expect(a.samples?.[1]?.ctx).toBeLessThanOrEqual(100)

  for (let i = 0; i < 125; i++) await step($)
  a = await agent($)
  expect(a.samples?.length).toBe(120)
  expect(a.samples?.[119]?.costUsd).toBe(a.costUsd)
})

test('errors: a failing call marks its event and counts; a success does not', async ($, on) => {
  const s = await worker($, on)
  s.failing.add('npm test')
  await bash($, 'npm run build')
  let a = await agent($)
  expect(a.errorCount ?? 0).toBe(0)
  expect(a.events?.[0]?.isError).toBeUndefined()

  await bash($, 'npm test')
  a = await agent($)
  expect(a.errorCount).toBe(1)
  expect(a.events?.length).toBe(2)
  expect(a.events?.[1]?.isError).toBe(true)
  expect(a.events?.[0]?.isError).toBeUndefined()
  expect(a.loop).toBeUndefined()
})

test('loop: three identical failures set it, a fourth counts 4, a different success clears it', async ($, on) => {
  const s = await worker($, on)
  s.failing.add('npm test')
  await bash($, 'npm test')
  await bash($, 'npm test')
  expect((await agent($)).loop).toBeUndefined()
  await bash($, 'npm test')
  let a = await agent($)
  expect(a.loop?.count).toBe(3)
  expect(a.loop?.text).toBe(a.events?.[2]?.text)
  await bash($, 'npm test')
  a = await agent($)
  expect(a.loop?.count).toBe(4)
  expect(a.errorCount).toBe(4)
  await bash($, 'ls')
  a = await agent($)
  expect(a.loop).toBeUndefined()
  expect(a.errorCount).toBe(4)
})

test('calls: the result reaches the caller unchanged, error or success', async ($, on) => {
  const s = await worker($, on)
  s.failing.add('bad')
  const bad = await bash($, 'bad')
  expect(bad.result).toBe('boom')
  expect(bad.text).toBe('failed: bad')
  expect(bad.isError).toBe(true)
  const good = await bash($, 'good')
  expect(good.result).toBe('fine')
  expect(good.text).toBe('ok: good')
  expect(good.isError).toBeUndefined()
})

test('calls: an agent unknown to the panel still gets its result', async ($, on) => {
  const s = await worker($, on)
  s.failing.add('bad')
  const bad = await bash($, 'bad', 'zz')
  expect(bad.result).toBe('boom')
  expect(bad.isError).toBe(true)
  const good = await bash($, 'good', 'zz')
  expect(good.result).toBe('fine')
  const a = await agent($)
  expect(a.errorCount ?? 0).toBe(0)
})
