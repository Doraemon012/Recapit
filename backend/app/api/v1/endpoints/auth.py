from fastapi import APIRouter, Cookie, HTTPException, Response, status, Depends
from typing import Optional
from pydantic import EmailStr
from app.models.user import UserCreate, UserLogin
from app.services.auth import create_user, authenticate_user
from app.db.mongo import get_database
from app.core.security import create_access_token, decode_access_token

router = APIRouter()


def get_current_user_id(token: Optional[str] = Cookie(None, alias="access_token")) -> Optional[str]:
    """Extract user ID from JWT token in cookie."""
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload.get("sub")


def require_auth(token: Optional[str] = Cookie(None, alias="access_token")) -> str:
    """Require authentication - raises 401 if not authenticated."""
    user_id = get_current_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


@router.post("/signup")
def signup(user: UserCreate):
    db = get_database()
    if db["users"].find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_db = create_user(db, user)
    return {"id": user_db.id, "email": user_db.email}


@router.post("/login")
def login(user: UserLogin, response: Response):
    db = get_database()
    user_db = authenticate_user(db, user)
    if not user_db:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create access token
    access_token = create_access_token(data={"sub": user_db.id, "email": user_db.email})
    
    # Set cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=60 * 60 * 24 * 7,  # 7 days
        samesite="lax",
    )
    
    return {"id": user_db.id, "email": user_db.email, "access_token": access_token}


@router.post("/logout")
def logout(response: Response):
    """Log out by clearing the authentication cookie."""
    response.delete_cookie(key="access_token")
    return {"message": "Logged out successfully"}


@router.get("/me")
def get_current_user(user_id: str = Depends(require_auth)):
    """Get current authenticated user info."""
    db = get_database()
    from bson import ObjectId
    user_doc = db["users"].find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": str(user_doc["_id"]), "email": user_doc["email"]}
