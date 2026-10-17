# 🚀 Deploy Recapit Backend to Hugging Face Spaces

Complete step-by-step guide to deploy your backend API to Hugging Face Spaces.

---

## 📋 Prerequisites

1. ✅ Hugging Face account (free)
2. ✅ Git installed on your machine
3. ✅ MongoDB Atlas account (free tier works)
4. ✅ Access token from Hugging Face

---

## 🎯 Step-by-Step Deployment

### Step 1: Get Hugging Face Access Token

1. Go to https://huggingface.co/settings/tokens
2. Click **"New token"**
3. Name it: `recapit-deployment`
4. Type: **Write**
5. Click **"Generate"**
6. **Copy the token** (starts with `hf_`)

---

### Step 2: Clone Your Space

```bash
# Navigate to backend directory
cd /home/neyati/Desktop/ai-ml-proj/backend

# Clone your Hugging Face Space
# When prompted for password, paste your access token
git clone https://huggingface.co/spaces/bholu11/bholukiduniya

# Navigate into the cloned space
cd bholukiduniya
```

---

### Step 3: Copy Backend Files to Space

```bash
# Copy all necessary files from your backend to the space
cp -r ../app ./
cp ../Dockerfile ./
cp ../requirements.txt ./
cp ../.env.example ./.env
cp ../README.md ./

# Verify files are copied
ls -la
# You should see: app/, Dockerfile, requirements.txt, .env, README.md
```

---

### Step 4: Configure Environment Variables

**Option A: Using Hugging Face UI (Recommended)**

1. Go to your Space: https://huggingface.co/spaces/bholu11/bholukiduniya
2. Click **Settings** tab
3. Scroll to **Repository secrets**
4. Add these secrets:

```
Name: MONGO_URI
Value: mongodb+srv://neyati28:PO06F2YGRhPzcDbo@cluster0.knj3j5y.mongodb.net/

Name: MONGO_DB_NAME  
Value: recapit

Name: CORS_ORIGINS
Value: *

# Optional (for speaker diarization)
Name: HUGGINGFACE_TOKEN
Value: your_hf_token_here
```

**Option B: Using .env file (Less secure)**

Edit the `.env` file in your space directory:
```bash
nano .env
```

Add:
```env
MONGO_URI=mongodb+srv://neyati28:PO06F2YGRhPzcDbo@cluster0.knj3j5y.mongodb.net/
MONGO_DB_NAME=recapit
CORS_ORIGINS=*
```

---

### Step 5: Commit and Push

```bash
# Add all files
git add .

# Commit
git commit -m "Deploy Recapit Backend API"

# Push to Hugging Face
# When prompted for password, use your access token
git push
```

---

### Step 6: Wait for Build

1. Go to https://huggingface.co/spaces/bholu11/bholukiduniya
2. Click **Logs** tab
3. Watch the Docker build process
4. Wait for "Running on: http://0.0.0.0:7860" message
5. Status should change to **Running** (green)

Build time: ~5-10 minutes for first deployment

---

### Step 7: Test Your Deployment

Once running, test the API:

```bash
# Health check
curl https://bholu11-bholukiduniya.hf.space/health

# Should return: {"status":"ok"}
```

**Your API endpoints:**
- Health: `https://bholu11-bholukiduniya.hf.space/health`
- Upload: `https://bholu11-bholukiduniya.hf.space/api/v1/meetings/upload`
- Status: `https://bholu11-bholukiduniya.hf.space/api/v1/meetings/status/{job_id}`
- Details: `https://bholu11-bholukiduniya.hf.space/api/v1/meetings/{job_id}`

---

## 🔧 Update Frontend Configuration

Update your frontend to use the Hugging Face Space URL:

```bash
# In /home/neyati/Desktop/ai-ml-proj/frontend/.env.local
NEXT_PUBLIC_API_BASE=https://bholu11-bholukiduniya.hf.space
```

---

## 🎨 Customize Your Space

Edit the `README.md` metadata at the top:

```yaml
---
title: Recapit Backend API  # Change this
emoji: 🎙️                   # Change emoji
colorFrom: indigo           # Start color
colorTo: purple             # End color
sdk: docker
pinned: false
license: mit
app_port: 7860
---
```

---

## 🚨 Troubleshooting

### Build Fails

**Check logs:**
```bash
# In your space directory
git log -1  # Check last commit
```

**Common issues:**
- Missing files → Make sure all files copied
- Syntax errors → Check Dockerfile
- Port issues → Must use port 7860

### App Crashes

**View logs:**
1. Go to Space → **Logs** tab
2. Look for error messages
3. Common issues:
   - MongoDB connection failed (check MONGO_URI)
   - Missing environment variables
   - Python errors in code

### Cannot Connect

**Check:**
1. Space status is **Running** (not Building or Error)
2. URL is correct: `https://bholu11-bholukiduniya.hf.space`
3. Health endpoint works: `/health`

---

## 📊 Monitoring

### View Logs
```bash
# Real-time logs in Hugging Face UI
# Go to: Settings → Logs
```

### Check Resource Usage
```bash
# In Space settings, view:
# - CPU usage
# - Memory usage
# - Build time
```

---

## 🔄 Update Deployment

When you make changes:

```bash
# In your space directory
cd /home/neyati/Desktop/ai-ml-proj/backend/bholukiduniya

# Copy updated files
cp -r ../app ./

# Commit and push
git add .
git commit -m "Update: [describe changes]"
git push

# Space will rebuild automatically
```

---

## 💡 Optional: Enable Whisper ASR

For full Whisper support on Hugging Face Spaces:

1. **Edit requirements.txt** - Uncomment AI dependencies:
```txt
torch>=2.4.0,<3.0.0
torchaudio>=2.4.0,<3.0.0
openai-whisper>=20231117
transformers>=4.44.0,<5.0.0
pyannote.audio>=3.3.1,<4.0.0
```

2. **Add HuggingFace token** to Space secrets:
```
HUGGINGFACE_TOKEN=hf_xxxxx
```

3. **Note:** This requires more resources:
   - Build time: 15-20 minutes
   - RAM: 4GB+ required
   - May need to upgrade to paid Space tier

---

## 📚 Resources

- **Your Space:** https://huggingface.co/spaces/bholu11/bholukiduniya
- **HF Spaces Docs:** https://huggingface.co/docs/hub/spaces
- **Docker Spaces:** https://huggingface.co/docs/hub/spaces-sdks-docker
- **Environment Variables:** https://huggingface.co/docs/hub/spaces-overview#managing-secrets

---

## 🎯 Quick Reference

### Important URLs
```
Space URL: https://huggingface.co/spaces/bholu11/bholukiduniya
API Base: https://bholu11-bholukiduniya.hf.space
Health: https://bholu11-bholukiduniya.hf.space/health
Logs: https://huggingface.co/spaces/bholu11/bholukiduniya/logs
```

### Git Commands
```bash
git clone https://huggingface.co/spaces/bholu11/bholukiduniya
git add .
git commit -m "message"
git push
```

### Files Needed
```
✅ Dockerfile
✅ requirements.txt
✅ README.md (with metadata)
✅ app/ directory
✅ .env (or Space secrets)
```

---

## ✅ Checklist

- [ ] Created Hugging Face Space
- [ ] Got access token
- [ ] Cloned Space repository
- [ ] Copied backend files
- [ ] Configured MongoDB URI in secrets
- [ ] Committed and pushed
- [ ] Space is building/running
- [ ] Tested /health endpoint
- [ ] Updated frontend .env
- [ ] Tested full upload flow

---

🎉 **Congratulations!** Your backend is now live on Hugging Face Spaces!
