from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_router
from app.core.config import get_settings
from app.db.mongo import close_mongo_connection, connect_to_mongo

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    connect_to_mongo()
    yield
    close_mongo_connection()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])  # pragma: no cover - simple health probe
async def healthcheck() -> dict[str, str]:
    connect_to_mongo()
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.api_prefix)
