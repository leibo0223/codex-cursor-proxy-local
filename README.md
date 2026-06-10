# codex-cursor-proxy-local

兼容 Cursor 的本地代理服务，用于连接 Codex CLI 使用的 ChatGPT Codex 后端。

## 安装

先安装 `cloudflared`：

macOS：

```bash
brew install cloudflared
```

Linux：

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/cloudflared
```

然后全局安装本项目：

```bash
npm install -g git+ssh://git@git.sankuai.com/~leibo04/codex-cursor-proxy.git --install-links=true
```

## 使用方式

确保 Codex CLI 已完成认证，并且存在 `~/.codex/auth.json`。

启动代理：

```bash
codex-cursor-proxy
```

命令会启动本地服务，创建 Cloudflare quick tunnel，并打印 Cursor 配置：

```text
OpenAI Base URL for Cursor: https://xxxx.trycloudflare.com
API Key: ccp_...
```

在 Cursor Settings → Models → API Keys → OpenAI API Key 中填入这些值：

```text
Base URL: https://xxxx.trycloudflare.com
API Key: ccp_...
```
在会话中选择Codex订阅支持的模型（如GPT-5.5 High）

终端进程重启后，quick tunnel 的域名会发生变化，需要手动更新。

## 安全说明

quick tunnel URL 是公开可访问的。本代理会使用生成的 `ccp_...` token 校验 Cursor API Key，该 token 存储在：

```text
~/.codex/cursor-proxy/config.json
```

不要分享 tunnel URL 或 API Key。使用完成后请停止该进程。
