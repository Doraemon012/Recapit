# Recapit

Recapit is an AI meeting-recap application that turns an uploaded recording
into a timestamped transcript, speaker-labelled segments, a generated
summary, and structured meeting analytics.

The project is technically interesting because it combines several different
ML operating modes in one pipeline:

- local Whisper speech recognition;
- optional pretrained pyannote speaker diarization;
- an unsupervised Whisper-embedding/k-means fallback;
- local BART sequence-to-sequence summarization;
- hosted Cohere structured analysis;
- deterministic post-processing for speaker and timing statistics; and
- an asynchronous FastAPI/MongoDB application that exposes the results to a
  Next.js client.

The application is an inference system. A BART fine-tuning notebook and saved
Trainer artifacts are included as experiment material, but the bundled
checkpoint's complete training provenance is not packaged as a reproducible
training release.

## Project overview

### Capabilities

- Signup, login, logout, and authenticated meeting history
- Multipart audio upload
- MongoDB job tracking and GridFS audio storage
- Whisper transcription with detected language and word timestamps
- Speaker diarization through pyannote when configured
- Speaker-label fallback using Whisper encoder representations and k-means
- BART summary generation with an extractive fallback
- Cohere-generated action items, speaker statistics, sentiment, topics,
  timeline events, named entities, insights, and meeting metrics
- Transcript, summary, audio playback, and Plotly visualizations in the
  Next.js meeting page

### What is not implemented

The current source does not implement durable background workers, resumable
jobs, long-context chunk-and-aggregate summarization, native Zoom/Meet/Teams
capture, Slack/Jira/CRM delivery, or a locally trained analytics classifier.

## Architecture

```mermaid
flowchart LR
    UI[Next.js / React frontend] -->|upload, auth, polling| API[FastAPI API]
    API --> DB[(MongoDB)]
    API --> FS[(GridFS audio)]
    API --> TASK[In-process asyncio task]
    TASK --> ASR[Whisper ASR]
    ASR --> DIA[pyannote diarization]
    ASR --> EMB[Whisper embeddings + k-means fallback]
    DIA --> SEG[Speaker-labelled segments]
    EMB --> SEG
    SEG --> SUM[BART summarization]
    SUM --> EXT[Extractive fallback if needed]
    SUM --> LLM[Cohere Command R analytics]
    SEG --> LLM
    LLM --> DB
    DB --> API
    FS --> API
```

### End-to-end data flow

1. The browser sends a multipart audio upload to
   `POST /api/v1/meetings/upload`.
2. FastAPI reads the complete file into memory, inserts a `meeting_jobs`
   document, stores the bytes in GridFS, and returns a MongoDB job ID.
3. The API schedules `run_meeting_pipeline` with `asyncio.create_task`.
4. The pipeline writes progress at approximately 10%, 65%, 75%, 90%, and
   100% while updating the job document.
5. Whisper produces a transcript and timed segments.
6. pyannote or the embedding fallback assigns speaker labels.
7. The summary path uses the sample CSV lookup, BART, or an extractive
   fallback.
8. Cohere receives the transcript segments and summary, returns structured
   JSON, and deterministic speaker/time statistics are added.
9. The transcript, segments, summary, analytics reference, and final status
   are persisted in MongoDB.
10. The frontend polls the job and then requests the recap and analytics.

The task is process-local. MongoDB preserves the job document, but an API
restart does not resume an in-memory task.

## ML pipeline

### 1. Whisper transcription

`ai/pipeline/speech.py` defines `WhisperASR` and the asynchronous
`transcribe_audio` orchestration function.

#### Model loading

- The model is loaded with `whisper.load_model(model_name, device=...)`.
- `WHISPER_MODEL` defaults to `base`; supported sizes in the code include
  `tiny`, `base`, `small`, `medium`, and `large`.
- The device is CUDA when available, otherwise CPU, unless configured
  explicitly.
- Models are cached in a module-level dictionary keyed by model/device so
  repeated requests do not reload the same Whisper model.

#### Audio and transcription

The backend currently writes uploaded bytes to a temporary file and passes the
file path to Whisper. The standalone AI function also supports raw bytes:

