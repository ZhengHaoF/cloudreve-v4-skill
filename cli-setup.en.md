# cloudreve-v4-upload Setup Guide (for AI Agents)

This document is meant to be **read and executed step-by-step by an AI Agent** to install and configure the `cloudreve-v4-upload` skill on the user's machine.

> To have an AI install it, just say:
>
> **"Please read https://raw.githubusercontent.com/ZhengHaoF/cloudreve-v4-skill/main/cli-setup.en.md and install and configure cloudreve-v4-upload for me, following the steps."**

---

## Requirements

- **Node.js 18+** (the script uses only built-in modules — no `npm install` needed)
- **git** (only needed if the repo isn't already cloned locally)

---

## Step 1 — Get the skill folder

If the user doesn't already have the repo, clone it and enter the directory:

```bash
git clone https://github.com/ZhengHaoF/cloudreve-v4-skill.git
cd cloudreve-v4-skill
```

(If already cloned, just `cd` into it and skip cloning.)

---

## Step 2 — Install the skill

The skill is just a folder. Copy it into your agent's skills directory to make it loadable.

- **User-level** (available in every workspace):

  ```bash
  cp -r cloudreve-v4-skill ~/.workbuddy/skills/cloudreve-v4-upload
  ```

- **Project-level** (only the current project):

  ```bash
  cp -r cloudreve-v4-skill <project-root>/.workbuddy/skills/cloudreve-v4-upload
  ```

**Notes:**

- The target directory name **must** be `cloudreve-v4-upload` (that's the skill ID the agent recognizes). The source directory is `cloudreve-v4-skill` — they differ, don't mix them up.
- Windows PowerShell has no `cp -r`; use instead:

  ```powershell
  Copy-Item -Recurse cloudreve-v4-skill $env:USERPROFILE/.workbuddy/skills/cloudreve-v4-upload
  ```

---

## Step 3 — Initialize config

Run the initializer (interactive — it prompts for the instance URL, an API token, or email+password):

```bash
node cloudreve-v4-skill/scripts/upload.js --init
```

**Notes for the AI:**

- `--init` is interactive. If the user hasn't provided credentials yet, **ask for two things first**:
  1. The Cloudreve instance URL (with or without the `/api/v4` suffix — both work);
  2. One of: ① an API token, or ② email + password.
- Cloudreve v4 authenticates with **email**, not a username.
- Credentials are stored in plaintext at `~/.cloudreve-upload.json` (`0600` on Unix).
- If the user says "change my password / change my email / re-initialize", run `node .../upload.js --reinit` (same as `--init`, but echoes the previous URL/email as defaults).

---

## Step 4 — Verify (optional)

```bash
node cloudreve-v4-skill/scripts/upload.js --file <some local file>
```

On success it prints `download_url` — send that to the user (the link is valid for ~1 hour).

---

## Done

After installing, tell the user to **restart / reopen the agent** so the new skill is loaded.

---

## Alternative: one-command install (Node, optional)

If the user prefers, after cloning, run:

```bash
node install.js
```

It copies the skill into the default skills directory automatically (override the target with the `SKILLS_DIR` env var).
