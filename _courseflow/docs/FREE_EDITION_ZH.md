# CourseFlow 免费公开版

免费公开版的目标是：任何人打开 GitHub Pages，即可查询 Northeastern 的公开课程席位、在当前设备保存关注，并在页面运行期间发现席位变化。无需 GitHub、ChatGPT 或学校账号。

## 你会用到的功能

- 中英文课程助手：通过本地意图模型识别问题，查询真实席位或解释功能；无需模型 API key，详见 [助手说明](AI_ASSISTANT_ZH.md)。
- 选择学期，输入课程代码，按 section / CRN 查看真实公开数据。
- 在当前浏览器保存最多 20 个关注，设置席位提醒阈值，暂停、恢复和删除。
- 网页保持打开时约每 5 分钟检查一次；网络、浏览器后台节流和学校响应会影响实际时间。
- 检查时出现席位变化，保存本机历史记录并生成站内提醒；浏览器支持且你授权时可显示系统通知。
- 导出关注列表，在另一台设备导入。导入的是关注配置，席位会重新查询，不把文件中的旧数字当成实时数据。

这里的“所有人可以使用”指公开匿名访问，不意味着无限并发、兼容所有古老浏览器或保证每条提醒送达。建议使用较新的 Chrome、Edge、Firefox 或 Safari；实际已测试环境见 `VERIFICATION.md`。

## 必须知道的区别

| 项目 | 免费公开版 | Java 完整版 |
|---|---|---|
| 查询数据 | 公开查询代理获取真实席位 | Spring Boot 获取真实席位 |
| 账号 | 无需账号 | 邮箱验证码 |
| 关注保存 | 各自浏览器 localStorage | PostgreSQL |
| 跨设备 | 导出 / 导入 | 同一邮箱同步 |
| 关闭网页后 | 不继续为该用户检查或提醒 | 常驻后台继续检查 |
| 通知 | 站内；支持时可用浏览器通知 | 站内、邮件、可选 Web Push |
| 数据库和邮件服务 | 不需要 | 需要自行配置 |

手机锁屏、浏览器关闭、系统休眠或后台标签页被冻结时，免费版无法保证继续检查。浏览器通知权限不等于后台推送服务。重新打开页面后会重新检查关注，不会补造关闭期间未观察到的历史。

清除浏览器数据会清除该设备的关注和提醒。私人/无痕模式可能不持久保存。多人共用同一个浏览器用户配置时会共用这份本机数据；需要隔离时应使用各自的浏览器配置。

## 数据与隐私

查询接口只接收学期和课程代码，不接收学校密码、注册凭据或用户邮箱。浏览器为检查关注，会把对应的公开学期/课程参数发给代理；接口会暂时缓存这些公开课程数据。关注列表、提醒阈值、历史和站内提醒保留在设备上。

学校的公开席位是快照，不代表你符合先修课、专业保留席位、联动 section 或其他选课条件。注册仍在学校系统完成。接口出错或数据过期会明确显示未知/需要更新，不会把失败转换成“0 个空位”。

## 技术与简历

上线的免费版使用 React、TypeScript、REST API、跨域访问控制、输入校验、查询缓存、限速、PWA、浏览器持久化和自动化测试。

Java / Spring Boot / PostgreSQL / Flyway / Redis / Docker 的完整版本保留在源码中，并单独验证。面试时请明确区分“免费公开版当前在运行的技术”和“完整版本已实现并测试的技术”，不要声称免费网页背后已经部署了 Java 或 PostgreSQL。

免费版无需配置付费 Render 服务。公开访问与接口都有实际运行容量，未来托管政策变化、流量增长或学校接口变更时需要维护；不承诺永久无限量。

## 按阶段理解代码

| 阶段 | 主要文件 | 你应该理解的事情 |
|---|---|---|
| 1：显示页面 | `frontend/src/App.tsx`、样式文件 | React 如何把课程数据变成卡片；不同屏幕如何布局 |
| 2：真实查询 | `frontend/src/freeApi.ts`、`public-query-proxy/worker.mjs` | 浏览器为什么通过代理读取学校接口；匿名 session 与学校账号的区别 |
| 3：保存关注 | `frontend/src/freeStore.ts` | term + CRN 为什么共同标识一个 section；localStorage 为什么只能保存本机数据 |
| 4：检查与提醒 | `checkLocalWatches()`、`observe()` | 按课程去重查询；阈值由不满足变成满足才提醒；失败为什么不能当成 0 |
| 5：部署 | `frontend/vite.config.ts`、`public/sw.js`、GitHub Pages | 网站路径、跨域 CORS、PWA 缓存与真实数据刷新分别解决什么问题 |
| 6：自动化验证 | `frontend/tests-free/`、`frontend/tests/`、代理测试、Java 测试 | 模拟数据用于验证逻辑；真实公开查询另行验收；桌面模拟不等于所有手机真机 |

一次搜索的路径是：页面输入课程 → `freeApi` 校验参数 → HTTPS 查询代理 → 代理建立匿名 Banner 会话并选择学期 → 获取 section JSON → 页面显示及更新已关注 section。本机关注不会上传成为某个共享账号。

## 重建免费网页

源代码只需要开发者构建。公开查询 API 当前地址为 `https://courseflow-public-query.hkz4sxp6x5.chatgpt.site`。

在 `frontend/` 安装锁文件依赖后，用以下环境变量执行 `npm run build`：

```sh
VITE_FREE_MODE=true \
VITE_PUBLIC_API_URL=https://courseflow-public-query.hkz4sxp6x5.chatgpt.site \
VITE_BASE_PATH=/portfolio/courseflow/ npm run build
```

将 `dist/` 内容放到 portfolio 仓库的 `courseflow/`；完整源码放在 `_courseflow/`。GitHub Pages 使用 main 分支根目录发布。改变域名时也要更新代理的 CORS 白名单。默认不设置这些变量的构建仍然连接同源 Java `/api`。
