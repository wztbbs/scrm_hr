import re

with open("linkedin_scrm_backend_design.md", "r", encoding="utf-8") as f:
    content = f.read()

# ============================================================
# A. SQL 表结构修改（同第一阶段，全部已验证）
# ============================================================

# A1. users 表
old_users = '''CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `uuid` VARCHAR(64) NOT NULL UNIQUE COMMENT '浏览器端生成的 UUID（前端 userId）',
  `email` varchar(255) NOT NULL COMMENT '用户邮箱（登录账号）',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '密码哈希（支持邮箱登录）',
  `timezone` varchar(64) DEFAULT 'UTC' COMMENT '用户时区',
  `locale` varchar(16) DEFAULT 'en-US' COMMENT '语言设置',
  `membership_status` enum('free','active','expired','cancelled') NOT NULL DEFAULT 'free' COMMENT '会员状态：免费/有效/过期/已取消',
  `membership_expire_at` datetime DEFAULT NULL COMMENT '会员过期时间',
  `daily_message_left` int NOT NULL DEFAULT 20 COMMENT '每日生成消息剩余此时，每日凌晨 刷新进度（免费用户可能更低）',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '账号是否启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_sync_at` datetime DEFAULT NULL COMMENT '最后一次前端同步时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`uuid`),
  KEY `idx_email` (`email`),
  KEY `idx_membership_status` (`membership_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';'''

new_users = '''CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `uuid` VARCHAR(64) NOT NULL UNIQUE COMMENT '浏览器端生成的 UUID（前端 userId）',
  `email` varchar(255) NOT NULL COMMENT '用户邮箱（登录账号）',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '密码哈希（支持邮箱登录）',
  `timezone` varchar(64) DEFAULT 'UTC' COMMENT '用户时区',
  `locale` varchar(16) DEFAULT 'en-US' COMMENT '语言设置',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '账号是否启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_sync_at` datetime DEFAULT NULL COMMENT '最后一次前端同步时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uuid` (`uuid`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';'''

content = content.replace(old_users, new_users)
print("[OK] users 表已修正")

# A2. 删除 user_sessions
old_session = '''#### 1.2 user_sessions（用户会话表）

```sql
CREATE TABLE `user_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '关联users.id',
  `token` varchar(512) NOT NULL COMMENT 'JWT/会话令牌',
  `refresh_token` varchar(512) DEFAULT NULL COMMENT '刷新令牌',
  `device_info` varchar(255) DEFAULT NULL COMMENT '设备信息（浏览器插件）',
  `ip_address` varchar(64) DEFAULT NULL COMMENT 'IP地址',
  `expires_at` datetime NOT NULL COMMENT '令牌过期时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active_at` datetime DEFAULT NULL COMMENT '最后活跃时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`(255)),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话表';
```'''
content = content.replace(old_session, "")
print("[OK] user_sessions 表已删除")

# A3. subscription_plans INSERT 字段名修正
content = content.replace("`candidate_limit`, `sort_order`", "`total_candidate_limit`, `sort_order`")
print("[OK] subscription_plans INSERT 字段名已修正")

# A4. orders 表精简
old_orders = '''CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(64) NOT NULL COMMENT '订单编号（如 ORD-20260507-XXXXX）',
  `user_id` bigint unsigned NOT NULL COMMENT '关联users.id',
  `plan_id` bigint unsigned NOT NULL COMMENT '关联subscription_plans.id',
  `subscription_id` bigint unsigned DEFAULT NULL COMMENT '关联subscriptions.id（续费时关联）',
  `status` enum('pending','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'pending' COMMENT '订单状态',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额',
  `currency` varchar(8) NOT NULL DEFAULT 'USD',
  `payment_method` enum('stripe','paypal','manual','promo') DEFAULT NULL COMMENT '支付方式',
  `payment_transaction_id` varchar(256) DEFAULT NULL COMMENT '支付平台交易号',
  `paid_at` datetime DEFAULT NULL COMMENT '支付完成时间',
  `refunded_at` datetime DEFAULT NULL COMMENT '退款时间',
  `refund_amount` decimal(10,2) DEFAULT 0.00 COMMENT '退款金额',
  `billing_cycle` enum('monthly','yearly','lifetime') NOT NULL COMMENT '计费周期',
  `coupon_code` varchar(64) DEFAULT NULL COMMENT '优惠券码',
  `discount_amount` decimal(10,2) DEFAULT 0.00 COMMENT '优惠金额',
  `invoice_url` varchar(512) DEFAULT NULL COMMENT '发票/收据链接',
  `metadata` json DEFAULT NULL COMMENT '额外元数据',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';'''

