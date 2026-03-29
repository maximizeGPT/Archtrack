#!/bin/bash
# Tailscale setup for ArchTrack
# This creates a private network so uncle can access from home

echo "========================================"
echo "  Tailscale Setup for ArchTrack"
echo "========================================"
echo ""

# Check if Tailscale is installed
if ! command -v tailscale &> /dev/null; then
    echo "Installing Tailscale..."
    
    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install tailscale
        else
            echo "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    # Linux
    else
        curl -fsSL https://tailscale.com/install.sh | sh
    fi
fi

echo ""
echo "Starting Tailscale..."
tailscale up

echo ""
echo -e "\033[0;32m✓ Tailscale is running!\033[0m"
echo ""
echo "Your Tailscale IP: $(tailscale ip -4)"
echo ""
echo "Next steps:"
echo "  1. Install Tailscale on uncle's home computer"
echo "  2. Have him run: tailscale up"
echo "  3. He can now access: http://$(tailscale ip -4):3001"
echo ""
echo "Both computers must be logged into the same Tailscale account."
echo "Sign up at: https://login.tailscale.com/"
