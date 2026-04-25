import re
import tldextract
from urllib.parse import urlparse
from sqlalchemy.orm import Session
import models

# --- Constants ---

SUSPICIOUS_KEYWORDS = [
    "login", "verify", "secure", "account", "password",
    "update", "bank", "payment", "confirm", "urgent"
]

KNOWN_BRANDS = [
    "paypal", "google", "facebook", "instagram",
    "microsoft", "apple", "revolut", "bt", "bcr"
]


# --- Scoring weights ---

SCORE_NO_HTTPS = 15
SCORE_AT_IN_URL = 20
SCORE_LONG_URL = 10
SCORE_MANY_DOTS = 10
SCORE_MANY_HYPHENS = 10
SCORE_MANY_DIGITS = 10
SCORE_SUSPICIOUS_KEYWORD = 10
SCORE_BRAND_IMITATION = 30
SCORE_PASSWORD_FORM = 25
SCORE_CROSS_DOMAIN_FORM = 25


def get_verdict(score: int) -> str:
    if score >= 70:
        return "Phishing"
    elif score >= 40:
        return "Suspicious"
    else:
        return "Safe"


def get_chatbot_message(verdict: str) -> str:
    if verdict == "Safe":
        return "This page looks safe based on the current checks."
    elif verdict == "Suspicious":
        return "This page has some suspicious signs. Be careful before entering personal data."
    else:
        return "This page looks dangerous. Do not enter passwords or personal information."


def extract_domain(url: str) -> str:
    """Extracts registered domain (e.g. 'paypal-login-secure.com') from a URL."""
    ext = tldextract.extract(url)
    return f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain

def check_domain_lists(url: str, db: Session):
    """Verifică dacă domeniul e pe whitelist sau blacklist"""
    domain = extract_domain(url)
    db_domain = db.query(models.DomainList).filter(models.DomainList.domain == domain).first()
    
    if db_domain:
        if db_domain.list_type == "whitelist":
            return {"risk_score": 0, "verdict": "Safe", "reasons": ["Domain is explicitly Whitelisted."]}
        elif db_domain.list_type == "blacklist":
            return {"risk_score": 100, "verdict": "Phishing", "reasons": ["Domain is explicitly Blacklisted."]}
    return None

def analyze_url_only(url: str, db: Session = None) -> dict:
    """
    Runs rule-based checks using only the URL.
    Returns a dict with risk_score, verdict, and reasons.
    """
    # 0. Check Whitelist/Blacklist interogând baza de date
    if db:
        list_result = check_domain_lists(url, db)
        if list_result:
            return list_result

    score = 0
    reasons = []

    parsed = urlparse(url)
    url_lower = url.lower()

    # 1. No HTTPS
    if parsed.scheme != "https":
        score += SCORE_NO_HTTPS
        reasons.append("URL does not use HTTPS")

    # 2. @ in URL
    if "@" in url:
        score += SCORE_AT_IN_URL
        reasons.append("URL contains '@' character (redirect trick)")

    # 3. Long URL (> 75 chars)
    if len(url) > 75:
        score += SCORE_LONG_URL
        reasons.append("URL is unusually long")

    # 4. Many dots (> 4 in full URL)
    dot_count = url.count(".")
    if dot_count > 4:
        score += SCORE_MANY_DOTS
        reasons.append(f"URL contains many dots ({dot_count})")

    # 5. Many hyphens (> 3 in full URL)
    hyphen_count = url.count("-")
    if hyphen_count > 3:
        score += SCORE_MANY_HYPHENS
        reasons.append(f"URL contains many hyphens ({hyphen_count})")

    # 6. Many digits (> 4 digit characters in host)
    host = parsed.netloc
    digit_count = sum(c.isdigit() for c in host)
    if digit_count > 4:
        score += SCORE_MANY_DIGITS
        reasons.append(f"Domain contains many digits ({digit_count})")

    # 7. Suspicious keywords in URL
    found_keywords = [kw for kw in SUSPICIOUS_KEYWORDS if kw in url_lower]
    for kw in found_keywords:
        score += SCORE_SUSPICIOUS_KEYWORD
        reasons.append(f"Suspicious keyword in URL: '{kw}'")

    # 8. Brand imitation — brand name in URL but NOT as the registered domain
    ext = tldextract.extract(url)
    registered_domain = ext.domain.lower()
    for brand in KNOWN_BRANDS:
        if brand in url_lower and brand != registered_domain:
            score += SCORE_BRAND_IMITATION
            reasons.append(f"Domain imitates '{brand.capitalize()}'")
            break  # only count once

    # Cap at 100
    score = min(score, 100)
    verdict = get_verdict(score)

    return {
        "risk_score": score,
        "verdict": verdict,
        "reasons": reasons,
    }


def analyze_full(url: str, page_title: str, page_text: str, forms: list, db: Session = None) -> dict:
    """
    Runs full rule-based analysis including page content and forms.
    Returns a dict with risk_score, verdict, reasons, and chatbot_message.
    """
    
    if db:
        list_result = check_domain_lists(url, db)
        if list_result:
            return {
                "risk_score": list_result["risk_score"],
                "verdict": list_result["verdict"],
                "reasons": list_result["reasons"],
                "chatbot_message": get_chatbot_message(list_result["verdict"])
            }


    # Start with URL-based analysis
    result = analyze_url_only(url)
    score = result["risk_score"]
    reasons = result["reasons"]

    # Restore pre-cap raw score for further addition
    # (re-run URL score without cap to keep adding)
    raw_url_score = _raw_url_score(url)
    score = raw_url_score  # use raw so we can add page score and cap at end

    current_domain = extract_domain(url)

    # 9. Password form detected
    has_password_form = any(f.get("has_password", False) for f in forms)
    if has_password_form:
        score += SCORE_PASSWORD_FORM
        reasons = [r for r in reasons]  # keep existing reasons
        if "Login form with password field detected" not in reasons:
            reasons.append("Login form with password field detected")

    # 10. Form action points to a different domain
    for form in forms:
        action = form.get("action", "")
        if action:
            action_domain = extract_domain(action)
            if action_domain and action_domain != current_domain:
                score += SCORE_CROSS_DOMAIN_FORM
                reasons.append(
                    f"Form submits data to external domain: '{action_domain}'"
                )
                break  # count once

    # Cap at 100
    score = min(score, 100)
    verdict = get_verdict(score)
    chatbot_message = get_chatbot_message(verdict)

    return {
        "risk_score": score,
        "verdict": verdict,
        "reasons": reasons,
        "chatbot_message": chatbot_message,
    }


