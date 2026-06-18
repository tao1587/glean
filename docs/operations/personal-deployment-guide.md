# Personal Deployment Guide (UGREEN NAS)

## Overview

本文档描述如何将自己 fork 开发的版本部署到绿联 NAS 上，通过自己的 release tag 发版，完全自主控制。

### Architecture

```
Your Mac (开发)                    GitHub (CI/CD)                    UGREEN NAS (部署)
─────────────────────────────────────────────────────────────────────────────────────
git push tag                →    GitHub Actions 自动构建     →     绿联 Docker 拉取
                                   │                                      │
                                   ├── glean-backend (amd64+arm64)        │
                                   ├── glean-worker  (amd64+arm64)        │
                                   ├── glean-web     (amd64+arm64)        │
                                   └── glean-admin   (amd64+arm64)        │
                                   │                                      │
                                   ▼                                      ▼
ghcr.io/gotoboy/glean-*:version/latest ← docker-compose.yml
```

---

## Step 1: Fork 准备工作（仅首次）

### 1.1 启用 GitHub Actions

你的 fork 默认可能禁用了 workflows：

1. 打开 `https://github.com/GoToBoy/glean`
2. 点 **Actions** tab
3. 点 **I understand my workflows, go ahead and enable them**

### 1.2 设置 GHCR Packages 为公开

构建完成后，镜像默认是 private，绿联 NAS 拉不到：

1. 打开 `https://github.com/GoToBoy?tab=packages`
2. 分别点击 `glean-backend`、`glean-web`、`glean-admin`
3. 每个 package → **Package settings** → **Danger Zone** → **Change visibility** → **Public**

> 首次构建后才会出现 packages，所以先完成 Step 2 再来做这一步。

---

## Step 2: 触发构建

### 方式 A：正式版 Tag（推荐）

把代码提交并推送到 GitHub 后，再创建并推送正式版 tag。只有 tag push 会触发 `release.yml` 构建并推送四个镜像：

```bash
git push origin personal-main
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

构建成功后会生成这些镜像 tag：

| 推送类型 | 镜像 Tag | 示例 |
|----------|----------|------|
| 正式版 tag push | 版本号 | `0.1.0` |
| 正式版 tag push | 主次版本 | `0.1` |
| 正式版 tag push | 主版本 | `0` |
| 正式版 tag push | `latest` | `latest` |

部署到 NAS 时，优先使用版本号 tag，例如 `0.1.0`。`latest` 也会更新，但不适合需要可回滚、可审计的部署。

### 方式 B：GitHub Release / Tag

1. 打开 `https://github.com/GoToBoy/glean/releases`
2. 点 **Draft a new release**
3. **Choose a tag** → 输入 `v0.1.0` → 选 **Create new tag: v0.1.0 on publish**
4. **Target** 选 `main` 或 `personal-main`
5. Title 随意填写
6. 点 **Publish release**

### 方式 C：预发布 Tag

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

### Tag 命名规则

| Tag 格式 | 触发的 Workflow | 镜像 Tag | 更新 latest? |
|----------|----------------|----------|-------------|
| `v0.1.0-alpha.1` | `pre-release.yml` | `0.1.0-alpha.1` | **否** |
| `v0.1.0-beta.1` | `pre-release.yml` | `0.1.0-beta.1` | **否** |
| `v0.1.0-rc.1` | `pre-release.yml` | `0.1.0-rc.1` | **否** |
| `v0.1.0` | `release.yml` | `0.1.0` + `latest` | **是** |

普通 push 不构建镜像。需要构建和发布镜像时，推送正式版或预发布 tag。

### 验证构建状态

打开 `https://github.com/GoToBoy/glean/actions`，等待所有 job 显示绿色 ✓（约 5-10 分钟）。

构建成功后镜像地址为：
```
ghcr.io/gotoboy/glean-backend:0.1.0
ghcr.io/gotoboy/glean-worker:0.1.0
ghcr.io/gotoboy/glean-web:0.1.0
ghcr.io/gotoboy/glean-admin:0.1.0
```

> **注意**：GitHub Release 页面的 "Set as a pre-release" 勾选框只是 UI 标签，不影响镜像构建和拉取。镜像构建只由 **tag 名称格式** 决定：正式版 tag 走 `release.yml`，预发布 tag 走 `pre-release.yml`。

---

## Step 3: 绿联 NAS 部署

### 3.1 Docker Compose 内容

