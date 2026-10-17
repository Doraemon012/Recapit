"""
Meeting Analytics Module using Cohere LLM

This module processes meeting transcripts and generates comprehensive analytics
using a single LLM call to minimize costs. All outputs are structured for
MongoDB storage and UI consumption.

Required packages (install manually):
- cohere
- pymongo
- matplotlib
- plotly
- pandas
- numpy
"""

import json
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import base64
from io import BytesIO

logger = logging.getLogger(__name__)
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


class MeetingAnalytics:
    """
    Process meeting transcripts using Cohere LLM to extract insights.
    Uses a single consolidated prompt to minimize API costs.
    """

    def __init__(self, cohere_api_key: str):
        """
        Initialize analytics processor with Cohere API key.
        
        Args:
            cohere_api_key: API key for Cohere LLM
        """
        logger.info(f"Initializing MeetingAnalytics with API key: {cohere_api_key[:10]}...")
        try:
            import cohere
            
            self.client = cohere.Client(cohere_api_key)
            self.cohere_available = True
            logger.info("✅ Cohere client initialized successfully")
        except ImportError:
            logger.warning("Cohere library not installed. Analytics features disabled.")
            self.cohere_available = False
            self.client = None
        except Exception as e:
            logger.error(f"Failed to initialize Cohere client: {e}")
            self.cohere_available = False
            self.client = None

    def create_consolidated_prompt(
        self,
        transcript_segments: List[Dict[str, Any]],
        summary: Optional[str] = None
    ) -> str:
        """
        Create a single comprehensive prompt that requests all analytics at once.
        
        Args:
            transcript_segments: List of transcript segments with speaker, start, end, text
            summary: Optional meeting summary
            
        Returns:
            Formatted prompt string
        """
        # Format transcript
        transcript_text = "\n".join([
            f"[{seg['start']:.2f}s - {seg['end']:.2f}s] {seg['speaker']}: {seg['text']}"
            for seg in transcript_segments
        ])
        
        prompt = f"""You are an expert meeting analyst. Analyze the following meeting transcript and provide comprehensive analytics in a single JSON response.

MEETING TRANSCRIPT:
{transcript_text}

"""
        if summary:
            prompt += f"""MEETING SUMMARY:
{summary}

"""

        prompt += """TASK: Extract and analyze the following information. Return ONLY a valid JSON object. Keep arrays concise (max 5-8 items each).

{
  "action_items": [
    {
      "task": "string - clear description",
      "owner": "string - person responsible or 'Unassigned'",
      "priority": "High/Medium/Low",
      "mentioned_at": "number - timestamp in seconds",
      "context": "string - brief context"
    }
  ],
  "speaker_stats": [
    {
      "speaker": "string - speaker name",
      "word_count": "number - approximate word count",
      "speaking_time": "number - total seconds spoken",
      "turn_count": "number - number of times speaker spoke",
      "engagement_score": "number - 0-100 score"
    }
  ],
  "sentiment": {
    "overall": "string - Positive/Neutral/Negative",
    "overall_score": "number - -1 to 1",
    "confidence": "number - 0 to 1",
    "segments": [
      {
        "timestamp": "number - seconds",
        "sentiment": "string - Positive/Neutral/Negative",
        "score": "number - -1 to 1",
        "reason": "string - brief explanation"
      }
    ]
  },
  "topics": [
    {
      "topic": "string - topic name",
      "keywords": ["string - relevant keywords"],
      "mentioned_at": ["number - timestamps in seconds"],
      "relevance_score": "number - 0-100",
      "summary": "string - brief topic summary"
    }
  ],
  "timeline": [
    {
      "timestamp": "number - seconds",
      "event_type": "string - Decision/Discussion/Question/Action",
      "title": "string - brief headline",
      "description": "string - detailed description",
      "participants": ["string - speaker names involved"]
    }
  ],
  "named_entities": {
    "people": ["string - person names mentioned"],
    "organizations": ["string - organization names"],
    "dates": ["string - dates mentioned"],
    "locations": ["string - locations"],
    "products": ["string - product/service names"],
    "documents": ["string - document/file names mentioned"]
  },
  "key_insights": [
    "string - important insight or takeaway"
  ],
  "meeting_metrics": {
    "total_duration": "number - seconds",
    "total_speakers": "number",
    "participation_balance": "number - 0-100 score (100 = perfectly balanced)",
    "decision_count": "number - decisions made",
    "question_count": "number - questions asked",
    "engagement_level": "string - High/Medium/Low"
  }
}

IMPORTANT:
- Return ONLY valid JSON, no markdown or extra text
- Keep arrays concise: max 5 action items, 5 topics, 8 timeline events, 5 sentiment segments
- Use empty arrays [] if no data found
- Ensure all required fields present
- Be concise in descriptions (under 100 chars each)
"""
        
        return prompt

    def process_transcript(
        self,
        transcript_segments: List[Dict[str, Any]],
        summary: Optional[str] = None,
        meeting_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Process transcript using single LLM call to extract all analytics.
        
        Args:
            transcript_segments: List of transcript segments
            summary: Optional meeting summary
            meeting_id: Optional meeting identifier
            
        Returns:
            Dictionary containing all analytics, or None if processing fails
        """
        logger.info(f"🔄 Processing transcript for meeting {meeting_id}")
        logger.info(f"Segments: {len(transcript_segments)}, Summary length: {len(summary) if summary else 0}")
        
        if not self.cohere_available:
            logger.error("❌ Cohere not available - client not initialized")
            return None
            
        try:
            # Create consolidated prompt
            logger.info("Creating consolidated prompt...")
            prompt = self.create_consolidated_prompt(transcript_segments, summary)
            logger.info(f"Prompt created ({len(prompt)} chars). Calling Cohere API...")
            
            # Single LLM call for all analytics
            response = self.client.chat(
                message=prompt,
                model="command-r-08-2024",  # Current Cohere model as of Nov 2025
                temperature=0.3,  # Lower temperature for more consistent structured output
                max_tokens=4096  # Model maximum
            )
            
            logger.info(f"✅ Cohere API responded successfully")
            
            # Parse JSON response
            response_text = response.text.strip()
            logger.info(f"Response text length: {len(response_text)} chars")
            
            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                logger.info("Removing markdown code blocks from response...")
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            logger.info("Parsing JSON response...")
            analytics_data = json.loads(response_text)
            logger.info(f"✅ JSON parsed successfully. Top-level keys: {list(analytics_data.keys())}")
            
            # Add metadata
            analytics_data["processed_at"] = datetime.utcnow().isoformat()
            analytics_data["meeting_id"] = meeting_id
            analytics_data["llm_model"] = "cohere/command-r-08-2024"
            
            # Validate and enrich data
            logger.info("Validating and enriching analytics data...")
            analytics_data = self._validate_and_enrich(analytics_data, transcript_segments)
            
            logger.info(f"✅ Successfully processed analytics for meeting {meeting_id}")
            logger.info(f"   - Action items: {len(analytics_data.get('action_items', []))}")
            logger.info(f"   - Topics: {len(analytics_data.get('topics', []))}")
            logger.info(f"   - Timeline events: {len(analytics_data.get('timeline', []))}")
            logger.info(f"   - Speaker stats: {len(analytics_data.get('speaker_stats', []))}")
            return analytics_data
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse LLM JSON response: {e}")
            logger.error(f"Response text: {response_text[:500]}...")
            return None
        except Exception as e:
            logger.error(f"❌ Error processing transcript: {e}", exc_info=True)
            return None

    def _validate_and_enrich(
        self,
        analytics_data: Dict[str, Any],
        transcript_segments: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate and enrich analytics data with computed metrics.
        
        Args:
            analytics_data: Raw analytics from LLM
            transcript_segments: Original transcript segments
            
        Returns:
            Enhanced analytics data
        """
        # Calculate accurate speaker stats from transcript
        speaker_data = {}
        for seg in transcript_segments:
            speaker = seg["speaker"]
            if speaker not in speaker_data:
                speaker_data[speaker] = {
                    "word_count": 0,
                    "speaking_time": 0.0,
                    "turn_count": 0
                }
            speaker_data[speaker]["word_count"] += len(seg["text"].split())
            speaker_data[speaker]["speaking_time"] += seg["end"] - seg["start"]
            speaker_data[speaker]["turn_count"] += 1
        
        # Update speaker stats with accurate data
        for stat in analytics_data.get("speaker_stats", []):
            speaker = stat["speaker"]
            if speaker in speaker_data:
                stat["word_count"] = speaker_data[speaker]["word_count"]
                stat["speaking_time"] = round(speaker_data[speaker]["speaking_time"], 2)
                stat["turn_count"] = speaker_data[speaker]["turn_count"]
        
        # Calculate total duration
        if transcript_segments:
            analytics_data.setdefault("meeting_metrics", {})["total_duration"] = round(
                transcript_segments[-1]["end"], 2
            )
        
        return analytics_data


class AnalyticsStorage:
    """
    Handle MongoDB storage and retrieval of meeting analytics.
    """

    def __init__(self, db):
        """
        Initialize storage handler with MongoDB database.
        
        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.analytics_collection = db["meeting_analytics"]
        self._ensure_indexes()

    def _ensure_indexes(self):
        """Create indexes for efficient queries."""
        self.analytics_collection.create_index("meeting_id", unique=True)
        self.analytics_collection.create_index("processed_at")
        self.analytics_collection.create_index([("meeting_id", 1), ("processed_at", -1)])

    def store_analytics(self, analytics_data: Dict[str, Any]) -> bool:
        """
        Store analytics data in MongoDB.
        
        Args:
            analytics_data: Complete analytics dictionary
            
        Returns:
            True if successful, False otherwise
        """
        try:
            meeting_id = analytics_data.get("meeting_id")
            if not meeting_id:
                logger.error("No meeting_id in analytics data")
                return False
            
            # Upsert analytics
            self.analytics_collection.update_one(
                {"meeting_id": meeting_id},
                {"$set": analytics_data},
                upsert=True
            )
            
            logger.info(f"Stored analytics for meeting {meeting_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing analytics: {e}")
            return False

    def get_analytics(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve analytics for a meeting.
        
        Args:
            meeting_id: Meeting identifier
            
        Returns:
            Analytics dictionary or None if not found
        """
        try:
            analytics = self.analytics_collection.find_one(
                {"meeting_id": meeting_id},
                {"_id": 0}  # Exclude MongoDB _id
            )
            return analytics
        except Exception as e:
            logger.error(f"Error retrieving analytics: {e}")
            return None

    def get_user_analytics(self, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieve analytics for all meetings of a user.
        
        Args:
            user_id: User identifier
            limit: Maximum number of results
            
        Returns:
            List of analytics dictionaries
        """
        try:
            # This requires a join with meetings collection
            # For now, return recent analytics
            analytics = list(
                self.analytics_collection.find(
                    {},
                    {"_id": 0}
                ).sort("processed_at", -1).limit(limit)
            )
            return analytics
        except Exception as e:
            logger.error(f"Error retrieving user analytics: {e}")
            return []


class AnalyticsVisualizer:
    """
    Generate visualizations for meeting analytics using matplotlib and plotly.
    """

    @staticmethod
    def generate_speaker_distribution_chart(
        speaker_stats: List[Dict[str, Any]],
        format: str = "base64"
    ) -> Optional[str]:
        """
        Generate speaker distribution pie chart.
        
        Args:
            speaker_stats: List of speaker statistics
            format: Output format - 'base64' or 'plotly_json'
            
        Returns:
            Base64 encoded image or Plotly JSON string
        """
        try:
            if format == "base64":
                import matplotlib.pyplot as plt
                
                speakers = [s["speaker"] for s in speaker_stats]
                speaking_times = [s["speaking_time"] for s in speaker_stats]
                
                fig, ax = plt.subplots(figsize=(10, 6))
                colors = plt.cm.Set3.colors[:len(speakers)]
                
                wedges, texts, autotexts = ax.pie(
                    speaking_times,
                    labels=speakers,
                    autopct='%1.1f%%',
                    colors=colors,
                    startangle=90
                )
                
                # Style improvements
                for text in texts:
                    text.set_fontsize(12)
                    text.set_weight("bold")
                for autotext in autotexts:
                    autotext.set_color('white')
                    autotext.set_fontsize(10)
                    autotext.set_weight("bold")
                
                ax.set_title("Speaker Distribution by Time", fontsize=16, weight='bold', pad=20)
                
                # Convert to base64
                buffer = BytesIO()
                plt.tight_layout()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.read()).decode()
                plt.close()
                
                return f"data:image/png;base64,{image_base64}"
                
            elif format == "plotly_json":
                import plotly.graph_objects as go
                
                speakers = [s["speaker"] for s in speaker_stats]
                speaking_times = [s["speaking_time"] for s in speaker_stats]
                
                fig = go.Figure(data=[go.Pie(
                    labels=speakers,
                    values=speaking_times,
                    hole=0.3,
                    marker=dict(
                        colors=['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'],
                        line=dict(color='#ffffff', width=2)
                    )
                )])
                
                fig.update_layout(
                    title="Speaker Distribution by Time",
                    font=dict(size=14),
                    showlegend=True,
                    height=400
                )
                
                return fig.to_json()
                
        except Exception as e:
            logger.error(f"Error generating speaker distribution chart: {e}")
            return None

    @staticmethod
    def generate_sentiment_timeline(
        sentiment_data: Dict[str, Any],
        format: str = "base64"
    ) -> Optional[str]:
        """
        Generate sentiment timeline graph.
        
        Args:
            sentiment_data: Sentiment analytics data
            format: Output format - 'base64' or 'plotly_json'
            
        Returns:
            Base64 encoded image or Plotly JSON string
        """
        try:
            segments = sentiment_data.get("segments", [])
            if not segments:
                return None
            
            timestamps = [s["timestamp"] for s in segments]
            scores = [s["score"] for s in segments]
            labels = [s["sentiment"] for s in segments]
            
            if format == "base64":
                import matplotlib.pyplot as plt
                import numpy as np
                
                fig, ax = plt.subplots(figsize=(12, 6))
                
                # Color points by sentiment
                colors = ['#10B981' if s == "Positive" else '#EF4444' if s == "Negative" else '#94A3B8' 
                          for s in labels]
                
                ax.plot(timestamps, scores, 'o-', linewidth=2, markersize=8, color='#4F46E5', alpha=0.6)
                ax.scatter(timestamps, scores, c=colors, s=100, zorder=5, edgecolors='white', linewidth=2)
                
                # Add horizontal line at 0
                ax.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
                
                # Styling
                ax.set_xlabel('Time (seconds)', fontsize=12, weight='bold')
                ax.set_ylabel('Sentiment Score', fontsize=12, weight='bold')
                ax.set_title('Sentiment Timeline', fontsize=16, weight='bold', pad=20)
                ax.grid(True, alpha=0.3)
                ax.set_ylim(-1.1, 1.1)
                
                # Legend
                from matplotlib.patches import Patch
                legend_elements = [
                    Patch(facecolor='#10B981', label='Positive'),
                    Patch(facecolor='#94A3B8', label='Neutral'),
                    Patch(facecolor='#EF4444', label='Negative')
                ]
                ax.legend(handles=legend_elements, loc='upper right')
                
                # Convert to base64
                buffer = BytesIO()
                plt.tight_layout()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.read()).decode()
                plt.close()
                
                return f"data:image/png;base64,{image_base64}"
                
            elif format == "plotly_json":
                import plotly.graph_objects as go
                
                # Color mapping
                color_map = {
                    "Positive": "#10B981",
                    "Neutral": "#94A3B8",
                    "Negative": "#EF4444"
                }
                colors = [color_map.get(label, "#94A3B8") for label in labels]
                
                fig = go.Figure()
                
                # Line trace
                fig.add_trace(go.Scatter(
                    x=timestamps,
                    y=scores,
                    mode='lines+markers',
                    line=dict(color='#4F46E5', width=3),
                    marker=dict(
                        size=12,
                        color=colors,
                        line=dict(color='white', width=2)
                    ),
                    text=labels,
                    hovertemplate='<b>Time:</b> %{x}s<br><b>Sentiment:</b> %{text}<br><b>Score:</b> %{y:.2f}<extra></extra>'
                ))
                
                # Zero line
                fig.add_hline(y=0, line_dash="dash", line_color="gray", opacity=0.5)
                
                fig.update_layout(
                    title="Sentiment Timeline",
                    xaxis_title="Time (seconds)",
                    yaxis_title="Sentiment Score",
                    font=dict(size=14),
                    height=400,
                    yaxis=dict(range=[-1.1, 1.1])
                )
                
                return fig.to_json()
                
        except Exception as e:
            logger.error(f"Error generating sentiment timeline: {e}")
            return None

    @staticmethod
    def generate_topic_distribution(
        topics: List[Dict[str, Any]],
        format: str = "base64"
    ) -> Optional[str]:
        """
        Generate topic distribution bar chart.
        
        Args:
            topics: List of topics with relevance scores
            format: Output format - 'base64' or 'plotly_json'
            
        Returns:
            Base64 encoded image or Plotly JSON string
        """
        try:
            if not topics:
                return None
            
            # Sort by relevance
            topics = sorted(topics, key=lambda x: x.get("relevance_score", 0), reverse=True)
            topic_names = [t["topic"] for t in topics[:10]]  # Top 10
            scores = [t["relevance_score"] for t in topics[:10]]
            
            if format == "base64":
                import matplotlib.pyplot as plt
                
                fig, ax = plt.subplots(figsize=(10, 6))
                
                bars = ax.barh(topic_names, scores, color='#4F46E5', alpha=0.8)
                
                # Add value labels
                for bar in bars:
                    width = bar.get_width()
                    ax.text(width + 1, bar.get_y() + bar.get_height()/2,
                           f'{width:.0f}',
                           ha='left', va='center', fontsize=10, weight='bold')
                
                ax.set_xlabel('Relevance Score', fontsize=12, weight='bold')
                ax.set_title('Key Topics Discussed', fontsize=16, weight='bold', pad=20)
                ax.set_xlim(0, 110)
                
                # Convert to base64
                buffer = BytesIO()
                plt.tight_layout()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.read()).decode()
                plt.close()
                
                return f"data:image/png;base64,{image_base64}"
                
            elif format == "plotly_json":
                import plotly.graph_objects as go
                
                fig = go.Figure(data=[go.Bar(
                    y=topic_names,
                    x=scores,
                    orientation='h',
                    marker=dict(
                        color='#4F46E5',
                        line=dict(color='#ffffff', width=1)
                    ),
                    text=scores,
                    texttemplate='%{text:.0f}',
                    textposition='outside'
                )])
                
                fig.update_layout(
                    title="Key Topics Discussed",
                    xaxis_title="Relevance Score",
                    font=dict(size=14),
                    height=400,
                    xaxis=dict(range=[0, 110])
                )
                
                return fig.to_json()
                
        except Exception as e:
            logger.error(f"Error generating topic distribution: {e}")
            return None

    @staticmethod
    def generate_participation_heatmap(
        speaker_stats: List[Dict[str, Any]],
        format: str = "base64"
    ) -> Optional[str]:
        """
        Generate participation comparison chart.
        
        Args:
            speaker_stats: List of speaker statistics
            format: Output format - 'base64' or 'plotly_json'
            
        Returns:
            Base64 encoded image or Plotly JSON string
        """
        try:
            import numpy as np
            
            speakers = [s["speaker"] for s in speaker_stats]
            word_counts = [s["word_count"] for s in speaker_stats]
            turn_counts = [s["turn_count"] for s in speaker_stats]
            engagement = [s.get("engagement_score", 50) for s in speaker_stats]
            
            if format == "plotly_json":
                import plotly.graph_objects as go
                
                fig = go.Figure()
                
                # Normalize data for comparison
                max_words = max(word_counts) if word_counts else 1
                max_turns = max(turn_counts) if turn_counts else 1
                
                fig.add_trace(go.Bar(
                    name='Word Count',
                    x=speakers,
                    y=[w/max_words*100 for w in word_counts],
                    marker_color='#4F46E5'
                ))
                
                fig.add_trace(go.Bar(
                    name='Speaking Turns',
                    x=speakers,
                    y=[t/max_turns*100 for t in turn_counts],
                    marker_color='#06B6D4'
                ))
                
                fig.add_trace(go.Bar(
                    name='Engagement',
                    x=speakers,
                    y=engagement,
                    marker_color='#10B981'
                ))
                
                fig.update_layout(
                    title="Participation Metrics by Speaker",
                    xaxis_title="Speaker",
                    yaxis_title="Normalized Score",
                    barmode='group',
                    font=dict(size=14),
                    height=400
                )
                
                return fig.to_json()
                
        except Exception as e:
            logger.error(f"Error generating participation heatmap: {e}")
            return None


def format_analytics_for_ui(analytics_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format analytics data for clean UI consumption.
    
    Args:
        analytics_data: Raw analytics from database
        
    Returns:
        UI-friendly formatted data
    """
    if not analytics_data:
        return {}
    
    # Generate graphs
    visualizer = AnalyticsVisualizer()
    
    ui_data = {
        "meeting_id": analytics_data.get("meeting_id"),
        "processed_at": analytics_data.get("processed_at"),
        
        # Action Items
        "action_items": analytics_data.get("action_items", []),
        
        # Speaker Statistics
        "speaker_stats": analytics_data.get("speaker_stats", []),
        
        # Sentiment
        "sentiment": {
            "overall": analytics_data.get("sentiment", {}).get("overall", "Neutral"),
            "score": analytics_data.get("sentiment", {}).get("overall_score", 0),
            "confidence": analytics_data.get("sentiment", {}).get("confidence", 0),
            "timeline": analytics_data.get("sentiment", {}).get("segments", [])
        },
        
        # Topics
        "topics": sorted(
            analytics_data.get("topics", []),
            key=lambda x: x.get("relevance_score", 0),
            reverse=True
        )[:8],  # Top 8 topics
        
        # Timeline
        "timeline": sorted(
            analytics_data.get("timeline", []),
            key=lambda x: x.get("timestamp", 0)
        ),
        
        # Named Entities
        "entities": analytics_data.get("named_entities", {}),
        
        # Key Insights
        "insights": analytics_data.get("key_insights", []),
        
        # Metrics
        "metrics": analytics_data.get("meeting_metrics", {}),
        
        # Visualizations (Plotly JSON for interactive charts)
        "charts": {
            "speaker_distribution": visualizer.generate_speaker_distribution_chart(
                analytics_data.get("speaker_stats", []),
                format="plotly_json"
            ),
            "sentiment_timeline": visualizer.generate_sentiment_timeline(
                analytics_data.get("sentiment", {}),
                format="plotly_json"
            ),
            "topic_distribution": visualizer.generate_topic_distribution(
                analytics_data.get("topics", []),
                format="plotly_json"
            ),
            "participation_metrics": visualizer.generate_participation_heatmap(
                analytics_data.get("speaker_stats", []),
                format="plotly_json"
            )
        }
    }
    
    return ui_data


# Example usage
if __name__ == "__main__":
    # Example transcript segments
    sample_segments = [
        {
            "speaker": "SPEAKER_0",
            "start": 0.5,
            "end": 5.2,
            "text": "Good morning everyone. Let's start our quarterly review meeting."
        },
        {
            "speaker": "SPEAKER_1",
            "start": 5.8,
            "end": 12.3,
            "text": "Thanks for organizing this. I'd like to discuss our Q4 roadmap and resource allocation."
        },
        # ... more segments
    ]
    
    sample_summary = "Quarterly review meeting discussing Q4 roadmap, resource allocation, and key milestones."
    
    # Initialize analytics processor
    analytics = MeetingAnalytics(cohere_api_key="your-api-key-here")
    
    # Process transcript (single LLM call)
    result = analytics.process_transcript(
        transcript_segments=sample_segments,
        summary=sample_summary,
        meeting_id="meeting_123"
    )
    
    if result:
        print("Analytics generated successfully!")
        print(json.dumps(result, indent=2))
        
        # Store in MongoDB (assuming db is initialized)
        # storage = AnalyticsStorage(db)
        # storage.store_analytics(result)
        
        # Format for UI
        ui_data = format_analytics_for_ui(result)
        print("\nUI-ready data prepared with interactive charts!")
