from __future__ import annotations

import logging
import threading
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Iterable, List

logger = logging.getLogger(__name__)

DEFAULT_SUMMARIZER_MODEL_ID = "Neyati/recapit-meetingbank-bart"
DEFAULT_SUMMARIZER_MODEL_REVISION: str | None = None

_MODEL_LOCK = threading.Lock()
_MODEL_CACHE: tuple[Any, Any] | None = None
_MODEL_CACHE_KEY: tuple[str, str | None] | None = None

@dataclass(slots=True)
class MeetingSummary:
    headline: str
    key_points: List[str]
    decisions: List[str]
    action_items: List[str]


def load_bart_model(
    model_id: str = DEFAULT_SUMMARIZER_MODEL_ID,
    model_revision: str | None = DEFAULT_SUMMARIZER_MODEL_REVISION,
    hf_token: str | None = None,
):
    """Load and cache the fine-tuned BART model for meeting summarization."""
    global _MODEL_CACHE, _MODEL_CACHE_KEY  # noqa: PLW0603 - module cache is intentional
    cache_key = (model_id, model_revision)
    if _MODEL_CACHE is not None and _MODEL_CACHE_KEY == cache_key:
        return _MODEL_CACHE

    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        with _MODEL_LOCK:
            if _MODEL_CACHE is not None and _MODEL_CACHE_KEY == cache_key:
                return _MODEL_CACHE

            logger.info("Loading BART model from Hugging Face: %s (revision=%s)", model_id, model_revision)
            tokenizer = AutoTokenizer.from_pretrained(
                model_id,
                revision=model_revision,
                token=hf_token,
            )
            model = AutoModelForSeq2SeqLM.from_pretrained(
                model_id,
                revision=model_revision,
                token=hf_token,
                torch_dtype=torch.float32,
            )
            device = "cuda" if torch.cuda.is_available() else "cpu"
            model = model.to(device)
            model.eval()
            _MODEL_CACHE = (model, tokenizer)
            _MODEL_CACHE_KEY = cache_key
            logger.info("BART model loaded successfully on %s", device)
            return _MODEL_CACHE
    except Exception as e:
        logger.error("Error loading BART model from Hugging Face (%s): %s", model_id, e)
        return None, None


def generate_summary_with_bart(transcript: str, model, tokenizer) -> str:
    """Generate summary using BART model."""
    try:
        import torch

        # Tokenize input
        inputs = tokenizer(
            transcript,
            max_length=1024,
            truncation=True,
            return_tensors="pt",
        )
        input_ids = inputs["input_ids"].to(model.device)
        attention_mask = inputs.get("attention_mask")
        if attention_mask is not None:
            attention_mask = attention_mask.to(model.device)

        generation_config = deepcopy(model.generation_config)
        generation_config.max_length = None
        generation_config.min_length = None

        # Generate summary
        with torch.inference_mode():
            summary_ids = model.generate(
                input_ids,
                attention_mask=attention_mask,
                generation_config=generation_config,
                num_beams=4,
                max_new_tokens=256,
                min_new_tokens=16,
                length_penalty=2.0,
                no_repeat_ngram_size=3,
                early_stopping=True,
                do_sample=False,
                use_cache=True,
            )

        # Decode summary
        summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        return summary.strip()
    except Exception as e:
        logger.error(f"Error generating summary with BART: {e}")
        return ""


def _reset_model_cache_for_tests() -> None:
    global _MODEL_CACHE, _MODEL_CACHE_KEY  # noqa: PLW0603 - test-only reset hook
    with _MODEL_LOCK:
        _MODEL_CACHE = None
        _MODEL_CACHE_KEY = None


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
