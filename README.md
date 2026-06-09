# codex-cursor-proxy-local

Local Node.js project for running a Cursor-compatible proxy against the ChatGPT Codex backend used by the Codex CLI.

This is a maintained local version of `codex-cursor-proxy` with the fixes we tested:

- one-command startup with `cloudflared` quick tunnel
- persistent proxy API key
- Cursor `input` / `messages` compatibility
- Responses streaming to Chat Completions SSE translation
- `custom_tool_call` support for Cursor file-edit tools such as `ApplyPatch`
- long streaming timeout for slow reasoning pauses
- opt-in debug logging

## Requirements

- Node.js 18.17 or newer
- `cloudflared` on `PATH`
- Codex CLI already authenticated, with `~/.codex/auth.json` present

On macOS, install Cloudflare Tunnel with:

```bash
brew install cloudflared
```

## Install

```bash
npm install
npm run build
```

For a local global command:

```bash
npm link
```

This exposes:

```bash
codex-cursor-proxy
```

## Usage

```bash
codex-cursor-proxy
```

The command starts the local server, starts a Cloudflare quick tunnel, and prints Cursor settings:

```text
OpenAI Base URL for Cursor: https://xxxx.trycloudflare.com
API Key: ccp_...
```

Use those values in Cursor:

```text
Base URL: https://xxxx.trycloudflare.com
API Key: ccp_...
Model: gpt-5.5
```

Quick tunnel hostnames change when the process restarts.

## Debugging

Tool-level logs:

```bash
CCP_DEBUG=tools codex-cursor-proxy
```

Short raw previews of tool inputs and outputs:

```bash
CCP_DEBUG=raw codex-cursor-proxy
```

`raw` mode can include file paths and patch snippets. Use it only temporarily.

## Environment

- `CCP_PORT`: local port, default `3000`
- `CCP_DEBUG`: `tools`, `raw`, `all`, `1`, or `true`
- `CCP_AUTH_PATH`: override Codex auth file path
- `CCP_CONFIG_DIR`: override proxy config directory
- `CCP_API_URL`: override Codex backend URL
- `CCP_MAX_BODY_BYTES`: request body limit, default `52428800`

## Security Notes

The quick tunnel URL is public. This proxy validates the Cursor API key against a generated `ccp_...` token stored in:

```text
~/.codex/cursor-proxy/config.json
```

Do not share the tunnel URL or API key. Stop the process when you are done.
