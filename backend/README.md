---
title: Recapit Backend API
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
license: mit
app_port: 7860
---

# Recapit - AI Meeting Summarizer Backend

Backend API for the Recapit AI meeting summarizer. Handles audio file uploads, automatic speech recognition (ASR), and AI-powered summarization.

## Features

- 🎤 Audio file upload (MP3, WAV, M4A, OGG)
- 🗣️ Automatic Speech Recognition with Whisper (optional) or Google Speech API
- 👥 Speaker diarization (when enabled)
- 📝 AI-powered meeting summarization
- ⚡ Real-time progress tracking
- 📊 RESTful API with FastAPI

## API Endpoints

### Health Check
```bash
GET /health
```

### Upload Meeting Audio
```bash
POST /api/v1/meetings/upload
Content-Type: multipart/form-data

Response:
{
  "job_id": "string",
  "filename": "string",
  "status": "queued",
  "progress_percent": 0
}
```

### Check Processing Status
```bash
GET /api/v1/meetings/status/{job_id}

Response:
{
  "status": "processing",
  "progress_percent": 65.0,
  "status_message": "Transcription ready. Summarising conversation"
}
```

### Get Meeting Details
```bash
GET /api/v1/meetings/{job_id}

Response:
{
  "job_id": "string",
  "filename": "string",
  "status": "completed",
  "transcript": "...",
  "summary": "...",
  "progress_percent": 100
}
```

## Configuration

Set these environment variables in your Space settings:

### Required
- `MONGO_URI` - MongoDB connection string
- `MONGO_DB_NAME` - Database name (default: `recapit`)

### Optional
- `CORS_ORIGINS` - Allowed origins (comma-separated)
- `HUGGINGFACE_TOKEN` - For speaker diarization (if Whisper enabled)
- `WHISPER_MODEL` - Model size: tiny, base, small, medium, large (default: `base`)
- `WHISPER_DEVICE` - Device: cuda, cpu, auto (default: `auto`)

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your MongoDB URI

# Run server
uvicorn app.main:app --reload --port 8000
```

## Deployment Notes

This Space uses the Google Speech Recognition API by default (free, no API key required). 

To enable Whisper ASR with speaker diarization:
1. Uncomment AI/ML dependencies in `requirements.txt`
2. Set `HUGGINGFACE_TOKEN` in Space secrets
3. Note: Requires more resources (CPU/GPU)

## Tech Stack

- **FastAPI** - Modern Python web framework
- **MongoDB** - Document database for job storage
- **Whisper** - OpenAI's speech recognition (optional)
- **PyAnnote** - Speaker diarization (optional)
- **Google Speech API** - Fallback ASR

## License

MIT
