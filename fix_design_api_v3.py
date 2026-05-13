import re

with open("linkedin_scrm_backend_design.md", "r", encoding="utf-8") as f:
    content = f.read()

# ============================================================
# C1. 删除 Sync 9.1-9.4（路径已带 /api/v1 前缀）
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
    r'### 9\. 数据同步模块接口（核心）\n\n#### 9\.1 POST /api/v1/sync/push.*?\n(?=### 10\. 订阅与付费模块接口)',
    sync_new,
    content,
    flags=re.DOTALL
)
print("[OK] Sync 9.1-9.4 已替换为新的 9.1")

# ============================================================
# C2. 删除订阅 10.6-10.8（路径已带 /api/v1 前缀）
# ============================================================
content = re.sub(
    r'#### 10\.6 POST /api/v1/subscription/reactivate.*?\n(?=### 12\. Webhook与回调接口)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] 订阅 10.6-10.8 已删除")

# ============================================================
# C3. 删除 paypal webhook 12.2（路径已带 /api/v1 前缀）
# ============================================================
content = re.sub(
    r'#### 12\.2 POST /api/v1/webhooks/paypal.*?\n(?=---\n\n## 三、同步机制设计说明)',
    '',
    content,
    flags=re.DOTALL
)
print("[OK] PayPal webhook 已删除")

with open("linkedin_scrm_backend_design.md", "w", encoding="utf-8") as f:
    f.write(content)

print("\n补充修正完成。")
