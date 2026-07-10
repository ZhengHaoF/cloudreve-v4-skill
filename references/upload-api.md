# Cloudreve v4 Upload — API Reference (local + S3-compatible)

All routes are prefixed with `/api/v4/`. Every response uses HTTP 200 with a JSON
envelope `{ code, data, msg }`; `code === 0` means success, otherwise `msg`
describes the error.

## Authentication

- Most endpoints: header `Authorization: Bearer <access_token>`.
- Password sign-in returns a JWT `access_token` (used as the Bearer token above).

### Password sign-in

`POST /api/v4/session/token`

Request body:

```json
{ "email": "user@cloudreve.org", "password": "P@ssw0rd",
  "captcha": "z3ds", "ticket": "4qXv7KmbYajJ0yFDKcmJ" }
```

`captcha` / `ticket` are only required if the instance enforces a CAPTCHA.
Response (success, `code: 0`):

```json
{ "code": 0, "data": { "token": { "access_token": "<jwt>", "refresh_token": "<jwt>" } } }
```

If 2FA is enabled the server responds with a 2FA-required step (not handled in
v1).

## Step 1 — Create upload session

`PUT /api/v4/file/upload`

Request body:

| field            | type     | required | notes                                                        |
| ---------------- | -------- | -------- | ------------------------------------------------------------ |
| `uri`            | string   | yes      | `cloudreve://my/<dir>/<name>`, each segment URL-encoded      |
| `size`           | integer  | yes      | total file size in bytes                                     |
| `policy_id`      | string   | no       | storage policy id; omit to auto-select                       |
| `last_modified`  | integer  | no       | Unix milliseconds                                            |
| `mime_type`      | string   | no       | server guesses from extension if omitted                     |
| `entity_type`    | enum     | no       | `version` = overwrite existing; omit = fail on conflict     |

`my` is the current user's virtual root. Example `uri`:
`cloudreve://my/Inspirations/archive%20(3).zip`.

Response `data` (key fields):

```json
{
  "session_id": "9897ebae-7b73-4169-aabc-6396f470e4bb",
  "upload_id": "",
  "chunk_size": 26214400,
  "expires": 1749620196,
  "upload_urls": null,
  "credential": null,
  "completeURL": null,
  "storage_policy": { "id": "J7uV", "type": "local", "max_size": 0 },
  "uri": "cloudreve://my/Inspirations/archive%20(3).zip",
  "callback_secret": "..."
}
```

- `chunk_size === 0` ⇒ multipart upload is disabled (send the whole file in one
  chunk, `index = 0`).
- Supported `storage_policy.type` values: `local`, `s3`, `ks3`, `cos`, `obs`, `oss`.

### S3-compatible session response (s3 / ks3 / cos / obs / oss)

```json
{
  "session_id": "481dc1d8-d19a-4728-b719-cdd2b2b03d19",
  "upload_id": "900e9add1153405e4e102800130485e1",
  "chunk_size": 26214400,
  "expires": 1783735877,
  "upload_urls": [
    "https://<bucket>.ss.bscstorage.com/uploads/276/Pb7ofKUJ.txt?X-Amz-...&partNumber=1&uploadId=900e9add..."
  ],
  "completeURL": "https://<bucket>.ss.bscstorage.com/uploads/276/Pb7ofKUJ.txt?X-Amz-...&uploadId=900e9add...",
  "storage_policy": { "id": "QJcj", "name": "QZYUN-CN", "type": "s3", "max_size": 10737418240 },
  "uri": "cloudreve://my/probe-1783649477633.txt",
  "callback_secret": "sg2v5TYWCDWviCqK1FRyZV1vReGVA6Da"
}
```

- `upload_urls` — one **presigned PUT URL per part**; the URL already carries
  `partNumber=N` (1-based) and the multipart `uploadId`.
- `completeURL` — presigned `CompleteMultipartUpload` URL for the same object.
- `callback_secret` — only relevant when the provider calls back on its own
  (e.g. OSS); for the client-driven S3/COS/OBS callback it is **not** needed.

