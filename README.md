# Vis

A browser-based UI for OpenCode V2, with floating tool windows, session management, code and diff viewers, and an embedded terminal. Connects directly to your OpenCode service.

![Demo](docs/demo.gif)

## How to Use

Open **<https://xenodrive.github.io/vis/>**, then configure and start your OpenCode service:

```bash
opencode service set cors https://xenodrive.github.io
opencode pair
```

Paste the full pairing URL shown by `pair` into vis and select **Connect**. Do not open the link first: it is single-use and expires after a short time. Vis exchanges it for a session token and saves that token for reconnection. If the link expires or was already used, run `opencode pair` again.

For self-hosting, serve `dist/` with a static HTTP server and use your vis origin in the CORS command above.

## License

MIT