new_orders = '''CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(64) NOT NULL COMMENT '订单编号（如 ORD-20260507-XXXXX）',
  `user_id` bigint unsigned NOT NULL COMMENT '关联users.id',
  `plan_id` bigint unsigned NOT NULL COMMENT '关联subscription_plans.id',
  `status` enum('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT '订单状态',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额',
  `currency` varchar(8) NOT NULL DEFAULT 'USD',
  `stripe_session_id` varchar(128) DEFAULT NULL COMMENT 'Stripe Checkout Session ID',
  `paid_at` datetime DEFAULT NULL COMMENT '支付完成时间',
  `billing_cycle` enum('monthly','yearly','lifetime') NOT NULL COMMENT '计费周期',
  `metadata` json DEFAULT NULL COMMENT '额外元数据',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';'''

content = content.replace(old_orders, new_orders)
print("[OK] orders 表已精简")

# A5. candidates 删除 FULLTEXT
content = content.replace("FULLTEXT KEY `ft_name_company` (`full_name`, `company`, `job_title`)\n", "")
print("[OK] candidates FULLTEXT 索引已删除")

# A6. candidate_notes 简化
old_notes = '''CREATE TABLE `candidate_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联candidates.id',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `content` text NOT NULL COMMENT '笔记内容',
  `note_type` enum('key_memory','general','interview','assessment') NOT NULL DEFAULT 'general' COMMENT '笔记类型',
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否置顶',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_candidate_id` (`candidate_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_type` (`note_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人笔记表';'''

new_notes = '''CREATE TABLE `candidate_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联candidates.id',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `content` text NOT NULL COMMENT '笔记内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_candidate_id` (`candidate_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人笔记表（Key Memory）';'''

content = content.replace(old_notes, new_notes)
print("[OK] candidate_notes 表已简化")

# A7. Pipeline 新增 boards + stages
old_pipeline_header = '''### 4. Pipeline模块


#### 4.1 pipeline_candidates（候选人在Pipeline中的位置表）'''

new_pipeline_header = '''### 4. Pipeline模块

#### 4.0 pipeline_boards（Pipeline看板表）

```sql
CREATE TABLE `pipeline_boards` (
  `id` bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  `local_id` VARCHAR(64) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` VARCHAR(128) NOT NULL DEFAULT 'My Pipeline',
  `is_default` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否为默认看板',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pipeline看板表';
```

#### 4.1 pipeline_stages（Pipeline阶段表）

```sql
CREATE TABLE `pipeline_stages` (
  `id` bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  `local_id` VARCHAR(64) NOT NULL,
  `board_id` bigint unsigned NOT NULL COMMENT '关联 pipeline_boards',
  `user_id` bigint unsigned NOT NULL,
  `name` VARCHAR(64) NOT NULL COMMENT '如 New, Messaged, Talking, Done',
  `color` VARCHAR(16) DEFAULT '#E5E7EB',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_board` (`board_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pipeline阶段表';
```

#### 4.2 pipeline_candidates（候选人在Pipeline中的位置表）'''

content = content.replace(old_pipeline_header, new_pipeline_header)
print("[OK] pipeline_boards / pipeline_stages 已插入")

