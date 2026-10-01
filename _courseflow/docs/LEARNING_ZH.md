# 按阶段理解 CourseFlow

## 阶段 1：一个页面怎么得到课程数据

打开 `frontend/src/App.tsx`，找 `search`。它把学期和课程代码交给 `api.ts`。后者发出 `GET /api/catalog/sections?term=202710&q=CS3100`。

后端入口是 `tracker/TrackerController.java`。Controller 负责接收请求和返回 JSON，不直接解析学校页面。它调用 `CatalogService.search`，规范化课程代码，先找缓存，再找数据源。

`SeatFeed` 是 interface，规定数据源必须提供 `terms()` 和 `search()`。`DemoFeed` 返回模拟数据；`BannerFeed` 处理真实公开查询。服务依赖接口，因此不需要在每个业务函数里写“如果演示就这样，否则就那样”。这是你学过的多态和依赖倒置的实际例子。

Banner 的顺序是：创建匿名 cookie 会话 → 选择学期 → 进入查询页面 → 获取课程结果。已观察到 `maximumEnrollment` 和 `seatsAvailable` 字段。没有调用学校注册课程接口。

你应该能解释：Controller、Service 和数据源 adapter 各负责什么？为什么前端不直接请求 Banner？为什么查询失败不能变成 0 个空位？

## 阶段 2：账号、身份和关注列表

`AuthController` 接收邮箱和验证码，`AuthService` 保存经过 BCrypt 哈希的验证码，设置 10 分钟有效期和最多 5 次验证尝试。数据库不保存明文验证码。每个邮箱 15 分钟内最多申请 3 次。

验证成功后创建服务器 session，浏览器保存 HttpOnly cookie。登录会改变 session ID，防止 session fixation。`SecurityConfig` 保留 CSRF 防护，`api.ts` 在修改请求前取得 CSRF token。HttpOnly cookie 和 CSRF token 解决的是不同问题。

`cf_users` 保存用户；`cf_watches` 保存 user_id、section_id、threshold、enabled、matched。数据库 UNIQUE(user_id, section_id) 防止同一个人重复关注同一 section。每个读写个人记录的 SQL 都带 user_id，不能凭别人记录的 id 修改记录。

跨设备不是复制浏览器 localStorage。第二个设备使用相同邮箱登录后，服务端找到同一用户 ID，从数据库返回同一关注列表。

你应该能解释：authentication 和 authorization 的区别；cookie 和 token 的区别；为什么只靠前端隐藏按钮不能保护别人的记录？

## 阶段 3：判断什么时候提醒

打开 `TrackerService.observe`。它接收一个已经成功取得的 Seat，保存最新快照。如果容量或剩余席位发生变化，再写一条 `cf_samples` 历史记录。

对每个关注者计算 `available >= threshold`。假设 threshold=2：

| 上次 matched | 新 available | 新 matched | 是否提醒 |
|---|---:|---|---|
| false | 1 | false | 否 |
| false | 2 | true | 是 |
| true | 3 | true | 否 |
| true | 0 | false | 否，但允许下一次再次提醒 |

这就是一个只有两种状态的小状态机。失败请求不会写入 available=0，也不会把 matched 清零。否则，服务短暂断网再恢复就可能产生错误的“重新放出空位”提醒。

`@Transactional` 把席位记录、matched 更新、通知事件放在同一数据库事务里。`SELECT ... FOR UPDATE` 锁住相关记录，处理部分并发更新。当前部署仍明确限制为一个应用实例，不宣称已完成多副本分布式调度。

你应该能解释：为什么定时器每 5 分钟运行不代表每 5 分钟都要发邮件？为什么 SQL unique constraint 和 Java 层检查都要有？

## 阶段 4：后台任务与可靠通知

`MonitorJobs.poll` 查询所有启用的关注，按“学期 + 课程代码”分组。两个用户分别关注 CS3100 的不同 section，只需要取一次 CS3100 的结果。这比每个用户各自查询学校更节省请求。

`cf_notifications` 是 transactional outbox。业务事务先写“需要通知”的记录；另一个任务取 PENDING 记录并发送。发信失败会设置下次重试时间，最多尝试 5 次。站内提醒不因邮件失败而消失。

不要把它称为 exactly-once delivery：如果邮件已发出，但进程在写 SENT 前崩溃，恢复后可能重复发送。当前是 at-least-once，并用状态变化减少正常场景下的重复。推送使用相同事件 ID 作为通知 tag，支持的设备可合并同一事件的重试。

`PushGateway` 使用现有 Web Push 库加密和签名；私钥只在服务器。`PushController` 限制推送 endpoint 的 HTTPS 域名，避免用户把内网地址提交给服务器请求（SSRF）。

你应该能解释：为什么不在数据库事务中直接等待 SMTP 完成？为什么 retry 需要 backoff？邮件和浏览器通知为什么需要独立状态？

## 阶段 5：缓存与 PWA

`CatalogService` 使用 60 秒、最多 256 项的本地缓存，合并相同查询。`RedisSnapshots` 可以把短期快照放到 Redis；Redis 不可用时退回本地缓存。PostgreSQL 保存的是持久数据，Redis 保存的是可重新取得的临时数据。

`frontend/public/manifest.webmanifest` 描述安装图标与启动方式。`sw.js` 负责离线提示和通知。它明确不缓存 `/api`：离线时不能把旧席位伪装成实时信息。

前端采用同一套响应式页面，减少不同系统的重复开发。真正持续监控的是服务器；PWA 的 service worker 并不是永远运行的后台线程。

你应该能解释：为什么装上 PWA 不等于可以可靠地在手机后台每 5 分钟查询？为什么不把包含私人关注列表的 API 放进 service-worker 缓存？

## 阶段 6：构建、部署和测试

根目录 `Dockerfile` 先编译 React，再把静态页面放进 Spring Boot jar。最后运行一个不含编译工具的 JRE 镜像。用户只面对一个域名。

Flyway 依次执行 V1、V2、V3。V1 没有修改，保护原有安装的校验值；新增功能放在后续 migration。不要通过删除用户数据库来解决迁移校验错误。

`TrackerIntegrationTest` 通过真实数据库事务检查登录、越权、阈值、源失败、去重、批量查询和邮件重试。`BannerFeedTest` 验证上游字段解析及危险推送地址。Playwright 测试浏览器里的完整流程和第二设备同步。

本地 H2 测试不是 PostgreSQL 生产环境测试的替代品。CI 另外用 PostgreSQL 17 跑相同集成测试。实际执行结果和限制应以 `VERIFICATION.md` 为准。

## 保留的算法部分

`schedule/` 和原来的 `course/`、`section/` 属于第一阶段排课实验。ScheduleService 用回溯选 section，用半开区间判断时间冲突，并对偏好打分。当前限制最多 6 门课、100,000 个候选组合，避免无界搜索。

它仍使用独立的演示课程，不会把真实席位结果伪装成已完成的真实课表规划。理解区间冲突条件 `aStart < bEnd && bStart < aEnd`，并说明为什么一门课结束时另一门课开始不算冲突。
