import { expect, test } from 'claude-code/testing'
import type { AgentRun } from '../types'
import { costCurveSvg } from './views/charts'

const T0 = 1_000_000

const agent = (over: Partial<AgentRun> = {}): AgentRun =>
  ({
    id: 'a1',
    type: 'savvy-flow:savvy-medium',
    description: 'a<b & "c"',
    model: 'claude-sonnet-5-5',
    status: 'running',
    startedAt: T0,
    contextTokens: 40_000,
    contextMax: 200_000,
    tokens: 50_000,
    costUsd: 0.25,
    steps: 0,
    round: 1,
    ...over,
  }) as AgentRun

const FIVE = [1, 2, 3, 4, 5].map(i => ({ at: T0 + i * 10_000, costUsd: i * 0.05, ctx: i * 10 }))

const negatives = (src: string): string[] =>
  [...src.matchAll(/(?:\b(?:x|y|width|height|cx|cy|x1|x2|y1|y2)="(-[\d.]+)")|(?:\bd="[^"]*?[MLHVZ ](-\d)[^"]*")/g)].map(m => m[0])

test('charts: no samples shows noData and no curve path', async () => {
  const [src, h] = costCurveSvg(400, agent({ samples: [] }), T0 + 30_000)
  expect(src).toContain('Not enough data yet.')
  expect(src).not.toMatch(/<path/)
  expect(h).toBeGreaterThan(0)
})

test('charts: five samples draw a line, an area and a dot without NaN', async () => {
  const [src] = costCurveSvg(400, agent({ samples: FIVE }), T0 + 60_000)
  expect(src).not.toContain('NaN')
  expect(src).toMatch(/<path d="M[^"]*Z" fill="#8f8cf4" fill-opacity="0\.14"/)
  expect(src).toMatch(/<path d="M[^"]*" fill="none" stroke="#8f8cf4" stroke-width="1\.75"/)
  expect(src).toMatch(/<circle[^>]*r="3\.5" fill="#8f8cf4"/)
  expect(src).not.toContain('Not enough data yet.')
})

test('charts: the dot is live only while running', async () => {
  const [running] = costCurveSvg(400, agent({ samples: FIVE }), T0 + 60_000)
  const [done] = costCurveSvg(400, agent({ samples: FIVE, status: 'done', endedAt: T0 + 55_000 }), T0 + 90_000)
  expect(running).toMatch(/<circle class="live"/)
  expect(done).not.toMatch(/<circle class="live"/)
  expect(done).toMatch(/<circle cx=/)
})

test('charts: gauge colour follows the context level', async () => {
  const colorAt = (pct: number) => {
    const [src] = costCurveSvg(400, agent({ contextTokens: pct * 1000, contextMax: 100_000 }), T0 + 30_000)
    expect(src).toContain(`ctx ${pct}%`)
    return src
  }
  expect(colorAt(30)).toMatch(/height="8" rx="4" fill="#5fbf8f"/)
  expect(colorAt(70)).toMatch(/height="8" rx="4" fill="#BA7517"/)
  expect(colorAt(90)).toMatch(/height="8" rx="4" fill="#D0453F"/)
})

test('charts: empty context has a zero-width fill', async () => {
  const [src] = costCurveSvg(400, agent({ contextTokens: 0 }), T0 + 30_000)
  expect(src).toMatch(/width="0" height="8" rx="4" fill=/)
})

test('charts: flat tiny costs give no NaN and no negative coordinates', async () => {
  const flat = [1, 2, 3].map(i => ({ at: T0 + i * 1000, costUsd: 0.0001, ctx: 1 }))
  const [src] = costCurveSvg(400, agent({ samples: flat }), T0 + 4000)
  expect(src).not.toContain('NaN')
  expect(negatives(src)).toEqual([])
})

test('charts: W=240 has no NaN or negative widths', async () => {
  const [src, h] = costCurveSvg(240, agent({ samples: FIVE }), T0 + 60_000)
  expect(src).not.toContain('NaN')
  expect(src).not.toMatch(/width="-/)
  expect(negatives(src)).toEqual([])
  expect(h).toBeGreaterThan(0)
})

test('charts: no sparkline, one height whatever the samples', async () => {
  const [, without] = costCurveSvg(400, agent({ samples: FIVE.slice(0, 1) }), T0 + 60_000)
  const [src, withSamples] = costCurveSvg(400, agent({ samples: FIVE }), T0 + 60_000)
  expect(src).not.toContain('stroke="#9a9a96"')
  expect(withSamples).toBe(without)
  expect(src).toContain(`height="${withSamples}"`)
})

test('charts: only the 50 % rule is labelled', async () => {
  const [src] = costCurveSvg(400, agent({ samples: FIVE, costUsd: 0.25 }), T0 + 60_000)
  // Max sample 0.25: the 50 % label reads $0.13 (0.125), the top rule carries no $0.25 label; the title does.
  expect((src.match(/\$0\.25/g) ?? []).length).toBe(1)
  expect(src).toContain('$0.13')
  expect((src.match(/<line class="ln"/g) ?? []).length).toBe(2)
})

test('charts: missing samples and endedAt do not throw, data text never leaks unescaped', async () => {
  const a = agent()
  delete (a as Partial<AgentRun>).samples
  delete (a as Partial<AgentRun>).endedAt
  const [src, h] = costCurveSvg(300, a, T0 - 5000)
  expect(src).not.toContain('NaN')
  expect(src).not.toContain('a<b')
  expect(h).toBeGreaterThan(0)
})
