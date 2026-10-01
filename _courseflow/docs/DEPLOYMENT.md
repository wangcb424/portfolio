# 一次部署，所有设备使用

部署前需要你拥有/授权一个云账号，以及一个能够从已验证地址发信的 SMTP 服务。不要把账号密码或 SMTP 密钥发到公开仓库或聊天中；填入托管平台的环境变量。

## 推荐的简化结构

一个 Java Web 服务同时提供页面和 API，配一个 PostgreSQL 数据库。先不启用 Redis 也能完成监控。需要练习缓存时再增加 Redis。常驻监控要求后台能持续运行，不能依赖会休眠的免费 Web 实例做可靠提醒。

## 可选 Render 路线

1. 把本项目放进你自己的 GitHub 仓库。根目录保留 `Dockerfile` 和 `render.yaml`。
2. 在 Render 选择 New → Blueprint，连接这个仓库。
3. 查看待创建的 Web 服务和 PostgreSQL 的当前价格，再决定是否提交部署。配置使用付费、单实例资源；本包没有替你下单或创建账号。
4. 按提示填写 `SMTP_HOST`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`MAIL_FROM`。默认 587 + STARTTLS；如果提供商参数不同需相应配置。
5. 模板通过 `DATABASE_URL` 自动连接托管数据库。程序将它解析为 JDBC URL，密码不会写入源码。Render 的 `RENDER_EXTERNAL_URL` 自动提供公开网址；使用自定义域名时设置 `PUBLIC_URL`。
6. 构建完成后访问 `/actuator/health`，再打开首页，确认没有 DEMO 标签。
7. 用自己的邮箱实际收验证码，搜索一个课程，关注一个 section，然后用另一个设备登录相同邮箱验证同步。

模板依据 2026-09-28 核对的文档配置：Web `0.5c-512mb`、Postgres `0.1c-256mb`、1 GB 存储。价格和可用套餐仍以实际创建页面为准。不要把默认数据库名与自己已存在的同名资源混用。该模板尚未在你的云账号执行。

官方文档：https://render.com/docs/blueprint-spec ，https://render.com/docs/docker ，https://render.com/pricing 。

## 其他平台 / 自有服务器

根 Dockerfile 可部署到支持 Docker 和持久 PostgreSQL 的平台。配置：

| 变量 | 用途 |
|---|---|
| SPRING_PROFILES_ACTIVE=production | 开启真实数据模式，关闭演示登录 |
| PUBLIC_URL=https://你的域名 | 邮件中的入口，必须 HTTPS |
| DATABASE_URL 或 DB_URL/DB_USER/DB_PASSWORD | 托管 PostgreSQL URL，或 JDBC URL + 凭据 |
| SMTP_HOST/PORT/USERNAME/PASSWORD | 发信服务器 |
| SMTP_AUTH/SMTP_TLS | 默认 true；生产服务推荐保持 TLS |
| MAIL_FROM | 你的提供商已验证发件地址 |
| POLL_INTERVAL_MS | 默认 300000，即 5 分钟；还受单轮处理耗时影响 |
| REDIS_ENABLED/REDIS_URL | 可选缓存；默认关闭 |
| VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT | 可选浏览器推送 |

自有 Docker 主机可复制 `.env.example` 为 `.env`，设置变量后使用 `docker compose -f compose.production.yml up --build -d`。此配置只在本机 8080 暴露应用，需接你自己的 HTTPS 反向代理。Postgres 和 Redis 不对公网暴露。

**不要把应用副本数设成 2 或更多。** v0.2 的定时任务没有分布式租约，session 也在单实例内存中。服务重启后重新登录，数据库中的关注仍在。

## 浏览器推送

在开发电脑运行 `node scripts/generate-vapid.mjs`。只把生成的公钥、私钥和联系邮箱填入服务器环境变量。保持密钥稳定，轮换会让旧的浏览器订阅失效。

上线后，在 Alerts 中点 Enable device push 并授权。iPhone 要先把网页添加到主屏幕，并从该图标打开。若设备不支持推送，邮件仍独立工作。推送代码可以在本地编译和验证地址校验，但真实送达要在你的 HTTPS 域名和设备上验证。

## 上线后需要完成的实际检查

- 真实 Banner 查询与当前学校页面的 CRN、学期、席位一致；遵守适用访问要求。
- 正式登录不在响应中暴露 demoCode；学校账号密码从未被请求。
- SMTP 的验证码、提醒能送达自己的邮箱；查看垃圾邮件和发件域名配置。
- 设备 A 创建关注，设备 B 登录同一邮箱后能看到；用户 B 看不到用户 A 的私人关注。
- 后台进程持续运行，服务不因无人访问而休眠；日志中没有验证码、cookie、数据库密码。
- 备份 Postgres 并验证一次恢复；不要把 Redis 当作唯一数据存储。

邮件/推送的生产送达、云端持续运行、真实设备兼容性，不会因为源代码测试通过而自动得到验证。
