import pandas as pd

# ── 1. Load the dataset ──────────────────────────────────────────────────────
df = pd.read_csv("phishing_dataset.csv")
print(f"Dataset loaded: {len(df)} rows\n")

# Adjust for new dataset format
df = df.rename(columns={"URL": "url", "Label": "label"})
df["url"] = df["url"].astype(str)
df["label"] = df["label"].map({"good": 0, "bad": 1})
# Drop any rows where label mapping failed (just in case of nan)
df = df.dropna(subset=["label"])
df["label"] = df["label"].astype(int)

# ── 2. Define suspicious keywords ────────────────────────────────────────────
SUSPICIOUS_KEYWORDS = [
    "login", "verify", "secure", "update", "account",
    "password", "bank", "confirm", "billing", "support"
]

# ── 3. Extract features ───────────────────────────────────────────────────────

# Length of the full URL string
df["url_length"] = df["url"].apply(len)

# Number of dot characters in the URL
df["num_dots"] = df["url"].apply(lambda url: url.count("."))

# Number of digit characters (0–9) in the URL
df["num_digits"] = df["url"].apply(lambda url: sum(ch.isdigit() for ch in url))

# 1 if the URL uses HTTPS, 0 otherwise
df["has_https"] = df["url"].apply(lambda url: 1 if url.startswith("https://") else 0)

# 1 if the URL contains at least one suspicious keyword (case-insensitive)
def has_suspicious_keywords(url):
    url_lower = url.lower()
    for keyword in SUSPICIOUS_KEYWORDS:
        if keyword in url_lower:
            return 1
    return 0

df["has_suspicious_keywords"] = df["url"].apply(has_suspicious_keywords)

# ── 4. Keep only feature columns + label ─────────────────────────────────────
features_df = df[[
    "url",
    "url_length",
    "num_dots",
    "num_digits",
    "has_https",
    "has_suspicious_keywords",
    "label"
]]

# ── 5. Save to CSV ────────────────────────────────────────────────────────────
features_df.to_csv("features_dataset.csv", index=False)
print("Saved to features_dataset.csv\n")

# ── 6. Preview the first rows ─────────────────────────────────────────────────
print(features_df.head(10).to_string(index=False))

# ── 7. Quick stats ────────────────────────────────────────────────────────────
print("\n── Feature Summary ──────────────────────────────────")
print(features_df.drop(columns=["url"]).describe().round(2))
