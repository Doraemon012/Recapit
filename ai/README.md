# Recapit AI Layer

Prototypes for the speech-to-text, diarization, summarization, and structured extraction pipelines powering the Recapit meeting summarizer.

## Modules

- `speech.py` – asynchronous helpers for ASR + diarization integration.
- `summarizer.py` – LLM-driven generation of multi-format summaries.
- `extractor.py` – Converts summaries into action items and decisions.

## Next Steps

1. Select a speech model (OpenAI Whisper, WhisperX, Deepgram) and populate `transcribe_audio`.
2. Configure your LLM provider and prompt strategy inside `generate_summary`.
3. Add evaluation harnesses to measure summary quality and extraction recall.
4. Connect these modules to the backend orchestration queues.