# A8. pipeline_candidates 修正
old_pipeline_cand = '''CREATE TABLE `pipeline_candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联候选人',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户,属于冗余字段，方便查询',
  `stage_name` varchar(64) NOT NULL COMMENT '阶段名称（New/Messaged/Talking/Done等）',
  `is_archived` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否在看板中归档',
  `entered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '进入当前阶段时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  UNIQUE KEY `uk_candidate` (`candidate_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人在Pipeline中的位置';'''

new_pipeline_cand = '''CREATE TABLE `pipeline_candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联候选人',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户，冗余字段方便查询',
  `stage_id` bigint unsigned NOT NULL COMMENT '关联 pipeline_stages',
  `position` int NOT NULL DEFAULT 0 COMMENT '在看板中的排序位置',
  `is_archived` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否在看板中归档',
  `entered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '进入当前阶段时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  UNIQUE KEY `uk_candidate` (`candidate_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_stage` (`stage_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人在Pipeline中的位置';'''

content = content.replace(old_pipeline_cand, new_pipeline_cand)
print("[OK] pipeline_candidates 表已修正")

# A9. sequences 精简
old_seq = '''CREATE TABLE `sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `name` varchar(128) NOT NULL COMMENT '序列名称（如 Sr. Director Role Sequence）',
  `description` text DEFAULT NULL COMMENT '序列描述',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
  `auto_send` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动发送',
  `approval_required` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否需要手动审批',
  `max_daily_sends` int NOT NULL DEFAULT 20 COMMENT '每日最大发送数',
  `estimated_complete_days` int DEFAULT NULL COMMENT '预计完成天数（如10天）',
  `step_count` int NOT NULL DEFAULT 0 COMMENT '步骤数量',
  `is_template` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为系统预置模板',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='序列模板表';'''

new_seq = '''CREATE TABLE `sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `name` varchar(128) NOT NULL COMMENT '序列名称（如 Sr. Director Role Sequence）',
  `description` text DEFAULT NULL COMMENT '序列描述',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
  `step_count` int NOT NULL DEFAULT 0 COMMENT '步骤数量',
  `is_template` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为系统预置模板',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='序列模板表';'''

content = content.replace(old_seq, new_seq)
print("[OK] sequences 表已精简")

# A10. candidate_sequences 精简
old_cseq = '''CREATE TABLE `candidate_sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联候选人',
  `sequence_id` bigint unsigned NOT NULL COMMENT '关联序列',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `status` enum('waiting','active','paused','completed','cancelled','failed') NOT NULL DEFAULT 'waiting' COMMENT '执行状态',
  `current_step_id` bigint unsigned DEFAULT NULL COMMENT '当前执行到的步骤',
  `current_step_number` int unsigned NOT NULL DEFAULT 0 COMMENT '当前步骤序号',
  `total_steps` int unsigned NOT NULL DEFAULT 0 COMMENT '总步骤数',
  `started_at` datetime DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `next_execute_at` datetime DEFAULT NULL COMMENT '下次执行时间',
  `is_approved` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否已审批（手动审批模式）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  UNIQUE KEY `uk_candidate_sequence` (`candidate_id`, `sequence_id`),
  KEY `idx_status` (`status`),
  KEY `idx_next_execute` (`next_execute_at`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人与序列绑定表';'''

new_cseq = '''CREATE TABLE `candidate_sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(64) NOT NULL COMMENT '前端IndexedDB本地ID',
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联候选人',
  `sequence_id` bigint unsigned NOT NULL COMMENT '关联序列',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `status` VARCHAR(16) DEFAULT 'active' COMMENT '执行状态：active / completed',
  `current_step_number` int unsigned NOT NULL DEFAULT 0 COMMENT '当前步骤序号',
  `total_steps` int unsigned NOT NULL DEFAULT 0 COMMENT '总步骤数',
  `started_at` datetime DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_local_id` (`local_id`),
  UNIQUE KEY `uk_candidate_sequence` (`candidate_id`, `sequence_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人与序列绑定表';'''

