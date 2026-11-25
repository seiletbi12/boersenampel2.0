const CBOE_VIX_URL = "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_VIX.json";
const TWELVE_DATA_QUOTE_URL = "https://api.twelvedata.com/quote";
const CNN_FNG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/api.json";
const ALTERNATIVE_ME_FNG_URL = "https://api.alternative.me/fng/?limit=1";
const UPSTREAM_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(n) {
  return Number.isFinite(n) ? round2(n) : null;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTwelveDataQuote(env, symbol) {
  const key = env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("TWELVE_DATA_API_KEY fehlt (wrangler secret put TWELVE_DATA_API_KEY)");
  const url = `${TWELVE_DATA_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} (${symbol})`);
  const j = await res.json();
  if (j.status === "error" || j.close === undefined || j.close === null) {
    throw new Error(j.message || `Twelve Data: keine Daten fuer ${symbol}`);
  }
  const price = parseFloat(j.close);
  if (!Number.isFinite(price)) throw new Error(`Twelve Data: ungueltiger Kurs fuer ${symbol}`);
  return {
    price: round2(price),
    change: j.change !== undefined ? num(parseFloat(j.change)) : null,
    changePercent: j.percent_change !== undefined ? num(parseFloat(j.percent_change)) : null,
    prevClose: j.previous_close !== undefined ? num(parseFloat(j.previous_close)) : null,
    currency: "USD",
    symbol: j.symbol || symbol,
    source: "twelvedata",
  };
}

async function fetchVixFromCboe() {
  const res = await fetchWithTimeout(CBOE_VIX_URL, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CBOE HTTP ${res.status}`);
  const j = await res.json();
  const history = Array.isArray(j?.data) ? j.data : [];
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const price = latest ? parseFloat(latest.close) : NaN;
  const prevClose = previous ? parseFloat(previous.close) : NaN;
  if (!Number.isFinite(price)) throw new Error("CBOE: kein gueltiger VIX-Schlusskurs");
  let change = null;
  let changePercent = null;
  if (Number.isFinite(prevClose) && prevClose !== 0) {
    change = round2(price - prevClose);
    changePercent = round2(((price - prevClose) / prevClose) * 100);
  }
  return {
    price: round2(price),
    prevClose: Number.isFinite(prevClose) ? round2(prevClose) : null,
    change,
    changePercent,
    currency: "USD",
    symbol: "^VIX (CBOE Official)",
    source: "cboe",
  };
}

async function fetchVix(env) {
  try {
    return await fetchVixFromCboe();
  } catch (cboeError) {
    if (!env.TWELVE_DATA_API_KEY) throw cboeError;
    const fallback = await fetchTwelveDataQuote(env, "VIXY");
    return { ...fallback, symbol: "VIXY ETF", source: "twelvedata-fallback" };
  }
}

async function fetchFearGreed() {
  try {
    const res = await fetchWithTimeout(CNN_FNG_URL, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (res.ok) {
      const j = await res.json();
      const fng = j?.fear_and_greed;
      if (fng && fng.score !== undefined && fng.score !== null) {
        return {
          score: Number(fng.score),
          rating: fng.rating || null,
          timestamp: fng.timestamp || null,
          source: "cnn",
        };
      }
    }
  } catch {
  }
  const res = await fetchWithTimeout(ALTERNATIVE_ME_FNG_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`alternative.me HTTP ${res.status}`);
  const j = await res.json();
  const entry = j?.data?.[0];
  if (!entry || entry.value === undefined) throw new Error("alternative.me: keine Fear-&-Greed-Daten");
  const ts = Number(entry.timestamp);
  return {
    score: Number(entry.value),
    rating: entry.value_classification || null,
    timestamp: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
    source: "alternative.me",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const errors = {};
    const [sp500, vix, fearGreed] = await Promise.all([
      fetchTwelveDataQuote(env, "SPY").catch((e) => {
        errors.sp500 = String(e?.message || e);
        return null;
      }),
      fetchVix(env).catch((e) => {
        errors.vix = String(e?.message || e);
        return null;
      }),
      fetchFearGreed().catch((e) => {
        errors.fearGreed = String(e?.message || e);
        return null;
      }),
    ]);

    const payload = {
      fetchedAt: new Date().toISOString(),
      sp500,
      vix,
      fearGreed,
    };
    if (Object.keys(errors).length > 0) payload.errors = errors;
    return jsonResponse(payload);
  },
};
