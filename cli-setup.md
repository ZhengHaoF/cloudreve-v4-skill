# cloudreve-v4-upload 安装指南（面向 AI Agent）

本文件供 AI Agent 阅读并按步骤执行，为用户在本机**安装并配置** cloudreve-v4-upload 技能。

> 用户让 AI 安装时，只需说：
>
> **「请阅读 https://raw.githubusercontent.com/ZhengHaoF/cloudreve-v4-skill/main/cli-setup.md 文档，按照步骤为我安装并配置 cloudreve-v4-upload」**

---

## 环境要求

- **Node.js 18+**（脚本仅使用内置模块，无需 `npm install`）
- **git**（仅当本机尚未克隆仓库时需要）

---

## 第 1 步 — 获取技能文件夹

若用户本机还没有该仓库，克隆它并进入目录：

```bash
git clone https://github.com/ZhengHaoF/cloudreve-v4-skill.git
cd cloudreve-v4-skill
```

（若已克隆，直接进入该目录即可，跳过克隆。）

---

## 第 2 步 — 安装技能

技能本质就是一个文件夹，复制到 Agent 的 skills 目录即会被加载。

- **用户级**（所有工作区都可用）：

  ```bash
  cp -r cloudreve-v4-skill ~/.workbuddy/skills/cloudreve-v4-upload
  ```

- **项目级**（仅当前项目可用）：

  ```bash
  cp -r cloudreve-v4-skill <项目根目录>/.workbuddy/skills/cloudreve-v4-upload
  ```

**注意：**

- 目标目录名必须是 `cloudreve-v4-upload`（这是技能 ID，Agent 靠它识别），源目录名是 `cloudreve-v4-skill`，两者不同，别粘贴错。
- Windows PowerShell 没有 `cp -r`，改用：

  ```powershell
  Copy-Item -Recurse cloudreve-v4-skill $env:USERPROFILE/.workbuddy/skills/cloudreve-v4-upload
  ```

---

## 第 3 步 — 初始化配置

运行初始化（交互式程序，会提示输入实例地址、API Token 或邮箱+密码）：

```bash
node cloudreve-v4-skill/scripts/upload.js --init
```

**AI 执行注意：**

- `--init` 是交互式的。如果用户还没提供凭据，**先向用户询问**两样东西：
  1. Cloudreve 实例地址（可带或不带 `/api/v4` 后缀均可）；
  2. 二选一：① API Token，或 ② 邮箱 + 密码。
- Cloudreve v4 使用**邮箱**登录，不是用户名。
- 凭据会明文保存到 `~/.cloudreve-upload.json`（Unix 下权限 `0600`）。
- 若用户说「改一下密码 / 改一下邮箱 / 重新初始化」，运行 `node .../upload.js --reinit`（与 `--init` 相同，但会回显上次的地址/邮箱作为默认值）。

---

## 第 4 步 — 验证（可选）

```bash
node cloudreve-v4-skill/scripts/upload.js --file <某个本地文件>
```

成功后输出 `download_url`，把它发给用户即可（链接约 1 小时有效）。

---

## 完成

安装完成后，提示用户：**重启 / 重新打开 Agent** 以加载新技能。

---

## 备选：一键安装（Node，可选）

若用户希望更省事，克隆后进入目录执行：

```bash
node install.js
```

它会自动把技能复制到默认 skills 目录（可用 `SKILLS_DIR` 环境变量覆盖目标目录）。