content = content.replace(old_cseq, new_cseq)
print("[OK] candidate_sequences 表已精简")

# A11. sync_records 简化
old_sync_rec = '''CREATE TABLE `sync_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '关联用户',
  `device_id` varchar(128) DEFAULT NULL COMMENT '设备/浏览器标识',
  `sync_type` enum('full','incremental') NOT NULL DEFAULT 'incremental' COMMENT '同步类型：全量/增量',
  `sync_direction` enum('push','pull','bidirectional') NOT NULL DEFAULT 'bidirectional' COMMENT '同步方向',
  `status` enum('in_progress','completed','failed','conflict') NOT NULL DEFAULT 'in_progress' COMMENT '同步状态',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '同步开始时间',
  `completed_at` datetime DEFAULT NULL COMMENT '同步完成时间',
  `client_timestamp` datetime NOT NULL COMMENT '客户端请求时的时间戳',
  `server_timestamp` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '服务端处理时间戳',
  `entities_synced` json DEFAULT NULL COMMENT '同步的实体统计（各表新增/更新/删除数量）',
  `conflicts` json DEFAULT NULL COMMENT '冲突信息JSON数组',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `next_sync_token` varchar(256) DEFAULT NULL COMMENT '下次同步令牌（用于增量同步游标）',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据同步记录表';'''

new_sync_rec = '''CREATE TABLE `sync_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '关联用户',
  `device_id` varchar(128) DEFAULT NULL COMMENT '设备/浏览器标识',
  `status` enum('in_progress','completed','failed') NOT NULL DEFAULT 'in_progress' COMMENT '同步状态',
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '同步开始时间',
  `completed_at` datetime DEFAULT NULL COMMENT '同步完成时间',
  `client_timestamp` datetime NOT NULL COMMENT '客户端请求时的时间戳',
  `server_timestamp` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '服务端处理时间戳',
  `entities_synced` json DEFAULT NULL COMMENT '同步的实体统计（各表新增/更新/删除数量）',
  `error_message` text DEFAULT NULL COMMENT '错误信息',
  `next_sync_token` varchar(256) DEFAULT NULL COMMENT '下次同步令牌',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据同步记录表';'''

content = content.replace(old_sync_rec, new_sync_rec)
print("[OK] sync_records 表已简化")

# A12. 删除 sync_conflicts
old_sync_conf = '''#### 7.2 sync_conflicts（同步冲突明细表）

```sql
CREATE TABLE `sync_conflicts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sync_record_id` bigint unsigned NOT NULL COMMENT '关联sync_records',
  `user_id` bigint unsigned NOT NULL,
  `entity_type` varchar(64) NOT NULL COMMENT '冲突实体类型（candidate/note/sequence等）',
  `local_id` varchar(64) NOT NULL COMMENT '前端本地ID',
  `server_id` bigint unsigned DEFAULT NULL COMMENT '后端ID',
  `conflict_type` enum('both_modified','server_deleted_client_modified','client_deleted_server_modified','both_deleted','insert_conflict') NOT NULL COMMENT '冲突类型',
  `client_data` json DEFAULT NULL COMMENT '客户端数据快照',
  `server_data` json DEFAULT NULL COMMENT '服务端数据快照',
  `resolution` enum('pending','client_wins','server_wins','merged','manual') NOT NULL DEFAULT 'pending' COMMENT '解决方式',
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` enum('system','user') DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sync_record` (`sync_record_id`),
  KEY `idx_user_entity` (`user_id`, `entity_type`),
  KEY `idx_resolution` (`resolution`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='同步冲突明细表';

```'''
content = content.replace(old_sync_conf, "")
print("[OK] sync_conflicts 表已删除")

