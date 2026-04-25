import os
import json
import urllib.request
import pickle
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import openai
except ImportError:
    openai = None

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
    risk_score: int
    verdict: str
    reasons: list[str]

class ChatMessage(BaseModel):
    role: str
    content: str

class AnalysisData(BaseModel):
    risk_score: int
    verdict: str
    reasons: list[str] = []

class PageContextData(BaseModel):
    url: str
    hostname: str = ""
    title: str = ""
    page_text_sample: str = ""
    hasPasswordForm: bool = False
    formActions: list[str] = []

class ChatRequest(BaseModel):
    message: str
    conversation_history: list[ChatMessage] = []
    analysis: AnalysisData
    page_context: PageContextData

class ChatResponse(BaseModel):
    reply: str

class MessageRequest(BaseModel):
    message_text: str
    page_url: str = ""
    source: str = ""

class MessageAnalysisResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: list[str]
    advice: str



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
    
    # Calculate risk_score (0-100) for the extension compatibility
    risk_score = int(final_score * 100)

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
        risk_score=risk_score,
        verdict=verdict,
        reasons=reasons,
    )

# ── POST /analyze-url ─────────────────────────────────────────────────────────
# This endpoint is required by the extension's background.js and popup.js
@app.post("/analyze-url", response_model=AnalysisResponse)
def analyze_url(request: URLRequest):
    return analyze(request)

# ── POST /chat ────────────────────────────────────────────────────────────────
def build_system_prompt() -> str:
    return (
        "You are CatPhish, a friendly, cute, clear, and highly useful cybersecurity assistant. "
        "Your role is to evaluate websites for phishing risks and guide the user securely.\n\n"
        "Rules:\n"
        "1. Never say a site is 100% safe. There is always a risk online.\n"
        "2. Keep answers short but highly useful.\n"
        "3. Use a friendly, cute tone occasionally (meow, purr, paws).\n"
        "4. If a site is suspicious or phishing, clearly warn the user:\n"
        "   - Do NOT enter passwords.\n"
        "   - Do NOT enter card details.\n"
        "   - Do NOT download files.\n"
        "   - Advise them to manually type the official website URL in their browser instead of clicking links.\n"
        "5. If the user asks broad cybersecurity questions, answer them.\n"
        "6. If the user asks about the current page, answer using the provided analysis and page context.\n"
        "7. If the user asks unrelated questions, gently redirect to website safety and phishing help."
    )

def build_llm_messages(request: ChatRequest) -> list:
    messages = [{"role": "system", "content": build_system_prompt()}]
    
    # Add conversation history
    for msg in request.conversation_history:
        # Only allow 'user' and 'assistant' roles for safety
        if msg.role in ["user", "assistant"]:
            messages.append({"role": msg.role, "content": msg.content})
    
    # Build the final user message with context
    user_context = (
        f"--- CURRENT PAGE CONTEXT ---\n"
        f"URL: {request.page_context.url}\n"
        f"Hostname: {request.page_context.hostname}\n"
        f"Title: {request.page_context.title}\n"
        f"Has Password Form: {request.page_context.hasPasswordForm}\n"
        f"Form Actions: {request.page_context.formActions}\n"
        f"Page Text Sample: {request.page_context.page_text_sample[:500]}\n"
        f"\n--- AI ANALYSIS ---\n"
        f"Risk Score: {request.analysis.risk_score}/100\n"
        f"Verdict: {request.analysis.verdict}\n"
        f"Reasons: {', '.join(request.analysis.reasons)}\n"
        f"\n--- USER MESSAGE ---\n"
        f"{request.message}"
    )
    
    messages.append({"role": "user", "content": user_context})
    return messages

def fallback_chat_response(request: ChatRequest) -> str:
    msg_lower = request.message.lower()
    is_suspicious = request.analysis.risk_score >= 40 or request.analysis.verdict.lower() in ["suspicious", "likely phishing", "phishing"]
    
    if "password" in msg_lower or "login" in msg_lower or request.page_context.hasPasswordForm:
        if is_suspicious:
            return "Meow! This page looks highly dangerous. Please do NOT enter your passwords or card details, and do not download anything. It's safest to manually type the official URL in your browser."
        else:
            return "Purr... Even though this page doesn't look highly suspicious right now, I can never guarantee it's 100% safe. Always be careful before typing your password!"
    else:
        if is_suspicious:
            return "Paws! This page has some risky signs. Be very careful, don't share any personal info, and manually type the official website URL if you need to access it."
        else:
            return "Meow! This page seems okay at a glance, but remember, no page is 100% safe. Stay alert!"

