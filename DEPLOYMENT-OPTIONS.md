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
