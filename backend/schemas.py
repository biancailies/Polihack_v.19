from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Pydantic Models for DB / Auth ---

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None


class ScanHistoryResponse(BaseModel):
    id: int
    url: str
    risk_score: int
    verdict: str
    timestamp: datetime

    class Config:
        from_attributes = True

class URLReportCreate(BaseModel):
    url: str
    description: Optional[str] = None

class DomainListCreate(BaseModel):
    domain: str
    list_type: str # "whitelist" sau "blacklist"
    added_by: Optional[str] = "admin"

class DomainListResponse(BaseModel):
    id: int
    domain: str
    list_type: str
    
    class Config:
        from_attributes = True


# --- Existing Models ---

class FormInfo(BaseModel):
    has_password: bool = False
    action: Optional[str] = ""

class AnalyzeRequest(BaseModel):
    url: str
    page_title: Optional[str] = ""
    page_text: Optional[str] = ""
    forms: Optional[List[FormInfo]] = []

class AnalyzeURLRequest(BaseModel):
    url: str

class URLAnalysisResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: List[str]

class FullAnalysisResponse(BaseModel):
    risk_score: int
    verdict: str
    reasons: List[str]
    chatbot_message: str