1. `pydub` decodes the bytes;
2. audio is normalized;
3. audio is converted to mono;
4. audio is resampled to 16 kHz;
5. the normalized audio is written to a temporary WAV file.

Whisper is called with:

- `task="transcribe"`;
- `word_timestamps=True`;
- `fp16=True` when CUDA is available;
- `verbose=False`;
- optional explicit language;
- optional initial prompt support in the lower-level API.

When language is not supplied, Whisper detects it and the result's
`language` field is stored in the transcript object. Each returned segment
contains start time, end time, and text.

If Whisper fails in the backend orchestration, the code contains a Google
Speech Recognition fallback. That fallback requires outbound network access
and is not an offline local model.

### 2. Speaker diarization

`WhisperASR` optionally loads:

```text
pyannote/speaker-diarization-3.1
```

The pipeline is enabled only when a Hugging Face token is supplied. Pyannote
returns time intervals and speaker labels. Whisper segments are assigned the
label with the greatest temporal overlap; a midpoint-in-interval check is used
as a fast assignment path.

The output passed to the backend is a list of records shaped like:

```json
{
  "speaker": "SPEAKER_00",
  "start": 12.4,
  "end": 18.9,
  "text": "..."
}
```

If pyannote cannot be loaded or fails during inference, the pipeline continues
to the local clustering fallback.

### 3. Speaker-clustering fallback

`diarize_with_embeddings` operates on Whisper transcript segments:

1. Load each segment's audio slice with `pydub`.
2. Convert it to mono 16 kHz audio.
3. Pad short segments with silence or truncate long segments to 30 seconds.
4. Compute Whisper log-mel features.
5. Run the Whisper encoder and average its sequence output into one vector
   per segment.
6. Cluster the vectors with a locally implemented k-means algorithm.
7. Return a `(start, end) -> speaker label` mapping.

The number of clusters defaults to the `DIARIZATION_N_SPEAKERS` environment
variable, or `2` when it is absent. The implementation uses a deterministic
random seed of `0` and a fixed iteration budget of `40`.

This is an unsupervised heuristic. It assumes a useful relationship between
Whisper encoder representations and speaker identity, assumes the configured
number of speakers is reasonable, and does not identify real names. If
clustering fails or no diarization result is available, every segment is
labelled `SPEAKER_1`.

### 4. BART summarization

The runtime loader in `ai/pipeline/summarizer.py` reads:

```text
ai/bart_model/kaggle/working/bart-meetingbank/
```

It instantiates `BartTokenizer` and `BartForConditionalGeneration` from the
local directory. The bundled configuration identifies a BART-family model
with:

| Configuration | Value |
| --- | ---: |
| Encoder layers | 6 |
| Decoder layers | 6 |
| Hidden dimension (`d_model`) | 768 |
| Encoder attention heads | 12 |
| Decoder attention heads | 12 |
| Vocabulary size | 50,265 |
| Maximum position embeddings | 1,024 |
| Weight dtype in config | float32 |

The exact upstream model identifier is not stored in the artifact
`_name_or_path` field. The notebook initializes `facebook/bart-base`, which
matches the architecture class and scale, but the runtime artifact should be
described as the supplied local BART-family checkpoint.

#### Runtime preprocessing and generation

- Transcript segments are joined with spaces before tokenization.
- Input tokenization uses `max_length=1024` and `truncation=True`.
- There is no chunk-and-aggregate strategy, so longer meetings lose content
  beyond the first 1,024 tokens.
- Generation uses `max_length=150`, `min_length=40`, `num_beams=4`,
  `length_penalty=2.0`, and `early_stopping=True`.
- The decoded sequence removes special tokens.

#### Sample-specific and fallback behavior

Before loading BART, the backend checks `data/meetings.csv` by uploaded
filename stem. The three sample IDs in that file receive predefined summaries
and do not exercise BART.

For other files:

1. BART is loaded and called.
2. If loading or generation fails, the backend splits transcript lines and
   takes up to five early sentences as an extractive fallback.
3. Very short or empty transcripts receive an explicit fallback message.

The `MeetingSummary` helper also exposes placeholder fields for headline,
decisions, and action items; the live backend primarily stores the generated
summary string and obtains structured action items from Cohere.