在绿联 Docker 管理器中创建新的 Compose 项目，粘贴项目根目录下的 `docker-compose.personal.yml` 文件内容。

**关键修改**：将文件中四处 `${IMAGE_TAG:-latest}` 替换为你的实际版本号：

```yaml
# 替换前
image: ghcr.io/gotoboy/glean-backend:${IMAGE_TAG:-latest}

# 替换后
image: ghcr.io/gotoboy/glean-backend:sha-1a2b3c4d5e6f
```

需要替换的四个位置：
- `backend` service 的 `image`
- `worker` service 的 `image`
- `admin` service 的 `image`
- `web` service 的 `image`

### 3.2 环境变量配置

如果绿联支持 `.env` 文件或环境变量配置，可以设置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POSTGRES_PASSWORD` | 数据库密码 | `glean` |
| `SECRET_KEY` | JWT 签名密钥 | `change-me-...` |
| `WEB_PORT` | Web 访问端口 | `80` |
| `ADMIN_PORT` | Admin 面板端口 | `3001` |
| `CREATE_ADMIN` | 自动创建管理员 | `true` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `Admin123!` |

**生产环境务必修改 `SECRET_KEY` 和 `ADMIN_PASSWORD`。**

### 3.3 启动

在绿联 Docker Compose 编辑器中保存并启动项目。首次启动会自动：
1. 拉取所有镜像
2. 创建数据库
3. 运行数据库迁移
4. 创建管理员账号
5. 使用兼容 Python 3.14 的 worker 启动包装脚本启动 `arq`

---

## Step 4: 日常更新流程

```
1. 本地改代码
       │
       ▼
2. git push origin personal-main
       │
       ▼
3. git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
       │
       ▼
4. 等 GitHub Actions 构建完成（约 5-10 分钟）
       │
       ▼
5. 绿联 NAS：停止 Compose 项目
       │
       ▼
6. 修改 yml 中镜像 tag：旧版本 → 新版本
       │
       ▼
7. 重新启动 Compose 项目（自动拉取新镜像）
```

如果你想调整 worker 的自动抓取频率，可以在 NAS 的 Compose / container yaml 里给 `worker` 增加或修改：

```yaml
environment:
  FEED_REFRESH_INTERVAL_MINUTES: 720
  WORKER_TIMEZONE: Asia/Shanghai
```

默认值是 `720`，也就是 12 小时。这个值同时影响：

- worker 定时抓取 cron
- 抓取成功后 `next_fetch_at` 的默认推进间隔

`WORKER_TIMEZONE` 会决定 worker cron 和“午夜补跑”按哪个时区计算。部署在国内 NAS 上时，建议显式设置为 `Asia/Shanghai`，不要依赖容器默认时区。

注意：

- 命名时区如 `Asia/Shanghai` 依赖 worker 镜像内可用的 IANA 时区数据
- 如果镜像里缺少系统时区库或 Python `tzdata`，worker 可能在启动时直接报 `ZoneInfoNotFoundError`
- 部署自定义 tag 时，确认 worker 镜像包含 `tzdata` 支持和时区不可用时的 `UTC` 回退逻辑

---

## Rollback: 回滚到官方版本

将 yml 中的镜像源改回官方：

```yaml
# 个人版本
image: ghcr.io/gotoboy/glean-backend:0.1.0-alpha.1

# 官方版本
image: ghcr.io/leslieleung/glean-backend:latest
```

其中 `worker` 需要对应改为：

```yaml
# 个人版本
image: ghcr.io/gotoboy/glean-worker:0.1.0-alpha.1

# 官方版本
image: ghcr.io/leslieleung/glean-worker:latest
```

四处都改回来，重启即可。数据库 volume 不受影响，数据不丢失。

---

## 附录 A：本地 Registry 直推（内网快速迭代）

GHCR 路径适合对外发版,但日常本地调试太慢(push 代码 → 等 CI → NAS 拉)。
内网有一个 HTTP registry `http://127.0.0.1:5000`,可以把 Mac 构建的镜像直接推过去,NAS 秒级拉取。

### 适用场景

- 只在局域网 NAS 上测试,不需要对外发版
- 想跳过 `git tag` + GitHub Actions 的循环
- 只改了 web/admin/backend/worker 其中一个服务,不想重新跑全量 CI

> **注意**:只推应用镜像(`backend`/`worker`/`web`/`admin`),`postgres`/`redis` 继续用上游镜像,不要推到私有 registry。

### 一次性准备

