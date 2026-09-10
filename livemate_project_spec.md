# 播伴（livemate）：项目实施与验收规格

> 文档用途：直接交给 Codex 作为项目开发、重构、测试与验收依据。  
> 软件名称：**播伴**  
> 英文工程名：**livemate**  
> GitHub 仓库：`livemate`  
> 可执行文件：`livemate`  
> App ID：`cn.cbowen.livemate`  
> 数据目录：`<UserConfigDir>/livemate/`  
> SQLite 数据库：`livemate.db`  
> 产品定位：**主播运营管理与 AI 辅助工具**  
> 一句话描述：**记录主播数据、复盘问题、跟进方案，并通过 AI 辅助运营决策。**  
> 项目定位：面向直播运营人员的本地桌面端主播管理工具，用于主播档案、直播数据、运营复盘、问题、改进方案、跟进、阶段目标和关键事件的统一管理。  
> 核心原则：**优先记录有效事实，不做为了“看起来专业”而存在的无意义评分体系。**

---

# 0. 产品基础信息

以下信息已经确定，后续开发、打包、日志、数据目录、README、About 页面和安装器均应统一使用，不得自行更名。

| 项目 | 确定内容 |
|---|---|
| 软件中文名 | **播伴** |
| 英文工程名 | **livemate** |
| GitHub 仓库名 | `livemate` |
| 可执行文件名 | `livemate` |
| App ID | `cn.cbowen.livemate` |
| 用户数据目录 | `<UserConfigDir>/livemate/` |
| SQLite 数据库 | `livemate.db` |
| 产品类型 | 本地桌面直播运营管理工具 |
| 产品定位 | 主播运营管理与 AI 辅助工具 |
| 目标用户 | 主播运营、直播运营负责人 |
| 第一阶段场景 | 娱乐直播主播运营 |
| 核心对象 | 主播 |
| 核心业务链路 | 数据 → 复盘 → 问题 → 方案 → 跟进 → 结果 |
| 数据原则 | 客观事实优先，减少无意义评级 |
| 主播分层 | 阶段、关注等级、状态 |
| 桌面平台 | Windows + macOS |
| 桌面框架 | Wails 3 |
| 后端 | Go |
| 前端 | React + TypeScript |
| UI | react-desktop-shell |
| 状态管理 | Zustand |
| 数据库 | SQLite |
| AI | MVP 后续加入，架构允许扩展 |
| 云同步 | MVP 不做 |
| 平台自动抓数 | MVP 不做 |

产品一句话描述：

> **记录主播数据、复盘问题、跟进方案，并通过 AI 辅助运营决策。**

命名约束：

```text
产品显示名称：播伴
工程名称：livemate
仓库：hicbowen/livemate
可执行文件：livemate
App ID：cn.cbowen.livemate
数据目录：<UserConfigDir>/livemate/
数据库：livemate.db
```

后续出现以下旧占位命名时，应视为错误并统一修改：

```text
LiveOps
LiveOpsDesk
liveops
liveops-desk
```

Logo 暂不在 MVP 阶段实现，但品牌方向应围绕：

```text
直播
陪伴 / 辅助
运营
数据
AI
```

避免将 Logo 单纯设计成“麦克风”或“播放按钮”，以免产品被误解为开播工具或直播客户端。

---

# 1. 项目目标

开发一款类似 FlowGo 工作方式的桌面端直播运营管理工具。

软件不是通用 CRM，也不是直播数据大屏，而是围绕运营人员的实际日常工作流设计：

1. 建立主播档案。
2. 持续记录主播每场直播的客观数据。
3. 记录运营复盘中真实观察到的问题。
4. 将问题拆分为多个独立改进方案。
5. 持续记录方案的执行情况和实施效果。
6. 管理主播当前阶段目标。
7. 使用时间线记录影响数据变化的重要事件。
8. 根据真实数据生成趋势、提醒和运营关注项。
9. 后续可扩展 AI 分析，但第一阶段不依赖 AI 完成核心业务闭环。

核心业务闭环：

```text
主播
  ↓
直播场次
  ↓
运营复盘
  ↓
发现问题
  ↓
建立一个或多个改进方案
  ↓
持续跟进
  ↓
记录效果
  ↓
解决 / 调整 / 终止方案
```

---

# 2. 产品设计原则

## 2.1 事实记录优先

优先保存以下类型的信息：

- 直播实际数据。
- 运营实际观察。
- 具体问题。
- 问题依据。
- 原因判断。
- 实际采取的改进措施。
- 是否执行。
- 执行后发生了什么变化。
- 是否达到目标。
- 后续应该继续、调整还是终止。

禁止第一版加入大量主观打分，例如：

- 镜头感 1～5 分。
- 互动能力 1～5 分。
- 情绪价值 1～5 分。
- 话术能力 1～5 分。
- PK 能力 1～5 分。
- 执行力 1～5 分。

除非后续真实业务证明某一评分有明确用途，否则不增加。

---

## 2.2 只保留有实际运营用途的分层

第一版允许保留：

### 主播阶段

```text
新人
培养期
成长期
稳定期
核心期
暂停
已离开
```

要求：

- 用于表达主播当前生命周期。
- 可人工修改。
- 必须记录最后修改时间。

### 关注等级

```text
正常
重点关注
紧急
```

用途：

- 决定运营人员今天优先看谁。
- 不代表主播能力等级。
- 不作为主播价值评分。
- 首页可按关注等级排序。

### 主播状态

```text
正常开播
短暂停播
长期停播
待开播
已离开
```

以上三个字段不能合并。

---

## 2.3 客观指标优先计算，不重复手填

任何能够通过原始数据计算得到的指标，都由程序自动计算。

例如：

```text
直播时长
时均流水
涨粉效率
千场观涨粉
付费率
互动率
7 日平均值
7 日环比
30 日趋势
```

数据库优先保存原始数据。

计算指标可实时计算，也可通过统计快照缓存，但不能要求用户重复手填。

---

# 3. 技术方案

## 3.1 固定技术栈

桌面框架：

```text
Wails 3
```

后端：

```text
Go
```

前端：

```text
React
TypeScript
Vite
```

UI 组件：

```text
react-desktop-shell
```

状态管理：

```text
Zustand
```