### 5. Cohere analytics

`ai/pipeline/analytics.py` builds one consolidated prompt. Each transcript
segment is formatted as:

```text
[start_seconds - end_seconds] speaker: text
```

The optional BART summary is appended to the prompt. The request asks Cohere
`command-r-08-2024` to return JSON containing:

- action items and owners;
- speaker statistics;
- overall and segment sentiment;
- topics and keywords;
- timeline events;
- people, organizations, dates, locations, products, and documents;
- key insights; and
- meeting-level duration, speaker count, balance, decisions, questions, and
  engagement.

The API call uses temperature `0.3` and `max_tokens=4096`. The response is
trimmed, Markdown code fences are removed if present, and `json.loads` parses
the result.

After parsing, the analytics code adds metadata and derives deterministic
values from the transcript segments, including word counts, speaking time,
turn counts, and total duration. The result is stored in the
`meeting_analytics` collection and formatted into Plotly-oriented structures
for the frontend.

If the Cohere package is unavailable, the key is missing, the API call fails,
or JSON parsing fails, analytics generation returns `None`. The meeting
pipeline can still finish with transcript and summary data. There is no strict
Pydantic schema validation or retry/repair loop for Cohere output.

## BART fine-tuning

### Training workflow present in the notebook

The cleaned root notebook `notebook4635d1683f.ipynb` contains a full
Hugging Face sequence-to-sequence workflow:

1. Check for a GPU and install notebook packages.
2. Mount Google Drive and define a model export directory.
3. Load a dataset.
4. Load `facebook/bart-base`.
5. Tokenize source and target text.
6. Configure ROUGE evaluation.
7. Create `Seq2SeqTrainingArguments`.
8. Create a `Seq2SeqTrainer`.
9. Call `trainer.train()`.
10. Evaluate on the test split, generate an example, and save the model.

The training code uses the standard encoder-decoder teacher-forcing objective
implemented by Hugging Face's BART model and Trainer: decoder labels are
compared with generated next-token predictions using token-level
cross-entropy, and optimizer updates are applied during `trainer.train()`.
The notebook does not implement a custom loss, LoRA adapter, or frozen-layer
strategy.

### Dataset and provenance

The notebook first loads:

```python
load_dataset("edinburghcstr/ami", "ihm")
```

It falls back to `knkarthick/dialogsum`, then `samsum`, if earlier loading
fails.

In the saved AMI output, the columns were:

```text
meeting_id, audio_id, text, audio, begin_time, end_time,
microphone_id, speaker_id
```

No summary column was present. The notebook's fallback therefore sets the
target column equal to the transcript column. That is an input-to-itself
target, not verified supervised meeting-summary data. The bundled artifact
directory is named `bart-meetingbank`, but no dataset manifest connects it to
MeetingBank or to this notebook. Dataset provenance for the bundled
checkpoint is therefore unresolved.

### Preprocessing and tokenization

The notebook's `preprocess_function`:

- reads `examples[transcript_col]` as source text;
- reads `examples[summary_col]` as target text;
- tokenizes inputs with `max_length=1024`, truncation, and
  `padding="max_length"`;
- tokenizes targets with `max_length=256`, truncation, and
  `padding="max_length"`;
- stores target token IDs in `model_inputs["labels"]`;
- maps over all dataset splits with `batched=True`, `num_proc=2`, and removes
  the original columns.

### Training configuration

The values explicitly configured in the notebook are:

| Setting | Value |
| --- | --- |
| Base model in notebook | `facebook/bart-base` |
| Output directory | `./results` |
| Evaluation strategy | `epoch` |
| Save strategy | `epoch` |
| Learning rate | `3e-5` |
| Train batch size per device | `4` |
| Evaluation batch size per device | `4` |
| Epochs | `3` |
| Weight decay | `0.01` |
| Warmup steps | `500` |
| Generated evaluation | `predict_with_generate=True` |
| Evaluation generation length | `256` |
| Best-model metric | `rouge1`, higher is better |
| Mixed precision | `fp16=torch.cuda.is_available()` |
| Checkpoint retention | `save_total_limit=2` |
| Logging | `./logs`, every 100 steps, first step enabled |
| External reporting | disabled (`report_to="none"`) |
| Hub publishing | disabled (`push_to_hub=False`) |

