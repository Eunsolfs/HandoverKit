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

## 2026-11-03 前端 / 构建 / 测试

### 10. Vite dev 在 Windows 上只监听 [::1]，Playwright/curl 连不上

- 现象：`vp dev` 输出 http://localhost:5173，但 Playwright 访问 `http://localhost:5173` 报 ERR_CONNECTION_REFUSED；netstat 只看到 `[::1]:5173`。
- 原因：Node 24 下 `localhost` 优先解析为 IPv6，Vite 只绑定 ::1。
- 处理：`apps/web/vite.config.ts` 的 `server.host` 显式设为 `"127.0.0.1"`；E2E 测试栈（`apps/web/tests/support/server.ts`）启动 Vite 时同样加 `--host 127.0.0.1`。注意不要同时改变 BETTER_AUTH_URL 的 origin，否则 Better Auth 会因 Origin 不一致拒绝登录。

### 11. Base UI 菜单崩溃：Menu.GroupLabel 必须在 Menu.Group 内

- 现象：打开用户菜单/团队切换菜单，整页进入 RootErrorPage，控制台报 `The above error occurred in the <MenuGroupLabel> component`。
- 原因：shadcn v4（Base UI）中 `DropdownMenuLabel` 映射 `Menu.GroupLabel`，规范要求父级是 `Menu.Group`。
- 处理：把 `DropdownMenuLabel` 包进 `DropdownMenuGroup`（或直接用普通 div 样式替代）。用户菜单与团队切换器都已修复。

### 12. Windows 文件 watcher 导致写入 EIO / EBUSY

- 现象：批量改文件时偶发 `ReplaceFileW EIO (Win32 32)`；dev 日志出现 `file watcher error: EBUSY ... *.tmpdir`。
- 原因：Vite/Vite+ watcher、杀毒/索引服务与原子替换写竞争。
- 处理：批量重构时先停 dev server，改完再启动；单文件写入失败等 1–3 秒重试；临时脚本/产物（`.tmp-*`）在 .gitignore 中忽略。

### 13. knip 报 “Package entry file not found”

- 现象：packages/ui/package.json 增加 `"./hooks/*"` 导出后 knip 报 `./src/hooks/**/*.ts  Package entry file not found`。
- 处理：仅当真正新增 hooks 文件后再加该导出（AGENTS.md 的要求）；当前已移除，knip 绿。新增 hooks 时同步加目录与文件。

### 14. 热重载期间 getSession 502 → 根错误边界

- 现象：开发时后端因文件变更重启，前端 `/api/auth/get-session` 经 Vite 代理返回 502，页面显示“页面加载失败 / Bad Gateway 重试”。
- 说明：开发期瞬时现象，刷新即恢复；根错误边界已提供重试按钮。生产同源单进程不会出现该问题。

### 15. 演示数据被手工验证改动

- 现象：前端手工走通「接班 → 交班」后，示范数据里的今日记录状态从「待接收」变为「已交班」。
- 处理：需要干净演示数据时重跑 `pnpm run seed:demo`（脚本幂等，但不会回滚已改状态；必要时删除 apps/server/local.db 后重新 migrate + seed）。生产环境不要执行 seed 脚本。

### 16. 运行镜像里不能执行 seed-demo

- 现象：容器运行阶段只有 dist/ 与生产依赖，scripts/seed-demo.ts 依赖仓库源码（apps/server/.env、packages/*/src）与开发依赖，容器内执行会模块解析失败。
- 处理：演示数据在本地/代码目录执行 pnpm run seed:demo 生成 SQLite 文件，再把文件写入数据卷 /data（见 docs/deployment-1panel.md）。生产环境不要执行演示种子。

### 17. 登录页验证码是 data-URL img，E2E 不要从 DOM 提取

- 现象：验证码改为 data:image/svg+xml 的 img 后，Playwright 无法直接从 DOM 文本取字符。
- 处理：E2E 通过 page.route 拦截 /api/captcha 响应体或直接调用接口，从 SVG 文本里提取字符（tests/support/api.ts 与 login.e2e.ts 已按此实现）。

### 18. 移动端适配的几个通用要点（本轮实践）

- 触控目标：移动端表单/按钮统一 44px（本仓库用 h-11 + lg 恢复桌面密度），checkbox 可用 20px 视觉 + 44px 点击区。
- 弹窗：手机端 Dialog 用 max-h: calc(100dvh - 2rem) + 内容区 overflow-y-auto，header/footer 设 sticky，避免标题和提交按钮被滚出屏幕。
- 扫码页：底部固定按钮加 env(safe-area-inset-bottom)，内容区留出等高的 padding-bottom，确保最后一项不被遮挡。
- 溢出审计：用 Playwright 遍历各宽度，比较 documentElement.scrollWidth 与 innerWidth；只查 body 溢出不够，还要检查弹窗、表格外层与长文本。
- 开发环境截图里的 TanStack Router / React Query 调试浮层会干扰审计，生产构建已通过 import.meta.env.DEV 关闭；视觉验收以生产预览为准。
- 真机重点：dvh 与键盘弹起、iOS 输入框字号 <16px 会触发缩放（input 在移动端用 text-base）。

## 2026-11-03 Docker Desktop（Windows）实测踩坑

### 19. Windows 下 Docker CLI 不在 PATH，构建报 docker-credential-desktop 找不到

- 现象：`docker build` 报 `error getting credentials - exec: "docker-credential-desktop": executable file not found in %PATH%`。
- 原因：Docker Desktop 的 CLI 与 credential helper 在安装目录的 `resources\bin`，未加入 PATH。
- 处理：把 `C:\Users\<用户>\AppData\Local\Programs\DockerDesktop\resources\bin` 加入 PATH；Linux 服务器/CI 使用官方 docker 安装即可。

### 20. Git Bash 下 restore 的临时目录 bind mount 为空

- 现象：恢复时容器内 `cp /restore/app.db` 报 No such file or directory；脚本退出时还出现 `tmp: unbound variable`。
- 原因：Git Bash 的 POSIX 临时路径不能直接作为 Windows Docker 的 bind mount；trap 在函数返回后引用了已销毁的 `local` 变量。
- 处理：脚本内在 Windows 用 `cygpath -w` 转换挂载路径；trap 使用脚本级变量清理临时目录。Linux 下不受影响。

### 21. 本地/离线镜像无法 compose pull

- 现象：`docker compose pull` 对仅供本地使用的镜像返回 `pull access denied`，导致一键安装失败。
- 处理：`ops.sh` 拉取失败时检测 `docker image inspect`，本地已有镜像则继续；离线安装可 `docker save/load` 后再执行 install。

### 22. upgrade 参数为「完整镜像引用」时被误当成 tag

- 现象：`ops.sh upgrade handoverkit:local` 被拼成 `ghcr.io/eunsolfs/handoverkit:handoverkit:local`（invalid reference）。
- 处理：目标包含 `:` 或 `/` 时按完整镜像引用处理；否则按 tag 拼接当前镜像仓库。
