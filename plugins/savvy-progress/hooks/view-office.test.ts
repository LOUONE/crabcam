import { expect, test } from 'claude-code/testing'
import type { ActivityKind, AgentRun } from '../types'
import { officeSvg } from './views/office'

const T0 = 1_000_000

const agent = (id: string, over: Partial<AgentRun> = {}): AgentRun => ({
  id,
  type: 'savvy-flow:savvy-medium',
  description: `Agent ${id}`,
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: T0,
  contextTokens: 1000,
  contextMax: 200_000,
  tokens: 1000,
  costUsd: 0.1,
  steps: 0,
  round: 0,
  ...over,
})

const ev = (kind: ActivityKind, at = T0 + 1000) => ({ at, tool: 'X', kind, target: '', text: 'x' })

// The x of the first crab drawn in a room: its wrapping <g data-room> holds the crab's translate.
const crabX = (src: string, room: string): number => {
  const m = src.match(new RegExp(`<g data-room="${room}"><g transform="translate\\(([-\\d.]+),`))
  return m ? Number(m[1]) : NaN
}

test('office: empty list draws three rooms, the lounge and the empty line', async () => {
  const [src, h] = officeSvg(400, [], T0)
  expect(src).toMatch(/Library/)
  expect(src).toMatch(/Workshop/)
  expect(src).toMatch(/Lab/)
  expect(src).toMatch(/Lounge/)
  expect(src).toMatch(/No subagents yet\./)
  expect(src).toMatch(/0 running/)
  expect(src).not.toMatch(/data-room=/)
  expect(h).toBe(246)
  expect(src).toMatch(/height="246"/)
})

test('office: a running agent editing stands in the workshop', async () => {
  const W = 520
  const [src] = officeSvg(W, [agent('a', { events: [ev('explore', T0 + 500), ev('edit')] })], T0 + 5000)
  expect(src).toMatch(/data-room="workshop"/)
  expect(src).not.toMatch(/data-room="library"/)
  const rw = (W - 48) / 3
  const x = crabX(src, 'workshop')
  expect(x).toBeGreaterThanOrEqual(16 + rw + 8)
  expect(x).toBeLessThanOrEqual(16 + 2 * rw + 8)
  expect(src).toMatch(/1 running/)
  expect(src).toMatch(/Agent a/)
})

test('office: a web call puts the agent in the library', async () => {
  const [src] = officeSvg(520, [agent('w', { events: [ev('web')] })], T0 + 5000)
  expect(src).toMatch(/data-room="library"/)
  expect(crabX(src, 'library')).toBeLessThan(16 + (520 - 48) / 3)
})

test('office: a finished agent goes to the lounge, dimmed with a check', async () => {
  const [src] = officeSvg(520, [agent('d', { status: 'done', endedAt: T0 + 9000, events: [ev('edit')] })], T0 + 10_000)
  expect(src).toMatch(/<g data-room="lounge"><g transform="[^"]+" opacity="0.45"/)
  expect(src).not.toMatch(/data-room="workshop"/)
  expect(src).toMatch(/✓/)
  const [failed] = officeSvg(520, [agent('f', { status: 'failed', endedAt: T0 + 9000 })], T0 + 10_000)
  expect(failed).toMatch(/✗/)
})

test('office: a running agent without events waits in the lounge, walking', async () => {
  const [src] = officeSvg(400, [agent('n')], T0)
  expect(src).toMatch(/<g data-room="lounge"><g transform="[^"]+" opacity="1"/)
  expect(src).toMatch(/ run"/)
})

test('office: ten agents in one narrow room show a +N', async () => {
  const many = Array.from({ length: 10 }, (_, i) => agent(`r${i}`, { startedAt: T0 + i, events: [ev('run')] }))
  const [src] = officeSvg(300, many, T0 + 5000)
  expect(src).toMatch(/>\+\d+</)
  expect(src).toMatch(/10 running/)
  expect(src).not.toMatch(/data-room="lounge"/)
})

test('office: a looping agent gets the loop mark, an erroring one a red dot', async () => {
  const [src] = officeSvg(400, [agent('l', { loop: { text: 'Bash x', count: 4 }, errorCount: 3, events: [ev('run')] })], T0)
  expect(src).toMatch(/↻/)
  expect(src).not.toMatch(/r="3" fill="#D0453F"/)
  const [err] = officeSvg(400, [agent('e', { errorCount: 2, events: [ev('run')] })], T0)
  expect(err).toMatch(/r="3" fill="#D0453F"/)
  expect(err).not.toMatch(/↻/)
})

test('office: W=240 has no NaN and no negative width', async () => {
  const list = [agent('a', { events: [ev('edit')] }), agent('b', { status: 'done' }), agent('c', { events: [ev('explore')] })]
  for (const W of [240, 300, 520, 900]) {
    const [src, h] = officeSvg(W, list, T0)
    expect(src).not.toMatch(/NaN/)
    expect(src).not.toMatch(/width="-/)
    expect(src).not.toMatch(/Infinity/)
    expect(h).toBe(246)
  }
})

test('office: descriptions are escaped', async () => {
  const [src] = officeSvg(900, [agent('x', { description: 'a<b & "c"', events: [ev('edit')] })], T0)
  expect(src).toMatch(/a&lt;b &amp; &quot;c&quot;/)
  expect(src).not.toMatch(/a<b/)
})

test('office: missing optional fields do not throw', async () => {
  const bare = { id: 'z', type: 'general-purpose', description: '', model: '', status: 'running', startedAt: T0 } as unknown as AgentRun
  const [src, h] = officeSvg(400, [bare, { ...bare, id: 'y', status: 'done' } as AgentRun], T0)
  expect(src).toMatch(/data-room="lounge"/)
  expect(h).toBeGreaterThan(0)
})
