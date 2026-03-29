#!/bin/bash
# Quick temporary public URL using ngrok

echo "Starting ngrok tunnel to ArchTrack..."

if ! command -v ngrok &> /dev/null; then
    echo "Installing ngrok..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install ngrok
    else
        echo "Please install ngrok from https://ngrok.com/download"
        exit 1
    fi
fi

echo ""
echo "Starting tunnel..."
echo "Share the HTTPS URL with your uncle"
echo ""
ngrok http 3001