The notebook does not explicitly name an optimizer or scheduler; it relies on
Trainer defaults. The bundled artifact directories contain scheduler, scaler,
and RNG state files, but those files do not establish every optimizer or
hardware setting of the run that produced them.

The saved notebook execution recorded a T4 GPU and a 108,502-row training
split, then failed during `trainer.train()` with a `NoneType` sequence error.
Its test evaluation and model export cells have no recorded outputs. The
notebook therefore documents the intended fine-tuning workflow and
configuration, not a verified successful reproducible run.

### Bundled checkpoint artifacts

The local BART directory contains:

- root model weights and tokenizer files;
- `checkpoint-1293`, `checkpoint-2586`, and `checkpoint-3879`;
- `trainer_state.json`;
- `training_args.bin`;
- scheduler, scaler, and RNG state files; and
- TensorBoard event files.

The checkpoint states record 1,293, 2,586, and 3,879 global steps over three
epochs. The root `model.safetensors` is byte-identical to
`checkpoint-3879`; the earlier checkpoint weight files differ. This is
consistent with a completed prior Trainer run, but the repository does not
identify its exact dataset, command, machine, or relationship to the notebook.

### Loading for application inference

The backend imports `load_bart_model()` when a filename is not found in the
sample CSV. The tokenizer and model are loaded from the local artifact
directory, then `generate_summary_with_bart()` applies the runtime generation
settings described above. The application performs inference only; it does
not call `Trainer.train()`, `model.train()`, `loss.backward()`, or an
optimizer.

## ML evaluation

### Notebook metric implementation

The notebook loads the `evaluate` ROUGE implementation and computes:

- `rouge1`;
- `rouge2`; and
- `rougeL`.

Predictions and labels are decoded with the BART tokenizer, special tokens
are skipped, label padding IDs are filtered, and `use_stemmer=True` is passed
to `rouge.compute`. The Trainer evaluates the validation split at each epoch
and later contains code to evaluate `tokenized_dataset["test"]`.

ROUGE-1 measures unigram overlap, ROUGE-2 measures bigram overlap, and
ROUGE-L measures longest-common-subsequence overlap. ROUGE-Lsum is also
present in the saved Trainer state, although it is not returned explicitly by
the cleaned notebook's `compute_metrics` return dictionary; its origin is not
fully documented in the repository.

### Recorded artifact values

The following values are copied from the bundled
`checkpoint-*/trainer_state.json` files:

| Checkpoint | Epoch | Eval loss | ROUGE-1 | ROUGE-2 | ROUGE-L | ROUGE-Lsum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `checkpoint-1293` | 1 | 1.2775495 | 67.3553 | 56.6735 | 64.4612 | 64.4100 |
| `checkpoint-2586` | 2 | 1.1616676 | 68.5613 | 58.1061 | 65.8618 | 65.8811 |
| `checkpoint-3879` | 3 | 1.1278663 | 69.4819 | 59.0221 | 66.6411 | 66.6694 |

These are recorded Trainer metadata values. They are not independently
reproduced by this repository's current setup. The artifact state does not
identify the evaluation dataset, baseline, exact preprocessing, or whether
the values came from a clean held-out split.

### Evaluation limitations

- The notebook's observed AMI path lacks a summary field and falls back to
  transcript-as-target behavior.
- Source sequences are truncated at 1,024 tokens and target sequences at 256
  tokens.
- The artifact run's dataset and split procedure are not packaged.
- No baseline comparison or human evaluation is included.
- ROUGE measures lexical overlap, not factuality, coherence, faithfulness, or
  usefulness of a meeting recap.
- No repository test harness evaluates Whisper accuracy, diarization quality,
  BART quality, or Cohere analytics quality.

## Backend engineering

### Application structure

The FastAPI entry point is `backend/app/main.py`. Its lifespan connects to
MongoDB before serving requests and closes the client on shutdown. It mounts
the versioned router under `/api/v1`, configures CORS from settings, and
exposes `/health`.

