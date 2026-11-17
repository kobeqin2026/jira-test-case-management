# JIRA Test Case Manager

[![version](docs/badge-version.svg)](https://github.com/kobeqin2026/jira-test-case-management/releases/tag/v1.9.1)

JIRA 测试用例管理系统 — Test Plan / Task / Sub-task 全生命周期管理与统计平台。

## 功能概览

### 📋 Test Case 库（浏览模式）
- **项目选择**：从100+个JIRA项目中选择目标项目
- **Test Plan 浏览**：以卡片网格展示所有 Test Plan，显示状态、子任务数、组件等
- **Sub-task 详情**：点击 Test Plan 查看所有关联的 Sub-task，支持状态筛选和组件分布图表
- **KPI 统计**：总用例数、进行中、已完成、阻塞等关键指标实时展示
- **Chart.js 可视化**：组件分布饼图 + 状态分布柱状图
- **设置执行日期**：为 Test Plan 及所有 Sub-task（包括 Sub Test Plan 下的 Sub-task）批量设置 Actual Start Date / End Date
- **每日执行趋势**：计划开始（柱）vs 实际执行（平滑线+渐变面积）组合图，柱顶/点顶标注当日条数、周末底纹、时间窗可切（全部/近7/14/30天/自定义）；同时给出「该时段完成」与「全量已完成」两个口径

### 📤 批量上传（上传模式）
- **自然语言创建**：通过 AI 对话式输入，自动解析为 JIRA Test Plan 和 Sub-task
  - 支持创建 Test Plan、Sub Test Plan、Sub-task
  - 支持设置负责人（Assignee）、优先级、标签
  - 支持批量创建（如"创建3个sub test plan"）
- **CSV 模板批量上传**：下载 CSV 模板 → 填写测试用例 → 一键批量创建到 JIRA
- **AI 智能解析**：支持自然语言指令（如"在当前Test Plan下创建测试用例,负责人为xxx"）

### 🧠 LLM 智能评估
- **Test Plan 描述生成**：LLM 根据所有 Sub-task 自动生成 Test Plan 的专业描述
- **Sub-task 描述增强**：对已有描述的 Sub-task，LLM 以硬件测试专家身份补充测试目的和期望预期
- **描述保护机制**：有原始描述时保留原内容并追加 LLM 增强，无描述时生成完整描述
- **智能分类**：根据 Test Plan 类型（Ethernet/HBM/PCIe）自动选择合适的分类关键词
- **实时进度反馈**：评估过程中实时显示已等待时间，完成后显示总耗时
- **并行写入优化**：JIRA 描述更新采用5并发并行写入，大幅提升速度

### 👤 用户管理
- **多用户支持**：管理员可添加/删除用户，每个用户独立配置
- **JIRA PAT 管理**：每个用户设置自己的 JIRA Personal Access Token
- **角色控制**：管理员 / 普通用户权限分离
- **登录保持**：基于 Token 的会话管理

### 📝 会议纪要一键生成（v1.9.0）

把「周会 PPT + JIRA 实时数据」合成一份可直接发出的会议纪要 HTML。全程**只读 JIRA**（只有 GET），不修改任何用例/缺陷。

**输入**

| 项 | 说明 |
|---|---|
| Test Plan Key | 顶层 Test Plan 的 key（如 `PROJ-1234`），用来定位整棵用例树。默认值由 `REPORT_DEFAULT_PLAN` 环境变量注入、经 `/api/config` 下发，仓库里不写死项目 key |
| 周次 | 可留空 → 自动从 PPT 首页标题里的 `WW\d+` 识别 |
| 会议日期 | 默认今天；用于 Highest bug 的「`created <= 会议日`」快照，也进文件名 |
| 当周 PPT | `.pptx` / `.pptm`，base64 随 JSON POST 上传（3~5MB 原始体积） |

**处理链路**

1. `GET /rest/api/2/issue/<planKey>` 取计划名 → 2. `scripts/pptx_extract.py`（python-pptx）把 PPT 摊平成 JSON：每页 `title / texts / tables / status / bigPicture` → 3. `collectDomains()` 按标题 `… FE Status` 识别 Domain 页（跳过前 2 页封面/目录与 Bug triage 页），页内表格按表头分流：
   - 表头含 `JIRA No / JIRA ID` → **Bug 表** → Hot issue（key / 描述 / 优先级 / 负责人 / debug 进展）
   - 其余（`feature list / task list` 或 ≥4 列）→ **Feature 表** → 按状态列分桶成 `Validated` / `In Progress`

4. `parent in (…)` 递归拉子计划（issuelinks 外链 + `parent` 字段两种关系都收），聚合 total / Validated / WAIVED / 进行中 / 未开始 / 执行率，并按 Priority 再切一刀
5. 计划周期 = 各计划 Planned Start（`customfield_10300`）最小值 ~ Planned End（`customfield_10301`）最大值
6. Highest bug = `project = <planKey 前缀> AND issuetype = Bug AND priority = Highest AND created <= "<会议日>"`，上限 20 条
7. 渲染自包含 HTML（CSS 全内联、无外部资源）并落盘 `data/reports/<planKey>-<WW>-<yyyymmdd>-<ts>.html`

**输出结构（五节）**

| 节 | 内容 |
|---|---|
| 一、整体进展 | 6 张数字卡（用例总数 / Validated / 执行率 / 进行中 / 未开始 / WAIVED）+ 计划周期 + Priority 分布表（用例数 / Validated / 执行率） |
| 二、各 Domain 状态 | 每个域一段，标题 `N) 域名`，正文三段式 `Validated：` / `In Progress：` / `Hot issue：`（有高亮时追加 `Highlights：`） |
| 三、用例执行明细 | 10 列：Domain Key · Domain 名称 · 用例总数 · 已执行(Validated) · 执行率 · 未开始 · 进行中 · 已完成未验证 · 已豁免 · 阻塞/其他 |
| 四、Highest bug triage | # · JIRA ID · 描述 · Priority · Component · Assignee · 状态/日期 |
| 五、数据核对说明 | 口径自述（WAIVED 不计入分子）+「PPT 数字与表格不一致时以 JIRA 为准」 |

**渲染规则（都是实际发周会时被挑出来的细节，别再改回去）**

- **链接**：所有 JIRA key 自动变蓝字超链接，正文**不出现明文 URL**；PPT 里的 `[KEY] 名称 - Jira <url>`、裸 `<url>`、`…/browse/KEY` 三种写法都会先收敛成纯 `KEY` 再统一渲染
- **字体与颜色**：Domain 段统一「等线 DengXian / 12pt（小四）」+ 纯黑正文，域标题加粗；不使用绿/橙状态色、不用彩色左边框（打印黑白与投影都清晰）
- **不重复状态词**：条目已归在 `Validated：` / `In Progress：` 行下时，不再逐条追加 `Validated / Done / OK / 进行中 / pass`；只有带信息量的说明（如「测试中，进度 80%」「缺 8 卡机器」）才保留
- **占位符不入正文**：`/`、`-`、`—`、`N/A`、`none`、`无`、`待定` 视为空；Priority 列不当内容；条目按 `任务：补充说明` 拼接，去尾部冒号与重复片段
- **key 归一**：PPT 里只写数字的 key（如 `1455`）自动补项目前缀 → `<PROJECT>-1455`；状态列本身就是一个 key 时改写为「见 hot issue」
- **Highlights 降噪**：纯百分比 / 纯数字 / `-` 之类的行会被过滤，`Highlights:`、`Hot Issues:` 这类标题行不进正文

**预览 / 导出**

- 页面内 iframe 预览 → 新窗口打开 → 下载 HTML → `window.print()` 直接出 PDF（`@media print` 已做分页保护：域块不跨页、标题不落单）
- 历史报告列表（最近 12 份，带生成时间与体积）可回溯；**每次切回该标签页都会重新拉一次**（避免登录前 401 被缓存成「暂无历史」）

**接口**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/report/generate` | `{planKey, week, meetingDate, fileName, fileBase64}` → `{success, file, url, html, summary}` |
| GET | `/api/report/list` | 已生成报告列表（`name / size / mtime / url`，按时间倒序） |
| GET | `/api/report/file/:name` | 预览或下载某一份（需登录；`path.basename` 防目录穿越，只放行 `.html`） |

**前置条件与已知坑**

- 后端需 `python3` + `python-pptx`（`routes/report.js` 用 `execFile` 调 `scripts/pptx_extract.py`，120s 超时、32MB stdout 上限）
- nginx 必须放宽上传体积 `client_max_body_size 50m;`，否则 413；`express.json` limit 已从 5mb 提到 40mb（base64 ≈ 1.37× 原始体积）
- Domain 页靠标题正则识别：标题需含 `… FE Status`，否则该页不会被抽成域段（会在报告里提示「该域本周无结构化表格」或整体「未识别到 Domain 页」）
- Bug triage 页（标题含 `bug triage / highest bug / high bug / bug 状态`）只作为 Highest 列表的数据源，不参与域段抽取

### ⚙️ 系统配置
- **JIRA 连接**：支持 JIRA Server/Data Center PAT 认证
- **LLM 配置**：可配置 LLM API 地址、模型、密钥
- **数据备份**：sessions.json 自动备份机制

## 技术架构

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Frontend      │────▶│   Backend        │────▶│  JIRA API    │
│   (HTML/JS)     │     │   (Express.js)   │     │  (REST)      │
│   Port: nginx   │     │   Port: 3001     │     │              │
└─────────────────┘     └──────────────────┘     └──────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │  LLM API     │
                        │  (br-qwen3)  │
                        └──────────────┘
```

- **前端**：原生 HTML + CSS + JavaScript（无框架依赖）
- **后端**：Node.js + Express.js
- **数据存储**：JIRA（主数据）+ 本地 JSON（用户/会话）
- **部署**：PM2 进程管理 + Nginx 反向代理

## 安装部署

### 环境要求
- Node.js >= 16
- npm
- PM2（推荐）
- Nginx（推荐，用于反向代理）

### 1. 安装依赖
```bash
cd jira-testcase-manager
npm install
```

### 2. 配置环境变量
创建或编辑 `ecosystem.config.js` 中的环境变量，或在 `~/.skills/.env` 中配置：

```bash
# JIRA 配置
JIRA_BASE_URL=https://jira.example.com
JIRA_PAT=your_jira_pat_here

# LLM 配置
BAILIAN_API_KEY=your_api_key_here
BAILIAN_BASE_URL=https://llm.example.com/v1
BAILIAN_MODEL=br-qwen3

# 系统配置
DEFAULT_ADMIN_PASSWORD=CHANGE_ME
DEFAULT_USER_PASSWORD=CHANGE_ME

# 创建 issue 时的默认 reporter（JIRA 用户名/工号；未配置则省略 reporter 字段，JIRA 自动落到 PAT owner）
JIRA_DEFAULT_REPORTER=CHANGE_ME_REPORTER

# 会议纪要页的默认 Test Plan Key（可选；留空则页面上手动填，公开仓不内置任何项目 key）
REPORT_DEFAULT_PLAN=
```

### 3. 启动服务
```bash
# 使用 PM2
pm2 start ecosystem.config.js

# 或直接启动
npm start
```

服务默认运行在 `http://localhost:3001`

### 4. Nginx 配置（可选）
> 会议纪要生成要 POST 几 MB 的 pptx（base64），**必须放宽上传体积**，否则 8089 直接返回 413：
> 在 server 块里加 `client_max_body_size 50m;`

```nginx
server {
    listen 8089;
    server_name your-server;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 项目结构

```
jira-testcase-manager/
├── server.js                 # Express 应用入口
├── ecosystem.config.js       # PM2 配置 + 环境变量
├── package.json
├── routes/
│   ├── auth.js               # 用户认证路由（登录/注册/用户管理）
│   ├── testcase.js           # 核心业务路由（Test Plan/Sub-task/LLM评估）
│   └── report.js             # 会议纪要生成路由（pptx + JIRA -> HTML 报告）
├── lib/
│   ├── jiraConfig.js         # JIRA 连接配置
│   ├── users.js              # 用户数据管理
│   ├── sessions.js           # 会话数据管理
│   ├── dataStore.js          # 通用数据存储（JSON文件）
│   ├── backup.js             # 数据备份机制
│   ├── fileLock.js           # 文件锁（并发写入保护）
│   ├── logger.js             # 日志管理
│   └── validation.js         # 输入验证
├── middleware/
│   └── auth.js               # JWT 认证中间件
├── public/
│   ├── jira-test-case-management.html  # 主页面
│   └── js/
│       ├── testcase-upload.js          # 前端核心逻辑（~2800行）
│       └── report.js                   # 会议纪要页逻辑（上传/生成/预览）
├── scripts/
│   └── pptx_extract.py       # pptx -> JSON（python-pptx；供报告生成调用）
├── deploy.sh                 # 部署脚本
└── data/                     # 运行时数据（不纳入版本管理）
    ├── sessions.json
    ├── reports/              # 生成过的会议纪要 HTML
    └── ...
```

## API 接口

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/register` | 注册新用户（管理员） |
| GET | `/api/auth/users` | 获取用户列表 |
| DELETE | `/api/auth/users/:username` | 删除用户 |
| GET | `/api/auth/profile` | 获取当前用户配置 |
| PUT | `/api/auth/profile` | 更新用户 JIRA PAT |

### Test Case 管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/testcase/projects` | 获取所有 JIRA 项目 |
| GET | `/api/testcase/parents/:project` | 获取项目下的 Test Plan / Task |
| GET | `/api/testcase/issue/:key` | 获取 Issue 详情（含关联链接） |
| GET | `/api/testcase/subtasks/:key` | 获取 Test Plan 下的 Sub-task |
| GET | `/api/testcase/testplan/linked-tasks/:key` | 获取 Test Plan 及其关联的所有 Sub-task |

### 批量操作
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/testcase/batch-create` | 批量创建 Issue（AI 解析） |
| POST | `/api/testcase/batch-upload` | CSV 批量上传创建 |
| POST | `/api/testcase/testplan/update-descriptions` | 批量更新 Sub-task 描述 |
| POST | `/api/testcase/batch-update-dates` | 批量更新 Actual Start/End Date |
| PUT | `/api/testcase/issue/:key/status` | 更新 Issue 状态 |
| PUT | `/api/testcase/issue/:key/assignee` | 更新 Issue 负责人 |

### 会议纪要
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/report/generate` | 传 pptx(base64) + planKey/week/meetingDate → 生成 HTML 纪要，返回 {file,url,html,summary} |
| GET | `/api/report/list` | 已生成报告列表 |
| GET | `/api/report/file/:name` | 预览/下载某份报告（需登录） |

### LLM 智能功能
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/testcase/testplan/llm-evaluate` | LLM 生成/增强 Test Plan 描述 |
| POST | `/api/testcase/ai-parse` | AI 自然语言解析为 JIRA 操作 |
| GET | `/api/testcase/template` | 下载 CSV 上传模板 |

## 版本历史

### v1.9.1 (2026-11-17)
**修复域页标题的「项目前缀」误剥离（v1.9.0 去敏引入）**

- 去敏时把 `<项目KEY>` 前缀并进了带 `/i` 的域标题正则 `^(?:[A-Z][A-Z0-9]{2,}\s*)?…`，**大小写不敏感导致普通单词也被当成项目前缀**：标题 `Board Power FE Status`（无方括号）被解析成域名 `Power`，与独立的 `Power` 域合并 → 域段少一段、内容串台
- 改为两条正则 + 一个**大小写敏感**的前缀剥离规则：
  - `DOMAIN_BRACKET_RE` 先试方括号形式 `[<Domain>] FE Status`（前缀可有可无）
  - `DOMAIN_PLAIN_RE` 兜底 `<Domain> FE Status`
  - `PROJECT_PREFIX_RE = /^[A-Z][A-Z0-9]{2,}\s+/`（无 `/i`）只吃全大写项目 key，`Board` 这类混写单词保留
- 实测（WW46 真 PPT，13 个 `… FE Status` 页）：`[Board Power]` → `Board (Power)`、`Power` → `Power`、11 个域与 v1.9.0 一致无回归；拿掉方括号的 `Board Power FE Status` 也从 `Power` 修正回 `Board (Power)`

### v1.9.0 (2026-11-17)
**「会议纪要」正式发布 + 排版/口径四轮打磨 + 公开仓去敏**

**新增**
- **会议纪要一键生成**（详见上文「会议纪要一键生成」章节）：新增 `routes/report.js`（生成/列表/预览三个接口）、`scripts/pptx_extract.py`（python-pptx 摊平 PPT）、`public/js/report.js`（上传/生成/预览/历史）；主页新增第三个标签页；`express.json` 上限 5mb → 40mb；`data/reports/` 存生成物（不进版本管理）

**修复**
- **标签页高亮错位**：`switchTab` 原先按按钮序号判断选中态，新增第三个标签页后高亮会落错 → 改为按 tab id 判断
- **历史报告「暂无历史」假象**：登录前的 `DOMContentLoaded` 拉到 401 会渲染成空列表，且切回标签页不刷新 → 现在每次切回都重新拉一次
- **JIRA 中文乱码**：`jiraRequest` 增加 `resp.setEncoding('utf8')`，避免 UTF-8 中文描述被按 latin1 截断
- **PPT 裸数字 key**：deck 里只写数字的 key（`1455`）不会拼成可点链接 → 自动补项目前缀 `<PROJECT>-1455`
- **Highlights 噪声**：`40%`、`-`、`1/3` 这类纯数字行与 `Highlights:` / `Hot Issues:` 标题行不再进正文

**排版收敛（三轮迭代，均为实际发周会时提出的样式要求）**
1. 去掉每条用例后的冗余状态词（`Validated` / `In progress` / `OK` / `Done` …）—— 已归在 `Validated：` / `In Progress：` 行下就不必逐条重复
2. Domain 段全部改黑体：正文纯黑 + 等线 12pt（小四）、域标题加粗；去掉绿/橙状态色与彩色左边框
3. 去掉占位符 `:`、`/` 尾巴与优先级后缀（Priority 列不再拼进正文）；标题式 `Highlights` 段与正文同款字重

**工程/文档**
- `deploy.sh` 改为部署 `public/js/*.js` **全部脚本**（此前只拷贝单个文件，新增的 `report.js` 会漏发，页面报 `generateMinutes is not defined`）
- README 补 nginx `client_max_body_size 50m` 说明、目录结构（`routes/report.js` / `scripts/` / `data/reports/`）与 `REPORT_DEFAULT_PLAN` 环境变量
- **公开仓去敏**：报告模块里的内部标识泛化 —— 域标题正则改为任意项目前缀、URL 清洗正则去掉内网主机名、issue key 正则不再写死项目前缀；页面默认 Test Plan Key 改为 `REPORT_DEFAULT_PLAN` 环境变量 + `/api/config` 下发，仓库内不含具体项目 key
- 前端版本 `testcase-upload.js v107`、`report.js v2`

### v1.8.0 (2026-11-16)
- **新增「会议纪要」标签页**：上传当周周会 pptx + 选 Test Plan → 一键生成 HTML 会议纪要
  （PPT 的 Domain/Bug triage 内容 + JIRA 实时用例进度合并，JIRA key 全为可点链接）
- 新增 `routes/report.js`、`scripts/pptx_extract.py`、`public/js/report.js`
- `express.json` 上限 5mb → 40mb（pptx 走 base64 上传）
- 修复 `switchTab` 按按钮序号判断选中态（新增第三个标签页后高亮会错位）→ 改为按 id 判断

### v1.7.0 (2026-11-09)
**每日执行趋势可视化重做 + 完成日口径修正 + 自动刷新 / 导出 / 饼图优化**

- **每日执行趋势（重做）**：双折线改为组合图——「计划开始」用柱、「实际执行」用平滑线 + 渐变面积（值为 0 不画点）；柱顶/点顶标注当日条数（仅 count>0，两条序列自动错位 + 白色描边，避免重叠）；周末淡灰底纹；y 轴自适应刻度、x 轴自动抽稀；图例右上；卡片高度 200→268px；tooltip 显示完整日期 + 周几 + 「截至该日累计 实际/计划」
- **完成日口径修正（关键）**：此前用 `updated`（最后修改时间）当完成日，批量改状态会把大量用例堆到最后一次修改那天，曲线退化成一个尖峰。现在后端 `/search` 与 `/testplan/linked-tasks` 返回 `resolutiondate` 与 Actual Start/End，前端按 **Actual End > Resolution > Updated** 取完成日（实测同一棵树 75 条已完成：非零日 2 → 9，峰值 56 → 23 条/日）
- **「该时段完成」与「全量已完成」双口径**：顶部 KPI 完成率是全量口径（done+closed+validated / 总数），趋势曲线只统计完成日落在时间窗内的用例，两者天然会不一致。趋势卡片现在并列显示「该时段完成 X/总数 (p%) ｜ 全量已完成 Y (q%)，其中 N 条在窗口前完成未计入曲线」，并附悬停说明，避免两个百分比互相矛盾
- **Chart.js v4 内联插件注册修正**：内联插件必须放在 `config.plugins`，作为 `new Chart(ctx, cfg, [...])` 的第三个参数在 v4 静默失效（表现为插件完全不生效且不报错）；插件用的日期序列改由 `options.plugins.<id>` 传入（挂在 `dataset.data` 上的自定义属性会被数据归一化丢弃）
- **「计划开始」曲线改用例自身 Planned Start**：逐条排期后每条用例日期不同；原实现按所属计划的 Planned Start 落点，大量用例只堆成 2 个尖峰。现优先用例级 `customfield_10300`、缺失回退计划级，时间轴额外覆盖 Planned End
- **自动刷新**：顶部新增「关闭 / 15 / 30（默认）/ 60 分钟」与「立即刷新」；静默刷新保留筛选/排序/勾选/滚动位置，有未保存修改时自动跳过（手动刷新需确认）；选择记入 localStorage，回到前台补刷
- **一键导出所有 Domain 执行率（CSV）**：按关联 Sub-Test Plan 逐 domain 输出用例总数 / 已执行 / 执行率 / 未开始 / 进行中 / 已完成未验证 / 已豁免 / 阻塞 / 计划起止；L2 子计划用例归并到 L1 domain，附合计行校验；UTF-8 BOM 便于 Excel 直接打开
- **状态分布饼图标签**：改为环外引线（callout）+ 同侧按角度排序与最小行距避让，小比例（<1%）也单独标注，不再被丢弃
- **组件分布柱状图**：悬停一次显示整根柱子（已完成 / 已豁免 / 未完成 + 总计 / 完成率），不再是单段数值
- **部署脚本可移植**：`deploy.sh` 去掉写死的仓库/部署绝对路径，改为脚本自身目录 + `DEPLOY_DIR` 环境变量覆盖
- 前端版本 v106

### v1.6.3 (2026-10-27)
**LLM 评估轮询修复 + 公开仓去敏回归**

- **修复 LLM 评估"永远显示评估中"**：前端轮询的成功判定此前匹配 `✅ LLM 专家评估完成，正在更新 JIRA...` 整串，而实际日志为 `✅ LLM 专家评估完成，原始评估长度=N，正在更新 JIRA...`（中途插入长度值），子串永不匹配 → 轮询每秒用"评估中...已等待 N 秒"覆盖已完成状态，即便 JIRA 描述已成功更新也会一直转圈（实测：评估 34s 完成且 PUT 成功，前端仍计数）
  - 轮询条件改用最短稳定子串：`LLM 专家评估完成` +（`JIRA描述更新成功` 或 `Test Plan 描述已更新: <planKey>`）
  - `buildFinalDescription` PUT 成功后补打标准完成标记，双条件稳定满足
  - 同步修 upload/browse 两个入口的轮询；**教训**：轮询依赖日志子串时，标记文案必须与实际 addLog 串在同一提交内比对，防止漂移
- **公开仓去敏回归**：v1.6.2 后的迭代把内部项目名/登录名/工号示例带回文档与注释，本轮全部泛化；`defaultReporter` 默认值改 `CHANGE_ME_REPORTER` 占位、真实值经 `JIRA_DEFAULT_REPORTER` 环境变量注入（无 env 时行为：未配置则 JIRA 自动落到 PAT owner，与解析失败路径一致）
- 前端版本 v92

### v1.6.2 (2026-10-04)
**父列表 /search 窗口上限修复**

- `/api/testcase/search` 父列表 `maxResults` 上限由 100 提升到 500：当前接入的项目有 102 条 Test Plan/Task，最早创建的根计划（created DESC 排第 102）被原窗口截出列表
- `#parent-search` 是客户端过滤（只在已加载的 `allParents` 里筛），窗口外的 plan 无论怎么搜都找不到 —— 提高后端上限 + 前端 browse/upload 两处父列表查询到 500
- 前端版本 v91

### v1.6.1 (2026-08-27)
基于 v1.6.0 新增以下改动：

**统一用户登录（Hardware 平台账号回退）**
- 本地账号校验失败时自动回退校验 Hardware 平台用户库（127.0.0.1:3002 /api/users/login）
- 支持 Hardware 统一账号：admin 管理员 / Domain Owner（各域团队账号）直接登录
- Hardware 账号不在本地 users.json：JIRA PAT / JIRA 用户名设置写入会话（GET/PUT /api/auth/profile 兼容），无需在本地建号

**reporter 字段守卫修复（核心）**
- 修复 Hardware 统一账号（会话无 jiraName）创建 JIRA Issue 报 400 "The reporter specified is not a user."
- 根因：创建端点原先用 `req.user.jiraName || req.user.username` 作为 reporter，Hardware 账号会把应用登录名（如 user/board）发给 JIRA，而 JIRA 用户名均为工号格式
- 新增 `resolveReporterName()`：会话 jiraName 为 E 工号直接使用；否则用有效 PAT（个人或全局）调 `/rest/api/2/myself` 取 PAT owner（必为真实 JIRA 用户）；解析失败则省略 reporter 字段（JIRA 自动落到 PAT owner）
- 应用于 `POST /api/testcase/create`、`POST /api/testcase/batch-create`、`POST /api/testcase/testplan` 三处创建端点，批量创建仅解析一次

**批量上传交互增强**
- 统一 API 失败提示：401 显示「登录已失效，请刷新重新登录」引导；其他错误展示服务端错误原文
- 新建 Test Plan 支持显式指定 issuetype（Test Plan / Epic / Task 白名单校验），兼容计划树
- 已有用例区无直属用例时展示整棵子树用例（含子测试计划下用例）并标注来源
- 批量上传面包屑区新增「➕ 新建 Test Plan」快捷入口
- 前端版本 v87

**Nginx 反向代理兼容**
- `app.set('trust proxy', 1)`：修复 express-rate-limit v7 在 nginx `X-Forwarded-For` 头下抛 `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`（日志刷屏 / 潜在 500）

### v1.6.0 (2026-07-13)
基于 v1.5.3 新增以下修复：

**LLM 评估分类刷新修复（核心）**
- 修复"LLM重新评估"按钮复用旧分类导致 JIRA ID 过期的问题
- `reEvalPlanDescription`：每次重新分类，不再复用旧 `existingCatPart`
- `generateAndUploadDescription`：新增 JIRA ID 匹配检测（`missingInCat` / `staleInCat`），ID 不一致时自动重新分类
- 评估流程改为：分类(categorize) → 评估(evaluate)，确保分类始终基于最新 sub-tasks

**防浏览器缓存**
- `updatePlanDescription` 和 `reEvalPlanDescription` 的 linked-tasks 请求添加 `?_t=` 时间戳防缓存
- 前端版本 v85

**后端增强**
- 新增 `DELETE /api/testcase/delete/:key` 单条删除接口
- 新增 `POST /api/testcase/batch-delete` 批量删除接口
- Plan description 更新时添加日志输出

### v1.5.3 (2026-06-30)
基于 v1.5.2 新增以下优化：

**AI 自然语言输入回车键修复**
- 修复 textarea 回车键不识别的问题（Enter 键换行失效）
- 添加 keydown 事件处理器确保 Enter 正常创建新行
- textarea 行数从 rows=3 增加到 rows=5，方便查看多行输入

**LLM 评估性能优化**
- 描述生成批处理：BATCH_SIZE 从 30 降至 10，CONCURRENCY 从 2 提升至 3
- 20条 task 从 ~145秒降至预计 ~70秒（2批并行处理）
- 分类（categorize）prompt 精简，减少 token 消耗
- 分类接口增加重试机制（最多2次，间隔2秒）
- 每个 LLM 调用步骤添加详细耗时日志

**关联 Sub-Test Plans 修复**
- 修复 inward issue link 被错误显示为 sub test plan 的问题
- `linked-tasks` 接口只返回 outward 链接（当前 plan 指向的子计划）
- L2 链接计划现在也包含在 `linkedPlans` 返回中（level=2, parentKey=L1）
- 前端 cases 计数聚合：L2 计划的 cases 累加到 L1 父计划
- L2 计划按 parentKey 分组排序，紧跟在其 L1 父计划后面显示

**Sub-task JIRA 链接修复**
- `linked-tasks` 接口返回的 task 对象新增 `url` 字段
- Test Case 库详情表格第一列 Key 超链接正确指向 JIRA
- 前端版本 v79

### v1.5.2 (2026-06-29)
基于 v1.5.1 新增以下功能：

**LLM 评估域限定（Domain-Scoped Evaluation）**
- 专家评估 prompt 新增【核心原则：严格限定评估范围】
- 评估只针对当前 Test Plan 所属 domain（如 CP/HBM/PCIe/KMD 等），不扩展到其他 domain
- 不建议属于其他 sub test plan 的用例（如 CP 的 Test Plan 不建议 HBM/DDR/JTAG/电源/时钟等）
- 分类 prompt 同步更新：按 domain 专业维度分类（CP → HCQD调度/Barrier/EventWait/MMIO/原子操作/SDMA）
- 消除了 LLM 跨 domain 建议不相关测试用例的问题

**"LLM重新评估"智能判断**
- 重新评估时自动检查 Test Plan 描述是否已有分类（`h2. Test Summary` 标记）
- 已分类 → 跳过分类步骤，直接专家评估（节省 40-160 秒）
- 未分类 → 先分类再评估（完整流程）

**后端 sub-task 过滤兜底**
- `llm-evaluate` 接口增加后端过滤：确保只处理当前 plan 的直接 sub-tasks
- 前端未传 parent 字段时（旧浏览器缓存），后端自动从 JIRA 查询 `parent = planKey` 的 sub-tasks
- 解决了关联 plan 的 sub-tasks 被错误计入的问题（如关联 issue 跨计划被错误计入）
- `linked-tasks` 接口返回的 59 条关联任务，LLM 评估只处理当前 plan 的直接子任务

**Categorize JSON 解析加固**
- 新增 markdown 代码块内容提取（` ```json ... ``` ` 不依赖 `^` 锚点）
- 4 层 fallback 解析：直接解析 → 代码块提取 → 首个 JSON 对象 → 贪婪匹配
- 超过 20 条 task 时自动提升 categorize max_tokens 到 8000（防截断）
- 前端版本 v79

### v1.5.1 (2026-06-26)
基于 v1.5.0 新增以下功能：

**测试阶段感知评估**
- 专家评估 (LLM) prompt 加入芯片验证阶段上下文：BringUp → Feature Enable → FST → PVT
- 自动从 Test Plan 名称检测当前阶段（BU/bringup → BringUp, feature enable → Feature Enable, fst → FST, pvt → PVT）
- BringUp阶段：聚焦基本功能验证，不评估Feature Enable/FST/PVT的高级特性
- Feature Enable阶段：验证各项特性功能完整性
- FST阶段：全速/全压力测试
- PVT阶段：量产验证，CPK/良率/一致性
- 风险与建议中自动标注"后续阶段"关注点
- 评估标题带阶段标识：如"🔍 专家评估 (LLM) — BringUp阶段"

**LLM 智能分类替代关键词匹配**
- Test Plan 描述生成中的分类逻辑从硬编码关键词匹配改为 LLM 动态分类
- 旧方式：前端按 planSummary 关键词（ethernet/board/hbm/默认）选择固定分类数组，逐条匹配 task 文本
- 新方式：调用后端 `mode: 'categorize'` 接口，LLM 根据 Test Plan 名称 + 所有 sub-task 内容自动判断测试计划类型并按该领域专业维度分类
- 分类准确度大幅提升，不再受限于预定义关键词覆盖率
- 分类结果自动格式化为 JIRA wiki markup 表格（含类别名、用例数、描述）
- 专家评估阶段的分类复盘逻辑同步优化：分类修正直接反映在描述中，评估文本仅保留专业分析部分

**批量新建 Sub Test Plan**
- "新建Sub Test Plan" 和 "批量新建Sub Test Plan" 按钮均弹出 dialog 填写负责人和组件
- 命令格式灵活：用户可自由输入数量（如"创建3个sub test plan"）
- 前端后处理：命令含 "sub test plan" 时自动修正 issuetype 为 "Test Plan"
- 组件 fallback：LLM 未返回组件时从命令文本提取

**三层递归层级支持**
- Test Case 库支持3层递归遍历：父Plan → L1链接Plan → L2链接Plan → sub-task
- "关联的 Sub-Test Plans"只显示L1链接Plan（带层级缩进）
- Total case统计遍历3层所有sub-task（去重，排除父自身循环）

**流程简化**
- `generateAndUploadDescription()` 重构：先分类（LLM categorize），再评估（LLM evaluate），最后写回 JIRA
- 移除了旧版本中的冗余 promise chain 和不可达代码
- 前端版本 v74

### v1.5.0 (2026-06-25)
基于 v1.2.0 新增以下功能：

**状态批量修改**
- 点击 Sub-task 状态列可直接修改（下拉选择目标状态）
- 支持勾选多个 Sub-task 批量修改状态，自动获取共同可用的 transitions
- 批量操作栏：选择目标状态 → 应用 → 保存到 JIRA

**LLM 批处理并行优化**
- 描述生成改为分批处理（每批30个 task），2路并行（Promise.all）
- 46个 task 从 ~315秒降至 ~150秒，150个 task 约7-8分钟
- 每批独立超时5分钟，总超时10分钟
- prompt 精简：去掉 status/priority 字段，减少 input tokens

**LLM 评估分类逻辑（动态识别）**
- LLM 根据 Test Plan 名称和 sub-task 内容自动判断测试计划类型
- 按该类型的专业维度分类，不强制固定分类
- HBM测试→HBM专业维度（初始化/通道读写/PHY训练/UCIe互联等）
- Ethernet测试→以太网维度（PHY/PCS/PMA/链路/协议等）
- PCIe测试→PCIe维度（link up/speed/width切换/PHY FW/ECAM/BAR等）
- UCIe测试→UCIe维度（链路建立/D2D读写/HSDCL/IODCL/IOUCIE等）
- Board测试→板级维度（外观/时钟/阻抗/电源/接口/复位等）
- FW测试→固件维度（BootROM/PCIe/UCIe/PMIC/Mailbox等）
- Tool/JTAG测试→调试维度（JTAG链路/边界扫描/调试端口/Flash编程等）
- KMD测试→内核驱动维度（设备初始化/内存管理/中断处理/Power Management等）
- UMD测试→用户驱动维度（API调用/Context管理/Command Queue/内存分配等）
- Diag测试→芯片诊断维度（自检流程/错误注入/故障定位/日志分析等）
- IODIE测试→IO Die维度（IODCL链路/IOUCIE/信号完整性/Eye Diagram等）
- BBV测试→板级上电验证维度（Board Bring-up Verification：电源/时钟/复位信号验证/芯片基本功能检查等）
- 分类复盘：LLM评估时自动检查分类准确性，指出错误并给出修正建议

**预估耗时显示**
- LLM 处理前显示预估耗时（基于 batch 数 × 并行度）
- 计时从 LLM 实际开始算起，未响应前显示"等待LLM响应..."
- 两处 fetch 均添加 content-type 检查，防止超时后 HTML 解析失败

**描述增强保护**
- 上传sub-task时LLM增强：有原始描述→保留原内容+追加LLM增强（不替换）
- 无描述→LLM生成完整描述

**增量评估（不覆盖历史）**
- 同一Test Plan再次上传新sub-task时，保留已有LLM评估
- 已有评估作为上下文传入LLM，结合新旧sub-task生成更新后的综合评估
- 不会覆盖之前的评估内容
- 描述分类结构保留：已有分类不变，只对新增sub-task分类并插入

**组件Filter全量显示**
- 组件筛选下拉框显示项目所有JIRA组件（不再仅显示已使用的）
- 批量创建对话框的组件下拉也从JIRA API获取全量组件

**界面优化**
- Sub-Test Plans 显示 "Total x cases"（去掉 Opened 状态）
- 组件分布柱状图顶部显示 "已完成/总数" 数值标签
- Nginx proxy_read_timeout 从 180s 提升至 900s
- 修复 uploadAiResults 未映射 components 字段导致 sub-task 组件为空
- 修复 transitions API 响应格式不匹配（前端 data.data vs 后端 data.data.transitions）

### v1.2.0 (2026-06-24)
基于 v1.0.0 新增以下功能：
- **LLM描述增强优化**：保留原始描述，补充测试目的和期望预期
- **智能分类**：根据 Test Plan 类型（Ethernet/HBM/PCIe）自动选择分类关键词
- **执行日期批量设置**：覆盖 Sub Test Plan 及其下所有 Sub-task
- **每日执行趋势**：统计执行日期范围内每天验证完成的测试用例数量和进度百分比
- **服务器稳定性**：全局错误处理、JSON body限制提升至5MB、LLM响应解析优化

### v1.0.0 (2026-06-23)
- Test Case 库浏览（项目选择 → Test Plan → Sub-task 详情）
- KPI 统计仪表板 + Chart.js 可视化
- 批量上传（自然语言 AI 创建 + CSV 模板上传）
- LLM 智能评估（Test Plan 描述生成 + Sub-task 描述增强）
- 描述保护机制（保留已上传的原始内容）
- 实时耗时反馈
- 批量设置执行日期（Actual Start/End Date）
- 多用户管理 + JIRA PAT 独立配置
- 并行 JIRA 写入优化（5并发）
- PM2 + Nginx 部署方案

## License

Internal use only.
