import re

with open("linkedin_scrm_backend_design.md", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Notes 查询参数删除 note_type 筛选
content = content.replace(
    '| `note_type` | string, 可选, 笔记类型筛选 |\n',
    ''
)

# 2. PUT /notes/:note_id 删除 is_pinned
content = content.replace(
    '| `content` | string, 可选, 新内容 |\n| `is_pinned` | boolean, 可选, 置顶状态 |\n',
    '| `content` | string, 可选, 新内容 |\n'
)

# 3. candidates 表 raw_profile_data 加大小限制注释
content = content.replace(
    "`raw_profile_data` json DEFAULT NULL COMMENT 'LinkedIn原始抓取数据JSON',",
    "`raw_profile_data` json DEFAULT NULL COMMENT 'LinkedIn原始抓取数据JSON（建议限制64KB）',"
)

# 4. 删除 candidates/batch 中的旧 sync_token 引用（如果存在）
# 实际上 review 没有要求删除 candidates/batch 中的 sync_token，它保留在响应中。不处理。

# 5. 检查并删除 candidate_sequences 响应中的 next_execute_at 残留
if '| `items[].next_execute_at` | string, 下次执行 |' in content:
    content = content.replace(
        '| `items[].next_execute_at` | string, 下次执行 |\n',
        ''
    )

# 6. 修正 History H1 响应中残留的 sync_status/sync_version
content = content.replace(
    '| data.sync_status | string | synced |\n',
    ''
)
content = content.replace(
    '| data.sync_version | int | 1 |\n',
    ''
)

# 7. 删除 H3 响应中的 has_detail 和 history_type_info（因为 type 字典表已删除）
content = content.replace(
    '| `items[].has_detail` | boolean | 是否有详情记录 |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info` | object | 类型信息（关联 type 表） |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info.type_code` | string | 类型编码 |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info.type_name` | string | 英文名称 |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info.type_name_zh` | string | 中文名称 |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info.icon` | string | 图标 |\n',
    ''
)
content = content.replace(
    '| `items[].history_type_info.color` | string | 颜色 |\n',
    ''
)

# 8. 删除 H3 查询参数中的 include_deleted（History 不可删除）
content = content.replace(
    '| `include_deleted` | boolean | 否 | 是否包含已删除记录，默认 false | false |\n',
    ''
)

# 9. 修正 5.12 GET /candidate-sequences 的 status 筛选说明
content = content.replace(
    "| `status` | string, 可选, 状态筛选(active/waiting/paused) |",
    "| `status` | string, 可选, 状态筛选(active/completed) |"
)

with open("linkedin_scrm_backend_design.md", "w", encoding="utf-8") as f:
    f.write(content)

print("最终微调完成。")
