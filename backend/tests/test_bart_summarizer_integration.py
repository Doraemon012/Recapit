from __future__ import annotations

import asyncio
import concurrent.futures
import contextlib
import sys
import types
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def test_load_bart_model_caches_singleton(monkeypatch):
    from ai.pipeline import summarizer

    summarizer._reset_model_cache_for_tests()

    class FakeTokenizer:
        calls = 0

        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            cls.calls += 1
            return cls()

    class FakeGenerationConfig:
        max_length = 128
        min_length = 1

    class FakeModel:
        calls = 0

        def __init__(self):
            self.device = "cpu"
            self.generation_config = FakeGenerationConfig()

        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            cls.calls += 1
            return cls()

        def to(self, device):
            self.device = device
            return self

        def eval(self):
            return None

    fake_torch = types.SimpleNamespace(
        float32=object(),
        cuda=types.SimpleNamespace(is_available=lambda: False),
        inference_mode=contextlib.nullcontext,
    )
    fake_transformers = types.SimpleNamespace(
        AutoTokenizer=FakeTokenizer,
        AutoModelForSeq2SeqLM=FakeModel,
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)

    model_1, tokenizer_1 = summarizer.load_bart_model(
        model_id="Neyati/recapit-meetingbank-bart",
        model_revision="checkpoint-1938",
        hf_token="token",
    )
    model_2, tokenizer_2 = summarizer.load_bart_model(
        model_id="Neyati/recapit-meetingbank-bart",
        model_revision="checkpoint-1938",
        hf_token="token",
    )

    assert model_1 is model_2
    assert tokenizer_1 is tokenizer_2
    assert FakeTokenizer.calls == 1
    assert FakeModel.calls == 1

    summarizer._reset_model_cache_for_tests()
    FakeTokenizer.calls = 0
    FakeModel.calls = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [
            pool.submit(
                summarizer.load_bart_model,
                "Neyati/recapit-meetingbank-bart",
                "checkpoint-1938",
                "token",
            )
            for _ in range(4)
        ]
        results = [future.result() for future in futures]

    first_model = results[0][0]
    first_tokenizer = results[0][1]
    for model, tokenizer in results[1:]:
        assert model is first_model
        assert tokenizer is first_tokenizer
    assert FakeTokenizer.calls == 1
    assert FakeModel.calls == 1


def test_generate_summary_uses_expected_generation_settings(monkeypatch):
    from ai.pipeline import summarizer

    class FakeTensor:
        def __init__(self):
            self.last_device = None

        def to(self, device):
            self.last_device = device
            return self

    class FakeTokenizer:
        def __init__(self):
            self.tokenize_kwargs = {}

        def __call__(self, transcript, **kwargs):
            self.tokenize_kwargs = kwargs
            return {"input_ids": FakeTensor(), "attention_mask": FakeTensor()}

        def decode(self, _ids, skip_special_tokens=True):
            assert skip_special_tokens is True
            return " generated summary "

    class FakeGenerationConfig:
        max_length = 128
        min_length = 1

    class FakeModel:
        def __init__(self):
            self.device = "cpu"
            self.generation_config = FakeGenerationConfig()
            self.generate_kwargs = {}

        def generate(self, *args, **kwargs):
            self.generate_kwargs = kwargs
            return [[101, 102]]

    enter_calls = {"count": 0}

    @contextlib.contextmanager
    def fake_inference_mode():
        enter_calls["count"] += 1
        yield

    fake_torch = types.SimpleNamespace(inference_mode=fake_inference_mode)
    monkeypatch.setitem(sys.modules, "torch", fake_torch)

    tokenizer = FakeTokenizer()
    model = FakeModel()
    summary = summarizer.generate_summary_with_bart("hello world", model, tokenizer)

    assert summary == "generated summary"
    assert tokenizer.tokenize_kwargs["max_length"] == 1024
    assert tokenizer.tokenize_kwargs["truncation"] is True
    assert tokenizer.tokenize_kwargs["return_tensors"] == "pt"
    assert model.generate_kwargs["num_beams"] == 4
    assert model.generate_kwargs["max_new_tokens"] == 256
    assert model.generate_kwargs["min_new_tokens"] == 16
    assert model.generate_kwargs["length_penalty"] == 2.0
    assert model.generate_kwargs["no_repeat_ngram_size"] == 3
    assert model.generate_kwargs["early_stopping"] is True
    assert model.generate_kwargs["do_sample"] is False
    assert model.generate_kwargs["use_cache"] is True
    assert model.generate_kwargs["generation_config"].max_length is None
    assert model.generate_kwargs["generation_config"].min_length is None
    assert enter_calls["count"] == 1


