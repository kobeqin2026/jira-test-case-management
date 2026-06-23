# JIRA Test Case Manager

JIRA 测试用例管理系统 — Test Plan / Task / Sub-task 全生命周期管理与统计平台。

## 功能概览

### 📋 Test Case 库（浏览模式）
- **项目选择**：从100+个JIRA项目中选择目标项目
- **Test Plan 浏览**：以卡片网格展示所有 Test Plan，显示状态、子任务数、组件等
- **Sub-task 详情**：点击 Test Plan 查看所有关联的 Sub-task，支持状态筛选和组件分布图表
- **KPI 统计**：总用例数、进行中、已完成、阻塞等关键指标实时展示
- **Chart.js 可视化**：组件分布饼图 + 状态分布柱状图
- **设置执行日期**：为 Test Plan 及所有 Sub-task 批量设置 Actual Start Date / End Date

### 📤 批量上传（上传模式）
- **自然语言创建**：通过 AI 对话式输入，自动解析为 JIRA Test Plan 和 Sub-task
  - 支持创建 Test Plan、Sub Test Plan、Sub-task
  - 支持设置负责人（Assignee）、优先级、标签
  - 支持批量创建（如"创建3个sub test plan"）
- **CSV 模板批量上传**：下载 CSV 模板 → 填写测试用例 → 一键批量创建到 JIRA
- **AI 智能解析**：支持自然语言指令（如"在当前Test Plan下创建测试用例,负责人为xxx"）

### 🧠 LLM 智能评估
- **Test Plan 描述生成**：LLM 根据所有 Sub-task 自动生成 Test Plan 的专业描述
- **Sub-task 描述增强**：对已有描述的 Sub-task，LLM 以硬件测试专家身份进行补充增强
- **描述保护机制**：仅对无描述的 Sub-task 生成新描述，保留已上传的原始内容
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
BAILIAN_API_KEY=your_llm_api_key
BAILIAN_BASE_URL=https://your-llm-endpoint/v1
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
│       └── testcase-upload.js          # 前端核心逻辑（~2700行）
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

### v1.0.0 (2026-06-23)
- ✅ Test Case 库浏览（项目选择 → Test Plan → Sub-task 详情）
- ✅ KPI 统计仪表板（总计/进行中/已完成/阻塞）
- ✅ Chart.js 组件分布饼图 + 状态分布柱状图
- ✅ 批量上传（自然语言 AI 创建 + CSV 模板上传）
- ✅ LLM 智能评估（Test Plan 描述生成 + Sub-task 描述增强）
- ✅ 描述保护机制（保留已上传的原始内容）
- ✅ 实时耗时反馈（评估进度 + 完成耗时显示）
- ✅ 批量设置执行日期（Actual Start/End Date）
- ✅ 多用户管理 + JIRA PAT 独立配置
- ✅ 并行 JIRA 写入优化（5并发）
- ✅ PM2 + Nginx 部署方案

## License

Internal use only.