业务数据存储：

```text
SQLite
```

---

## 3.2 架构原则

参考 FlowGo 的领域组织方式，推荐：

```text
.
├── main.go
├── build/
├── scripts/
├── internal/
│   ├── application/
│   │   ├── anchor/
│   │   ├── live/
│   │   ├── review/
│   │   ├── issue/
│   │   ├── improvement/
│   │   ├── goal/
│   │   ├── event/
│   │   ├── dashboard/
│   │   └── app/
│   │
│   ├── domain/
│   │   ├── anchor/
│   │   ├── live/
│   │   ├── review/
│   │   ├── issue/
│   │   ├── improvement/
│   │   ├── goal/
│   │   └── event/
│   │
│   ├── infrastructure/
│   │   └── sqlite/
│   │
│   ├── config/
│   ├── bridge/
│   │   └── wails/
│   ├── platform/
│   └── buildinfo/
│
└── frontend/
    ├── src/
    │   ├── features/
    │   │   ├── dashboard/
    │   │   ├── anchors/
    │   │   ├── anchor-detail/
    │   │   ├── live-sessions/
    │   │   ├── reviews/
    │   │   ├── issues/
    │   │   ├── improvement-plans/
    │   │   ├── goals/
    │   │   └── settings/
    │   │
    │   ├── components/
    │   ├── services/
    │   │   └── api/
    │   ├── store/
    │   ├── types/
    │   └── utils/
    │
    └── bindings/
```

要求：

- domain 只存领域模型和纯业务规则。
- application 负责编排业务用例。
- infrastructure/sqlite 负责数据库实现。
- bridge/wails 只作为 Wails 暴露层。
- 前端页面不能直接操作 SQLite。
- React 只能通过 Wails binding 调用 Go application service。

---

# 4. 数据目录与持久化要求

## 4.1 数据不能保存在安装目录

必须使用：

```go
os.UserConfigDir()
```

确定用户配置目录。

示意实现：

```go
func DataDir() (string, error) {
    base, err := os.UserConfigDir()
    if err != nil {
        return "", err
    }

    dir := filepath.Join(base, "livemate")

    if err := os.MkdirAll(dir, 0755); err != nil {
        return "", err
    }

    return dir, nil
}
```

产品名称已确定为“播伴”，工程标识统一使用 `livemate`，后续实施不得再使用临时占位名。

典型路径：

Windows：

```text
%AppData%\livemate\
```

macOS：

```text
~/Library/Application Support/livemate/
```

Linux：

```text
~/.config/livemate/
```

---

## 4.2 数据文件

建议：

```text
livemate/
├── livemate.db
├── config.json
├── logs/
└── backups/
```

核心数据必须进入：

```text
livemate.db
```

不得将主播业务数据主要保存到：

```text
localStorage
sessionStorage
安装目录 JSON
前端静态资源目录
```

---

## 4.3 Zustand 的职责

Zustand 只负责前端运行时状态，例如：

- 当前选中的主播。
- 页面筛选条件。
- 当前排序方式。
- Drawer / Dialog 状态。
- Dashboard 临时数据。
- 当前页面缓存。
- 列表加载状态。

核心业务数据以 SQLite 为唯一事实来源。

禁止：

```text
SQLite 一份
Zustand persist 一份
localStorage 再一份
```

造成多份业务状态源。

---

# 5. 核心数据模型

第一版核心领域模型：

```text
Anchor
LiveSession
OperationReview
AnchorIssue
ImprovementPlan
PlanFollowup
StageGoal
AnchorEvent
AnchorTag
```

---

# 6. Anchor：主播档案

表名：

```text
anchors
```

建议字段：

```text
id
name
nickname
platform
platform_uid
account_name
category
gender
age
joined_at
operator_name
stage
attention_level
status
notes
created_at
updated_at
deleted_at
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---:|---|
| id | 是 | 主键 |
| name | 否 | 真实姓名 |
| nickname | 是 | 主播昵称 |
| platform | 是 | 抖音 / 快手 / 视频号等 |
| platform_uid | 否 | 平台 UID |
| account_name | 否 | 直播账号 |
| category | 否 | 聊天 / 舞蹈 / 才艺等 |
| gender | 否 | 可空 |
| age | 否 | 可空 |
| joined_at | 否 | 入职 / 签约时间 |
| operator_name | 否 | 当前运营负责人 |
| stage | 是 | 生命周期阶段 |
| attention_level | 是 | 关注等级 |
| status | 是 | 当前状态 |
| notes | 否 | 其他长期备注 |
| created_at | 是 | 创建时间 |
| updated_at | 是 | 更新时间 |
| deleted_at | 否 | 软删除 |

要求：

- 删除主播默认采用软删除。
- 已删除主播不得出现在默认列表。
- 历史场次、复盘、问题、方案、跟进不得因为主播软删除被物理删除。

---

# 7. AnchorTag：标签

表名：

```text
anchor_tags
```

建议字段：

```text
id
anchor_id
name
created_at
```

标签强调快速检索，不作为严谨评级。

示例：

```text
新人
高潜
互动型
才艺型
稳定开播
需关注留存
近期状态波动
```

要求：

- 支持一个主播多个标签。
- 标签支持筛选。
- 标签名支持复用。
- 不做复杂标签树。

---

# 8. LiveSession：直播场次

表名：

```text
live_sessions
```

每开播一次建立一条记录。

建议字段：

```text
id
anchor_id

session_date
started_at
ended_at
duration_minutes

views
peak_online
avg_online
avg_stay_seconds

likes
comments
comment_users
shares

followers_before
followers_after
followers_gained

revenue
payer_count
gift_user_count

pk_count
pk_win_count
pk_revenue

operator_name

is_abnormal
abnormal_note

source
notes

