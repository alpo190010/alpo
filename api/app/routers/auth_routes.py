"""Auth endpoints for email/password and Google sign-in flows."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.auth_email_templates import (
    build_reset_password_email,
    build_verification_email,
)
from app.services.auth_service import (
    generate_token,
    hash_password,
    validate_password,
    verify_password,
)
from app.services.email_sender import send_email

from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


# -- Request schemas --------------------------------------------------------


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class GoogleSigninRequest(BaseModel):
    google_sub: str
    email: str
    name: str | None = None
    picture: str | None = None


class SetPasswordRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserProfileResponse(BaseModel):
    id: str
    name: str | None
    email: str
    picture: str | None
    has_password: bool
    google_linked: bool
    email_verified: bool


# -- Endpoints --------------------------------------------------------------


@router.post("/auth/signup", status_code=201)
@limiter.limit("5/minute")
def signup(request: Request, req: SignupRequest, db: Session = Depends(get_db)):
    """Create a new email/password account and send a verification email."""
    # Validate password strength
    error = validate_password(req.password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Check email uniqueness
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )

    # Create user with hashed password
    token = generate_token()
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
        email_verified=False,
        role="user",
        verification_token=token,
        verification_token_expires_at=datetime.now(timezone.utc)
        + timedelta(hours=24),
    )
    db.add(user)
    db.commit()

    # Send verification email — don't block signup on failure
    verify_url = f"{settings.webapp_url}/verify-email?token={token}"
    if not send_email(
        "Alpo <noreply@alpo.ai>",
        req.email,
        "Verify your email",
        build_verification_email(verify_url, req.name),
    ):
        logger.warning("Failed to send verification email to %s", req.email)

    return {"message": "Check your email to verify your account"}


@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email and password."""
    user = db.query(User).filter(User.email == req.email).first()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in",
        )

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "email_verified": user.email_verified,
        "role": user.role,
    }


@router.post("/auth/verify-email")
def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Activate account via the emailed verification token."""
    user = db.query(User).filter(
        User.verification_token == req.token,
    ).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    if user.verification_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400, detail="Verification token has expired"
        )

    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    db.commit()

    return {"message": "Email verified successfully"}


@router.post("/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Send a password-reset email (never reveals whether the email exists)."""
    user = db.query(User).filter(User.email == req.email).first()

    if user:
        token = generate_token()
        user.reset_token = token
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(
            hours=1,
        )
        db.commit()

        reset_url = f"{settings.webapp_url}/reset-password?token={token}"
        if not send_email(
            "Alpo <noreply@alpo.ai>",
            req.email,
            "Reset your password",
            build_reset_password_email(reset_url, user.name),
        ):
            logger.warning("Failed to send reset email to %s", req.email)

    # Always return the same response to avoid leaking email existence
    return {
        "message": "If an account exists with that email, we've sent a password reset link"
    }


@router.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using a reset token."""
    user = db.query(User).filter(User.reset_token == req.token).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    if user.reset_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")

    error = validate_password(req.password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    user.password_hash = hash_password(req.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()

    return {"message": "Password reset successfully"}


@router.post("/auth/google-signin")
def google_signin(req: GoogleSigninRequest, db: Session = Depends(get_db)):
    """Resolve, link, or create a user from a Google profile."""
    # 1. Existing Google user
    user = db.query(User).filter(User.google_sub == req.google_sub).first()
    if user:
        return _google_user_response(user)

    # 2. Email match → link Google account
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        user.google_sub = req.google_sub
        user.email_verified = True
        if req.name:
            user.name = req.name
        if req.picture:
            user.picture = req.picture
        db.commit()
        return _google_user_response(user)

    # 3. Brand-new user
    user = User(
        google_sub=req.google_sub,
        email=req.email,
        name=req.name,
        picture=req.picture,
        email_verified=True,
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _google_user_response(user)


def _google_user_response(user: User) -> dict:
    """Standard response dict for google-signin."""
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "google_sub": user.google_sub,
        "email_verified": user.email_verified,
        "role": user.role,
    }


# -- Account management endpoints ------------------------------------------


@router.get("/auth/me", response_model=UserProfileResponse)
def me(user: User = Depends(get_current_user_required)):
    """Return the authenticated user's profile."""
    return UserProfileResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        picture=user.picture,
        has_password=user.password_hash is not None,
        google_linked=user.google_sub is not None,
        email_verified=user.email_verified,
    )


@router.post("/auth/set-password")
def set_password(
    req: SetPasswordRequest,
    user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Set a password for a user who signed up via Google (no existing password)."""
    if user.password_hash is not None:
        raise HTTPException(
            status_code=400,
            detail="Password already set. Use change-password endpoint.",
        )

    error = validate_password(req.password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    user.password_hash = hash_password(req.password)
    user.email_verified = True
    db.commit()

    return {"message": "Password set successfully"}


@router.post("/auth/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Change password for a user who already has one."""
    if user.password_hash is None:
        raise HTTPException(
            status_code=400,
            detail="No password set. Use set-password endpoint.",
        )

    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Incorrect current password",
        )

    error = validate_password(req.new_password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    user.password_hash = hash_password(req.new_password)
    db.commit()

    return {"message": "Password changed successfully"}
