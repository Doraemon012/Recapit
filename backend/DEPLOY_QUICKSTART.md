# 🚀 Quick Deploy to Hugging Face - TL;DR

## Prerequisites
- MongoDB URI ready (you have: `mongodb+srv://neyati28:...`)
- HuggingFace access token (get from: https://huggingface.co/settings/tokens)

---

## Option 1: Automated Script ⚡ (Recommended)

```bash
cd /home/neyati/Desktop/ai-ml-proj/backend
chmod +x deploy_to_hf.sh
./deploy_to_hf.sh
```

Follow the prompts!

---

## Option 2: Manual Steps 📝

```bash
# 1. Go to backend directory
cd /home/neyati/Desktop/ai-ml-proj/backend

# 2. Clone your HF Space (use access token as password)
git clone https://huggingface.co/spaces/bholu11/bholukiduniya

# 3. Copy files
cd bholukiduniya
cp -r ../app ../Dockerfile ../requirements.txt ../README.md ./
cp ../.env.example ./.env

# 4. Set environment variables in HF UI
# Go to: https://huggingface.co/spaces/bholu11/bholukiduniya/settings
# Add secrets:
#   MONGO_URI = mongodb+srv://neyati28:PO06F2YGRhPzcDbo@cluster0.knj3j5y.mongodb.net/
#   MONGO_DB_NAME = recapit
#   CORS_ORIGINS = *

# 5. Push
git add .
git commit -m "Deploy Recapit Backend"
git push  # Use access token as password

# 6. Monitor
# Visit: https://huggingface.co/spaces/bholu11/bholukiduniya
# Check Logs tab, wait for "Running" status
```

---

## Test Deployment

```bash
# Once running, test:
curl https://bholu11-bholukiduniya.hf.space/health

# Should return: {"status":"ok"}
```

---

## Update Frontend

```bash
# Edit frontend/.env.local
echo "NEXT_PUBLIC_API_BASE=https://bholu11-bholukiduniya.hf.space" > /home/neyati/Desktop/ai-ml-proj/frontend/.env.local
```

---

## Files Created for Deployment

✅ `Dockerfile` - Docker container config
✅ `requirements.txt` - Python dependencies  
✅ `README.md` - HF Space description (with metadata)
✅ `.dockerignore` - Files to exclude
✅ `.env.production` - Environment template
✅ `deploy_to_hf.sh` - Automated deployment script
✅ `HUGGINGFACE_DEPLOYMENT.md` - Full deployment guide

---

## Your API URLs

Once deployed:

- **Base URL:** `https://bholu11-bholukiduniya.hf.space`
- **Health:** `/health`
- **Upload:** `/api/v1/meetings/upload`
- **Status:** `/api/v1/meetings/status/{job_id}`
- **Details:** `/api/v1/meetings/{job_id}`

---

## Important Notes

⚠️ **Whisper ASR:** Disabled by default (saves resources)
- Backend uses Google Speech API (free, works fine)
- To enable Whisper: uncomment dependencies in `requirements.txt`

⚠️ **Environment Variables:** Set in HF UI, not in code
- Never commit real credentials to git!

⚠️ **First Build:** Takes 5-10 minutes
- Subsequent builds: 2-3 minutes

---

## Need Help?

📖 Full guide: `HUGGINGFACE_DEPLOYMENT.md`
🐛 Issues? Check Logs tab in HF Space

---

That's it! 🎉