## Step 2 — Upload chunks

### Local / relay policy

`POST /api/v4/file/upload/{session_id}/{index}`

- Headers: `Authorization: Bearer <token>`, `Content-Type: application/octet-stream`,
  `Content-Length: <chunk bytes>` (must equal `chunk_size` except for the last
  chunk).
- Body: **raw binary** of the chunk.
- `index` starts at `0` and chunks **must be uploaded in order**.
- Response: `{ "code": 0, "msg": "" }`.

For `chunk_size === 0`, send the entire file as a single request with `index = 0`.

### S3-compatible policy (s3 / ks3 / cos / obs / oss)

For each part `i` (0-based ⇒ `partNumber = i + 1`):

- `PUT` the raw bytes to `upload_urls[i]`.
- Headers: `Content-Type: application/octet-stream`, `Content-Length: <part bytes>`.
  (The presigned URL already signs `content-length;host`.)
- Capture the `ETag` response header (quoted, e.g. `"48bde17135713d9523c2736dc1c4b5e6"`).

## Step 3 — Complete

### Local policy

Upload completes **automatically** once the last chunk is received. No further
API call is required.

### S3-compatible policy

1. `POST` the `CompleteMultipartUpload` XML to `completeURL`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <CompleteMultipartUpload>
     <Part><PartNumber>1</PartNumber><ETag>"48bde17135713d9523c2736dc1c4b5e6"</ETag></Part>
     <!-- one <Part> per uploaded part, in order -->
   </CompleteMultipartUpload>
   ```

   Headers: `Content-Type: application/xml`. (`completeURL` signs `host` only, so
   do **not** set `Content-Length` yourself — the HTTP client computes it.)

2. Notify Cloudreve via the provider callback:

   `GET /api/v4/callback/{provider}/{session_id}/{key}`

   - `provider` ∈ `{ s3, cos, obs }` (use `s3` for `ks3` too). `oss` callbacks
     itself — skip this call for `oss`.
   - `key` = the **last path segment** of `completeURL` (the object name, e.g.
     `Pb7ofKUJ.txt`), URL-encoded.
   - Auth: **none** required. Expect `{ "code": 0, "msg": "" }` on success.

This flow was verified end-to-end against a real `s3` instance.

## Step 4 — Create download URL (after upload)

`POST /api/v4/file/url`

Request body:

```json
{ "uris": ["cloudreve://my/upload/<uuid>/file.zip"], "download": true }
```

- `uris` — array of one or more `cloudreve://` paths (use the `uri` returned by
  the upload session, or the `uri` in the upload result JSON).
- `download` — `true` to request a download URL (vs. a view/preview URL).

Response `data` (success, `code: 0`):

```json
{
  "code": 0,
  "data": {
    "expires": "2026-07-10T12:06:55+08:00",
    "urls": [
      { "url": "https://pan.example.com/.../file.zip?download=true&sign=...", "name": "file.zip" }
    ]
  }
}
```

- `data.urls[].url` — the **download link**: a temporary, signed, **anonymous**
  URL (no `Authorization` header needed). On S3-compatible policies it points
  straight at the object-storage presigned URL (e.g. `*.ss.bscstorage.com/...`).
- `data.expires` — ISO-8601 timestamp when the link stops working (usually ~1h).
- The script fetches this automatically after every upload (unless `--no-link`)
  and returns `download_url` + `download_expires` in its result JSON. For a
  long-lived link, use Cloudreve's share API instead (not covered here).

## Relevant error codes

| code  | meaning                    |
| ----- | -------------------------- |
| 40011 | Upload session expired     |
| 40012 | Invalid chunk index        |
| 40013 | Invalid Content-Length     |
| 40049 | File too large             |
| 40051 | Insufficient user capacity |
| 40052 | Illegal object name        |
| 40054 | Same-name file being uploaded |
