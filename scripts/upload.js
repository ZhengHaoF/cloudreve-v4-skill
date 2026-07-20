#!/usr/bin/env node
'use strict';

/**
 * Cloudreve v4 — file uploader (zero dependencies, Node 18+).
 *
 * Supported storage policies:
 *   - local        : POST chunks to Cloudreve's own endpoint, auto-completes.
 *   - s3/ks3/cos/obs/oss : S3-compatible. Upload parts to presigned URLs
 *     (direct to object storage), CompleteMultipartUpload, then notify
 *     Cloudreve via its /callback/{provider}/... endpoint (oss auto-callbacks).
 *
 * Flow:
 *   1. Resolve config: CLI args > env > ~/.cloudreve-upload.json
 *      (first run with missing info triggers an interactive init).
 *   2. Auth:  token (preferred) or email+password sign-in.
 *   3. PUT  /api/v4/file/upload            -> create upload session
 *   4. upload chunks (policy-specific)
 *   5. finish / callback (policy-specific)
 *
 * API contract details: see ../references/upload-api.md
 */

const fs = require('fs');
const fsProm = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');

const CONFIG_PATH = path.join(os.homedir(), '.cloudreve-upload.json');

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function log(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fail(msg) {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}

// Build a Cloudreve URI: cloudreve://my/<encoded-dir-segments>/<encoded-name>
function buildUri(dir, name) {
  let d = (dir || '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const segs = [];
  if (d) d.split('/').forEach((s) => segs.push(encodeURIComponent(s)));
  segs.push(encodeURIComponent(name));
  return 'cloudreve://my/' + segs.join('/');
}

// Read exactly buf.length bytes from fd at offset (handles short reads).
// `fd` is a FileHandle from fsProm.open(); use its .read() (promise) method.
async function readAt(fd, buf, offset) {
  let done = 0;
  while (done < buf.length) {
    const { bytesRead } = await fd.read(buf, done, buf.length - done, offset + done);
    if (bytesRead === 0) break;
    done += bytesRead;
  }
  return done;
}

// ---------------------------------------------------------------------------
// config persistence
// ---------------------------------------------------------------------------
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveConfig(cfg) {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  // Restrict permissions on Unix-like systems.
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(CONFIG_PATH, 0o600);
    } catch (_) {
      /* ignore */
    }
  }
}