created_at
updated_at
```

字段规则：

### 直播时长

优先根据：

```text
ended_at - started_at
```

自动计算。

允许特殊情况人工覆盖，但必须记录最终值。

### 新增粉丝

自动计算：

```text
followers_after - followers_before
```

如果只拿到平台的新增粉丝数据，可以直接填写 `followers_gained`。

### 流水

统一使用同一业务口径。

第一版不处理复杂币种换算。

### 可空原则

平台拿不到的数据允许为空。

禁止为了“字段完整”而填写 0。

`NULL` 表示未知。

`0` 表示确认数据为 0。

两者必须区分。

---

# 9. 自动计算指标

以下指标不得要求用户手填。

## 9.1 时均流水

```text
revenue_per_hour =
revenue / duration_hours
```

## 9.2 涨粉效率

```text
followers_per_hour =
followers_gained / duration_hours
```

## 9.3 千场观涨粉

```text
followers_per_1000_views =
followers_gained / views * 1000
```

## 9.4 付费率

```text
payer_rate =
payer_count / views
```

## 9.5 评论参与率

```text
comment_user_rate =
comment_users / views
```

## 9.6 PK 胜率

```text
pk_win_rate =
pk_win_count / pk_count
```

要求：

- 分母为 0 时返回空值，不返回 Infinity / NaN。
- Dashboard 和主播详情页统一使用同一套 Go 端统计逻辑。
- 不允许前后端各实现一套不同公式。

---

# 10. OperationReview：运营复盘

表名：

```text
operation_reviews
```

用途：

记录运营人员针对某场直播或某一天的实际观察。

建议字段：

```text
id
anchor_id
live_session_id

review_date

summary
strengths
observations
conclusion

created_at
updated_at
```

字段含义：

### summary

对本次直播的整体简短总结。

### strengths

只记录有价值的优势事实。

示例：

```text
熟客互动稳定，新人进入时主动接话明显比前几场自然。
```

### observations

记录观察到的事实。

示例：

```text
20:30 左右在线达到 56 后开始连续 PK，
20 分钟内平均在线下降到 31。
```

### conclusion

复盘后的整体判断。

示例：

```text
目前主要问题不是进人，而是在线起来后缺乏承接。
```

运营复盘本身不负责维护改进方案。

复盘可以产生：

```text
0 ～ N 个问题
```

---

# 11. AnchorIssue：问题记录

表名：

```text
anchor_issues
```

问题必须成为独立实体。

建议字段：

```text
id
anchor_id
review_id

title
category

description
evidence
cause_hypothesis

priority
status

discovered_at
resolved_at

created_at
updated_at
```

---

## 11.1 category

建议内置：

```text
留存
互动
涨粉
流水
转化
开场
内容
PK
话术
直播节奏
开播稳定性
主播状态
设备
违规
其他
```

允许以后扩展。

---

## 11.2 priority

只保留实际工作需要的优先级：

```text
普通
重点
紧急
```

这不是能力评分。

---

## 11.3 status

```text
待处理
处理中
观察中
已解决
已关闭
```

---

## 11.4 evidence

问题必须尽可能记录依据。

例如：

```text
最近 3 场平均停留时间：
52s → 44s → 36s

本场在线人数达到 60 后，
15 分钟内下降到 32。
```

允许纯文字，也允许引用场次指标。

---

## 11.5 cause_hypothesis

这是运营人员当前的原因判断，不是真理。

例如：

```text
怀疑主要原因是高在线阶段连续 PK，
导致新进入用户没有得到承接。
```

后续允许修改。

---

# 12. ImprovementPlan：改进方案

表名：

```text
improvement_plans
```

一个问题允许创建多个独立方案。

关系：

```text
AnchorIssue 1
  ↓
ImprovementPlan N
```

建议字段：

```text
id
anchor_id
issue_id

title
objective
actions

metric_name
baseline_value
target_value
metric_unit

start_date
expected_end_date

priority
status

result_summary

created_at
updated_at
completed_at
```

---

## 12.1 objective

描述这个方案想解决什么。

例如：

```text
提升新用户进入直播间后的 1 分钟留存。
```

---

## 12.2 actions

必须是具体可执行动作。

错误：

```text
提高互动能力
加强直播效果
优化直播
```

正确：

```text
1. 开播前 10 分钟不主动发起 PK。
2. 新用户进入后优先进行名字互动。
3. 在线超过 40 后至少维持 5 分钟聊天承接。
```

第一版可用 Markdown / 多行文本保存。

---

## 12.3 目标指标

允许绑定一个主要目标指标：

```text
metric_name
baseline_value
target_value
metric_unit
```

示例：

```text
metric_name: avg_stay_seconds
baseline_value: 42
target_value: 60
metric_unit: seconds
```

指标不是必填。

有些运营方案无法直接用单个数字衡量。

---

## 12.4 status

```text
待执行
执行中
观察中
已验证有效
无效
已终止
```

---

# 13. PlanFollowup：方案跟进

表名：

```text
plan_followups
```

每次检查方案执行效果时建立一条记录。

建议字段：

```text
id
plan_id
anchor_id
live_session_id

followup_date

execution_status
execution_note

metric_value
metric_change

effect
effect_note

next_action

created_at
updated_at
```

---

## 13.1 execution_status

```text
未执行
部分执行
完整执行
无法执行
```

---

## 13.2 effect

只保留简单有效判断：

```text
暂不判断
有效
部分有效
无明显变化
变差
```

不要设计 1～10 分。

---

## 13.3 next_action

```text
继续
调整方案
结束方案
新增方案
继续观察
```

---

## 13.4 跟进示例

```text
日期：
2026-09-12

执行：
完整执行

执行情况：
前 15 分钟未进行 PK，新人进入后基本都进行了主动互动。

指标：
平均停留 57 秒

实施前：
42 秒

效果：
部分有效

下一步：
继续观察

备注：
在线人数提升后仍容易切换到 PK，
下一场继续测试高在线阶段的承接。
```

---

# 14. StageGoal：阶段目标

表名：

```text
stage_goals
```

阶段目标不是问题，也不是改进方案。

作用：

描述接下来一段时间主播整体要做到什么。

建议字段：

```text
id
anchor_id

title
start_date
end_date

description

status

created_at
updated_at
```

状态：

```text
进行中
已完成
已取消
```

---

# 15. GoalMetric：阶段目标指标

如果需要，一个阶段目标允许绑定多个指标。

表名：

```text
goal_metrics
```

字段：

```text
id
goal_id

metric_name
baseline_value
target_value
metric_unit

created_at
```

例如：

```text
平均在线：35 → 50
平均停留：42s → 60s
日均新增粉丝：20 → 35
```

---

# 16. AnchorEvent：关键事件

表名：

```text
anchor_events
```

用途：

记录可能解释数据变化的重要事情。

建议字段：

```text
id
anchor_id

