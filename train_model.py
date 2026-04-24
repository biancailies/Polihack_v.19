import pickle
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# ── 1. Load the dataset ──────────────────────────────────────────────────────
df = pd.read_csv("features_dataset.csv")
print(f"Dataset loaded: {len(df)} rows\n")

# ── 2. Split into features (X) and target (y) ────────────────────────────────
FEATURE_COLS = [
    "url_length",
    "num_dots",
    "num_digits",
    "has_https",
    "has_suspicious_keywords",
]

X = df[FEATURE_COLS]
y = df["label"]

print(f"Features : {FEATURE_COLS}")
print(f"Class distribution:\n{y.value_counts().to_string()}\n")

# ── 3. Train / test split (80 / 20) ──────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42
)
print(f"Training samples : {len(X_train)}")
print(f"Testing  samples : {len(X_test)}\n")

# ── 4. Train RandomForestClassifier ──────────────────────────────────────────
model = RandomForestClassifier(
    n_estimators=100,
    random_state=42,
    class_weight="balanced",
    n_jobs=-1,
)

model.fit(X_train, y_train)
print("Model trained successfully!\n")

# ── 5. Evaluate the model ─────────────────────────────────────────────────────
y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy : {accuracy * 100:.2f}%\n")

print("--- Classification Report ---")
print(classification_report(y_test, y_pred, target_names=["Legitimate", "Phishing"]))

# ── 6. Feature importance (sorted descending) ────────────────────────────────
print("--- Feature Importance ---")
importance_df = pd.DataFrame({
    "feature":   FEATURE_COLS,
    "importance": model.feature_importances_,
}).sort_values("importance", ascending=False)

for _, row in importance_df.iterrows():
    bar = "=" * int(row["importance"] * 50)
    print(f"  {row['feature']:<28} {row['importance']:.4f}  {bar}")

print()

# ── 7. Save the trained model to disk ────────────────────────────────────────
MODEL_PATH = "model.pkl"
with open(MODEL_PATH, "wb") as f:
    pickle.dump(model, f)

print(f"Model saved to '{MODEL_PATH}'")

# ── 8. Reload the model and test a sample prediction ─────────────────────────
print("\n--- Sample Prediction ---")

with open(MODEL_PATH, "rb") as f:
    loaded_model = pickle.load(f)

print("Model reloaded from disk successfully!")

# Define two test samples: one legitimate, one phishing
test_samples = pd.DataFrame([
    {
        "url_length": 22,        # https://www.google.com
        "num_dots": 2,
        "num_digits": 0,
        "has_https": 1,
        "has_suspicious_keywords": 0,
    },
    {
        "url_length": 45,        # http://secure-paypal-login.com/verify
        "num_dots": 1,
        "num_digits": 0,
        "has_https": 0,
        "has_suspicious_keywords": 1,
    },
])

LABEL_MAP = {0: "Legitimate", 1: "Phishing"}

predictions  = loaded_model.predict(test_samples)
probabilities = loaded_model.predict_proba(test_samples)

for i, (pred, proba) in enumerate(zip(predictions, probabilities)):
    confidence = max(proba) * 100
    print(f"  Sample {i + 1}: {LABEL_MAP[pred]}  (confidence: {confidence:.1f}%)")
