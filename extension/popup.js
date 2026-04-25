// PhishFox — popup.js (demo-ready)
"use strict";

const BACKEND       = "http://127.0.0.1:8000";
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
const elderlyToggle = document.getElementById("elderlyToggle");
const contactNameEl = document.getElementById("contactName");
const contactInfoEl = document.getElementById("contactInfo");
const contactSaveBtn = document.getElementById("contactSaveBtn");
const contactSavedTip = document.getElementById("contactSavedTip");
const shareModal   = document.getElementById("shareModal");
const shareText    = document.getElementById("shareText");
const shareCopyBtn = document.getElementById("shareCopyBtn");
const shareMailLink = document.getElementById("shareMailLink");
const shareWaLink  = document.getElementById("shareWaLink");
const shareCloseBtn = document.getElementById("shareCloseBtn");

let currentTabUrl = null;
let elderlyModeEnabled = false;
let trustedContactName = "";
let trustedContactInfo = "";

// Elderly-mode plain language translations
const ELDERLY_REASONS = {
  "Suspicious domain":          "The website address looks fake or misspelled.",
  "credential":                 "This page is asking for your password or personal info.",
  "Urgent":                     "The message is trying to scare or rush you — that's a trick.",
  "brand":                      "The sender is pretending to be a company they are not.",
  "mismatch":                   "The link goes somewhere different than it pretends.",
  "shortened URL":               "The link is hidden — it could lead anywhere.",
  "login":                      "This is asking you to log in somewhere suspicious.",
  "obfuscation":                "The link is disguised to look safe but it is not.",
  "lookalike":                  "The website name is almost correct — but it's a fake copy.",
  "impersonation":              "Someone is pretending to be a company like PayPal or Google.",
};

function simplifyReason(r) {
  const rL = r.toLowerCase();
  for (const [key, plain] of Object.entries(ELDERLY_REASONS)) {
    if (rL.includes(key.toLowerCase())) return plain;
  }
  return r; // fallback to original if no match
}

// ── Share / Ask Family helper ─────────────────────────────────────────────
function buildShareMessage({ type, riskScore, verdict, reason, link }) {
  const name = trustedContactName || "family member";
  return `Hi ${name}, can you check this for me? CatPhish says it may be unsafe.

Type: ${type}
Risk: ${riskScore}/100
Verdict: ${verdict}
Reason: ${reason}
Link/page: ${link}`;
}

function openShareModal(params) {
  const msg = buildShareMessage(params);
  shareText.textContent = msg;

  // Mail link
  const info = trustedContactInfo.trim();
  const looksLikeEmail = info.includes("@");
  const looksLikePhone = /^[+\d\s\-().]{6,}$/.test(info);

  if (looksLikeEmail && info) {
    const sub = encodeURIComponent("CatPhish: Safety check needed");
    const body = encodeURIComponent(msg);
    shareMailLink.href = `mailto:${info}?subject=${sub}&body=${body}`;
    shareMailLink.classList.remove("hidden");
  } else {
    shareMailLink.classList.add("hidden");
  }

  if (looksLikePhone && info) {
    const phone = info.replace(/[\s\-().]/g, "");
    const waText = encodeURIComponent(msg);
    shareWaLink.href = `https://wa.me/${phone}?text=${waText}`;
    shareWaLink.classList.remove("hidden");
  } else {
    shareWaLink.classList.add("hidden");
  }

  shareModal.classList.add("open");
}

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
      li.textContent = String(elderlyModeEnabled ? simplifyReason(r) : r);
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

  // Elderly mode: override verdict text with plain language
  if (elderlyModeEnabled) {
    if (status === "phishing") {
      verdictBig.textContent = "⛔ This may be dangerous!";
      verdictSub.textContent = "Please do not type your password or card number here.";
    } else if (status === "suspicious") {
      verdictBig.textContent = "⚠️ Something looks wrong";
      verdictSub.textContent = "Be careful. Ask a family member before doing anything.";
    } else if (status === "safe") {
      verdictBig.textContent = "✅ Looks safe";
      verdictSub.textContent = "CatPhish did not find any danger here.";
    }
  }

  // Offline
  offline ? show(offlineBanner) : hide(offlineBanner);

  // Elderly: ensure family button exists in footer
  let familyBtn = document.getElementById("familyBtn");
  if (!familyBtn) {
    familyBtn = document.createElement("button");
    familyBtn.id = "familyBtn";
    familyBtn.className = "elderly-family-btn";
    familyBtn.innerHTML = "👨‍👩‍👧 Ask a family member";
    document.querySelector(".footer").appendChild(familyBtn);
    familyBtn.addEventListener("click", () => {
      if (elderlyModeEnabled) {
        openShareModal({
          type: status,
          riskScore: score,
          verdict: verdict || s.label,
          reason: (reasons && reasons[0]) || "None",
          link: url
        });
      } else {
        const msg = `Can you check this for me? CatPhish says it might be unsafe: ${currentTabUrl || "(unknown page)"}`;
        navigator.clipboard.writeText(msg).then(() => {
          familyBtn.innerHTML = "✅ Message copied! Paste it to someone you trust.";
          setTimeout(() => { familyBtn.innerHTML = "👨‍👩‍👧 Ask a family member"; }, 3000);
        }).catch(() => {
          window.prompt("Copy and send this:", msg);
        });
      }
    });
  }
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

