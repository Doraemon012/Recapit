from pymongo.database import Database
from app.models.user import UserCreate, UserLogin, UserInDB
from app.core.security import get_password_hash, verify_password

def create_user(db: Database, user: UserCreate) -> UserInDB:
    hashed = get_password_hash(user.password)
    user_doc = {"email": user.email, "hashed_password": hashed}
    result = db["users"].insert_one(user_doc)
    return UserInDB(id=str(result.inserted_id), email=user.email, hashed_password=hashed)

def authenticate_user(db: Database, user: UserLogin) -> UserInDB | None:
    user_doc = db["users"].find_one({"email": user.email})
    if not user_doc:
        return None
    if not verify_password(user.password, user_doc["hashed_password"]):
        return None
    return UserInDB(id=str(user_doc["_id"]), email=user_doc["email"], hashed_password=user_doc["hashed_password"])
