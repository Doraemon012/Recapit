from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(slots=True)
class ActionItem:
    owner: str
    action: str
    due: str | None = None


@dataclass(slots=True)
class Decision:
    summary: str
    context: str | None = None


@dataclass(slots=True)
class ExtractionPayload:
    actions: List[ActionItem]
    decisions: List[Decision]


async def extract_structured_items(summary_text: str) -> ExtractionPayload:
    """Placeholder LLM call that should return structured actions + decisions."""
    return ExtractionPayload(
        actions=[
            ActionItem(owner="owner@example.com", action="Hook up LLM provider", due=None),
        ],
        decisions=[
            Decision(summary="Baseline extractor implemented", context=summary_text[:120]),
        ],
    )
