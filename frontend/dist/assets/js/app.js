import './index.css';


/* ═══════════════════════════════════════════════════════════════
   VORTEX — app.js  v6
   ═══════════════════════════════════════════════════════════════ */

const API_URL = "https://btc-xgboost-live-predictor.onrender.com/api/v1/predict/BTCUSDT";
const REFRESH_INTERVAL = 30_000;
const MAX_HISTORY = 120;       // keep up to 2h of 1-min signals
const CHART_MIN_PTS = 5;
const CHART_MAX_PTS = 30;        // default visible points

const SB_URL = "https://flciknvsfotilapaiaei.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsY2lrbnZzZm90aWxhcGFpYWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MTExNDgsImV4cCI6MjA4OTE4NzE0OH0.4y-9c6_NKxONyOynvOPIn3FxBjyz50qAzsE2Sl2gOe4";
const SB_TABLE = "btc_predictions";

const state = {
  history: [],     // full session history, newest first
  fetchCount: 0,
  firstLoad: true,
  timer: null,
  chartWindow: 0,      // 0 = session, else minutes
};

/* ═══════════════ SUPABASE ═══════════════ */
async function loadFromSupabase() {
  try {
    const url = `${SB_URL}/rest/v1/${SB_TABLE}`
      + `?select=id,created_at,symbol,prediction,probability,price_at_prediction`
      + `&order=created_at.desc&limit=${MAX_HISTORY}`;

    const res = await fetch(url, {
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;
    state.history = rows.map(parseSupabaseRow);
    if (state.history.length && state.firstLoad) {
      ui.updateHero(state.history[0]);
      ui.updateTable();
      chart.draw();
    }
  } catch (e) {
    console.warn("Supabase load failed:", e.message);
  }
}

/* ═══════════════ FETCH LIVE ═══════════════ */
async function fetchPrediction() {
  ui.hideError();
  ui.setLoading(true);
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(API_URL, { method: "GET", headers: { Accept: "application/json" }, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
    const data = await res.json();
    if (!data.prediction) throw new Error('Campo "prediction" ausente.');
    if (!data.current_price) throw new Error('Campo "current_price" ausente.');

    const entry = parseAPIResponse(data);
    state.fetchCount++;

    // dedupe
    const last = state.history[0];
    const dupe = last && last.price === entry.price && last.label === entry.label && last.conf === entry.conf;
    if (!dupe) {
      state.history.unshift(entry);
      if (state.history.length > MAX_HISTORY) state.history.pop();
    }

    ui.updateHero(entry);
    ui.updateTable();
    chart.draw();
    if (state.firstLoad) { ui.reveal(); state.firstLoad = false; }

  } catch (err) {
    let msg = err.message;
    if (err.name === "AbortError") msg = "Timeout (15s) — Render puede estar dormido. Espera unos segundos e intenta de nuevo.";
    if (msg.includes("Failed to fetch")) msg = "Error de red o CORS. Verifica CORSMiddleware en tu FastAPI main.py.";
    ui.showError(msg);
    if (state.firstLoad) { ui.reveal(); ui.errorState(); state.firstLoad = false; }
  } finally {
    ui.setLoading(false);
    ui.updateClock();
  }
}

/* ═══════════════ PARSERS ═══════════════ */
function parseSupabaseRow(row) {
  return buildEntry(
    String(row.prediction ?? "").trim().toUpperCase(),
    parseFloat(row.price_at_prediction ?? 0),
    parseFloat(row.probability ?? 0.5),
    row.symbol ?? "BTCUSDT",
    row.created_at ? new Date(row.created_at) : new Date()
  );
}
function parseAPIResponse(data) {
  return buildEntry(
    String(data.prediction ?? "").trim().toUpperCase(),
    parseFloat(data.current_price ?? 0),
    parseFloat(data.probability ?? 0.5),
    data.symbol ?? "BTCUSDT",
    new Date()
  );
}
function buildEntry(raw, price, confRaw, symbol, ts) {
  const isBuy = raw === "BUY" || raw === "1" || raw === "UP";
  const isSell = raw === "SELL" || raw === "0" || raw === "DOWN";
  const isHold = !isBuy && !isSell;
  const conf = clamp(confRaw, 0, 1);
  return {
    isBuy, isSell, isHold, price, conf, symbol: symbol.toUpperCase(),
    cssColor: isBuy ? "var(--buy)" : isSell ? "var(--sell)" : "var(--hold)",
    hexColor: isBuy ? "#00d97e" : isSell ? "#ff4d6d" : "#ffb703",
    colorKey: isBuy ? "buy" : isSell ? "sell" : "hold",
    arrow: isBuy ? "↑" : isSell ? "↓" : "→",
    label: isBuy ? "BUY" : isSell ? "SELL" : "HOLD",
    tier: getTier(conf), ts,
  };
}

/* ═══════════════ UI ═══════════════ */
const ui = {

  updateHero(d) {
    $("hero-price").textContent = fmtPrice(d.price);
    $("hero-symbol").textContent = d.symbol;
    $("hero-ts").textContent = fmtTs(d.ts);
    $("hero-count").textContent = state.history.length + " señal" + (state.history.length !== 1 ? "es" : "");

    /* ── Signal: ONE instance, size/opacity tied to confidence ── */
    const strong = d.conf >= 0.60;
    const signal = $("hero-signal");
    const arrow = $("hero-arrow");
    const warning = $("conf-warning");

    signal.textContent = d.label;
    arrow.textContent = d.arrow;
    signal.style.color = d.cssColor;
    arrow.style.color = d.cssColor;
    signal.style.fontSize = strong ? "clamp(2.4rem,5.5vw,3.2rem)" : "clamp(1.6rem,3.5vw,2.2rem)";
    signal.style.opacity = strong ? "1" : "0.90";
    signal.style.filter = strong ? "none" : "saturate(0.2)";
    arrow.style.opacity = strong ? "1" : "0.90";
    arrow.style.fontSize = strong ? "1.5rem" : "1rem";
    warning.style.display = strong ? "none" : "block";

    /* ── Hero card: animated pulsing border based on confidence ── */
    const card = $("hero-card");
    card.classList.remove("hero-pulse-low", "hero-pulse-mid", "hero-pulse-high");
    if (d.conf < 0.55) card.classList.add("hero-pulse-low");
    else if (d.conf < 0.70) card.classList.add("hero-pulse-mid");
    else card.classList.add("hero-pulse-high");

    /* ── Confidence bar: 14px, colored, glowing ── */
    const cClass = d.conf >= .70 ? "conf-high" : d.conf >= .55 ? "conf-mid" : "conf-low";
    const bar = $("hero-conf-bar");
    bar.style.width = (d.conf * 100) + "%";
    bar.className = "vx-conf-fill " + cClass;


    const pctEl = $("hero-conf-pct");
    pctEl.textContent = fmtConf(d.conf);
    pctEl.style.color = confColor(d.conf);

    const tier = $("hero-tier");
    tier.textContent = d.tier.label;
    tier.className = "vx-tier " + d.tier.cls;
  },

  updateTable() {
    const h = state.history;
    const tbody = $("data-hist");
    const empty = $("hist-empty");
    $("hist-badge").textContent = h.length + " señal" + (h.length !== 1 ? "es" : "");
    if (!h.length) { empty.style.display = "block"; tbody.innerHTML = ""; return; }
    empty.style.display = "none";

    tbody.innerHTML = h.map((e, i) => {
      const prev = h[i + 1];
      let deltaEl = `<span class="vx-td-dim">—</span>`;
      if (prev) {
        const diff = e.price - prev.price;
        const pct = ((diff / prev.price) * 100).toFixed(2);
        const sign = diff >= 0 ? "+" : "";
        const col = diff > 0 ? "var(--buy)" : diff < 0 ? "var(--sell)" : "var(--dim)";
        deltaEl = `<span style="font-size:11px;font-weight:600;color:${col};">${sign}${pct}%</span>`;
      }
      return `
        <tr class="vx-tr${i === 0 ? " is-latest" : ""}">
          <td class="vx-td"><span class="vx-td-dim">${fmtTs(e.ts)}</span></td>
          <td class="vx-td"><span class="vx-pill-${e.colorKey}">${e.arrow} ${e.label}</span></td>
          <td class="vx-td-r"><span class="vx-td-num">${fmtPrice(e.price)}</span></td>
          <td class="vx-td-r"><span style="font-size:12px;font-weight:600;color:${confColor(e.conf)};">${fmtConf(e.conf)}</span></td>
          <td class="vx-td-r">${deltaEl}</td>
        </tr>`;
    }).join("");
  },

  updateClock() {
    $("last-updated").textContent = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },

  reveal() {
    $("sk-hero").style.display = "none";
    $("data-hero").style.display = "block";
    const skh = $("sk-hist"); if (skh) skh.remove();
  },

  errorState() {
    $("hero-price").textContent = "$—";
    $("hero-signal").textContent = "—";
    $("hero-arrow").textContent = "—";
    $("hero-ts").textContent = "Sin datos";
    $("hist-empty").style.display = "block";
  },

  showError(msg) { $("error-msg").textContent = msg; $("error-banner").style.display = "block"; },
  hideError() { $("error-banner").style.display = "none"; },
  setLoading(on) {
    const b = $("refresh-btn"); b.disabled = on;
    on ? b.classList.add("loading") : b.classList.remove("loading");
  },
};

/* ═══════════════ CHART ═══════════════ */
const chart = {

  /* Filter history by active time window */
  getVisiblePoints() {
    const all = state.history;
    if (!all.length) return [];

    let pts;
    if (state.chartWindow === 0) {
      // "sesión" — cap at CHART_MAX_PTS newest
      pts = all.slice(0, CHART_MAX_PTS);
    } else {
      // time window in minutes
      const cutoff = new Date(Date.now() - state.chartWindow * 60_000);
      pts = all.filter(p => p.ts >= cutoff).slice(0, CHART_MAX_PTS);
    }
    return pts.reverse();  // oldest → left
  },

  setWindow(minutes) {
    state.chartWindow = minutes;
    // update button states
    document.querySelectorAll(".vx-window-btn").forEach(btn => {
      btn.classList.toggle("active", Number(btn.dataset.window) === minutes);
    });
    chart.draw();
  },

  draw() {
    const canvas = $("sparkline");
    const empty = $("spark-empty");
    const pts = chart.getVisiblePoints();

    if (pts.length < CHART_MIN_PTS) {
      canvas.style.display = "none";
      empty.style.display = "flex";
      return;
    }
    canvas.style.display = "block";
    empty.style.display = "none";

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth;
    const H = 160;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const PAD = { top: 20, right: 16, bottom: 30, left: 70 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const prices = pts.map(p => p.price);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const pad10 = (rawMax - rawMin) * 0.12 || rawMax * 0.001;
    const minP = rawMin - pad10;
    const maxP = rawMax + pad10;
    const range = maxP - minP;

    const xOf = i => PAD.left + (pts.length > 1 ? (i / (pts.length - 1)) * cW : cW / 2);
    const yOf = p => PAD.top + cH - ((p - minP) / range) * cH;

    /* Grid */
    ctx.strokeStyle = "rgba(30,41,59,.45)";
    ctx.lineWidth = 1;
    [0, 0.33, 0.67, 1].forEach(t => {
      const y = PAD.top + (1 - t) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    });

    /* Y labels */
    ctx.fillStyle = "rgba(180,196,214,.85)";
    ctx.font = `500 9px 'IBM Plex Mono'`;
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(t => {
      const val = minP + t * range;
      const y = PAD.top + (1 - t) * cH;
      const fmt = (rawMax - rawMin) < 200
        ? "$" + val.toFixed(2)
        : "$" + Math.round(val).toLocaleString("en-US");
      ctx.fillText(fmt, PAD.left - 7, y + 3);
    });

    /* Gradient fill */
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    grad.addColorStop(0, "rgba(129,140,248,.11)");
    grad.addColorStop(0.6, "rgba(129,140,248,.03)");
    grad.addColorStop(1, "rgba(129,140,248,0)");
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.price)) : ctx.lineTo(xOf(i), yOf(p.price)));
    ctx.lineTo(xOf(pts.length - 1), PAD.top + cH);
    ctx.lineTo(xOf(0), PAD.top + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* Price line */
    ctx.beginPath();
    ctx.strokeStyle = "rgba(129,140,248,.6)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(p.price)) : ctx.lineTo(xOf(i), yOf(p.price)));
    ctx.stroke();

    /* ── Signal markers: smarter rendering to avoid crowding ──
       Group consecutive same-label signals and show ONE marker per group
       with a count badge if > 1 */
    const groups = [];
    pts.forEach((p, i) => {
      const last = groups[groups.length - 1];
      if (last && last.label === p.label) {
        last.count++;
        last.endIdx = i;
        last.endPrice = p.price;
      } else {
        groups.push({
          label: p.label, colorKey: p.colorKey, hexColor: p.hexColor,
          isBuy: p.isBuy, isSell: p.isSell,
          startIdx: i, endIdx: i, count: 1,
          startPrice: p.price, endPrice: p.price
        });
      }
    });

    groups.forEach(g => {
      /* Always draw ON the line — use the last (most recent) point of the group */
      const x = xOf(g.endIdx);
      const y = yOf(g.endPrice);

      /* Outer ring */
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6,10,16,.95)";
      ctx.fill();

      /* Colored ring border */
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = g.hexColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      /* Inner dot */
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = g.hexColor;
      ctx.fill();

      /* Count badge if group has > 1 point */
      if (g.count > 1) {
        const bx = x + 8; const by = y - 8;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fillStyle = g.hexColor;
        ctx.fill();
        ctx.fillStyle = "#060a10";
        ctx.font = `700 7px 'IBM Plex Mono'`;
        ctx.textAlign = "center";
        ctx.fillText(g.count > 9 ? "9+" : g.count, bx, by + 2.5);
      }

      /* Arrow label above/below group */
      const arrow = g.isBuy ? "▲" : g.isSell ? "▼" : "●";
      const offset = g.isBuy ? -16 : 18;
      ctx.fillStyle = g.hexColor;
      ctx.font = `600 9px 'IBM Plex Mono'`;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.9;
      ctx.fillText(arrow, x, y + offset);
      ctx.globalAlpha = 1;
    });

    /* X timestamps */
    ctx.fillStyle = "rgba(148,163,184,.7)";
    ctx.font = `400 7px 'IBM Plex Mono'`;
    ctx.textAlign = "center";
    const steps = pts.length <= 6
      ? pts.map((_, i) => i)
      : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
    steps.forEach(i => {
      const t = pts[i].ts.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      ctx.fillText(t, xOf(i), H - 8);
    });
  },
};

/* ═══════════════ HELPERS ═══════════════ */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fmtPrice(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtConf(n) { return (n * 100).toFixed(1) + "%"; }
function fmtTs(d) { return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function confColor(c) { return c >= .70 ? "var(--buy)" : c >= .55 ? "var(--hold)" : "#ff8096"; }
function getTier(c) {
  if (c >= .85) return { label: "Muy alta confianza", cls: "vx-tier-hi" };
  if (c >= .70) return { label: "Alta confianza", cls: "vx-tier-hi" };
  if (c >= .55) return { label: "Confianza media", cls: "vx-tier-mid" };
  return { label: "Baja confianza", cls: "vx-tier-lo" };
}

window.addEventListener("resize", () => { if (state.history.length >= CHART_MIN_PTS) chart.draw(); });

/* ═══════════════ INIT ═══════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  await loadFromSupabase();
  if (state.history.length && state.firstLoad) { ui.reveal(); state.firstLoad = false; }
  fetchPrediction();
  state.timer = setInterval(fetchPrediction, REFRESH_INTERVAL);
});
window.vortex = { fetch: fetchPrediction };