# A13. candidate_history 三张表 -> 一张表
old_history_block = '''### 8. History相关

-- ------------------------------------------------------------
-- 1. candidate_history 主表
-- 候选人的所有互动记录（时间线）
-- 记录类型：添加候选人、状态变更、聊天记录、笔记、序列绑定、
--           follow-up设置、语音备忘录、temperature变更等
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `candidate_history` (
`id`              BIGINT UNSIGNED     AUTO_INCREMENT PRIMARY KEY COMMENT '后端自增主键',
`local_id`        VARCHAR(64)         NOT NULL COMMENT '前端IndexedDB本地ID，用于同步映射',
`user_id`         BIGINT UNSIGNED     NOT NULL COMMENT '所属用户ID（HR/招聘者）',
`candidate_id`    BIGINT UNSIGNED     NOT NULL COMMENT '关联的候选人ID',
`local_candidate_id` VARCHAR(64)      NOT NULL COMMENT '前端候选人的local_id，用于同步时匹配',
    -- 记录类型枚举
    `history_type`    VARCHAR(32)         NOT NULL COMMENT '互动类型：saved_candidate, status_change, chat_message, note_added, sequence_bound, sequence_unbound, followup_set, followup_completed, voice_memo, temperature_change, field_updated, message_sent, pipeline_moved, ai_message',
    `title`           VARCHAR(255)        NOT NULL COMMENT '历史记录标题（如 "Status change", "Chat message"）',
    `description`     TEXT                COMMENT '详细描述（如 "Saved candidate Minchae Hwang"）',

    -- 操作者信息
    `actor_type`      VARCHAR(16)         NOT NULL DEFAULT 'user' COMMENT '操作者类型：user(用户), system(系统), ai(AI助手)',
    `actor_name`      VARCHAR(100)        COMMENT '操作者名称（冗余存储，方便展示）',

    `related_sequence_id`    BIGINT UNSIGNED COMMENT '关联的Sequence ID（当history_type为sequence_bound/unbound时）',
    `local_sequence_id`      VARCHAR(64)     COMMENT '前端sequence的local_id',
    `related_message_id`     BIGINT UNSIGNED COMMENT '关联的Chat/Message ID（当history_type为chat_message/message_sent时）',
    `local_message_id`       VARCHAR(64)     COMMENT '前端message的local_id',
    `related_step_id`        BIGINT UNSIGNED COMMENT '关联的Sequence Step ID',
    `local_step_id`          VARCHAR(64)     COMMENT '前端step的local_id',
    `related_note_id`        BIGINT UNSIGNED COMMENT '关联的Note ID（当history_type为note_added时）',
    `local_note_id`          VARCHAR(64)     COMMENT '前端note的local_id',

    -- 状态变更前后值（当history_type为status_change/pipeline_moved/temperature_change/field_updated时使用）
    `old_value`       VARCHAR(255)        COMMENT '变更前的值',
    `new_value`       VARCHAR(255)        COMMENT '变更后的值',
    `changed_field`   VARCHAR(64)         COMMENT '变更的字段名（如 pipeline_stage, temperature, full_name 等）',

    -- 消息/聊天内容快照（冗余存储，方便时间线展示）
    `content_snapshot` TEXT               COMMENT '内容快照（聊天记录内容、笔记内容、语音转文字内容等）',

    -- 元数据（JSON格式，存储各类型特有的扩展字段）
    `metadata`        JSON                COMMENT '扩展元数据：如 { "sequence_name": "Sr. Director Role", "step_order": 1, "followup_date": "2026-05-10T14:00:00Z" }',

    -- 同步相关字段
    `sync_status`     VARCHAR(16)         NOT NULL DEFAULT 'synced' COMMENT '同步状态：synced(已同步), pending(待同步), conflict(冲突)',
    `sync_version`    INT UNSIGNED        NOT NULL DEFAULT 1 COMMENT '同步版本号，乐观锁用',

    -- 时间戳
    `history_time`    DATETIME(3)         NOT NULL COMMENT '事件发生时间（前端传入，用户操作时的时间）',
    `created_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '后端创建时间',
    `updated_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '后端更新时间',
    `deleted_at`      DATETIME(3)         DEFAULT NULL COMMENT '软删除时间',

    -- 索引
    UNIQUE KEY `uk_local_id_user` (`local_id`, `user_id`),
    KEY `idx_user_candidate` (`user_id`, `candidate_id`),
    KEY `idx_candidate_history_time` (`candidate_id`, `history_time`),
    KEY `idx_history_type` (`history_type`),
    KEY `idx_sync_status` (`sync_status`),
    KEY `idx_created_at` (`created_at`),
    KEY `idx_deleted_at` (`deleted_at`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人历史互动记录（时间线）';


-- ------------------------------------------------------------
-- 2. candidate_history_detail 扩展详情表
-- 针对聊天记录等长文本内容的详细存储
-- 主表的 content_snapshot 用于列表展示，详情表存储完整内容
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `candidate_history_detail` (
`id`              BIGINT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
`history_id`      BIGINT UNSIGNED     NOT NULL COMMENT '关联的candidate_history主表ID',
`local_id`        VARCHAR(64)         NOT NULL COMMENT '前端IndexedDB本地ID',
`user_id`         BIGINT UNSIGNED     NOT NULL COMMENT '所属用户ID',

    -- 完整内容（大字段单独存储）
    `full_content`    LONGTEXT            COMMENT '完整内容（完整聊天记录、长笔记、语音转文字全文等）',

    -- 聊天记录特有字段
    `chat_direction`  VARCHAR(16)         COMMENT '聊天方向：inbound(候选人发来), outbound(用户发出)',

    -- 同步字段
    `sync_status`     VARCHAR(16)         NOT NULL DEFAULT 'synced',
    `sync_version`    INT UNSIGNED        NOT NULL DEFAULT 1,

    `created_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deleted_at`      DATETIME(3)         DEFAULT NULL,

    UNIQUE KEY `uk_local_id_user` (`local_id`, `user_id`),
    KEY `idx_history_id` (`history_id`),
    KEY `idx_deleted_at` (`deleted_at`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='历史记录详情（聊天记录/语音等长内容）';


-- ------------------------------------------------------------
-- 3. candidate_history_type 类型枚举字典表（可选，用于前端下拉筛选）
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `candidate_history_type` (
`id`              SMALLINT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
`type_code`       VARCHAR(32)         NOT NULL UNIQUE COMMENT '类型编码',
`type_name`       VARCHAR(50)         NOT NULL COMMENT '类型显示名称（如 "Status Change"）',
`type_name_zh`    VARCHAR(50)         COMMENT '中文名称',
`icon`            VARCHAR(50)         COMMENT '图标标识',
`color`           VARCHAR(16)         COMMENT '展示颜色',
`sort_order`      SMALLINT UNSIGNED   NOT NULL DEFAULT 0 COMMENT '排序',
`is_active`       TINYINT(1)          NOT NULL DEFAULT 1 COMMENT '是否启用',
`created_at`      DATETIME(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP(3)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='历史记录类型字典';

-- 预插入类型数据
INSERT INTO `candidate_history_type` (`type_code`, `type_name`, `type_name_zh`, `icon`, `color`, `sort_order`) VALUES
('saved_candidate',     'Saved Candidate',       '保存候选人',       'user-plus',     '#4F46E5', 1),
('status_change',       'Status Change',         '状态变更',         'refresh-cw',    '#F59E0B', 2),
('pipeline_moved',      'Pipeline Moved',        'Pipeline移动',     'git-commit',    '#8B5CF6', 3),
('chat_message',        'Chat Message',          '聊天消息',         'message-circle','#10B981', 4),
('message_sent',        'Message Sent',          '消息已发送',       'send',          '#3B82F6', 5),
('note_added',          'Note Added',            '添加笔记',         'edit-3',        '#6B7280', 6),
('sequence_bound',      'Sequence Bound',        '绑定序列',         'link',          '#EC4899', 7),
('sequence_unbound',    'Sequence Unbound',      '解绑序列',         'unlink',        '#EF4444', 8),
('sequence_step_executed','Sequence Step Executed','序列步骤执行',    'play-circle',   '#06B6D4', 9),
('followup_set',        'Follow-up Set',         '设置跟进',         'bell',          '#F97316', 10),
('followup_completed',  'Follow-up Completed',   '跟进完成',         'check-circle',  '#22C55E', 11),
('followup_missed',     'Follow-up Missed',      '跟进错过',         'alert-circle',  '#EF4444', 12),
('voice_memo',          'Voice Memo',            '语音备忘录',       'mic',           '#A855F7', 13),
('temperature_change',  'Temperature Change',    '热度变更',         'thermometer',   '#EF4444', 14),
('field_updated',       'Field Updated',         '字段更新',         'edit',          '#6366F1', 15),
('ai_message',          'AI Message',            'AI消息',           'cpu',           '#8B5CF6', 16),
('call_log',            'Call Log',              '通话记录',         'phone',         '#14B8A6', 17),
('email_sent',          'Email Sent',            '邮件已发送',       'mail',          '#3B82F6', 18),
('meeting_scheduled',   'Meeting Scheduled',     '会议已安排',       'calendar',      '#F59E0B', 19),
('imported',            'Imported',              '导入',             'download',      '#6B7280', 20);'''

