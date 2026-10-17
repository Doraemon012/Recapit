"""
Analytics API endpoints for meeting insights.
"""

from typing import Dict, Any
import logging
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from app.db.mongo import get_database
from app.api.v1.endpoints.auth import get_current_user_id

logger = logging.getLogger(__name__)
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

router = APIRouter()


@router.get("/{job_id}")
async def get_meeting_analytics(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
) -> Dict[str, Any]:
    """
    Get comprehensive analytics for a meeting.
    
    Returns analytics data including:
    - Action items
    - Speaker statistics
    - Sentiment analysis
    - Topics discussed
    - Timeline/highlights
    - Named entities
    - Visualizations (Plotly JSON)
    """
    logger.info(f"Analytics API called for job_id: {job_id}, user_id: {user_id}")
    try:
        # Verify meeting belongs to user
        logger.info(f"Checking if meeting {job_id} exists...")
        from bson import ObjectId
        
        # Try to find meeting by job_id first, then by _id
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            try:
                meeting = db["meeting_jobs"].find_one({"_id": ObjectId(job_id)})
            except:
                pass
        
        if not meeting:
            logger.warning(f"Meeting {job_id} not found in database")
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        logger.info(f"Meeting found. Status: {meeting.get('status')}, Analytics ID: {meeting.get('analytics_id')}")
        
        # Check ownership (if user_id is set on meeting) - skip check if user_id not set for backward compat
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            logger.warning(f"Access denied: meeting user_id={meeting_user_id}, request user_id={user_id}")
            raise HTTPException(status_code=403, detail="Access denied")
        
        logger.info(f"Access granted (user_id check {'passed' if meeting_user_id else 'skipped - no user_id on meeting'})")
        
        # Get analytics from database
        logger.info(f"Querying meeting_analytics collection for meeting_id: {job_id}")
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0}
        )
        
        if not analytics:
            # Analytics not yet generated or failed
            logger.warning(f"No analytics found in database for job {job_id}")
            logger.info(f"Checking all analytics in collection...")
            all_analytics = list(db["meeting_analytics"].find({}, {"meeting_id": 1}).limit(10))
            logger.info(f"Found {len(all_analytics)} analytics documents. Meeting IDs: {[a.get('meeting_id') for a in all_analytics]}")
            return {
                "meeting_id": job_id,
                "status": "pending",
                "message": "Analytics are being generated. Please check back shortly."
            }
        
        logger.info(f"Analytics found! Keys present: {list(analytics.keys())}")
        
        # Format for UI consumption
        logger.info("Formatting analytics for UI...")
        ai_path = Path(__file__).parent.parent.parent.parent.parent.parent / "ai"
        if ai_path.exists() and str(ai_path) not in sys.path:
            sys.path.insert(0, str(ai_path))
        
        from pipeline.analytics import format_analytics_for_ui
        
        logger.info("Calling format_analytics_for_ui()...")
        ui_data = format_analytics_for_ui(analytics)
        ui_data["status"] = "completed"
        
        logger.info(f"✅ Analytics formatted successfully. Returning data with {len(ui_data.get('action_items', []))} action items")
        return ui_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics")


@router.get("/{job_id}/action-items")
async def get_action_items(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
):
    """Get only action items for a meeting."""
    try:
        # Verify access
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get analytics
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0, "action_items": 1}
        )
        
        if not analytics:
            return {"action_items": [], "status": "pending"}
        
        return {"action_items": analytics.get("action_items", []), "status": "completed"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving action items: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve action items")


@router.get("/{job_id}/speaker-stats")
async def get_speaker_stats(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
):
    """Get speaker statistics and distribution for a meeting."""
    try:
        # Verify access
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get analytics
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0, "speaker_stats": 1}
        )
        
        if not analytics:
            return {"speaker_stats": [], "status": "pending"}
        
        # Generate chart
        ai_path = Path(__file__).parent.parent.parent.parent.parent.parent / "ai"
        if ai_path.exists() and str(ai_path) not in sys.path:
            sys.path.insert(0, str(ai_path))
        
        from pipeline.analytics import AnalyticsVisualizer
        
        visualizer = AnalyticsVisualizer()
        chart_json = visualizer.generate_speaker_distribution_chart(
            analytics.get("speaker_stats", []),
            format="plotly_json"
        )
        
        return {
            "speaker_stats": analytics.get("speaker_stats", []),
            "chart": chart_json,
            "status": "completed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving speaker stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve speaker stats")


@router.get("/{job_id}/sentiment")
async def get_sentiment_analysis(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
):
    """Get sentiment analysis for a meeting."""
    try:
        # Verify access
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get analytics
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0, "sentiment": 1}
        )
        
        if not analytics:
            return {"sentiment": None, "status": "pending"}
        
        # Generate timeline chart
        ai_path = Path(__file__).parent.parent.parent.parent.parent.parent / "ai"
        if ai_path.exists() and str(ai_path) not in sys.path:
            sys.path.insert(0, str(ai_path))
        
        from pipeline.analytics import AnalyticsVisualizer
        
        visualizer = AnalyticsVisualizer()
        chart_json = visualizer.generate_sentiment_timeline(
            analytics.get("sentiment", {}),
            format="plotly_json"
        )
        
        return {
            "sentiment": analytics.get("sentiment", {}),
            "chart": chart_json,
            "status": "completed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving sentiment: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve sentiment")


@router.get("/{job_id}/topics")
async def get_topics(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
):
    """Get key topics discussed in a meeting."""
    try:
        # Verify access
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get analytics
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0, "topics": 1}
        )
        
        if not analytics:
            return {"topics": [], "status": "pending"}
        
        # Generate chart
        ai_path = Path(__file__).parent.parent.parent.parent.parent.parent / "ai"
        if ai_path.exists() and str(ai_path) not in sys.path:
            sys.path.insert(0, str(ai_path))
        
        from pipeline.analytics import AnalyticsVisualizer
        
        visualizer = AnalyticsVisualizer()
        chart_json = visualizer.generate_topic_distribution(
            analytics.get("topics", []),
            format="plotly_json"
        )
        
        return {
            "topics": sorted(
                analytics.get("topics", []),
                key=lambda x: x.get("relevance_score", 0),
                reverse=True
            )[:10],  # Top 10
            "chart": chart_json,
            "status": "completed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving topics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve topics")


@router.get("/{job_id}/timeline")
async def get_timeline(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Database = Depends(get_database)
):
    """Get timeline/highlights for a meeting."""
    try:
        # Verify access
        meeting = db["meeting_jobs"].find_one({"job_id": job_id})
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        meeting_user_id = meeting.get("user_id")
        if meeting_user_id and meeting_user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get analytics
        analytics = db["meeting_analytics"].find_one(
            {"meeting_id": job_id},
            {"_id": 0, "timeline": 1}
        )
        
        if not analytics:
            return {"timeline": [], "status": "pending"}
        
        return {
            "timeline": sorted(
                analytics.get("timeline", []),
                key=lambda x: x.get("timestamp", 0)
            ),
            "status": "completed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve timeline")
