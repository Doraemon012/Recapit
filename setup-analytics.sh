#!/bin/bash

# Quick Start Script for Analytics System
# This script helps you install required packages and configure the system

echo "🚀 Meeting Analytics System - Quick Start"
echo "=========================================="
echo ""

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "⚠️  No virtual environment found. Creating one..."
    python3 -m venv .venv
fi

echo "📦 Activating virtual environment..."
source .venv/bin/activate

# Install Python packages
echo ""
echo "📦 Installing Python packages for analytics..."
pip install cohere pymongo matplotlib plotly pandas numpy seaborn

# Install frontend packages
echo ""
echo "📦 Installing frontend packages..."
cd frontend
npm install react-plotly.js plotly.js
cd ..

# Check for .env file
if [ ! -f "backend/.env" ]; then
    echo ""
    echo "⚠️  No .env file found. Creating template..."
    cat > backend/.env << 'EOL'
# MongoDB
MONGODB_URL=mongodb://localhost:27017/recapit

# Cohere LLM (required for analytics)
COHERE_API_KEY=your_cohere_api_key_here

# HuggingFace (for diarization)
HUGGINGFACE_TOKEN=your_hf_token_here

# Whisper Model
WHISPER_MODEL=base

# JWT Secret (change in production!)
SECRET_KEY=your-secret-key-change-in-production
EOL
    echo "✅ Template .env file created at backend/.env"
    echo "⚠️  Please edit backend/.env and add your API keys!"
else
    echo ""
    echo "✅ .env file exists"
fi

echo ""
echo "✨ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Get your Cohere API key from https://cohere.ai/"
echo "2. Add it to backend/.env as COHERE_API_KEY"
echo "3. Start MongoDB: mongod"
echo "4. Start backend: cd backend && uvicorn app.main:app --reload"
echo "5. Start frontend: cd frontend && npm run dev"
echo "6. Upload a meeting and view analytics!"
echo ""
echo "📚 See ANALYTICS_SYSTEM_GUIDE.md for detailed documentation"