Important backend modules:

- `app/core/config.py`: environment-backed settings.
- `app/core/security.py`: bcrypt password hashing and JWT helpers.
- `app/db/mongo.py`: cached MongoDB client/database access.
- `app/api/v1/endpoints/auth.py`: signup, login, logout, and current-user
  routes.
- `app/api/v1/endpoints/ingest.py`: upload, MongoDB job creation, GridFS
  storage, and task scheduling.
- `app/api/v1/endpoints/status.py`: meeting listing, status/detail retrieval,
  and GridFS audio streaming.
- `app/api/v1/endpoints/analytics.py`: analytics retrieval and UI formatting.
- `app/services/pipeline.py`: end-to-end orchestration and progress updates.

### Upload and task lifecycle

The upload handler:

1. validates that a filename exists;
2. reads the entire `UploadFile` into memory;
3. inserts a `meeting_jobs` document with `queued` status;
4. writes the original bytes to GridFS;
5. stores the GridFS file ID on the job; and
6. creates an in-process asyncio task.

The pipeline catches exceptions, logs them, and updates the job to `failed`
with an error message. The task registry removes completed tasks and logs
uncaught task exceptions. There is no durable queue, retry policy, worker
process, cancellation endpoint, upload-size limit, or restart recovery.

### MongoDB usage

The code uses:

- `users` for account records;
- `meeting_jobs` for upload metadata, status, progress, transcript,
  transcript segments, summary, and analytics reference;
- `meeting_analytics` for Cohere output and derived visualization data; and
- GridFS collections for original audio files.

MongoDB creates these collections on first write. No migration command is
defined.

### API endpoints

| Method | Path | Purpose | Authentication in source |
| --- | --- | --- | --- |
| `GET` | `/health` | MongoDB-backed health probe | None |
| `POST` | `/api/v1/auth/signup` | Create user | None |
| `POST` | `/api/v1/auth/login` | Authenticate and set JWT cookie | None |
| `POST` | `/api/v1/auth/logout` | Clear JWT cookie | None |
| `GET` | `/api/v1/auth/me` | Return current user | Required |
| `POST` | `/api/v1/meetings/upload` | Store audio and queue processing | Optional |
| `GET` | `/api/v1/meetings/list` | List meetings for current user | Required |
| `GET` | `/api/v1/meetings/status/{job_id}` | Poll job status | None |
| `GET` | `/api/v1/meetings/{job_id}` | Retrieve meeting detail | None |
| `GET` | `/api/v1/meetings/{job_id}/audio` | Stream GridFS audio | None |
| `GET` | `/api/v1/analytics/{job_id}` | Retrieve analytics | Optional cookie; ownership checked when user is present |
| `GET` | `/api/v1/analytics/{job_id}/action-items` | Retrieve action items | Optional cookie |
| `GET` | `/api/v1/analytics/{job_id}/speaker-stats` | Retrieve speaker chart data | Optional cookie |
| `GET` | `/api/v1/analytics/{job_id}/sentiment` | Retrieve sentiment data | Optional cookie |
| `GET` | `/api/v1/analytics/{job_id}/topics` | Retrieve topic data | Optional cookie |
| `GET` | `/api/v1/analytics/{job_id}/timeline` | Retrieve timeline data | Optional cookie |

The status, detail, and audio routes do not enforce authentication in the
current source. This is an important deployment consideration.

## Frontend integration

The frontend is a Next.js App Router application under `frontend/app`.

- `app/page.tsx` provides landing-page upload and polling behavior.
- `app/login.tsx` and `app/signup.tsx` call the authentication routes.
- `app/dashboard/page.tsx` loads the authenticated user's meeting list.
- `app/meetings/[jobId]/page.tsx` and its client component poll the meeting
  record, request audio, and render the recap.
- Transcript components display speaker labels, timestamps, and text.
- Analytics components request the analytics endpoints and render Plotly
  charts.

Most components use `NEXT_PUBLIC_API_BASE`, defaulting to
`http://localhost:8000`. The frontend polls approximately every 2.5 seconds
until a terminal job status is received. Authentication uses the
`access_token` cookie returned by the backend.