function deleteConfig() {
  try {
    fs.unlinkSync(CONFIG_PATH);
  } catch (_) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Cloudreve client
// ---------------------------------------------------------------------------
function apiBase(state) {
  const u = (state.url || '').replace(/\/+$/, '');
  if (!u) fail('Missing Cloudreve URL. Pass --url or run with --init.');
  // Accept either "https://x.com" or "https://x.com/api/v4".
  return u.replace(/\/api\/v4\/?$/, '') + '/api/v4';
}

async function login(email, password, url) {
  const u = (url || '').replace(/\/+$/, '');
  if (!u) fail('Missing Cloudreve URL (cannot log in).');
  const base = u.replace(/\/api\/v4\/?$/, '') + '/api/v4';
  const r = await fetch(base + '/session/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.code !== 0) fail('Login failed: ' + (j.msg || JSON.stringify(j)));
  if (!j.data || !j.data.token || !j.data.token.access_token) {
    fail('Login did not return a token (2FA may be required — not supported in v1).');
  }
  return j.data.token.access_token;
}

async function getToken(state) {
  if (state.token) return state.token;
  if (state.email && state.password) {
    log('未提供 token，使用邮箱+密码登录...');
    state.token = await login(state.email, state.password, state.url);
    saveConfig(state);
    return state.token;
  }
  fail('No token and no email/password. Pass --token or --email/--password, or run --init.');
}

async function createSession(state, uri, size, opts) {
  const body = { uri, size };
  if (opts.lastModified) body.last_modified = opts.lastModified;
  if (opts.mimeType) body.mime_type = opts.mimeType;
  if (opts.policyId) body.policy_id = opts.policyId;
  if (opts.overwrite) body.entity_type = 'version';

  const doReq = (token) =>
    fetch(apiBase(state) + '/file/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });

  let r = await doReq(state.token);
  let j = await r.json().catch(() => ({}));

  // Token expired/invalid — auto re-login if we have stored credentials.
  if (j.code === 401 && state.email && state.password) {
    log('Token 失效，尝试重新登录...');
    state.token = await login(state.email, state.password, state.url);
    saveConfig(state);
    r = await doReq(state.token);
    j = await r.json().catch(() => ({}));
  }

  if (j.code !== 0) fail('Create upload session failed: ' + (j.msg || j.code));
  return j.data;
}

// Ask Cloudreve for a temporary, anonymous, signed download URL for a file.
// Endpoint: POST /api/v4/file/url  body: { uris:[uri], download:true }
// Response: data.urls[].url  (array — supports batches) and data.expires.
async function createDownloadUrl(state, uri, opts) {
  const body = { uris: [uri], download: true };
  if (opts && opts.redirect) body.redirect = true;

  const doReq = (token) =>
    fetch(apiBase(state) + '/file/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });

  let r = await doReq(state.token);
  let j = await r.json().catch(() => ({}));

  // Token expired/invalid — auto re-login if we have stored credentials.
  if (j.code === 401 && state.email && state.password) {
    state.token = await login(state.email, state.password, state.url);
    saveConfig(state);
    r = await doReq(state.token);
    j = await r.json().catch(() => ({}));
  }

  if (j.code !== 0) throw new Error(j.msg || 'code ' + j.code);
  const urls = (j.data && j.data.urls) || [];
  if (!urls.length) throw new Error('no url returned');
  return { url: urls[0].url, expires: j.data && j.data.expires };
}

async function uploadOneChunk(state, sessionId, index, buf) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(`${apiBase(state)}/file/upload/${sessionId}/${index}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.token,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buf.length),
        },
        body: buf,
      });
      const j = await r.json().catch(() => ({}));
      if (j.code !== 0 && j.code !== undefined) {
        throw new Error(j.msg || 'code ' + j.code);
      }
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      return;
    } catch (e) {
      if (attempt === maxRetries) {
        throw new Error(`chunk ${index} failed after ${maxRetries} attempts: ${e.message}`);
      }
      process.stderr.write(`  retry chunk ${index} (${attempt}/${maxRetries}): ${e.message}\n`);
      await sleep(500 * attempt);
    }
  }
}

async function uploadLocal(state, session, fd, size) {
  const chunkSize = session.chunk_size;

  // Multipart disabled (chunk_size === 0): send the whole file as one chunk.
  if (!chunkSize || chunkSize <= 0) {
    const buf = Buffer.alloc(size);
    await readAt(fd, buf, 0);
    await uploadOneChunk(state, session.session_id, 0, buf);
    return;
  }

  let index = 0;
  let offset = 0;
  while (offset < size) {
    const len = Math.min(chunkSize, size - offset);
    const buf = Buffer.alloc(len);
    await readAt(fd, buf, offset);
    await uploadOneChunk(state, session.session_id, index, buf);
    offset += len;
    index++;
    if (size > 0) {
      process.stderr.write(`  uploaded chunk ${index} (${(offset / size * 100).toFixed(1)}%)\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// S3-compatible upload (s3 / ks3 / cos / obs / oss)
// ---------------------------------------------------------------------------
// After create-session, the response carries `upload_urls` (one presigned PUT
// URL per part), `completeURL` (presigned CompleteMultipartUpload URL) and
// `session_id`. We upload each part directly to object storage, finalize the
// multipart upload, then notify Cloudreve via GET /api/v4/callback/{provider}/...
// (oss callbacks itself, so no client call is needed there).
const S3_CALLBACK_PROVIDER = { s3: 's3', ks3: 's3', cos: 'cos', obs: 'obs', oss: 'oss' };

async function uploadS3Part(url, buf) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(buf.length),
        },
        body: buf,
      });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const etag = r.headers.get('ETag');
      if (!etag) throw new Error('response missing ETag header');
      return etag;
    } catch (e) {
      if (attempt === maxRetries) {
        throw new Error(`S3 part upload failed after ${maxRetries} attempts: ${e.message}`);
      }
      process.stderr.write(`  retry S3 part (${attempt}/${maxRetries}): ${e.message}\n`);
      await sleep(500 * attempt);
    }
  }
}

