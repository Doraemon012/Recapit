#!/bin/bash
# Quick deployment script for Hugging Face Spaces

set -e

echo "🚀 Recapit Backend - Hugging Face Spaces Deployment"
echo "=================================================="
echo ""

# Check if we're in the backend directory
if [ ! -d "app" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

# Get Space name from user
read -p "Enter your Hugging Face Space name (e.g., bholu11/bholukiduniya): " SPACE_NAME

if [ -z "$SPACE_NAME" ]; then
    echo "❌ Error: Space name cannot be empty"
    exit 1
fi

SPACE_DIR="hf_space_deploy"

echo ""
echo "📥 Cloning your Hugging Face Space..."
echo "   (You'll be prompted for your HF access token)"

# Clone the space
git clone https://huggingface.co/spaces/$SPACE_NAME $SPACE_DIR

cd $SPACE_DIR

echo ""
echo "📁 Copying backend files to Space..."

# Copy files
cp -r ../app ./
cp ../Dockerfile ./
cp ../requirements.txt ./
cp ../.env.example ./.env
cp ../README.md ./

echo "✅ Files copied successfully"
echo ""
echo "📋 Files in your Space:"
ls -la

echo ""
echo "⚙️  Before pushing, you need to:"
echo "   1. Set environment variables in Hugging Face UI:"
echo "      - Go to https://huggingface.co/spaces/$SPACE_NAME"
echo "      - Click Settings → Repository secrets"
echo "      - Add: MONGO_URI, MONGO_DB_NAME, CORS_ORIGINS"
echo ""
read -p "Have you set the environment variables? (y/n): " CONFIRMED

if [ "$CONFIRMED" != "y" ]; then
    echo "⚠️  Please set environment variables first, then run:"
    echo "   cd $SPACE_DIR"
    echo "   git add ."
    echo "   git commit -m 'Deploy Recapit Backend'"
    echo "   git push"
    exit 0
fi

echo ""
echo "📤 Committing and pushing to Hugging Face..."

git add .
git commit -m "Deploy Recapit Backend API"

echo ""
echo "   Pushing... (you'll be prompted for your HF access token)"
git push

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "🔍 Next steps:"
echo "   1. Check build status: https://huggingface.co/spaces/$SPACE_NAME"
echo "   2. View logs in the Logs tab"
echo "   3. Wait for 'Running' status (5-10 minutes)"
echo "   4. Test: curl https://${SPACE_NAME/\//-}.hf.space/health"
echo ""
echo "🎉 Done!"
