import { expect, test } from 'claude-code/testing'
import type { ActivityEvent, ActivityKind, AgentRun } from '../types'
import { KIND_COLOR } from './register'
import { lanesSvg } from './views/lanes'

const ev = (at: number, kind: ActivityKind, isError = false): ActivityEvent => ({ at, tool: 'Read', kind, target: '', text: `${kind} ${at}`, isError })

const agent = (id: string, extra: Partial<AgentRun> = {}): AgentRun => ({
  id,
  type: 'savvy-flow:savvy-medium',
  description: `agent ${id}`,
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: 0,
  contextTokens: 0,
  contextMax: 200_000,
  tokens: 0,
  costUsd: 0,
  steps: 0,
  round: 0,
  ...extra,
})

const lanesIn = (src: string): number => (src.match(/class="k"/g) ?? []).length

test('lanes: empty list draws the empty state', async () => {
  const [src, h] = lanesSvg(400, [], 60_000)
  expect(src).toMatch(/No subagents yet\./)
  expect(src).toMatch(/Lanes/)
  expect(h).toBeGreaterThan(0)
})

test('lanes: one running agent shows three kind colours and a live dot', async () => {
  const a = agent('1', { events: [ev(1_000, 'explore'), ev(5_000, 'explore'), ev(10_000, 'edit'), ev(20_000, 'run')] })
  const [src, h] = lanesSvg(400, [a], 40_000)
  for (const k of ['explore', 'edit', 'run'] as const) expect(src).toContain(`fill="${KIND_COLOR[k]}"`)
  expect(src).toMatch(/<circle class="live"/)
  expect(lanesIn(src)).toBe(1)
  expect(h).toBeGreaterThan(0)
})

test('lanes: two overlapping agents give two lanes', async () => {
  const a = agent('1', { startedAt: 0, endedAt: 50_000, status: 'done' })
  const b = agent('2', { startedAt: 20_000, status: 'running' })
  const [src] = lanesSvg(520, [b, a], 70_000)
  expect(lanesIn(src)).toBe(2)
})

test('lanes: an error event draws the error tick', async () => {
  const a = agent('1', { status: 'failed', endedAt: 30_000, events: [ev(1_000, 'run'), ev(9_000, 'run', true)] })
  const [src] = lanesSvg(400, [a], 40_000)
  expect(src).toMatch(/height="18" fill="#D0453F"/)
})

test('lanes: 14 agents show 12 lanes and a +2 line', async () => {
  const list = Array.from({ length: 14 }, (_, i) => agent(String(i), { startedAt: i * 1_000 }))
  const [src, h] = lanesSvg(400, list, 60_000)
  expect(lanesIn(src)).toBe(12)
  expect(src).toMatch(/\+2 more/)
  expect(h).toBeLessThanOrEqual(2000)
})

test('lanes: W=240 has no NaN or negative widths', async () => {
  const list = [agent('1', { events: [ev(1_000, 'web'), ev(2_000, 'agent', true)] }), agent('2', { startedAt: 3_000, status: 'done', endedAt: 4_000 })]
  const [src, h] = lanesSvg(240, list, 5_000)
  expect(src).not.toMatch(/NaN/)
  expect(src).not.toMatch(/width="-/)
  expect(h).toBeGreaterThan(0)
})

test('lanes: description text is escaped', async () => {
  const [src] = lanesSvg(520, [agent('1', { description: 'a<b & "c"' })], 10_000)
  expect(src).toContain('a&lt;b &amp; ')
  expect(src).not.toContain('a<b')
})

test('lanes: missing events and endedAt do not throw', async () => {
  const a = agent('1', { status: 'done' })
  const [src, h] = lanesSvg(300, [a], 10_000)
  expect(lanesIn(src)).toBe(1)
  expect(h).toBeGreaterThan(0)
})
