import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
from main import app, seed_demo_data
from auth_utils import hash_password, verify_password

# Separate in-memory or file-based test SQLite database
TEST_DATABASE_URL = "sqlite:///./test_lifeline.db"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    # Setup clean tables and seed initial test data
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        seed_demo_data(db, force_reset=False)
    finally:
        db.close()
    yield
    # Cleanup
    Base.metadata.drop_all(bind=test_engine)


def test_password_hashing_security():
    """Verify that passwords are securely hashed with bcrypt and never stored plaintext."""
    pwd = "SecureTestPassword@2026"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_seed_demo_users_created():
    """Verify all 4 default role-based demo accounts exist."""
    db = TestingSessionLocal()
    try:
        users = db.query(models.User).all()
        emails = [u.email for u in users]
        assert "admin@lifeline.ai" in emails
        assert "operator@lifeline.ai" in emails
        assert "hospital@lifeline.ai" in emails
        assert "patient@lifeline.ai" in emails
    finally:
        db.close()


def test_login_success_admin():
    """Verify admin login returns JWT access token and user claims."""
    response = client.post("/api/auth/login", json={
        "email": "admin@lifeline.ai",
        "password": "Admin@123",
        "remember_me": True
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == "admin@lifeline.ai"


def test_login_invalid_password():
    """Verify login with incorrect password returns 401 with generic message."""
    response = client.post("/api/auth/login", json={
        "email": "admin@lifeline.ai",
        "password": "WrongPassword123"
    })
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_login_nonexistent_user():
    """Verify non-existent user returns 401 with generic message (no user enumeration)."""
    response = client.post("/api/auth/login", json={
        "email": "nonexistent_doctor@unknown.org",
        "password": "SomePassword123"
    })
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_register_new_patient():
    """Verify new patient can self-register and receives an active JWT token."""
    new_email = "new_patient_test@tirupati.gov"
    response = client.post("/api/auth/register", json={
        "full_name": "K. Venkatesh",
        "email": new_email,
        "phone_number": "+91 94401 22334",
        "password": "TestPassword@123",
        "role": "patient",
        "terms_accepted": True
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == new_email
    assert data["user"]["role"] == "patient"


def test_register_duplicate_email_blocked():
    """Verify self-registration with duplicate email returns 400."""
    response = client.post("/api/auth/register", json={
        "full_name": "Duplicate User",
        "email": "patient@lifeline.ai",  # Already exists
        "password": "AnotherPassword@123",
        "role": "patient"
    })
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


def test_register_admin_role_blocked():
    """Verify that attempting to self-register as 'admin' is strictly rejected with 403/422."""
    response = client.post("/api/auth/register", json={
        "full_name": "Hacker Admin",
        "email": "fake_admin@hack.org",
        "password": "FakeAdmin@123",
        "role": "admin"
    })
    assert response.status_code in [403, 422]


def test_get_current_user_profile():
    """Verify accessing /api/auth/me with Bearer token."""
    # First login as operator
    login_res = client.post("/api/auth/login", json={
        "email": "operator@lifeline.ai",
        "password": "Operator@123"
    })
    token = login_res.json()["access_token"]

    # Call /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    user_data = me_res.json()
    assert user_data["email"] == "operator@lifeline.ai"
    assert user_data["role"] == "operator"


def test_get_current_user_unauthorized():
    """Verify accessing /api/auth/me without token returns 401."""
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_role_based_access_control():
    """Verify that operator/patient cannot access admin-only /api/auth/users endpoint."""
    # Login as patient
    patient_res = client.post("/api/auth/login", json={
        "email": "patient@lifeline.ai",
        "password": "Patient@123"
    })
    patient_token = patient_res.json()["access_token"]

    # Patient tries to list system users -> 403 Forbidden
    denied_res = client.get("/api/auth/users", headers={"Authorization": f"Bearer {patient_token}"})
    assert denied_res.status_code == 403

    # Admin tries to list system users -> 200 OK
    admin_res = client.post("/api/auth/login", json={
        "email": "admin@lifeline.ai",
        "password": "Admin@123"
    })
    admin_token = admin_res.json()["access_token"]
    ok_res = client.get("/api/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert ok_res.status_code == 200
    assert len(ok_res.json()) >= 4


def test_forgot_and_reset_password_flow():
    """Verify forgot password generates reset token and reset password updates the hash."""
    # 1. Request reset
    forgot_res = client.post("/api/auth/forgot-password", json={
        "email": "patient@lifeline.ai"
    })
    assert forgot_res.status_code == 200
    data = forgot_res.json()
    assert data["reset_token"] is not None

    reset_token = data["reset_token"]

    # 2. Reset password using the token
    new_pw = "NewPatientPassword@2026"
    reset_res = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": new_pw
    })
    assert reset_res.status_code == 200

    # 3. Verify login works with new password
    login_res = client.post("/api/auth/login", json={
        "email": "patient@lifeline.ai",
        "password": new_pw
    })
    assert login_res.status_code == 200

    # 4. Verify token cannot be reused
    reuse_res = client.post("/api/auth/reset-password", json={
        "token": reset_token,
        "new_password": "AnotherPassword@123"
    })
    assert reuse_res.status_code == 400