def test_csv_precedence_short_circuits_model_and_thread(monkeypatch):
    from app.services import pipeline

    async def fake_sleep(_seconds):
        return None

    async def forbidden_to_thread(*_args, **_kwargs):
        raise AssertionError("to_thread should not be called for CSV match")

    monkeypatch.setattr(pipeline, "_lookup_summary_from_csv", lambda _meeting_id: "csv summary")
    monkeypatch.setattr(pipeline.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(pipeline.asyncio, "to_thread", forbidden_to_thread)

    result = asyncio.run(pipeline._summarise_transcript("ignored", filename="meeting_1.wav"))
    assert result == "csv summary"


def test_summarise_transcript_offloads_to_thread(monkeypatch):
    from app.services import pipeline

    class DummySettings:
        summarizer_model_id = "Neyati/recapit-meetingbank-bart"
        summarizer_model_revision = "checkpoint-1938"
        huggingface_token = "token"

    calls = {}

    async def fake_to_thread(fn, *args):
        calls["fn"] = fn
        calls["args"] = args
        return "bart summary"

    monkeypatch.setattr("app.core.config.get_settings", lambda: DummySettings())
    monkeypatch.setattr(pipeline, "_lookup_summary_from_csv", lambda _meeting_id: None)
    monkeypatch.setattr(pipeline.asyncio, "to_thread", fake_to_thread)

    transcript = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six."
    result = asyncio.run(pipeline._summarise_transcript(transcript, filename="custom.wav"))

    assert result == "bart summary"
    assert calls["fn"] is pipeline._generate_bart_summary_sync
    assert calls["args"][0] == transcript
    assert calls["args"][1] == DummySettings.summarizer_model_id
    assert calls["args"][2] == DummySettings.summarizer_model_revision
    assert calls["args"][3] == DummySettings.huggingface_token


def test_summarise_transcript_falls_back_on_empty_or_error(monkeypatch):
    from app.services import pipeline

    class DummySettings:
        summarizer_model_id = "Neyati/recapit-meetingbank-bart"
        summarizer_model_revision = None
        huggingface_token = None

    async def fake_to_thread_empty(_fn, *_args):
        return ""

    async def fake_to_thread_error(_fn, *_args):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.core.config.get_settings", lambda: DummySettings())
    monkeypatch.setattr(pipeline, "_lookup_summary_from_csv", lambda _meeting_id: None)

    transcript = (
        "Alpha sentence. Beta sentence. Gamma sentence. Delta sentence. "
        "Epsilon sentence. Zeta sentence."
    )
    monkeypatch.setattr(pipeline.asyncio, "to_thread", fake_to_thread_empty)
    result_empty = asyncio.run(pipeline._summarise_transcript(transcript, filename="custom.wav"))
    assert result_empty.startswith("Meeting Summary:\n\n")

    monkeypatch.setattr(pipeline.asyncio, "to_thread", fake_to_thread_error)
    result_error = asyncio.run(pipeline._summarise_transcript(transcript, filename="custom.wav"))
    assert result_error.startswith("Meeting Summary:\n\n")


def test_meeting_status_response_summary_shape_unchanged():
    from app.models.meeting import MeetingStatusResponse

    payload = MeetingStatusResponse(
        job_id="abc123",
        filename="meeting.wav",
        content_type="audio/wav",
        status="processing",
        created_at=datetime.now(timezone.utc),
        progress_percent=10.0,
        summary=None,
    )
    assert payload.summary is None

    schema = MeetingStatusResponse.model_json_schema()
    summary_schema = schema["properties"]["summary"]
    assert any(option.get("type") == "string" for option in summary_schema["anyOf"])
    assert any(option.get("type") == "null" for option in summary_schema["anyOf"])
