# Cloudreve v4 Upload (skill)

Upload a local file to a self-hosted **Cloudreve v4** instance through its REST
API. Zero external dependencies — uses only Node.js 18+ built-ins (`fetch`, `fs`).

> **Scope:** local storage policy, plus S3-compatible policies (s3 / ks3 / cos /
> obs / oss). Token auth or email+password sign-in. OneDrive / Qiniu / UpYun are
> not yet supported.

## Install

### Let your AI install it (recommended)

Just ask your agent to follow the setup doc — no shell script needed:

> Please read https://raw.githubusercontent.com/ZhengHaoF/cloudreve-v4-skill/main/cli-setup.en.md and install and configure cloudreve-v4-upload for me, following the steps.

The agent reads `cli-setup.en.md` and runs the steps for you (clone → copy → init).

### Manual

Clone this repository. The uploader is a single, dependency-free Node.js
script — no `npm install` required:

```bash
git clone https://github.com/ZhengHaoF/cloudreve-v4-skill.git
cd cloudreve-v4-skill
```

Requires **Node.js 18+** (uses built-in `fetch` / `fs`).

To install the skill, copy the folder into your agent's skills directory:

```bash
cp -r cloudreve-v4-skill ~/.workbuddy/skills/cloudreve-v4-upload
```

Then configure it (see [First run](#first-run-interactive-setup) below).

## First run (interactive setup)

```bash
node cloudreve-v4-skill/scripts/upload.js --init
```

It prompts for:

1. **Cloudreve instance URL** — `https://pan.example.com` (with or without `/api/v4`).
2. **API Token** — paste one if you have it (preferred); or leave blank…
3. **Login email + password** — used once to fetch a token.

Settings are saved to `~/.cloudreve-upload.json` (plaintext; `0600` on
Unix). Later runs skip the prompts.

> Note: Cloudreve v4 logs in with the **email**, not a username. **2FA is not
> supported in v1.**

## Upload

```bash
node cloudreve-v4-skill/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --token "$CLOUDREVE_TOKEN"
```

Or with email + password instead of a token:

```bash
node cloudreve-v4-skill/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --email me@example.com --password 'secret'
```

Credentials can also come from environment variables (see `.env.example`):
`CLOUDREVE_URL`, `CLOUDREVE_TOKEN`, `CLOUDREVE_EMAIL`, `CLOUDREVE_PASSWORD`.
Precedence: CLI args > env vars > saved config file.

## Re-initialize (change password / email / URL)

```bash
node cloudreve-v4-skill/scripts/upload.js --reinit    # alias: --reinitialize
node cloudreve-v4-skill/scripts/upload.js --reset     # wipe saved config
```

`--reinit` shows each saved value as a default — press Enter to keep it, or type
a new value to change just that field.

## Parameters

| flag            | env                     | default          | description                                       |
| --------------- | ----------------------- | ---------------- | ------------------------------------------------- |
| `--url`         | `CLOUDREVE_URL`         | —                | Instance base URL (no `/api/v4` suffix)           |
| `--file`        | —                       | —                | Local file path to upload (**required**)          |
| `--dir`         | —                       | `/upload/{uuid}/` | Sub-path **under** the auto-generated `/upload/{uuid}/` folder |
| `--name`        | —                       | basename of file | Override the file name on the server              |
| `--token`       | `CLOUDREVE_TOKEN`       | —                | API token (preferred auth)                        |
| `--email`       | `CLOUDREVE_EMAIL`       | —                | account email (password sign-in)                  |
| `--password`    | `CLOUDREVE_PASSWORD`    | —                | account password (password sign-in)               |
| `--policy-id`   | —                       | auto-select      | force a specific storage policy id                |
| `--overwrite`   | —                       | false            | overwrite existing file (`entity_type=version`)   |
| `--mime`        | —                       | guessed from ext | override the uploaded file's mime type            |
| `--no-link`     | —                       | false            | skip fetching a temporary download URL after upload |
| `--init`        | —                       | false            | interactive first-run setup                        |
| `--reinit`      | —                       | false            | alias of `--init` (re-initialize)                 |
| `--reinitialize` | —                      | false            | alias of `--init` (re-initialize)                 |
| `--reset`       | —                       | false            | clear saved config, then proceed                  |

## Output

- Human-readable progress goes to **stderr**.
- A machine-readable JSON result goes to **stdout**. Its **`download_url` field
  is the final deliverable** — a complete, anonymous, directly-downloadable URL:

  ```json
  {
    "ok": true,
    "uri": "cloudreve://my/upload/<uuid>/file.zip",
    "dir": "upload/<uuid>",
    "name": "file.zip",
    "size": 12345,
    "session_id": "...",
    "download_url": "https://pan.example.com/.../file.zip?download=true&sign=...",
    "download_expires": "2026-07-10T12:06:55+08:00"
  }
  ```

  `download_url` is a temporary signed link (no auth header needed) that expires
  at `download_expires`. Pass `--no-link` to skip it and return only upload
  metadata.

## Files

```
cloudreve-v4-skill/
├── SKILL.md            # skill definition (trigger phrases, usage, params)
├── README.md           # this file (English)
├── README.zh.md        # Chinese version
├── .env.example        # credential template
├── scripts/
│   └── upload.js       # zero-dependency uploader (Node 18+)
└── references/
    └── upload-api.md   # verified v4 upload API contract + error codes
```
