# statechart-kit preview 容器

只读预览最新状态图：打开 kit 编辑器，加载 `data/` 下最新的 `.scxml` 或 `.json`，
可运行仿真、校验、打开 Explorer。**不保存、不修改文件**。

## 数据

挂载目录（默认 `/opt/statechart-preview/data`）放：

- `latest.scxml`：优先读取；或
- `latest.json`：ProjectDoc（`formatVersion: 1`）；或
- 目录内最新的任意 `.scxml` / `.json`。

容器自带一个 `latest.scxml` 示例，未挂载数据目录时也能打开。

数据目录只读挂载：

```yaml
volumes:
  - /opt/statechart-preview/data:/data:ro
```

## 构建与运行

在仓库根目录：

```bash
docker build -f preview/Dockerfile -t statechart-preview .
docker run -d --name statechart-preview --restart unless-stopped \
  -p 5182:5182 \
  -v /opt/statechart-preview/data:/data:ro \
  statechart-preview
```

或者用 compose：

```bash
docker compose -f preview/compose.yaml up -d --build
```

打开 `http://<主机局域网 IP>:5182/`。

国内网络构建慢时可指定镜像：

```bash
docker build -f preview/Dockerfile \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine \
  -t statechart-preview .
```

## 刷新

页面顶部「刷新最新」重新读取 `/api/latest`，不会重启容器。
更新 `latest.scxml` 后点刷新即可看到新图。

## 说明

- 预览使用 `engine: 'trusted'`，只做浏览器内仿真，不连接任何外部运行时。
- 容器只读、无认证；只绑内网/防火墙，不要暴露公网。
- 这不是 HA add-on；HA OS 上需通过 Portainer/SSH 或自建 add-on 运行。
