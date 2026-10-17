"""
Example script to test Whisper ASR functionality.

This script demonstrates:
1. Audio transcription with Whisper
2. Automatic language detection
3. Speaker diarization
4. Timestamp generation
5. Multi-format audio support
6. Formatted output
"""

import asyncio
import os
from pathlib import Path
import sys

# Add parent directory to path to import from pipeline
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.speech import transcribe_audio, format_transcript


async def test_transcription(
    audio_file: Path,
    model: str = "base",
    enable_diarization: bool = True,
):
    """
    Test Whisper ASR with a sample audio file.
    
    Args:
        audio_file: Path to audio file (MP3, WAV, M4A, OGG, etc.)
        model: Whisper model size (tiny, base, small, medium, large)
        enable_diarization: Whether to enable speaker diarization
    """
    if not audio_file.exists():
        print(f"❌ Audio file not found: {audio_file}")
        print("\nPlease provide a valid audio file path.")
        return
    
    print("=" * 70)
    print("🎙️  WHISPER ASR TEST")
    print("=" * 70)
    print(f"\n📁 Audio file: {audio_file.name}")
    print(f"📊 Model: {model}")
    print(f"👥 Speaker diarization: {'Enabled' if enable_diarization else 'Disabled'}")
    print("\n⏳ Processing...\n")
    
    # Get HuggingFace token for diarization
    hf_token = os.getenv("HUGGINGFACE_TOKEN") if enable_diarization else None
    
    if enable_diarization and not hf_token:
        print("⚠️  HUGGINGFACE_TOKEN not found in environment.")
        print("   Speaker diarization will be disabled.")
        print("   Set token in .env or export HUGGINGFACE_TOKEN=hf_xxx\n")
    
    try:
        # Run transcription
        transcript = await transcribe_audio(
            audio_path=audio_file,
            model_name=model,
            language=None,  # Auto-detect
            diarization_token=hf_token,
        )
        
        # Display results
        print("\n" + "=" * 70)
        print("📝 TRANSCRIPTION RESULTS")
        print("=" * 70)
        
        formatted = format_transcript(transcript, include_timestamps=True)
        print(formatted)
        
        print("\n" + "=" * 70)
        print("📊 STATISTICS")
        print("=" * 70)
        print(f"✅ Segments: {len(transcript.segments)}")
        print(f"✅ Language: {transcript.language.upper()}")
        
        # Count unique speakers
        speakers = set(seg.speaker for seg in transcript.segments)
        print(f"✅ Speakers identified: {len(speakers)}")
        for speaker in sorted(speakers):
            speaker_segments = [s for s in transcript.segments if s.speaker == speaker]
            total_time = sum(s.end - s.start for s in speaker_segments)
            print(f"   - {speaker}: {len(speaker_segments)} segments, {total_time:.1f}s")
        
        # Total duration
        if transcript.segments:
            total_duration = transcript.segments[-1].end
            print(f"✅ Total duration: {total_duration:.1f}s ({total_duration/60:.1f} min)")
        
        print("\n✅ Test completed successfully!")
        
    except Exception as exc:
        print(f"\n❌ Error during transcription: {exc}")
        import traceback
        traceback.print_exc()


async def test_with_sample_text():
    """
    Create a sample audio from text for testing (requires pyttsx3 or gTTS).
    """
    print("\n⚠️  To test with generated audio, install:")
    print("   pip install gtts")
    print("\nThen uncomment the code below in this function.")
    
    # Uncomment to generate test audio:
    # from gtts import gTTS
    # import tempfile
    # 
    # text = "Hello, this is a test of the Whisper ASR system. It can detect languages and identify speakers."
    # tts = gTTS(text=text, lang='en', slow=False)
    # 
    # with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
    #     tts.save(f.name)
    #     test_file = Path(f.name)
    # 
    # await test_transcription(test_file, model="base", enable_diarization=False)
    # test_file.unlink()


async def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Test Whisper ASR transcription system",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "audio_file",
        type=Path,
        nargs="?",
        help="Path to audio file (MP3, WAV, M4A, OGG, etc.)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base)",
    )
    parser.add_argument(
        "--no-diarization",
        action="store_true",
        help="Disable speaker diarization",
    )
    
    args = parser.parse_args()
    
    if args.audio_file:
        await test_transcription(
            audio_file=args.audio_file,
            model=args.model,
            enable_diarization=not args.no_diarization,
        )
    else:
        print("Usage: python test_whisper_asr.py <audio_file> [--model base] [--no-diarization]")
        print("\nExample:")
        print("  python test_whisper_asr.py sample_meeting.mp3")
        print("  python test_whisper_asr.py recording.wav --model small")
        print("  python test_whisper_asr.py audio.m4a --no-diarization")
        print("\nSupported formats: MP3, WAV, M4A, OGG, FLAC, etc.")


if __name__ == "__main__":
    asyncio.run(main())