**Mac 端**(推送方) 和 **NAS 端**(拉取方) 的 Docker daemon 都要把 `127.0.0.1:5000` 列为 insecure registry(HTTP,不是 HTTPS):

- Docker Desktop: Settings → Docker Engine,在 JSON 中加入并 Apply & Restart
- Linux / 群晖 / 绿联: 编辑 `/etc/docker/daemon.json`,`systemctl restart docker`

```json
{
  "insecure-registries": ["127.0.0.1:5000"]
}
```

验证 registry 可达:

```bash
curl http://192.168。31.19:5000/v2/_catalog
# → {"repositories":[...]}
```

### 推送(Mac 端)

4 个应用镜像对应的 Dockerfile:

| 服务 | Dockerfile | 构建 context |
|------|-----------|--------------|
| backend | `backend/Dockerfile` | `./backend` |
| worker  | `backend/Dockerfile.worker` | `./backend` |
| web     | `frontend/apps/web/Dockerfile` | `./frontend` |
| admin   | `frontend/apps/admin/Dockerfile` | `./frontend` |

命名约定:`127.0.0.1:5000/glean-<service>:<tag>`,tag 同时打 `latest` 和 git short sha(或时间戳 `YYYYMMDD-HHMM`)两个标签,便于回滚。

> **⚠️ 架构匹配**:Apple Silicon Mac 默认 `docker build` 产出 `linux/arm64`,而 UGREEN / 群晖等 x86 NAS 需要 `linux/amd64`。如果直接 `docker build + push`,NAS 拉取会报:
>
> ```
> no matching manifest for linux/amd64 in the manifest list entries
> ```
>
> **必须用 `docker buildx build --platform linux/amd64 --push`**(一步推,不经本地 image store),或先 `docker buildx create --use` 建一个支持多架构的 builder。同理,x86 Mac / Linux 推到 arm NAS 也要显式指定 `linux/arm64`。
>
> 只有一个目标平台时推单架构即可;如果既有 arm NAS 又有 x86 NAS,一次推多架构:`--platform linux/amd64,linux/arm64`。

以 web 为例(其余同构,只需替换服务名和 Dockerfile 路径):

```bash
SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M)
REGISTRY=127.0.0.1:5000
PLATFORM=linux/amd64            # NAS 是 x86 → amd64;arm NAS 改 linux/arm64

docker buildx build --platform $PLATFORM --push \
  -f frontend/apps/web/Dockerfile \
  -t $REGISTRY/glean-web:latest \
  -t $REGISTRY/glean-web:$SHA \
  frontend
```

backend / worker / admin 批量推(4 个并行,省时间):

```bash
# 可放进一个 push.sh
SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M)
REGISTRY=127.0.0.1:5000
PLATFORM=linux/amd64

docker buildx build --platform $PLATFORM --push -f backend/Dockerfile \
  -t $REGISTRY/glean-backend:latest -t $REGISTRY/glean-backend:$SHA backend &

docker buildx build --platform $PLATFORM --push -f backend/Dockerfile.worker \
  -t $REGISTRY/glean-worker:latest -t $REGISTRY/glean-worker:$SHA backend &

docker buildx build --platform $PLATFORM --push -f frontend/apps/web/Dockerfile \
  -t $REGISTRY/glean-web:latest -t $REGISTRY/glean-web:$SHA frontend &

docker buildx build --platform $PLATFORM --push -f frontend/apps/admin/Dockerfile \
  -t $REGISTRY/glean-admin:latest -t $REGISTRY/glean-admin:$SHA frontend &

wait
```

**验证推上去的是正确架构**:

```bash
docker buildx imagetools inspect 127.0.0.1:5000/glean-web:latest
# Manifests 下应看到 Platform: linux/amd64
```

若看到 `linux/arm64` 或混杂,说明没带 `--platform`。

### 拉取(NAS 端)

修改 NAS 上的 `docker-compose.personal.yml`(或你实际使用的 compose 文件),把 4 个应用服务的 `image:` 字段从 GHCR 换成内网 registry。只需要动 `backend`/`worker`/`web`/`admin` 四处,**不要动 `postgres`/`redis`**。

