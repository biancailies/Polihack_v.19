import pickle
import pandas as pd

# ── Constants ─────────────────────────────────────────────────────────────────
MODEL_PATH = "model.pkl"

SUSPICIOUS_KEYWORDS = [
    "login", "verify", "secure", "update", "account",
    "password", "bank", "confirm", "billing", "support",
]

# ── Load model once at module level (avoids reloading on every call) ──────────
with open(MODEL_PATH, "rb") as f:
    _model = pickle.load(f)


# ── Feature extraction ────────────────────────────────────────────────────────
def _extract_features(url: str) -> pd.DataFrame:
    """Convert a raw URL string into the feature vector expected by the model."""
    url_lower = url.lower()

    features = {
        "url_length": len(url),
        "num_dots":   url.count("."),
        "num_digits": sum(ch.isdigit() for ch in url),
        "has_https":  1 if url.startswith("https://") else 0,
        "has_suspicious_keywords": int(
            any(kw in url_lower for kw in SUSPICIOUS_KEYWORDS)
        ),
    }

    return pd.DataFrame([features])


# ── Main prediction function ──────────────────────────────────────────────────
def predict(url: str) -> float:
    """
    Predict the phishing probability of a URL.

    Parameters
    ----------
    url : str
        The full URL to classify (e.g. "https://paypal-secure-login.com").

    Returns
    -------
    float
        Probability of the URL being phishing, in the range [0.0, 1.0].
        Example: 0.87 means 87% likely to be phishing.
    """
    features = _extract_features(url)

    # predict_proba returns [[prob_class_0, prob_class_1]]
    phishing_probability = _model.predict_proba(features)[0][1]

    return round(float(phishing_probability), 4)


# ── Example usage ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_urls = [
        "https://www.google.com",
        "https://www.paypal.com",
        "http://paypal-secure-login.com",
        "http://amaz0n.account-update.xyz/signin",
        "http://secure-verify-account.tk/login",
        "https://www.github.com",
    ]

    print(f"{'URL':<45}  {'Phishing Probability':>20}  {'Verdict'}")
    print("─" * 80)
    for url in test_urls:
        prob = predict(url)
        verdict = "🚨 Phishing" if prob >= 0.5 else "✅ Legitimate"
        print(f"{url:<45}  {prob:>20.4f}  {verdict}")
