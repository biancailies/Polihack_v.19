// PhishFox — content.js
// Runs at document_idle. Extracts DOM context, sends to backend,
// and injects a warning overlay if the page looks risky.

(function () {
  "use strict";

  // ── Guard: skip internal pages and avoid double-injection ─────────────────

  const PAGE_URL = window.location.href;

  if (
    window.__phishfoxRan ||
    !PAGE_URL ||
    PAGE_URL.startsWith("chrome://")           ||
    PAGE_URL.startsWith("chrome-extension://") ||
    PAGE_URL.startsWith("edge://")             ||
    PAGE_URL.startsWith("about:")              ||
    PAGE_URL.startsWith("http://localhost")    ||
    PAGE_URL.startsWith("https://localhost")
  ) {
    return;
  }

  window.__phishfoxRan = true;

  // ── Constants ─────────────────────────────────────────────────────────────

  const BACKEND          = "http://localhost:8000";
  const OVERLAY_THRESHOLD = 70;   // show warning overlay at this score
  const TEXT_LIMIT        = 5000; // max characters of page text to send
  const OVERLAY_ID        = "__phishfox_overlay__";
  const STYLES_ID         = "__phishfox_styles__";

  // ── 1. Extract visible page text ──────────────────────────────────────────

  function extractPageText() {
    if (!document.body) return "";
    // innerText respects CSS visibility and collapses whitespace naturally
    return (document.body.innerText || "").trim().slice(0, TEXT_LIMIT);
  }

  // ── 2 & 3 & 4. Extract form data ─────────────────────────────────────────

  function extractForms() {
    const forms = [];

    document.querySelectorAll("form").forEach((form) => {
      const inputs     = Array.from(form.querySelectorAll("input"));
      const inputTypes = inputs.map((el) => (el.type || "text").toLowerCase());
      const hasPassword = inputTypes.includes("password");

      forms.push({
        action:      form.action  || "",
        method:      (form.method || "get").toLowerCase(),
        hasPassword,
        inputTypes,
      });
    });

    return forms;
  }

  // ── 5. Send data to backend ───────────────────────────────────────────────

  async function analyzeWithBackend(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${BACKEND}/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });

      if (!response.ok) {
        console.warn(`[PhishFox] /analyze returned HTTP ${response.status}`);
        return null;
      }

      return await response.json(); // { risk_score, verdict, reasons }
    } catch (err) {
      console.warn("[PhishFox] /analyze unreachable:", err.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 7. Save result to storage ─────────────────────────────────────────────

  function saveResult(result, backendOnline) {
    chrome.storage.local.set({
      lastDomAnalysis: {
        url:          PAGE_URL,
        risk_score:   result?.risk_score  ?? 0,
        verdict:      result?.verdict     ?? (backendOnline ? "Unknown" : "Backend Offline"),
        reasons:      result?.reasons     || [],
        analyzedAt:   Date.now(),
        backendOnline,
      },
    });
  }

  // ── 8 & 9 & 10. Overlay ───────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = `
      @keyframes __pf_in__ {
        from { opacity:0; transform:translateX(24px) scale(.96); }
        to   { opacity:1; transform:translateX(0) scale(1); }
      }
      @keyframes __pf_bob__ {
        0%,100%{ transform:translateY(0); }
        50%    { transform:translateY(-4px); }
      }
      @keyframes __pf_bar__ {
        from { width:0%; }
      }
      #${OVERLAY_ID} {
        all:initial;
        position:fixed;
        bottom:20px;
        right:20px;
        z-index:2147483647;
        width:330px;
        background:linear-gradient(160deg,#12151f 0%,#0e1018 100%);
        border:1px solid rgba(239,68,68,.5);
        border-radius:16px;
        padding:0;
        overflow:hidden;
        box-shadow:0 12px 40px rgba(0,0,0,.8), 0 0 0 1px rgba(239,68,68,.08);
        font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;
        font-size:13px;
        color:#e8eaf0;
        line-height:1.5;
        animation:__pf_in__ .35s cubic-bezier(.4,0,.2,1) both;
        box-sizing:border-box;
      }
      #${OVERLAY_ID} * { box-sizing:border-box; }

      /* Red accent bar at top */
      #${OVERLAY_ID} .__pf_topbar__ {
        height:3px;
        background:linear-gradient(90deg,#b91c1c,#ef4444,#f87171);
        animation:__pf_bar__ .6s .35s cubic-bezier(.4,0,.2,1) both;
      }

      #${OVERLAY_ID} .__pf_body__ {
        padding:14px 15px 15px;
      }

      #${OVERLAY_ID} .__pf_header__ {
        display:flex;align-items:flex-start;gap:11px;margin-bottom:11px;
      }

      #${OVERLAY_ID} .__pf_fox__ {
        font-size:30px;line-height:1;flex-shrink:0;
        animation:__pf_bob__ 2.5s ease-in-out infinite;
        display:block;
      }

      #${OVERLAY_ID} .__pf_title__ {
        font-size:13px;font-weight:800;color:#ff6b6b;margin-bottom:4px;letter-spacing:-.1px;
      }

      #${OVERLAY_ID} .__pf_chips__ {
        display:flex;gap:5px;flex-wrap:wrap;
      }

      #${OVERLAY_ID} .__pf_chip__ {
        display:inline-block;font-size:11px;font-weight:700;
        padding:2px 8px;border-radius:100px;
      }

      #${OVERLAY_ID} .__pf_chip_score__ {
        background:rgba(239,68,68,.15);color:#ff7070;border:1px solid rgba(239,68,68,.3);
      }

      #${OVERLAY_ID} .__pf_chip_verdict__ {
        background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25);
      }

      #${OVERLAY_ID} .__pf_reasons__ {
        list-style:none;margin:10px 0 0;padding:0;
        display:flex;flex-direction:column;gap:4px;
      }

      #${OVERLAY_ID} .__pf_reasons__ li {
        font-size:11.5px;color:#7c859c;padding:5px 10px;
        background:rgba(239,68,68,.06);
        border-left:2px solid #ef4444;border-radius:0 5px 5px 0;
        line-height:1.4;
      }

      #${OVERLAY_ID} .__pf_footer__ {
        display:flex;align-items:center;justify-content:space-between;
        margin-top:12px;padding-top:10px;
        border-top:1px solid rgba(255,255,255,.06);
      }

      #${OVERLAY_ID} .__pf_brand__ {
        font-size:10px;color:#3d4459;font-weight:600;
      }

      #${OVERLAY_ID} .__pf_close__ {
        all:unset;cursor:pointer;font-size:14px;
        color:#3d4459;line-height:1;padding:3px 5px;border-radius:4px;
        transition:color .15s,background .15s;
      }

      #${OVERLAY_ID} .__pf_close__:hover {
        color:#e8eaf0;background:rgba(255,255,255,.06);
      }
    `;
    document.head.appendChild(style);
  }

  function showOverlay(result) {
    if (document.getElementById(OVERLAY_ID)) return;
    injectStyles();

    const { risk_score, verdict, reasons = [] } = result;
    const topReasons = reasons.slice(0, 3);

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-label", "PhishFox security warning");

    // Red top bar
    const topBar = document.createElement("div");
    topBar.className = "__pf_topbar__";

    // Body
    const body = document.createElement("div");
    body.className = "__pf_body__";

    // Header
    const header = document.createElement("div");
    header.className = "__pf_header__";

    const fox = document.createElement("span");
    fox.className = "__pf_fox__";
    fox.textContent = "🦊";

    const info = document.createElement("div");
    info.style.flex = "1";

    const title = document.createElement("div");
    title.className = "__pf_title__";
    title.textContent = "⚠️ Suspicious Page Detected";

    const chips = document.createElement("div");
    chips.className = "__pf_chips__";

    const scoreChip = document.createElement("span");
    scoreChip.className = "__pf_chip__ __pf_chip_score__";
    scoreChip.textContent = `Score: ${risk_score}/100`;

    const verdictChip = document.createElement("span");
    verdictChip.className = "__pf_chip__ __pf_chip_verdict__";
    verdictChip.textContent = verdict || "Suspicious";

    chips.appendChild(scoreChip);
    chips.appendChild(verdictChip);
    info.appendChild(title);
    info.appendChild(chips);
    header.appendChild(fox);
    header.appendChild(info);

    // Reasons
    const ul = document.createElement("ul");
    ul.className = "__pf_reasons__";
    topReasons.forEach(r => {
      const li = document.createElement("li");
      li.textContent = String(r);
      ul.appendChild(li);
    });

    // Footer
    const footer = document.createElement("div");
    footer.className = "__pf_footer__";

    const brand = document.createElement("span");
    brand.className = "__pf_brand__";
    brand.textContent = "🦊 PhishFox AI";

    const closeBtn = document.createElement("button");
    closeBtn.className = "__pf_close__";
    closeBtn.textContent = "✕ Dismiss";
    closeBtn.setAttribute("aria-label", "Dismiss PhishFox warning");
    closeBtn.addEventListener("click", () => {
      overlay.remove();
      document.getElementById(STYLES_ID)?.remove();
    });

    footer.appendChild(brand);
    footer.appendChild(closeBtn);

    body.appendChild(header);
    if (topReasons.length > 0) body.appendChild(ul);
    body.appendChild(footer);
    overlay.appendChild(topBar);
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    // Auto-dismiss after 15 s
    setTimeout(() => {
      overlay.remove();
      document.getElementById(STYLES_ID)?.remove();
    }, 15_000);
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  async function run() {
    const payload = {
      url:        PAGE_URL,
      page_title: document.title || "",
      page_text:  extractPageText(),
      forms:      extractForms(),
    };

    console.log(`[PhishFox] DOM analysis for: ${PAGE_URL}`);

    try {
      const result = await analyzeWithBackend(payload);

      if (!result) {
        // Backend offline — save error stub, do not overlay
        saveResult(null, false);
        console.warn("[PhishFox] Backend offline — DOM analysis skipped.");
        return;
      }

      // 7. Save to storage
      saveResult(result, true);

      console.log(
        `[PhishFox] DOM result — score: ${result.risk_score}, verdict: ${result.verdict}`
      );

      // 8. Show overlay when risk is high enough
      if (result.risk_score >= OVERLAY_THRESHOLD) {
        showOverlay(result);
      }
    } catch (err) {
      // Catch-all so content.js never throws an uncaught error on the host page
      console.error("[PhishFox] Unexpected error in content.js:", err);
    }
  }

  run();
})();
