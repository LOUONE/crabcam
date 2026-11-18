// The file map: every file any agent touched, as a tree, with who read or edited it,
// and the conflicts where two agents edited one file at the same time.
import type { AgentRun, Conflict } from '../../types'
import { FONT, agentColor, baseOf, cardSvg, cardTitle, clip, fitText, lastSegments, mx, startText, textWidth, tr, xml } from '../register'

const WARN = '#BA7517'
const RED = '#D0453F'
const ROW = 22
const INDENT = 14
const MAX_DEPTH = 5
const MAX_ROWS = 40
const MARK_R = 4.5
const MARK_STEP = 13
const LIVE_MS = 20_000

const byStart = (agents: AgentRun[]): AgentRun[] => [...agents].sort((a, b) => a.startedAt - b.startedAt)
const nameOf = (a: AgentRun): string => a.description || a.type

type Touch = { reads: number; edits: number; lastAt: number }

// Per agent, its touches merged by path.
const touchesOf = (a: AgentRun): Map<string, Touch> => {
  const out = new Map<string, Touch>()
  for (const f of a.files ?? []) {
    if (!f || typeof f.path !== 'string' || !f.path) continue
    const t = out.get(f.path) ?? { reads: 0, edits: 0, lastAt: 0 }
    out.set(f.path, { reads: t.reads + (f.reads || 0), edits: t.edits + (f.edits || 0), lastAt: Math.max(t.lastAt, f.lastAt || 0) })
  }
  return out
}

const overlap = (a: AgentRun, b: AgentRun): boolean =>
  a.status === 'running' ||
  b.status === 'running' ||
  (a.startedAt < (b.endedAt ?? Infinity) && b.startedAt < (a.endedAt ?? Infinity))