def _raw_url_score(url: str) -> int:
    """Computes the raw (uncapped) URL-only score for internal use."""
    score = 0
    parsed = urlparse(url)
    url_lower = url.lower()

    if parsed.scheme != "https":
        score += SCORE_NO_HTTPS
    if "@" in url:
        score += SCORE_AT_IN_URL
    if len(url) > 75:
        score += SCORE_LONG_URL
    if url.count(".") > 4:
        score += SCORE_MANY_DOTS
    if url.count("-") > 3:
        score += SCORE_MANY_HYPHENS
    host = parsed.netloc
    if sum(c.isdigit() for c in host) > 4:
        score += SCORE_MANY_DIGITS
    for kw in SUSPICIOUS_KEYWORDS:
        if kw in url_lower:
            score += SCORE_SUSPICIOUS_KEYWORD
    ext = tldextract.extract(url)
    registered_domain = ext.domain.lower()
    for brand in KNOWN_BRANDS:
        if brand in url_lower and brand != registered_domain:
            score += SCORE_BRAND_IMITATION
            break

    return score


def analyze_email(email_data) -> dict:
    """
    Runs rule-based analysis on email content and links.
    Returns a dict with risk_score, verdict, reasons, and dangerous_links.
    """
    score = 0
    reasons = []
    dangerous_links = []

    urgent_words = ["urgent", "verify now", "account suspended", "locked", "immediate", "expire", "action required", "limited access", "unusual activity", "password expires", "payment failed"]
    cred_words = ["password", "login", "sign in", "account", "card", "payment", "billing", "bank account"]
    susp_urls = ["login", "verify", "secure", "account", "update"]
    short_urls = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly"]
    brands = ["paypal", "google", "microsoft", "apple", "facebook", "meta", "instagram", "netflix", "amazon", "dhl", "fedex", "bank"]

    subj = email_data.subject.lower()
    body = email_data.body_text.lower()
    s_email = email_data.sender_email.lower()
    s_name = email_data.sender.lower()

    if any(w in subj or w in body for w in urgent_words):
        score += 25
        reasons.append("Urgent or threatening language detected")
    
    if any(w in body for w in cred_words):
        score += 15
        reasons.append("Requests credentials or sensitive information")
    
    if any(b in s_name and b not in s_email for b in brands):
        score += 30
        reasons.append("Sender name mimics a brand but email address does not match")

    if re.search(r'gift card|crypto|bitcoin|wire transfer|itunes', body):
        score += 50
        reasons.append("Request for untraceable payment (gift card/crypto)")
        
    if "account is locked" in body or "bank account locked" in body:
        score += 85
        reasons.append("Bank account lock scam")
        
    if re.search(r'mom|dad|son|daughter|mum', body) and "new number" in body:
        score += 80
        reasons.append("Family impersonation")
        
    if "send money" in body or "lost my phone" in body or "transfer needed" in body:
        score += 60
        reasons.append("Emergency money request")
        
    if re.search(r'package|delivery|stuck', body) and re.search(r'fee|pay|customs', body):
        score += 75
        reasons.append("Package delivery scam")
        
    if "won a prize" in body or "claim now" in body or "lottery" in body:
        score += 70
        reasons.append("Prize scam")

    for link in email_data.links:
        h = link.href.lower()
        t = link.text.lower()
        
        looks_like_url = "." in t and " " not in t
        if looks_like_url:
            t_domain = t.replace('http://', '').replace('https://', '').split('/')[0]
            h_domain = h.replace('http://', '').replace('https://', '').split('/')[0]
            if t_domain and h_domain and t_domain != h_domain:
                score += 40
                reasons.append("Link text destination mismatch (spoofed link)")
                dangerous_links.append(link.href)
                
        link_domain = h.replace('http://', '').replace('https://', '').split('/')[0] if h else ""
        
        if h.startswith("http") and "@" in link_domain:
            score += 75
            reasons.append("URL obfuscation detected (credentials in link)")
            dangerous_links.append(link.href)
            
        for b in brands:
            if b in link_domain and link_domain != f"{b}.com":
                score += 40
                reasons.append("Link domain mimics a brand")
                dangerous_links.append(link.href)
                
        if any(s in h for s in short_urls):
            score += 20
            reasons.append("Contains shortened URLs")
            dangerous_links.append(link.href)
        elif any(s in h for s in susp_urls):
            score += 15
            reasons.append("Suspicious keywords in links")
            dangerous_links.append(link.href)

    reasons = list(dict.fromkeys(reasons))
    dangerous_links = list(dict.fromkeys(dangerous_links))
    score = min(score, 100)

    verdict = "Safe"
    if score >= 70:
        verdict = "Phishing"
    elif score >= 40:
        verdict = "Suspicious"

    if not reasons:
        reasons.append("Email looks mostly safe")

    return {
        "risk_score": score,
        "verdict": verdict,
        "reasons": reasons,
        "dangerous_links": dangerous_links
    }