## Data and model flow

| Output | Producer | Persistence/consumer |
| --- | --- | --- |
| Audio bytes | Browser upload | MongoDB GridFS; audio endpoint |
| Transcript text | Whisper, or Google fallback | `meeting_jobs`; recap page |
| Segment timestamps | Whisper | `meeting_jobs.transcript_segments` |
| Speaker labels | pyannote, k-means, or `SPEAKER_1` fallback | Transcript segments |
| Summary for sample IDs | `data/meetings.csv` lookup | `meeting_jobs.summary` |
| Summary for other IDs | Local BART or extractive fallback | `meeting_jobs.summary` |
| Action items/topics/etc. | Cohere JSON response | `meeting_analytics`; analytics UI |
| Counts and durations | Deterministic segment calculations | `meeting_analytics`; charts |

This distinction matters: not every displayed value is produced by a learned
model. The CSV summaries, extractive fallback, speaker/time enrichment, and
some UI formatting are deterministic code paths.

## Technology stack and design decisions

| Area | Technology | Responsibility |
| --- | --- | --- |
| Web client | Next.js 16, React 19, TypeScript | Upload, polling, recap UI |
| API | FastAPI, Uvicorn | HTTP routes and application lifecycle |
| Persistence | MongoDB, PyMongo, GridFS | Jobs, users, analytics, audio |
| ASR | OpenAI Whisper, PyTorch | Speech-to-text and timestamps |
| Diarization | pyannote.audio | Optional pretrained speaker intervals |
| Fallback clustering | Whisper encoder, local k-means | Speaker grouping without pyannote |
| Summarization | Transformers BART | Local conditional generation |
| Hosted analytics | Cohere Command R | Structured meeting analysis |
| Audio | pydub and ffmpeg | Decode, normalize, resample |
| Visualizations | Plotly and React Plotly | Browser-rendered analytics |

The single Cohere request keeps all analytics fields coupled into one response
and reduces round trips. The trade-off is dependence on JSON compliance and a
single hosted call. The process-local task model keeps the application simple
but limits reliability and horizontal scalability. The local BART checkpoint
avoids a hosted summarization dependency but requires substantial disk and
memory.

## Project structure

```text
ai/
  pipeline/
    speech.py          Whisper, audio preprocessing, diarization, clustering
    summarizer.py      BART loading and generation
    analytics.py       Cohere prompt, parsing, storage, chart formatting
    extractor.py       Legacy fixed-value extractor
  bart_model/          BART model, tokenizer, checkpoints, Trainer metadata
  pyproject.toml       AI package and Whisper extra
  requirements-*.txt   Analytics and Whisper dependency lists

backend/app/
  main.py              FastAPI entry point and lifespan
  core/                Settings and security helpers
  db/                  MongoDB client
  models/              Pydantic request/response models
  services/pipeline.py End-to-end orchestration
  api/v1/endpoints/    Authentication, ingest, status, analytics
  pyproject.toml       Backend dependencies and Uvicorn configuration

frontend/app/
  page.tsx             Landing page and upload flow
  dashboard/           Meeting list
  meetings/[jobId]/    Meeting recap
  components/          Upload, transcript, audio, analytics UI
  package.json          Frontend scripts and dependencies

data/meetings.csv      Sample filename-to-summary records
notebook4635d1683f.ipynb
                         BART fine-tuning workflow and saved outputs
```

## Local setup and execution

The following commands are based on the checked-in Python package metadata,
frontend package scripts, environment settings, and application entry points.
They have not been validated by launching a live database or service in this
workspace.

### Prerequisites

- Python 3.11 or newer
- Node.js and npm compatible with `frontend/package.json`
- MongoDB, local or hosted
- `ffmpeg` on `PATH`
- Disk space for the BART artifacts and Whisper cache
- A Cohere API key for analytics
- Optional Hugging Face access for pyannote

The four bundled BART weight files are approximately 558 MB each, about 2.2 GB
in total. They exceed GitHub's normal per-file limit and should be distributed
through Git LFS or external artifact storage.

### 1. Start MongoDB

For a local Docker MongoDB:

