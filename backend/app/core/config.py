from functools import lru_cache
from typing import Optional, Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Recapit API")
    api_prefix: str = Field(default="/api/v1")
    # Accept str or list, validator will normalize to list
    cors_origins: Union[str, list[str]] = Field(default="http://localhost:3000")

    mongo_uri: str = Field(default="mongodb://localhost:27017")
    mongo_db_name: str = Field(default="recapit")

    storage_bucket: Optional[str] = None
    storage_region: Optional[str] = None

    # Whisper ASR Configuration
    huggingface_token: Optional[str] = Field(default=None)
    whisper_model: str = Field(default="base")  # tiny, base, small, medium, large
    whisper_device: str = Field(default="auto")  # cuda, cpu, or auto
    whisper_verbose: bool = Field(default=False)
    summarizer_model_id: str = Field(default="Neyati/recapit-meetingbank-bart")
    summarizer_model_revision: Optional[str] = Field(default=None)

    # Add this for analytics LLM
    cohere_api_key: Optional[str] = Field(default=None)

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="forbid",  # Forbid extra fields in .env
    )

    @field_validator("cors_origins", mode="after")
    @classmethod
    def normalise_cors_origins(cls, value: Union[str, list]) -> list[str]:
        # If it's a string, split by comma
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        # If it's already a list, normalize it
        if isinstance(value, (list, tuple, set)):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return [str(value)]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()