// The crab office: each agent stands in the room of what it is doing now.
// Library = reading and the web, Workshop = editing, Lab = running; everyone
// else waits in the lounge, finished ones dimmed with their result above them.
import type { ActivityKind, AgentRun } from '../../types'
import {
  DONE,
  FONT,
  KIND_COLOR,
  KIND_GLYPH,
  cardSvg,
  cardTitle,
  costumeOf,
  crab,
  crabWidth,
  endText,
  fitText,
  isRtl,
  mx,
  phaseOf,
  startText,
  textWidth,
  tr,
  xml,
} from '../register'

type Room = 'library' | 'workshop' | 'lab' | 'lounge'

const PAD = 16
const GAP = 8
const TOP = 40
const ROOM_H = 118
const LOUNGE_H = 64
const RED = '#D0453F'
const AMBER = '#BA7517'
const NAME_SIZE = 9.5

const r1 = (n: number): number => Math.round(n * 10) / 10

const roomOf = (a: AgentRun): Room => {
  if (a.status !== 'running') return 'lounge'
  const k = phaseOf(a)?.kind
  if (k === 'explore' || k === 'web') return 'library'
  if (k === 'edit') return 'workshop'
  if (k === 'run') return 'lab'
  return 'lounge'
}

// Scenery on a 2px grid, at most 14 rects each: [x, y, w, h, opacity] in the room's
// colour, or [x, y, w, h, class] for a neutral fill.
type Px = [number, number, number, number, number | string]
const SCENERY: Record<Exclude<Room, 'lounge'>, { w: number; h: number; px: Px[] }> = {
  // A bookshelf: frame, two shelves, coloured spines and one book lying flat.
  library: {
    w: 44,
    h: 34,
    px: [
      [0, 0, 44, 34, 'k'],
      [0, 0, 2, 34, 0.9], [42, 0, 2, 34, 0.9], [0, 0, 44, 2, 0.9], [0, 16, 44, 2, 0.9], [0, 32, 44, 2, 0.9],
      [4, 4, 4, 12, 0.7], [10, 6, 4, 10, 'm'], [16, 4, 2, 12, 0.5], [20, 6, 4, 10, 0.9],
      [4, 20, 4, 12, 'm'], [10, 22, 2, 10, 0.6], [14, 20, 4, 12, 0.8], [28, 28, 12, 4, 0.5],
    ],
  },
  // A workbench with a hammer and a small vise.
  workshop: {
    w: 48,
    h: 26,
    px: [
      [0, 12, 48, 4, 0.8], [2, 16, 4, 10, 0.6], [42, 16, 4, 10, 0.6], [6, 22, 36, 2, 'm'],
      [6, 10, 14, 2, 'm'], [20, 6, 4, 6, 0.9],
      [32, 8, 8, 4, 0.5], [34, 4, 4, 4, 0.7], [26, 10, 2, 2, 'm'],
    ],
  },
  // A bench with a flask and a small screen showing a rising line.
  lab: {
    w: 50,
    h: 30,
    px: [
      [0, 18, 50, 4, 0.8], [2, 22, 4, 8, 0.6], [44, 22, 4, 8, 0.6],
      [10, 6, 2, 4, 'm'], [8, 10, 6, 2, 'm'], [6, 12, 10, 6, 0.7],
      [26, 2, 20, 14, 'm'], [28, 4, 16, 10, 'k'], [30, 10, 4, 2, 0.9], [34, 8, 4, 2, 0.9], [38, 6, 4, 2, 0.9],
      [34, 16, 4, 2, 'm'],
    ],
  },
}

const scenery = (W: number, room: Exclude<Room, 'lounge'>, x: number, y: number, rw: number, color: string): string => {
  const s = SCENERY[room]
  const left = Math.round((x + (rw - s.w) / 2) / 2) * 2
  const tx = mx(W, left, s.w)
  const rects = s.px
    .map(([px, py, w, h, f]) =>
      typeof f === 'string'
        ? `<rect class="${f}" x="${px}" y="${py}" width="${w}" height="${h}"/>`
        : `<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${color}" fill-opacity="${f}"/>`,
    )
    .join('')
  return `<g transform="translate(${r1(tx)},${r1(y - s.h)})" shape-rendering="crispEdges">${rects}</g>`
}