new_history_block = '''### 8. History相关

-- ------------------------------------------------------------
-- candidate_history 历史记录表（阶段2精简为单表）
-- 候选人的所有互动记录（时间线），append-only，不可编辑/删除
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `candidate_history` (
  `id`              BIGINT UNSIGNED     AUTO_INCREMENT PRIMARY KEY COMMENT '后端自增主键',
  `local_id`        VARCHAR(64)         NOT NULL COMMENT '前端IndexedDB本地ID，用于同步映射',
  `user_id`         BIGINT UNSIGNED     NOT NULL COMMENT '所属用户ID',
  `candidate_id`    BIGINT UNSIGNED     NOT NULL COMMENT '关联的候选人ID',
  `local_candidate_id` VARCHAR(64)      NOT NULL COMMENT '前端候选人的local_id',
  `history_type`    VARCHAR(32)         NOT NULL COMMENT '互动类型代码',
  `title`           VARCHAR(255)        NOT NULL COMMENT '历史记录标题',
  `description`     TEXT                COMMENT '详细描述',
  `actor_type`      VARCHAR(16)         DEFAULT 'user' COMMENT '操作者类型：user/system/ai',
  `actor_name`      VARCHAR(100)        COMMENT '操作者名称',
  `old_value`       VARCHAR(255)        COMMENT '变更前的值',
  `new_value`       VARCHAR(255)        COMMENT '变更后的值',
  `changed_field`   VARCHAR(64)         COMMENT '变更的字段名',
  `content_snapshot` TEXT               COMMENT '内容快照（列表展示用）',
  `full_content`    LONGTEXT            COMMENT '完整内容（替代原 detail 子表）',
  `metadata`        JSON                COMMENT '扩展元数据',
  `history_time`    DATETIME            NOT NULL COMMENT '事件发生时间',
  `created_at`      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_local_id_user` (`local_id`, `user_id`),
  KEY `idx_user_candidate` (`user_id`, `candidate_id`),
  KEY `idx_candidate_history_time` (`candidate_id`, `history_time`),
  KEY `idx_history_type` (`history_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人历史互动记录（时间线）';'''

content = content.replace(old_history_block, new_history_block)
print("[OK] candidate_history 已精简为单表")

with open("linkedin_scrm_backend_design.md", "w", encoding="utf-8") as f:
    f.write(content)

print("\nSQL 表结构修改完成。")
