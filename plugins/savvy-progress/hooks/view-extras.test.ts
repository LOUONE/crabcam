import { expect, test } from 'claude-code/testing'
import type { AgentRun } from '../types'
import { PARTY_MS, partySvg, saidSvg } from './views/extras'

const run = (i: number, over: Partial<AgentRun> = {}): AgentRun => ({
  id: `a${i}`,
  type: 'savvy-flow:savvy-medium',
  description: `Worker ${i}`,
  model: 'claude-opus-5-5',
  status: 'done',
  startedAt: 1_000 * i,
  endedAt: 1_000 * i + 30_000,
  contextTokens: 20_000,
  contextMax: 200_000,
  tokens: 5_000,
  costUsd: 0.12,
  steps: 0,
  round: 1,
  ...over,
})

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length

test('said: nothing without said or with empty text', async () => {
  expect(saidSvg(400, run(1), 60_000)).toEqual(['', 0])
  expect(saidSvg(400, run(1, { said: { text: '   ', at: 1 } }), 60_000)).toEqual(['', 0])
})

test('said: a long text wraps to at most 5 lines', async () => {
  const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')
  const [src, h] = saidSvg(300, run(1, { said: { text, at: 50_000 } }), 60_000)
  expect(count(src, /font-size="13">/g)).toBe(5)
  expect(src).not.toMatch(/font-style="italic"/)
  expect(h).toBeGreaterThan(46 + 4 * 19)
  expect(src).toMatch(new RegExp(`height="${h}"`))
})

test('said: earlier thoughts, at most 2, most recent first, latest not repeated', async () => {
  const said = { text: 'Now running the tests', at: 50_000 }
  const thoughts = [
    { text: 'First I read the parser', at: 10_000 },
    { text: 'Then I fix the edge case', at: 20_000 },
    { text: 'Then I update the docs', at: 30_000 },
    said,
  ]
  const [src] = saidSvg(520, run(1, { said, thoughts }), 60_000)
  expect(count(src, /Now running the tests/g)).toBe(1)
  expect(src).not.toMatch(/First I read the parser/)
  const docs = src.indexOf('· Then I update the docs')
  const fix = src.indexOf('· Then I fix the edge case')
  expect(docs).toBeGreaterThan(0)
  expect(fix).toBeGreaterThan(docs)
  expect(src).toMatch(/class="ln"/)
})

test('said: text is escaped', async () => {
  const [src] = saidSvg(400, run(1, { said: { text: 'a<b & "c"', at: 1 } }), 60_000)
  expect(src).toMatch(/a&lt;b &amp; &quot;c&quot;/)
  expect(src).not.toMatch(/a<b/)
})

test('said: the time is never negative', async () => {
  const [src] = saidSvg(400, run(1, { said: { text: 'hello', at: 90_000 } }), 60_000)
  expect(src).not.toMatch(/-\d+:\d\d/)
  expect(src).toMatch(/ago 0:00/)
})

test('party: nothing for an empty list', async () => {
  expect(partySvg(400, [], 60_000)).toEqual(['', 0])
})

test('party: one still crab per agent, 16 confetti, reduced motion', async () => {
  const [src, h] = partySvg(400, [run(0), run(1), run(2)], 60_000)
  expect(h).toBe(132)
  expect(count(src, /class="c-/g)).toBe(3)
  expect(src).not.toMatch(/class="hop"|@keyframes hop/)
  expect(count(src, /class="cf"/g)).toBe(16)
  expect(count(src, /width="4" height="7" rx="1"/g)).toBe(16)
  expect(src).toMatch(/prefers-reduced-motion: reduce\)\{\.cf\{animation:none/)
})

test('party: a failed agent still stands with the others', async () => {
  const [src] = partySvg(400, [run(0), run(1, { status: 'failed' })], 60_000)
  expect(count(src, /class="c-/g)).toBe(2)
})

test('party: 40 agents at W=300 end with +N', async () => {
  const [src] = partySvg(300, Array.from({ length: 40 }, (_, i) => run(i)), 60_000)
  expect(src).toMatch(/>\+\d+</)
  expect(count(src, /class="c-/g)).toBeLessThan(40)
})

test('party: W=240 has no NaN or negative width', async () => {
  const [src] = partySvg(240, [run(0), run(1), run(2)], 60_000)
  expect(src).not.toMatch(/NaN/)
  expect(src).not.toMatch(/width="-/)
})

test('party: confetti falls once, delays not negative at the start', async () => {
  const [src] = partySvg(400, [run(0), run(1), run(2)], 60_000)
  expect(src).toMatch(/\.cf\{animation:fall 2\.4s linear 1 both/)
  expect(src).not.toMatch(/\.cf\{[^}]*infinite/)
  expect(src).not.toMatch(/style="animation-delay:-/)
})

test('party: a redraw mid-way resumes the fall instead of replaying it', async () => {
  const [a] = partySvg(400, [run(0)], 60_000, 0)
  const [b] = partySvg(400, [run(0)], 60_000, 1000)
  const delays = (src: string) => [...src.matchAll(/class="cf" style="animation-delay:(-?[\d.]+)s"/g)].map(m => Number(m[1]))
  expect(delays(b).length).toBe(16)
  delays(b).forEach((d, i) => expect(Math.abs(d - ((delays(a)[i] ?? 0) - 1))).toBeLessThan(0.002))
})

test('party: once over, the drawing holds no animation of its own', async () => {
  for (const elapsed of [PARTY_MS, PARTY_MS + 1, 600_000]) {
    const [src, h] = partySvg(400, [run(0), run(1), run(2)], 60_000, elapsed)
    expect(count(src, /class="cf"/g)).toBe(0)
    expect(src).not.toMatch(/@keyframes fall/)
    expect(count(src, /class="c-/g)).toBe(3)
    expect(h).toBe(132)
  }
})