// ── Family Safety Dashboard button ────────────────────────────────────────────
const dashboardBtn = document.getElementById("dashboardBtn");
if (dashboardBtn) {
  dashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });
}

// ── Customize Appearance button ───────────────────────────────────────────────
const customizeBtn = document.getElementById("customizeBtn");
if (customizeBtn) {
  customizeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("customize.html") });
  });
}

// ── Elderly mode init ──────────────────────────────────────────────────────────
function applyElderlyMode(enabled) {
  elderlyModeEnabled = enabled;
  document.body.classList.toggle("elderly-mode", enabled);
  elderlyToggle.checked = enabled;
}

elderlyToggle.addEventListener("change", () => {
  const enabled = elderlyToggle.checked;
  applyElderlyMode(enabled);
  chrome.storage.local.set({ elderlyModeEnabled: enabled });
  // Notify content scripts in the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "ELDERLY_MODE_CHANGED", enabled });
    }
  });
  // Re-render with current data so texts update immediately
  loadStoredResult();
});

// ── Share modal events ────────────────────────────────────────────────────────
shareCloseBtn.addEventListener("click", () => shareModal.classList.remove("open"));
shareCopyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(shareText.textContent).then(() => {
    shareCopyBtn.textContent = "✅ Copied!";
    setTimeout(() => { shareCopyBtn.innerHTML = "📋 Copy message"; }, 2000);
  }).catch(() => window.prompt("Copy this:", shareText.textContent));
});
shareModal.addEventListener("click", (e) => {
  if (e.target === shareModal) shareModal.classList.remove("open");
});

// ── Trusted contact settings ───────────────────────────────────────────────────
contactSaveBtn.addEventListener("click", () => {
  trustedContactName = contactNameEl.value.trim();
  trustedContactInfo = contactInfoEl.value.trim();
  chrome.storage.local.set({ trustedContactName, trustedContactInfo });
  contactSavedTip.textContent = "✅ Saved!";
  setTimeout(() => { contactSavedTip.textContent = ""; }, 2000);
});

function loadContactSettings(cb) {
  chrome.storage.local.get(["trustedContactName", "trustedContactInfo"], (data) => {
    trustedContactName = data.trustedContactName || "";
    trustedContactInfo = data.trustedContactInfo || "";
    contactNameEl.value = trustedContactName;
    contactInfoEl.value = trustedContactInfo;
    if (cb) cb();
  });
}

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

  chrome.storage.local.get(["elderlyModeEnabled", "trustedContactName", "trustedContactInfo"], (data) => {
    trustedContactName = data.trustedContactName || "";
    trustedContactInfo = data.trustedContactInfo || "";
    contactNameEl.value = trustedContactName;
    contactInfoEl.value = trustedContactInfo;
    applyElderlyMode(!!data.elderlyModeEnabled);
    loadStoredResult();
  });
});
