// CatPhish — warning.js
// Script is at bottom of <body> — DOM is already ready, no DOMContentLoaded needed.
(function () {
  "use strict";

  const params     = new URLSearchParams(window.location.search);
  const blockedUrl = params.get("blocked") || null;

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const scoreVal    = document.getElementById("scoreVal");
  const verdictChip = document.getElementById("verdictChip");
  const urlTxt      = document.getElementById("urlTxt");
  const reasonsBox  = document.getElementById("reasonsBox");
  const reasonsList = document.getElementById("reasonsList");
  const proceedNote = document.getElementById("proceedNote");
  const goBackBtn   = document.getElementById("goBackBtn");
  const copyBtn     = document.getElementById("copyBtn");
  const proceedBtn  = document.getElementById("proceedBtn");
  const familyBtn   = document.getElementById("familyBtn");

  // ── Elderly mode ────────────────────────────────────────────────────────────
  const ELDERLY_REASONS_MAP = [
    [/credential|password|login|sign.?in/i, "This page is asking for your password. Do NOT type it."],
    [/urgent|immediate|expire|suspend|locked/i, "The page is trying to scare you — this is a scammer trick."],
    [/brand|impersonat|mimic/i, "Someone is pretending to be a company like PayPal or Google."],
    [/mismatch|spoofed/i, "A link on this page goes somewhere different than it shows."],
    [/domain/i, "The website address looks fake or misspelled."],
  ];

  function simplifyReasonForElderly(r) {
    for (const [pat, plain] of ELDERLY_REASONS_MAP) {
      if (pat.test(r)) return plain;
    }
    return r;
  }

  function applyElderlyMode(reasons) {
    document.body.classList.add("elderly-mode");
    // Override subtitle
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) subtitle.textContent = "This website was blocked because it may be trying to steal your password or personal details.";
    // Simplify reason text
    if (reasons) {
      reasonsList.querySelectorAll("li").forEach(li => {
        li.textContent = simplifyReasonForElderly(li.textContent);
      });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function renderUrl(url) {
    if (!url) { urlTxt.textContent = "Unknown URL"; return; }
    const MAX = 80;
    urlTxt.textContent = url.length > MAX ? url.slice(0, MAX) + "…" : url;
    urlTxt.title = url;
  }

  function renderAnalysis(analysis) {
    if (!analysis) return;
    const score   = analysis.risk_score ?? "?";
    const verdict = analysis.verdict    ?? "Phishing";
    scoreVal.textContent    = `${score}/100`;
    verdictChip.textContent = verdict;

    if (Array.isArray(analysis.reasons) && analysis.reasons.length > 0) {
      reasonsBox.classList.remove("hidden");
      reasonsList.innerHTML = "";
      analysis.reasons.forEach(r => {
        const li = document.createElement("li");
        li.textContent = String(r);
        reasonsList.appendChild(li);
      });
    }

    proceedNote.classList.remove("hidden");
  }

  function render(url, analysis) {
    renderUrl(url);
    renderAnalysis(analysis);
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  renderUrl(blockedUrl); // show URL immediately, before async storage read

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["blockedAnalysis", "lastUrlAnalysis", "elderlyModeEnabled"], (data) => {
      if (chrome.runtime.lastError) { render(blockedUrl, null); return; }

      const blocked = data.blockedAnalysis || null;
      const lastUrl = data.lastUrlAnalysis || null;
      const analysis = blocked ||
                       (lastUrl?.blocked ? lastUrl : null) ||
                       lastUrl ||
                       null;

      const url = analysis?.url || blockedUrl;
      render(url, analysis);

      if (data.elderlyModeEnabled) {
        applyElderlyMode(analysis?.reasons);
      }
    });
  } else {
    render(blockedUrl, null);
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────
  goBackBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      history.back();
    } else {
      chrome.tabs.create({ url: "chrome://newtab/" });
    }
  });

  proceedBtn.addEventListener("click", () => {
    const target = blockedUrl || urlTxt.title || null;
    if (!target) return;
    if (confirm(
      "⚠️  FINAL WARNING\n\n" +
      "This page was flagged as a phishing attack.\n" +
      "Continuing may expose your passwords and personal data.\n\n" +
      "Are you absolutely sure?"
    )) {
      window.location.href = target;
    }
  });

  copyBtn.addEventListener("click", async () => {
    const target = blockedUrl || urlTxt.title || null;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      copyBtn.textContent = "✅ Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "📋 Copy URL";
        copyBtn.classList.remove("copied");
      }, 2000);
    } catch {
      window.prompt("Copy this URL:", target);
    }
  });

  if (familyBtn) {
    familyBtn.addEventListener("click", () => {
      const target = blockedUrl || urlTxt.title || "(unknown page)";
      const msg = `Can you check this for me? CatPhish says it might be unsafe: ${target}`;
      navigator.clipboard.writeText(msg).then(() => {
        familyBtn.textContent = "✅ Message copied! Paste it to someone you trust.";
        setTimeout(() => { familyBtn.innerHTML = "👨‍👩‍👧 Ask a family member"; }, 3000);
      }).catch(() => {
        window.prompt("Copy and send this:", msg);
      });
    });
  }
})();
