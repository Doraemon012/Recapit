from fastapi import APIRouter

from .endpoints import ingest, status, auth, analytics

router = APIRouter()
router.include_router(ingest.router, prefix="/meetings", tags=["meetings"])
router.include_router(status.router, prefix="/meetings", tags=["meetings"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
