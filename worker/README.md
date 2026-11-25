# Börsenampel Worker (`boersenampelproxyy`)

Cloudflare Worker, der die Daten für die Börsenampel-Progressive-Web-App aggregiert.
Deploy auf den **bestehenden** Worker-Namen – die URL
`https://boersenampelproxyy.tobseil87.workers.dev/` bleibt gleich, das Frontend
(`WORKER_URL` in `index.html`) muss nicht geändert werden.

## Datenquellen

| Feld im Payload | Quelle | Key nötig |
| --- | --- | --- |
| `sp500` (SPY ETF) | Twelve Data Quote API | ja (`TWELVE_DATA_API_KEY`) |
| `vix` (^VIX) | CBOE CDN (`cdn.cboe.com/.../_VIX.json`), Fallback: Twelve Data `VIXY` | nein (Fallback: ja) |
| `fearGreed` | CNN (`production.dataviz.cnn.io`), Fallback: `api.alternative.me/fng` | nein |

Jede Quelle läuft in eigener Fehlerbehandlung: Blockiert eine Quelle (z. B. CNN
liefert HTML statt JSON an Cloudflare-IPs), liefern die anderen Felder trotzdem.

## Payload (vom Frontend erwartet)

```json
{
  "fetchedAt": "2026-11-25T18:00:00.000Z",
  "sp500": { "price": 0, "change": 0, "changePercent": 0, "prevClose": 0, "currency": "USD", "symbol": "SPY", "source": "twelvedata" },
  "vix": { "price": 0, "change": 0, "changePercent": 0, "prevClose": 0, "currency": "USD", "symbol": "^VIX (CBOE Official)", "source": "cboe" },
  "fearGreed": { "score": 0, "rating": "Fear", "timestamp": "...", "source": "cnn" },
  "errors": { "vix": "..." }
}
```

`errors` ist nur vorhanden, wenn mindestens eine Quelle fehlgeschlagen ist.

## Deploy

```bash
cd worker
npx wrangler login
npx wrangler secret put TWELVE_DATA_API_KEY   # einmalig, Key aus dem Twelve-Data-Dashboard
npx wrangler deploy                            # aktualisiert boersenampelproxyy
```

Danach Smoke-Test:

```bash
curl -s "https://boersenampelproxyy.tobseil87.workers.dev/?cachebuster=$(date +%s)" | jq .
```
