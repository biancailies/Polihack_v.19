// CatPhis — content.js
// PhishFox analysis + CatPhis animated mascot + chatbot

(function () {
  "use strict";

  const PAGE_URL = window.location.href;
  if (
    window.__catphisRan ||
    !PAGE_URL ||
    PAGE_URL.startsWith("chrome://") ||
    PAGE_URL.startsWith("chrome-extension://") ||
    PAGE_URL.startsWith("edge://") ||
    PAGE_URL.startsWith("about:") ||
    PAGE_URL.startsWith("http://localhost") ||
    PAGE_URL.startsWith("https://localhost")
  ) return;

  window.__catphisRan = true;

  const BACKEND = "http://localhost:8000";
  const OVERLAY_THRESHOLD = 70;
  const TEXT_LIMIT = 5000;
  const STYLES_ID = "__catphis_styles__";
  const ROOT_ID = "catphis-root";
  const SENSITIVE_KEYWORDS = [
    "password", "login", "sign in", "account", "otp", "2fa", "code", "pin",
    "card number", "cvv", "bank login", "verify your account", "credit card",
    "billing", "bank account", "iban", "wire transfer", "crypto wallet",
    "gift card", "payment failed", "refund", "invoice", "customs fee", "delivery fee",
    "western union", "moneygram", "bitcoin", "ethereum", "usdt"
  ];

  // ── Family Safety Log Helper ──────────────────────────────────────────────
  function saveFamilySafetyEvent(event) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      type: event.type || "website",
      risk_score: event.risk_score || 0,
      verdict: event.verdict || "",
      title: event.title || document.title || "",
      url: event.url || window.location.href,
      reasons: event.reasons || [],
      advice: event.advice || ""
    };
    chrome.storage.local.get("familySafetyLog", (data) => {
      const log = data.familySafetyLog || [];
      log.unshift(entry);
      chrome.storage.local.set({ familySafetyLog: log.slice(0, 100) });
    });
  }

  let elderlyModeEnabled = false;
  let currentSettings = {
    mascotVisible: true,
    mascotSize: "medium",
    chatTheme: "dark",
    fontFamily: "inter",
    fontSize: "medium"
  };

  chrome.storage.local.get(["elderlyModeEnabled", "catphishSettings"], (data) => {
    elderlyModeEnabled = !!data.elderlyModeEnabled;
    if (data.catphishSettings) {
      currentSettings = { ...currentSettings, ...data.catphishSettings };
      applyCurrentSettings();
    }
  });

  function applyCurrentSettings() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const positioner = root.querySelector('.catphis-positioner');
    const chat = root.querySelector('.catphis-chat');

    if (positioner) {
      positioner.classList.toggle('catphis-hidden', !currentSettings.mascotVisible);
      positioner.classList.remove('catphis-size-small', 'catphis-size-medium', 'catphis-size-large');
      positioner.classList.add(`catphis-size-${currentSettings.mascotSize}`);
    }

    if (chat) {
      chat.classList.toggle('catphis-theme-light', currentSettings.chatTheme === 'light');
      chat.classList.remove('catphis-font-inter', 'catphis-font-serif', 'catphis-font-mono');
      chat.classList.add(`catphis-font-${currentSettings.fontFamily}`);
      chat.classList.remove('catphis-text-small', 'catphis-text-medium', 'catphis-text-large');
      chat.classList.add(`catphis-text-${currentSettings.fontSize}`);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ELDERLY_MODE_CHANGED") {
      elderlyModeEnabled = !!msg.enabled;
    }
    if (msg.type === "CATPHISH_SETTINGS_CHANGED") {
      currentSettings = msg.settings;
      applyCurrentSettings();
    }
  });

  function simplifyForElderly(technicalText) {
    const map = [
      [/credential|password|login|sign.?in/i, "This page is asking for your password — be careful."],
      [/urgent|immediate|expire|suspend|action required|locked/i, "The message is trying to rush you — that’s a scammer trick."],
      [/brand|impersonat|mimic/i, "Someone is pretending to be a company like PayPal or Google."],
      [/mismatch|spoofed/i, "A link here goes somewhere different than it pretends."],
      [/shortened URL/i, "A link is hidden and could lead anywhere dangerous."],
      [/obfuscat|lookalike|typosquat/i, "A website address looks fake or has a spelling trick."],
      [/domain/i, "The website address looks suspicious."],
      [/payment|bank|card|iban|wire|money|crypto|gift.?card/i, "This page is asking for money or bank details. Please ask a trusted person before continuing."],
    ];
    for (const [pat, plain] of map) {
      if (pat.test(technicalText)) return plain;
    }
    return technicalText;
  }

  // ── Trusted Family Contact Helper ──
  function buildFamilyMessage({ type, riskScore, verdict, reason, link }) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["trustedContactName", "trustedContactInfo"], (data) => {
        const name = data.trustedContactName || "family member";
        const msg = `Hi ${name}, can you check this for me? CatPhish says it may be unsafe.\n\nType: ${type}\nRisk: ${riskScore}/100\nVerdict: ${verdict}\nReason: ${reason}\nLink/page: ${link}`;
        resolve({ msg, info: data.trustedContactInfo || "" });
      });
    });
  }

  async function showFamilyShareOverlay({ type, riskScore, verdict, reason, link }) {
    const { msg, info } = await buildFamilyMessage({ type, riskScore, verdict, reason, link });

    // Remove existing overlay if any
    document.getElementById("__catphis_family_overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "__catphis_family_overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif";

    const looksLikeEmail = info.includes("@");
    const looksLikePhone = /^[+\d\s\-().]{6,}$/.test(info);
    const mailHref = looksLikeEmail
      ? `mailto:${info}?subject=${encodeURIComponent("CatPhish: Safety check needed")}&body=${encodeURIComponent(msg)}`
      : null;
    const waHref = looksLikePhone
      ? `https://wa.me/${info.replace(/[\s\-().]/g, "")}?text=${encodeURIComponent(msg)}`
      : null;

    async function sendFamilyAlertBackend({ recipient, message, url, riskScore, verdict }) {
      try {
        const response = await fetch(`${BACKEND}/send-family-alert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient, message, url, risk_score: riskScore, verdict })
        });
        return await response.json();
      } catch (e) {
        console.error("[CatPhish] Alert failed:", e);
        return null;
      }
    }

    overlay.innerHTML = `
      <div style="background:#12151e;border:1px solid rgba(124,58,237,.5);border-radius:18px;padding:24px;max-width:340px;width:90%;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 72px rgba(0,0,0,.85)">
        <div style="font-size:15px;font-weight:800;color:#a78bfa">👨‍👩‍👧 Ask a family member</div>
        <div id="__catphis_fam_msg" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:12px;font-size:12px;color:#7c859c;line-height:1.7;white-space:pre-wrap;word-break:break-all;max-height:160px;overflow-y:auto">${msg}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${looksLikeEmail ? `<button id="__catphis_fam_send_now" style="background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">🚀 Send Alert Now</button>` : ""}
          <button id="__catphis_fam_copy" style="background:rgba(255,255,255,.05);color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📋 Copy message</button>
          ${mailHref ? `<a href="${mailHref}" id="__catphis_fam_mail_link" target="_blank" style="background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:11px;font-size:13px;font-weight:700;text-align:center;text-decoration:none;display:block">✉️ Use Email App</a>` : ""}
          ${waHref ? `<a href="${waHref}" target="_blank" style="background:rgba(37,211,102,.1);color:#25d366;border:1px solid rgba(37,211,102,.2);border-radius:8px;padding:11px;font-size:13px;font-weight:700;text-align:center;text-decoration:none;display:block">💬 Send via WhatsApp</a>` : ""}
          <button id="__catphis_fam_close" style="background:rgba(255,255,255,.05);color:#7c859c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">❌ Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const sendBtn = document.getElementById("__catphis_fam_send_now");
    if (sendBtn) {
      sendBtn.addEventListener("click", async () => {
        sendBtn.disabled = true;
        sendBtn.textContent = "⌛ Sending...";
        const result = await sendFamilyAlertBackend({ recipient: info, message: msg, url: link, riskScore, verdict });
        if (result && result.status === "success") {
          sendBtn.style.background = "#22c55e";
          sendBtn.textContent = "✅ Alert Sent!";
          setTimeout(() => overlay.remove(), 2000);
        } else {
          sendBtn.disabled = false;
          sendBtn.style.background = "#ef4444";
          sendBtn.textContent = "❌ Failed. Use Copy.";
        }
      });
    }

    document.getElementById("__catphis_fam_copy").addEventListener("click", () => {
      navigator.clipboard.writeText(msg).then(() => {
        document.getElementById("__catphis_fam_copy").textContent = "✅ Copied! Paste it to someone you trust.";
        setTimeout(() => { document.getElementById("__catphis_fam_copy").innerHTML = "📋 Copy message"; }, 2500);
      }).catch(() => window.prompt("Copy this message:", msg));
    });
    document.getElementById("__catphis_fam_close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // Expose globally so chatbot quick button can call it
  window.__catphisAskFamily = showFamilyShareOverlay;

  function extractPageText() {
    if (!document.body) return "";
    const text = (document.body.innerText || "").trim();
    if (text.length <= TEXT_LIMIT) return text;
    return text.slice(0, 2000) + "\n\n...[CONTENT TRUNCATED]...\n\n" + text.slice(-1000);
  }

  function extractForms() {
    const forms = [];
    document.querySelectorAll("form").forEach((form) => {
      const inputs = Array.from(form.querySelectorAll("input"));
      const inputTypes = inputs.map((el) => (el.type || "text").toLowerCase());
      forms.push({
        action: form.getAttribute("action") || "",
        method: (form.getAttribute("method") || "get").toLowerCase(),
        hasPassword: inputTypes.includes("password"),
        inputTypes,
      });
    });
    return forms;
  }

  async function analyzeWithBackend(payload) {
    // Try via background proxy first (bypasses site CSP)
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetch-analyze", payload: payload }, (res) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(res);
        });
      });
      if (response && response.data && !response.error) {
        return response.data;
      }
    } catch { }
    // Fallback: direct fetch (works on most sites without strict CSP)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${BACKEND}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  function saveResult(result, backendOnline) {
    chrome.storage.local.set({
      lastDomAnalysis: {
        url: PAGE_URL,
        risk_score: result?.risk_score ?? 0,
        verdict: result?.verdict ?? (backendOnline ? "Unknown" : "Backend Offline"),
        reasons: result?.reasons || [],
        analyzedAt: Date.now(),
        backendOnline,
      },
    });
  }

  function logFamilySafetyEvent(type, details) {
    chrome.storage.local.get("familySafetyLog", (data) => {
      const log = data.familySafetyLog || [];
      log.push({
        timestamp: Date.now(),
        url: PAGE_URL,
        type,
        details
      });
      // Keep last 100 events
      if (log.length > 100) log.shift();
      chrome.storage.local.set({ familySafetyLog: log });
    });
  }

  function detectSensitiveRequests() {
    const text = extractPageText().toLowerCase();
    const hasPasswordInput = document.querySelector('input[type="password"]') !== null;
    const hasPaymentInput = document.querySelector('input[name*="card"], input[id*="card"], input[name*="cvv"], input[id*="cvv"], input[name*="iban"], input[id*="iban"]') !== null;
    const foundKeywords = SENSITIVE_KEYWORDS.filter(k => text.includes(k));

    return {
      hasPasswordInput,
      hasPaymentInput,
      foundKeywords,
      isSensitive: hasPasswordInput || hasPaymentInput || foundKeywords.length > 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CAT SVGs — embedded as inline SVG strings (always works, no files needed)
  // If you later add images/cat_idle.png and images/cat_drag.png to the
  // extension folder, those will be used instead via the onerror fallback.
  // ═══════════════════════════════════════════════════════════════════════

  // Pisica asezata (idle) — verde ochi
  const SVG_IDLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="90" height="112">
    <!-- Shadow -->
    <ellipse cx="62" cy="148" rx="28" ry="5" fill="rgba(0,0,0,0.25)"/>
    <!-- Tail -->
    <path d="M80 120 Q115 100 108 72 Q102 52 88 60" stroke="#1a1a1a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <!-- Body -->
    <ellipse cx="58" cy="110" rx="32" ry="30" fill="#1c1c1c"/>
    <!-- Hind legs / paws sitting -->
    <ellipse cx="38" cy="143" rx="13" ry="7" fill="#1c1c1c"/>
    <ellipse cx="80" cy="143" rx="13" ry="7" fill="#1c1c1c"/>
    <!-- Chest fluff -->
    <ellipse cx="58" cy="102" rx="14" ry="11" fill="#282828"/>
    <!-- Front paws -->
    <ellipse cx="44" cy="133" rx="9" ry="6" fill="#222"/>
    <ellipse cx="72" cy="133" rx="9" ry="6" fill="#222"/>
    <!-- Neck -->
    <ellipse cx="58" cy="75" rx="16" ry="12" fill="#1c1c1c"/>
    <!-- Head -->
    <ellipse cx="60" cy="54" rx="28" ry="26" fill="#1c1c1c"/>
    <!-- Ear left -->
    <polygon points="32,34 40,12 52,32" fill="#1a1a1a"/>
    <polygon points="35,32 41,17 49,31" fill="#4a2040"/>
    <!-- Ear right -->
    <polygon points="68,32 78,12 88,34" fill="#1a1a1a"/>
    <polygon points="71,31 79,17 85,32" fill="#4a2040"/>
    <!-- Eyes -->
    <ellipse cx="48" cy="52" rx="8" ry="9" fill="#2ecc71"/>
    <ellipse cx="48" cy="52" rx="4" ry="7" fill="#0a0612"/>
    <circle cx="50" cy="49" r="1.8" fill="rgba(255,255,255,.75)"/>
    <ellipse cx="72" cy="52" rx="8" ry="9" fill="#2ecc71"/>
    <ellipse cx="72" cy="52" rx="4" ry="7" fill="#0a0612"/>
    <circle cx="74" cy="49" r="1.8" fill="rgba(255,255,255,.75)"/>
    <!-- Nose -->
    <polygon points="60,62 57,66 63,66" fill="#c084bc"/>
    <!-- Mouth -->
    <path d="M57 66 Q60 70 63 66" stroke="#c084bc" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <!-- Whiskers L -->
    <line x1="22" y1="60" x2="50" y2="63" stroke="#555" stroke-width="1.1"/>
    <line x1="20" y1="65" x2="49" y2="65" stroke="#555" stroke-width="1.1"/>
    <line x1="22" y1="70" x2="50" y2="67" stroke="#555" stroke-width="1.1"/>
    <!-- Whiskers R -->
    <line x1="98" y1="60" x2="70" y2="63" stroke="#555" stroke-width="1.1"/>
    <line x1="100" y1="65" x2="71" y2="65" stroke="#555" stroke-width="1.1"/>
    <line x1="98" y1="70" x2="70" y2="67" stroke="#555" stroke-width="1.1"/>
    <!-- Bell collar -->
    <rect x="44" y="72" width="32" height="7" rx="3.5" fill="#5b21b6"/>
    <circle cx="60" cy="78" r="5" fill="#d97706"/>
    <circle cx="60" cy="78" r="3" fill="#f59e0b"/>
    <circle cx="59" cy="77" r="1" fill="#92400e"/>
  </svg>`;

  // Pisica suspendata (drag) — labe in sus, ochi deschisi
  const SVG_DRAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" width="90" height="120">
    <!-- Tail hanging down -->
    <path d="M88 80 Q115 105 108 130 Q104 150 92 148" stroke="#1a1a1a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <!-- Body -->
    <ellipse cx="58" cy="100" rx="28" ry="32" fill="#1c1c1c"/>
    <!-- Chest fluff -->
    <ellipse cx="58" cy="92" rx="13" ry="10" fill="#282828"/>
    <!-- Front paws raised -->
    <path d="M38 90 Q22 70 28 55" stroke="#1c1c1c" stroke-width="10" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="53" rx="9" ry="6" fill="#222" transform="rotate(-20 28 53)"/>
    <path d="M78 90 Q94 70 88 55" stroke="#1c1c1c" stroke-width="10" fill="none" stroke-linecap="round"/>
    <ellipse cx="88" cy="53" rx="9" ry="6" fill="#222" transform="rotate(20 88 53)"/>
    <!-- Hind legs hanging -->
    <path d="M44 128 Q36 148 42 158" stroke="#1c1c1c" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="157" rx="8" ry="5" fill="#222"/>
    <path d="M72 128 Q80 148 74 158" stroke="#1c1c1c" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="74" cy="157" rx="8" ry="5" fill="#222"/>
    <!-- Neck -->
    <ellipse cx="58" cy="68" rx="16" ry="12" fill="#1c1c1c"/>
    <!-- Head -->
    <ellipse cx="58" cy="48" rx="28" ry="26" fill="#1c1c1c"/>
    <!-- Ear left -->
    <polygon points="30,30 38,8 50,28" fill="#1a1a1a"/>
    <polygon points="33,28 39,13 47,27" fill="#4a2040"/>
    <!-- Ear right -->
    <polygon points="66,28 76,8 86,30" fill="#1a1a1a"/>
    <polygon points="69,27 77,13 83,28" fill="#4a2040"/>
    <!-- Eyes wide open (surprised) -->
    <ellipse cx="46" cy="46" rx="9" ry="10" fill="#2ecc71"/>
    <ellipse cx="46" cy="46" rx="5" ry="8" fill="#0a0612"/>
    <circle cx="48" cy="43" r="2" fill="rgba(255,255,255,.8)"/>
    <ellipse cx="70" cy="46" rx="9" ry="10" fill="#2ecc71"/>
    <ellipse cx="70" cy="46" rx="5" ry="8" fill="#0a0612"/>
    <circle cx="72" cy="43" r="2" fill="rgba(255,255,255,.8)"/>
    <!-- Nose -->
    <polygon points="58,57 55,61 61,61" fill="#c084bc"/>
    <!-- Mouth - open slightly / surprised -->
    <path d="M55 61 Q58 66 61 61" stroke="#c084bc" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- Whiskers L -->
    <line x1="20" y1="54" x2="48" y2="57" stroke="#555" stroke-width="1.1"/>
    <line x1="18" y1="59" x2="47" y2="59" stroke="#555" stroke-width="1.1"/>
    <!-- Whiskers R -->
    <line x1="96" y1="54" x2="68" y2="57" stroke="#555" stroke-width="1.1"/>
    <line x1="98" y1="59" x2="69" y2="59" stroke="#555" stroke-width="1.1"/>
    <!-- Bell collar -->
    <rect x="42" y="65" width="32" height="7" rx="3.5" fill="#5b21b6"/>
    <circle cx="58" cy="71" r="5" fill="#d97706"/>
    <circle cx="58" cy="71" r="3" fill="#f59e0b"/>
    <circle cx="57" cy="70" r="1" fill="#92400e"/>
  </svg>`;

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    // Inject Inter font once
    if (!document.getElementById('__catphis_font__')) {
      const lnk = document.createElement('link');
      lnk.id = '__catphis_font__';
      lnk.rel = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(lnk);
    }
    style.textContent = `
      #catphis-root * { box-sizing: border-box; margin: 0; padding: 10; }
      #catphis-root {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483646;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .catphis-positioner {
        position: relative;
        display: inline-block;
        pointer-events: none;
        will-change: transform;
      }
      .catphis-cat-wrap {
        pointer-events: all;
        cursor: grab;
        position: relative;
        width: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: filter .4s ease;
      }
      .catphis-cat-wrap:hover {
        filter: drop-shadow(0 8px 16px rgba(0,0,0,0.25));
      }
      .catphis-cat-wrap:active { cursor: grabbing; }

      .catphis-cat-svg-wrap {
        display: block;
        width: 160px;
        pointer-events: none;
      }
      .catphis-cat-svg-wrap svg { display: block; width: 100%; height: auto; }

      .catphis-glow {
        position: absolute;
        inset: 20px 15px;
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        transition: opacity .6s, box-shadow .6s;
      }
      .catphis-glow.safe   { box-shadow: none; opacity: 0; }
      .catphis-glow.warn   { box-shadow: 0 0 24px 8px rgba(245,158,11,0.5); opacity: .8; }
      .catphis-glow.danger { box-shadow: 0 0 28px 10px rgba(239,68,68,0.6); opacity: .9; }
      .catphis-glow.loading { box-shadow: 0 0 20px 8px rgba(167,139,250,0.6); opacity: .8; animation: catphis-pulse 1.5s infinite; }

      .catphis-anim-idle { animation: catphis-breathe 3.8s ease-in-out infinite; }
      @keyframes catphis-breathe {
        0%,100% { transform: translateY(0) scale(1); }
        50%      { transform: translateY(-3px) scale(1.02); }
      }

      @keyframes catphis-pop-in {
        from { opacity:0; transform: scale(.88) translateY(8px); }
        to   { opacity:1; transform: scale(1) translateY(0); }
      }

      #catphis-root {
        /* LIGHT MODE: ORANGE — fully opaque, high contrast */
        --c-bg: #fff8f3;
        --c-bg-solid: #ffffff;
        --c-text: #1a0a00;
        --c-border: rgba(234, 88, 12, 0.35);
        --c-header-bg: linear-gradient(135deg, #ea580c, #9a3412);
        --c-header-text: #ffffff;
        --c-user-bg: linear-gradient(135deg, #f97316, #ea580c);
        --c-user-text: #ffffff;
        --c-bot-bg: #fef3e2;
        --c-bot-text: #1a0a00;
        --c-input-bg: #ffffff;
        --c-input-border: rgba(234, 88, 12, 0.4);
        --c-quick-bg: #fff3e8;
        --c-quick-color: #9a3412;
        --c-accent: #ea580c;
        --c-chat-bg: #fff8f3;
      }
      @media (prefers-color-scheme: dark) {
        #catphis-root {
          /* DARK MODE: GREEN THEME */
          --c-bg: rgba(10, 20, 15, 0.98);
          --c-bg-solid: #064e3b;
          --c-text: #ecfdf5;
          --c-border: rgba(16, 185, 129, 0.3);
          --c-header-bg: linear-gradient(135deg, #10b981, #059669);
          --c-header-text: #ffffff;
          --c-user-bg: linear-gradient(135deg, #10b981, #059669);
          --c-user-text: #ffffff;
          --c-bot-bg: rgba(16, 185, 129, 0.15);
          --c-bot-text: #a7f3d0;
          --c-input-bg: rgba(0, 0, 0, 0.5);
          --c-input-border: rgba(16, 185, 129, 0.4);
          --c-quick-bg: rgba(16, 185, 129, 0.15);
          --c-quick-color: #6ee7b7;
          --c-accent: #10b981;
        }
      }

      .catphis-bubble {
        pointer-events: all;
        position: absolute;
        bottom: calc(100% + 12px);
        right: 0;
        background: var(--c-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--c-border);
        border-radius: 16px 16px 4px 16px;
        padding: 10px 15px;
        max-width: 240px;
        font-size: 13px;
        color: var(--c-text);
        line-height: 1.5;
        box-shadow: 0 8px 32px rgba(0,0,0,.15);
        white-space: normal;
        font-family: 'Inter', sans-serif;
      }
      .catphis-bubble::after {
        content: ""; position: absolute; bottom: -9px; right: 18px;
        border: 5px solid transparent;
        border-top-color: var(--c-border);
      }

      .catphis-chat {
        pointer-events: all;
        position: absolute;
        bottom: calc(100% + 14px);
        right: 0;
        width: 380px;
        background: var(--c-bg);
        border: 1.5px solid var(--c-border);
        border-radius: 20px;
        box-shadow: 0 16px 48px rgba(0,0,0,.18), 0 2px 8px rgba(234,88,12,.08);
        overflow: hidden;
        display: none;
        flex-direction: column;
        height: 480px;
        max-height: calc(100vh - 100px);
        z-index: 2147483647;
        transform-origin: bottom right;
        color: var(--c-text);
        font-family: 'Inter', sans-serif;
      }
      .catphis-chat.open {
        display: flex;
        animation: catphis-chat-open .28s cubic-bezier(.34,1.56,.64,1) both;
      }
      @keyframes catphis-chat-open {
        from { opacity:0; transform: scale(.85) translateY(12px); }
        to   { opacity:1; transform: scale(1)   translateY(0); }
      }

      .catphis-chat-header {
        padding: 16px 18px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--c-header-bg);
        color: var(--c-header-text);
      }
      .catphis-chat-avatar {
        width: 38px; height: 38px;
        border-radius: 50%;
        background: var(--c-bg-solid);
        border: 2px solid var(--c-accent);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .catphis-chat-header-info { flex: 1; }
      .catphis-chat-header-title {
        font-size: 15px; font-weight: 700;
        letter-spacing: -.2px; line-height: 1.2;
      }
      .catphis-chat-header-sub {
        font-size: 12px; opacity: 0.9; margin-top: 2px;
        display: flex; align-items: center; gap: 5px;
      }
      .catphis-status-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
        box-shadow: 0 0 5px #22c55e;
        animation: catphis-pulse 2s ease-in-out infinite;
      }
      @keyframes catphis-pulse {
        0%,100% { opacity: 1; } 50% { opacity: .4; }
      }
      .catphis-chat-header-close {
        all: unset; cursor: pointer;
        width: 30px; height: 30px;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; color: inherit; opacity: 0.7;
        transition: opacity .15s, background .15s;
        flex-shrink: 0;
      }
      .catphis-chat-header-close:hover { opacity: 1; background: rgba(255,255,255,.15); }

      .catphis-chat-messages {
        flex: 1;
        overflow-y: scroll;
        padding: 8px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 250px;
        scrollbar-width: auto;
        scrollbar-color: var(--c-border) transparent;
      }
      .catphis-chat-messages::-webkit-scrollbar { width: 8px; }
      .catphis-chat-messages::-webkit-scrollbar-track { background: rgba(0,0,0,.05); border-radius: 4px; margin: 4px; }
      .catphis-chat-messages::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 4px; }

      .catphis-msg-row { display: flex; align-items: flex-end; gap: 8px; }
      .catphis-msg-row:first-child { margin-top: 24px; }
      .catphis-msg-row.user { flex-direction: row-reverse; }
      .catphis-msg-icon {
        width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
        background: var(--c-bg-solid);
        border: 1px solid var(--c-border);
        display: flex; align-items: center; justify-content: center;
        font-size: 14px;
      }
      
      .catphis-msg {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13.5px;
        line-height: 1.5;
        animation: catphis-msg-in .22s cubic-bezier(.34,1.56,.64,1) both;
      }
      @keyframes catphis-msg-in {
        from { opacity:0; transform: translateY(6px) scale(.96); }
        to   { opacity:1; transform: translateY(0) scale(1); }
      }
      .catphis-msg.bot {
        align-self: flex-start;
        background: var(--c-bot-bg);
        border: 1px solid var(--c-border);
        color: var(--c-bot-text);
        border-radius: 4px 16px 16px 16px;
      }
      .catphis-msg.user {
        align-self: flex-end;
        background: var(--c-user-bg);
        color: var(--c-user-text);
        border-radius: 16px 4px 16px 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,.1);
      }
      .catphis-msg.typing {
        align-self: flex-start;
        background: var(--c-bot-bg);
        border: 1px solid var(--c-border);
        border-radius: 4px 16px 16px 16px;
        padding: 12px 16px;
        display: flex; align-items: center; gap: 4px;
      }
      .catphis-dot {
        width: 6px; height: 6px; border-radius: 50%; background: var(--c-accent);
        animation: catphis-dots 1.2s ease-in-out infinite;
      }
      .catphis-dot:nth-child(2) { animation-delay: .2s; }
      .catphis-dot:nth-child(3) { animation-delay: .4s; }
      @keyframes catphis-dots {
        0%,60%,100% { transform: translateY(0); opacity: .5; }
        30% { transform: translateY(-5px); opacity: 1; }
      }

      .catphis-divider {
        text-align: center; font-size: 10px; color: var(--c-border);
        letter-spacing: .5px; text-transform: uppercase; margin: 2px 0;
      }

      .catphis-chat-input-area {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--c-border);
        background: transparent;
        align-items: center;
      }
      .catphis-chat-input {
        all: unset;
        flex: 1;
        background: var(--c-input-bg);
        border: 1px solid var(--c-input-border);
        border-radius: 12px;
        padding: 10px 14px;
        color: var(--c-text);
        font-size: 13.5px;
        transition: border-color .2s;
      }
      .catphis-chat-input::placeholder { opacity: 0.6; color: inherit; }
      .catphis-chat-input:focus {
        border-color: var(--c-accent);
      }
      .catphis-send-btn {
        all: unset;
        cursor: pointer;
        width: 38px; height: 38px;
        border-radius: 12px;
        background: var(--c-user-bg);
        color: var(--c-user-text);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        transition: opacity .15s, transform .15s;
      }
      .catphis-send-btn:hover  { opacity: .9; }
      .catphis-send-btn:active { transform: scale(.9); }
      .catphis-send-btn:disabled { opacity: .4; cursor: not-allowed; }
      .catphis-chat-input:disabled { opacity: .5; cursor: not-allowed; }

      /* Quick action chips */
      .catphis-quick-btns {
        display: flex; flex-wrap: wrap; gap: 8px;
        padding: 10px 16px 14px;
        border-top: 1px solid var(--c-border);
        max-height: 120px;
        overflow-y: auto;
      }
      .catphis-quick-btn {
        all: unset; cursor: pointer;
        background: var(--c-quick-bg);
        border: 1px solid var(--c-border);
        border-radius: 20px;
        padding: 6px 12px;
        font-size: 12px;
        color: var(--c-quick-color);
        transition: background .15s, border-color .15s, transform .12s;
        white-space: nowrap;
        font-family: 'Inter', sans-serif;
      }
      .catphis-quick-btn:hover {
        background: var(--c-border);
        transform: translateY(-1px);
      }
      .catphis-quick-btn:active { transform: scale(.95); }

      /* Risk score card (Left for backward compat if somehow used) */
      .catphis-risk-card { display: none; }
      .catphis-risk-card.safe   { display: none; }
      .catphis-risk-card.warn   { display: none; }
      .catphis-risk-card.danger { display: none; }
      .catphis-risk-card-title { display: none; }
      .catphis-risk-bar-bg { display: none; }
      .catphis-risk-bar-fill { display: none; }
      .catphis-risk-bar-fill.safe   { display: none; }
      .catphis-risk-bar-fill.warn   { display: none; }
      .catphis-risk-bar-fill.danger { display: none; }
      .catphis-risk-reason { display: none; }
      .catphis-risk-reason::before { content: '• '; }
      
      /* Toast */
      .catphis-toast {
        position: fixed;
        bottom: 70px; left: 50%; transform: translateX(-50%);
        background: var(--c-accent);
        color: #fff; font-size: 13px; font-weight: 600;
        padding: 8px 18px; border-radius: 20px;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,.3);
        animation: catphis-toast-in .3s ease both;
        pointer-events: none; z-index: 2147483647;
      }
      @keyframes catphis-toast-in {
        from { opacity:0; transform: translateX(-50%) translateY(8px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0); }
      }

      /* --- Customize appearance classes --- */
      .catphis-hidden { display: none !important; }
      
      /* Mascot Sizes */
      .catphis-size-small .catphis-cat-wrap { transform: scale(0.65) !important; transform-origin: bottom right !important; }
      .catphis-size-medium .catphis-cat-wrap { transform: scale(1) !important; transform-origin: bottom right !important; }
      .catphis-size-large .catphis-cat-wrap { transform: scale(1.35) !important; transform-origin: bottom right !important; }
      
      /* Avoid overlap when cat is large */
      .catphis-size-large .catphis-chat { bottom: calc(100% + 64px) !important; }
      .catphis-size-large .catphis-bubble { bottom: calc(100% + 60px) !important; }

      /* Chat Themes */
      .catphis-theme-light { 
        background: #fff8f3 !important; 
        border-color: rgba(234, 88, 12, 0.35) !important;
        box-shadow: 0 16px 48px rgba(0,0,0,.18), 0 2px 8px rgba(234,88,12,.08) !important;
      }
      .catphis-theme-light .catphis-chat-header { background: linear-gradient(135deg, #ea580c, #9a3412) !important; border-bottom: none !important; }
      .catphis-theme-light .catphis-chat-header-title { color: #ffffff !important; }
      .catphis-theme-light .catphis-chat-header-sub { color: rgba(255,255,255,.9) !important; }
      .catphis-theme-light .catphis-msg.bot { background: #fef3e2 !important; color: #1a0a00 !important; border-color: rgba(234, 88, 12, 0.3) !important; }
      .catphis-theme-light .catphis-msg.user { background: linear-gradient(135deg, #f97316, #ea580c) !important; color: #ffffff !important; }
      .catphis-theme-light .catphis-chat-input-area { background: transparent !important; border-top: 1px solid rgba(234, 88, 12, 0.4) !important; }
      .catphis-theme-light .catphis-chat-input { background: #ffffff !important; border: 1px solid rgba(234, 88, 12, 0.4) !important; color: #1a0a00 !important; }
      .catphis-theme-light .catphis-quick-btn { 
        background: #fff3e8 !important; 
        border: 1px solid rgba(234, 88, 12, 0.35) !important; 
        color: #9a3412 !important; 
        font-weight: 600 !important;
      }
      .catphis-theme-light .catphis-quick-btn:hover { background: rgba(234, 88, 12, 0.15) !important; }
      .catphis-theme-light .catphis-chat-messages { color: #1a0a00 !important; }

      /* Font Families */
      .catphis-font-inter .catphis-chat-msg-area, .catphis-font-inter #catphis-input { font-family: 'Inter', sans-serif !important; }
      .catphis-font-serif .catphis-chat-msg-area, .catphis-font-serif #catphis-input { font-family: Georgia, 'Times New Roman', serif !important; }
      .catphis-font-mono .catphis-chat-msg-area, .catphis-font-mono #catphis-input { font-family: 'Fira Code', 'Courier New', monospace !important; }

      /* Text Sizes */
      .catphis-text-small .catphis-chat-msg-area { font-size: 11px !important; }
      .catphis-text-medium .catphis-chat-msg-area { font-size: 13px !important; }
      .catphis-text-large .catphis-chat-msg-area { font-size: 16px !important; }
    `;
    document.head.appendChild(style);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // BOT RESPONSES & HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  let conversationHistory = [];

  async function loadHistory() {
    return new Promise(res => {
      chrome.storage.local.get("chatHistory", (data) => {
        const h = data.chatHistory || {};
        if (h.url === PAGE_URL && Array.isArray(h.messages)) {
          conversationHistory = h.messages;
        } else {
          conversationHistory = [];
        }
        res();
      });
    });
  }

  function saveHistory() {
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }
    chrome.storage.local.set({
      chatHistory: { url: PAGE_URL, messages: conversationHistory }
    });
  }

  async function fetchChatResponse(msg, riskScore) {
    let analysisResult = null;
    try {
      const data = await new Promise(res => chrome.storage.local.get("lastDomAnalysis", res));
      if (data && data.lastDomAnalysis && data.lastDomAnalysis.url === PAGE_URL) {
        analysisResult = data.lastDomAnalysis;
      }

      if (!analysisResult) {
        const payload = {
          url: PAGE_URL,
          page_title: document.title || "",
          page_text: extractPageText(),
          forms: extractForms(),
        };
        const analyzeRes = await fetch(`${BACKEND}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (analyzeRes.ok) {
          analysisResult = await analyzeRes.json();
          saveResult(analysisResult, true);
        } else {
          analysisResult = { risk_score: riskScore || 0, verdict: "Unknown", reasons: [] };
        }
      }

      const forms = extractForms();
      const hasPasswordForm = forms.some(f => f.hasPassword);
      const formActions = forms.map(f => f.action).filter(Boolean);

      const pageContext = {
        url: PAGE_URL,
        hostname: window.location.hostname,
        title: document.title || "",
        page_text_sample: extractPageText(),
        hasPasswordForm: hasPasswordForm,
        formActions: formActions
      };

      const chatPayload = {
        message: msg,
        conversation_history: conversationHistory.slice(0, -1),
        analysis: {
          risk_score: analysisResult.risk_score || 0,
          verdict: analysisResult.verdict || "Unknown",
          reasons: analysisResult.reasons || []
        },
        page_context: pageContext
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (response.ok) {
        const json = await response.json();
        if (json && json.reply) return json.reply;
      }
      throw new Error("Backend chat failed");
    } catch (err) {
      console.error("[CatPhis] Chat backend error:", err);
      return getLocalBotResponse(msg, riskScore, analysisResult?.reasons || []);
    }
  }

  function getLocalBotResponse(msg, riskScore, reasons) {
    const m = msg.toLowerCase().trim();
    const score = riskScore || 0;
    const reasonList = (reasons && reasons.length) ? '\n\nDetected: ' + reasons.slice(0, 2).join('; ') + '.' : '';

    if (m.includes("safe") || m.includes("sigur") || m.includes("legit"))
      return score < 40
        ? "✅ This page looks clean! No phishing signals detected. Stay safe 😺"
        : `⚠️ Risk score is ${score}/100 — don't fully trust this page.${reasonList}`;

    if (m.includes("why") || m.includes("reason") || m.includes("suspicious") || m.includes("explain"))
      return reasons && reasons.length
        ? `🔍 Here's what I found:\n${reasons.map(r => '• ' + r).join('\n')}`
        : "I couldn't find specific issues, but stay cautious on unfamiliar pages.";

    if (m.includes("score") || m.includes("risk") || m.includes("scor") || m.includes("risc"))
      return riskScore != null
        ? `📊 Risk score: ${score}/100. ${score >= 70 ? '⛔ Dangerous — leave now!' : score >= 40 ? '⚠️ Suspicious — be cautious.' : '✅ Looks clean.'}`
        : "Still analyzing this page... ask me again in a moment!";

    if (m.includes("password") || m.includes("parola") || m.includes("login") || m.includes("credentials") || m.includes("otp") || m.includes("code")) {
      if (score >= 70) return "🚨 STOP! Do NOT enter your password here. This page is extremely dangerous.";
      if (score >= 40) return "⚠️ Careful. I don't recommend logging in here. Better type the URL yourself.";
      return "✅ Looks safe, but always double-check the URL before typing your password.";
    }

    if (m.includes("report") || m.includes("flag"))
      return "Use the '🚩 Report Site' button below to flag this page.";

    if (m.includes("what should i do") || m.includes("help") || m.includes("ajutor"))
      return score >= 70
        ? "⛔ Leave this page immediately!"
        : score >= 40
          ? "⚠️ Be careful. Don't enter personal data."
          : "Looks okay! Just verify the URL 🔐";

    if (m.includes("hello") || m.includes("hi") || m.includes("salut") || m.includes("hey"))
      return "Meow! 🐾 I'm CatPhish. Ask me if this page is safe!";

    if (m.includes("payment") || m.includes("bank") || m.includes("card") || m.includes("money") || m.includes("crypto") || m.includes("pay")) {
      if (score >= 70) return "🚨 STOP! Do NOT pay or enter bank details here. High risk of fraud.";
      if (score >= 40) return "⚠️ Be very careful with payments here. Watch out for fake fees.";
      return "✅ Payment page looks safe. Ensure the site uses HTTPS.";
    }

    const defaults = [
      `I'm actively monitoring this page (score: ${score}/100) 👀`,
      "Meow. Let me sniff around 🐈‍⬛ — try asking 'is this site safe?'",
      "Always scanning for threats 🛡️ Ask me if you should trust this page!",
      "Try: 'why is this suspicious?' or 'can I enter my password here?'",
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MASCOT INJECTION
  // ═══════════════════════════════════════════════════════════════════════

  function injectMascot(riskScore, verdict) {
    if (document.getElementById(ROOT_ID)) return;
    injectStyles();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const positioner = document.createElement("div");
    positioner.className = "catphis-positioner";

    // ── Bubble notification
    const bubble = document.createElement("div");
    bubble.className = "catphis-bubble";
    bubble.style.display = "none";
    if (riskScore != null) {
      if (riskScore >= 70) {
        bubble.textContent = "⛔ Dangerous page detected! Don't enter any info.";
        bubble.style.borderColor = "rgba(239,68,68,.6)";
        bubble.style.display = "block";
      } else if (riskScore >= 40) {
        bubble.textContent = "👀 My whiskers say this page is suspicious. Be careful!";
        bubble.style.borderColor = "rgba(245,158,11,.5)";
        bubble.style.display = "block";
      }
    }

    // ── Chat
    const chat = document.createElement("div");
    chat.className = "catphis-chat";

    const header = document.createElement("div");
    header.className = "catphis-chat-header";

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "catphis-chat-avatar";
    avatar.textContent = "🐾";

    const infoArea = document.createElement("div");
    infoArea.className = "catphis-chat-header-info";
    const titleEl = document.createElement("div");
    titleEl.className = "catphis-chat-header-title";
    titleEl.textContent = "CatPhish Assistant";
    const subEl = document.createElement("div");
    subEl.className = "catphis-chat-header-sub";
    const dot = document.createElement("span");
    dot.className = "catphis-status-dot";
    subEl.append(dot, document.createTextNode("Anti-phishing AI"));
    infoArea.append(titleEl, subEl);

    const actionsArea = document.createElement("div");
    actionsArea.style.cssText = "display:flex;gap:6px;";

    const clearBtn = document.createElement("button");
    clearBtn.className = "catphis-chat-header-close";
    clearBtn.textContent = "↺";
    clearBtn.title = "New Chat";
    clearBtn.style.fontSize = "18px";
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      conversationHistory = [];
      saveHistory();
      msgArea.innerHTML = "";
      injectRiskCard();
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "catphis-chat-header-close";
    closeBtn.textContent = "✕";
    closeBtn.onclick = (e) => { e.stopPropagation(); chat.classList.remove("open"); };

    actionsArea.append(clearBtn, closeBtn);
    header.append(avatar, infoArea, actionsArea);

    const msgArea = document.createElement("div");
    msgArea.className = "catphis-chat-messages";

    function addMsg(text, type) {
      const row = document.createElement("div");
      row.className = `catphis-msg-row ${type === "user" ? "user" : ""}`;

      if (type === "bot") {
        const icon = document.createElement("div");
        icon.className = "catphis-msg-icon";
        icon.textContent = "🐾";
        row.appendChild(icon);
      }

      const el = document.createElement("div");
      el.className = `catphis-msg ${type}`;
      el.textContent = text;
      row.appendChild(el);
      msgArea.appendChild(row);
      msgArea.scrollTop = msgArea.scrollHeight;
    }

    if (conversationHistory.length === 0) {
      addMsg("Meow! 🐈‍⬛ I'm CatPhish. Ask me about this page's safety!", "bot");
    } else {
      conversationHistory.forEach(m => addMsg(m.content, m.role === "user" ? "user" : "bot"));
      setTimeout(() => msgArea.scrollTop = msgArea.scrollHeight, 50);
    }

    // Expose for external calls (like email scans)
    window.__catphisAddMsg = addMsg;


    const inputArea = document.createElement("div");
    inputArea.className = "catphis-chat-input-area";
    const input = document.createElement("input");
    input.className = "catphis-chat-input";
    input.placeholder = "Ask me anything...";
    const sendBtn = document.createElement("button");
    sendBtn.className = "catphis-send-btn";
    sendBtn.textContent = "➤";
    sendBtn.title = "Send";

    const quickBtnsArea = document.createElement("div");
    quickBtnsArea.className = "catphis-quick-btns";
    const quickQuestions = [
      "Scan this email",
      "Is this safe?",
      "Can I enter my password?",
      "Is payment safe here?",
      "Why is this email risky?",
      "What should I do?"
    ];

    function showToast(msg, color) {
      const t = document.createElement("div");
      t.className = "catphis-toast";
      t.textContent = msg;
      if (color) t.style.background = color;
      positioner.appendChild(t);
      setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; }, 2200);
      setTimeout(() => t.remove(), 2700);
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      // Lock UI
      input.disabled = true;
      sendBtn.disabled = true;
      addMsg(text, "user");
      conversationHistory.push({ role: "user", content: text });
      saveHistory();
      input.value = "";

      const tRow = document.createElement("div");
      tRow.className = "catphis-msg-row";
      const tIcon = document.createElement("div");
      tIcon.className = "catphis-msg-icon"; tIcon.textContent = "🐾";
      const tBubble = document.createElement("div");
      tBubble.className = "catphis-msg typing";
      [1, 2, 3].forEach(() => {
        const d = document.createElement("div");
        d.className = "catphis-dot";
        tBubble.appendChild(d);
      });
      tRow.append(tIcon, tBubble);
      msgArea.appendChild(tRow);
      msgArea.scrollTop = msgArea.scrollHeight;

      const minDelay = new Promise(r => setTimeout(r, 700 + Math.random() * 400));
      const [reply] = await Promise.all([
        fetchChatResponse(text, riskScore),
        minDelay
      ]);

      tRow.remove();
      addMsg(reply, "bot");
      conversationHistory.push({ role: "assistant", content: reply });
      saveHistory();
      // Unlock UI
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }

    function addQuickBtn(text, onClick, styleProps = {}) {
      if (Array.from(quickBtnsArea.querySelectorAll('.catphis-quick-btn')).some(b => b.textContent === text)) return null;
      const btn = document.createElement("button");
      btn.className = "catphis-quick-btn";
      if (styleProps.borderColor) btn.style.borderColor = styleProps.borderColor;
      if (styleProps.color) btn.style.color = styleProps.color;
      btn.textContent = text;
      btn.onclick = onClick;
      quickBtnsArea.appendChild(btn);
      return btn;
    }

    quickQuestions.forEach(q => {
      addQuickBtn(q, () => {
        if (q === "Scan this email") {
          if (window.__catphisForceScanEmail) window.__catphisForceScanEmail();
        } else {
          input.value = q; send();
        }
      });
    });

    addQuickBtn("🚩 Report site", async () => {
      const btn = Array.from(quickBtnsArea.querySelectorAll('.catphis-quick-btn')).find(b => b.textContent.includes("Report site"));
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Reporting...";
      try {
        await fetch(`${BACKEND}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: PAGE_URL, description: "Reported via CatPhish extension" })
        });
        showToast("✅ Site reported — thank you!");
      } catch {
        showToast("⚠️ Could not report (backend offline)", "rgba(245,158,11,.9)");
      }
      btn.textContent = "🚩 Reported!";
    }, { borderColor: "rgba(239,68,68,.3)", color: "#fca5a5" });

    // Scam Message Detector
    const scamBtn = document.createElement("button");
    scamBtn.className = "catphis-quick-btn";
    scamBtn.textContent = "🕵️ Check scam message";
    scamBtn.style.borderColor = "rgba(16,185,129,.3)";
    scamBtn.style.color = "#6ee7b7";
    scamBtn.onclick = async () => {
      scamBtn.disabled = true;
      scamBtn.textContent = "Checking...";

      let msgText = window.getSelection().toString().trim();
      let source = "selected_text";

      if (!msgText) {
        if (typeof isChatPage === "function" && isChatPage()) {
          msgText = extractChatDataFast();
          source = "auto_chat_scan";
        } else {
          msgText = extractPageText();
          source = "visible_page";
        }
      }

      if (!msgText || msgText.length < 10) {
        msgText = prompt("Please paste the message you want to check for scams:");
        source = "manual_paste";
      }

      if (!msgText) {
        showToast("No message provided.", "rgba(245,158,11,.9)");
        scamBtn.disabled = false;
        scamBtn.textContent = "🕵️ Check scam message";
        return;
      }

      try {
        const payload = {
          message_text: msgText,
          page_url: PAGE_URL,
          source: source
        };

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "fetch-message", payload: payload }, (res) => {
            if (chrome.runtime.lastError) resolve({ error: true, text: chrome.runtime.lastError.message, status: 0 });
            else resolve(res);
          });
        });

        if (response.error || !response.data) {
          throw new Error(response.text || "Backend offline");
        }

        handleScamResult(response.data, msgText);
      } catch (err) {
        // Fallback analysis
        const result = fallbackScamAnalysis(msgText);
        handleScamResult(result, msgText);
      }

      scamBtn.disabled = false;
      scamBtn.textContent = "🕵️ Check scam message";
    };
    quickBtnsArea.appendChild(scamBtn);

    function fallbackScamAnalysis(text) {
      const t = text.toLowerCase();
      let score = 0;
      let reasons = [];

      if (t.match(/mom|dad|son|daughter|mum/) && t.includes("new number")) { score += 80; reasons.push("Family impersonation"); }
      if (t.includes("send money") || t.includes("lost my phone") || t.includes("broken phone") || t.includes("transfer needed")) { score += 60; reasons.push("Emergency money request"); }
      if (t.match(/package|delivery|stuck/) && t.match(/fee|pay|customs/)) { score += 75; reasons.push("Package delivery scam"); }
      if (t.includes("won a prize") || t.includes("claim now") || t.includes("reward") || t.includes("lottery")) { score += 70; reasons.push("Prize scam"); }
      if (t.includes("account is locked") || t.includes("bank account locked")) { score += 85; reasons.push("Bank account lock scam"); }
      if (t.match(/gift card|crypto|bitcoin|wire transfer/)) { score += 50; reasons.push("Request for untraceable payment"); }
      if (t.match(/urgent|immediately|asap|act now/)) { score += 20; reasons.push("Urgent pressure language"); }

      score = Math.min(100, score);
      let verdict = "Safe";
      let advice = "This message doesn't trigger our basic scam filters, but always stay alert.";
      if (score >= 70) { verdict = "Scam"; advice = "This looks like a known scam. Do not reply or send money."; }
      else if (score >= 40) { verdict = "Suspicious"; advice = "This message contains suspicious language. Verify the sender's identity."; }

      return { risk_score: score, verdict: verdict, reasons: reasons, advice: advice };
    }

    function handleScamResult(result, scannedText = "") {
      try { chrome.storage.local.set({ lastMessageAnalysis: result }); } catch (e) { }

      // Update visuals dynamically
      if (window.__catphisUpdateVisuals) {
        window.__catphisUpdateVisuals(result.risk_score);
      }

      // Send a chat message
      let snippet = "";
      if (scannedText) {
        let truncated = scannedText.substring(0, 60);
        if (scannedText.length > 60) truncated += "...";
        snippet = `*Scanned:* "${truncated}"\n\n`;
      }

      const chatMsg = `${snippet}Verdict: **${result.verdict}** (Score: ${result.risk_score}/100).\nAdvice: ${result.advice}`;

      if (!chat.classList.contains("open")) {
        chat.classList.add("open");
        bubble.style.display = "none";
      }

      addMsg(chatMsg, "bot");
      conversationHistory.push({ role: "assistant", content: chatMsg });
      saveHistory();
    }

    // ── Fake Shopping Site Detection ──
    function isShoppingPage() {
      const txt = (document.body.innerText || "").toLowerCase();
      const url = window.location.href.toLowerCase();

      if (url.includes("checkout") || url.includes("cart") || url.includes("shop") || url.includes("store")) return true;

      let score = 0;
      if (txt.includes("add to cart") || txt.includes("add to bag")) score++;
      if (txt.includes("buy now") || txt.includes("checkout")) score++;
      if (txt.includes("price:") || txt.includes("sale")) score++;
      if (txt.match(/\$\d+(\.\d{2})?|€\d+(\.\d{2})?|£\d+(\.\d{2})?/)) score++;

      return score >= 2;
    }

    function extractShoppingData() {
      const txt = (document.body.innerText || "").toLowerCase();
      const priceMatches = txt.match(/\$\d+(\.\d{2})?|€\d+(\.\d{2})?|£\d+(\.\d{2})?/g) || [];
      const paymentWords = ["crypto", "bitcoin", "ethereum", "gift card", "wire transfer", "western union", "bank transfer", "paypal", "credit card", "visa", "mastercard"];
      const foundPayments = paymentWords.filter(w => txt.includes(w));

      const links = Array.from(document.querySelectorAll("a")).map(a => ({
        text: a.innerText.trim(),
        href: a.href || ""
      })).filter(l => l.href && l.href.startsWith("http")).slice(0, 100);


      return {
        url: window.location.href,
        hostname: window.location.hostname,
        title: document.title,
        body_text: extractPageText(),
        links: links,
        forms: extractForms(),
        detected_prices: [...new Set(priceMatches)].slice(0, 5),
        detected_payment_words: foundPayments
      };
    }

    async function checkShoppingSite() {
      const btn = Array.from(document.querySelectorAll('.catphis-quick-btn')).find(b => b.textContent.includes("Check this shop"));
      if (btn) { btn.disabled = true; btn.textContent = "Scanning shop..."; }

      try {
        const shopData = extractShoppingData();
        console.log("[CatPhish] Sending shop data to background...", shopData.hostname);

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "fetch-shopping", payload: shopData }, (res) => {
            if (chrome.runtime.lastError) {
              console.warn("[CatPhish] Shop sendMessage error:", chrome.runtime.lastError.message);
              resolve({ error: true, text: chrome.runtime.lastError.message, status: 0 });
            } else {
              resolve(res || { error: true, text: "No response from background", status: 0 });
            }
          });
        });

        console.log("[CatPhish] Shop response:", response);

        if (response.error) {
          // Try local fallback if backend is unreachable
          const localResult = localShoppingFallback(shopData);
          handleShoppingResult(localResult);
          if (response.status === 0) {
            showToast("⚠️ Backend offline — using local analysis", "rgba(245,158,11,.9)");
          }
        } else if (response.data) {
          handleShoppingResult(response.data);
        }
      } catch (err) {
        console.error("[CatPhish] checkShoppingSite exception:", err);
        showToast("⚠️ JS Error: " + err.message, "rgba(245,158,11,.9)");
      }

      if (btn) { btn.disabled = false; btn.textContent = "🛒 Check this shop"; }
    }

    function localShoppingFallback(shopData) {
      let score = 0;
      const reasons = [];
      const txt = shopData.body_text.toLowerCase();
      const host = shopData.hostname.toLowerCase();

      const discountPhrases = ["80% off", "90% off", "70% off", "clearance", "today only", "limited stock", "liquidation"];
      if (discountPhrases.some(p => txt.includes(p))) { score += 35; reasons.push("Extreme discount language detected"); }

      const suspPayments = ["crypto", "bitcoin", "gift card", "wire transfer", "western union"];
      const found = [...shopData.detected_payment_words, ...suspPayments.filter(w => txt.includes(w))];
      if (found.length > 0) { score += 45; reasons.push("Suspicious payment methods: " + [...new Set(found)].join(", ")); }

      if (!txt.includes("contact") && !txt.includes("return") && !txt.includes("refund")) { score += 25; reasons.push("Missing trust signals (contact/return policy)"); }

      const weirdTlds = [".top", ".vip", ".club", ".shop", ".xyz", ".online", ".site", ".cyou"];
      if (weirdTlds.some(t => host.endsWith(t))) { score += 20; reasons.push("Suspicious domain extension"); }
      if ((host.match(/-/g) || []).length >= 2) { score += 15; reasons.push("Domain contains multiple hyphens"); }

      score = Math.min(100, score);
      const verdict = score >= 85 ? "Likely Scam" : score >= 50 ? "Suspicious" : "Safe";
      const advice = score >= 85
        ? "This store shows multiple high-risk scam indicators. DO NOT enter your card details."
        : score >= 50
          ? "Proceed with extreme caution. Use PayPal or a credit card only."
          : "No obvious scam signals found. Always use a secure payment method.";

      return { risk_score: score, verdict, reasons: reasons.length ? reasons : ["Shop looks standard"], advice };
    }

    function handleShoppingResult(result) {
      chrome.storage.local.set({ lastShoppingAnalysis: result });

      // Log to Family Safety Dashboard
      saveFamilySafetyEvent({
        type: "shopping",
        risk_score: result.risk_score,
        verdict: result.verdict,
        title: document.title || window.location.hostname,
        url: window.location.href,
        reasons: result.reasons || [],
        advice: result.advice || ""
      });

      // Update glow
      glow.className = "catphis-glow";
      if (result.risk_score >= 85) glow.classList.add("danger");
      else if (result.risk_score >= 50) glow.classList.add("warn");
      else glow.classList.add("safe");

      // Add extra chat questions specific to shopping
      ["Can I buy from here?", "Why is this shop risky?"].forEach(q => {
        addQuickBtn(q, () => { input.value = q; send(); }, { borderColor: "rgba(167, 139, 250, .3)", color: "#a78bfa" });
      });

      const chatMsg = `This shop looks **${result.verdict}** (Score: ${result.risk_score}/100).\n\nReasons: ${result.reasons.join(", ") || "None found."}\n\nAdvice: ${result.advice}`;

      if (!chat.classList.contains("open")) {
        chat.classList.add("open");
        bubble.style.display = "none";
      }

      addMsg(chatMsg, "bot");
      conversationHistory.push({ role: "assistant", content: chatMsg });
      saveHistory();

      if (result.risk_score >= 85) {
        // Optional: Show warning overlay since risk_score >= 85
        const warning = document.createElement("div");
        warning.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;text-align:center;";
        warning.innerHTML = `
                <div style="background:#1f2937;padding:40px;border-radius:12px;max-width:500px;border:2px solid #ef4444;">
                    <h1 style="color:#ef4444;margin-top:0;">⛔ HIGH RISK SHOP ⛔</h1>
                    <p style="font-size:16px;">We detected multiple scam indicators on this store. We strongly advise against making any purchases or entering card details.</p>
                    <button id="catphis-dismiss-warning" style="margin-top:20px;padding:10px 20px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">I understand, let me proceed</button>
                </div>
            `;
        document.body.appendChild(warning);
        document.getElementById("catphis-dismiss-warning").onclick = () => warning.remove();
      }
    }

    addQuickBtn("🛒 Check this shop", checkShoppingSite, { borderColor: "rgba(59,130,246,.3)", color: "#60a5fa" });

    if (isShoppingPage() && !verdict) {
      setTimeout(checkShoppingSite, 1500);
    }

    sendBtn.onclick = send;
    input.onkeydown = (e) => { if (e.key === "Enter") send(); };


    inputArea.append(input, sendBtn);
    chat.append(header, msgArea, quickBtnsArea, inputArea);

    // ── Cat wrap
    const catWrap = document.createElement("div");
    catWrap.className = "catphis-cat-wrap catphis-anim-idle";

    const isContextSpecific = window.location.hostname.includes("mail.google.com") || window.location.hostname.includes("web.whatsapp.com");
    const visualRiskScore = isContextSpecific ? 0 : riskScore;

    const glow = document.createElement("div");
    glow.className = "catphis-glow";
    if (visualRiskScore != null) {
      if (visualRiskScore >= 70) glow.classList.add("danger");
      else if (visualRiskScore >= 40) glow.classList.add("warn");
      else glow.classList.add("safe");
    }

    // Size constants — change here to resize everywhere
    const IDLE_SIZE = "210px";
    const DRAG_SIZE = "300px";

    // SVG container — try to use PNG images first, fall back to inline SVG
    const svgWrap = document.createElement("div");
    svgWrap.className = "catphis-cat-svg-wrap";

    // Try extension image first; onerror falls back to embedded SVG
    let idleFilename = "cat_idle.png";
    if (visualRiskScore != null) {
      if (visualRiskScore >= 70) idleFilename = "cat_red.png";
      else if (visualRiskScore >= 40) idleFilename = "cat_yellow.png";
    }

    let initImgUrl = (() => {
      try { return chrome.runtime.getURL("images/" + idleFilename); } catch { return null; }
    })();
    const dragImgUrl = (() => {
      try { return chrome.runtime.getURL("images/cat_drag.png"); } catch { return null; }
    })();

    let usingImage = false;
    let imgEl = null;

    if (initImgUrl) {
      imgEl = document.createElement("img");
      imgEl.src = initImgUrl;
      // mix-blend-mode:multiply makes white pixels transparent visually (no Photoshop needed)
      imgEl.style.cssText = "width:100%;height:auto;display:block;pointer-events:none;mix-blend-mode:multiply;";
      imgEl.draggable = false;
      imgEl.onerror = () => {
        // Image not found — fall back to inline SVG
        usingImage = false;
        imgEl.remove();
        svgWrap.innerHTML = SVG_IDLE;
      };
      imgEl.onload = () => {
        if (!usingImage) {
          // First load only: mark as ready and apply idle size
          usingImage = true;
          catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        }
        // Subsequent onload calls (from setCatIdle/setCatDrag src swaps) — do nothing
      };
      svgWrap.appendChild(imgEl);
    } else {
      svgWrap.innerHTML = SVG_IDLE;
    }

    function setCatIdle() {
      if (usingImage && imgEl && initImgUrl) {
        imgEl.src = initImgUrl;
      } else {
        svgWrap.innerHTML = SVG_IDLE;
      }
    }

    // Expose visual updater for context-specific scans (Gmail/WhatsApp)
    window.__catphisUpdateVisuals = (score, isLoading = false) => {
      glow.className = "catphis-glow";
      if (isLoading) {
        glow.classList.add("loading");
      } else {
        if (score >= 70) glow.classList.add("danger");
        else if (score >= 40) glow.classList.add("warn");
        else glow.classList.add("safe");
      }

      let newIdleFilename = "cat_idle.png";
      if (!isLoading && score != null) {
        if (score >= 70) newIdleFilename = "cat_red.png";
        else if (score >= 40) newIdleFilename = "cat_yellow.png";
      }

      const newUrl = (() => {
        try { return chrome.runtime.getURL("images/" + newIdleFilename); } catch { return null; }
      })();

      if (newUrl) {
        initImgUrl = newUrl;
        if (!isDragging && usingImage && imgEl) {
          imgEl.src = initImgUrl;
        }
      }
    };
    function setCatDrag() {
      if (usingImage && imgEl && dragImgUrl) {
        imgEl.src = dragImgUrl;
      } else {
        svgWrap.innerHTML = SVG_DRAG;
      }
    }

    catWrap.append(glow, svgWrap);
    positioner.append(bubble, chat, catWrap);
    root.append(positioner);
    document.body.append(root);

    // Apply settings immediately after injection
    applyCurrentSettings();

    // Watch for sensitive field focus
    document.addEventListener("focusin", (e) => {
      const name = e.target.name?.toLowerCase() || "";
      const id = e.target.id?.toLowerCase() || "";
      const isPassword = e.target.type === "password";
      const isOTP = name.includes("otp") || id.includes("otp") || name.includes("code") || id.includes("code");
      const isPayment = name.includes("card") || id.includes("card") || name.includes("cvv") || id.includes("cvv") || name.includes("iban") || id.includes("iban") || name.includes("bank") || id.includes("bank");

      if (e.target.tagName === "INPUT" && (isPassword || isOTP || isPayment)) {
        const score = riskScore || 0;
        if (score >= 40) {
          if (isPayment) {
            bubble.textContent = score >= 70 ? "⛔ STOP! Don't enter payment details!" : "⚠️ Caution: Suspicious page for payment.";
          } else {
            bubble.textContent = score >= 70 ? "⛔ STOP! High risk! Don't type your password!" : "⚠️ Caution: Suspicious page for a password.";
          }

          bubble.style.borderColor = score >= 70 ? "rgba(239,68,68,.6)" : "rgba(245,158,11,.5)";
          bubble.style.display = "block";
          bubble.style.opacity = "1";

          logFamilySafetyEvent(isPayment ? "payment_input_focus" : "password_input_focus", {
            risk_score: score,
            element_id: id,
            element_name: name
          });

          // Show chat if not open
          if (!chat.classList.contains("open")) {
            setTimeout(() => {
              chat.classList.add("open");
              const typeText = isPayment ? "payment or bank details" : "a password or code";
              const elderlyText = elderlyModeEnabled ? "\n\n👴 Elderly Mode: This page is asking for money. Please ask for help." : "";
              addMsg(`I noticed you're about to enter ${typeText}. My analysis says this page is ${score >= 70 ? "DANGEROUS" : "SUSPICIOUS"}. Please be very careful!${elderlyText}`, "bot");
            }, 500);
          }
        } else {
          logFamilySafetyEvent(isPayment ? "payment_input_focus_low_risk" : "password_input_focus_low_risk", { risk_score: score });
        }
      }
    }, true);

    // ── Physics & drag
    let isDragging = false;
    let hasMoved = false;
    let startX, startY;
    let translateX = 0, translateY = 0;
    let velocityY = 0;
    let physicsReq = null;

    function applyTransform() {
      positioner.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }

    function fallStep() {
      if (isDragging) return;
      velocityY += 1.6;
      translateY += velocityY;
      if (translateY >= 0) {
        translateY = 0;
        velocityY = 0;
        applyTransform();
        catWrap.classList.add("catphis-anim-idle");
        catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        setCatIdle();
      } else {
        applyTransform();
        physicsReq = requestAnimationFrame(fallStep);
      }
    }

    catWrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasMoved = false;
      if (physicsReq) { cancelAnimationFrame(physicsReq); physicsReq = null; }

      catWrap.classList.remove("catphis-anim-idle");
      catWrap.style.width = svgWrap.style.width = DRAG_SIZE;
      setCatDrag();

      // Align mouse to the "scruff" (middle-top) of the newly sized dragged cat
      const rect = catWrap.getBoundingClientRect();
      const grabX = rect.left + rect.width / 2;
      const grabY = rect.top + 20; // 20px down from the very top

      translateX += (e.clientX - grabX);
      translateY += (e.clientY - grabY);

      startX = e.clientX - translateX;
      startY = e.clientY - translateY;

      applyTransform();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const nx = e.clientX - startX;
      const ny = e.clientY - startY;
      if (Math.abs(nx - translateX) > 3 || Math.abs(ny - translateY) > 3) hasMoved = true;
      translateX = nx;
      translateY = ny;
      applyTransform();
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;

      if (translateY < 0) {
        velocityY = 0;
        physicsReq = requestAnimationFrame(fallStep);
        // size restored in fallStep when cat lands
      } else {
        if (translateY > 0) {
          translateY = 0;
          applyTransform();
        }
        catWrap.classList.add("catphis-anim-idle");
        catWrap.style.width = svgWrap.style.width = IDLE_SIZE;
        setCatIdle();
      }
    });

    // Chat toggle on click (only if not dragged)
    catWrap.addEventListener("click", () => {
      if (!hasMoved) {
        chat.classList.toggle("open");
        if (chat.classList.contains("open")) {
          bubble.style.display = "none";
          setTimeout(() => input.focus(), 60);
        }
      }
    });

    // Random idle micro-animations
    function randomAnim() {
      if (!isDragging && translateY === 0) {
        catWrap.style.animation = "catphis-breathe 3.8s ease-in-out infinite";
      }
      setTimeout(randomAnim, 10000 + Math.random() * 10000);
    }
    setTimeout(randomAnim, 7000);

    // Auto-dismiss bubble
    if (bubble.style.display === "block") {
      setTimeout(() => { bubble.style.transition = "opacity .6s"; bubble.style.opacity = "0"; }, 6000);
      setTimeout(() => { bubble.style.display = "none"; bubble.style.opacity = ""; }, 6700);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EMAIL SCANNER
  // ═══════════════════════════════════════════════════════════════════════
  let emailScanTimeout = null;
  let lastScannedEmailFingerprint = null;
  let currentWebmailState = "inbox";
  let lastEmailScanMsg = "";

  function isWebmailPage() {
    const h = window.location.hostname;
    return h.includes("mail.google.com") ||
      h.includes("outlook.live.com") ||
      h.includes("mail.yahoo.com") ||
      document.querySelector('article, [role="main"]') != null;
  }

  function findVisibleEmailContainer() {
    // If Gmail is just showing the inbox list without an email open, abort
    if (window.location.hostname.includes("mail.google.com")) {
      const hash = window.location.hash.split('/')[0];
      if (hash === "#inbox" && window.location.hash.split('/').length === 1) return null;
    }

    const selectors = [
      '.a3s.aiL', // Gmail strict body
      '.ii.gt', // Common Gmail message body
      'div[data-message-id]', // Generic Gmail message
      '[aria-label*="Message body"]', '[role="document"]', 'div[dir="ltr"]', // Outlook
      '[data-test-id="message-view-body"]', '.msg-body', // Yahoo
      'article' // Generic fallback
    ];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      const visibleEls = els.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.height > 20 && rect.width > 50 && rect.top < window.innerHeight && rect.bottom > 0;
      });
      if (visibleEls.length > 0) {
        return visibleEls.reduce((max, el) => el.getBoundingClientRect().height > max.getBoundingClientRect().height ? el : max, visibleEls[0]);
      }
    }

    // Ultimate fallback for Gmail
    if (window.location.hostname.includes("mail.google.com")) {
      const allTextDivs = Array.from(document.querySelectorAll('div[dir="ltr"]'));
      const visibleDivs = allTextDivs.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.height > 10 && rect.width > 50 && rect.top > 0 && rect.bottom < window.innerHeight;
      });
      if (visibleDivs.length > 0) return visibleDivs[visibleDivs.length - 1];
    }

    return null;
  }

  function extractEmailDataFast(container) {
    let bodyText = container.innerText || "";
    if (bodyText.length > 4000) bodyText = bodyText.substring(0, 4000) + "...";

    let subject = document.title || "";
    let sender = "";
    let senderEmail = "";

    const gmailSubject = document.querySelector('h2.hP, .hP, [data-thread-perm-id]');
    if (gmailSubject) subject = gmailSubject.innerText;

    const gmailSender = document.querySelector('[email], [data-hovercard-id], .gD');
    if (gmailSender) {
      senderEmail = gmailSender.getAttribute('email') || gmailSender.getAttribute('data-hovercard-id') || "";
      sender = gmailSender.innerText;
    } else {
      const outlookSubj = document.querySelector('[role="heading"], h1, h2');
      if (outlookSubj) subject = outlookSubj.innerText;

      const possibleEmails = document.querySelectorAll('[title*="@"], span[aria-label*="@"], a[href^="mailto:"]');
      if (possibleEmails.length > 0) {
        const el = possibleEmails[0];
        senderEmail = el.getAttribute('title') || el.getAttribute('aria-label') || (el.href || "").replace('mailto:', '');
        sender = el.innerText || senderEmail;
      }
    }

    const links = [];
    const aTags = Array.from(container.querySelectorAll('a'));
    for (const a of aTags) {
      if (links.length >= 25) break;
      const href = a.href || "";
      const text = (a.innerText || "").trim();
      if (href && !href.startsWith("mailto:") && !href.startsWith("javascript:") && !href.startsWith("chrome-extension:") && !href.startsWith("about:")) {
        if (text && text.length > 1) {
          links.push({ href: href, text: text });
        }
      }
    }

    return {
      page_url: PAGE_URL,
      sender: sender.trim(),
      sender_email: senderEmail.trim(),
      subject: subject.trim(),
      body_text: bodyText.trim(),
      links: links
    };
  }

  function getEmailFingerprint(emailData) {
    const s = emailData.sender_email + "|" + emailData.subject + "|" + emailData.body_text.substring(0, 500) + "|" + emailData.links.map(l => l.href).join(',');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  }

  async function shouldSkipEmailScan(fingerprint, emailData) {
    if (fingerprint === lastScannedEmailFingerprint) return true;
    let data = {};
    try { data = await new Promise(res => chrome.storage.local.get("emailCache", res)); } catch (e) { }
    const cache = data.emailCache || {};
    if (cache[fingerprint]) {
      lastScannedEmailFingerprint = fingerprint;
      const result = cache[fingerprint];
      updateEmailRiskUI(result);
      addEmailScanMessage(result, "cache", emailData);
      return true;
    }
    return false;
  }

  function saveEmailToCache(fingerprint, result) {
    lastScannedEmailFingerprint = fingerprint;
    try {
      chrome.storage.local.get("emailCache", data => {
        const cache = data.emailCache || {};
        cache[fingerprint] = result;
        const keys = Object.keys(cache);
        if (keys.length > 50) delete cache[keys[0]];
        chrome.storage.local.set({ emailCache: cache });
      });
    } catch (e) { }
  }

  function quickLocalEmailPrecheck(emailData) {
    if (emailData.links.length === 0) {
      const urgentWords = ["urgent", "verify", "suspended", "locked", "immediate", "expire", "action required"];
      const credWords = ["password", "login", "sign in", "account", "card", "payment"];
      const bodyL = emailData.body_text.toLowerCase();
      if (!urgentWords.some(w => bodyL.includes(w)) && !credWords.some(w => bodyL.includes(w))) {
        return {
          risk_score: 0, verdict: "Safe", reasons: ["No links and no suspicious keywords found."], dangerous_links: []
        };
      }
    }
    return null;
  }

  function localEmailFallbackAnalysis(emailData) {
    let score = 0;
    let reasons = [];
    let dangerous_links = [];

    const urgentWords = ["urgent", "verify now", "account suspended", "locked", "immediate", "expire", "action required", "limited access", "unusual activity", "password expires", "payment failed"];
    const credWords = ["password", "login", "sign in", "account", "card", "payment", "billing", "bank account"];
    const suspUrls = ["login", "verify", "secure", "account", "update"];
    const shortUrls = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly"];
    const brands = ["paypal", "google", "microsoft", "apple", "facebook", "meta", "instagram", "netflix", "amazon", "dhl", "fedex", "bank"];

    const subj = emailData.subject.toLowerCase();
    const body = emailData.body_text.toLowerCase();
    const sEmail = emailData.sender_email.toLowerCase();
    const sName = emailData.sender.toLowerCase();

    if (urgentWords.some(w => subj.includes(w) || body.includes(w))) {
      score += 25; reasons.push("Urgent or threatening language detected");
    }
    if (credWords.some(w => body.includes(w))) {
      score += 15; reasons.push("Requests credentials or sensitive information");
    }
    if (brands.some(b => sName.includes(b) && !sEmail.includes(b))) {
      score += 30; reasons.push("Sender name mimics a brand but email address does not match");
    }

    // Scam Message rules merged into email
    if (body.match(/gift card|crypto|bitcoin|wire transfer|itunes/)) {
      score += 50; reasons.push("Request for untraceable payment (gift card/crypto)");
    }
    if (body.includes("account is locked") || body.includes("bank account locked")) {
      score += 85; reasons.push("Bank account lock scam");
    }
    if (body.match(/mom|dad|son|daughter|mum/) && body.includes("new number")) {
      score += 80; reasons.push("Family impersonation");
    }
    if (body.includes("send money") || body.includes("lost my phone") || body.includes("transfer needed")) {
      score += 60; reasons.push("Emergency money request");
    }
    if (body.match(/package|delivery|stuck/) && body.match(/fee|pay|customs/)) {
      score += 75; reasons.push("Package delivery scam");
    }
    if (body.includes("won a prize") || body.includes("claim now") || body.includes("lottery")) {
      score += 70; reasons.push("Prize scam");
    }

    emailData.links.forEach(link => {
      const h = link.href.toLowerCase();
      const t = link.text.toLowerCase();

      let looksLikeUrl = t.includes(".") && !t.includes(" ");
      if (looksLikeUrl) {
        let tDomain = t.replace('http://', '').replace('https://', '').split('/')[0];
        let hDomain = h.replace('http://', '').replace('https://', '').split('/')[0];
        if (tDomain && hDomain && tDomain !== hDomain) {
          score += 40; reasons.push("Link text destination mismatch (spoofed link)"); dangerous_links.push(link.href);
        }
      }

      let linkDomain = h.replace('http://', '').replace('https://', '').split('/')[0] || "";

      if (h.startsWith("http") && linkDomain.includes("@")) {
        score += 75; reasons.push("URL obfuscation detected (credentials in link)"); dangerous_links.push(link.href);
      }

      brands.forEach(b => {
        if (linkDomain.includes(b) && linkDomain !== `${b}.com`) {
          score += 40; reasons.push("Link domain mimics a brand"); dangerous_links.push(link.href);
        }
      });

      if (shortUrls.some(s => h.includes(s))) {
        score += 20; reasons.push("Contains shortened URLs"); dangerous_links.push(link.href);
      } else if (suspUrls.some(s => h.includes(s))) {
        score += 15; reasons.push("Suspicious keywords in links"); dangerous_links.push(link.href);
      }
    });

    reasons = [...new Set(reasons)];
    dangerous_links = [...new Set(dangerous_links)];
    score = Math.min(100, score);

    let verdict = "Safe";
    if (score >= 70) verdict = "Phishing";
    else if (score >= 40) verdict = "Suspicious";

    if (reasons.length === 0) reasons.push("Email looks mostly safe");

    return { risk_score: score, verdict, reasons, dangerous_links };
  }

  async function analyzeEmailWithTimeout(emailData) {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetch-email", payload: emailData }, resolve);
      });
      if (response && response.data && !response.error) {
        return response.data;
      }
    } catch (e) { }
    return null;
  }

  function updateEmailRiskUI(result, isLoading = false) {
    if (window.__catphisUpdateVisuals) {
      window.__catphisUpdateVisuals(result ? result.risk_score : 0, isLoading);
    }
  }

  function addEmailScanMessage(result, source, emailData) {
    if (!window.__catphisAddMsg) return;
    let msg = "";

    const isElderly = elderlyModeEnabled;

    if (emailData && emailData.subject && !isElderly) {
      msg += `[Scanning: "${emailData.subject.substring(0, 30)}..."]\n`;
    }

    if (source === "local_fallback" && !isElderly) {
      msg += "I did a quick local scan first. I’ll update if deeper analysis finds more.\n";
    }

    const sensitive = detectSensitiveRequests();
    if (sensitive.isSensitive && result.risk_score >= 40) {
      msg += "⚠️ **Warning:** This email is asking for sensitive information (password/OTP/PIN). Given the risk score, do NOT enter any details.\n";
      logFamilySafetyEvent("sensitive_email_detected", { risk_score: result.risk_score, keywords: sensitive.foundKeywords });
    }

    if (isElderly) {
      // Simple plain-language messages for elderly mode
      if (result.risk_score < 40) {
        msg = "✅ This email looks safe. I did not find anything worrying. But still be careful before clicking links.";
      } else if (result.risk_score < 70) {
        const topReason = simplifyForElderly(result.reasons[0] || "");
        msg = `⚠️ Something looks a bit wrong with this email.\n${topReason}\n\nPlease ask a family member before clicking anything.`;
      } else {
        const topReason = simplifyForElderly(result.reasons[0] || "");
        msg = `⛔ STOP! This email may be dangerous!\n${topReason}\n\nDo NOT click any links or type your password. Ask a family member for help.`;
      }
    } else {
      if (result.risk_score < 40) {
        msg += "This email looks mostly safe. I did not find strong phishing signals, but still check links before clicking. ✅";
      } else if (result.risk_score < 70) {
        msg += `This email looks suspicious. I found signs like: ${result.reasons.slice(0, 2).join(', ')}. Be careful before clicking links. ⚠️`;
      } else {
        msg += `This email looks dangerous. I found signs like: ${result.reasons.slice(0, 2).join(', ')}. Do not click links or enter passwords. 🚫`;
      }
    }

    // Don't repeat the exact same message for the same email
    let shouldAddChatMsg = (msg !== lastEmailScanMsg);

    if (shouldAddChatMsg) {
      lastEmailScanMsg = msg;
      window.__catphisAddMsg(msg, "bot");
    }

    const chat = document.querySelector('.catphis-chat');
    const bubble = document.querySelector('.catphis-bubble');
    if (chat && !chat.classList.contains("open") && bubble) {
      if (isElderly) {
        bubble.textContent = result.risk_score >= 70 ? "🛑 DANGER: Dangerous email!" : (result.risk_score >= 40 ? "⚠️ WARNING: Check this email!" : "✅ Email looks safe");
        bubble.style.fontSize = "15px";
        bubble.style.fontWeight = "700";
      } else {
        bubble.textContent = result.risk_score >= 70 ? "⛔ Dangerous email detected!" : "⚠️ Suspicious email detected!";
        if (result.risk_score < 40) bubble.textContent = "✅ Email scanned: Looks safe.";
      }
      bubble.style.borderColor = result.risk_score >= 70 ? "rgba(239,68,68,.6)" : (result.risk_score >= 40 ? "rgba(245,158,11,.5)" : "rgba(16,185,129,.5)");
      bubble.style.display = "block";
      setTimeout(() => { bubble.style.transition = "opacity .6s"; bubble.style.opacity = "0"; }, isElderly ? 12000 : 6000);
      setTimeout(() => { bubble.style.display = "none"; bubble.style.opacity = ""; }, isElderly ? 12700 : 6700);
    }
  }

  window.__catphisForceScanEmail = () => {
    lastScannedEmailFingerprint = null;
    scheduleEmailScan("manual");
  };

  async function performEmailScan(reason) {
    const container = findVisibleEmailContainer();
    if (!container) {
      if (currentWebmailState === "email") {
        // We just left an email and went back to inbox. Reset UI.
        currentWebmailState = "inbox";
        lastScannedEmailFingerprint = null;
        if (window.__catphisPageRiskResult) {
          updateEmailRiskUI(window.__catphisPageRiskResult);
        }
      }
      if (reason === "manual" && window.__catphisAddMsg) window.__catphisAddMsg("I couldn't find an open email to scan. Please open one first!", "bot");
      return;
    }

    currentWebmailState = "email";
    const emailData = extractEmailDataFast(container);
    if ((!emailData.body_text || emailData.body_text.length < 10) && emailData.links.length === 0) return;

    const fingerprint = getEmailFingerprint(emailData);
    if (reason !== "manual" && await shouldSkipEmailScan(fingerprint, emailData)) return;

    if (reason === "manual" && window.__catphisAddMsg) window.__catphisAddMsg("Scanning email...", "bot");
    updateEmailRiskUI(null, true);

    let result = quickLocalEmailPrecheck(emailData);
    let source = "local_precheck";

    if (!result) {
      result = await analyzeEmailWithTimeout(emailData);
      source = "backend";
      if (!result) {
        result = localEmailFallbackAnalysis(emailData);
        source = "local_fallback";
      }
    }

    saveEmailToCache(fingerprint, result);
    updateEmailRiskUI(result);
    addEmailScanMessage(result, source, emailData);

    // Log to Family Safety Dashboard
    saveFamilySafetyEvent({
      type: "email",
      risk_score: result.risk_score,
      verdict: result.verdict,
      title: emailData.subject ? `Email: ${emailData.subject.substring(0, 60)}` : "Email scan",
      url: window.location.href,
      reasons: result.reasons || [],
      advice: result.risk_score >= 70
        ? "Do not click links or reply to this email."
        : result.risk_score >= 40
          ? "Be cautious about clicking links in this email."
          : "Email looks safe."
    });
  }

  function scheduleEmailScan(reason) {
    if (reason === "manual" || reason === "navigation") {
      setTimeout(() => performEmailScan(reason), 600);
    } else if (window.requestIdleCallback) {
      window.requestIdleCallback(() => performEmailScan(reason), { timeout: 1000 });
    } else {
      setTimeout(() => performEmailScan(reason), 600);
    }
  }

  function startEmailWatcher() {
    scheduleEmailScan("init");

    // Watch DOM mutations
    const observer = new MutationObserver(() => {
      if (emailScanTimeout) clearTimeout(emailScanTimeout);
      emailScanTimeout = setTimeout(() => scheduleEmailScan("mutation"), 300);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Watch SPA navigation (e.g. Gmail changing hash from #inbox to #inbox/1234)
    window.addEventListener("hashchange", () => {
      lastScannedEmailFingerprint = null; // Force check
      scheduleEmailScan("navigation");
    });
    window.addEventListener("popstate", () => {
      lastScannedEmailFingerprint = null;
      scheduleEmailScan("navigation");
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHAT SCANNER (WhatsApp, Discord, Messenger, etc.)
  // ═══════════════════════════════════════════════════════════════════════

  let chatScanTimeout = null;
  let lastScannedChatFingerprint = null;
  let lastChatScanMsg = "";

  function isChatPage() {
    const h = window.location.hostname;
    return h.includes("web.whatsapp.com") ||
      h.includes("discord.com") ||
      h.includes("messenger.com") ||
      h.includes("instagram.com/direct");
  }

  function extractChatDataFast() {
    let messages = [];
    const h = window.location.hostname;

    if (h.includes("web.whatsapp.com")) {
      const chatPanel = document.querySelector('#main') || document.querySelector('div[role="main"]');
      if (chatPanel) {
        const nodes = chatPanel.querySelectorAll('span[dir="ltr"].selectable-text, span.selectable-text');
        if (nodes.length > 0) {
          messages = Array.from(nodes).map(n => n.innerText);
        } else {
          messages = [chatPanel.innerText];
        }
      }
    } else if (h.includes("discord.com")) {
      const nodes = document.querySelectorAll('li[class^="messageListItem"] div[id^="message-content"]');
      messages = Array.from(nodes).map(n => n.innerText);
    } else if (h.includes("messenger.com")) {
      const nodes = document.querySelectorAll('[dir="auto"]');
      messages = Array.from(nodes).map(n => n.innerText);
    } else {
      const text = extractPageText();
      messages = [text.substring(text.length - 1000)];
    }

    // Return last 5 messages
    return messages.slice(-5).join("\n").trim();
  }

  async function performChatScan() {
    const chatText = extractChatDataFast();
    if (!chatText || chatText.length < 10) return;

    let hash = 0;
    for (let i = 0; i < chatText.length; i++) {
      hash = ((hash << 5) - hash) + chatText.charCodeAt(i);
      hash |= 0;
    }
    const fingerprint = hash.toString();

    if (fingerprint === lastScannedChatFingerprint) return;
    lastScannedChatFingerprint = fingerprint;

    const payload = {
      message_text: chatText,
      page_url: PAGE_URL,
      source: "auto_chat_scan"
    };

    let result = null;
    let source = "backend";

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetch-message", payload: payload }, resolve);
      });
      if (response && response.data && !response.error) {
        result = response.data;
      } else {
        throw new Error("Backend offline");
      }
    } catch (err) {
      result = fallbackScamAnalysis(chatText);
      source = "local_fallback";
    }

    if (result.risk_score >= 40) {
      updateEmailRiskUI(result);
      addChatScanMessage(result, source);
    } else {
      const glow = document.querySelector('.catphis-glow');
      if (glow && (glow.classList.contains('danger') || glow.classList.contains('warn'))) {
        updateEmailRiskUI(result);
        const bubble = document.querySelector('.catphis-bubble');
        if (bubble) bubble.style.display = "none";
      }
    }

    // Always log to Family Safety Dashboard
    saveFamilySafetyEvent({
      type: "message",
      risk_score: result.risk_score,
      verdict: result.verdict,
      title: `Chat scan on ${window.location.hostname}`,
      url: window.location.href,
      reasons: result.reasons || [],
      advice: result.risk_score >= 70
        ? "Do not send money or click links. Verify the person through another channel."
        : result.risk_score >= 40
          ? "Verify the person's identity before acting on this message."
          : "Messages look safe."
    });
  }

  function scheduleChatScan() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(performChatScan, { timeout: 1000 });
    } else {
      setTimeout(performChatScan, 500);
    }
  }

  function startChatWatcher() {
    scheduleChatScan();

    const observer = new MutationObserver(() => {
      if (chatScanTimeout) clearTimeout(chatScanTimeout);
      chatScanTimeout = setTimeout(scheduleChatScan, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener("hashchange", () => {
      lastScannedChatFingerprint = null;
      scheduleChatScan();
    });
    window.addEventListener("popstate", () => {
      lastScannedChatFingerprint = null;
      scheduleChatScan();
    });
  }

  function addChatScanMessage(result, source) {
    if (!window.__catphisAddMsg) return;
    let msg = "";

    if (source === "local_fallback") {
      msg += "I did a quick local scan of new messages.\n";
    }
    if (result.risk_score >= 70) {
      msg += `⚠️ Scam warning! I noticed a dangerous message in this chat: ${result.reasons.slice(0, 2).join(', ')}. DO NOT send money or click links!`;
    } else {
      msg += `Suspicious message detected: ${result.reasons.slice(0, 2).join(', ')}. Please verify the person's identity before acting.`;
    }

    if (msg !== lastChatScanMsg) {
      lastChatScanMsg = msg;
      window.__catphisAddMsg(msg, "bot");
    }

    const chat = document.querySelector('.catphis-chat');
    const bubble = document.querySelector('.catphis-bubble');
    if (chat && !chat.classList.contains("open") && bubble) {
      bubble.textContent = result.risk_score >= 70 ? "⛔ Scam message detected!" : "⚠️ Suspicious message detected!";
      bubble.style.borderColor = result.risk_score >= 70 ? "rgba(239,68,68,.6)" : "rgba(245,158,11,.5)";
      bubble.style.display = "block";
      setTimeout(() => { bubble.style.transition = "opacity .6s"; bubble.style.opacity = "0"; }, 6000);
      setTimeout(() => { bubble.style.display = "none"; bubble.style.opacity = ""; }, 6700);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════════════════════

  async function run() {
    await loadHistory();
    const payload = {
      url: PAGE_URL,
      page_title: document.title || "",
      page_text: extractPageText(),
      forms: extractForms(),
    };

    // Show cat immediately — no score yet
    injectMascot(null, null);

    try {
      const result = await analyzeWithBackend(payload);
      const score = result?.risk_score ?? 0;
      const verdict = result?.verdict ?? (result ? "Safe" : "Backend Offline");

      if (!result) { saveResult(null, false); }
      else {
        saveResult(result, true);
        // Log to Family Safety Dashboard
        saveFamilySafetyEvent({
          type: "website",
          risk_score: result.risk_score,
          verdict: result.verdict,
          title: document.title || window.location.hostname,
          url: window.location.href,
          reasons: result.reasons || [],
          advice: result.risk_score >= 70
            ? "Do not enter passwords or payment details on this page."
            : result.risk_score >= 40
              ? "Be cautious on this page."
              : "Page looks safe."
        });
      }

      // Re-inject with glow + bubble
      const root = document.getElementById(ROOT_ID);
      if (root) {
        root.remove();
        window.__catphisRan = false;
        window.__catphisRan = true;
        window.__catphisPageRiskResult = result || { risk_score: 0, verdict: "Offline" };
        injectMascot(score, verdict);
      }

      // Start Email Watcher if we are on a webmail page
      if (isWebmailPage()) {
        startEmailWatcher();
      }

      // Start Chat Watcher if we are on a chat page
      if (isChatPage()) {
        startChatWatcher();
      }

      // Check for password fields immediately
      const sensitive = detectSensitiveRequests();
      if (sensitive.hasPasswordInput) {
        logFamilySafetyEvent("password_field_on_load", { risk_score: score });
        if (score >= 40) {
          setTimeout(() => {
            const chat = document.querySelector('.catphis-chat');
            if (chat && !chat.classList.contains("open")) {
              chat.classList.add("open");
              const warningMsg = score >= 70
                ? "🚨 I found a password field on this dangerous page! Do NOT type your password here."
                : "⚠️ Be careful, there's a login form here and I've flagged this page as suspicious.";
              window.__catphisAddMsg?.(warningMsg, "bot");
            }
          }, 1500);
        }
      }
    } catch (err) {
      console.error("[CatPhis] Error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, 500);
  }

})();
