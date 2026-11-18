import type { AgentRun } from '../../types'
import {
  ACCENT,
  DONE,
  FONT,
  KIND_COLOR,
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
  noise,
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
const CONFETTI = 16
// The whole celebration, in ms: four hops in a wave (4 × 0.64 s + 0.9 s of stagger) and one fall
// of confetti (2.4 s + 1.2 s of stagger). Past it the drawing holds no animation at all.
export const PARTY_MS = 3800

const PARTY_CSS = `<style>
/* Four hops, then still: up on an ease-out, down on an ease-in, a small settle at the end. */
.hop{animation:hop .64s 4 both;will-change:transform}
@keyframes hop{0%{transform:translateY(0);animation-timing-function:cubic-bezier(.25,.8,.45,1)}46%{transform:translateY(-10px);animation-timing-function:cubic-bezier(.55,0,.75,.2)}88%{transform:translateY(0);animation-timing-function:ease-out}94%{transform:translateY(-1.5px);animation-timing-function:ease-in}100%{transform:translateY(0)}}
/* Confetti falls once and is gone. */
.cf{animation:fall 2.4s linear 1 both;will-change:transform,opacity}
@keyframes fall{0%{transform:translateY(-12px);opacity:0}12%{opacity:1}80%{opacity:1}100%{transform:translateY(100px);opacity:0}}
@media (prefers-reduced-motion: reduce){.hop,.cf{animation:none}.cf{opacity:.7}}
</style>`

const secs = (n: number): string => `${+n.toFixed(3)}s`

// The end-of-flow celebration: the crabs hop four times in a wave under confetti that falls once.
// The panel redraws now and then, and a redrawn SVG starts its CSS animations over. So the
// drawing is told how long the party has been going (`elapsedMs`): each delay is shifted back
// by it, which resumes every animation where it was, and once the party is over the drawing
// carries no animation at all, so nothing can start again.
export const partySvg = (W: number, agents: AgentRun[], at: number, elapsedMs = 0): [string, number] => {
  if (!agents.length) return ['', 0]
  const isOver = !(elapsedMs < PARTY_MS)
  const gone = Math.max(0, elapsedMs) / 1000
  const s = tr()
  const H = PARTY_H
  const rtl = isRtl()
  const t = totals(agents, at)
  const inner = Math.max(0, W - PAD - 16)
  const sub = `${agents.length} ${s.agentsCount} · ${fmtTime(t.time)} · ≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} ${s.tokensWord}`

  // Confetti, deterministic, clipped to the card. The rotation sits on the rect so the
  // CSS transform of the falling group does not replace it.
  const colors = [...Object.values(KIND_COLOR), ACCENT, DONE]
  const confetti = isOver ? '' : Array.from({ length: CONFETTI }, (_, i) => {
    const x = Math.round((6 + noise(i, 1) * Math.max(0, W - 16)) * 10) / 10
    const y = Math.round(noise(i, 2) * 60 * 10) / 10
    const r = Math.round(noise(i, 4) * 360)
    return `<g class="cf" style="animation-delay:${secs(noise(i, 3) * 1.2 - gone)}"><rect x="${x}" y="${y}" width="4" height="7" rx="1" fill="${colors[i % colors.length]}" transform="rotate(${r} ${x + 2} ${y + 3.5})"/></g>`
  }).join('')

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
      return isFailed || isOver ? `<g>${g}</g>` : `<g class="hop" style="animation-delay:${secs(Math.min(0.9, i * 0.09) - gone)}">${g}</g>`
    })
    .join('')

  const body =
    (isOver ? '' : PARTY_CSS) +
    `<defs><clipPath id="pc"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12"/></clipPath></defs>` +
    `<g clip-path="url(#pc)">${confetti}</g>` +
    `<rect x="${mx(W, 0, 4)}" y="14" width="4" height="${H - 28}" rx="2" fill="${DONE}"/>` +
    `<text class="t" ${startText(W, PAD, 28)} font-family="${FONT}" font-size="15" font-weight="700">${xml(fitText(s.allDone, 15, inner))}</text>` +
    `<text class="s" ${startText(W, PAD, 46)} font-family="${FONT}" font-size="11.5">${xml(fitText(sub, 11.5, inner))}</text>` +
    crabs +
    more
  return [cardSvg(W, H, body), H]
}
