# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward without toggling): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag. `prefers-reduced-motion` stops them.

## Live activity and Details (1.4.0)

The panel shows what each subagent is actually doing, read from Claude Code's own tool-call events: no model call, no tokens.

- **In the list**, a running agent shows its latest action (`▶ Bash npm test`, `◎ Read src/foo.ts`), `⏸ idle 1:20` after a minute without a call, and the narrator's latest sentence once there is one. **Log** shows the last four actions of every row.
- **Details ›** under an agent opens it up close: its phase now (◎ exploring, ✎ editing, ▶ running, ◍ web, ⇢ delegating) and for how long, a strip of every call coloured by kind, the files it read or edited (how often, how long ago, the one in use pulsing), and its timeline. On the desktop these are drawn as cards; the terminal shows the same as text.
- **The narrator** writes one sentence on what the open agent is doing and why ("It fixes the parser in foo.ts, then reruns the tests."). It is one Haiku 5.5 call at low effort, about 1K tokens in and 50 out (≈ $0.0001), made only for the agent open in Details, at most every 15 seconds and only after 3 new calls. Its running cost shows under the sentence. `narrator: off` turns it off, and the panel then costs no tokens at all; `all` narrates every agent.

Self-reported steps (the `step` tool and the line added to each worker's brief) cost a tool call per step, so they are **off** by default; `stepReports: on` brings them back.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows its context fill in grey instead. The tool is listed up front rather than behind ToolSearch, and each `savvy-*` worker gets one line at the end of its brief asking for these reports.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `fr`, `ru` or `he`. Hebrew draws the bar and the panel right to left. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

`narrator`: `selected` (default), `all` or `off`; see Live activity and Details.

`stepReports`: `off` (default) or `on`; see Live activity and Details.

`autoOpen`: `always` (default), `savvy` or `any`. With `always` the panel opens whenever a subagent starts (any type, not only savvy-flow workers) and it is closed, so closing it is never for long. `savvy` and `any` keep the old rule: once per flow. Whatever the setting, while there are subagents and no savvy-flow plan, a line above the prompt reads `Agents · 2 running` with **Show panel ›**, which opens it in one press; its ✕ hides the line until the next subagent starts. `/agents-info open` does the same from the prompt.

Install instructions are in the [repository README](../../README.md).
