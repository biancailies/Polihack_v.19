from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Am schimbat pe SQLite pentru că Docker pare să nu fie pornit pe sistemul tău.
# SQLite funcționează direct pe hard disk, fără instalări suplimentare, ideal pentru hackathon!
SQLALCHEMY_DATABASE_URL = "sqlite:///./phishing.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependință pentru a injecta sesiunea DB în endpoint-uri FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
