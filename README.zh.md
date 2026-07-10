# Cloudreve v4 上传（技能）

通过 Cloudreve v4 的 REST API，把本地文件上传到一个**自托管的 Cloudreve v4** 实例。
零外部依赖——仅使用 Node.js 18+ 内置模块（`fetch`、`fs`）。

> **范围：** 本地存储策略，以及 S3 兼容的存储策略（s3 / ks3 / cos / obs / oss）。
> 支持 Token 鉴权或邮箱+密码登录。OneDrive / 七牛 / 又拍 暂不支持。

## 安装

本技能就是一个文件夹。把它复制到以下任一位置即可：

- **用户级**（在每一个工作区都可用）：

  ```bash
  cp -r cloudreve-v4-skill ~/.workbuddy/skills/cloudreve-v4-upload
  ```

- **项目级**（仅当前项目可用）：

  ```bash
  cp -r cloudreve-v4-skill <你的项目>/.workbuddy/skills/cloudreve-v4-upload
  ```

无需执行 `npm install`——上传脚本不依赖任何第三方包。

## 首次运行（交互式初始化）

```bash
node cloudreve-v4-skill/scripts/upload.js --init
```

脚本会依次提示：

1. **Cloudreve 实例地址** —— `https://pan.example.com`（带不带 `/api/v4` 均可）。
2. **API Token** —— 如果你已有 token，直接粘贴（推荐）；或留空……
3. **登录邮箱 + 密码** —— 仅用于一次性换取 token。

配置会保存到 `~/.workbuddy/cloudreve-upload.json`（明文；Unix 下权限 `0600`）。
之后的运行将跳过这些提示。

> 注意：Cloudreve v4 登录使用的是 **邮箱**，而不是用户名。**v1 不支持两步验证（2FA）。**

## 上传

```bash
node cloudreve-v4-skill/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --token "$CLOUDREVE_TOKEN"
```

或者使用邮箱 + 密码代替 token：

```bash
node cloudreve-v4-skill/scripts/upload.js \
  --file /path/to/local/file.zip \
  --dir /docs/archive \
  --email me@example.com --password 'secret'
```

凭证也可以来自环境变量（见 `.env.example`）：
`CLOUDREVE_URL`、`CLOUDREVE_TOKEN`、`CLOUDREVE_EMAIL`、`CLOUDREVE_PASSWORD`。
优先级：命令行参数 > 环境变量 > 已保存的配置文件。

## 重新初始化（修改密码 / 邮箱 / 地址）

```bash
node cloudreve-v4-skill/scripts/upload.js --reinit    # 别名：--reinitialize
node cloudreve-v4-skill/scripts/upload.js --reset     # 清空已保存的配置
```

`--reinit` 会显示每一项已保存的值作为默认值——直接回车则沿用原值，
输入新值则只修改那一项。

## 参数说明

| 参数            | 环境变量                | 默认值           | 说明                                              |
| --------------- | ----------------------- | ---------------- | ------------------------------------------------- |
| `--url`         | `CLOUDREVE_URL`         | —                | 实例基础地址（无需 `/api/v4` 后缀）               |
| `--file`        | —                       | —                | 要上传的本地文件路径（**必填**）                  |
| `--dir`         | —                       | `/upload/{uuid}/` | 自动生成的 `/upload/{uuid}/` 目录**之下**的子路径 |
| `--name`        | —                       | 文件的 basename  | 覆盖服务端存储的文件名                            |
| `--token`       | `CLOUDREVE_TOKEN`       | —                | API Token（首选鉴权方式）                         |
| `--email`       | `CLOUDREVE_EMAIL`       | —                | 账号邮箱（密码登录用）                            |
| `--password`    | `CLOUDREVE_PASSWORD`    | —                | 账号密码（密码登录用）                            |
| `--policy-id`   | —                       | 自动选择         | 强制使用某个具体的存储策略 id                     |
| `--overwrite`   | —                       | false            | 覆盖已存在的文件（`entity_type=version`）         |
| `--mime`        | —                       | 由扩展名推断     | 覆盖上传文件的 mime 类型                          |
| `--no-link`     | —                       | false            | 上传后跳过获取临时下载链接                        |
| `--init`        | —                       | false            | 交互式首次初始化                                  |
| `--reinit`      | —                       | false            | `--init` 的别名（重新初始化）                     |
| `--reinitialize`| —                       | false            | `--init` 的别名（重新初始化）                     |
| `--reset`       | —                       | false            | 清空已保存配置后再继续                            |

## 输出

- 人类可读的进度信息输出到 **stderr**。
- 机器可读的 JSON 结果输出到 **stdout**。其中的 **`download_url` 字段就是最终产物**——一条完整、匿名、可直接打开下载的链接：

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

  `download_url` 是一条临时的签名直链（无需任何鉴权头），在 `download_expires` 时刻后失效。
  加上 `--no-link` 可跳过这步，只返回上传元数据。

## 文件结构

```
cloudreve-v4-skill/
├── SKILL.md            # 技能定义（触发词、用法、参数）
├── README.md           # 英文说明（本文件有中文版 README.zh.md）
├── README.zh.md        # 中文说明
├── .env.example        # 凭证模板
├── scripts/
│   └── upload.js       # 零依赖上传脚本（Node 18+）
└── references/
    └── upload-api.md   # 已核实的 v4 上传接口契约 + 错误码
```
