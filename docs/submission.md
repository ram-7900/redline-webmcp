# Devpost submission copy

Paste-ready text for the WebMCP Challenge submission form.

---

## Elevator pitch (200 char limit)

An agent bulk-edits your spreadsheet through WebMCP. Every change lands staged, never
committed. You read the redline and decide. No tool can press Commit.

---

## About the project

### Inspiration

Letting an AI agent touch a spreadsheet is a bad trade today. Either you do the tedious
work yourself — normalising four hundred phone numbers by hand — or you hand an agent
write access and hope. The reason it feels dangerous is not that agents are bad at bulk
edits. They are very good at them. It is that a bulk edit is unreviewable after the fact.
Once four hundred cells have changed, "check its work" is not a real instruction.

Redline removes the trade. The agent gets full bulk power over the data. It just never
gets to commit.

### What people and agents can do together that was hard before

Ask for something broad in one sentence — *"title-case the names, put the phones in
E.164, lowercase the emails"* — and watch 167 cells turn amber at once, each showing what
it replaces. Then reject one whole group because you disagreed with it, keep the other
two, and commit. The agent's next read reports the reverted values, so it stays in step
with what you actually accepted.

Neither half of that was previously available. Driving a spreadsheet by simulated clicks
is too slow and too brittle for hundreds of cells. A backend integration is fast but
invisible: it writes to a database and hands you a summary you cannot audit. What was
missing is bulk speed *with* a reviewable diff, and that only works if the tools run
inside the page the human is already looking at.

### Why this is a strong fit for WebMCP

WebMCP tools execute in the page, which is what makes the review layer possible at all.
A staged change has to live somewhere the user can see it, and that place is the UI they
already have open. A backend MCP server could apply the same transforms, but it would
have no way to put 167 proposals in front of a person and wait — it is on the other side
of the network from the interface.

The spec's own goals name this: *"Enable human-in-the-loop workflows"* and *"Prevent web
content disintermediation."* Redline is a direct reading of both. It also field-tests the
open question in webmcp issue #222 on bulk tool execution: one `stage_transform` call
does what would otherwise be hundreds of round trips.

### How it creates a better user experience

- **One sentence replaces an afternoon.** Three tool calls normalised names, phone numbers
  and emails across 60 rows.
- **The diff is the interface.** Every staged cell shows the old value struck through
  above the new one. You approve a change you can actually see.
- **Rejection is cheap and granular.** Reject one cell, one group, or everything, before
  anything is written.
- **Failures are visible, not silent.** Values that could not be converted are reported
  with a reason and left alone, so a row the agent skipped is not mistaken for a row it
  handled.
- **Nothing is exported behind your back.** `export_csv` refuses while changes are staged.

### How WebMCP is implemented

Eight tools registered on `document.modelContext`:

| Tool | Kind | Purpose |
| --- | --- | --- |
| `get_sheet_summary` | read | Columns, row count, per-column empties, sample rows |
| `query_rows` | read | Find rows by condition, capped at 50 with a true total |
| `stage_edit` | stage | Stage one value across named rows, or all rows |
| `stage_transform` | stage | Stage a normalisation across a column |
| `list_staged_changes` | read | What is queued, grouped by the call that proposed it |
| `discard_staged` | stage | Withdraw the agent's own proposals |
| `request_commit` | refuses | Hands the decision to the human. Always declines |
| `export_csv` | guarded | Exports committed values only; refuses while staged |

Implementation notes:

- **The commit path is not a tool.** `commitPending` is called only by the page's Commit
  button. There is no callable route to committed data, so the guarantee is structural
  rather than a description an agent is asked to respect.
- **Registration is tied to component lifetime** through the `AbortSignal` on
  `registerTool`. Without that abort a tool outlives the UI backing it, and since the spec
  rejects duplicate names, the next mount would fail.
- **Annotations are real, not decorative.** The three read tools carry `readOnlyHint`, and
  every tool echoing uploaded cell values carries `untrustedContentHint` — uploaded CSV is
  untrusted input, and its contents reach the agent's context.
- **Character budgets are enforced by tests.** Chrome truncates over-budget descriptions
  silently, and the tail of these descriptions is exactly where the "this never commits"
  caveats live. Tool contracts live as plain data so the 30/500/150 limits are asserted
  against real values.
- **Refusals use a stable prefix.** The spec has no structured way to distinguish a
  deliberate refusal from a success or a schema error (webmcp issue #282), so refusals are
  success-shaped results prefixed `REFUSED:`, which the activity log renders in its own
  tone.

### How it was built

Next.js and React for the page, FastAPI for the transforms. Python carries the
normalisation because correct phone and date parsing are library problems — `phonenumbers`
and `dateutil` rather than regexes that quietly mangle edge cases. The service is stateless
and never learns what was committed; staging and commit stay in the browser, next to the
person approving them.

The staging model is pure functions over immutable state, so its rules are tested without a
browser: re-staging a cell supersedes the earlier proposal, no-op edits are skipped rather
than staged, and a rejection is immediately visible to the agent's next read.

### Challenges

**The spec does not have `requestUserInteraction()`.** Chrome's security guidance describes
it, but it is not in the IDL — it is still open in issues #165 and #204. The design had
leaned on it for the commit confirmation. Removing it made the product stronger: the commit
control lives in the page and no tool can reach it, which is a firmer guarantee than an API
that asks an agent to pause.

**No structured refusal outcome.** `execute()` returns the same shape whether a tool
succeeded or deliberately declined. Two of Redline's tools refuse on purpose, and telling
those apart from failures meant inventing a text convention — the friction described in
issue #282.

**Ghost tools.** Registration must be tied to component lifetime or tools outlive their UI,
and because the spec rejects duplicate names, the failure surfaces later as a confusing
registration error rather than at the point of the mistake.

### What's next

Extracting the staging layer as a reusable package, and filing an implementation report
with these findings back to the WebMCP spec repository.

---

## Built with

next.js, react, typescript, tailwindcss, fastapi, python, webmcp, phonenumbers, dateutil,
vercel

---

## Try it out links

- Live app: TBD
- Source: https://github.com/ram-7900/redline-webmcp
