import type { ActivityKind, AgentRun } from '../../types'
import {
  DONE,
  FONT,
  KIND_COLOR,
  KINDS,
  agentColor,
  cardSvg,
  cardTitle,
  costumeOf,
  crab,
  crabWidth,
  endText,
  eventsOf,
  fitText,
  fmtTime,
  isRtl,
  kindWord,
  mx,
  startText,
  textWidth,
  tr,
  xml,
} from '../register'

const ERR = '#D0453F'
const MAX_LANES = 12
const LANE = 30
const TOP = 40
const MIN_SPAN = 60_000
const CRAB_SCALE = 0.55

// One lane per agent, time left to right, each lane coloured by what the agent was doing.
export const lanesSvg = (W: number, agents: AgentRun[], at: number): [string, number] => {
  const s = tr()
  if (!agents.length) {
    const H = 64
    return [cardSvg(W, H, cardTitle(W, s.viewLanes) + `<text class="m" ${startText(W, 16, 50)} font-family="${FONT}" font-size="12">${xml(s.empty)}</text>`), H]
  }
  const sorted = [...agents].sort((a, b) => a.startedAt - b.startedAt)
  const endOf = (a: AgentRun): number => Math.max(a.startedAt, a.endedAt ?? at)
  const t0 = Math.min(...sorted.map(a => a.startedAt))
  const t1 = Math.max(...sorted.map(endOf))
  const span = Math.max(MIN_SPAN, t1 - t0)
  const labelW = W >= 360 ? 104 : 72
  const trackX0 = 16 + labelW
  const trackW = Math.max(1, W - 16 - trackX0 - 12)
  const tx = (t: number): number => trackX0 + (Math.min(Math.max(t, t0), t0 + span) - t0) / span * trackW
  const box = (x: number, w: number): string => `x="${Math.round(mx(W, x, w) * 10) / 10}" width="${Math.round(w * 10) / 10}"`

  const shown = sorted.slice(0, MAX_LANES)
  const more = sorted.length - shown.length
  const seen = new Set<ActivityKind>()
  const cw = crabWidth(CRAB_SCALE)

  const lanes = shown
    .map((a, i) => {
      const cy = TOP + i * LANE + LANE / 2
      const start = a.startedAt
      const end = endOf(a)
      const xs = tx(start)
      const xe = Math.max(xs + 2, tx(end))
      const evs = [...eventsOf(a)].sort((p, q) => p.at - q.at)
      // Merge consecutive events of one kind into a segment.
      const segs: { kind: ActivityKind; from: number }[] = []
      for (const ev of evs) {
        if (segs[segs.length - 1]?.kind === ev.kind) continue
        segs.push({ kind: ev.kind, from: Math.min(Math.max(ev.at, start), end) })
      }
      const segRects = segs
        .map((g, j) => {
          seen.add(g.kind)
          const x1 = tx(g.from)
          const x2 = tx(segs[j + 1]?.from ?? end)
          return `<rect ${box(x1, Math.max(2, x2 - x1))} y="${cy - 7}" height="14" rx="3" fill="${KIND_COLOR[g.kind] ?? KIND_COLOR.other}"/>`
        })
        .join('')
      const errs = evs
        .filter(ev => ev.isError)
        .map(ev => `<rect ${box(tx(ev.at) - 1, 2)} y="${cy - 9}" height="18" fill="${ERR}"/>`)
        .join('')
      const mcx = mx(W, xe + 7)
      const mark =
        a.status === 'running'
          ? `<circle class="live" cx="${mcx}" cy="${cy}" r="4" fill="${agentColor(i)}"/>`
          : a.status === 'failed'
            ? `<path d="M${mcx - 3} ${cy - 3}l6 6M${mcx + 3} ${cy - 3}l-6 6" stroke="${ERR}" stroke-width="1.6" stroke-linecap="round"/>`
            : `<path d="M${mcx - 3.5} ${cy}l2.5 2.5 4.5-5" fill="none" stroke="${DONE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      const nameW = Math.max(10, labelW - cw - 12)
      return (
        crab(mx(W, 16, cw), cy - 7.7, costumeOf(a.type), a.status !== 'running', a.status === 'running', CRAB_SCALE, isRtl()) +
        `<text class="t" ${startText(W, 16 + cw + 6, cy + 4)} font-family="${FONT}" font-size="11">${xml(fitText(a.description || a.type, 11, nameW))}</text>` +
        `<rect class="k" ${box(xs, xe - xs)} y="${cy - 7}" height="14" rx="7"/>` +
        segRects +
        errs +
        mark
      )
    })
    .join('')

  let y = TOP + shown.length * LANE
  let tail = ''
  if (more) {
    tail = `<text class="m" ${startText(W, 16, y + 12)} font-family="${FONT}" font-size="11">+${more} ${xml(s.more)}</text>`
    y += 18
  }

  // Time axis under the lanes.
  const ay = y + 6
  const ticks = [0, 1, 2, 3]
    .map(k => {
      const x = trackX0 + (k / 3) * trackW
      const label = xml(fmtTime((k / 3) * span))
      const pos =
        k === 0
          ? startText(W, x, ay + 17, false)
          : k === 3
            ? endText(W, x, ay + 17)
            : `x="${Math.round(mx(W, x) * 10) / 10}" y="${ay + 17}" text-anchor="middle"`
      return (
        `<line class="ln" x1="${Math.round(mx(W, x) * 10) / 10}" y1="${ay}" x2="${Math.round(mx(W, x) * 10) / 10}" y2="${ay + 4}"/>` +
        `<text class="m" ${pos} font-family="${FONT}" font-size="10.5" font-variant-numeric="tabular-nums">${label}</text>`
      )
    })
    .join('')
  const axis = `<line class="ln" x1="${Math.round(mx(W, trackX0) * 10) / 10}" y1="${ay}" x2="${Math.round(mx(W, trackX0 + trackW) * 10) / 10}" y2="${ay}"/>` + ticks

  // Legend: one chip per kind drawn, wrapping when the row is full.
  const kinds = KINDS.filter(k => seen.has(k))
  let lx = 16
  let ly = ay + 28
  const legend = kinds
    .map(k => {
      const label = kindWord(k)
      const w = textWidth(label, 11) + 28
      if (lx > 16 && lx + w > W - 16) {
        lx = 16
        ly += 22
      }
      const chip =
        `<rect class="chip" ${box(lx, w)} y="${ly}" height="16" rx="8"/>` +
        `<circle cx="${Math.round(mx(W, lx + 9) * 10) / 10}" cy="${ly + 8}" r="3.5" fill="${KIND_COLOR[k]}"/>` +
        `<text class="s" ${startText(W, lx + 17, ly + 12)} font-family="${FONT}" font-size="11">${xml(label)}</text>`
      lx += w + 6
      return chip
    })
    .join('')
  const H = kinds.length ? ly + 16 + 14 : ay + 17 + 14
  return [cardSvg(W, H, cardTitle(W, s.viewLanes, fmtTime(t1 - t0)) + lanes + tail + axis + legend), H]
}
