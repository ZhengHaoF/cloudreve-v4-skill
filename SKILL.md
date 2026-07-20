---
name: cloudreve-v4-upload
description: >-
  Upload local files to a self-hosted Cloudreve v4 instance through its REST
  API. Use when the user wants to upload / send / push a local file or path to
  Cloudreve or their private netdisk, or reference a cloudreve:// target.
  Trigger phrases include "上传到 cloudreve", "传到我的网盘", "把文件传到 cloudreve",
  "upload to cloudreve", "sync to cloudreve". Supports the local storage policy
  and S3-compatible policies (s3 / ks3 / cos / obs / oss).
version: "1.4"
agent_created: true
---

# Cloudreve v4 Upload

Upload a local file to a Cloudreve v4 server. Zero external dependencies —
uses only Node.js built-ins (`fetch`, `fs`). Supports the **local** storage
policy and **S3-compatible** policies (s3 / ks3 / cos / obs / oss).

## When to use

- The user asks to upload / send / push a local file to Cloudreve.
- The user references their Cloudreve netdisk or a `cloudreve://` path.

## Agent behavior

- When the user asks to **change / reset Cloudreve credentials** — e.g. "改一下
  cloudreve 的密码", "换 cloudreve 账号", "更新网盘 token" — proactively
  suggest running the script with `--reinit` (or `--reinitialize`) so they can
  update the saved URL / email / password / token. Do not hand-edit
  `~/.cloudreve-upload.json` directly.
- When starting an upload and **no config / args are present**, ask the user for
  the instance URL and credentials, or run `node <skill>/scripts/upload.js --init`
  to walk them through first-time setup.
- Remember Cloudreve v4 logs in with **email, not username** — if the user says
  "用户名" treat it as the email field and confirm if unsure.
- **The whole point is the download link.** After an upload succeeds, the result
  JSON's `download_url` is the final deliverable — a complete, anonymous,
  directly-openable URL. Always surface **only `download_url`** to the user as the
  answer (you may also show `uri` and `name` for reference); do **not** just print
  the raw JSON or stop at the `uri`. If `download_url` is missing, re-run without
  `--no-link`.

## Prerequisites

- A reachable Cloudreve v4 instance URL (with or without the `/api/v4` suffix — both work).
- Auth, one of:
  - An API token (`CLOUDREVE_TOKEN` or `--token`), **or**
  - **Email** + password for password sign-in (`CLOUDREVE_EMAIL` / `CLOUDREVE_PASSWORD`
    or `--email` / `--password`). Note: Cloudreve v4 logs in with the **email**,
    not a username. **2FA is NOT supported in v1.**
- Node.js 18+ available in the environment.

## First-run setup

The skill persists config to `~/.cloudreve-upload.json` so the user is
only asked once. On the **first use** (or whenever the URL / credentials are
missing) the script interactively prompts for:

1. **Cloudreve 实例地址** — e.g. `https://pan.example.com` (or `.../api/v4`).
2. **API Token** — paste one if you have it (preferred); or leave blank to use…
3. **登录邮箱 + 登录密码** — used once to fetch a token (Cloudreve v4 uses email, not username).

After that, config is saved and later uploads skip the prompts. When driving the
skill, if no config/args are present you should ask the user for these three
pieces of information (or run the script with `--init`).

### Re-initialize (change password / email / URL)

Re-running init **reuses the saved values as defaults**: each prompt shows the
current value, and pressing Enter keeps it — so to **only change the password**,
just leave the URL and email blank and type the new password. The whole config
is then overwritten. Aliases: `--init`, `--reinit`, `--reinitialize`.

```bash
node <skill_dir>/scripts/upload.js --reinit      # change any saved setting
node <skill_dir>/scripts/upload.js --reset       # wipe config, then re-init / re-prompt
```

> ⚠️ The config file stores credentials in **plaintext** (token, and email +
> password when password-login was chosen, so an expired token can auto re-login).
> Keep the file private; on Unix it is created with `0600` permissions. To wipe it,
> run with `--reset`.

## How to run

Initialize once (interactive — only needed the first time):

```bash
node <skill_dir>/scripts/upload.js --init
```

Then upload:

```bash
node <skill_dir>/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --token "$CLOUDREVE_TOKEN"
```

With password sign-in instead of a token:

```bash
node <skill_dir>/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --email me@example.com --password 'secret'
```

