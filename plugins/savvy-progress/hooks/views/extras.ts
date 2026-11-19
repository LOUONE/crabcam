import type { AgentRun } from '../../types'
import {
  DONE,
  FONT,
  cardSvg,
  cardTitle,
  colorOf,
  costumeOf,
  crab,
  crabWidth,
  fitText,
  fmtCost,
  fmtTime,
  fmtTokens,
  isRtl,
  mx,
  startText,
  textWidth,
  tierOf,
  totals,
  tr,
  wrapText,
  xml,
} from '../register'

const PAD = 20
const SAID_SIZE = 13
const SAID_LINE = 19
const THOUGHT_SIZE = 11.5
const THOUGHT_LINE = 17

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

// The agent's own latest sentence, written between two tool calls: free, no narrator involved.
export const saidSvg = (W: number, a: AgentRun, at: number): [string, number] => {
  const said = a.said
  if (!said || !said.text.trim()) return ['', 0]
  const s = tr()
  const lines = wrapText(said.text, SAID_SIZE, Math.max(0, W - 48), 5)
  const thoughts = [...(a.thoughts ?? [])]
  if (thoughts.length && thoughts[thoughts.length - 1]?.text === said.text) thoughts.pop()
  const earlier = thoughts
    .map(t => oneLine(t.text))
    .filter(t => t && t !== oneLine(said.text))
    .reverse()
    .slice(0, 2)
  const textEnd = 46 + (Math.max(1, lines.length) - 1) * SAID_LINE
  const ruleY = textEnd + 13
  const H = earlier.length ? ruleY + 19 + (earlier.length - 1) * THOUGHT_LINE + 16 : textEnd + 18
  const text = lines
    .map((l, i) => `<text class="t" ${startText(W, PAD, 46 + i * SAID_LINE)} font-family="${FONT}" font-size="${SAID_SIZE}">${xml(l)}</text>`)
    .join('')
  const past = earlier.length
    ? `<line class="ln" x1="${mx(W, PAD)}" y1="${ruleY}" x2="${mx(W, W - 16)}" y2="${ruleY}"/>` +
      earlier
        .map(
          (t, i) =>
            `<text class="m" ${startText(W, PAD, ruleY + 19 + i * THOUGHT_LINE)} font-family="${FONT}" font-size="${THOUGHT_SIZE}">${xml(fitText(`· ${t}`, THOUGHT_SIZE, Math.max(0, W - PAD - 16)))}</text>`,
        )
        .join('')
    : ''
  const body =
    `<rect x="${mx(W, 0, 4)}" y="14" width="4" height="${H - 28}" rx="2" fill="${colorOf(tierOf(a.type))}"/>` +
    cardTitle(W, s.said, `${s.ago} ${fmtTime(Math.max(0, at - said.at))}`) +
    text +
    past
  return [cardSvg(W, H, body), H]
}

const PARTY_H = 132
const PARTY_SCALE = 0.9
const PARTY_BIG = 1.2
const FLOOR = 120
// Kept for callers that time the party; the card itself no longer animates.
export const PARTY_MS = 3600


// The end-of-flow card: the crabs lined up, still, under the totals. No animation at all,
// so a redraw of the panel can never replay or stutter anything.
export const partySvg = (W: number, agents: AgentRun[], at: number, elapsedMs = 0): [string, number] => {
  if (!agents.length) return ['', 0]
  void elapsedMs
  const s = tr()
  const H = PARTY_H
  const rtl = isRtl()
  const t = totals(agents, at)
  const inner = Math.max(0, W - PAD - 16)
  const sub = `${agents.length} ${s.agentsCount} · ${fmtTime(t.time)} · ≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} ${s.tokensWord}`

  // The crabs, oldest first; when they do not all fit, as many as fit then "+N".
  const list = [...agents].sort((x, y) => x.startedAt - y.startedAt)
  // Bigger crabs when all of them fit at that size; else the smaller ones and "+N".
  const scale = list.length * (crabWidth(PARTY_BIG) + 6) <= inner + 6 ? PARTY_BIG : PARTY_SCALE
  const cw = crabWidth(scale)
  const slot = cw + 6
  const cy = Math.round((FLOOR - 28 * scale) * 100) / 100
  let shown = list
  let more = ''
  let rowW = inner
  if (list.length * slot > inner + 6) {
    const label = `+${list.length}`
    const labelW = textWidth(label, 11) + 8
    const k = Math.max(0, Math.floor((inner - labelW + 6) / slot))
    shown = list.slice(0, k)
    rowW = k * slot
    more = `<text class="m" ${startText(W, PAD + rowW + 2, FLOOR - 6, false)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">+${list.length - k}</text>`
  }
  const step = shown.length ? rowW / shown.length : 0
  const crabs = shown
    .map((a, i) => {
      const x = Math.round((PAD + i * step + Math.max(0, step - cw) / 2) * 100) / 100
      const isFailed = a.status === 'failed'
      const g = crab(mx(W, x, cw), cy, costumeOf(a.type), isFailed, false, scale, rtl)
      return `<g>${g}</g>`
    })
    .join('')

  const body =
    `<rect x="${mx(W, 0, 4)}" y="14" width="4" height="${H - 28}" rx="2" fill="${DONE}"/>` +
    `<text class="t" ${startText(W, PAD, 28)} font-family="${FONT}" font-size="15" font-weight="700">${xml(fitText(s.allDone, 15, inner))}</text>` +
    `<text class="s" ${startText(W, PAD, 46)} font-family="${FONT}" font-size="11.5">${xml(fitText(sub, 11.5, inner))}</text>` +
    crabs +
    more
  return [cardSvg(W, H, body), H]
}
