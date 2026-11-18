import { ACCENT, DONE, FONT, cardSvg, cardTitle, ctxOf, elapsed, endText, fmtCost, fmtTime, fmtTokens, mx, startText, tr, xml } from '../register'
import type { AgentRun } from '../../types'

const PAD = 16
const PLOT_TOP = 36
const PLOT_H = 64

const r2 = (n: number): number => Math.round(n * 100) / 100
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

const gaugeColor = (ctx: number): string => (ctx >= 85 ? '#D0453F' : ctx >= 60 ? '#BA7517' : DONE)

// One agent's cost over time as a step line, then how full its context is.
export const costCurveSvg = (W: number, a: AgentRun, at: number): [string, number] => {
  const s = tr()
  const innerW = Math.max(0, W - PAD * 2)
  const samples = (a.samples ?? []).filter(p => Number.isFinite(p.at) && Number.isFinite(p.costUsd))
  const isRunning = a.status === 'running'
  const t0 = a.startedAt
  const span = Math.max(10_000, (a.endedAt ?? at) - t0)
  const maxC = Math.max(0.01, ...samples.map(p => p.costUsd))
  const bottom = PLOT_TOP + PLOT_H
  // Positions go through mx so that time runs right to left in Hebrew.
  const xOf = (t: number): number => r2(mx(W, PAD + innerW * clamp01((t - t0) / span)))
  const yOf = (c: number): number => r2(bottom - PLOT_H * clamp01(c / maxC))

  // The top rule has no label: the title already shows the cost.
  const rule = (frac: number, isLabelled: boolean): string => {
    const y = r2(bottom - PLOT_H * frac)
    return (
      `<line class="ln" x1="${mx(W, PAD)}" y1="${y}" x2="${mx(W, W - PAD)}" y2="${y}"/>` +
      (isLabelled
        ? `<text class="m" ${endText(W, W - PAD, r2(y - 3))} font-family="${FONT}" font-size="10.5" font-variant-numeric="tabular-nums">${xml(fmtCost(maxC * frac))}</text>`
        : '')
    )
  }

  let plot = ''
  const lastSample = samples[samples.length - 1]
  if (samples.length >= 2 && lastSample) {
    const pts: [number, number][] = [[t0, 0], ...samples.map(p => [p.at, p.costUsd] as [number, number])]
    if (isRunning) pts.push([at, lastSample.costUsd])
    const xy = pts.map(([t, c]) => [xOf(t), yOf(c)] as [number, number])
    const [fx, fy] = [xOf(t0), yOf(0)]
    let [lx, ly] = [fx, fy]
    // Step after: the cost holds until the next request, then jumps.
    let line = `M${fx} ${fy}`
    for (const [x, y] of xy.slice(1)) {
      line += `H${x}V${y}`
      ;[lx, ly] = [x, y]
    }
    const area = `${line}V${bottom}H${fx}Z`
    plot =
      `<path d="${area}" fill="${ACCENT}" fill-opacity="0.14" stroke="none"/>` +
      `<path d="${line}" fill="none" stroke="${ACCENT}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle${isRunning ? ' class="live"' : ''} cx="${lx}" cy="${ly}" r="3.5" fill="${ACCENT}"/>`
  } else {
    plot = `<text class="m" x="${r2(W / 2)}" y="${r2(PLOT_TOP + PLOT_H / 2 + 4)}" text-anchor="middle" font-family="${FONT}" font-size="11">${xml(s.noData)}</text>`
  }

  const xLabelY = bottom + 14
  const xLabels =
    `<text class="m" ${startText(W, PAD, xLabelY, false)} font-family="${FONT}" font-size="10.5" font-variant-numeric="tabular-nums">0:00</text>` +
    `<text class="m" ${endText(W, W - PAD, xLabelY)} font-family="${FONT}" font-size="10.5" font-variant-numeric="tabular-nums">${xml(fmtTime(elapsed(a, at)))}</text>`

  // The context gauge, 14 px under the x labels.
  const ctx = ctxOf(a)
  const labelY = xLabelY + 14 + 9
  const trackY = labelY + 8
  const fillW = ctx > 0 ? r2(Math.max(2, (innerW * ctx) / 100)) : 0
  const gauge =
    `<text class="t" ${startText(W, PAD, labelY)} font-family="${FONT}" font-size="11.5" font-weight="600">${xml(`${s.ctx} ${ctx}%`)}</text>` +
    `<text class="m" ${endText(W, W - PAD, labelY)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(`${fmtTokens(a.contextTokens)} / ${fmtTokens(a.contextMax)}`)}</text>` +
    `<rect class="k" x="${mx(W, PAD, innerW)}" y="${trackY}" width="${innerW}" height="8" rx="4"/>` +
    `<rect x="${r2(mx(W, PAD, fillW))}" y="${trackY}" width="${fillW}" height="8" rx="4" fill="${gaugeColor(ctx)}"/>`

  const H = trackY + 8 + PAD
  const body = cardTitle(W, s.costCurve, '≈' + fmtCost(a.costUsd)) + rule(0.5, true) + rule(1, false) + plot + xLabels + gauge
  return [cardSvg(W, H, body), H]
}