async function completeS3Multipart(completeURL, parts) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>';
  for (const p of parts) {
    xml += `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`;
  }
  xml += '</CompleteMultipartUpload>';
  const r = await fetch(completeURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });
  if (r.status !== 200) {
    const t = await r.text().catch(() => '');
    throw new Error('CompleteMultipartUpload failed: HTTP ' + r.status + ' ' + t);
  }
}

async function uploadS3(state, session, fd, size) {
  const chunkSize = session.chunk_size > 0 ? session.chunk_size : size;
  const uploadUrls = session.upload_urls || [];
  if (!uploadUrls.length) fail('S3 session returned no upload_urls.');
  if (!session.completeURL) fail('S3 session returned no completeURL.');

  const parts = [];
  let index = 0;
  let offset = 0;
  while (offset < size) {
    const len = Math.min(chunkSize, size - offset);
    const buf = Buffer.alloc(len);
    await readAt(fd, buf, offset);
    const url = uploadUrls[index];
    if (!url) fail(`Missing presigned URL for part ${index + 1} (got ${uploadUrls.length} URLs).`);
    log(`  uploading S3 part ${index + 1} (${((offset + len) / size * 100).toFixed(1)}%)`);
    const etag = await uploadS3Part(url, buf);
    parts.push({ PartNumber: index + 1, ETag: etag });
    offset += len;
    index++;
  }

  log('  completing S3 multipart upload...');
  await completeS3Multipart(session.completeURL, parts);

  // Notify Cloudreve. oss callbacks itself; the others need an explicit call.
  const provider = S3_CALLBACK_PROVIDER[session.storage_policy.type];
  if (provider && provider !== 'oss') {
    // Cloudreve's callback route is GET /api/v4/callback/{provider}/{sessionID}/{key},
    // where the PATH param `key` must equal the session's `callback_secret`
    // (server does a constant-time compare). It is NOT the S3 object key. A
    // mismatch returns 40020 "Invalid callback secret".
    const cbUrl =
      apiBase(state) +
      '/callback/' +
      provider +
      '/' +
      session.session_id +
      '/' +
      encodeURIComponent(session.callback_secret || '');
    const cb = await fetch(cbUrl, { method: 'GET' });
    const cbj = await cb.json().catch(() => ({}));
    if (cbj.code !== 0) fail('Cloudreve S3 callback failed: ' + JSON.stringify(cbj));
    log('  Cloudreve callback ok');
  }
}

// ---------------------------------------------------------------------------
// first-run interactive init
// ---------------------------------------------------------------------------
async function interactiveInit(existing) {
  if (!process.stdin.isTTY) {
    fail(
      '无法交互初始化：当前不是终端环境。请直接在命令中提供 --url 与 --token/--email/--password，' +
        '或在终端运行 `node upload.js --init`。'
    );
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q) => new Promise((res) => rl.question(q, res));
  const cur = existing || {};
  // Show the currently-saved value as a hint; empty input keeps it (re-init convenience).
  const hint = (v) => (v ? ` (当前: ${v})` : '');

  log('=== Cloudreve v4 上传 · 初始化 / 重新初始化 ===');
  log('（如需修改某项，直接输入新值；留空则沿用已保存的值）');
  const url = (await ask('Cloudreve 实例地址' + hint(cur.url) + ': ')).trim() || cur.url;
  if (!url) fail('实例地址不能为空。');
  const token =
    (await ask('已有 API Token？直接粘贴（留空则用邮箱+密码登录）: ')).trim() || cur.token || '';

  const cfg = { url };
  if (token) {
    cfg.token = token;
  } else {
    const email =
      (await ask('登录邮箱 (Cloudreve v4 用邮箱登录，不是用户名)' + hint(cur.email) + ': ')).trim() ||
      cur.email;
    const password =
      (await ask('登录密码 (留空则沿用已保存的)' + hint(cur.password ? '****' : '') + ': ')).trim() ||
      cur.password;
    if (!email) fail('邮箱不能为空。');
    if (!password) fail('未提供密码且已保存密码为空，无法登录；请直接输入新密码。');
    log('正在用邮箱+密码登录以验证...');
    try {
      cfg.token = await login(email, password, url);
    } catch (e) {
      fail('登录失败：' + e.message);
    }
    cfg.email = email;
    cfg.password = password; // persisted so future token-expiry can auto re-login
  }
  rl.close();

  saveConfig(cfg);
  log('配置已保存到 ' + CONFIG_PATH + '（明文存储，请确保该文件不被他人读取）。');
  return cfg;
}