```bash
docker run --name recapit-mongo -p 27017:27017 -d mongo:7
```

If it already exists:

```bash
docker start recapit-mongo
```

### 2. Create the Python environment and install backend dependencies

From the repository root:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip

cd backend
python -m pip install -e ".[dev]"
```

The backend `pyproject.toml` includes FastAPI, Uvicorn, PyMongo,
Transformers, Torch, librosa, pyannote.audio, SpeechRecognition, and pydub.

### 3. Install AI and analytics dependencies

From the repository root with the same environment active:

```bash
cd ai
python -m pip install -e ".[whisper]"
python -m pip install -r requirements-analytics.txt
cd ..
```

The AI extra includes OpenAI Whisper, Torch/Torchaudio, pydub, soundfile,
ffmpeg-python, pyannote, Transformers, NumPy, SciPy, and related packages.
The analytics requirements add Cohere, PyMongo, matplotlib, Plotly, pandas,
NumPy, and seaborn.

Install ffmpeg separately on Debian/Ubuntu if needed:

```bash
sudo apt-get install ffmpeg
```

The repository does not select a CUDA-specific PyTorch wheel. For NVIDIA
hardware, install the PyTorch build appropriate for the installed CUDA version.

### 4. Configure environment variables

Create `backend/.env` locally. Do not copy credentials from existing local
environment files:

| Variable | Required | Runtime use |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection |
| `MONGO_DB_NAME` | Yes | Database name; normally `recapit` |
| `CORS_ORIGINS` | Yes for browser use | Allowed frontend origins |
| `COHERE_API_KEY` | For analytics | Cohere client initialization |
| `WHISPER_MODEL` | No | Whisper size; defaults to `base` |
| `WHISPER_DEVICE` | No | Device setting; auto-detected when unset |
| `WHISPER_VERBOSE` | No | Whisper verbosity setting |
| `HUGGINGFACE_TOKEN` | Optional | pyannote model access |
| `API_PREFIX` | No | API prefix; defaults to `/api/v1` |
| `APP_NAME` | No | FastAPI title |

Example local configuration:

```dotenv
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=recapit
CORS_ORIGINS=http://localhost:3000
COHERE_API_KEY=replace-with-your-cohere-key
WHISPER_MODEL=base
WHISPER_DEVICE=auto
WHISPER_VERBOSE=false
HUGGINGFACE_TOKEN=replace-with-your-huggingface-token
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

### 5. Start the backend

In terminal 1, from the repository root:

```bash
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The package metadata declares port `8080` as its Uvicorn default, but the
frontend defaults to port `8000`; the explicit command above keeps them aligned.

Verify the health endpoint:

```bash
curl http://localhost:8000/health
```

Expected response when MongoDB is reachable:

```json
{"status":"ok"}
```

### 6. Install and start the frontend

In terminal 2, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, and upload a supported audio
file such as MP3, WAV, M4A, or OGG.

### 7. API smoke test

Create an account and retain the cookie:

```bash
curl -i -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"choose-a-password"}' \
  http://localhost:8000/api/v1/auth/signup
```

Upload a file:

```bash
curl -i -c cookies.txt -b cookies.txt \
  -F 'file=@/absolute/path/to/meeting.mp3' \
  http://localhost:8000/api/v1/meetings/upload
