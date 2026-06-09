# codex-cursor-proxy-local

这是一个本地 Node.js 项目，用于运行兼容 Cursor 的代理服务，并连接 Codex CLI 使用的 ChatGPT Codex 后端。

这是 `codex-cursor-proxy` 的本地维护版本，包含我们已经测试过的修复和增强：

- 通过 `cloudflared` quick tunnel 一键启动
- 持久化的代理 API Key
- 兼容 Cursor 的 `input` / `messages`
- 将 Responses 流式输出转换为 Chat Completions SSE
- 支持 `custom_tool_call`，可用于 Cursor 的 `ApplyPatch` 等文件编辑工具
- 为较慢的推理停顿提供更长的流式超时时间
- 可按需开启调试日志

## 环境要求

- Node.js 18.17 或更高版本
- `cloudflared` 已加入 `PATH`
- Codex CLI 已完成认证，并且存在 `~/.codex/auth.json`

在 macOS 上，可以通过以下命令安装 Cloudflare Tunnel：

```bash
brew install cloudflared
```

## 安装

```bash
npm install
npm run build
```

如果需要安装为本地全局命令：

```bash
npm link
```

安装后会暴露以下命令：

```bash
codex-cursor-proxy
```

## 使用方式

```bash
codex-cursor-proxy
```

该命令会启动本地服务，创建 Cloudflare quick tunnel，并打印 Cursor 配置：

```text
OpenAI Base URL for Cursor: https://xxxx.trycloudflare.com
API Key: ccp_...
```

在 Cursor 中填入这些值：

```text
Base URL: https://xxxx.trycloudflare.com
API Key: ccp_...
Model: gpt-5.5
```

进程重启后，quick tunnel 的域名会发生变化。

## 调试

工具级日志：

```bash
CCP_DEBUG=tools codex-cursor-proxy
```

简短预览工具输入和输出的原始内容：

```bash
CCP_DEBUG=raw codex-cursor-proxy
```

`raw` 模式可能包含文件路径和补丁片段，请仅在临时排查问题时使用。

## 环境变量

- `CCP_PORT`：本地端口，默认值为 `3000`
- `CCP_DEBUG`：可设置为 `tools`、`raw`、`all`、`1` 或 `true`
- `CCP_AUTH_PATH`：覆盖 Codex 认证文件路径
- `CCP_CONFIG_DIR`：覆盖代理配置目录
- `CCP_API_URL`：覆盖 Codex 后端 URL
- `CCP_MAX_BODY_BYTES`：请求体大小限制，默认值为 `52428800`

## 安全说明

quick tunnel URL 是公开可访问的。本代理会使用生成的 `ccp_...` token 校验 Cursor API Key，该 token 存储在：

```text
~/.codex/cursor-proxy/config.json
```

不要分享 tunnel URL 或 API Key。使用完成后请停止该进程。
