# Vis

A browser-based UI for OpenCode V2, with floating tool windows, session management, code and diff viewers, and an embedded terminal. Connects directly to your OpenCode service.

![Demo](docs/demo.gif)

## How to Use

Open **<https://xenodrive.github.io/vis/>**, then configure and start your OpenCode service:

```bash
opencode2 service set cors https://xenodrive.github.io
opencode2 pair
```

Enter the URL and password shown by `pair` in vis.

For self-hosting, serve `dist/` with a static HTTP server and use your vis origin in the CORS command above.

## License

MIT
