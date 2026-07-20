#!/usr/bin/env bash
# One-line installer for the cloudreve-v4-upload skill.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/ZhengHaoF/cloudreve-v4-skill/main/install.sh)
#
# What it does:
#   1. resolves the skill source (clones the repo if run standalone, or uses the
#      current directory when run from inside a cloned copy),
#   2. copies the skill folder into the agent's skills directory
#      (default ~/.workbuddy/skills/cloudreve-v4-upload; override with $SKILLS_DIR),
#   3. cleans up any temp clone.
#
# Requirements: `git` and `bash` (macOS / Linux / Git Bash on Windows).
# On Windows PowerShell without bash, clone first and run `node install.js`.

set -euo pipefail

SKILL_ID="cloudreve-v4-upload"
REPO="https://github.com/ZhengHaoF/cloudreve-v4-skill.git"
TARGET="${SKILLS_DIR:-$HOME/.workbuddy/skills/$SKILL_ID}"

# Resolve source: if this script sits next to SKILL.md, use it; else clone.
SRC=""
TMP=""
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
if [ -f "$SELF_DIR/SKILL.md" ]; then
  SRC="$SELF_DIR"
else
  TMP="$(mktemp -d)"
  echo "Cloning $REPO ..." >&2
  git clone --depth 1 "$REPO" "$TMP/repo" >&2
  SRC="$TMP/repo"
fi

mkdir -p "$TARGET"

# Copy only the skill's own files; exclude repo-only / local artifacts.
for item in SKILL.md README.md README.zh.md scripts references .env.example; do
  if [ -e "$SRC/$item" ]; then
    rm -rf "$TARGET/$item"
    cp -r "$SRC/$item" "$TARGET/$item"
  fi
done

echo "Installed '$SKILL_ID' to $TARGET" >&2
echo "Re-open / restart your agent to load it." >&2

if [ -n "$TMP" ]; then
  rm -rf "$TMP"
fi
