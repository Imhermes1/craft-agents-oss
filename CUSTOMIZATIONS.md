# Craft Agents Custom - Customizations

This fork is customized to run alongside the official Craft Agents app without conflicts.

## What Was Changed

### 1. App Identity
- **Bundle ID:** `com.custom.craft-agent-custom` (was: `com.lukilabs.craft-agent`)
- **Product Name:** "Craft Agents Custom" (was: "Craft Agents")
- **Deep Link Scheme:** `craftagentscustom://` (was: `craftagents://`)

**Files modified:**
- `apps/electron/electron-builder.yml` (lines 1-3)
- `apps/electron/src/main/index.ts` (lines 34, 44)

### 2. Config Directory
- **Location:** `~/.craft-agent-custom/` (was: `~/.craft-agent/`)

**Files modified:**
- `packages/shared/src/config/paths.ts` (line 19)

### 3. Package Name
- **Name:** `@craft-agent-custom/electron` (was: `@craft-agent/electron`)

**Files modified:**
- `apps/electron/package.json` (line 2)

## Building

```bash
# Build Mac app (no code signing)
CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:dist:mac

# Output:
# apps/electron/release/Craft-Agent-arm64.dmg (M-series Macs)
# apps/electron/release/Craft-Agent-x64.dmg (Intel Macs)
```

## Pulling Upstream Updates

```bash
# Get latest from official Craft Agents
git fetch upstream
git merge upstream/main

# Resolve conflicts if any (your customizations vs upstream changes)
# Then rebuild
bun install
CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:dist:mac
```

## Where Your Data Lives

All settings, sessions, and sources are stored in:
```
~/.craft-agent-custom/
├── config.json                    # Main config
├── credentials.enc                # Encrypted API keys
├── theme.json                     # App theme
└── workspaces/
    └── {workspace-id}/
        ├── config.json            # Workspace settings
        ├── sources/               # MCP servers, APIs, local files
        │   ├── google-calendar/
        │   ├── gmail/
        │   └── ...
        └── sessions/              # Chat sessions
            └── {session-id}/
                ├── session.jsonl  # Conversation history
                └── attachments/   # File uploads
```

This is completely separate from the stock app's `~/.craft-agent/` directory.

## Your All-in-One Setup

Once installed, add these integrations:

### Google Services (Built-in OAuth)
```
"Create a Google Calendar source"
"Create a Gmail source"
"Create a Google Drive source"
```

### Tasks (MCP Servers)
```
"Add the Linear MCP server"
OR
"Add the Notion MCP server"
```

### Usage
```
"What's on my calendar today?"
"Show unread emails from real estate clients"
"Find the contract in Drive from last week"
"Add task: Follow up with John about the Elm St property"
```

## Future Customizations

Want to add more custom features? All your changes go in:
- Sources: `~/.craft-agent-custom/workspaces/default/sources/`
- Skills: `~/.craft-agent-custom/workspaces/default/skills/`
- Themes: `~/.craft-agent-custom/theme.json`

Code changes should be committed to your fork:
```bash
git add .
git commit -m "Add custom feature X"
git push origin main
```

---

**Upstream:** https://github.com/lukilabs/craft-agents-oss
