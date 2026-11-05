# NFR measurements (Table 4-17)

## 1. Sign in once (only when `.session.json` is missing or expired)

In a separate terminal, start Chrome yourself (not through Playwright, so Cloudflare accepts it):

    ~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
      --remote-debugging-port=9222 --user-data-dir=/tmp/imaps-chrome \
      https://imaps-mpdorosario.com/login

Sign in there, completing the Cloudflare check. Leave that window open.

## 2. Run the timings

    TRIALS=5 node --env-file=.env.nfr measure.mjs

The first run copies the session from that Chrome into `.session.json`, then runs the trials.
Add `SKIP_FORECAST=1` to skip the forecast, `HEADLESS=0` to watch.

## 3. Availability during UAT

    node uptime.mjs           # leave running for the whole UAT
    node uptime.mjs --report  # availability %

Delete `.session.json` and `.env.nfr` when finished.
