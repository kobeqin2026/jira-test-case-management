# JIRA Test Case Manager

JIRA 测试用例管理系统 — Test Plan / Task / Sub-task 全生命周期管理与统计平台。

## 功能概览

### 📋 Test Case 库（浏览模式）
- **项目选择**：从100+个JIRA项目中选择目标项目
- **Test Plan 浏览**：以卡片网格展示所有 Test Plan，显示状态、子任务数、组件等
- **Sub-task 详情**：点击 Test Plan 查看所有关联的 Sub-task，支持状态筛选和组件分布图表
- **KPI 统计**：总用例数、进行中、已完成、阻塞等关键指标实时展示
- **Chart.js 可视化**：组件分布饼图 + 状态分布柱状图
- **设置执行日期**：为 Test Plan 及所有 Sub-task（包括 Sub Test Plan 下的 Sub-task）批量设置 Actual Start Date / End Date
- **每日执行趋势**：统计执行日期范围内每天验证完成的测试用例数量，显示整体进度百分比

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
JIRA_BASE_URL=https://jira01.birentech.com
JIRA_PAT=your_jira_pat_here

# LLM 配置
BAILIAN_API_KEY=your_api_key_here
BAILIAN_BASE_URL=https://aiapiidc.birentech.com/v1
BAILIAN_MODEL=br-qwen3

# 系统配置
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_USER_PASSWORD=user123
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
```nginx
server {
    listen 8089;
    server_name your-server;

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
│   └── testcase.js           # 核心业务路由（Test Plan/Sub-task/LLM评估）
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
│       └── testcase-upload.js          # 前端核心逻辑（~2800行）
├── deploy.sh                 # 部署脚本
└── data/                     # 运行时数据（不纳入版本管理）
    ├── sessions.json
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

### LLM 智能功能
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/testcase/testplan/llm-evaluate` | LLM 生成/增强 Test Plan 描述 |
| POST | `/api/testcase/ai-parse` | AI 自然语言解析为 JIRA 操作 |
| GET | `/api/testcase/template` | 下载 CSV 上传模板 |

## 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

## 版本历史

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