// One row of crabs on a floor: x..x+w, crab top at `cy`. Returns the drawing.
const crabRow = (
  W: number,
  room: Room,
  list: AgentRun[],
  x: number,
  w: number,
  cy: number,
  scale: number,
  opts: { names: boolean; nameY: number; maxSlot: number },
): string => {
  const cw = crabWidth(scale)
  const need = cw + 4
  const inner = Math.max(0, w)
  const cap = Math.max(0, Math.floor(inner / need))
  const isMore = list.length > cap
  const shown = isMore ? list.slice(0, Math.max(0, cap - 1)) : list
  const more = list.length - shown.length
  const items = shown.length + (more > 0 ? 1 : 0)
  if (!items) return ''
  const slot = Math.min(opts.maxSlot, inner / items)
  const rowW = slot * items
  const x0 = opts.maxSlot < inner / items ? x : x + (inner - rowW) / 2
  const rtl = isRtl()
  const out: string[] = []
  shown.forEach((a, i) => {
    const sx = x0 + i * slot
    const crabX = sx + (slot - cw) / 2
    const left = mx(W, crabX, cw)
    const isRunning = a.status === 'running'
    let g = crab(r1(left), r1(cy), costumeOf(a.type ?? ''), !isRunning, isRunning, scale, rtl)
    const mid = r1(left + cw / 2)
    if (!isRunning && room === 'lounge') {
      const ok = a.status === 'done'
      g += `<text x="${mid}" y="${r1(cy + 1)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="700" fill="${ok ? DONE : RED}">${ok ? '✓' : '✗'}</text>`
    } else if (a.loop) {
      g += `<text x="${mid}" y="${r1(cy + 1)}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="700" fill="${AMBER}">↻</text>`
    }
    if ((a.errorCount ?? 0) > 0 && !a.loop) {
      const dotX = rtl ? left + 3 : left + cw - 3
      g += `<circle cx="${r1(dotX)}" cy="${r1(cy + 3)}" r="3" fill="${RED}"/>`
    }
    if (opts.names && slot >= 44) {
      const name = fitText(a.description || a.type || '', NAME_SIZE, slot - 4)
      const c = r1(mx(W, sx + slot / 2))
      g += `<text class="s" x="${c}" y="${opts.nameY}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="${NAME_SIZE}">${xml(name)}</text>`
    }
    out.push(`<g data-room="${room}">${g}</g>`)
  })
  if (more > 0) {
    const c = r1(mx(W, x0 + shown.length * slot + slot / 2))
    out.push(
      `<text class="m" x="${c}" y="${r1(cy + (28 * scale) / 2 + 4)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600">+${more}</text>`,
    )
  }
  return out.join('')
}

const ROOMS: { room: Exclude<Room, 'lounge'>; kind: ActivityKind; label: () => string }[] = [
  { room: 'library', kind: 'explore', label: () => tr().library },
  { room: 'workshop', kind: 'edit', label: () => tr().workshop },
  { room: 'lab', kind: 'run', label: () => tr().lab },
]

export const officeSvg = (W: number, agents: AgentRun[], at: number): [string, number] => {
  void at
  const s = tr()
  const list = [...(agents ?? [])].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
  const running = list.filter(a => a.status === 'running').length
  const rw = Math.max(0, (W - 2 * PAD - 2 * GAP) / 3)
  const loungeY = TOP + ROOM_H + GAP
  const H = loungeY + LOUNGE_H + PAD
  const parts: string[] = [cardTitle(W, s.viewOffice, `${running} ${s.busy}`)]

  ROOMS.forEach(({ room, kind, label }, i) => {
    const x = PAD + i * (rw + GAP)
    const color = KIND_COLOR[kind]
    const inRoom = list.filter(a => roomOf(a) === room)
    parts.push(
      `<rect x="${r1(mx(W, x, rw))}" y="${TOP}" width="${r1(rw)}" height="${ROOM_H}" rx="10" fill="${color}" fill-opacity=".1" stroke="${color}" stroke-opacity=".45" stroke-width="1"/>`,
    )
    const count = String(inRoom.length)
    const labelW = Math.max(0, rw - 20 - textWidth(count, 11) - 6)
    parts.push(
      `<text ${startText(W, r1(x + 10), TOP + 17)} font-family="${FONT}" font-size="11" font-weight="600" fill="${color}">${xml(fitText(`${KIND_GLYPH[kind]} ${label()}`, 11, labelW))}</text>`,
      `<text class="m" ${endText(W, r1(x + rw - 10), TOP + 17)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${count}</text>`,
    )
    const floor = TOP + ROOM_H - 20
    if (rw >= 90) parts.push(scenery(W, room, x, floor - 12, rw, color))
    // Bigger crabs in wider rooms: three sizes by the room's width.
    const scale = rw >= 130 ? 1.3 : rw >= 110 ? 0.9 : 0.7
    const cy = floor - 26 * scale
    parts.push(crabRow(W, room, inRoom, x + 6, rw - 12, cy, scale, { names: true, nameY: TOP + ROOM_H - 8, maxSlot: Infinity }))
  })

  // The lounge: running agents between phases first, then finished ones.
  const lw = Math.max(0, W - 2 * PAD)
  const lounge = list.filter(a => roomOf(a) === 'lounge')
  const waiting = [...lounge.filter(a => a.status === 'running'), ...lounge.filter(a => a.status !== 'running')]
  parts.push(
    `<rect class="tile ln" x="${PAD}" y="${loungeY}" width="${r1(lw)}" height="${LOUNGE_H}" rx="10" stroke-width="1"/>`,
    `<text class="s" ${startText(W, PAD + 10, loungeY + 17)} font-family="${FONT}" font-size="11" font-weight="600">${xml(fitText(s.lounge, 11, Math.max(0, lw - 50)))}</text>`,
    `<text class="m" ${endText(W, r1(PAD + lw - 10), loungeY + 17)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${waiting.length}</text>`,
  )
  if (!list.length) {
    parts.push(
      `<text class="m" x="${r1(W / 2)}" y="${loungeY + 42}" text-anchor="middle"${isRtl() ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11">${xml(fitText(s.empty, 11, Math.max(0, lw - 20)))}</text>`,
    )
  } else {
    const scale = 0.9
    const cy = loungeY + LOUNGE_H - 6 - 26 * scale
    parts.push(crabRow(W, 'lounge', waiting, PAD + 10, lw - 20, cy, scale, { names: false, nameY: 0, maxSlot: crabWidth(scale) + 12 }))
  }

  return [cardSvg(W, H, parts.join('')), H]
}
