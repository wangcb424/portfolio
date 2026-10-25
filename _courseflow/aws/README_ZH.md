# CourseFlow：可选 AWS 云备份

## 当前状态与费用边界

当前公开网站继续使用 GitHub Pages、本机存储和现有免费查询代理。**AWS 模块已实现并通过本地测试与模板检查，但没有部署到 AWS，公开构建没有配置 AWS endpoint。** 普通访客无需安装任何东西或注册账号，新增功能不会触发 AWS 请求。

这不是“永久无限免费 AWS”。按 2026-10-25 查阅的官方说明，新账户 Free Plan 最长 6 个月，或免费额度先用完时结束；保持 Free Plan 时不会收取超额费用，升级 Paid Plan 后则可能产生费用。服务是否可用须以具体账户为准。部署者应先确认账户方案、剩余额度及其他项目已使用的配额；本说明不会替你创建账户或开启付费方案。

- Lambda 当前免费配额为每月 100 万次请求与 400,000 GB-seconds 计算量。
- DynamoDB Standard 的免费配额包含 25 GB，以及 provisioned 模式的 25 RCU / 25 WCU。本模板只申请 1 RCU / 1 WCU，不开按需计费、自动扩容、全局表或时间点恢复。
- IAM/SAM 配置不是“费用上限”。低并发、低吞吐和短日志保留只能约束资源使用；公开端点仍可能收到大量请求。日志、部署制品、流量及账户其他资源也要检查。Budget 提醒不是自动硬性停机开关。
- 若你要求保证完全不付费，请保持目前公开版本、不启用 AWS；现有保存/恢复功能完整可用。想实际体验 AWS 时，先在仍有效的 Free Plan 内确认该账户允许创建这些服务，并在到期前删除资源，不要为继续运行自动升级。

