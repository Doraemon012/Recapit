from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Annotated, TypeAlias, List

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Path, Response
from fastapi.responses import StreamingResponse
from pymongo.database import Database
import gridfs
import io

from app.db.mongo import get_database
from app.models.meeting import MeetingStatusResponse
from app.api.v1.endpoints.auth import require_auth

router = APIRouter()

logger = logging.getLogger("recapit.api.status")
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

DatabaseDep: TypeAlias = Annotated[Database, Depends(get_database)]  # Legacy, not used below
JobIdPath: TypeAlias = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{24}$")]


def _coerce_progress(value: object) -> float:
    try:
        progress = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if progress < 0.0:
        return 0.0
    if progress > 100.0:
        return 100.0
    return progress


@router.get("/list", response_model=List[MeetingStatusResponse])
async def list_user_meetings(
    user_id: str = Depends(require_auth),
    db: Database = Depends(get_database),
) -> List[MeetingStatusResponse]:
    """List all meetings for the authenticated user."""
    logger.debug("Listing meetings for user", extra={"user_id": user_id})
    
    # Find all meetings belonging to this user
    cursor = db["meeting_jobs"].find({"user_id": user_id}).sort("created_at", -1)
    
    meetings = []
    for document in cursor:
        job_id = str(document["_id"])
        meetings.append(_build_meeting_response(job_id, document))
    
    logger.info(f"Found {len(meetings)} meetings for user {user_id}")
    return meetings


@router.get("/status/{job_id}", response_model=MeetingStatusResponse)
async def get_meeting_status(
    job_id: JobIdPath,
    db: DatabaseDep,
) -> MeetingStatusResponse:
    """Return the last known processing status for a meeting upload."""
    logger.debug("Fetching meeting status", extra={"job_id": job_id})

    try:
        object_id = ObjectId(job_id)
    except InvalidId as exc:
        logger.warning("Invalid job id requested", extra={"job_id": job_id})
        raise HTTPException(status_code=400, detail="Invalid job identifier") from exc

    document = db["meeting_jobs"].find_one({"_id": object_id})
    if not document:
        logger.info("Meeting job not found", extra={"job_id": job_id})
        raise HTTPException(status_code=404, detail="Meeting job not found")

    response = _build_meeting_response(job_id, document)
    logger.info(f"Status poll for {job_id}: status={response.status}, progress={response.progress_percent}%, transcript_len={len(response.transcript or '')} chars")
    return response

@router.get("/{job_id}", response_model=MeetingStatusResponse)
async def get_meeting_detail(
    job_id: JobIdPath,
    db: DatabaseDep,
) -> MeetingStatusResponse:
    """Return the full meeting record including transcript and summary."""
    logger.debug("Fetching meeting detail", extra={"job_id": job_id})

    try:
        object_id = ObjectId(job_id)
    except InvalidId as exc:
        logger.warning("Invalid job id requested", extra={"job_id": job_id})
        raise HTTPException(status_code=400, detail="Invalid job identifier") from exc

    document = db["meeting_jobs"].find_one({"_id": object_id})
    if not document:
        logger.info("Meeting job not found", extra={"job_id": job_id})
        raise HTTPException(status_code=404, detail="Meeting job not found")

    response = _build_meeting_response(job_id, document)
    logger.info(f"Detail request for {job_id}: status={response.status}, progress={response.progress_percent}%, transcript_len={len(response.transcript or '')} chars")
    return response


def _build_meeting_response(job_id: str, document: dict[str, object]) -> MeetingStatusResponse:
    created_at = document.get("created_at")
    if not isinstance(created_at, datetime):
        created_at = datetime.now(timezone.utc)
    elif created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    updated_at = document.get("updated_at")
    if isinstance(updated_at, datetime) and updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    elif not isinstance(updated_at, datetime):
        updated_at = None

    completed_at = document.get("completed_at")
    if isinstance(completed_at, datetime) and completed_at.tzinfo is None:
        completed_at = completed_at.replace(tzinfo=timezone.utc)
    elif not isinstance(completed_at, datetime):
        completed_at = None

    status_message = document.get("status_message")
    if status_message is not None:
        status_message = str(status_message)

    transcript = document.get("transcript")
    if transcript is not None:
        transcript = str(transcript)

    summary = document.get("summary")
    if summary is not None:
        summary = str(summary)
    
    # Get transcript segments if available
    transcript_segments = document.get("transcript_segments", [])

    return MeetingStatusResponse(
        job_id=job_id,
        filename=str(document.get("filename", "")),
        content_type=str(document.get("content_type", "application/octet-stream")),
        status=str(document.get("status", "queued")),
        created_at=created_at,
        progress_percent=_coerce_progress(document.get("progress_percent", 0.0)),
        status_message=status_message,
        updated_at=updated_at,
        completed_at=completed_at,
        transcript=transcript,
        summary=summary,
        transcript_segments=transcript_segments,
    )


@router.get("/{job_id}/audio")
async def get_meeting_audio(
    job_id: Annotated[str, Path(description="Meeting job identifier")],
    db: DatabaseDep,
) -> StreamingResponse:
    """Retrieve the original audio file for a meeting job."""
    try:
        object_id = ObjectId(job_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail=f"Meeting {job_id} not found")

    # Get the job document to find the audio file ID
    document = db["meeting_jobs"].find_one({"_id": object_id})
    if not document:
        raise HTTPException(status_code=404, detail=f"Meeting {job_id} not found")
    
    audio_file_id = document.get("audio_file_id")
    if not audio_file_id:
        raise HTTPException(status_code=404, detail=f"No audio file found for meeting {job_id}")
    
    try:
        # Retrieve audio file from GridFS
        fs = gridfs.GridFS(db)
        audio_file = fs.get(ObjectId(audio_file_id))
        
        # Create a streaming response
        def generate_audio():
            while True:
                chunk = audio_file.read(8192)  # Read in 8KB chunks
                if not chunk:
                    break
                yield chunk
        
        # Get content type and filename from the stored file
        content_type = audio_file.content_type or "audio/mpeg"
        filename = audio_file.filename or f"meeting_{job_id}.audio"
        
        return StreamingResponse(
            generate_audio(),
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Accept-Ranges": "bytes"
            }
        )
        
    except gridfs.NoFile:
        raise HTTPException(status_code=404, detail=f"Audio file not found for meeting {job_id}")
    except Exception as e:
        logger.error(f"Error retrieving audio for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
