#!/bin/bash
#
# ArchTrack Cloud Deployment Script
# Deploys ArchTrack to the cloud for remote access
#

set -e

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "  ArchTrack Cloud Deployment"
echo "========================================"
echo ""

# Check prerequisites
check_prereqs() {
    echo "Checking prerequisites..."
    
    # Check for git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Error: git is required${NC}"
        exit 1
    fi
    
    # Check for docker (optional)
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✓ Docker available${NC}"
        HAS_DOCKER=true
    else
        echo -e "${YELLOW}⚠ Docker not found (optional)${NC}"
        HAS_DOCKER=false
    fi
    
    echo ""
}

# Deploy to Render (recommended - free tier available)
deploy_render() {
    echo -e "${BLUE}Deploying to Render...${NC}"
    echo ""
    
    cat > "$ARCHTRACK_DIR/render.yaml" << 'EOF'
services:
  - type: web
    name: archtrack-admin
    env: docker
    plan: free
    dockerfilePath: ./deployment/Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: ADMIN_USERNAME
        value: admin
      - key: ADMIN_PASSWORD
        generateValue: true
    disk:
      name: archtrack-data
      mountPath: /data
      sizeGB: 1
EOF
    
    echo -e "${GREEN}✓ Render configuration created: render.yaml${NC}"
    echo ""
    echo "To deploy to Render:"
    echo "  1. Push code to GitHub:"
    echo "     git add ."
    echo "     git commit -m 'Add Render deployment config'"
    echo "     git push"
    echo ""
    echo "  2. Go to https://dashboard.render.com/"
    echo "  3. Click 'New +' → 'Web Service'"
    echo "  4. Connect your GitHub repo"
    echo "  5. Render will detect render.yaml and deploy automatically"
    echo ""
    echo "  6. Once deployed, your uncle can access:"
    echo "     https://archtrack-admin.onrender.com (or your custom domain)"
    echo ""
}

# Deploy to Railway (alternative)
deploy_railway() {
    echo -e "${BLUE}Deploying to Railway...${NC}"
    echo ""
    
    cat > "$ARCHTRACK_DIR/railway.json" << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "deployment/Dockerfile"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
EOF
    
    echo -e "${GREEN}✓ Railway configuration created: railway.json${NC}"
    echo ""
    echo "To deploy to Railway:"
    echo "  1. Install Railway CLI: npm install -g @railway/cli"
    echo "  2. Login: railway login"
    echo "  3. Init: railway init"
    echo "  4. Deploy: railway up"
    echo ""
}

# Deploy to Fly.io (good performance)
deploy_fly() {
    echo -e "${BLUE}Deploying to Fly.io...${NC}"
    echo ""
    
    # Create fly.toml
    cat > "$ARCHTRACK_DIR/fly.toml" << 'EOF'
app = "archtrack-admin"
primary_region = "lax"

[build]
  dockerfile = "deployment/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[[mounts]]
  source = "archtrack_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
EOF
    
    echo -e "${GREEN}✓ Fly.io configuration created: fly.toml${NC}"
    echo ""
    echo "To deploy to Fly.io:"
    echo "  1. Install Fly CLI: brew install flyctl"
    echo "  2. Login: fly auth login"
    echo "  3. Create volume: fly volumes create archtrack_data --size 1"
    echo "  4. Deploy: fly deploy"
    echo "  5. Open: fly open"
    echo ""
}

# Setup Tailscale (private network option)
setup_tailscale() {
    echo -e "${BLUE}Setting up Tailscale (Private Network)...${NC}"
    echo ""
    
    cat > "$ARCHTRACK_DIR/setup-tailscale.sh" << 'EOF'
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
EOF
    chmod +x "$ARCHTRACK_DIR/setup-tailscale.sh"
    
    echo -e "${GREEN}✓ Tailscale setup script created: setup-tailscale.sh${NC}"
    echo ""
    echo "This option is best if:"
    echo "  - You don't want to pay for cloud hosting"
    echo "  - The office computer stays on during work hours"
    echo "  - You want a private, secure connection"
    echo ""
}

# Setup ngrok (quick temporary access)
setup_ngrok() {
    echo -e "${BLUE}Setting up Ngrok (Temporary Access)...${NC}"
    echo ""
    
    cat > "$ARCHTRACK_DIR/start-ngrok.sh" << 'EOF'
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
EOF
    chmod +x "$ARCHTRACK_DIR/start-ngrok.sh"
    
    echo -e "${GREEN}✓ Ngrok script created: start-ngrok.sh${NC}"
    echo ""
    echo "Use this for quick testing or demos."
    echo "The URL changes every time you restart ngrok."
    echo ""
}

