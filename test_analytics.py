#!/usr/bin/env python3
"""
Test script to verify analytics generation for existing meetings.
"""

import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
ai_path = Path(__file__).parent / "ai"
sys.path.insert(0, str(backend_path))
sys.path.insert(0, str(ai_path))

# Load credentials from backend/.env without overriding explicit environment variables.
load_dotenv(backend_path / ".env", override=False)

import asyncio
from pymongo import MongoClient
from pipeline.analytics import MeetingAnalytics, AnalyticsStorage

async def test_analytics():
    """Test analytics generation on an existing completed meeting."""
    
    # Connect to MongoDB
    print("🔌 Connecting to MongoDB...")
    client = MongoClient(os.environ["MONGO_URI"])
    db = client[os.environ["MONGO_DB_NAME"]]
    
    # Find a completed meeting with transcript
    print("🔍 Finding completed meetings with transcripts...")
    meetings = list(db["meeting_jobs"].find({
        "status": "completed",
        "transcript_segments": {"$exists": True, "$ne": []}
    }).limit(5))
    
    if not meetings:
        print("❌ No completed meetings with transcripts found")
        return
    
    print(f"✅ Found {len(meetings)} completed meetings")
    
    for meeting in meetings:
        job_id = meeting.get("job_id")
        print(f"\n{'='*60}")
        print(f"📋 Testing meeting: {job_id}")
        print(f"   Status: {meeting.get('status')}")
        print(f"   Filename: {meeting.get('filename')}")
        print(f"   Transcript segments: {len(meeting.get('transcript_segments', []))}")
        print(f"   Summary: {len(meeting.get('summary', ''))} chars")
        
        # Check if analytics already exist
        existing = db["meeting_analytics"].find_one({"meeting_id": job_id})
        if existing:
            print(f"   ✅ Analytics already exist")
            print(f"   Action items: {len(existing.get('action_items', []))}")
            print(f"   Topics: {len(existing.get('topics', []))}")
            print(f"   Timeline events: {len(existing.get('timeline', []))}")
            continue
        
        print(f"   ⚠️  No analytics found - generating...")
        
        # Generate analytics
        try:
            cohere_key = os.environ.get("COHERE_API_KEY")
            analytics = MeetingAnalytics(cohere_key)
            
            analytics_data = await asyncio.to_thread(
                analytics.process_transcript,
                transcript_segments=meeting.get("transcript_segments", []),
                summary=meeting.get("summary", ""),
                meeting_id=job_id
            )
            
            if analytics_data:
                print(f"   ✅ Analytics generated successfully!")
                print(f"   Action items: {len(analytics_data.get('action_items', []))}")
                print(f"   Topics: {len(analytics_data.get('topics', []))}")
                print(f"   Timeline events: {len(analytics_data.get('timeline', []))}")
                
                # Store in DB
                storage = AnalyticsStorage(db)
                success = storage.store_analytics(analytics_data)
                if success:
                    print(f"   ✅ Analytics stored in database")
                    
                    # Update meeting with analytics_id
                    db["meeting_jobs"].update_one(
                        {"job_id": job_id},
                        {"$set": {"analytics_id": job_id}}
                    )
                    print(f"   ✅ Meeting updated with analytics_id")
                else:
                    print(f"   ❌ Failed to store analytics")
            else:
                print(f"   ❌ Analytics generation returned None")
                
        except Exception as e:
            print(f"   ❌ Error generating analytics: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n{'='*60}")
    print("✅ Test complete!")
    client.close()

if __name__ == "__main__":
    asyncio.run(test_analytics())
