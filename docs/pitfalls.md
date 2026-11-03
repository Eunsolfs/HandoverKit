# 易交接 —— 避坑记录

> 记录开发过程中真实踩过的坑与结论，避免重复排查。新坑请追加到末尾（日期 + 现象 + 原因 + 处理）。

## 2026-11-03 环境与脚手架

### 1. 本机 Node/pnpm 版本不满足脚手架要求
- 现象：`pnpm install` 报 `ERR_PNPM_UNSUPPORTED_ENGINE`，要求 Node 24.22.1 / pnpm 12.15.0；系统 Node 22.16、pnpm 缺失。
- 原因：VibeStart 生成的 `package.json` 写死了精确版本；本机工具链较旧。
- 处理：使用 DSH 自带 Node 24.21.0 + 在工作区安装 pnpm 12.15.0（`.tools/`），node/pnpm engines 放宽为 `>=24.11.0` / `>=12.15.0`。统一命令：
  ```bash
  export PATH="/c/Users/yuluo/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH"
  export npm_config_cache="$PWD/.npm-cache"
  .tools/node_modules/.bin/pnpm install
  node_modules/.bin/vp check
  ```
- 注意：`npm i -g pnpm` 在本机因全局目录权限失败，改用本地前缀安装。

### 2. 项目目录名必须小写（VibeStart 限制）
- 现象：`create .` 报 Project name "HandoverKit" 非法。
- 处理：先在子目录 `handoverkit` 生成，再把内容平移到仓库根；`vibestart.jsonc` 的 name 保持 CLI 写入值，不手改。

### 3. Drizzle 生成的 CHECK 约束把枚举写成绑定参数
- 现象：迁移 SQL 出现 `CHECK("type" in (?, ?, ?))`，SQLite 迁移报 `SQL logic error`。
- 原因：`sql` 模板里的字符串会生成绑定参数，DDL 不允许参数。
- 处理：枚举值用 `sql.raw()` 拼成字面量（值来自代码常量，非用户输入），重新生成迁移。

### 4. Better Auth 启动告警：schema mismatch（user.username）
- 现象：`Required columns Better Auth never writes: user.username`。
- 原因：username 插件的字段在 Better Auth 中是可空的，我们却建了 `NOT NULL` 且无默认值。
- 处理：数据库列改为可空（应用创建账号时必填，唯一索引仍生效），启动告警消失。

### 5. 同步驱动事务里不能 await
- 现象：在 `db.transaction(async (tx) => ...)` 里 await 查询报错/类型报错。
- 原因：`drizzle-orm/node-sqlite` 是同步驱动，事务回调必须同步。
- 处理：事务内统一用 `.run()` / `.all()` / `.get()`，事务回调保持同步：
  ```ts
  db.transaction((tx) => {
    tx.insert(item).values({ ... }).run();
    const row = tx.select().from(item).where(eq(item.id, id)).all()[0];
  });
  ```
  事务外可直接 `await` 查询构造器（thenable），但风格上统一用同步方法更稳。

### 6. 包内直接 import 第三方包必须显式声明依赖（pnpm 严格隔离）
- 现象：`ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm' imported from packages/auth/src/credentials.ts`。
- 原因：pnpm 不做幽灵依赖提升。
- 处理：在对应 workspace 包的 `package.json` 显式加入依赖（`catalog:`），重新 `pnpm install`。

### 7. Windows 下文件被 watcher 占用导致写入 EIO
- 现象：写文件偶发 `ReplaceFileW EIO (Win32 32)`。
- 原因：`vp dev` 的 watcher 正在读同一文件。
- 处理：稍等 1–2 秒重试写入；关键文件写完用 `vp check` 确认落盘。

### 8. 验证码 SVG 文本可被脚本直接读取
- 现状：验证码字符以 `<text>` 输出，测试脚本可提取（E2E 依赖此特性）。
- 风险：对自动化脚本防护有限；定位是防暴力/防误操作，不是强安全边界。
- 后续：如需要更强防护，可加入字符扭曲/干扰层或改用服务端图片验证码 + 一次性 token。

### 9. 迁移演进策略（发布前）
- 发布前允许重置迁移目录重新生成 `init`（当前无生产数据）。
- 发布后：`packages/db/src/migrations` 已提交的迁移不修改；变更一律新增迁移，Docker 启动时由 migrate 服务自动执行。