event_date
event_type
title
content

live_session_id

created_at
updated_at
```

建议事件类型：

```text
更换直播时间
调整直播内容
更换运营
停播
恢复开播
违规
设备变化
账号变化
活动
合作
主播个人状态
其他
```

示例：

```text
2026-09-20
调整直播赛道
从纯聊天调整为舞蹈 + 聊天。
```

要求：

- 主播详情页趋势图应支持显示事件标记。
- 主播详情页应提供独立时间线。

---

# 17. 数据关系

完整关系：

```text
Anchor
│
├── AnchorTag
│
├── LiveSession
│
├── OperationReview
│    └── AnchorIssue
│         └── ImprovementPlan
│              └── PlanFollowup
│
├── StageGoal
│    └── GoalMetric
│
└── AnchorEvent
```

注意：

一个问题可有多个方案：

```text
Issue
├── Plan A
│   ├── Followup 1
│   └── Followup 2
│
└── Plan B
    ├── Followup 1
    └── Followup 2
```

---

# 18. SQLite 数据库要求

必须使用 migration。

推荐：

```text
schema_migrations
```

禁止依赖应用启动时无版本判断地反复执行：

```sql
CREATE TABLE IF NOT EXISTS ...
```

作为长期迁移方案。

第一版至少包含：

```text
001_initial_schema.sql
```

后续：

```text
002_xxx.sql
003_xxx.sql
```

---

## 18.1 外键

开启：

```sql
PRAGMA foreign_keys = ON;
```

合理设置外键。

主播采用软删除后：

- 不级联删除历史业务数据。
- 删除主播只修改 `deleted_at`。

---

## 18.2 时间字段

统一使用可排序、无歧义的时间格式。

建议 SQLite 保存：

```text
RFC3339
```

例如：

```text
2026-09-10T18:30:00+08:00
```

日期型字段可保存：

```text
2026-09-10
```

---

## 18.3 金额

禁止直接使用 float 作为高精度财务数据库设计。

如果直播平台数据本身以元为单位且允许两位小数，推荐：

```text
revenue_cents INTEGER
```

单位：

```text
分
```

前端统一格式化为元。

如果业务平台实际使用其他单位，应抽象转换层。

---

# 19. 首页 Dashboard

首页目标：

用户打开软件后，10 秒内知道今天应该关注什么。

第一版首页包含：

## 今日概览

```text
当前主播总数
今天已开播人数
今天未开播人数
今日总直播时长
今日总流水
今日新增粉丝
```

## 重点关注

优先展示：

```text
紧急
重点关注
```

主播。

每项显示：

```text
昵称
当前阶段
关注原因
最近直播时间
最近 3 场核心变化
```

## 待处理问题

显示：

```text
重点 / 紧急
且状态不为已解决 / 已关闭
```

的问题。

## 正在执行的改进方案

显示：

```text
执行中
观察中
```

的方案。

包含：

```text
主播
方案
已经执行多久
最近一次跟进
目标指标当前值
```

## 长时间未跟进

自动计算：

```text
执行中方案超过 N 天没有 followup
```

默认：

```text
3 天
```

允许后续在设置中修改。

---

# 20. 主播列表页

列表默认字段：

```text
昵称
平台
赛道
阶段
关注等级
状态
最近开播
近 7 日直播时长
近 7 日流水
近 7 日新增粉丝
待处理问题
执行中方案
```

支持：

```text
搜索
阶段筛选
状态筛选
关注等级筛选
标签筛选
排序
```

默认排序建议：

```text
关注等级 DESC
最近活动时间 DESC
```

禁止为了展示而塞入大量列。

---

# 21. 主播详情页

这是核心页面。

推荐布局：

```text
主播头部信息

