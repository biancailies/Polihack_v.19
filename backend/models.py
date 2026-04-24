from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    history = relationship("ScanHistory", back_populates="user")
    reports = relationship("URLReport", back_populates="user")

class ScanHistory(Base):
    __tablename__ = "scan_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    url = Column(String)
    risk_score = Column(Integer)
    verdict = Column(String)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="history")

class URLReport(Base):
    __tablename__ = "url_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Poate fi logat sau anonim
    url = Column(String)
    description = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="reports")

class DomainList(Base):
    __tablename__ = "domain_list"

    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String, unique=True, index=True)
    list_type = Column(String) # "whitelist" sau "blacklist"
    added_by = Column(String, nullable=True) # e.g. "admin"
