// PhishFox — popup.js (demo-ready)
"use strict";

const BACKEND       = "http://localhost:8000";
const BLOCK_SCORE   = 80;
const WARN_SCORE    = 40;
const FETCH_TIMEOUT = 6000;
const ARC_CIRCUM    = 188.5; // 2π × r(30)

// ── DOM refs ──────────────────────────────────────────────────────────────────
const foxRing     = document.getElementById("foxRing");
const foxCircle   = document.getElementById("foxCircle");
const tabUrlEl    = document.getElementById("tabUrl");
const statusPill  = document.getElementById("statusPill");
const statusLabel = document.getElementById("statusLabel");
const offlineBanner = document.getElementById("offlineBanner");
const emptyState  = document.getElementById("emptyState");
const resultsArea = document.getElementById("resultsArea");
const arcFill     = document.getElementById("arcFill");
const arcNum      = document.getElementById("arcNum");
const verdictBig  = document.getElementById("verdictBig");
const verdictSub  = document.getElementById("verdictSub");
const reasonsCard = document.getElementById("reasonsCard");
const reasonsList = document.getElementById("reasonsList");
const urlCard     = document.getElementById("urlCard");
const urlVal      = document.getElementById("urlVal");
const sourceTag   = document.getElementById("sourceTag");
const tsLabel     = document.getElementById("tsLabel");
const analyzeBtn  = document.getElementById("analyzeBtn");
const clearBtn    = document.getElementById("clearBtn");

let currentTabUrl = null;

// ── Status config ─────────────────────────────────────────────────────────────
const STATES = {
  safe: {
    pill: "safe",  label: "Safe",
    arcColor: "#22c55e",
    verdictColor: "#22c55e",
    sub: "This page appears safe to browse",
    foxClass: "safe", ringClass: "safe",
  },
  suspicious: {
    pill: "warn",  label: "Suspicious",
    arcColor: "#f59e0b",
    verdictColor: "#f59e0b",
    sub: "Proceed with caution",
    foxClass: "warn", ringClass: "warn",
  },
  phishing: {
    pill: "danger", label: "Phishing",
    arcColor: "#ef4444",
    verdictColor: "#ef4444",
    sub: "High phishing risk detected!",
    foxClass: "danger", ringClass: "danger",
  },
  unknown: {
    pill: "unknown", label: "Unknown",
    arcColor: "#3d4459",
    verdictColor: "#7c859c",
    sub: "No analysis available yet",
    foxClass: "", ringClass: "",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusFromScore(score) {
  if (typeof score !== "number" || isNaN(score)) return "unknown";
  if (score >= BLOCK_SCORE) return "phishing";
  if (score >= WARN_SCORE)  return "suspicious";
  return "safe";
}

function pickLatest(data) {
  const candidates = [
    data.blockedAnalysis && { ...data.blockedAnalysis, _source: "blocked"  },
    data.lastUrlAnalysis && { ...data.lastUrlAnalysis, _source: "url-scan" },
    data.lastDomAnalysis && { ...data.lastDomAnalysis, _source: "dom-scan" },
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.analyzedAt || 0) - (a.analyzedAt || 0));
  return candidates[0];
}

function hide(el) { el.classList.add("hidden"); }
function show(el) { el.classList.remove("hidden"); }

function formatTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString() : "";
}