概览
直播记录
复盘
问题
改进方案
阶段目标
时间线
```

---

## 21.1 概览

显示：

```text
当前阶段
关注等级
当前状态
当前阶段目标
待处理问题
执行中方案
最近直播
```

趋势图：

```text
直播时长
平均在线
平均停留
新增粉丝
流水
```

支持：

```text
7 天
30 天
自定义
```

禁止第一版加入几十张图。

---

## 21.2 直播记录

列表：

```text
日期
开播时间
直播时长
场观
平均在线
平均停留
新增粉丝
流水
```

点击进入场次详情。

允许：

```text
新增
编辑
删除
复制上一场部分数据结构
```

---

## 21.3 复盘

以时间倒序显示。

每条：

```text
日期
对应场次
整体总结
观察
结论
产生的问题
```

支持：

```text
新建问题
```

---

## 21.4 问题

分组：

```text
待处理
处理中
观察中
已解决
已关闭
```

每条问题显示：

```text
标题
分类
优先级
发现日期
依据
方案数量
当前状态
```

---

## 21.5 改进方案

显示：

```text
方案标题
针对问题
目标
当前状态
开始时间
目标指标
最近跟进
```

点击进入：

```text
方案详情
+
完整跟进时间线
```

---

## 21.6 阶段目标

显示当前进行中的阶段目标。

历史目标可展开查看。

---

## 21.7 时间线

合并展示：

```text
关键事件
直播记录
复盘
问题创建
方案开始
方案状态变化
重要跟进
阶段目标变化
```

支持按类型筛选。

---

# 22. 问题详情页

必须展示：

```text
问题标题
主播
分类
优先级
状态
发现日期
问题描述
问题依据
原因判断
关联复盘
关联直播
```

下面显示：

```text
改进方案列表
```

支持直接：

```text
新建方案
```

---

# 23. 改进方案详情页

必须展示：

```text
方案标题
主播
关联问题
方案目标
具体行动
状态
开始时间
预计结束时间
目标指标
基准值
目标值
```

重点区域：

```text
跟进时间线
```

每次跟进显示：

```text
日期
执行情况
本次指标
相对基准变化
效果判断
后续动作
备注
```

提供：

```text
新增跟进
调整方案
结束方案
标记有效
标记无效
```

---

# 24. 快速录入

运营工具必须降低录入成本。

第一版至少支持：

## 快速新增直播记录

从主播详情页直接打开。

默认：

```text
anchor_id
session_date = 今天
```

## 从直播场次创建复盘

自动关联：

```text
anchor_id
live_session_id
review_date
```

## 从复盘创建问题

自动关联：

```text
anchor_id
review_id
```

## 从问题创建方案

自动关联：

```text
anchor_id
issue_id
```

## 从方案新增跟进

自动关联：

```text
anchor_id
plan_id
```

不得要求用户反复重新选择主播。

---

# 25. 表单设计原则

所有表单按照：

```text
高频字段优先
低频字段折叠
```

不要一次展示所有数据库字段。

例如新增直播记录：

第一屏：

```text
日期
开播时间
下播时间
场观
平均在线
平均停留
新增粉丝
流水
```

其他：

```text
最高在线
点赞
评论
分享
付费人数
PK 数据
异常
备注
```

放到“更多数据”。

---

# 26. 删除规则

重要业务数据不能误删。

## 主播

软删除。

## 直播场次

允许删除，但必须二次确认。

如果存在关联复盘：

```text
提示存在关联数据
```

不得静默级联删除。

## 问题

如果已经有关联方案：

默认不允许物理删除。

允许：

```text
关闭问题
```

## 改进方案

有跟进记录后：

默认不允许物理删除。

允许：

```text
终止
```

## 跟进记录

允许编辑和删除。

---

# 27. 搜索

全局搜索第一版至少支持：

```text
主播昵称
主播姓名
平台 UID
问题标题
方案标题
```

可以后续扩展到全文搜索。

---

# 28. 数据导入导出

必须提供完整业务数据备份。

## 导出

生成：

```text
zip
```

至少包含：

```text
livemate.db
config.json
manifest.json
```

manifest 示例：

```json
{
  "app": "livemate",
  "version": "1.0.0",
  "exported_at": "2026-09-10T18:30:00+08:00"
}
```

---

## 28.1 导入

导入前必须：

1. 校验压缩包。
2. 校验数据库文件。
3. 校验版本兼容性。
4. 创建当前数据备份。
5. 再替换数据。

导入失败必须保持旧数据可恢复。

---

# 29. 日志

日志目录：

```text
<UserConfigDir>/livemate/logs/
```

至少记录：

```text
应用启动
数据库打开失败
migration 失败
导入导出
不可恢复异常
Wails backend error
```

禁止日志记录：

```text
用户密码
Token
API Key
敏感认证信息
```

---

# 30. 设置页面

第一版只做必要设置。

包含：

```text
数据目录
打开数据目录
备份数据
恢复数据
主题
应用版本
日志目录
```

如果 react-desktop-shell 支持：

```text
系统主题
浅色
深色
```

则直接接入。

不要第一版加入大量“个性化”设置。

---

# 31. React / react-desktop-shell 规范

UI 优先使用：

```text
react-desktop-shell
```

原则：

- 页面框架优先使用 RDS。
- 表格优先使用 RDS DataView / DataTable 能力。
- Navigation / Rail / Page / Toolbar / SidePane 等优先使用 RDS。
- 非必要不引入第二套完整 UI 框架。
- 缺少的小型组件可自行实现。
- 禁止为了一个简单控件额外引入重量级 UI 框架。

整体风格：

```text
桌面应用
信息密度适中
减少卡片堆叠
减少大面积留白
强调列表、详情、时间线、数据趋势
```

---

# 32. Zustand Store 规划

建议拆分：

```text
useAppStore
useAnchorStore
useDashboardStore
useFilterStore
```

职责示例：

## useAnchorStore

```text
currentAnchorId
anchorList
loading
refreshAnchors()
selectAnchor()
```

## useFilterStore

```text
anchorFilters
sessionFilters
issueFilters
planFilters
```

核心业务写操作完成后：

```text
调用 Go
→ Go 更新 SQLite
→ 前端重新拉取对应数据
→ Zustand 更新
```

禁止先修改 Zustand 然后假设数据库一定成功。

---

# 33. API / Wails Service 设计

示例：

```text
AnchorService
  ListAnchors
  GetAnchor
  CreateAnchor
  UpdateAnchor
  ArchiveAnchor

LiveService
  ListSessions
  GetSession
  CreateSession
  UpdateSession
  DeleteSession

ReviewService
  ListReviews
  CreateReview
  UpdateReview

IssueService
  ListIssues
  GetIssue
  CreateIssue
  UpdateIssue
  ChangeIssueStatus

ImprovementService
  ListPlans
  GetPlan
  CreatePlan
  UpdatePlan
  ChangePlanStatus
  AddFollowup
  UpdateFollowup
  DeleteFollowup

GoalService
  ListGoals
  CreateGoal
  UpdateGoal
  ChangeGoalStatus

EventService
  ListEvents
  CreateEvent
  UpdateEvent
  DeleteEvent

DashboardService
  GetDashboard
  GetAnchorTrend
