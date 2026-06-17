# JIRA Test Case Management v0.5

JIRA 测试用例管理平台 — Test Plan / Task → Sub-task 状态管理与统计

## 功能概览

### 1. 三步工作流

1. **选择项目** — 下拉选择 JIRA 项目（如 BR200）
2. **选择 Test Plan / Task** — 卡片式选择，支持搜索过滤
3. **KPI + 详情** — 完整的状态统计与操作面板

选择项目和 Test Plan 后，步骤区域自动隐藏，顶部面包屑显示当前 Plan 名称及状态。

### 2. KPI 统计面板

| 指标 | 说明 |
|------|------|
| 总 Test Case | 所有 Sub-task 总数 |
| 完成率 | (done + closed + validated) / total × 100% |
| 高优先级完成率 | 已完成 Highest / Total Highest × 100% |
| 已完成 | done + closed + validated 总数 |
| 高优先级 | Highest 优先级总数 |

### 3. 状态分布（Chart.js Doughnut）

- 使用 Chart.js 环形图展示各状态占比
- 图表内显示状态名 + 百分比
- 颜色按状态类别自动匹配：灰色(待处理)、蓝色(进行中)、绿色(已验证)、红色(已阻塞) 等
- 底部图例显示实际 JIRA 状态名

### 4. 组件分布（Chart.js Stacked Bar）

- 竖状堆叠柱状图展示各组件的完成情况
- 绿色 = 已完成，灰色 = 未完成
- 柱内显示数量

### 5. 负责人分布（Vertical Stacked Bar）

- 按负责人展示状态分布
- 每个负责人的柱状图按状态堆叠
- 底部图例

### 6. Test Cases 详情表

#### 筛选
- **状态筛选** — 下拉选择，自动填充所有状态 + 数量
- **负责人筛选** — 下拉选择，自动填充所有负责人 + 数量
- **组件筛选** — 下拉选择，自动填充所有组件 + 数量
- **搜索** — 按 Key 或标题模糊搜索
- 筛选结果计数显示

#### 排序
- 点击列头排序（Key、标题、状态、负责人、组件、优先级、创建时间）
- 升序 / 降序切换
- 优先级按 Highest > High > Medium > Low > Lowest 排序

#### 批量修改
- 复选框选择（全选 / 单选）
- 选中后显示批量操作栏
- 自动获取已选项目的共同可用状态转换
- 批量设置目标状态 → 加入待保存队列
- 与现有「保存到JIRA」流程集成

#### 单项修改
- 点击状态单元格，弹出状态下拉框
- 选择目标状态后显示 `当前 → 目标` 预览
- 多个修改可同时保存

### 7. 批量上传（Tab 2）

- CSV 文件拖拽上传
- 数据预览 + 双击编辑
- 批量创建 JIRA Issue
- 进度条 + 日志
- 支持关联 Test Plan / Task

### 8. 自动关闭

所有 Sub-task 状态为 Validated 时，自动关闭父 Test Plan。

## 技术栈

- **前端**: 纯 HTML + CSS + JavaScript（无框架依赖）
- **图表**: Chart.js 4.4.7（Doughnut + Bar）
- **后端**: Node.js + Express（gpu-tracker 服务）
- **认证**: JWT Token（独立认证系统）
- **部署**: nginx 反向代理 + PM2 进程管理

## 部署

```bash
# 前端文件
sudo cp jira-test-case-management.html /var/www/gpu-tracker/
sudo cp js/testcase-upload.js /var/www/gpu-tracker/js/

# 后端路由修改后
pm2 restart gpu-tracker
```

## 文件结构

```
├── jira-test-case-management.html   # 主页面
├── js/
│   └── testcase-upload.js           # 前端逻辑
└── README.md
```

## 版本历史

### v0.5 (2026-06-17)
- 三步工作流 + 面包屑导航
- KPI 统计面板（完成率、高优先级完成率等）
- 状态分布 Chart.js Doughnut 图表
- 组件分布堆叠柱状图
- 负责人分布堆叠柱状图
- 详情表筛选（状态、负责人、组件、搜索）
- 详情表排序（所有列）
- 批量修改状态
- 批量上传 Test Case
- 自动关闭 Test Plan
