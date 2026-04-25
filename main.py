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

class EmailLink(BaseModel):
    text: str
    href: str

class EmailRequest(BaseModel):
    page_url: str
    sender: str
    sender_email: str
    subject: str
    body_text: str
    links: list[EmailLink] = []

class EmailAnalysisResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: list[str]
    dangerous_links: list[str]
class MessageRequest(BaseModel):
    message_text: str
    page_url: str = ""
    source: str = ""

class MessageAnalysisResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: list[str]
    advice: str

class LinkInfo(BaseModel):
    text: str
    href: str

class FormInfo(BaseModel):
    action: str
    method: str
    hasPassword: bool
    inputTypes: list[str] = []


class ShoppingRequest(BaseModel):
    url: str
    hostname: str
    title: str
    body_text: str
    links: list[LinkInfo] = []
    forms: list[FormInfo] = []
    detected_prices: list[str] = []
    detected_payment_words: list[str] = []

class ShoppingResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: list[str]
    advice: str
    dangerous_links: list[str]



class FamilyAlertRequest(BaseModel):
    recipient: str
    message: str
    url: str
    risk_score: int
    verdict: str

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

# ── POST /analyze-email ───────────────────────────────────────────────────────
import urllib.parse

@app.post("/analyze-email", response_model=EmailAnalysisResponse)
def analyze_email(request: EmailRequest):
    score = 0.0
    reasons = []
    dangerous_links = []
    
    urgent_words = [
        "urgent", "verify now", "account suspended", "locked", "immediate", 
        "expire", "action required", "limited access", "unusual activity", 
        "password expires", "payment failed"
    ]
    credential_words = ["password", "login", "sign in", "account", "card", "payment", "billing", "bank account"]
    suspicious_url_words = ["login", "verify", "secure", "account", "update"]
    shortened_urls = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly"]
    brands = ["paypal", "google", "microsoft", "apple", "facebook", "meta", "instagram", "netflix", "amazon", "dhl", "fedex", "bank"]
    
    # Lookalike substitutions mapping (e.g. 0 -> o, 1 -> l, etc. for simple checks)
    
    subject_lower = request.subject.lower()
    body_lower = request.body_text.lower()
    sender_email_lower = request.sender_email.lower()
    sender_lower = request.sender.lower()
    
    if any(w in subject_lower for w in urgent_words) or any(w in body_lower for w in urgent_words):
        score += 0.25
        reasons.append("Urgent or threatening language detected")
        
    if any(w in body_lower for w in credential_words):
        score += 0.15
        reasons.append("Requests credentials or sensitive information")
        
    if any(b in sender_lower and b not in sender_email_lower for b in brands):
        score += 0.30
        reasons.append(f"Sender name mimics a brand but email address does not match")

    # Scam message rules merged into email
    scam_keywords = ["gift card", "crypto", "bitcoin", "wire transfer", "itunes"]
    if any(w in body_lower for w in scam_keywords):
        score += 0.50
        reasons.append("Request for untraceable payment (gift card/crypto)")
        
    if "account is locked" in body_lower or "bank account locked" in body_lower:
        score += 0.85
        reasons.append("Bank account lock scam")
        
    if any(w in body_lower for w in ["mom", "dad", "son", "daughter", "mum"]) and "new number" in body_lower:
        score += 0.80
        reasons.append("Family impersonation")
        
    if any(w in body_lower for w in ["send money", "lost my phone", "transfer needed"]):
        score += 0.60
        reasons.append("Emergency money request")
        
    def get_domain(url_str):
        try:
            return urllib.parse.urlparse(url_str).netloc.lower()
        except:
            return ""

    for link in request.links:
        link_href_lower = link.href.lower()
        link_text_lower = link.text.lower()
        link_domain = get_domain(link_href_lower)
        
        # Shortened URLs
        if any(short in link_domain for short in shortened_urls):
            score += 0.20
            if "Contains shortened URLs" not in reasons:
                reasons.append("Contains shortened URLs")
            dangerous_links.append(link.href)
            continue
            
        # Suspicious words in URLs
        if any(w in link_href_lower for w in suspicious_url_words):
            score += 0.15
            if "Suspicious keywords in links" not in reasons:
                reasons.append("Suspicious keywords in links")
            dangerous_links.append(link.href)
            
        # URL Obfuscation (Basic Auth)
        if "@" in link_domain:
            score += 0.75
            if "URL obfuscation detected (credentials in link)" not in reasons:
                reasons.append("URL obfuscation detected (credentials in link)")
            if link.href not in dangerous_links:
                dangerous_links.append(link.href)
                
        # Mismatch detection: Text looks like a domain, but href is different
        # Basic check: if text contains a known brand and .com/.net etc., but domain doesn't match
        looks_like_url = "." in link_text_lower and not (" " in link_text_lower.strip())
        if looks_like_url:
            text_domain = get_domain(link_text_lower if link_text_lower.startswith("http") else f"http://{link_text_lower}")
            if text_domain and link_domain and text_domain != link_domain:
                score += 0.40
                if "Link text destination mismatch (spoofed link)" not in reasons:
                    reasons.append("Link text destination mismatch (spoofed link)")
                if link.href not in dangerous_links:
                    dangerous_links.append(link.href)

        # Lookalike domains and brand + keyword domains
        for b in brands:
            if b in link_domain and link_domain != f"{b}.com":
                # Check if it's a lookalike or brand+keyword (e.g. paypal-login.com)
                if any(w in link_domain for w in suspicious_url_words) or link_domain.startswith(f"{b}-") or link_domain.endswith(f"-{b}") or "@" in link_domain:
                    score += 0.40
                    if "Link domain mimics a brand" not in reasons:
                        reasons.append("Link domain mimics a brand")
                    if link.href not in dangerous_links:
                        dangerous_links.append(link.href)
                        
        # Basic character substitutions check (paypaI, faceb00k, g00gle, micros0ft)
        if "paypai" in link_domain or "faceb00k" in link_domain or "g00gle" in link_domain or "micros0ft" in link_domain:
             score += 0.40
             if "Link uses a lookalike domain (typosquatting)" not in reasons:
                 reasons.append("Link uses a lookalike domain (typosquatting)")
             if link.href not in dangerous_links:
                 dangerous_links.append(link.href)

        # Domain mismatch basic check (if domain in link doesn't match sender_email domain)
        if sender_email_lower and "@" in sender_email_lower:
            sender_domain = sender_email_lower.split("@")[-1]
            if link_domain and sender_domain not in link_domain:
                if any(b in sender_lower or b in subject_lower for b in brands):
                    score += 0.20
                    if "Link destination does not match sender domain" not in reasons:
                        reasons.append("Link destination does not match sender domain")
                    if link.href not in dangerous_links:
                        dangerous_links.append(link.href)

    final_score = max(0, min(100, int(score * 100)))
    
    if final_score >= 70:
        verdict = "Phishing"
    elif final_score >= 40:
        verdict = "Suspicious"
    else:
        verdict = "Safe"
        if not reasons:
            reasons.append("Email looks mostly safe")
            
    return EmailAnalysisResponse(
        risk_score=final_score,
        verdict=verdict,
        reasons=reasons,
        dangerous_links=dangerous_links
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


# ── Fake Shopping Site Detector ───────────────────────────────────────────────

@app.post("/analyze-shopping", response_model=ShoppingResponse)
def analyze_shopping(request: ShoppingRequest):
    score = 0
    reasons = []
    dangerous_links = []
    
    text_lower = request.body_text.lower()
    title_lower = request.title.lower()
    url_lower = request.url.lower()
    hostname = request.hostname.lower()
    
    # 1. Extreme discount language
    discount_phrases = ["80% off", "90% off", "70% off", "clearance", "today only", "limited stock", "liquidation", "going out of business"]
    if any(phrase in text_lower or phrase in title_lower for phrase in discount_phrases):
        score += 35
        reasons.append("Extreme discount language detected (e.g. 80-90% off, clearance, today only)")

    # 2. Suspicious payment methods
    suspicious_payments = ["crypto", "bitcoin", "gift card", "wire transfer", "western union", "bank transfer only"]
    # Check words sent from frontend or inside the text
    found_payments = [w for w in suspicious_payments if w in text_lower or w in request.detected_payment_words]
    if found_payments:
        score += 45
        reasons.append(f"Suspicious payment methods requested ({', '.join(set(found_payments))})")

    # 3. Missing trust signals
    has_contact = "contact" in text_lower or any("contact" in link.text.lower() or "contact" in link.href.lower() for link in request.links)
    has_return = "return" in text_lower or "refund" in text_lower or any("return" in link.text.lower() or "refund" in link.text.lower() for link in request.links)
    has_privacy = "privacy" in text_lower or any("privacy" in link.text.lower() for link in request.links)
    
    missing_trust = []
    if not has_contact: missing_trust.append("Contact page")
    if not has_return: missing_trust.append("Return/Refund policy")
    if not has_privacy: missing_trust.append("Privacy policy")
    
    if missing_trust:
        score += 25
        reasons.append(f"Missing trust signals: {', '.join(missing_trust)}")

    # 4. Fake urgency
    urgency_phrases = ["countdown", "only 2 left", "only 1 left", "order now", "hurry", "deal expires in"]
    if any(phrase in text_lower for phrase in urgency_phrases):
        score += 20
        reasons.append("Fake urgency tactics (e.g. timers, low stock warnings)")

    # 5. Suspicious domain
    # check if brand + discount/outlet is in domain
    brands = ["nike", "rayban", "oakley", "gucci", "louisvuitton", "northface", "timberland"]
    if any(b in hostname for b in brands) and any(w in hostname for w in ["discount", "outlet", "sale", "store", "cheap", "clearance"]):
        score += 50
        reasons.append("Domain mimics a brand with 'discount' or 'outlet' keywords")
    
    if hostname.count("-") >= 2:
        score += 15
        reasons.append("Domain contains multiple hyphens")
        
    weird_tlds = [".top", ".vip", ".club", ".shop", ".xyz", ".online", ".site", ".cyou"]
    if any(hostname.endswith(tld) for tld in weird_tlds):
        score += 20
        reasons.append("Domain uses a low-trust TLD (e.g. .shop, .vip, .top)")

    # 6. Login/payment forms on unknown domain
    for form in request.forms:
        action_lower = form.action.lower()
        if action_lower and not action_lower.startswith("/") and hostname not in action_lower:
            score += 30
            reasons.append("Form submits data to a different external domain")
            if action_lower not in dangerous_links:
                dangerous_links.append(action_lower)

    # 7. Links to suspicious checkout domains
    for link in request.links:
        href_lower = link.href.lower()
        if any(w in href_lower for w in ["checkout", "pay", "cart"]):
            if "http" in href_lower and hostname not in href_lower and "paypal.com" not in href_lower and "stripe.com" not in href_lower:
                # Checkout link pointing to an unknown 3rd party
                if "Suspicious external checkout link" not in reasons:
                    score += 25
                    reasons.append("Suspicious external checkout link")
                if link.href not in dangerous_links:
                    dangerous_links.append(link.href)

    score = min(100, int(score))

    if score >= 85:
        verdict = "Likely Scam"
        advice = "This store shows multiple high-risk scam indicators. DO NOT buy from here or enter your card details."
    elif score >= 50:
        verdict = "Suspicious"
        advice = "This store has several suspicious elements (e.g. extreme discounts, missing policies). Proceed with extreme caution."
    else:
        verdict = "Safe"
        advice = "We did not detect obvious scam signals, but always use a secure payment method like a credit card or PayPal."
        if not reasons:
            reasons.append("Shop looks standard")

    return ShoppingResponse(
        risk_score=score,
        verdict=verdict,
        reasons=reasons,
        advice=advice,
        dangerous_links=dangerous_links
    )


# ── POST /send-family-alert ──────────────────────────────────────────────────
@app.post("/send-family-alert")
def send_family_alert(request: FamilyAlertRequest):
    """
    Simulates sending an email alert to a family member.
    In a real app, this would use an SMTP server or an email API like SendGrid.
    """
    print(f"\n[FAMILY ALERT SENT]")
    print(f"To: {request.recipient}")
    print(f"Message:\n{request.message}")
    print(f"Context: {request.url} (Risk: {request.risk_score}, Verdict: {request.verdict})")
    print("---------------------\n")
    
    return {"status": "success", "message": f"Alert sent to {request.recipient}"}

# ── GET / (health check) ──────────────────────────────────────────────────────
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Anti-Phishing API is running"}
