"""Auth module tests: password hashing, JWT, API endpoints."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.auth.security import hash_password, verify_password, create_access_token, decode_access_token
from src.db.database import Base, get_db
from src.db.models import User
from src.main import app

# ---------- In-memory test DB ----------

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


# ---------- Password hashing ----------


def test_password_hash_and_verify():
    """Hash should not equal plaintext; verify should return True."""
    plain = "test_password_123"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)


def test_password_wrong_password_returns_false():
    """Verify with wrong password should return False."""
    hashed = hash_password("correct_password")
    assert not verify_password("wrong_password", hashed)


# ---------- JWT ----------


def test_jwt_create_and_decode():
    """Encode then decode should return original subject."""
    token = create_access_token("test_user")
    assert decode_access_token(token) == "test_user"


def test_jwt_invalid_token_returns_none():
    """A garbage token should decode to None."""
    assert decode_access_token("not.a.valid.token") is None


# ---------- ORM model ----------


def test_user_model_create():
    """User ORM object should construct normally and persist with defaults."""
    client = TestClient(app)
    resp = client.post("/api/auth/register", json={"username": "alice", "password": "alicepass1"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "alice"
    assert data["role"] == "user"
    assert data["is_active"] is True


# ---------- API endpoints ----------


def test_register_user():
    """POST /api/auth/register should create a new user."""
    client = TestClient(app)
    resp = client.post("/api/auth/register", json={"username": "newuser", "password": "pass123456"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "newuser"
    assert data["role"] == "user"


def test_register_duplicate_username_400():
    """Registering the same username twice should return 400."""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": "dup", "password": "pass123456"})
    resp = client.post("/api/auth/register", json={"username": "dup", "password": "pass123456"})
    assert resp.status_code == 400


def test_login_wrong_password_401():
    """Login with wrong password should return 401."""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": "bob", "password": "correct_pass"})
    resp = client.post("/api/auth/login", json={"username": "bob", "password": "wrong_pass"})
    assert resp.status_code == 401


def test_login_success():
    """Login with correct credentials should return token."""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": "carol", "password": "mypass123"})
    resp = client.post("/api/auth/login", json={"username": "carol", "password": "mypass123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["username"] == "carol"


def test_me_without_token_401():
    """GET /api/auth/me without token should return 401."""
    client = TestClient(app)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_valid_token():
    """GET /api/auth/me with valid token should return user info."""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": "dave", "password": "davepass"})
    login_resp = client.post("/api/auth/login", json={"username": "dave", "password": "davepass"})
    token = login_resp.json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "dave"


def test_protected_endpoint_without_token_401():
    """Accessing a protected endpoint without token should return 401."""
    client = TestClient(app)
    resp = client.get("/api/health")  # health is public
    assert resp.status_code == 200

    # /api/generate is protected
    resp2 = client.post("/api/generate", json={"product_name": "test", "origin": "", "category": "", "selling_points": "", "target_platform": "", "target_duration": ""})
    assert resp2.status_code == 401
