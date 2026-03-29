# ArchTrack Backup & Recovery Protocol

**Last Updated:** March 12, 2026

## Overview

ArchTrack is a critical open-source project. This document ensures we never lose work or accidentally push private data to the public repo again.

## Repository Locations

| Repo | URL | Purpose |
|------|-----|---------|
| **Public** | https://github.com/maximizeGPT/Archtrack | Open source release |
| **Private** | /Users/mohlt/.openclaw/workspace/arch-firm-dashboard | Development workspace |

## Backup Locations

1. **Local Backup:** `mc-temp/arch-firm-dashboard/` - Historical snapshot
2. **Git History:** Commit `dee04db18f697d8e4a62e7bce5435c61b264046c` - "Restore ArchTrack repository"
3. **Remote Backup:** `mohltbot/mission-control` - Contains arch-firm-dashboard folder

## Update Protocol

When updating the public repo:

1. **Read from private workspace** - `/Users/mohlt/.openclaw/workspace/arch-firm-dashboard/`
2. **Push to public repo** - `maximizeGPT/Archtrack`
3. **Never push private workspace files** - No .env, no API keys, no personal data
4. **Verify before force push** - Always check `git log` and `git status`

## What NOT to Push

- .env files
- API keys or secrets
- node_modules/
- Personal data or logs
- Mission control workspace files
- Database files with real data

## Recovery Process

If public repo gets messed up:

1. Check `mc-temp/arch-firm-dashboard/` for backup
2. Check git history: `git show dee04db18f697d8e4a62e7bce5435c61b264046c`
3. Restore from mission-control: `git checkout HEAD:arch-firm-dashboard/`
4. Force push clean version to public repo

## Prevention Checklist

Before any push to maximizeGPT/Archtrack:
- [ ] Only arch-firm-dashboard files included
- [ ] No workspace root files
- [ ] No .env or secrets
- [ ] README and docs updated
- [ ] Tested locally

## Emergency Contacts

If repo is compromised:
1. Stop all pushes immediately
2. Check local backups
3. Restore from known good commit
4. Force push clean version
5. Document what happened

---

**Remember:** Public repo = clean, professional, open-source code only.