```

---

# 34. 数据统计必须放在 Go 层

例如：

```text
7 日直播时长
7 日总流水
7 日新增粉丝
平均停留趋势
时均流水
方案当前指标
未跟进天数
```

统一由：

```text
application/dashboard
```

或相关 domain service 计算。

不要让多个 React 页面分别实现。

---

# 35. Dashboard 提醒逻辑

第一版自动提醒：

## 长时间未直播

条件可默认：

```text
正常开播状态
AND
最近 3 天无 LiveSession
```

## 重点问题未处理

```text
priority IN (重点, 紧急)
AND
status = 待处理
```

## 方案长期未跟进

```text
status IN (执行中, 观察中)
AND
最近 followup > 3 天
```

## 阶段目标即将到期

```text
status = 进行中
AND
end_date <= 3 天后
```

以上属于运营提醒，不需要复杂 AI。

---

# 36. 第一版明确不做

为了防止 Codex 自行扩需求，MVP 明确不开发：

```text
主播综合能力雷达图
几十项主播评分
S/A/B/C 综合评级
复杂绩效系统
工资结算
财务账务系统
完整 CRM
员工权限系统
多租户 SaaS
云同步
实时抓取直播平台数据
自动控制直播间
AI 自动决策
RAG
MCP
复杂 Agent
```

后续根据实际使用再增加。

---

# 37. 可预留但不实现的能力

代码结构可以为以下能力留扩展点：

```text
平台 API 数据导入
Excel / CSV 数据导入
AI 复盘总结
AI 趋势分析
自动发现异常
自动生成问题候选
自动生成改进方案建议
主播周报
主播月报
团队统计
```

但第一版不得因为这些未来能力拖慢核心功能。

---

# 38. MVP 开发阶段

Codex 按以下阶段执行。

---

## Phase 1：项目骨架

完成：

```text
Wails 3
Go
React
TypeScript
Vite
react-desktop-shell
Zustand
SQLite
```

建立：

```text
domain
application
infrastructure
bridge
frontend/features
```

完成数据目录初始化。

### Phase 1 验收

必须全部通过：

- [ ] `wails3 dev` 可以正常启动。
- [ ] React 页面可以正常加载。
- [ ] react-desktop-shell 已作为主要 UI 组件库接入。
- [ ] Zustand 可正常工作。
- [ ] SQLite 可以成功初始化。
- [ ] `livemate.db` 位于 `os.UserConfigDir()` 下。
- [ ] 安装目录中不存在业务数据库。
- [ ] 关闭并重新打开软件后数据库仍存在。
- [ ] 日志目录位于用户配置目录。

---

## Phase 2：主播管理

完成：

```text
anchors
anchor_tags
```

完成：

```text
主播列表
新增主播
编辑主播
主播详情基础信息
软删除主播
筛选
搜索
标签
```

### Phase 2 验收

- [ ] 可以新增主播。
- [ ] 重启应用后主播仍然存在。
- [ ] 可以编辑主播。
- [ ] 可以设置阶段。
- [ ] 可以设置关注等级。
- [ ] 可以设置状态。
- [ ] 可以添加多个标签。
- [ ] 可以通过昵称搜索。
- [ ] 可以按阶段筛选。
- [ ] 可以按关注等级筛选。
- [ ] 删除主播后默认列表不再显示。
- [ ] 删除主播不会物理删除数据库历史关联数据。
- [ ] 页面不存在无意义的 1～5 分能力评分。

---

## Phase 3：直播场次

完成：

```text
live_sessions
```

完成：

```text
新增直播记录
编辑直播记录
直播记录列表
场次详情
主播趋势统计
```

### Phase 3 验收

创建主播 A。

录入三场测试数据。

软件必须正确：

- [ ] 保存三条独立场次。
- [ ] 自动计算直播时长。
- [ ] 自动计算新增粉丝。
- [ ] 正确计算时均流水。
- [ ] 正确计算涨粉效率。
- [ ] 正确处理分母为 0。
- [ ] 未知值保存为 NULL，而不是自动转 0。
- [ ] 主播详情可以看到三场记录。
- [ ] 趋势图能够按照日期显示。
- [ ] 重启软件数据仍然存在。

---

## Phase 4：复盘与问题

完成：

```text
operation_reviews
anchor_issues
```

工作流：

```text
直播场次
→ 新建复盘
→ 从复盘创建问题
```

### Phase 4 验收

- [ ] 一场直播可以建立复盘。
- [ ] 复盘能够关联具体 LiveSession。
- [ ] 一个复盘可以创建 0～N 个问题。
- [ ] 问题能够独立修改状态。
- [ ] 问题能够记录 evidence。
- [ ] 问题能够记录 cause_hypothesis。
- [ ] 问题支持分类。
- [ ] 问题支持普通 / 重点 / 紧急。
- [ ] 问题不使用 1～10 分严重程度。
- [ ] 主播详情可以查看所有历史问题。
- [ ] 已解决问题不会出现在默认“待处理”列表。

---

## Phase 5：改进方案

完成：

```text
improvement_plans
```

必须支持：

```text
一个问题多个改进方案
```

### Phase 5 验收

创建：

```text
问题：新人留存下降
```

然后建立：

```text
方案 A：调整欢迎话术
方案 B：减少开场 PK
```

必须满足：

- [ ] 两个方案都关联同一个问题。
- [ ] 两个方案状态互相独立。
- [ ] 方案 A 更新不影响方案 B。
- [ ] 一个方案可保存 objective。
- [ ] 一个方案可保存具体 actions。
- [ ] 一个方案可绑定基准指标。
- [ ] 一个方案可绑定目标值。
- [ ] 支持待执行 / 执行中 / 观察中 / 有效 / 无效 / 终止状态。
- [ ] 有跟进记录的方案不能静默物理删除。

---

## Phase 6：方案跟进

完成：

```text
plan_followups
```

### Phase 6 验收

给方案 A 连续增加三次跟进：

```text
9/10 部分执行
9/11 完整执行
9/12 完整执行
```

分别录入指标：

```text
45
53
58
```

基准：

```text
42
```

必须：

- [ ] 按时间顺序显示三次跟进。
- [ ] 能显示每次执行状态。
- [ ] 能显示每次指标值。
- [ ] 能显示相对基准变化。
- [ ] 能记录效果判断。
- [ ] 能记录下一步动作。
- [ ] 修改第二次跟进不会影响另外两条。
- [ ] 删除一次跟进不会删除方案。
- [ ] 方案详情可以看到完整跟进历史。

---

## Phase 7：阶段目标与关键事件

完成：

```text
stage_goals
goal_metrics
anchor_events
```

### Phase 7 验收

- [ ] 可以为主播建立阶段目标。
- [ ] 一个阶段目标可配置多个指标。
- [ ] 能看到当前进行中目标。
- [ ] 历史目标不会丢失。
- [ ] 可以记录关键事件。
- [ ] 时间线能够看到关键事件。
- [ ] 关键事件可关联场次。
- [ ] 趋势图能够显示事件标记或提供明显的同期事件入口。

---

## Phase 8：首页 Dashboard

完成运营首页。

### Phase 8 验收

准备至少：

```text
5 个主播
10 条直播记录
3 个待处理问题
3 个执行中方案
2 个超过 3 天没有跟进的方案
```

首页必须正确显示：

- [ ] 主播总数。
- [ ] 今日已开播人数。
- [ ] 今日直播时长。
- [ ] 今日流水。
- [ ] 今日新增粉丝。
- [ ] 重点 / 紧急主播。
- [ ] 待处理重点问题。
- [ ] 执行中方案。
- [ ] 长期未跟进方案。
- [ ] 点击 Dashboard 项可以进入对应详情。

---

## Phase 9：数据备份与恢复

完成：

```text
导出
导入
打开数据目录
打开日志目录
```

### Phase 9 验收

1. 创建测试数据。
2. 导出备份。
3. 新增第二批测试数据。
4. 导入第一次备份。

结果必须：

- [ ] 能成功生成备份 zip。
- [ ] zip 包含 SQLite 数据库。
- [ ] zip 包含 manifest。
- [ ] 导入前自动备份当前数据。
- [ ] 导入成功后恢复到第一次备份状态。
- [ ] 导入损坏 zip 时不会破坏当前数据库。
- [ ] 软件卸载后重新安装，用户数据目录中的数据库仍可继续使用。
- [ ] 数据从未依赖程序安装目录。

---

# 39. 自动测试要求

Go 端至少覆盖核心业务。

建议：

```text
internal/domain/*
internal/application/*
internal/infrastructure/sqlite/*
```

必须测试：

```text
直播指标计算
主播软删除
一个问题多个方案
方案多个跟进
数据库 migration
Dashboard 统计
NULL 指标处理
备份恢复
```

---

# 40. 数据完整性测试

至少构造：

```text
Anchor A
 ├── 5 LiveSession
 ├── 2 Review
 ├── 3 Issue
 │    ├── Issue 1
 │    │    ├── Plan 1
 │    │    │    ├── Followup 1
 │    │    │    └── Followup 2
 │    │    └── Plan 2
 │    └── Issue 2
 ├── 2 StageGoal
 └── 4 AnchorEvent
```

验证：

- [ ] 所有关系正确。
- [ ] 不出现跨主播关联。
- [ ] 删除 / 关闭其中一个实体不会破坏其他数据。
- [ ] 重启应用关系仍然完整。
- [ ] 导出再导入后关系仍然完整。

---

# 41. UI 验收要求

UI 重点不是“漂亮”，而是桌面端效率。

必须满足：

- [ ] 主要页面使用 react-desktop-shell。
- [ ] 主导航清晰。
- [ ] 主播列表支持键鼠高效操作。
- [ ] 表格信息密度适中。
- [ ] 不出现手机 App 风格的大量超大卡片。
- [ ] 不滥用圆角。
- [ ] 不滥用渐变。
- [ ] 不滥用大标题。
- [ ] 不为了展示效果增加无意义统计卡片。
- [ ] 常用新增操作不超过 2 次主要点击。
- [ ] 从主播进入直播记录、问题、方案路径清晰。
- [ ] 同一主播上下文中新增数据时自动带入 anchor_id。
- [ ] 空状态有明确下一步操作。
- [ ] Loading / Error / Empty 状态完整。

---

# 42. 性能验收

测试数据：

```text
主播：500
直播场次：50,000
复盘：10,000
问题：10,000
方案：15,000
跟进：50,000
```

要求：

- [ ] 启动应用不会一次性把全部数据库内容加载到 Zustand。
- [ ] 主播列表使用分页或虚拟化。
- [ ] 直播记录分页查询。
- [ ] Dashboard 使用 SQL 聚合。
- [ ] 不使用前端遍历 50,000 条数据计算 Dashboard。
- [ ] 常规主播列表操作无明显卡顿。
- [ ] SQLite 为常用查询字段建立必要索引。

建议索引：

```text
anchors.deleted_at
anchors.attention_level
live_sessions.anchor_id
live_sessions.session_date
operation_reviews.anchor_id
anchor_issues.anchor_id
anchor_issues.status
anchor_issues.priority
improvement_plans.anchor_id
improvement_plans.issue_id
improvement_plans.status
plan_followups.plan_id
plan_followups.followup_date
anchor_events.anchor_id
anchor_events.event_date
```

---

# 43. 错误处理验收

必须存在用户可理解的错误提示。

例如：

```text
数据库无法打开
数据库迁移失败
保存主播失败
保存直播记录失败
导入失败
备份失败
```

禁止：

```text
点击保存
→ 什么都没发生
```

同时禁止将完整 Go panic 直接显示给普通用户。

开发日志中可保存详细错误。

---

# 44. Codex 实施要求

Codex 执行本规格时必须遵守：

1. 不自行扩大 MVP 范围。
2. 不擅自加入复杂评分体系。
3. 不擅自加入 S/A/B/C 综合评级。
4. 不将核心业务数据写入 localStorage。
5. 不将数据库放在安装目录。
6. 不绕过 Go 层让前端直接操作 SQLite。
7. 不重复实现统计公式。
8. 优先复用 react-desktop-shell。
9. 每完成一个 Phase 都必须运行对应测试和 build。
10. 发现规格与代码冲突时优先保证数据安全。
11. 所有数据库 schema 变更必须通过 migration。
12. 每次提交前至少保证：
   - Go test 通过。
   - 前端 TypeScript build 通过。
   - Wails build 不存在明显编译错误。

---

# 45. Codex 每阶段输出格式

每个 Phase 完成后必须输出：

```text
## Phase X 完成情况

### 已完成
- ...

### 修改文件
- ...

### 数据库变化
- ...

### 测试
- ...

### 验收结果
- [x] ...
- [x] ...

### 未完成 / 已知问题
- ...
```

不允许只回复：

```text
已完成
```

---

# 46. 最终验收场景

Codex 完成全部 MVP 后，执行以下完整人工场景。

---

## 场景 A：新主播建立档案

新增：

```text
昵称：小鱼
平台：抖音
赛道：聊天
阶段：新人
关注等级：正常
状态：正常开播
```

预期：

- [ ] 保存成功。
- [ ] 列表出现。
- [ ] 重启后存在。

---

## 场景 B：录入直播数据

录入：

```text
日期：2026-09-10
直播时长：4 小时
场观：5000
平均在线：42
平均停留：42 秒
新增粉丝：20
流水：2500 元
付费人数：25
```

预期：

- [ ] 数据正确保存。
- [ ] 自动计算时均流水。
- [ ] 自动计算涨粉效率。
- [ ] 自动计算付费率。

---

## 场景 C：运营复盘

新建复盘：

```text
总结：
流量正常，但高在线阶段掉人明显。

观察：
在线达到 55 后连续 PK，
约 15 分钟后下降到 30 左右。

结论：
目前主要问题是高在线阶段承接不足。
```

预期：

- [ ] 复盘关联正确场次。
- [ ] 主播详情可查看。

---

## 场景 D：建立问题

创建：

```text
标题：
高在线阶段留存下降

分类：
留存

优先级：
重点

依据：
本场在线达到 55 后约 15 分钟下降到 30。

原因判断：
可能与连续 PK 和缺少新人互动有关。
```

预期：

- [ ] 问题关联复盘。
- [ ] 问题出现在待处理列表。

---

## 场景 E：同一个问题建立多个方案

方案 A：

```text
减少开场及高在线阶段连续 PK
```

方案 B：

```text
在线超过 40 后加强新人互动
```

预期：

- [ ] 同一问题下存在两个独立方案。
- [ ] 两个方案拥有独立状态和跟进。

---

## 场景 F：持续跟进

方案 A 建立三次跟进：

```text
第 1 次：
部分执行
平均停留 45s

第 2 次：
完整执行
平均停留 53s

第 3 次：
完整执行
平均停留 58s
```

预期：

- [ ] 跟进时间线正确。
- [ ] 可以看到指标由 42 → 45 → 53 → 58。
- [ ] 运营可将方案标记为“已验证有效”。

---

## 场景 G：阶段目标

创建：

```text
周期：
2026-09-10 ～ 2026-09-24

目标：
提高新人留存和整体在线稳定性。

指标：
平均在线 35 → 50
平均停留 42s → 60s
```

预期：

- [ ] 主播详情显示当前阶段目标。
- [ ] 两个指标独立显示。

---

## 场景 H：关键事件

新增：

```text
2026-09-15
调整直播时间
从 18:00 调整到 20:00。
```

预期：

- [ ] 事件出现在主播时间线。
- [ ] 查看趋势时能够知道 9 月 15 日发生过时间调整。

---

## 场景 I：数据安全

完成以上全部数据后：

1. 关闭应用。
2. 重启应用。
3. 验证全部数据。
4. 导出备份。
5. 卸载应用。
6. 确认用户配置目录仍有业务数据。
7. 重新安装。
8. 再次打开。

预期：

- [ ] 主播存在。
- [ ] 场次存在。
- [ ] 复盘存在。
- [ ] 问题存在。
- [ ] 两个方案存在。
- [ ] 跟进存在。
- [ ] 阶段目标存在。
- [ ] 关键事件存在。
- [ ] 所有关联关系完整。

---

# 47. MVP 最终通过标准

只有以下全部满足，才算 MVP 完成。

## 品牌与工程标识

- [ ] 软件界面显示名称统一为“播伴”。
- [ ] 英文工程标识统一使用 `livemate`。
- [ ] GitHub 仓库目标名称为 `livemate`。
- [ ] 可执行文件名为 `livemate`。
- [ ] App ID 为 `cn.cbowen.livemate`。
- [ ] 用户数据目录为 `<UserConfigDir>/livemate/`。
- [ ] SQLite 文件名为 `livemate.db`。
- [ ] 代码、配置、安装器和文档中不存在仍被实际使用的 `LiveOps` / `LiveOpsDesk` 临时占位名。
- [ ] About / README / 安装器中的产品定位统一为“主播运营管理与 AI 辅助工具”。

## 架构

- [ ] Wails 3 正常运行。
- [ ] React + TypeScript 正常运行。
- [ ] react-desktop-shell 为主要 UI 组件库。
- [ ] Zustand 用于前端状态。
- [ ] SQLite 为业务数据唯一事实来源。
- [ ] 数据目录使用 `os.UserConfigDir()`。
- [ ] 数据不保存到安装目录。

## 主播管理

- [ ] 主播增改查和软删除完成。
- [ ] 标签完成。
- [ ] 生命周期阶段完成。
- [ ] 关注等级完成。
- [ ] 主播状态完成。

## 数据

- [ ] 直播场次完成。
- [ ] 自动统计完成。
- [ ] NULL 与 0 正确区分。
- [ ] 趋势查询完成。

## 运营闭环

- [ ] 运营复盘完成。
- [ ] 问题完成。
- [ ] 一个问题多个方案完成。
- [ ] 方案跟进完成。
- [ ] 方案效果记录完成。
- [ ] 阶段目标完成。
- [ ] 关键事件完成。

## 首页

- [ ] Dashboard 完成。
- [ ] 重点主播完成。
- [ ] 待处理问题完成。
- [ ] 执行中方案完成。
- [ ] 超时未跟进提示完成。

## 数据安全

- [ ] migration 完成。
- [ ] 备份完成。
- [ ] 恢复完成。
- [ ] 日志完成。
- [ ] 卸载不会导致业务数据自动丢失。

## 质量

- [ ] Go tests 通过。
- [ ] 前端 build 通过。
- [ ] Wails build 通过。
- [ ] 关键场景人工验收通过。
- [ ] 不存在无意义的大量评分功能。
- [ ] 不存在 S/A/B/C 装饰性综合评级。
- [ ] 不存在核心业务数据多份状态源。

---

# 48. 第一版完成后的优先迭代顺序

MVP 验收通过后，后续优先级：

```text
P1 平台数据 CSV / Excel 导入
P1 周报 / 月报
P1 更完整趋势对比
P1 异常变化检测

P2 AI 自动总结近期主播表现
P2 AI 根据已有问题和历史方案生成改进建议
P2 AI 周报

P3 平台 API 自动同步
P3 团队协作
P3 云同步
```

AI 必须建立在已有真实数据之上，而不是替代数据记录本身。

---

# 49. 最终产品核心判断

该项目的核心价值不在于：

```text
给主播打多少分
主播属于 S 还是 A
展示多少张图
```

而在于能够完整回答：

```text
这个主播最近发生了什么？

数据发生了什么变化？

运营发现了什么问题？

判断依据是什么？

尝试过哪些改进方案？

哪个方案执行了？

执行到什么程度？

实施之后数据和实际表现有没有变化？

这个问题最后解决了吗？

接下来还需要做什么？
```

如果软件能够稳定回答以上问题，即达到第一版产品目标。