```

Poll using the returned `job_id`:

```bash
curl -b cookies.txt http://localhost:8000/api/v1/meetings/status/<job_id>
curl -b cookies.txt http://localhost:8000/api/v1/meetings/<job_id>
curl -b cookies.txt http://localhost:8000/api/v1/analytics/<job_id>
```

The complete upload path has not been run in this workspace, so these are
source-checked commands rather than a claim of a verified live deployment.

## Testing

Frontend scripts defined in `frontend/package.json`:

```bash
cd frontend
npm run lint
npm run build
```

The backend includes pytest as a development dependency, but the repository
does not provide a complete automated test suite for audio/model inference.
There is no reproducible benchmark harness for ASR, diarization,
summarization, or Cohere analytics.

For a practical local verification, check:

1. MongoDB is reachable.
2. `GET /health` returns `{"status":"ok"}`.
3. Signup and login set the `access_token` cookie.
4. An upload returns a job ID.
5. Status moves through processing to completed or failed.
6. Transcript segments and summary appear in the meeting response.
7. Audio streams from the GridFS endpoint.
8. Analytics returns completed data when Cohere is configured.

## Troubleshooting

### Backend fails during startup

The FastAPI lifespan connects to MongoDB. Check `MONGO_URI`, MongoDB
availability, and network access before debugging model dependencies.

### `ModuleNotFoundError` for Whisper, Transformers, or Cohere

Activate the same virtual environment used to start Uvicorn and install both
the backend package and the AI/analytics dependencies. The separate
`backend/requirements.txt` intentionally comments out heavyweight AI packages
for lightweight deployment and is not sufficient for the full local AI path.

### Audio decoding fails

Install ffmpeg and verify it is on `PATH`. pydub and Whisper rely on audio
decoding support for common compressed formats.

### First inference is slow

Whisper downloads its selected model on first use. pyannote may also download
its pretrained pipeline and requires Hugging Face authorization.

### No speaker separation

Without pyannote access, the application attempts Whisper-embedding
clustering. If that fails, all transcript segments receive `SPEAKER_1`.
Clustering quality depends on the number of speakers configured through
`DIARIZATION_N_SPEAKERS`.

### No analytics

Install the Cohere dependency, set `COHERE_API_KEY`, and ensure outbound
network access. Analytics failures do not necessarily fail the complete
meeting job.

### Jobs disappear after a restart

The processing task is in-process and not durable. MongoDB retains the job
record, but the application does not resume unfinished work after restart.

### Summaries are incomplete

BART truncates input to 1,024 tokens. Long meetings require a chunking or
hierarchical summarization design that is not currently implemented.

## Results and demonstration

The repository contains three safe sample summary rows in
`data/meetings.csv`. These are predefined filename-to-summary examples used by
the backend and are not model-generated benchmark outputs.

The bundled Trainer state records the following evaluation values:

| Checkpoint | Epoch | Eval loss | ROUGE-1 | ROUGE-2 | ROUGE-L | ROUGE-Lsum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `checkpoint-1293` | 1 | 1.2775495 | 67.3553 | 56.6735 | 64.4612 | 64.4100 |
| `checkpoint-2586` | 2 | 1.1616676 | 68.5613 | 58.1061 | 65.8618 | 65.8811 |
| `checkpoint-3879` | 3 | 1.1278663 | 69.4819 | 59.0221 | 66.6411 | 66.6694 |

These values are copied from saved `trainer_state.json` files. They are
recorded artifact metadata, not independently reproduced results. The
repository does not package the artifact run's dataset manifest, baseline,
complete preprocessing, or evaluation command.

## Limitations and future improvements

Current limitations:

- process-local asynchronous work with no durable queue or restart recovery;
- whole-file upload reads and no configured upload-size limit;
- repeated BART loading in the summary path rather than a shared BART cache;
- 1,024-token summarization truncation;
- heuristic two-speaker clustering by default;
- hosted Cohere dependency and permissive JSON parsing;
- incomplete authentication enforcement on status/detail/audio routes;
- no formal ML quality test suite or human evaluation;
- approximately 2.2 GB of local BART artifacts.

Meaningful next steps would be a durable worker queue, model warm-up and
caching, chunked/hierarchical summarization, explicit model/version metadata,
schema validation and retry handling for Cohere, stronger route authorization,
upload/concurrency limits, dataset manifests, and reproducible held-out
evaluation with human quality checks.

## Publication hygiene

Commit source code, sanitized dependency manifests, the root README, and the
cleaned notebook only after reviewing its outputs and metadata. Keep local
`.env` files, API keys, virtual environments, `node_modules`, `.next`,
`__pycache__`, logs, and other generated files out of Git. Store the large
BART artifacts with Git LFS or an external artifact registry.

## Model Weights

Recapit uses a local BART-family checkpoint for meeting summarization.
The model weights are stored using [Git Large File Storage (Git LFS)](
https://git-lfs.com/
).

Install Git LFS before cloning the repository:

```bash
git lfs install
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_REPOSITORY_NAME>
git lfs pull