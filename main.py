import pickle
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Anti-Phishing Assistant",
    description="Analyzes URLs for phishing using ML + rule-based scoring.",
    version="1.0.0",
)

# Allow requests from any frontend (e.g. React, plain HTML)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load model once at startup ────────────────────────────────────────────────
with open("model.pkl", "rb") as f:
    model = pickle.load(f)

# ── Constants ─────────────────────────────────────────────────────────────────
SUSPICIOUS_KEYWORDS = [
    "login", "verify", "secure", "update", "account",
    "password", "bank", "confirm", "billing", "support",
]

# ── Request / Response schemas ────────────────────────────────────────────────
class URLRequest(BaseModel):
    url: str

class AnalysisResponse(BaseModel):
    url: str
    ml_score: float
    rule_score: float
    final_score: float
    verdict: str
    reasons: list[str]


# ── Helper: extract ML features ───────────────────────────────────────────────
def extract_features(url: str) -> pd.DataFrame:
    url_lower = url.lower()
    return pd.DataFrame([{
        "url_length":               len(url),
        "num_dots":                 url.count("."),
        "num_digits":               sum(ch.isdigit() for ch in url),
        "has_https":                1 if url.startswith("https://") else 0,
        "has_suspicious_keywords":  int(any(kw in url_lower for kw in SUSPICIOUS_KEYWORDS)),
    }])


# ── Helper: rule-based scoring ────────────────────────────────────────────────
def rule_based_score(url: str) -> tuple[float, list[str]]:
    """
    Returns (score, reasons) where score is the sum of triggered rule weights.
    """
    url_lower = url.lower()
    score   = 0.0
    reasons = []

    if not url.startswith("https://"):
        score += 0.20
        reasons.append("Does not use HTTPS")

    if any(kw in url_lower for kw in SUSPICIOUS_KEYWORDS):
        score += 0.20
        reasons.append("Contains suspicious keywords (login, verify, secure…)")

    if url.count(".") > 3:
        score += 0.15
        reasons.append("Unusually high number of dots (possible subdomain abuse)")

    if len(url) > 40:
        score += 0.10
        reasons.append("URL is abnormally long")

    if any(ch.isdigit() for ch in url):
        score += 0.10
        reasons.append("URL contains digits (possible character substitution)")

    return score, reasons


# ── POST /analyze ─────────────────────────────────────────────────────────────
@app.post("/analyze", response_model=AnalysisResponse)
def analyze(request: URLRequest):
    url = request.url.strip()

    # 1. ML score
    features = extract_features(url)
    ml_score = float(model.predict_proba(features)[0][1])

    # 2. Rule-based score
    rule_score, reasons = rule_based_score(url)

    # 3. Combined final score (clamped to [0, 1])
    final_score = 0.7 * ml_score + 0.3 * rule_score
    final_score = max(0.0, min(1.0, final_score))

    # 4. Verdict
    if final_score >= 0.7:
        verdict = "Likely phishing"
    elif final_score >= 0.4:
        verdict = "Suspicious"
    else:
        verdict = "Safe"

    # 5. If nothing triggered, explain why it looks safe
    if not reasons:
        reasons.append("No suspicious signals detected")

    return AnalysisResponse(
        url=url,
        ml_score=round(ml_score, 4),
        rule_score=round(rule_score, 4),
        final_score=round(final_score, 4),
        verdict=verdict,
        reasons=reasons,
    )


# ── GET / (health check) ──────────────────────────────────────────────────────
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Anti-Phishing API is running"}
