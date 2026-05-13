import re

with open("linkedin_scrm_backend_design.md", "r", encoding="utf-8") as f:
    content = f.read()

# ============================================================
# 1. Base URL 修改
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
# 2. 接口标题行路径统一加 /api/v1
#    匹配格式如：#### 2.1 GET /candidates
# ============================================================
def add_api_prefix(match):
    prefix = match.group(1)  # 如 "#### 2.1 GET "
    path = match.group(2)    # 如 "/candidates"
    if path.startswith('/api/v1/'):
        return match.group(0)
    return f"{prefix}/api/v1{path}"

# 匹配接口标题行
content = re.sub(r'^(#### \d+(\.\d+)*\s+(GET|POST|PUT|DELETE)\s+)(/\S+)', add_api_prefix, content, flags=re.MULTILINE)
print("[OK] 接口标题路径已统一加 /api/v1")

# ============================================================
# 3. 同步机制说明中的路径引用也统一
# ============================================================
content = content.replace(
    '[前端]                    [后端]\n  |                         |\n  |-- sync/push ----------> | (推送本地变更)',
    '[前端]                    [后端]\n  |                         |\n  |-- POST /api/v1/sync --> | (推送本地变更)'
)
content = content.replace(
    '  |<-- sync result --------| (返回处理结果)',
    '  |<-- sync result --------| (返回处理结果)\n  |   + server_changes      |\n  |                         |\n  |-- POST /api/v1/sync --> | (首次安装/新设备同步)'
)
content = content.replace(
    '  |-- sync/pull ---------> | (拉取服务端变更)\n  |   + sync_token          |\n  |                         |\n  |<-- server changes -----| (返回服务端新变更)',
    ''
)

# 删除旧的冲突处理策略表格，替换为 last_write_wins
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

print("\n路径统一和基础修改完成。")
