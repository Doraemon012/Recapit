from datetime import datetime, timezone
import asyncio
import logging
from typing import Annotated, TypeAlias, Optional

from fastapi import APIRouter, Cookie, Depends, File, HTTPException, UploadFile
from pymongo.database import Database
import gridfs

from app.db.mongo import get_database
from app.models.meeting import MeetingQueuedResponse
from app.services.pipeline import run_meeting_pipeline
from app.api.v1.endpoints.auth import get_current_user_id

router = APIRouter()

logger = logging.getLogger("recapit.api.ingest")


DatabaseDep: TypeAlias = Annotated[Database, Depends(get_database)]
FileUpload: TypeAlias = Annotated[UploadFile, File(...)]

_pipeline_tasks: set[asyncio.Task[None]] = set()


def _register_pipeline_task(task: asyncio.Task[None]) -> None:
    _pipeline_tasks.add(task)

    def _cleanup(completed_task: asyncio.Task[None]) -> None:
        _pipeline_tasks.discard(completed_task)
        try:
            completed_task.result()
        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Background meeting pipeline failed")

    task.add_done_callback(_cleanup)


@router.post("/upload", response_model=MeetingQueuedResponse)
async def upload_meeting(
    file: FileUpload,
    db: DatabaseDep,
    user_id: Optional[str] = Depends(get_current_user_id),
) -> MeetingQueuedResponse:
    """Accept a meeting audio file and hand it off to the orchestration layer."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file is missing a filename")

    file_bytes = await file.read()
    await file.close()

    created_at = datetime.now(timezone.utc)
    metadata = {
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "status": "queued",
        "status_message": "Queued for processing",
        "progress_percent": 0.0,
        "created_at": created_at,
        "updated_at": created_at,
        "size_bytes": len(file_bytes),
    }
    
    # Associate with user if authenticated
    if user_id:
        metadata["user_id"] = user_id
    
    logger.info("Received upload: filename=%s content_type=%s user_id=%s", 
                metadata["filename"], metadata["content_type"], user_id or "anonymous")

    result = db["meeting_jobs"].insert_one(metadata)
    job_id = str(result.inserted_id)
    logger.info("Enqueued meeting job id=%s", job_id)
    
    # Store audio file in GridFS for later retrieval
    try:
        fs = gridfs.GridFS(db)
        audio_file_id = fs.put(
            file_bytes,
            filename=file.filename,
            content_type=file.content_type,
            job_id=job_id
        )
        # Update job with audio file reference
        db["meeting_jobs"].update_one(
            {"_id": result.inserted_id},
            {"$set": {"audio_file_id": str(audio_file_id)}}
        )
        logger.info("Stored audio file for job %s with file_id=%s", job_id, audio_file_id)
    except Exception as e:
        logger.error("Failed to store audio file for job %s: %s", job_id, str(e))

    task = asyncio.create_task(
        run_meeting_pipeline(
            job_id=job_id,
            file_bytes=file_bytes,
            filename=metadata["filename"],
            content_type=metadata["content_type"],
        )
    )
    _register_pipeline_task(task)

    return MeetingQueuedResponse(
        job_id=job_id,
        filename=metadata["filename"],
        content_type=metadata["content_type"],
        status=metadata["status"],
        created_at=created_at,
        progress_percent=metadata["progress_percent"],
        status_message=metadata["status_message"],
    )
