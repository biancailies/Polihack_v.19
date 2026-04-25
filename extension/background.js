// PhishFox — background.js
// Intercepts navigations and blocks high-risk URLs before the page opens.

const BACKEND      = "http://127.0.0.1:8000";
const BLOCK_SCORE  = 80;          // risk_score threshold for hard block
const FETCH_TIMEOUT_MS = 5000;    // abort backend call after 5 s

// ── Internal-URL guard ────────────────────────────────────────────────────────

/**
 * Returns true for any URL that must never be analysed:
 *  • Chrome / Edge / Firefox internal pages
 *  • Our own extension pages  ← prevents infinite redirect loop on warning.html
 *  • Localhost (the backend itself)
 */
function isInternalUrl(url) {
  return (
    !url ||
    url.startsWith("chrome://")           ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://")             ||
    url.startsWith("about:")              ||
    url.startsWith("moz-extension://")    ||
    url.startsWith("http://localhost")    ||
    url.startsWith("https://localhost")
  );
}

// ── Backend call ──────────────────────────────────────────────────────────────

/**
 * POST /analyze-url with a timeout.
 * Returns the parsed response object, or null when the backend is offline.
 */
async function fetchAnalysis(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND}/analyze-url`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
      signal:  controller.signal,
    });

    if (!response.ok) {
      console.warn(`[PhishFox] /analyze-url returned HTTP ${response.status}`);
      return null;
    }

    return await response.json(); // { risk_score, verdict, reasons }
  } catch (err) {
    // AbortError → timeout; TypeError → backend offline / network error
    console.warn("[PhishFox] Backend unreachable:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/** Persist a successful analysis result for the popup to read. */
function saveAnalysisResult(url, result) {
  chrome.storage.local.set({
    lastUrlAnalysis: {
      url,
      risk_score:  result.risk_score,
      verdict:     result.verdict,
      reasons:     result.reasons || [],
      analyzedAt:  Date.now(),
      backendOnline: true,
    },
  });
}

/** Persist a blocked-page entry.
 * Writes to BOTH keys:
 *   blockedAnalysis  — read by warning.js to populate the warning page
 *   lastUrlAnalysis  — read by popup.js (pickLatest) to show status in popup
 */
function saveBlockedResult(url, result) {
  const entry = {
    url,
    risk_score:   result.risk_score,
    verdict:      result.verdict,
    reasons:      result.reasons || [],
    analyzedAt:   Date.now(),
    blocked:      true,
    backendOnline: true,
  };
  chrome.storage.local.set({
    blockedAnalysis: entry,
    lastUrlAnalysis: entry,
  });
}

/** Persist an error stub when the backend is offline. */
function saveOfflineResult(url) {
  chrome.storage.local.set({
    lastUrlAnalysis: {
      url,
      risk_score:  0,
      verdict:     "Backend Offline",
      reasons:     ["Could not reach the PhishFox backend at localhost:8000"],
      analyzedAt:  Date.now(),
      blocked:     false,
      backendOnline: false,
    },
  });
}

// ── Badge helper ──────────────────────────────────────────────────────────────

function updateBadge(tabId, riskScore) {
  let text, color;

  if (riskScore >= BLOCK_SCORE) {
    text  = "!";
    color = "#e74c3c"; // red
  } else if (riskScore >= 40) {
    text  = "~";
    color = "#f39c12"; // amber
  } else {
    text  = "✓";
    color = "#27ae60"; // green
  }

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// ── Redirect helper ───────────────────────────────────────────────────────────

/**
 * Send the tab to warning.html, encoding the blocked URL as a query param.
 * URLSearchParams handles percent-encoding; warning.js reads it with
 * new URLSearchParams(location.search).get("blocked") — no double-decode.
 */
function redirectToWarning(tabId, blockedUrl) {
  const params     = new URLSearchParams({ blocked: blockedUrl });
  const warningUrl = chrome.runtime.getURL(`warning.html?${params}`);
  chrome.tabs.update(tabId, { url: warningUrl });
}

// ── Main listener ─────────────────────────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // 1. Only analyse top-level frame navigations
  if (details.frameId !== 0) return;

  const { tabId, url } = details;

  // 2. Skip internal / extension / localhost pages
  //    This also prevents an infinite loop when the tab is already on warning.html
  if (isInternalUrl(url)) return;

  console.log(`[PhishFox] Analysing: ${url}`);

  try {
    // 3 & 4. Call backend
    const result = await fetchAnalysis(url);

    // ── Backend offline ───────────────────────────────────────────────────────
    if (!result) {
      // Allow navigation but record the failure
      saveOfflineResult(url);
      updateBadge(tabId, 0);
      console.warn("[PhishFox] Backend offline — navigation allowed for:", url);
      return;
    }

    const { risk_score } = result;

    // 5 & 6. High-risk → block
    if (risk_score >= BLOCK_SCORE) {
      console.warn(`[PhishFox] BLOCKED (score=${risk_score}): ${url}`);
      saveBlockedResult(url, result);
      updateBadge(tabId, risk_score);
      redirectToWarning(tabId, url);
      return;
    }

    // 7. Safe enough → allow and save result
    console.log(`[PhishFox] Allowed (score=${risk_score}): ${url}`);
    saveAnalysisResult(url, result);
    updateBadge(tabId, risk_score);

  } catch (err) {
    // Catch-all so the extension never crashes the service worker
    console.error("[PhishFox] Unexpected error in onBeforeNavigate:", err);
  }
});

// ── Message listener for bypassing CSP in content scripts ───────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch-shopping") {
    fetch(`${BACKEND}/analyze-shopping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
    .then(res => {
      if (!res.ok) {
        res.text().then(text => sendResponse({ error: true, status: res.status, text: text }));
      } else {
        res.json().then(data => sendResponse({ error: false, data: data }));
      }
    })
    .catch(err => {
      sendResponse({ error: true, status: 0, text: err.message });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "fetch-analyze") {
    fetch(`${BACKEND}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
    .then(res => {
      if (!res.ok) {
        res.text().then(text => sendResponse({ error: true, status: res.status, text: text }));
      } else {
        res.json().then(data => sendResponse({ error: false, data: data }));
      }
    })
    .catch(err => {
      sendResponse({ error: true, status: 0, text: err.message });
    });
    return true;
  }

  if (request.action === "fetch-message") {
    fetch(`${BACKEND}/analyze-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
    .then(res => {
      if (!res.ok) {
        res.text().then(text => sendResponse({ error: true, status: res.status, text: text }));
      } else {
        res.json().then(data => sendResponse({ error: false, data: data }));
      }
    })
    .catch(err => {
      sendResponse({ error: true, status: 0, text: err.message });
    });
    return true;
  }

  if (request.action === "fetch-email") {
    fetch(`${BACKEND}/analyze-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
    .then(res => {
      if (!res.ok) {
        res.text().then(text => sendResponse({ error: true, status: res.status, text: text }));
      } else {
        res.json().then(data => sendResponse({ error: false, data: data }));
      }
    })
    .catch(err => {
      sendResponse({ error: true, status: 0, text: err.message });
    });
    return true;
  }
});

