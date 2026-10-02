# 验证记录 — 2026-10-01

## 2026-10-02：免费本地课程助手

- 默认前端 TypeScript / Vite 构建通过。
- 助手编排单元测试 23 项通过：真实返回值、明确学期/追问、部分失败、陈旧观察、有限关注查询、阈值/暂停状态、范围限制、注入文本和通知说明。
- 助手浏览器测试 8 项通过，覆盖中英查课/比较、来源与时间、明确 Track 操作、未发布学期、查询失败、空结果、对话上限和清空期间的迟到响应；包括桌面与手机尺寸。
- 既有默认 UI 4 项及免费版 8 项回归通过。
- 另一次只读复核的 8 条断言确认：相对学期需澄清、考试/作业不误查席位、追问保持学期、按用户提醒阈值判断、最多查询 3 个关注组并列出未检查组。
- 本地模型：198 条合成训练句；冻结后独立 56 条合成问题评估 50 条分类正确。详见 `assistant-model/README.md`，此结果不代表真实用户准确率或整个助手正确率。
- 模型 Python / TypeScript 对 318 个输入的结果一致，可确定性重训；不调用外部推理 API，无 WebGPU 或大模型下载要求。
- Linux 截图环境没有 CJK 字体，中文 DOM 文本和交互断言正确；不把它说成真机中文字体或 Safari 验证。
- 新助手发布提交 `61ce6bef33fa21154194eb69f72eb7f2a42877fe` 的 [完整 GitHub CI](https://github.com/wangcb424/portfolio/actions/runs/36957961104) 全部成功，包括既有 Java / PostgreSQL、全栈浏览器、Pages/PWA、免费版与代理检查，以及新增的 23 项助手单元测试和 8 项助手浏览器测试。
- [GitHub Pages 部署](https://github.com/wangcb424/portfolio/actions/runs/36957960952) 成功，普通 curl HTTPS 验证返回 HTTP 200；生产资源为 `index-D2mw_z3Y.js`。
- 2026-10-02 03:01 UTC 的生产匿名浏览器验收通过：两个全新 Chromium context 初始 Cookie 均为 0，无登录要求；助手查询返回 Fall 2026（202710）CS3100 的 3 个班，显式 Track 保存关注，另一访客关注列表独立；9 次 API 响应均为 HTTP 200，无脚本错误或桌面/手机尺寸横向溢出。余位 2、6、1 仅为当时快照。
- 当前接口返回的 30 个学期中没有 Spring 2027。助手明确说明可能尚未发布或列表不完整，未改查其他学期；该问题的课程查询次数为 0，未显示席位数字。Spring 2099 的未公布学期检查同样通过。
- 生产证据见 [assistant-production-2026-10-02.json](assistant-production-2026-10-02.json)，可用 `node frontend/verify-live-assistant.mjs` 复查。浏览器测试仅为 Chromium 桌面/手机尺寸模拟，并对执行环境代理证书作测试 context 例外；产品证书处理未改变。

以下为首次上线时的原有完整验证记录。

免费公开版与 Java 完整版分开验收。免费版使用真实学校公开查询接口；Java 本地演示使用明确标记的合成数据。

## 已经执行

| 检查 | 结果与边界 |
|---|---|
| TypeScript / 生产构建 | 默认 Java UI 和免费 GitHub Pages 子路径构建均通过 |
| 免费版浏览器测试 | 8 项通过：匿名查询、关注、独立访客隔离、导出导入重新取数、存储禁用提示、隐藏页面停止查询与恢复查询；包含桌面和手机尺寸 |
| Java 模式前端模拟测试 | 4 项通过；受控 HTTP 测试数据 |
| Pages / PWA | 4 项通过；子路径资产、manifest、品牌链接、停止本地服务器后的离线回退 |
| 公开代理单元测试 | 21 项通过：匿名 Cookie 隔离、固定上游地址/重定向、CORS、缓存、队列、限速、超时、响应解析和失败处理 |
| Java Maven verify | 19 项通过，0 失败、0 错误、0 跳过；已生成可执行 Spring Boot jar |
| GitHub PostgreSQL 集成 | GitHub Actions run 36821226910 的 Maven verify 已成功，在 PostgreSQL 17 service 上执行集成测试和迁移 |
| 完整 GitHub CI | [run 36821226910](https://github.com/wangcb424/portfolio/actions/runs/36821226910) 全部成功：19 Java、6 全栈浏览器、4 UI、4 Pages/PWA、8 免费版、21 代理测试；提供可运行 jar artifact |
| Java 集成范围 | Spring Security、CSRF/session、验证码过期/重放、跨用户隔离、关注阈值、数据失败保留、通知重试、Flyway 迁移；本地 H2 PostgreSQL 模式 |
| Java 实际进程 HTTP 验证 | 健康检查、登录、关注、模拟开位、提醒/历史、重复开位去重、删除和退出通过 |
| Java 完整浏览器 E2E | 6 项通过：桌面/手机搜索、登录、关注、提醒、历史、第二设备账号同步及离线页面；运行真实 Spring Boot jar |
| 云端匿名真实查询 | 2026-10-01 05:07 UTC：公开 API 返回 HTTP 200，学期列表及 202710 / CS3100 的三个 section；未使用学校账号 |
| GitHub Pages CORS | 公开代理对 Origin `https://wangcb424.github.io` 返回相应允许头，无需凭据 |
| 生产网页匿名浏览器验收 | 两个全新 Chromium context 均从 0 Cookie 开始；真实搜索 3 个 section、关注与刷新保留、独立访客关注隔离、手机尺寸独立关注通过；API 均 200，无脚本错误或横向溢出 |

云端观测时 CS3100 的 CRN 17206、17207、17208 分别剩余 2、6、1 个席位。这仅是该时间的快照，不是保证仍然有效的数字。

部署接口：`https://courseflow-public-query.hkz4sxp6x5.chatgpt.site`。网页入口：`https://wangcb424.github.io/portfolio/courseflow/`。GitHub Pages 部署 run 36821225414 已成功，匿名 HTTPS 请求返回正式网页 HTTP 200。

## 修复过的问题

- Spring 代理对象外部直接读取 repository 字段造成空指针，改成方法访问并通过实际集成测试。
- 数据库 URL 含加号的密码解码错误，新增覆盖并修复。
- GitHub Pages 子目录下资源、manifest、service worker 和扩展快捷入口路径错误。
- 浏览器存储被禁用时提示随页面切换消失，改为持续可见的本机保存警告。
- 关注查询失败后 Explore 仍显示旧的绿色席位状态，改为与最新关注观察保持一致。
- 手机历史弹窗关闭按钮超出屏幕，使用受约束宽度的原生 dialog。

## 测试边界

- 浏览器自动化使用 Chromium 的桌面和 iPhone 13 尺寸/触摸模拟，不等于真机 Safari、Firefox、系统通知或所有设备测试。
- 生产浏览器验收通过执行环境的 HTTPS 代理，测试 context 忽略了该代理不在 Chromium 信任库中的证书；产品未修改证书验证，普通 curl HTTPS 验证也成功。
- 免费版页面关闭、隐藏、锁屏或浏览器暂停时不持续检查，不提供云端账号同步或邮件。
- PostgreSQL 17 已在 GitHub CI 验证；这不等于 Java 完整版已部署到持久云数据库。
- Java 模式真实 Banner 在该开发环境返回 503，未验收；成功的真实学校查询来自部署后的免费代理。
- Redis、真实 SMTP、真实 Web Push、Docker 镜像和付费全栈云端部署未验收。
- 扩展源码已提供，未上架商店；普通使用无需扩展。
- 学校公开接口不承诺服务等级，当前限制和缓存不能证明无限容量。没有用错误响应伪造零席位。