@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    api_key = os.environ.get("OPENAI_API_KEY")
    
    if api_key and openai:
        try:
            client = openai.OpenAI(api_key=api_key)
            messages = build_llm_messages(request)
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=250,
                temperature=0.7
            )
            reply = response.choices[0].message.content
            return ChatResponse(reply=reply.strip())
        except Exception as e:
            print(f"OpenAI API error: {e}")
            # Fallback to rule-based if API fails
            pass

    # Rule-based fallback
    reply = fallback_chat_response(request)
    return ChatResponse(reply=reply)


# ── Scam Message Detector ─────────────────────────────────────────────────────

def analyze_scam_message_local(text: str) -> MessageAnalysisResponse:
    text_lower = text.lower()
    score = 0
    reasons = []

    # Detect family impersonation
    if any(word in text_lower for word in ["mom", "dad", "son", "daughter", "mum"]) and "new number" in text_lower:
        score += 80
        reasons.append("Family impersonation (Hi mom/dad, new number)")

    # Emergency money
    if any(phrase in text_lower for phrase in ["send money", "lost my phone", "broken phone", "transfer needed"]):
        score += 60
        reasons.append("Emergency money request")

    # Package delivery scam
    if any(word in text_lower for word in ["package", "delivery", "stuck"]) and any(word in text_lower for word in ["fee", "pay", "customs"]):
        score += 75
        reasons.append("Package delivery scam")

    # Prize/reward
    if any(word in text_lower for word in ["won a prize", "claim now", "reward", "lottery"]):
        score += 70
        reasons.append("Prize or reward scam")

    # Bank account
    if "account is locked" in text_lower or "bank account locked" in text_lower:
        score += 85
        reasons.append("Bank account lock scam")

    # Gift card / crypto
    if any(word in text_lower for word in ["gift card", "crypto", "bitcoin", "wire transfer"]):
        score += 50
        reasons.append("Request for untraceable payment (gift card/crypto)")

    # Urgent language
    if any(word in text_lower for word in ["urgent", "immediately", "asap", "act now"]):
        score += 20
        reasons.append("Urgent pressure language")

    score = min(100, score)

    if score >= 70:
        verdict = "Scam"
        advice = "This looks like a known scam. Do not reply or send money. Contact the person on their known original number."
    elif score >= 40:
        verdict = "Suspicious"
        advice = "This message contains suspicious language. Verify the sender's identity through another channel before acting."
    else:
        verdict = "Safe"
        advice = "This message doesn't trigger our basic scam filters, but always stay alert."

    return MessageAnalysisResponse(
        risk_score=score,
        verdict=verdict,
        reasons=reasons,
        advice=advice
    )

@app.post("/analyze-message", response_model=MessageAnalysisResponse)
def analyze_message(request: MessageRequest):
    api_key = os.environ.get("OPENAI_API_KEY")
    
    if api_key and openai:
        try:
            client = openai.OpenAI(api_key=api_key)
            prompt = (
                "Analyze the following message for scams. Look for family impersonation (e.g., 'Hi mom, new number'), "
                "emergency money requests, package delivery scams, prize scams, bank account locks, or requests for gift cards/crypto.\n"
                "Also check for urgent pressure language.\n\n"
                f"Message: {request.message_text}\n"
                f"Source context: {request.source}\n"
                f"Page URL: {request.page_url}\n\n"
                "Return exactly a JSON object with this schema: {\"risk_score\": int (0-100), \"verdict\": \"Safe\" | \"Suspicious\" | \"Scam\", \"reasons\": [string], \"advice\": string}"
            )
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": "You are a cybersecurity assistant. Only return valid JSON."},
                          {"role": "user", "content": prompt}],
                max_tokens=250,
                temperature=0.0,
                response_format={ "type": "json_object" }
            )
            data = json.loads(response.choices[0].message.content)
            return MessageAnalysisResponse(**data)
        except Exception as e:
            print(f"OpenAI API error for message analysis: {e}")
            pass

    # Local fallback
    return analyze_scam_message_local(request.message_text)


# ── GET / (health check) ──────────────────────────────────────────────────────
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Anti-Phishing API is running"}
