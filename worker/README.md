# Börsenampel Worker (`boersenampelproxyy2`)

Cloudflare Worker, der die Daten für die Börsenampel-Progressive-Web-App aggregiert.
Dies ist ein **neuer, eigener Worker** – der alte Worker `boersenampelproxyy`
bleibt unberührt, die bestehende Ampel läuft damit weiter. Neue URL:
`https://boersenampelproxyy2.tobseil87.workers.dev/`
(Frontend: `WORKER_URL` in `boersenampel-main/index.html` zeigt auf die neue URL.)

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

## Deploy (neuen Worker anlegen)

```bash
cd worker
npx wrangler login
npx wrangler secret put TWELVE_DATA_API_KEY   # einmalig, Key aus dem Twelve-Data-Dashboard
npx wrangler deploy                            # legt boersenampelproxyy2 neu an
```

Danach Smoke-Test (neue Worker-URL):

```
https://boersenampelproxyy2.tobseil87.workers.dev/?cachebuster=123
```

## Rollback

Alten Worker `boersenampelproxyy` einfach weiterlaufen lassen bzw. im Frontend
`WORKER_URL` wieder auf die alte URL setzen – der alte Code ist im
Cloudflare-Dashboard weiterhin hinterlegt.