export const conflictsOf = (agents: AgentRun[]): Conflict[] => {
  const editors = new Map<string, AgentRun[]>()
  for (const a of byStart(agents)) {
    for (const [path, t] of touchesOf(a)) {
      if (t.edits <= 0) continue
      const list = editors.get(path) ?? []
      if (!list.some(b => b.id === a.id)) list.push(a)
      editors.set(path, list)
    }
  }
  const out: Conflict[] = []
  for (const [path, list] of editors) {
    if (list.length < 2) continue
    let hit = false
    for (let i = 0; i < list.length && !hit; i++)
      for (let j = i + 1; j < list.length && !hit; j++) {
        const a = list[i]
        const b = list[j]
        if (a && b && overlap(a, b)) hit = true
      }
    if (hit) out.push({ path, agents: list.map(a => a.id) })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

// A compact warning above the agents list: which files several agents edited at once.
export const conflictBannerSvg = (W: number, agents: AgentRun[], at: number): [string, number] => {
  void at
  const conflicts = conflictsOf(agents)
  if (!conflicts.length) return ['', 0]
  const s = tr()
  const byId = new Map(agents.map(a => [a.id, a] as const))
  const shown = conflicts.slice(0, 4)
  const more = conflicts.length - shown.length
  const LINE = 20
  const X = 34
  const lines = shown.length + (more ? 1 : 0)
  const H = 24 + lines * LINE + 14
  const avail = Math.max(20, W - 16 - X)
  const body = shown
    .map((c, i) => {
      const y = 24 + (i + 1) * LINE
      const base = fitText(baseOf(c.path), 12, Math.max(20, avail * 0.5))
      const baseW = textWidth(base, 12)
      const names = c.agents.map(id => { const a = byId.get(id); return a ? nameOf(a) : id }).join(' · ')
      const nx = X + baseW + 8
      const namesFit = fitText(names, 11.5, Math.max(10, W - 16 - nx))
      return (
        `<text class="t" ${startText(W, X, y)} font-family="${FONT}" font-size="12" font-weight="600">${xml(base)}</text>` +
        `<text class="s" ${startText(W, nx, y)} font-family="${FONT}" font-size="11.5">${xml(namesFit)}</text>`
      )
    })
    .join('')
  const tail = more
    ? `<text class="m" ${startText(W, X, 24 + (shown.length + 1) * LINE)} font-family="${FONT}" font-size="11">+${more} ${xml(s.more)}</text>`
    : ''
  const head =
    `<rect x="${mx(W, 6, 4)}" y="10" width="4" height="${Math.max(4, H - 20)}" rx="2" fill="${WARN}"/>` +
    `<text ${startText(W, 16, 24, false)} font-family="${FONT}" font-size="13" fill="${WARN}">⚠</text>` +
    `<text class="t" ${startText(W, X, 24)} font-family="${FONT}" font-size="12.5" font-weight="600">${xml(fitText(s.conflict, 12.5, avail))}</text>`
  return [cardSvg(W, H, head + body + tail), H]
}

type Dir = { name: string; dirs: Map<string, Dir>; files: Map<string, string> }
type Row = { kind: 'dir' | 'file'; depth: number; name: string; path?: string }

const newDir = (name: string): Dir => ({ name, dirs: new Map(), files: new Map() })
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

// Every file below `d`, named by its path relative to `d`'s parent: used past the depth cap.
const flatten = (d: Dir, prefix: string): { name: string; path: string }[] => {
  const out: { name: string; path: string }[] = []
  for (const [n, p] of d.files) out.push({ name: `${prefix}${n}`, path: p })
  for (const sub of d.dirs.values()) out.push(...flatten(sub, `${prefix}${sub.name}/`))
  return out
}

// Merges a directory with its only child directory while it holds no file.
const merged = (d: Dir): Dir => {
  let cur = d
  let name = d.name
  while (cur.files.size === 0 && cur.dirs.size === 1) {
    const only = [...cur.dirs.values()][0]
    if (!only) break
    name = `${name}/${only.name}`
    cur = only
  }
  return { ...cur, name }
}

const rowsOf = (d: Dir, depth: number, out: Row[]): void => {
  const dirs = [...d.dirs.values()].map(merged).sort((a, b) => cmp(a.name, b.name))
  for (const sub of dirs) {
    if (depth >= MAX_DEPTH) {
      for (const f of flatten(sub, `${sub.name}/`).sort((a, b) => cmp(a.name, b.name)))
        out.push({ kind: 'file', depth, name: f.name, path: f.path })
      continue
    }
    out.push({ kind: 'dir', depth, name: `${sub.name}/` })
    rowsOf(sub, depth + 1, out)
  }
  for (const [n, p] of [...d.files].sort((a, b) => cmp(a[0], b[0]))) out.push({ kind: 'file', depth, name: n, path: p })
}

// The project's files any agent touched, as an indented tree, with who touched what.
export const fileMapSvg = (W: number, agents: AgentRun[], at: number): [string, number] => {
  const s = tr()
  const list = byStart(agents)
  const touches = list.map(touchesOf)
  const paths = [...new Set(touches.flatMap(t => [...t.keys()]))].sort(cmp)

  if (!paths.length) {
    const H = 76
    return [
      cardSvg(W, H, cardTitle(W, s.viewFiles, '0') + `<text class="m" ${startText(W, 16, 52)} font-family="${FONT}" font-size="12">${xml(s.noFiles)}</text>`),
      H,
    ]
  }

  // Legend: one chip per agent, wrapping.
  let legend = ''
  let cx = 16
  let cy = 36
  const CHIP_H = 18
  const maxX = W - 16
  list.forEach((a, i) => {
    const label = fitText(clip(nameOf(a), 14), 11, Math.max(20, maxX - 16 - 25))
    const w = Math.min(maxX - 16, 17 + textWidth(label, 11) + 8)
    if (cx > 16 && cx + w > maxX) {
      cx = 16
      cy += CHIP_H + 6
    }
    legend +=
      `<rect class="chip" x="${mx(W, cx, w)}" y="${cy}" width="${w}" height="${CHIP_H}" rx="9"/>` +
      `<circle cx="${mx(W, cx + 9)}" cy="${cy + 9}" r="3.5" fill="${agentColor(i)}"/>` +
      `<text class="s" ${startText(W, cx + 17, cy + 13)} font-family="${FONT}" font-size="11">${xml(label)}</text>`
    cx += w + 6
  })
  let y = list.length ? cy + CHIP_H + 8 : 36

  // Common directory prefix of every path.
  const split = paths.map(p => p.split('/').filter(Boolean))
  const first = split[0] ?? []
  let common = Math.max(0, first.length - 1)
  for (const segs of split) {
    let k = 0
    while (k < common && k < segs.length - 1 && segs[k] === first[k]) k++
    common = k
  }
  const prefix = first.slice(0, common)
  const isAbs = paths.every(p => p.startsWith('/'))
  const rootText = prefix.length ? `${isAbs ? '/' : ''}${prefix.join('/')}/` : isAbs ? '/' : './'
  const rootAvail = Math.max(20, W - 32)
  const rootShown = textWidth(rootText, 10.5) > rootAvail ? fitText(`…/${lastSegments(prefix.join('/'))}/`, 10.5, rootAvail) : rootText
  const rootLine = `<text class="m" ${startText(W, 16, y + 12)} font-family="${FONT}" font-size="10.5">${xml(rootShown)}</text>`
  y += 18

  // The tree.
  const root = newDir('')
  paths.forEach((p, i) => {
    const segs = (split[i] ?? []).slice(common)
    let d = root
    for (const seg of segs.slice(0, -1)) {
      const next = d.dirs.get(seg) ?? newDir(seg)
      d.dirs.set(seg, next)
      d = next
    }
    d.files.set(segs[segs.length - 1] ?? baseOf(p), p)
  })
  const all: Row[] = []
  rowsOf(root, 0, all)
  const rows = all.slice(0, MAX_ROWS)
  const more = all.length - rows.length

  const conflictPaths = new Set(conflictsOf(agents).map(c => c.path))
  const body = rows
    .map((r, ri) => {
      const top = y + ri * ROW
      const base = top + 15
      const tx = 16 + Math.min(r.depth, MAX_DEPTH) * INDENT
      if (r.kind === 'dir') {
        return `<text class="s" ${startText(W, tx, base)} font-family="${FONT}" font-size="12" font-weight="600">${xml(fitText(r.name, 12, Math.max(10, W - 16 - tx)))}</text>`
      }
      const path = r.path ?? ''
      const marks: string[] = []
      list.forEach((a, i) => {
        const t = touches[i]?.get(path)
        if (!t) return
        const live = a.status === 'running' && at - t.lastAt < LIVE_MS ? ' class="live"' : ''
        marks.push(
          t.edits > 0
            ? `<circle data-mark="edit"${live} cx="CX" cy="${top + 11}" r="${MARK_R}" fill="${agentColor(i)}"/>`
            : `<circle data-mark="read"${live} cx="CX" cy="${top + 11}" r="${MARK_R}" fill="none" stroke="${agentColor(i)}" stroke-width="1.5"/>`,
        )
      })
      const n = marks.length
      const lastCx = W - 16 - MARK_R
      const placed = marks.map((m, k) => m.replace('cx="CX"', `cx="${mx(W, lastCx - (n - 1 - k) * MARK_STEP)}"`)).join('')
      const marksStart = n ? lastCx - (n - 1) * MARK_STEP - MARK_R : W - 16
      const isConflict = conflictPaths.has(path)
      const label = fitText(isConflict ? `⚠ ${r.name}` : r.name, 12, Math.max(10, marksStart - 8 - tx))
      const bg = isConflict
        ? `<rect x="${mx(W, 10, Math.max(0, W - 20))}" y="${top}" width="${Math.max(0, W - 20)}" height="${ROW}" rx="4" fill="${RED}" opacity="0.08"/>`
        : ''
      const text = isConflict
        ? `<text ${startText(W, tx, base)} font-family="${FONT}" font-size="12" fill="${RED}">${xml(label)}</text>`
        : `<text class="t" ${startText(W, tx, base)} font-family="${FONT}" font-size="12">${xml(label)}</text>`
      return bg + text + placed
    })
    .join('')
  y += rows.length * ROW
  const tail = more ? `<text class="m" ${startText(W, 16, y + 14)} font-family="${FONT}" font-size="11">+${more} ${xml(s.more)}</text>` : ''
  if (more) y += 18
  const H = y + 10
  return [cardSvg(W, H, cardTitle(W, s.viewFiles, String(paths.length)) + legend + rootLine + body + tail), H]
}
