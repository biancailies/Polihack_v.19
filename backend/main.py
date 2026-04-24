from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from typing import List

from database import engine, get_db, Base
import models
import schemas
import auth
from detector import analyze_url_only, analyze_full

# Creează tabelele în baza de date
Base.metadata.create_all(bind=engine)

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Anti-Phishing Assistant",
    description="Backend to detect phishing URLs with User Management and Telemetry.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Endpoints de Sănătate ──────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "Anti-Phishing Backend (with DB) is running."}


# ─── Endpoints pentru Utilizatori (Auth) ──────────────────────────────────────

@app.post("/register", response_model=schemas.UserResponse, tags=["Auth"])
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/token", response_model=schemas.Token, tags=["Auth"])
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# ─── Endpoints de Core (Analyză) ───────────────────────────────────────────────

@app.post("/analyze-url", response_model=schemas.URLAnalysisResponse, tags=["Detection"])
def analyze_url(
    request: schemas.AnalyzeURLRequest, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_user_optional)
):
    """
    Fast pre-load URL check.
    Poate fi chemat de utilizatori logați sau anonimi.
    """
    result = analyze_url_only(request.url, db=db)
    return schemas.URLAnalysisResponse(**result)


@app.post("/analyze", response_model=schemas.FullAnalysisResponse, tags=["Detection"])
def analyze(
    request: schemas.AnalyzeRequest, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user_optional)
):
    """
    Full page analysis endpoint cu capabilități de salvare în BD pentru useri logați.
    """
    forms_as_dicts = [f.model_dump() for f in (request.forms or [])]

    result = analyze_full(
        url=request.url,
        page_title=request.page_title or "",
        page_text=request.page_text or "",
        forms=forms_as_dicts,
        db=db
    )
    
    # Salvare în istoric DACA utilizatorul este logat ȘI site-ul este vizat
    if current_user and result["risk_score"] > 0:
        history_entry = models.ScanHistory(
            user_id=current_user.id,
            url=request.url,
            risk_score=result["risk_score"],
            verdict=result["verdict"]
        )
        db.add(history_entry)
        db.commit()

    return schemas.FullAnalysisResponse(**result)


# ─── Endpoints de Telemetrie / Istoric ────────────────────────────────────────

@app.get("/history", response_model=List[schemas.ScanHistoryResponse], tags=["Telemetry"])
def get_user_history(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Afișează istoricul de scanări / atacuri evitate ale utilizatorului curent."""
    history = db.query(models.ScanHistory).filter(models.ScanHistory.user_id == current_user.id).order_by(models.ScanHistory.timestamp.desc()).all()
    return history

@app.post("/report", tags=["Telemetry"])
def report_url(report: schemas.URLReportCreate, current_user: models.User = Depends(auth.get_current_user_optional), db: Session = Depends(get_db)):
    """
    Trimite un URL raportat manual de utilizator.
    Dacă utilizatorul nu este logat, 'user_id' va fi nul.
    """
    new_report = models.URLReport(
        url=report.url,
        description=report.description,
        user_id=current_user.id if current_user else None
    )
    db.add(new_report)
    db.commit()
    return {"status": "success", "message": "Report submitted."}


# ─── Endpoints pentru Whitelist/Blacklist (Admins/Demo) ──────────────────────

@app.post("/admin/domain_list", response_model=schemas.DomainListResponse, tags=["Admin"])
def add_to_domain_list(data: schemas.DomainListCreate, db: Session = Depends(get_db)):
    """
    Adaugă un domeniu pe Whitelist sau Blacklist.
    """
    if data.list_type not in ["whitelist", "blacklist"]:
        raise HTTPException(status_code=400, detail="list_type must be 'whitelist' or 'blacklist'")
    
    db_domain = db.query(models.DomainList).filter(models.DomainList.domain == data.domain).first()
    if db_domain:
         raise HTTPException(status_code=400, detail="Domain already in lists")

    new_entry = models.DomainList(domain=data.domain, list_type=data.list_type, added_by=data.added_by)
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry

@app.get("/admin/domain_list", response_model=List[schemas.DomainListResponse], tags=["Admin"])
def get_domain_lists(db: Session = Depends(get_db)):
    return db.query(models.DomainList).all()
