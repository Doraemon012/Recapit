#!/usr/bin/env python3
"""Generate analytics for a specific meeting."""

import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Setup paths
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "backend"))
sys.path.insert(0, str(project_root / "ai"))

# Load backend configuration without defining or overriding credentials here.
load_dotenv(project_root / "backend" / ".env", override=False)


def required_env(name: str) -> str:
    """Return a required setting loaded from the environment."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not configured. Add it to backend/.env or set it in the environment."
        )
    return value

from pymongo import MongoClient
from bson import ObjectId

async def generate_for_meeting(meeting_id: str):
    """Generate analytics for a specific meeting."""
    
    # Import after path setup
    from pipeline.analytics import MeetingAnalytics, AnalyticsStorage
    
    client = MongoClient(required_env("MONGO_URI"))
    db = client[required_env("MONGO_DB_NAME")]
    
    # Get meeting
    print(f"🔍 Fetching meeting {meeting_id}...")
    meeting = db["meeting_jobs"].find_one({"_id": ObjectId(meeting_id)})
    
    if not meeting:
        print(f"❌ Meeting not found")
        return
    
    print(f"✅ Meeting found: {meeting.get('filename')}")
    print(f"   Status: {meeting.get('status')}")
    print(f"   Transcript: {len(meeting.get('transcript', ''))} chars")
    print(f"   Segments: {len(meeting.get('transcript_segments', []))}")
    print(f"   Summary: {len(meeting.get('summary', ''))} chars")
    
    transcript_segments = meeting.get('transcript_segments', [])
    summary = meeting.get('summary', '')
    
    if not transcript_segments:
        print(f"❌ No transcript segments - cannot generate analytics")
        return
    
    # Generate analytics
    print(f"\n🔄 Generating analytics...")
    cohere_key = required_env("COHERE_API_KEY")
    analytics_processor = MeetingAnalytics(cohere_key)
    
    analytics_data = await asyncio.to_thread(
        analytics_processor.process_transcript,
        transcript_segments=transcript_segments,
        summary=summary,
        meeting_id=meeting_id
    )
    
    if not analytics_data:
        print(f"❌ Analytics generation failed")
        return
    
    print(f"\n✅ Analytics generated!")
    print(f"   Action items: {len(analytics_data.get('action_items', []))}")
    print(f"   Topics: {len(analytics_data.get('topics', []))}")
    print(f"   Timeline: {len(analytics_data.get('timeline', []))}")
    print(f"   Speaker stats: {len(analytics_data.get('speaker_stats', []))}")
    print(f"   Sentiment: {analytics_data.get('sentiment', {}).get('overall', 'N/A')}")
    
    # Show action items
    if analytics_data.get('action_items'):
        print(f"\n📋 Action Items:")
        for item in analytics_data['action_items'][:3]:
            print(f"   • {item.get('task')} ({item.get('priority')})")
    
    # Show topics
    if analytics_data.get('topics'):
        print(f"\n💡 Topics:")
        for topic in analytics_data['topics'][:3]:
            print(f"   • {topic.get('topic')} (score: {topic.get('relevance_score')})")
    
    # Store in MongoDB
    print(f"\n💾 Storing in MongoDB...")
    storage = AnalyticsStorage(db)
    success = storage.store_analytics(analytics_data)
    
    if success:
        print(f"✅ Analytics stored successfully!")
        
        # Update meeting with analytics_id
        db["meeting_jobs"].update_one(
            {"_id": ObjectId(meeting_id)},
            {"$set": {"analytics_id": meeting_id}}
        )
        print(f"✅ Meeting updated with analytics_id")
    else:
        print(f"❌ Failed to store analytics")
    
    client.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        meeting_id = sys.argv[1]
    else:
        # Use latest meeting
        client = MongoClient(required_env("MONGO_URI"))
        db = client[required_env("MONGO_DB_NAME")]
        meeting = db["meeting_jobs"].find_one({}, sort=[('_id', -1)])
        meeting_id = str(meeting['_id'])
        client.close()
        print(f"Using latest meeting: {meeting_id}")
    
    asyncio.run(generate_for_meeting(meeting_id))
