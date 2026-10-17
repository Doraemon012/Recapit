from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    """A single segment of transcript with speaker and timing info."""
    speaker: str = Field(..., description="Speaker identifier (e.g., SPEAKER_00, SPEAKER_01)")
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Transcript text for this segment")


class MeetingQueuedResponse(BaseModel):
    """Payload returned after a meeting upload has been accepted."""

    job_id: str = Field(..., description="Identifier for the queued meeting job")
    filename: str = Field(..., description="Original name of the uploaded audio file")
    content_type: str = Field(..., description="Resolved MIME type for the audio upload")
    status: str = Field(default="queued", description="Processing status for the meeting job")
    created_at: datetime = Field(..., description="UTC timestamp when the upload was registered")
    progress_percent: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Approximate progress of the processing pipeline (0-100).",
    )
    status_message: str | None = Field(
        default=None,
        description="Optional human-readable note about the current status.",
    )

    class Config:
        json_encoders = {datetime: lambda dt: dt.isoformat()}


class MeetingStatusResponse(MeetingQueuedResponse):
    """Latest processing state for a queued meeting job."""

    updated_at: datetime | None = Field(
        default=None,
        description="UTC timestamp for the most recent status update.",
    )
    completed_at: datetime | None = Field(
        default=None,
        description="UTC timestamp when the job finished successfully.",
    )
    transcript: str | None = Field(
        default=None,
        description="Synthesised transcript text once ASR finishes.",
    )
    summary: str | None = Field(
        default=None,
        description="AI-generated summary when available.",
    )
    transcript_segments: List[TranscriptSegment] = Field(
        default_factory=list,
        description="List of transcript segments with speaker labels and timestamps.",
    )
