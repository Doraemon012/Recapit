# Package Installation Summary

## Required Python Packages (Backend)

You need to install these two packages that are not in the current requirements.txt:

```bash
pip install python-jose[cryptography] passlib[bcrypt]
```

### Package Details:

1. **python-jose[cryptography]** (version 3.3.0+)
   - Purpose: JWT token creation and verification for authentication
   - Used in: `backend/app/core/security.py`
   - Functions: `create_access_token()`, `decode_access_token()`

2. **passlib[bcrypt]** (version 1.7.4+)
   - Purpose: Secure password hashing
   - Used in: `backend/app/core/security.py`, `backend/app/services/auth.py`
   - Functions: `get_password_hash()`, `verify_password()`

### Installation Command:
```bash
cd backend
pip install python-jose[cryptography] passlib[bcrypt]
```

### Add to requirements.txt (Recommended):
```
python-jose[cryptography]>=3.3.0,<4.0.0
passlib[bcrypt]>=1.7.4,<2.0.0
```

---

## No New Frontend Packages Required

All frontend dependencies are already in `package.json`. Just run:
```bash
cd frontend
npm install
```

---

## That's It!

After installing these two Python packages, your application will have:
- ✅ JWT-based authentication
- ✅ Secure password hashing
- ✅ Session management via HTTP-only cookies
- ✅ User login/signup/logout functionality
- ✅ Protected dashboard routes

---

## Verification

After installation, verify the packages are installed:

```bash
python -c "from jose import jwt; print('python-jose OK')"
python -c "from passlib.context import CryptContext; print('passlib OK')"
```

Both commands should print "OK" without errors.
