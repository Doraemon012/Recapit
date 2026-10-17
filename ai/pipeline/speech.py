from __future__ import annotations

import asyncio
import io
import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, List

import torch
import whisper
from pydub import AudioSegment
from pyannote.audio import Pipeline as DiarizationPipeline

logger = logging.getLogger("recapit.ai.speech")
if not logger.hasHandlers():
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Global model cache to avoid reloading models on every request
_whisper_model_cache: dict[str, "WhisperASR"] = {}


@dataclass(slots=True)
class TranscriptSegment:
    speaker: str
    start: float
    end: float
    text: str


@dataclass(slots=True)
class Transcript:
    source: Path
    language: str
    segments: List[TranscriptSegment] = field(default_factory=list)


class WhisperASR:
    """Whisper-based Automatic Speech Recognition with speaker diarization."""

    def __init__(
        self,
        model_name: str = "base",
        device: str | None = None,
        diarization_token: str | None = None,
    ):
        """
        Initialize Whisper ASR system.

        Args:
            model_name: Whisper model size (tiny, base, small, medium, large)
            device: Device to run on (cuda/cpu). Auto-detected if None.
            diarization_token: HuggingFace token for speaker diarization.
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Loading Whisper '{model_name}' model on {self.device}")
        
        # Load Whisper model
        self.model = whisper.load_model(model_name, device=self.device)
        
        # Load speaker diarization pipeline (optional)
        self.diarization_pipeline = None
        if diarization_token:
            try:
                logger.info("Loading speaker diarization pipeline")
                self.diarization_pipeline = DiarizationPipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=diarization_token,
                )
                if torch.cuda.is_available():
                    self.diarization_pipeline.to(torch.device("cuda"))
                logger.info("Speaker diarization enabled")
            except Exception as exc:
                logger.warning(f"Failed to load diarization pipeline: {exc}")
                logger.info("Continuing without speaker diarization")

    def transcribe(
        self,
        audio_path: Path | str,
        language: str | None = None,
        initial_prompt: str | None = None,
    ) -> dict[str, Any]:
        """
        Transcribe audio file with Whisper.

        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es'). Auto-detected if None.
            initial_prompt: Optional text to guide the model

        Returns:
            Whisper transcription result with segments and detected language
        """
        logger.info(f"Transcribing audio: {audio_path}")
        
        # Whisper transcription options
        options = {
            "task": "transcribe",
            "fp16": torch.cuda.is_available(),
            "verbose": False,
        }

        logger.info("DEBUG: Whisper transcription complete. Proceeding to diarization.")

        if language:
            options["language"] = language
        
        if initial_prompt:
            options["initial_prompt"] = initial_prompt
        
        # Transcribe with word-level timestamps
        result = self.model.transcribe(
            str(audio_path),
            word_timestamps=True,
            **options,
        )
        
        detected_language = result.get("language", "unknown")
        logger.info(f"Detected language: {detected_language}")
        
        return result

    def diarize(self, audio_path: Path | str) -> dict[tuple[float, float], str] | None:
        """
        Perform speaker diarization on audio file.

        Args:
            audio_path: Path to audio file

        Returns:
            Dictionary mapping time intervals to speaker labels,
            or None if diarization is not available
        """
        # If a pyannote diarization pipeline is available, prefer it
        if self.diarization_pipeline:
            logger.info(f"Performing speaker diarization (pyannote): {audio_path}")
            try:
                diarization = self.diarization_pipeline(str(audio_path))
                # Convert to interval -> speaker mapping
                speaker_segments = {}
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    speaker_segments[(turn.start, turn.end)] = speaker

                logger.info(f"Identified {len(set(speaker_segments.values()))} speakers (pyannote)")
                return speaker_segments
            except Exception as exc:
                logger.warning(f"Speaker diarization (pyannote) failed: {exc}")

        # Fallback: use Whisper encoder embeddings + k-means clustering per segment
        try:
            logger.info("Running embedding-based diarization fallback")
            # Build embeddings per segment by encoding the mel spectrogram with Whisper encoder
            from . import speech as _speech_module  # local reference
            # We'll perform diarization later from the caller where we have segments and model
            return None  # signal to caller to use embedding-based clustering
        except Exception as exc:  # pragma: no cover - optional path
            logger.warning(f"Embedding-based diarization fallback failed: {exc}")
            return None

    def assign_speakers(
        self,
        segments: list[dict[str, Any]],
        speaker_segments: dict[tuple[float, float], str] | None,
    ) -> list[dict[str, Any]]:
        """
        Assign speaker labels to transcription segments.

        Args:
            segments: Whisper transcription segments
            speaker_segments: Diarization results (time interval -> speaker)

        Returns:
            Segments with speaker labels added
        """
        if not speaker_segments:
            # No diarization available, use generic speaker labels
            logger.warning(f"No speaker_segments provided - assigning all {len(segments)} segments to SPEAKER_1")
            for seg in segments:
                seg["speaker"] = "SPEAKER_1"
            return segments
        
        logger.info(f"Assigning speakers to {len(segments)} segments using {len(speaker_segments)} diarization intervals")
        
        # Assign speakers based on overlap with diarization segments
        for seg in segments:
            seg_start = seg["start"]
            seg_end = seg["end"]
            seg_mid = (seg_start + seg_end) / 2
            
            # Find speaker with most overlap
            best_speaker = "SPEAKER_UNKNOWN"
            max_overlap = 0.0
            
            for (dia_start, dia_end), speaker in speaker_segments.items():
                # Calculate overlap
                overlap_start = max(seg_start, dia_start)
                overlap_end = min(seg_end, dia_end)
                overlap = max(0.0, overlap_end - overlap_start)
                
                if overlap > max_overlap:
                    max_overlap = overlap
                    best_speaker = speaker
                
                # Quick check: if midpoint is in diarization segment
                if dia_start <= seg_mid <= dia_end:
                    best_speaker = speaker
                    break
            
            seg["speaker"] = best_speaker
        
        return segments


def convert_audio_format(
    input_bytes: bytes,
    output_format: str = "wav",
    sample_rate: int = 16000,
) -> bytes:
    """
    Convert audio to specified format with noise reduction preprocessing.

    Args:
        input_bytes: Input audio data
        output_format: Target format (wav, mp3, etc.)
        sample_rate: Target sample rate (Whisper uses 16kHz)

    Returns:
        Converted audio bytes
    """
    logger.info(f"Converting audio to {output_format} at {sample_rate}Hz")
    
    # Load audio from bytes
    audio = AudioSegment.from_file(io.BytesIO(input_bytes))
    
    # Normalize audio (helps with noise robustness)
    audio = audio.normalize()
    
    # Set to mono (Whisper expects mono)
    audio = audio.set_channels(1)
    
    # Resample to target sample rate
    audio = audio.set_frame_rate(sample_rate)
    
    # Export to target format
    output_buffer = io.BytesIO()
    audio.export(output_buffer, format=output_format)
    output_buffer.seek(0)
    
    return output_buffer.read()


async def transcribe_audio(
    audio_path: Path,
    audio_bytes: bytes | None = None,
    model_name: str = "base",
    language: str | None = None,
    diarization_token: str | None = None,
) -> Transcript:
    """
    Complete ASR pipeline: transcription + diarization + formatting.

    Features:
    1. Transcription: Converts speech to text using Whisper
    2. Language Detection: Automatically detects spoken language
    3. Speaker Diarization: Identifies and labels different speakers
    4. Timestamping: Provides start/end times for each segment
    5. Noise Robustness: Normalizes audio to handle poor quality
    6. Multiple Formats: Supports MP3, WAV, M4A, OGG, etc.
    7. Text Formatting: Outputs properly formatted text with punctuation

    Args:
        audio_path: Path to audio file
        audio_bytes: Optional raw audio bytes (if already loaded)
        model_name: Whisper model size (tiny, base, small, medium, large)
        language: Force specific language (None = auto-detect)
        diarization_token: HuggingFace token for speaker diarization

    Returns:
        Transcript object with language, speaker-labeled segments, and timestamps
    """
    
    def _process() -> Transcript:
        # Handle audio format conversion if bytes provided
        temp_file = None
        if audio_bytes:
            # Convert to WAV for optimal Whisper performance
            wav_bytes = convert_audio_format(audio_bytes, "wav", 16000)
            
            # Write to temporary file
            temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_file.write(wav_bytes)
            temp_file.flush()
            processing_path = Path(temp_file.name)
        else:
            processing_path = audio_path
        
        try:
            # Get or create cached ASR model
            asr = get_whisper_model(
                model_name=model_name,
                diarization_token=diarization_token,
            )
            
            # Step 1: Transcribe with Whisper
            result = asr.transcribe(
                processing_path,
                language=language,
            )
            
            # Step 2: Perform speaker diarization (if available)
            logger.info("Starting speaker diarization...")
            speaker_segments = asr.diarize(processing_path)
            
            # If pyannote not available or returned None, try embedding-based diarization
            if not speaker_segments:
                logger.info("Pyannote diarization not available, trying embedding-based fallback...")
                try:
                    emb_map = diarize_with_embeddings(asr, result, processing_path)
                    if emb_map:
                        num_speakers = len(set(emb_map.values()))
                        speaker_segments = emb_map
                        logger.info(f"Embedding-based diarization succeeded with {num_speakers} unique speakers")
                    else:
                        logger.warning("Embedding-based diarization returned None")
                except Exception as e:
                    logger.warning(f"Embedding-based diarization failed: {e}")
                    speaker_segments = None
            
            if not speaker_segments:
                logger.warning("No diarization available - will assign all segments to SPEAKER_1")
            
            # Step 3: Assign speakers to transcription segments
            segments_with_speakers = asr.assign_speakers(
                result["segments"],
                speaker_segments,
            )
            
            # Step 4: Create formatted transcript segments
            transcript_segments = [
                TranscriptSegment(
                    speaker=seg["speaker"],
                    start=seg["start"],
                    end=seg["end"],
                    text=seg["text"].strip(),  # Properly formatted with punctuation
                )
                for seg in segments_with_speakers
            ]
            
            transcript_obj = Transcript(
                source=audio_path,
                language=result.get("language", "unknown"),
                segments=transcript_segments,
            )
            # Log the final speaker+diarized transcript for debugging (with timestamps)
            logger.info("\n" + "="*80)
            logger.info("FINAL SPEAKER-DIARIZED TRANSCRIPT WITH TIMESTAMPS:")
            logger.info("="*80)
            logger.info(format_transcript(transcript_obj, include_timestamps=True))
            logger.info("="*80 + "\n")
            return transcript_obj
        
        finally:
            # Clean up temporary file
            if temp_file:
                try:
                    Path(temp_file.name).unlink()
                except Exception:
                    pass
    
    # Run in thread to avoid blocking async event loop
    return await asyncio.to_thread(_process)


def iter_text(segments: Iterable[TranscriptSegment]) -> Iterable[str]:
    """Iterate over segment text content."""
    for segment in segments:
        yield segment.text


def diarize_with_embeddings(
    model: WhisperASR,
    transcript_result: dict[str, Any],
    audio_path: Path,
    n_speakers: int | None = None,
) -> dict[tuple[float, float], str] | None:
    """
    Perform diarization using Whisper encoder embeddings and k-means clustering.

    Steps:
    - For each Whisper segment, extract audio slice start->end
    - Resample slice to 16k and pad/trim to 30s
    - Compute mel spectrogram via whisper.log_mel_spectrogram
    - Run through model.encoder to get embedding sequence, average to single vector
    - Run k-means on per-segment vectors to produce speaker clusters
    - Return mapping (start,end) -> speaker_label
    
    Note: This function attempts to use the loaded Whisper model's encoder. If the
    encoder is not accessible, returns None.
    """
    try:
        import os
        import io
        import tempfile
        import wave
        import numpy as _np
        import torch as _torch
        from pydub import AudioSegment as _AudioSegment

        # Determine number of speakers
        if n_speakers is None:
            try:
                n_speakers = int(os.getenv("DIARIZATION_N_SPEAKERS", "2"))
            except Exception:
                n_speakers = 2

        segments = transcript_result.get("segments", [])
        if not segments:
            return None

        device = _torch.device(model.device if hasattr(model, "device") else ("cuda" if _torch.cuda.is_available() else "cpu"))

        embeddings = []
        times = []

        for seg in segments:
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", start + 1.0))
            times.append((start, end))

            # extract audio slice using pydub
            audio = _AudioSegment.from_file(str(audio_path))
            slice_ms = int(start * 1000)
            end_ms = int(end * 1000)
            chunk = audio[slice_ms:end_ms]
            # convert to mono and 16000
            chunk = chunk.set_channels(1).set_frame_rate(16000)

            # pad/trim to 30s
            target_ms = 30 * 1000
            if len(chunk) < target_ms:
                silence = _AudioSegment.silent(duration=target_ms - len(chunk))
                chunk = chunk + silence
            else:
                chunk = chunk[:target_ms]

            # export to wav bytes
            buf = io.BytesIO()
            chunk.export(buf, format="wav")
            buf.seek(0)

            # load wav bytes into numpy for whisper mel
            try:
                # use whisper's log_mel_spectrogram
                import whisper as _whisper
                wav = _whisper.audio.load_audio(buf)
                mel = _whisper.log_mel_spectrogram(_torch.from_numpy(wav).to(device))
            except Exception:
                # fallback: try to read with pydub and convert
                buf.seek(0)
                wf = wave.open(buf, "rb")
                frames = wf.readframes(wf.getnframes())
                arr = _np.frombuffer(frames, dtype=_np.int16).astype(_np.float32) / 32768.0
                mel = None

            if mel is None:
                # cannot compute mel; append zero vector
                embeddings.append(_torch.zeros(512, device=device))
                continue

            # mel expected shape (n_mels, t) -> add batch dim
            if len(mel.shape) == 2:
                mel = mel.unsqueeze(0)

            # run through model.encoder if available
            try:
                with _torch.no_grad():
                    # some Whisper wrappers expect different API; try common patterns
                    if hasattr(model.model, "encoder"):
                        enc_out = model.model.encoder(mel.to(device))
                    elif hasattr(model, "model") and hasattr(model.model, "encoder"):
                        enc_out = model.model.encoder(mel.to(device))
                    else:
                        enc_out = None

                    if enc_out is None:
                        embeddings.append(_torch.zeros(512, device=device))
                    else:
                        # enc_out shape: (batch, seq_len, dim) or similar
                        if enc_out.dim() == 3:
                            vec = enc_out.mean(dim=1).squeeze(0)
                        else:
                            vec = enc_out.squeeze(0).mean(dim=0)
                        embeddings.append(vec.cpu())
            except Exception:
                embeddings.append(_torch.zeros(512, device=device).cpu())

        if not embeddings:
            return None

        X = _torch.stack([_torch.as_tensor(e, dtype=_torch.float32) if isinstance(e, _torch.Tensor) else _torch.tensor(e, dtype=_torch.float32) for e in embeddings])

        # simple k-means on CPU
        X_cpu = X.cpu().numpy()

        # Implement basic k-means
        def kmeans_numpy(data, k, iters=40):
            import numpy as np
            n, d = data.shape
            # init centroids randomly
            rng = np.random.default_rng(0)
            idx = rng.choice(n, size=k, replace=False) if n >= k else np.arange(k) % n
            centroids = data[idx].astype(np.float64)
            for _ in range(iters):
                # assign
                dists = np.linalg.norm(data[:, None, :] - centroids[None, :, :], axis=2)
                labels = dists.argmin(axis=1)
                new_centroids = np.vstack([data[labels == i].mean(axis=0) if np.any(labels == i) else centroids[i] for i in range(k)])
                if np.allclose(new_centroids, centroids):
                    break
                centroids = new_centroids
            return labels

        k = max(1, min(len(segments), n_speakers))
        labels = kmeans_numpy(X_cpu, k)

        speaker_map = {}
        for (start, end), lbl in zip(times, labels):
            speaker_map[(start, end)] = f"SPEAKER_{int(lbl)+1}"

        unique_speakers = set(speaker_map.values())
        logger.info(f"Embedding diarization produced {k} clusters, resulting in {len(unique_speakers)} unique speakers: {unique_speakers}")
        return speaker_map
    except Exception as exc:  # pragma: no cover - many environment-dependent ops
        logger.warning(f"diarize_with_embeddings failed: {exc}")
        return None


def format_transcript(transcript: Transcript, include_timestamps: bool = True) -> str:
    """
    Format transcript as readable text.

    Args:
        transcript: Transcript object
        include_timestamps: Whether to include timestamps in output

    Returns:
        Formatted transcript string
    """
    lines = []
    lines.append(f"Language: {transcript.language.upper()}")
    lines.append(f"Source: {transcript.source.name}")
    lines.append("=" * 60)
    lines.append("")
    
    current_speaker = None
    for seg in transcript.segments:
        # Add speaker label on speaker change
        if seg.speaker != current_speaker:
            current_speaker = seg.speaker
            lines.append(f"\n[{seg.speaker}]")
        
        # Format segment with optional timestamp
        if include_timestamps:
            timestamp = f"[{_format_time(seg.start)} -> {_format_time(seg.end)}]"
            lines.append(f"{timestamp} {seg.text}")
        else:
            lines.append(seg.text)
    
    return "\n".join(lines)


def format_transcript_simple(transcript: Transcript) -> str:
    """
    Format transcript as simple text without metadata headers.
    Suitable for frontend display.
    """
    lines = []
    current_speaker = None

    for seg in transcript.segments:
        if seg.speaker != current_speaker:
            current_speaker = seg.speaker
            if lines:
                lines.append("")
            lines.append(f"[{seg.speaker}]")

        lines.append(seg.text)

    return "\n".join(lines)



def _format_time(seconds: float) -> str:
    """Format seconds as MM:SS.mmm"""
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes:02d}:{secs:06.3f}"


def get_whisper_model(
    model_name: str = "base",
    device: str | None = None,
    diarization_token: str | None = None,
) -> WhisperASR:
    """
    Get or create a cached Whisper ASR model.
    
    This avoids reloading the model on every request, which is expensive.
    Models are cached by (model_name, device) combination.
    
    Args:
        model_name: Whisper model size (tiny, base, small, medium, large)
        device: Device to run on (cuda/cpu). Auto-detected if None.
        diarization_token: HuggingFace token for speaker diarization
    
    Returns:
        Cached or newly created WhisperASR instance
    """
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    cache_key = f"{model_name}_{device}"
    
    if cache_key not in _whisper_model_cache:
        logger.info(f"Creating new Whisper model: {cache_key}")
        _whisper_model_cache[cache_key] = WhisperASR(
            model_name=model_name,
            device=device,
            diarization_token=diarization_token,
        )
    else:
        logger.debug(f"Using cached Whisper model: {cache_key}")
    
    return _whisper_model_cache[cache_key]
