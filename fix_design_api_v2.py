import re

with open("linkedin_scrm_backend_design.md", "r", encoding="utf-8") as f:
    content = f.read()

# ============================================================
# B1. Base URL 修改
# ============================================================
if '- **Base URL**: `https://api.linkedin-scrm.com/v1`' in content:
    content = content.replace(
        '- **Base URL**: `https://api.linkedin-scrm.com/v1`',
        '- **Base URL**: `https://api.linkedin-scrm.com`'
    )
    print("[OK] Base URL 已修正")
else:
    print("[WARN] Base URL 未匹配")

# ============================================================
# B2. 接口标题行路径统一加 /api/v1（使用非捕获组避免group编号问题）
# ============================================================
def add_api_prefix(match):
    prefix = match.group(1)
    path = match.group(2)
    if path.startswith('/api/v1/'):
        return match.group(0)
    return f"{prefix}/api/v1{path}"

content = re.sub(
    r'^(#### (?:\d+(?:\.\d+)*)\s+(?:GET|POST|PUT|DELETE)\s+)(/\S+)',
    add_api_prefix,
    content,
    flags=re.MULTILINE
)
print("[OK] 接口标题路径已统一加 /api/v1")

# ============================================================
# B3. 删除 History H2（批量创建）
# ============================================================
content = re.sub(
    r'### H2\. 批量创建历史记录.*?\n(?=### H3\. 获取历史记录列表)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] History H2 已删除")

# ============================================================
# B4. 删除 History H4-H11（从 H4 到 9. 数据同步模块之前）
# ============================================================
content = re.sub(
    r'### H4\. 获取历史记录详情.*?\n(?=### 9\. 数据同步模块接口（核心）)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] History H4-H11 已删除")

# ============================================================
# B5. 删除 Sync 9.1-9.4，替换为新的 9.1 POST /api/v1/sync
# ============================================================
sync_new = '''### 9. 数据同步模块接口（核心）

#### 9.1 POST /api/v1/sync
| 项目 | 说明 |
|------|------|
| **接口名** | 数据同步（推拉合一） |
| **接口功能** | 前端打包所有变更上传，后端返回服务端变更和同步令牌 |
| **请求字段** | |
| `sync_token` | string, 可选, 上次同步令牌 |
| `client_timestamp` | string, 必填, 客户端当前时间ISO格式 |
| `device_id` | string, 可选, 设备标识 |
| `changes` | object, 各实体的变更集合 |
| `changes.candidates` | array, 候选人变更数组 |
| `changes.candidates[].local_id` | string, 必填 |
| `changes.candidates[].action` | string, 必填, create/update/delete |
| `changes.candidates[].data` | object, 完整数据对象（delete时可省略） |
| `changes.notes` | array, 笔记变更 |
| `changes.sequences` | array, 序列变更 |
| `changes.sequence_steps` | array, 序列步骤变更 |
| `changes.pipeline_boards` | array, 看板变更 |
| `changes.pipeline_stages` | array, 阶段变更 |
| `changes.pipeline_candidates` | array, Pipeline卡片变更 |
| `changes.history` | array, 历史记录变更 |
| **响应字段** | |
| `sync_record_id` | integer, 同步记录ID |
| `sync_token` | string, 新同步令牌 |
| `server_timestamp` | string, 服务端时间戳 |
| `results` | object, 各类实体处理结果 |
| `server_changes` | object, 服务端新增/更新的数据 |
| `has_more` | boolean, 是否有更多数据待拉取 |

---

'''

content = re.sub(
    r'### 9\. 数据同步模块接口（核心）\n\n#### 9\.1 POST /sync/push.*?\n(?=### 10\. 订阅与付费模块接口)',
    sync_new,
    content,
    flags=re.DOTALL
)
print("[OK] Sync 9.1-9.4 已替换为新的 9.1")

# ============================================================
# B6. 删除订阅 10.6-10.8
# ============================================================
content = re.sub(
    r'#### 10\.6 POST /subscription/reactivate.*?\n(?=### 11\. 用量与限制接口)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] 订阅 10.6-10.8 已删除")

# ============================================================
# B7. 删除整个 usage 模块 (11)
# ============================================================
content = re.sub(
    r'### 11\. 用量与限制接口.*?\n(?=### 12\. Webhook与回调接口)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] usage 模块已删除")

# ============================================================
# B8. 删除 paypal webhook 12.2
# ============================================================
content = re.sub(
    r'#### 12\.2 POST /webhooks/paypal.*?\n(?=---\n\n## 三、同步机制设计说明)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] PayPal webhook 已删除")

# ============================================================
# B9. Pipeline 接口字段修改
# ============================================================
# 4.10 POST /pipeline/cards: stage_name -> stage_id
content = content.replace(
    '| `stage_name`    | string, 必填, 阶段名字           |',
    '| `stage_id`      | string, 必填, 阶段ID或local_id   |'
)
# 4.11 PUT /pipeline/cards/:id/move: target_stage_name -> target_stage_id
content = content.replace(
    '| `target_stage_name` | string, 必填, 目标阶段名字            |',
    '| `target_stage_id`   | string, 必填, 目标阶段ID或local_id    |'
)
content = content.replace(
    '| `stage_name`        | string, 新阶段名字                 |',
    '| `stage_id`          | string, 新阶段ID                   |'
)
print("[OK] Pipeline 接口字段已修正")

# ============================================================
# B10. Sequence 接口字段删除
# ============================================================
# 删除响应/请求中的 auto_send, approval_required, max_daily_sends, estimated_complete_days 行
seq_lines_to_remove = [
    '| `items[].auto_send` | boolean, 自动发送 |\n',
    '| `items[].approval_required` | boolean, 需审批 |\n',
    '| `items[].max_daily_sends` | integer, 每日最大发送 |\n',
    '| `items[].estimated_complete_days` | integer, 预计完成天数 |\n',
    '| `auto_send` | boolean, 自动发送 |\n',
    '| `approval_required` | boolean, 需审批 |\n',
    '| `max_daily_sends` | integer, 日限 |\n',
    '| `estimated_complete_days` | integer, 预计天数 |\n',
    '| `auto_send` | boolean, 可选(默认false) |\n',
    '| `approval_required` | boolean, 可选(默认true) |\n',
    '| `max_daily_sends` | integer, 可选(默认20) |\n',
]

for line in seq_lines_to_remove:
    content = content.replace(line, '')

# candidate-sequences 响应删除 next_execute_at
content = content.replace(
    '| `items[].next_execute_at` | string, 下次执行 |\n',
    ''
)
print("[OK] Sequence 接口字段已精简")

# ============================================================
# B11. Notes 接口字段删除 + 删除 notes/batch
# ============================================================
# 删除 note_type, is_pinned 相关行
note_lines_to_remove = [
    '| `items[].note_type` | string, 类型 |\n',
    '| `items[].is_pinned` | boolean, 是否置顶 |\n',
    '| `note_type` | string, 可选, 类型(默认general) |\n',
    '| `is_pinned` | boolean, 可选, 是否置顶 |\n',
    '| `items[].note_type` | string, 可选 |\n',
]

for line in note_lines_to_remove:
    content = content.replace(line, '')

# 删除 3.5 POST /notes/batch
content = re.sub(
    r'#### 3\.5 POST /api/v1/notes/batch.*?\n(?=### 4\. Pipeline模块接口)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] Notes 接口已简化，notes/batch 已删除")

# ============================================================
# B12. 同步机制说明更新
# ============================================================
content = content.replace(
    '[前端]                    [后端]\n  |                         |\n  |-- sync/push ----------> | (推送本地变更)',
    '[前端]                    [后端]\n  |                         |\n  |-- POST /api/v1/sync --> | (推送本地变更)'
)

# 删除 sync/pull 部分
content = content.replace(
    '  |<-- sync result --------| (返回处理结果)\n  |   + results (各实体处理) |\n  |   + conflicts (冲突列表)|\n  |   + sync_token          |\n  |                         |\n  |-- sync/pull ---------> | (拉取服务端变更)\n  |   + sync_token          |\n  |                         |\n  |<-- server changes -----| (返回服务端新变更)\n  |   + entities            |\n  |   + has_more            |',
    '  |<-- sync result --------| (返回处理结果)\n  |   + results (各实体处理) |\n  |   + server_changes      |\n  |   + sync_token          |'
)

# 更新冲突处理策略
old_conflict = '''| 场景 | 策略 |
|------|------|
| 两端同时修改 | 标记冲突，返回给前端选择 |
| 服务端已删除，客户端修改 | 默认客户端获胜，可选服务端获胜 |
| 客户端已删除，服务端修改 | 默认服务端获胜 |
| 两端同时新增（local_id冲突） | 客户端重命名local_id后重新同步 |'''

new_conflict = '''| 场景 | 策略 |
|------|------|
| 两端同时修改 | last_write_wins（最后写入覆盖） |
| 服务端已删除，客户端修改 | 客户端数据重新创建 |
| 客户端已删除，服务端修改 | 保持服务端删除 |
| 两端同时新增（local_id冲突） | 客户端重命名local_id后重新同步 |'''

if old_conflict in content:
    content = content.replace(old_conflict, new_conflict)
    print("[OK] 冲突处理策略已更新")
else:
    print("[WARN] 冲突处理策略未匹配")

with open("linkedin_scrm_backend_design.md", "w", encoding="utf-8") as f:
    f.write(content)

print("\n接口定义修改完成，文件已保存。")