官方依据：[Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/)、[账户免费计划](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)、[Lambda 定价](https://aws.amazon.com/lambda/pricing/)、[DynamoDB 定价](https://aws.amazon.com/dynamodb/pricing/)。定价和资格可能变化，部署时重新确认。

## 分阶段理解实现

| 部分 | 文件 | 作用 |
|---|---|---|
| 本机持久化 | `../frontend/src/freeStore.ts` | 无需后端保存关注、最近 20 条查询和上次页面；升级兼容旧数据 |
| 用户操作 | `../frontend/src/CloudBackup.tsx` | 只有配置 endpoint 才显示按钮，点击后才备份/恢复/删除 |
| HTTPS 客户端 | `../frontend/src/awsBackup.ts` | 生成 256-bit 随机设备密钥，通过 Authorization header 发送；超时与错误保持本机数据 |
| Lambda API | `cloud/app.py` | 验证输入、按设备隔离、处理 GET/PUT/DELETE `/backup` |
| DynamoDB | `template.yaml` 中 BackupTable | 单表以设备密钥 SHA-256 为分区键；保存配置、版本和 90 天到期时间 |
| IAM + 基础设施 | `template.yaml` | SAM/CloudFormation 描述资源；执行角色只允许该表三种操作及本函数日志写入 |
| 验证 | `test_backup.py`、`../frontend/tests-backup/` | API 边界和浏览器交互测试，不冒充真实 AWS 验收 |

备份仅含课程/学期/CRN、阈值、启停配置及近期查询参数。不会保存学校账号、完整聊天或可信的实时余位。恢复时重新调用课程接口，未能核实的关注不会被伪造为实时数据。

浏览器持有随机密钥，服务端只以其哈希定位备份；不知道密钥的另一访客无法选择或枚举别人的记录。这个密钥相当于访问凭证，不能公开。它不是 AWS access key，不进入查询 URL、课程代理、日志或导出文件。CORS 白名单不是身份验证；实际隔离由设备密钥提供。

`If-Match` 版本号配合 DynamoDB 条件写入避免同时覆盖；版本冲突返回 409，用户重试前可先恢复确认。备份在最后保存 90 天后失效，应用立即拒绝读取；DynamoDB TTL 实际物理删除可能再延迟数天。没有定时云同步或关页后席位监控。

**清空浏览器站点数据会丢失云备份密钥。** 此模块用于同一浏览器内的显式配置备份，不是可登录的跨设备账号系统。跨设备使用 Export / Import；它们可携带关注和搜索历史，但不会携带云密钥。搜索记录、席位变化历史、聊天记录是不同概念；这里只备份前者，不备份后两者。

## 本地验证（不创建云资源）

在仓库 `_courseflow/aws/` 下：

```sh
python -m unittest discover -s . -p 'test_*.py' -v
# 安装 AWS SAM CLI 后可执行模板检查：
sam validate --lint
```

前端开发依赖安装完成后，在 `_courseflow/frontend/`：

```sh
npm run test:free
npm run test:backup
```

后端测试用 FakeTable 验证数据库边界；浏览器测试拦截 HTTP。已执行 `cfn-lint` 检查 SAM 模板。尚未实际执行 `sam deploy`，真实 AWS 权限、配额和存储读写仍需部署后验证。

## 可选部署（会创建 AWS 资源）

只有网站维护者需要这些工具，访客不需要：Python 3.12、[AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)、[AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)。在你自己的 AWS 环境完成身份验证，不要把密钥写进 GitHub 或发送到聊天。

确认账户计划与免费资格后，在 `_courseflow/aws/` 执行：

```sh
sam build
sam deploy --guided --stack-name courseflow-backup --region us-east-1
```

审阅变更集后部署；模板需要创建 IAM role。`AllowedOrigin` 默认 `https://wangcb424.github.io`，是 origin 而不是带路径的 URL。SAM 会把部署代码上传到制品存储桶；这同样属于要检查和清理的资源。Lambda 保留并发为 2，某些账户的区域额度可能不允许预留；如果 AWS 拒绝，不要盲目重试或升级付费方案，先检查服务配额及是否适合继续部署。

部署输出 `BackupApiUrl`。设置它为前端构建时的 `VITE_AWS_BACKUP_URL`，继续保留免费模式和现有查询 API：

```sh
VITE_FREE_MODE=true \
VITE_PUBLIC_API_URL=https://courseflow-public-query.hkz4sxp6x5.chatgpt.site \
VITE_BASE_PATH=/portfolio/courseflow/ \
VITE_AWS_BACKUP_URL=https://YOUR_ID.lambda-url.us-east-1.on.aws \
npm run build
```

以上命令在 `_courseflow/frontend/` 运行。将 `dist/` 内容发布到仓库 `courseflow/`。环境变量是公开 endpoint，不是密钥；**不要在任何 `VITE_*` 变量中放 AWS 凭据**。当前 GitHub Pages 构建将 `VITE_AWS_BACKUP_URL` 留空。

部署后在新浏览器中显式保存一条关注与搜索，再修改本机配置并恢复、删除云备份，确认 DynamoDB 实际读写。另一个全新浏览器应读取不到第一份备份；检查开发者工具确认密钥仅发给你的 Lambda endpoint。查看 AWS 控制台实际用量后，才能称为已部署并验证 AWS 版本。

Function URL 使用 `AuthType: NONE` 以免普通访客需要 AWS 账号，但 handler 必须通过随机设备密钥验证。模板同时配置 `lambda:InvokeFunctionUrl` 和限制为 URL 调用的 `lambda:InvokeFunction` 权限，遵循 AWS 2025-10 后的新 URL 要求。

## 关闭与清理

先将 `VITE_AWS_BACKUP_URL` 留空并重新发布前端，停止用户继续访问备份；如需保留配置，让用户先导出。本机功能不受影响。随后删除云栈：

```sh
sam delete --stack-name courseflow-backup --region us-east-1
```

此操作会删除备份表及记录。审阅 SAM 删除提示并在 AWS 控制台核对栈、日志和部署制品是否已清理；共享的 SAM 管理存储桶不应在仍有其他项目使用时直接删除。不要只删除网页就认为后端资源停止存在。

## 简历与面试

现在可以准确写：

> Implemented an optional AWS Lambda and DynamoDB backup API with SAM infrastructure, scoped IAM permissions, device-key isolation, optimistic concurrency, TTL expiration, and automated frontend/backend tests.

当前不能写成“已在 AWS 生产部署”或“永久免费、无限用户”。只有实际部署和独立 AWS 集成验收后，再补充部署成果。公开网页的 React、TypeScript、REST、localStorage、PWA、CI/CD 和既有 Java 完整版仍保留。

补充官方参考：[SAM deploy](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-deploy.html)、[Function URL 授权](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html)、[DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)。