You can also read credentials from environment variables (see `.env.example`):
`CLOUDREVE_URL`, `CLOUDREVE_TOKEN`, `CLOUDREVE_EMAIL`, `CLOUDREVE_PASSWORD`.
Precedence: CLI args > env vars > saved config file.

## Parameters

| flag           | env                     | default            | description                                          |
| -------------- | ----------------------- | ------------------ | ---------------------------------------------------- |
| `--url`        | `CLOUDREVE_URL`         | —                  | Instance base URL (no `/api/v4` suffix)              |
| `--file`       | —                       | —                  | Local file path to upload (**required**)             |
| `--dir`        | —                       | `/upload/{uuid}/`  | Sub-path **under** the auto-generated `/upload/{uuid}/` folder |
| `--name`       | —                       | basename of file   | Override the file name on the server                |
| `--token`      | `CLOUDREVE_TOKEN`       | —                  | API token (preferred auth)                           |
| `--email`      | `CLOUDREVE_EMAIL`       | —                  | account email (password sign-in)                     |
| `--password`   | `CLOUDREVE_PASSWORD`    | —                  | account password (password sign-in)                  |
| `--policy-id`  | —                       | auto-select        | force a specific storage policy id                   |
| `--overwrite`  | —                       | false              | overwrite existing file (`entity_type=version`)      |
| `--mime`       | —                       | guessed from ext   | override the uploaded file's mime type               |
| `--no-link`    | —                       | false              | skip fetching a temporary download URL after upload  |
| `--init`       | —                       | false              | interactive setup (prompts for URL+auth; shows saved values as defaults) |
| `--reinit`     | —                       | false              | alias of `--init` (re-initialize / change credentials) |
| `--reinitialize` | —                     | false              | alias of `--init` (re-initialize / change credentials) |
| `--reset`      | —                       | false              | clear saved config, then proceed                     |

## Output

- Human-readable progress is written to **stderr**.
- A machine-readable JSON result is written to **stdout** — its `download_url`
  field is the **final deliverable** (a complete, directly-downloadable URL):

```json
{
  "ok": true,
  "uri": "cloudreve://my/upload/<uuid>/docs/archive/file.zip",
  "dir": "upload/<uuid>/docs/archive",
  "name": "file.zip",
  "size": 12345,
  "session_id": "...",
  "download_url": "https://pan.example.com/api/v4/file/content/.../file.zip?download=true&sign=...",
  "download_expires": "2026-07-10T12:06:55+08:00"
}
```

| field              | meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `ok`               | `true` on success                                                         |
| `uri`              | the file's `cloudreve://` path (for future API calls, not for sharing)    |
| `dir`              | the upload folder (`upload/<uuid>`, plus `--dir` sub-path if given)       |
| `name`             | the file name on the server                                               |
| `size`             | file size in bytes                                                        |
| `session_id`       | the upload session id returned by the server                             |
| **`download_url`** | **the complete downloadable link — anonymous, no auth header needed**     |
| `download_expires` | ISO-8601 timestamp when `download_url` stops working                      |

The `download_url` is a **temporary, signed, anonymous** URL fetched automatically
after upload via `POST /api/v4/file/url` (see `references/upload-api.md`). It
expires at `download_expires` (usually ~1 hour). Pass `--no-link` to skip this
extra call and return only the upload metadata.

## Target directory convention

Every upload is placed under an auto-generated folder `/upload/{uuid}/` (a
fresh UUID is created per upload, so files are isolated from one another). The
optional `--dir` value is appended as a sub-path **inside** that folder, e.g.
`--dir /docs/archive` → `cloudreve://my/upload/{uuid}/docs/archive/<file>`.
Pass `--name` to rename the file on the server.

## Notes & limitations

- **Local policy:** chunks uploaded sequentially to Cloudreve's own endpoint,
  auto-completes after the last chunk.
- **S3-compatible (s3 / ks3 / cos / obs / oss):** each part is `PUT` directly to
  its presigned URL (object storage), then `CompleteMultipartUpload`, then a
  `GET /api/v4/callback/{provider}/{session_id}/{key}` notifies Cloudreve. (oss
  callbacks itself, so no client call is needed there.) Verified end-to-end
  against a real `s3` instance.
- Implements the v4 three-step flow: create session → upload chunks → finish/callback.
- Chunks retry up to 3 times with a short backoff on failure.
- **Not yet supported:** OneDrive / 七牛 (Qiniu) / 又拍 (UpYun) — these use
  provider-specific protocols and would be a future v3.
- Raw API contract and error codes: see `references/upload-api.md`.