async function resolveConfig(args) {
  const file = loadConfig() || {};
  const state = {
    url: args.url || process.env.CLOUDREVE_URL || file.url || '',
    token: args.token || process.env.CLOUDREVE_TOKEN || file.token || '',
    email: args.email || process.env.CLOUDREVE_EMAIL || file.email || '',
    password: args.password || process.env.CLOUDREVE_PASSWORD || file.password || '',
  };
  if (args.reset) {
    deleteConfig();
    log('已清除本地配置。');
  }

  const wantInit = args.init || args.reinit || args.reinitialize;
  if (wantInit) {
    const init = await interactiveInit(file);
    Object.assign(state, init);
    return state;
  }

  const missingUrl = !state.url;
  const missingAuth = !state.token && !(state.email && state.password);
  if (missingUrl || missingAuth) {
    if (process.stdin.isTTY) {
      log('检测到缺少 Cloudreve 配置，进入初始化...');
      const init = await interactiveInit(file);
      Object.assign(state, init);
    } else {
      fail(
        '缺少 Cloudreve 配置（需要 --url 与 --token 或 --email+--password）。' +
          '请在终端运行 `node upload.js --init` 完成首次初始化，或在命令中提供参数/环境变量。'
      );
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));

async function main() {
  const state = await resolveConfig(args);

  const filePath = args.file;
  if (!filePath) fail('--file <path> is required.');

  let stat;
  try {
    stat = await fsProm.stat(filePath);
  } catch (e) {
    fail('Cannot access file: ' + filePath + ' (' + e.message + ')');
  }
  if (!stat.isFile()) fail('Not a regular file: ' + filePath);

  const size = stat.size;
  const name = args.name || path.basename(filePath);

  // Each upload lands under /upload/{uuid}/ so files are isolated per upload.
  // --dir, if given, becomes a sub-path under that folder.
  const uploadUuid = crypto.randomUUID();
  let effectiveDir = 'upload/' + uploadUuid;
  if (args.dir) {
    const sub = String(args.dir).replace(/^\/+/, '').replace(/\/+$/, '');
    effectiveDir += '/' + sub;
  }
  const uri = buildUri(effectiveDir, name);

  const token = await getToken(state);
  state.token = token;

  log(`Creating upload session: ${uri} (${size} bytes)`);
  const session = await createSession(state, uri, size, {
    lastModified: Math.round(stat.mtimeMs),
    mimeType: args.mime,
    policyId: args['policy-id'],
    overwrite: !!args.overwrite,
  });

  const policyType = session.storage_policy && session.storage_policy.type;
  log(`Session ${session.session_id} | chunk_size ${session.chunk_size} | policy ${policyType}`);

  const S3_FAMILY = ['s3', 'ks3', 'cos', 'obs', 'oss'];
  const fd = await fsProm.open(filePath, 'r');
  try {
    if (policyType === 'local') {
      await uploadLocal(state, session, fd, size);
    } else if (S3_FAMILY.includes(policyType)) {
      await uploadS3(state, session, fd, size);
    } else {
      fail(
        `Unsupported storage policy "${policyType}". ` +
          `This uploader supports: local, s3, ks3, cos, obs, oss. ` +
          `onedrive / qiniu / upyun are not yet supported.`
      );
    }
  } finally {
    await fd.close();
  }

  // Optionally fetch a temporary, signed download URL for the uploaded file.
  let downloadUrl = null;
  let downloadExpires = null;
  if (!args['no-link']) {
    try {
      const link = await createDownloadUrl(state, uri);
      downloadUrl = link.url;
      downloadExpires = link.expires;
      log('Download URL: ' + downloadUrl);
    } catch (e) {
      log('Warning: could not create download URL: ' + e.message);
    }
  }

  log(`Upload complete: ${name}`);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      uri,
      dir: effectiveDir,
      name,
      size,
      session_id: session.session_id,
      download_url: downloadUrl,
      download_expires: downloadExpires,
    }) + '\n'
  );
}

main().catch((e) => fail(e.message));
