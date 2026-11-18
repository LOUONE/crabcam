import { expect, test } from 'claude-code/testing'
import type { AgentRun, FileTouch } from '../types'
import { conflictBannerSvg, conflictsOf, fileMapSvg } from './views/filemap'

const P = '/Users/me/proj'

const agent = (id: string, over: Partial<AgentRun> = {}): AgentRun => ({
  id,
  type: 'general-purpose',
  description: `agent ${id}`,
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: 1_000,
  contextTokens: 0,
  contextMax: 200_000,
  tokens: 0,
  costUsd: 0,
  steps: 0,
  round: 0,
  ...over,
})
const edit = (path: string, lastAt = 1_000): FileTouch => ({ path, reads: 0, edits: 1, lastAt })
const read = (path: string, lastAt = 1_000): FileTouch => ({ path, reads: 1, edits: 0, lastAt })

test('conflictsOf: two running agents editing one file', async () => {
  const c = conflictsOf([agent('a', { files: [edit(`${P}/x.ts`)] }), agent('b', { files: [edit(`${P}/x.ts`)] })])
  expect(c.length).toBe(1)
  expect(c[0]?.agents).toContain('a')
  expect(c[0]?.agents).toContain('b')
})

test('conflictsOf: an edit and a read do not conflict', async () => {
  expect(conflictsOf([agent('a', { files: [edit(`${P}/x.ts`)] }), agent('b', { files: [read(`${P}/x.ts`)] })]).length).toBe(0)
})

test('conflictsOf: finished agents one after the other do not conflict', async () => {
  const a = agent('a', { status: 'done', startedAt: 0, endedAt: 10, files: [edit(`${P}/x.ts`)] })
  const b = agent('b', { status: 'done', startedAt: 20, endedAt: 30, files: [edit(`${P}/x.ts`)] })
  expect(conflictsOf([a, b]).length).toBe(0)
})

test('conflictsOf: finished agents that overlapped conflict', async () => {
  const a = agent('a', { status: 'done', startedAt: 0, endedAt: 25, files: [edit(`${P}/x.ts`)] })
  const b = agent('b', { status: 'failed', startedAt: 20, endedAt: 30, files: [edit(`${P}/x.ts`)] })
  expect(conflictsOf([a, b]).length).toBe(1)
})

test('conflictsOf: three agents give all three ids', async () => {
  const c = conflictsOf(['a', 'b', 'c'].map(id => agent(id, { files: [edit(`${P}/x.ts`)] })))
  expect(c.length).toBe(1)
  expect(c[0]?.agents.length).toBe(3)
})

test('conflictBannerSvg: nothing without conflicts, the names with one', async () => {
  expect(conflictBannerSvg(400, [agent('a', { files: [edit(`${P}/x.ts`)] })], 2_000)).toEqual(['', 0])
  const [src, h] = conflictBannerSvg(
    400,
    [agent('a', { description: 'Parser', files: [edit(`${P}/x.ts`)] }), agent('b', { description: 'CLI', files: [edit(`${P}/x.ts`)] })],
    2_000,
  )
  expect(src).toContain('Parser')
  expect(src).toContain('CLI')
  expect(src).toContain('x.ts')
  expect(h).toBeGreaterThan(0)
})

test('fileMapSvg: empty state', async () => {
  const [src, h] = fileMapSvg(400, [], 0)
  expect(src).toContain('No file touched yet.')
  expect(h).toBeGreaterThan(0)
  const [src2] = fileMapSvg(400, [agent('a')], 0)
  expect(src2).toContain('No file touched yet.')
})

test('fileMapSvg: common prefix stripped and shown once', async () => {
  const [src] = fileMapSvg(520, [agent('a', { files: [read(`${P}/src/a.ts`), read(`${P}/lib/b.ts`)] })], 2_000)
  expect(src).toContain(`${P}/`)
  expect(src.split('/Users/me/proj').length - 1).toBe(1)
  expect(src).toContain('>src/<')
  expect(src).toContain('>lib/<')
})

test('fileMapSvg: single-child directories merged', async () => {
  const [src] = fileMapSvg(520, [agent('a', { files: [read(`${P}/src/hooks/a.ts`), read(`${P}/README.md`)] })], 2_000)
  expect(src).toContain('>src/hooks/<')
})

test('fileMapSvg: filled for edits, ring for reads', async () => {
  const [src] = fileMapSvg(520, [agent('a', { files: [edit(`${P}/a.ts`)] }), agent('b', { startedAt: 2_000, files: [read(`${P}/b.ts`)] })], 2_000)
  expect(src).toMatch(/data-mark="edit"[^>]*fill="#/)
  expect(src).toMatch(/data-mark="read"[^>]*fill="none"/)
})

test('fileMapSvg: conflict row red with a warning', async () => {
  const [src] = fileMapSvg(520, [agent('a', { files: [edit(`${P}/x.ts`)] }), agent('b', { files: [edit(`${P}/x.ts`), read(`${P}/y.ts`)] })], 2_000)
  expect(src).toMatch(/fill="#D0453F">⚠ x\.ts</)
  expect(src).toMatch(/fill="#D0453F" opacity="0.08"/)
})

test('fileMapSvg: at most 40 rows then +N', async () => {
  const files = Array.from({ length: 60 }, (_, i) => read(`${P}/f${String(i).padStart(2, '0')}.ts`))
  const [src, h] = fileMapSvg(400, [agent('a', { files })], 2_000)
  expect((src.match(/data-mark=/g) ?? []).length).toBe(40)
  expect(src).toContain('+20 more')
  expect(h).toBeLessThan(2000)
})

test('fileMapSvg: W=240 no NaN or negative width', async () => {
  const agents = Array.from({ length: 8 }, (_, i) =>
    agent(String(i), { description: `A very long agent name number ${i}`, startedAt: i, files: [edit(`${P}/a/b/c/d/e/f/g/h/deep-file-name-${i}.ts`), read(`${P}/x.ts`)] }),
  )
  const [src, h] = fileMapSvg(240, agents, 2_000)
  expect(src).not.toContain('NaN')
  expect(src).not.toMatch(/width="-/)
  expect(h).toBeGreaterThan(0)
  const [b] = conflictBannerSvg(240, agents, 2_000)
  expect(b).not.toContain('NaN')
  expect(b).not.toMatch(/width="-/)
})

test('fileMapSvg: data is escaped', async () => {
  const [src] = fileMapSvg(520, [agent('a', { description: 'a<b & "c"', files: [edit(`${P}/a<b>.ts`), read(`${P}/z.ts`)] })], 2_000)
  expect(src).toContain('a&lt;b&gt;.ts')
  expect(src).not.toContain('a<b')
})

test('fileMapSvg: agents without files do not throw', async () => {
  const [src, h] = fileMapSvg(400, [agent('a'), agent('b', { files: [read(`${P}/x.ts`)] })], 2_000)
  expect(src).toContain('x.ts')
  expect(h).toBeGreaterThan(0)
})
