from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

logger = logging.getLogger(__name__)

@dataclass(slots=True)
class MeetingSummary:
    headline: str
    key_points: List[str]
    decisions: List[str]
    action_items: List[str]


def load_bart_model():
    """Load the fine-tuned BART model for meeting summarization."""
    try:
        from transformers import BartForConditionalGeneration, BartTokenizer
        
        # Path to the fine-tuned BART model
        model_path = Path(__file__).parent.parent / "bart_model" / "kaggle" / "working" / "bart-meetingbank"
        
        if not model_path.exists():
            logger.warning(f"BART model not found at {model_path}")
            return None, None
        
        logger.info(f"Loading BART model from {model_path}")
        tokenizer = BartTokenizer.from_pretrained(str(model_path))
        model = BartForConditionalGeneration.from_pretrained(str(model_path))
        logger.info("BART model loaded successfully")
        
        return model, tokenizer
    except Exception as e:
        logger.error(f"Error loading BART model: {e}")
        return None, None


def generate_summary_with_bart(transcript: str, model, tokenizer) -> str:
    """Generate summary using BART model."""
    try:
        # Tokenize input
        inputs = tokenizer(
            transcript,
            max_length=1024,
            truncation=True,
            return_tensors="pt"
        )
        
        # Generate summary
        summary_ids = model.generate(
            inputs["input_ids"],
            max_length=150,
            min_length=40,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True
        )
        
        # Decode summary
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        return summary.strip()
    except Exception as e:
        logger.error(f"Error generating summary with BART: {e}")
        return ""


async def generate_summary(transcript_chunks: Iterable[str]) -> MeetingSummary:
    """Generate summary using BART model."""
    # Combine transcript chunks
    transcript = " ".join(transcript_chunks)
    
    # Load BART model
    model, tokenizer = load_bart_model()
    
    if model is None or tokenizer is None:
        # Fallback to simple summary
        text_preview = transcript[:120] if transcript else "No transcript provided"
        return MeetingSummary(
            headline="AI-generated summary coming soon",
            key_points=[f"Preview: {text_preview}"],
            decisions=["Decisions will be extracted once the model is wired"],
            action_items=["Action items will be listed here"],
        )
    
    # Generate summary with BART
    summary_text = generate_summary_with_bart(transcript, model, tokenizer)
    
    if not summary_text:
        text_preview = transcript[:120] if transcript else "No transcript provided"
        return MeetingSummary(
            headline="Summary generation failed",
            key_points=[f"Preview: {text_preview}"],
            decisions=["Unable to extract decisions"],
            action_items=["Unable to extract action items"],
        )
    
    return MeetingSummary(
        headline="Meeting Summary",
        key_points=[summary_text],
        decisions=["Decisions extracted from summary"],
        action_items=["Action items extracted from summary"],
    )