// Animated counter for the arc number
function animateCount(target, duration = 800) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    arcNum.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Render ────────────────────────────────────────────────────────────────────
function applyState(status, score, verdict, url, reasons, source, ts, offline) {
  const s = STATES[status] || STATES.unknown;

  // Pill
  statusPill.className = `pill ${s.pill}`;
  statusLabel.textContent = s.label;

  // Mascot
  foxCircle.className = `fox-circle ${s.foxClass}`;
  foxRing.className   = `fox-ring ${s.ringClass}`;

  // Arc
  const offset = ARC_CIRCUM - (ARC_CIRCUM * Math.min(score, 100)) / 100;
  arcFill.style.stroke = s.arcColor;
  // Reset first, then animate via double rAF
  arcFill.style.strokeDashoffset = ARC_CIRCUM;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arcFill.style.transition = "stroke-dashoffset .9s cubic-bezier(.4,0,.2,1), stroke .4s";
    arcFill.style.strokeDashoffset = offset;
  }));
  animateCount(score);

  // Verdict
  verdictBig.textContent = verdict || s.label;
  verdictBig.style.color = s.verdictColor;
  verdictSub.textContent = s.sub;

  // Reasons
  if (reasons && reasons.length > 0) {
    show(reasonsCard);
    reasonsList.innerHTML = "";
    reasons.forEach(r => {
      const li = document.createElement("li");
      li.textContent = String(r);
      reasonsList.appendChild(li);
    });
  } else {
    hide(reasonsCard);
  }

  // URL
  if (url) {
    show(urlCard);
    const MAX = 50;
    urlVal.textContent = url.length > MAX ? url.slice(0, MAX) + "…" : url;
    urlVal.title = url;
  } else {
    hide(urlCard);
  }

  // Source + timestamp
  const sourceMap = { blocked: "🚫 Blocked", "url-scan": "🔗 URL scan", "dom-scan": "📄 DOM scan" };
  sourceTag.textContent = sourceMap[source] || "";
  tsLabel.textContent   = ts ? `at ${formatTime(ts)}` : "";

  // Offline
  offline ? show(offlineBanner) : hide(offlineBanner);
}

function renderResult(result) {
  if (!result) {
    show(emptyState);
    hide(resultsArea);
    hide(offlineBanner);
    statusPill.className = "pill unknown";
    statusLabel.textContent = "Unknown";
    foxCircle.className = "fox-circle";
    foxRing.className = "fox-ring";
    return;
  }

  hide(emptyState);
  resultsArea.classList.remove("hidden");
  resultsArea.style.display = "flex";

  const score  = typeof result.risk_score === "number" ? result.risk_score : 0;
  const status = statusFromScore(score);

  applyState(
    status,
    score,
    result.verdict || status,
    result.url,
    result.reasons,
    result._source,
    result.analyzedAt,
    result.backendOnline === false,
  );

  analyzeBtn.disabled = false;
}

// ── Storage ───────────────────────────────────────────────────────────────────
function loadStoredResult() {
  chrome.storage.local.get(
    ["lastUrlAnalysis", "lastDomAnalysis", "blockedAnalysis"],
    (data) => {
      if (chrome.runtime.lastError) { renderResult(null); return; }
      renderResult(pickLatest(data));
    }
  );
}

// ── Analyze button ────────────────────────────────────────────────────────────
async function analyzeCurrentPage() {
  if (!currentTabUrl) return;
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<div class="spinner"></div> Analyzing…';

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${BACKEND}/analyze-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentTabUrl }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data  = await res.json();
    const entry = {
      url: currentTabUrl,
      risk_score: data.risk_score,
      verdict:    data.verdict,
      reasons:    data.reasons || [],
      analyzedAt: Date.now(),
      backendOnline: true,
    };
    chrome.storage.local.set({ lastUrlAnalysis: entry }, loadStoredResult);
  } catch {
    const entry = {
      url: currentTabUrl,
      risk_score: 0,
      verdict: "Backend Offline",
      reasons: ["Could not reach backend at localhost:8000"],
      analyzedAt: Date.now(),
      backendOnline: false,
    };
    chrome.storage.local.set({ lastUrlAnalysis: entry }, loadStoredResult);
  } finally {
    clearTimeout(timer);
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = "🔍 Analyze current page";
  }
}

// ── Clear ─────────────────────────────────────────────────────────────────────
function clearResult() {
  chrome.storage.local.remove(
    ["lastUrlAnalysis", "lastDomAnalysis", "blockedAnalysis"],
    () => renderResult(null)
  );
}

// ── Events ────────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", analyzeCurrentPage);
clearBtn.addEventListener("click", clearResult);

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs?.[0];
  if (tab?.url) {
    currentTabUrl = tab.url;
    const MAX = 46;
    tabUrlEl.textContent = currentTabUrl.length > MAX
      ? currentTabUrl.slice(0, MAX) + "…"
      : currentTabUrl;
    tabUrlEl.title = currentTabUrl;
  } else {
    tabUrlEl.textContent = "No active tab";
    analyzeBtn.disabled  = true;
  }
  loadStoredResult();
});