> **⚠️ Hairpin 坑**:registry 部署在 NAS 本机时,NAS 的 docker daemon 通过 LAN IP(`127.0.0.1:5000`)回连自己经常超时 — UGREEN / 群晖等的默认 bridge 不做 hairpin NAT,包发到 LAN 绕一圈回不来,表现为:
>
> ```
> Get "http://127.0.0.1:5000/v2/": request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
> ```
>
> 解决:**NAS 端 compose 用 `127.0.0.1:5000/glean-*`**(registry 就在本机,走 loopback 即通)。Mac 推送仍用 `127.0.0.1:5000`,数据是同一份,两种地址读到同一个 manifest。
>
> `127.0.0.0/8` 默认就被 docker 视为 insecure registry,`daemon.json` 不用额外声明 `127.0.0.1:5000`。

Before → After 对照(NAS 端使用 loopback):

```yaml
# backend
- image: ghcr.io/gotoboy/glean-backend:${IMAGE_TAG:-latest}
+ image: 127.0.0.1:5000/glean-backend:${IMAGE_TAG:-latest}

# worker
- image: ghcr.io/gotoboy/glean-worker:${IMAGE_TAG:-latest}
+ image: 127.0.0.1:5000/glean-worker:${IMAGE_TAG:-latest}

# web
- image: ghcr.io/gotoboy/glean-web:${IMAGE_TAG:-latest}
+ image: 127.0.0.1:5000/glean-web:${IMAGE_TAG:-latest}

# admin
- image: ghcr.io/gotoboy/glean-admin:${IMAGE_TAG:-latest}
+ image: 127.0.0.1:5000/glean-admin:${IMAGE_TAG:-latest}
```

> 如果 registry 跑在另一台机器(不是同台 NAS),则 NAS 端 compose 用那台机器的 LAN IP,并在 NAS 的 `daemon.json` 里加 `"insecure-registries": ["<registry-host>:5000"]`。

拉取并重建容器(只重建变化的服务,避免打扰数据库):

```bash
# 例:只更新 web
docker compose -f docker-compose.personal.yml pull web
docker compose -f docker-compose.personal.yml up -d --no-deps --force-recreate web

# 例:后端 + worker 一起更新
docker compose -f docker-compose.personal.yml pull backend worker
docker compose -f docker-compose.personal.yml up -d --no-deps --force-recreate backend worker
```

> `--force-recreate` 是必须的:`docker restart` 只会重启旧容器,不会切到新镜像。验证方法:
> `docker inspect glean-web --format '{{.Image}}'` 应等于 `docker image inspect 127.0.0.1:5000/glean-web:latest --format '{{.Id}}'`

### 回滚

tag 同时打了 git sha,直接 pin 到旧版本即可:

```bash
# NAS 上
IMAGE_TAG=<old-sha> docker compose -f docker-compose.personal.yml up -d --no-deps --force-recreate web
```

或在 `.env` 中写死 `IMAGE_TAG=<old-sha>`。

### 与 GHCR 路径的关系

两条路径可以共存,互为备份:

| 场景 | 用什么 |
|------|--------|
| 局域网日常迭代、快速 A/B | 本地 Registry |
| 对外发版、跨网络、长期归档 | GHCR + git tag |
| 内网 registry 挂了 | 临时切回 GHCR 镜像名即可 |

---

## FAQ

### Q: 构建失败怎么办？

检查 GitHub Actions 日志：`https://github.com/GoToBoy/glean/actions`，点击失败的 run 查看具体错误。

### Q: NAS 拉取镜像报 "unauthorized"？

Package 还是 private。去 `https://github.com/GoToBoy?tab=packages` 把每个 package 设为 Public。

### Q: 数据库迁移失败？

Backend 容器启动时自动运行迁移（`RUN_MIGRATIONS=true`）。如果有冲突，检查 backend 容器日志。

### Q: PR 会包含这个 personal yml 文件吗？

不会。`docker-compose.personal.yml` 已添加到 `.gitignore`，不会出现在 git 记录中。

### Q: 如何同步上游作者的最新代码？

```bash
git remote add upstream https://github.com/leslieleung/glean.git  # 仅首次
git fetch upstream
git rebase upstream/main
git push origin personal-main --force-with-lease
# 普通 push 不触发镜像构建；需要构建时再推送 tag
```

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `docker-compose.personal.yml` | 项目根目录 | 完整的个人部署 Compose 文件（已 gitignore） |
| `docker-compose.yml` | 项目根目录 | 官方部署文件（不要修改） |
| `.github/workflows/pre-release.yml` | CI | alpha/beta/rc tag 触发的构建流程 |
| `.github/workflows/release.yml` | CI | 正式版 `v*` tag 触发镜像构建并创建 GitHub Release |
