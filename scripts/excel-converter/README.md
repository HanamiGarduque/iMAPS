# IMAPS Excel converter (Windows)

Makes permit PDFs with real Microsoft Excel so they match the template exactly.
Railway cannot run Excel, so the app sends the filled workbook here and receives the PDF.

## One-time setup (on Windows)
1. Desktop Microsoft Excel installed (not the Store/web version) and opened once so it is activated.
2. PHP on PATH (`php -v` works).
3. Create `converter.key` next to `start.bat` with a long random secret on one line.
4. Install Cloudflare Tunnel: `winget install Cloudflare.cloudflared`.

## Every time
1. Boot Windows, double-click `start.bat`.
2. In another terminal: `cloudflared tunnel --url http://127.0.0.1:8787`
   It prints a `https://xxxx.trycloudflare.com` address (it changes each run).
3. On Railway set variables: `PERMIT_REMOTE_URL=https://xxxx.trycloudflare.com`
   and `PERMIT_REMOTE_KEY=<contents of converter.key>`, then redeploy/restart.

If the laptop is off, asleep or not in Windows, the app automatically falls back to
LibreOffice / dompdf, so permits still generate (at lower fidelity).

For a permanent URL use a named Cloudflare tunnel (free account + your own domain) or Tailscale Funnel.
