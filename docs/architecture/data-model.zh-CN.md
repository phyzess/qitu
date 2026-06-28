# 通用数据模型

Status: draft  
Date: 2026-06-27

## 1. 目的

本文说明 `qitu` core 自己应该拥有的通用表。业务表刻意不放在这里。

通用数据模型覆盖：

1. 鉴权与会话。
2. 源文件。
3. 邮件。
4. 导入管线。
5. AI advisory。
6. 审计、安全事件与告警。

## 2. 已实现基线与目标模型

当前 migration 已实现一部分可跑通的基线：

```text
users
invitations
password_credentials
sessions
password_reset_tokens
login_attempts
source_files
email_messages
import_jobs
import_job_events
import_review_issues
import_review_decisions
import_review_record_decisions
ai_advisory_artifacts
audit_events
security_events
alert_events
```

英文文档中的部分 schema 是更完整的目标模型，可能比当前 migration 更丰富。落地时以 migration 为真实结构，以本文作为边界说明。

## 3. 鉴权表

当前基线使用：

```text
users
invitations
password_credentials
sessions
password_reset_tokens
login_attempts
```

目标模型可以扩展为：

```text
users
user_identities
user_sessions
user_invitations
password_reset_tokens
login_attempts
```

核心原则：

1. `users` 保存用户、邮箱、状态、角色与激活时间。
2. 密码、邀请 token、reset token、session token 只存 hash。
3. `user_identities` 给未来 OIDC、飞书、钉钉、企业微信、SAML 留扩展空间。
4. `login_attempts` 记录登录结果，但不暴露邮箱是否存在。

默认用户状态：

```text
invited
active
suspended
disabled
```

## 4. 源文件表

`source_files` 保存文件的物理事实：

1. 文件名。
2. 文件类型与 MIME。
3. 字节数。
4. `sha256`。
5. R2 bucket 与 object key。
6. 上传用户、邮件来源和接收时间。

core 只知道“文件是什么物理对象”。业务功能决定“这个文件是什么意思”。

## 5. 邮件表

`email_messages` 只保存发送元数据：

1. 邮件类型。
2. 收件人。
3. 标题。
4. 状态。
5. provider。
6. provider message id。
7. 错误信息。
8. 结构化 metadata。

原始正文应放 R2。D1 不存完整邮件正文，只存必要元数据和最小提取信息。

## 6. 导入管线表

当前基线：

1. `import_jobs` 保存 source file、状态、adapter/job metadata、幂等 key、尝试次数和失败分类。
2. `import_review_issues`、`import_review_decisions`、`import_review_record_decisions` 属于 core，使用不透明的 `staged_record_key`。
3. `example_staged_records` 与 `example_committed_records` 是 example-owned demo 表，真实应用应替换为业务自己的 staging 与 commit 表。

推荐状态流：

```text
queued -> processing -> needs_review -> approved -> imported
queued -> processing -> failed
needs_review -> rejected
```

导入相关表的职责：

1. `import_jobs`：作业生命周期与状态。
2. `import_job_events`：状态变化与时间线。
3. `import_review_issues`：校验问题、冲突和警告。
4. `import_errors`：解析或导入错误。

## 7. AI Advisory 表

`ai_advisory_artifacts` 保存 AI 或本地 deterministic helper 的建议结果：

1. 关联 import job。
2. provider 与 model。
3. prompt version。
4. summary。
5. output JSON。
6. 创建者。
7. confirmed/dismissed 状态与操作者。

Advisory artifact 不是业务事实。commit 路由必须读取“已审批的 staging records”，不能读取 AI advisory 状态来直接提交业务数据。

## 8. 事件表

当前基线已经实现：

```text
audit_events
login_attempts
import_job_events
security_events
alert_events
```

`audit_events` 记录业务与系统操作：

1. action。
2. actor。
3. entity type/id。
4. before/after JSON。
5. request/session 信息。
6. 时间。

`security_events` 记录安全相关事件：

1. 登录成功/失败。
2. 密码重置。
3. 权限拒绝。
4. 账号禁用或恢复。
5. session revoke。

`alert_events` 用于未来告警中心：

1. severity。
2. alert type。
3. title/message。
4. status。
5. acknowledged/resolved 信息。

## 9. 业务表

业务表不在 `qitu` core 中定义。

业务功能可以拥有：

1. staging 表。
2. 业务主表。
3. 业务历史表。
4. 计算结果表。
5. 报表或 chart 投影表。

业务表通过以下字段与 core 串联：

1. `source_file_id`
2. `import_job_id`
3. `audit_events`
4. 业务自己的 commit key
