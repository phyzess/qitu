# 可选组织访问能力

状态：可选示例
日期：2026-07-10

Qitu 默认仍是单组织应用。需要租户工作区的应用可以复制
`examples/organization-access` 下的可执行示例，不要把 starter 的全局角色字段直接扩展成
一个边界含混的多租户模型。

## 不变量

1. 组织成员身份与平台成员身份必须分开记录。
2. 平台角色绝不隐含客户组织成员身份。
3. 服务端只有在确认用户拥有有效组织成员身份，或拥有显式、未过期的支持访问授权后，
   才能接受当前组织。
4. Disabled organization 会同时拒绝 membership 与 support access。
5. 支持访问只能读、仅针对一个组织、必须记录原因、可以撤销，并且有明确期限。
6. 组织 entitlement 是功能开关，不能替代权限判断。
7. 跨组织使用资源时，必须存在与接收组织、资源和操作完全匹配的授权。
8. App-owned 查询仍必须用已经解析并验证过的组织 id 限定每一条租户数据。

## 接入步骤

1. 把 `examples/organization-access/migrations/0001_organization_access.sql` 复制到 app-owned
   Worker migration 序列。
2. 把访问上下文规则复制或导入 deployable app。
3. 在 app-owned RBAC policy 中定义组织角色与权限。
4. 每个请求只从服务端记录解析一次访问上下文；未经成员身份校验，绝不信任客户端提交的
   组织 id。
5. 把解析后的组织 id 传给所有 app-owned 查询和 commit Adapter。
6. 通过应用自己的 audit store 记录下列事件。

示例中的 resource helper 只检查组织范围，不能替代 app-owned RBAC 对请求操作的权限判断。
调用方必须提供一份 canonical action policy，把每个 action key 映射为 `read` 或 `write`，避免用
互相矛盾的 mode 参数绕过 read-only support access；未分类 action 会 fail closed。

必须记录的 audit 事件：

```text
organization.created
organization.membership_created
organization.membership_updated
organization.entitlement_updated
resource_grant.created
resource_grant.revoked
support_access.granted
support_access.used
support_access.revoked
```

## 生产迁移

使用 `docs/templates/organization-migration-runbook.md` 记录上线过程。安全顺序是：

```text
导出/备份
-> schema migration
-> 部署理解组织边界的代码
-> dry-run 账号与数据分类
-> 应用分类结果
-> 只读的迁移后检查
```

在已部署代码能够解析平台成员身份之前，不要把平台专用用户从客户组织中移除。精确用户身份
和客户映射只能放在 operator-only 环境变量或经过 review 的迁移输入中，绝不能提交到仓库。

## 明确保留在 App 层

Qitu 不定义客户合同、计费方案、业务资源类型、数据共享投影，也不定义模拟或报告语义。
即使接入了通用组织访问示例，这些内容仍然属于 app-owned feature code。