# Create deployment summary
create_summary() {
    cat > "$ARCHTRACK_DIR/DEPLOYMENT-OPTIONS.md" << 'EOF'
# ArchTrack Deployment Options

## For Your Uncle's Use Case

Your uncle needs to:
- Monitor employees working in the office
- Access dashboard from his home
- Have reliable, secure access

## Recommended: Render (Free Tier)

**Best for:** Set-it-and-forget-it, free hosting

**Pros:**
- Free tier available
- Automatic HTTPS
- Always online
- Easy to set up

**Cons:**
- Free tier sleeps after 15 min inactivity (takes 30s to wake up)
- Limited to 512MB RAM on free tier

**Setup:**
```bash
./deploy-cloud.sh
# Follow the Render instructions
```

**Cost:** FREE (or $7/month for always-on)

---

## Alternative 1: Tailscale (Private Network)

**Best for:** No cloud costs, office computer stays on

**Pros:**
- Completely free
- Very secure (private network)
- No cloud hosting needed
- Fast (direct connection)

**Cons:**
- Office computer must stay on
- Requires software install on both ends

**Setup:**
```bash
./setup-tailscale.sh
```

**Cost:** FREE

---

## Alternative 2: Fly.io

**Best for:** Better performance than Render, still affordable

**Pros:**
- Good free tier
- Fast cold starts
- Built-in database

**Cons:**
- Slightly more complex setup
- Requires credit card (even for free tier)

**Setup:**
```bash
./deploy-cloud.sh
# Follow the Fly.io instructions
```

**Cost:** FREE (up to limits) or ~$5/month

---

## Quick Test: Ngrok

**Best for:** Quick demos or testing

**Pros:**
- Instant public URL
- No setup required

**Cons:**
- URL changes every restart
- Not suitable for production

**Setup:**
```bash
./start-ngrok.sh
```

**Cost:** FREE (for temporary URLs)

---

## Recommendation

**For your uncle, I recommend:**

1. **Start with Render (Free)** - Easiest setup, free, reliable
2. **If the 30s wake-up delay is annoying** - Upgrade to $7/month or use Fly.io
3. **If he wants zero cost and doesn't mind keeping office computer on** - Use Tailscale

## Security Notes

All cloud options provide:
- HTTPS encryption
- Password protection
- Automatic updates

Make sure to:
1. Change default password in `.env`
2. Use strong, unique password
3. Keep backups

## Questions?

Check the logs:
```bash
tail -f logs/server.log
```
EOF
    
    echo -e "${GREEN}✓ Deployment options guide created: DEPLOYMENT-OPTIONS.md${NC}"
}

# Main menu
show_menu() {
    echo "Choose deployment option:"
    echo ""
    echo "  1) Render (Recommended - Free tier)"
    echo "  2) Railway (Alternative)"
    echo "  3) Fly.io (Best performance)"
    echo "  4) Tailscale (Private network, no cloud)"
    echo "  5) Ngrok (Quick temporary access)"
    echo "  6) All of the above"
    echo ""
    echo "  0) Exit"
    echo ""
}

# Main function
main() {
    check_prereqs
    
    if [ "$1" == "render" ]; then
        deploy_render
    elif [ "$1" == "railway" ]; then
        deploy_railway
    elif [ "$1" == "fly" ]; then
        deploy_fly
    elif [ "$1" == "tailscale" ]; then
        setup_tailscale
    elif [ "$1" == "ngrok" ]; then
        setup_ngrok
    elif [ "$1" == "all" ]; then
        deploy_render
        deploy_railway
        deploy_fly
        setup_tailscale
        setup_ngrok
        create_summary
    else
        show_menu
        read -p "Enter choice [0-6]: " choice
        
        case $choice in
            1) deploy_render ;;
            2) deploy_railway ;;
            3) deploy_fly ;;
            4) setup_tailscale ;;
            5) setup_ngrok ;;
            6) 
                deploy_render
                deploy_railway
                deploy_fly
                setup_tailscale
                setup_ngrok
                create_summary
                ;;
            0) exit 0 ;;
            *) echo "Invalid choice" ;;
        esac
    fi
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}Deployment configuration complete!${NC}"
    echo "========================================"
    echo ""
    echo "See DEPLOYMENT-OPTIONS.md for details"
}

main "$@"
