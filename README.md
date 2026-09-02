# Redline

**An agent bulk-edits your data. Nothing commits until you approve the redline.**

Built for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

Redline is a spreadsheet that exposes its editing capability to AI agents through
[WebMCP](https://github.com/webmachinelearning/webmcp). An agent can rewrite hundreds of
cells from a single sentence — but every write it makes lands as a *staged* change. The
committed data is untouched until a human reads the diff and approves it.

There is no tool that commits. The commit control exists only in the page's own UI, so the
agent has no callable path to it. That is the whole idea: give an agent real bulk power
over your data, and keep the irreversible step in human hands.

## Why this needs WebMCP

Editing 200 rows by simulated clicks is slow, brittle, and unreviewable. A WebMCP tool
does it in one call with a typed schema — and because the tool runs inside the page, it
can put those changes into a review queue the user is already looking at, instead of
silently mutating a database through a backend API.

## How WebMCP is used

Tools are registered against `document.modelContext`:

```js
document.modelContext.registerTool({
  name: "stage_edit",
  description: "Stage a value change across rows matching a filter. Does not commit.",
  inputSchema: { /* ... */ },
  execute: async (input) => { /* ... */ }
});
```

In this codebase that call is wrapped by the `useWebMCPTool` hook in
[`web/lib/webmcp.ts`](web/lib/webmcp.ts), which ties each registration to a component's
lifetime with an `AbortSignal` so tools cannot outlive the UI that backs them.

Tools are split by annotation: reads carry `readOnlyHint`, and any tool echoing spreadsheet
contents carries `untrustedContentHint`, since uploaded CSV data is untrusted input.

## Requirements

- Node.js 20+
- Google Chrome 149+ (or ChatGPT's in-app browser)

## Run locally

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000.

## Enable WebMCP in Chrome

1. Go to `chrome://flags/#enable-webmcp-testing`
2. Set it to **Enabled**
3. Relaunch Chrome
4. Load the app and check the "WebMCP status" panel

WebMCP is a `SecureContext` API: it is available on `https://` and on `localhost`, but not
over plain `http://` to a remote host.

## Project layout

```
web/     Next.js app — UI, spreadsheet state, WebMCP tool registrations
api/     FastAPI service — CSV parsing, column transforms, validation, export
```

## License

[MIT](LICENSE)
