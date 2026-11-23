CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `uuid` VARCHAR(64) NOT NULL UNIQUE COMMENT '浏览器端生成的 UUID（前端 userId）',
  `email` varchar(255) NOT NULL DEFAULT '' COMMENT '用户邮箱（登录账号）',
  `password_hash` varchar(255) DEFAULT NULL COMMENT '密码哈希（支持邮箱登录）',
  `timezone` varchar(64) DEFAULT 'UTC' COMMENT '用户时区',
  `locale` varchar(16) DEFAULT 'en-US' COMMENT '语言设置',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '账号是否启用',
  `daily_ai_used` int NOT NULL DEFAULT 0 COMMENT '今日已用AI消息数',
  `daily_ai_reset_at` datetime DEFAULT NULL COMMENT '每日计数重置时间（用于判断是否需要清零）',
  `merged_to_user_id` bigint unsigned DEFAULT NULL COMMENT '合并到哪个用户',
  `merged_at` datetime DEFAULT NULL COMMENT '合并时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uuid` (`uuid`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plan_code` varchar(64) NOT NULL COMMENT '套餐编码：pro_monthly, pro_yearly等',
  `name` varchar(128) NOT NULL COMMENT '套餐名称（Pro Monthly等）',
  `description` text COMMENT '套餐描述',
  `price` decimal(10,2) NOT NULL COMMENT '价格金额',
  `currency` varchar(8) NOT NULL DEFAULT 'USD' COMMENT '货币',
  `billing_cycle` enum('monthly','yearly','lifetime') NOT NULL COMMENT '计费周期',
  `features` json DEFAULT NULL COMMENT '套餐包含的功能列表JSON',
  `daily_connect_limit` int NOT NULL DEFAULT 50 COMMENT '该套餐的每日连接上限',
  `sequence_limit` int NOT NULL DEFAULT 10 COMMENT '序列数量上限',
  `total_candidate_limit` int NOT NULL DEFAULT 20 COMMENT '管理的候选人上限',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否在售',
  `is_purchasable` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否可购买（0=仅内部赠送/不可购买）',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_code` (`plan_code`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅套餐表';

INSERT INTO `subscription_plans` (`plan_code`, `name`, `description`, `price`, `currency`, `billing_cycle`, `features`, `daily_connect_limit`, `sequence_limit`, `total_candidate_limit`, `sort_order`, `is_purchasable`) VALUES
('free', 'Free', '基础免费版', 0.00, 'USD', 'monthly', '["20 candidates","1 Sequence","10 AI/day"]', 10, 1, 20, 1, 1),
('pro_monthly', 'Pro Monthly', '专业版月付 $29/月', 29.00, 'USD', 'monthly', '["Unlimited candidates","10 outreach sequences","50 AI messages/day","Priority support"]', 50, 10, 999999, 2, 1),
('pro_yearly', 'Pro Yearly', '专业版年付 $290/年（省$58）', 290.00, 'USD', 'yearly', '["Unlimited candidates","10 outreach sequences","50 AI messages/day","Priority support"]', 50, 10, 999999, 3, 1),
('pro_beta', 'Pro Beta', '赠送体验版', 0.00, 'USD', 'monthly', '["Unlimited candidates","10 outreach sequences","50 AI messages/day","Priority support"]', 50, 10, 999999, 4, 0);

-- ============================================================
-- LinkedIn SCRM 支付表结构（Paddle + Stripe 双兼容）
-- 说明：当前阶段接入 Paddle，保留 Stripe 字段便于未来切换
-- ============================================================

CREATE TABLE IF NOT EXISTS `subscriptions` (
                                               `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                                               `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
                                               `plan_id` bigint unsigned NOT NULL COMMENT '关联 subscription_plans.id',

    -- 订阅状态
                                               `status` enum('active','cancelled','expired','past_due','paused') NOT NULL DEFAULT 'active' COMMENT '订阅状态',
                                               `current_period_start` datetime NOT NULL COMMENT '当前计费周期开始',
                                               `current_period_end` datetime NOT NULL COMMENT '当前计费周期结束',
                                               `cancel_at_period_end` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否在当前周期结束后取消',
                                               `cancelled_at` datetime DEFAULT NULL COMMENT '取消操作时间',

    -- Paddle 字段（新增）
                                               `paddle_subscription_id` varchar(128) DEFAULT NULL COMMENT 'Paddle 订阅 ID',
                                               `paddle_customer_id` varchar(128) DEFAULT NULL COMMENT 'Paddle 客户 ID',

    -- Stripe 字段（保留，阶段3可能切回）
                                               `stripe_subscription_id` varchar(128) DEFAULT NULL COMMENT 'Stripe 订阅 ID',
                                               `stripe_customer_id` varchar(128) DEFAULT NULL COMMENT 'Stripe 客户 ID',

    -- 支付渠道标识
                                               `payment_provider` enum('paddle','stripe','paypal','manual') DEFAULT NULL COMMENT '实际支付渠道',

                                               `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                               PRIMARY KEY (`id`),
                                               UNIQUE KEY `uk_paddle_subscription` (`paddle_subscription_id`),
                                               UNIQUE KEY `uk_stripe_subscription` (`stripe_subscription_id`),
                                               KEY `idx_user_id` (`user_id`),
                                               KEY `idx_plan_id` (`plan_id`),
                                               KEY `idx_status` (`status`),
                                               KEY `idx_period_end` (`current_period_end`),
                                               KEY `idx_payment_provider` (`payment_provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅表（Paddle/Stripe 兼容）';


CREATE TABLE IF NOT EXISTS `orders` (
                                        `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                                        `order_no` varchar(64) NOT NULL COMMENT '内部订单号（如 ORD-20260519-xxx）',
                                        `user_id` bigint unsigned NOT NULL COMMENT '下单用户',
                                        `plan_id` bigint unsigned NOT NULL COMMENT '购买套餐',
                                        `subscription_id` bigint unsigned DEFAULT NULL COMMENT '关联 subscriptions.id（续费/升级时）',

    -- 订单状态
                                        `status` enum('pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending' COMMENT '订单状态',
                                        `amount` decimal(10,2) NOT NULL COMMENT '支付金额',
                                        `currency` varchar(8) NOT NULL DEFAULT 'USD' COMMENT '货币',

    -- Paddle 字段（新增）
                                        `paddle_transaction_id` varchar(128) DEFAULT NULL COMMENT 'Paddle 交易 ID（transaction.completed 回调时写入）',
                                        `paddle_subscription_id` varchar(128) DEFAULT NULL COMMENT 'Paddle 订阅 ID（关联）',
                                        `paddle_checkout_id` varchar(128) DEFAULT NULL COMMENT 'Paddle Checkout Session ID',

    -- Stripe 字段（保留）
                                        `stripe_session_id` varchar(128) DEFAULT NULL COMMENT 'Stripe Checkout Session ID',

                                        `paid_at` datetime DEFAULT NULL COMMENT '实际支付时间',
                                        `billing_cycle` enum('monthly','yearly','lifetime') NOT NULL COMMENT '计费周期',
                                        `metadata` json DEFAULT NULL COMMENT '扩展信息（Paddle webhook payload 快照等）',

                                        `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                        `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                        PRIMARY KEY (`id`),
                                        UNIQUE KEY `uk_order_no` (`order_no`),
                                        UNIQUE KEY `uk_paddle_transaction` (`paddle_transaction_id`),
                                        KEY `idx_user_id` (`user_id`),
                                        KEY `idx_plan_id` (`plan_id`),
                                        KEY `idx_subscription_id` (`subscription_id`),
                                        KEY `idx_status` (`status`),
                                        KEY `idx_paddle_checkout` (`paddle_checkout_id`),
                                        KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表（Paddle/Stripe 兼容）';

CREATE TABLE IF NOT EXISTS `candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '后端自增主键',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `full_name` varchar(128) NOT NULL COMMENT '候选人全名',
  `headline` varchar(255) DEFAULT NULL COMMENT 'LinkedIn头衔/Headline',
  `job_title` varchar(128) DEFAULT NULL COMMENT '职位名称',
  `company` varchar(128) DEFAULT NULL COMMENT '当前公司',
  `location` varchar(128) DEFAULT NULL COMMENT '所在地',
  `linkedin_url` varchar(512) NOT NULL COMMENT 'LinkedIn个人主页URL',
  `linkedin_id` varchar(64) DEFAULT NULL COMMENT 'LinkedIn用户ID',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱地址',
  `phone` varchar(32) DEFAULT NULL COMMENT '电话号码',
  `avatar_url` varchar(512) DEFAULT NULL COMMENT '头像URL',
  `connection_degree` enum('1st','2nd','3rd','out_of_network') DEFAULT NULL COMMENT '连接度数（1度/2度/3度）',
  `temperature` enum('hot','warm','cold','dead','new') NOT NULL DEFAULT 'new' COMMENT '候选人温度/意向度',
  `is_ai_suggested_temp` tinyint(1) NOT NULL DEFAULT 0 COMMENT '温度是否为AI建议',
  `source` enum('linkedin_profile','manual_entry','import','linkedin_chat') NOT NULL DEFAULT 'linkedin_profile' COMMENT '来源',
  `tags` json DEFAULT NULL COMMENT '标签数组JSON',
  `raw_profile_data` json DEFAULT NULL COMMENT 'LinkedIn原始抓取数据JSON（建议限制64KB）',
  `last_activity_at` datetime DEFAULT NULL COMMENT '最后活动时间',
  `next_followup_at` datetime DEFAULT NULL COMMENT '用户设定的下次跟进时间',
  `next_followup_source` enum('manual','sequence','none') DEFAULT 'none' COMMENT '时间来源',
  `next_followup_sequence_step_id` bigint unsigned DEFAULT NULL COMMENT '如果是sequence来源，关联哪一步',
  `pipeline_stage` varchar(64) NOT NULL DEFAULT 'new' COMMENT 'Pipeline阶段: unclaimed,new,messaged,talking,done,delete',
  `pipeline_position` int NOT NULL DEFAULT 0 COMMENT '阶段内排序位置（拖拽用）',
  `pipeline_entered_at` datetime DEFAULT NULL COMMENT '进入当前阶段时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `uk_user_linkedin_id` (`user_id`, `linkedin_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_temperature` (`temperature`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_last_activity` (`last_activity_at`),
  KEY `idx_pipeline_stage` (`pipeline_stage`),
  KEY `idx_user_next_followup` (`user_id`, `next_followup_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人主表';

CREATE TABLE IF NOT EXISTS `candidate_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL COMMENT '关联candidates.id',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `content` text NOT NULL COMMENT '笔记内容',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_candidate_id` (`candidate_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人笔记表（Key Memory）';

-- pipeline_boards, pipeline_stages, pipeline_candidates 已废弃，pipeline 信息合并到 candidates 表

CREATE TABLE IF NOT EXISTS `sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `name` varchar(128) NOT NULL COMMENT '序列名称（如 Sr. Director Role Sequence）',
  `description` text DEFAULT NULL COMMENT '序列描述',
  `job_title` varchar(128) DEFAULT NULL COMMENT '岗位名称',
  `job_function` varchar(128) DEFAULT NULL COMMENT '岗位职能类别',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
  `step_count` int NOT NULL DEFAULT 0 COMMENT '步骤数量',
  `is_template` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为系统预置模板',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='序列模板表';

CREATE TABLE IF NOT EXISTS `sequence_steps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sequence_id` bigint unsigned NOT NULL COMMENT '关联序列',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户',
  `step_number` int unsigned NOT NULL COMMENT '步骤序号（1, 2, 3...）',
  `name` varchar(128) NOT NULL COMMENT '步骤名称（Connection Request, Follow-up A等）',
  `action_type` enum('connection_request','message','inmail','endorse','visit_profile','custom') NOT NULL DEFAULT 'message' COMMENT '动作类型',
  `delay_type` enum('immediately','minutes','hours','days','weeks') NOT NULL DEFAULT 'days' COMMENT '延迟类型',
  `delay_value` int unsigned NOT NULL DEFAULT 1 COMMENT '延迟数值（如3天中的3）',
  `message_template` text DEFAULT NULL COMMENT '消息模板内容',
  `message_subject` varchar(255) DEFAULT NULL COMMENT '消息主题（InMail用）',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sequence_step_num` (`sequence_id`, `step_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='序列步骤表';

CREATE TABLE IF NOT EXISTS `candidate_sequences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
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
  UNIQUE KEY `uk_candidate_sequence` (`candidate_id`, `sequence_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人与序列绑定表';

CREATE TABLE IF NOT EXISTS `candidate_history` (
  `id`              BIGINT UNSIGNED     AUTO_INCREMENT PRIMARY KEY COMMENT '后端自增主键',
  `user_id`         BIGINT UNSIGNED     NOT NULL COMMENT '所属用户ID',
  `candidate_id`    BIGINT UNSIGNED     NOT NULL COMMENT '关联的候选人ID',
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
  KEY `idx_user_candidate` (`user_id`, `candidate_id`),
  KEY `idx_candidate_history_time` (`candidate_id`, `history_time`),
  KEY `idx_history_type` (`history_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='候选人历史互动记录（时间线）';

CREATE TABLE IF NOT EXISTS `events` (
  `id` bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  `user_id` bigint unsigned NOT NULL,
  `event_name` varchar(64) NOT NULL,
  `event_data` json DEFAULT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user_event` (`user_id`, `event_name`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='埋点事件日志表';

CREATE TABLE IF NOT EXISTS `email_verifications` (
                                                     `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                                                     `email` varchar(255) NOT NULL COMMENT '目标邮箱',
                                                     `user_id` bigint unsigned DEFAULT NULL COMMENT '关联用户ID（可选）',
                                                     `code` varchar(16) NOT NULL COMMENT '6位验证码',
                                                     `type` varchar(32) NOT NULL DEFAULT 'email_bind' COMMENT '验证类型：email_bind/password_reset等',
                                                     `status` enum('unused','used','expired') NOT NULL DEFAULT 'unused' COMMENT '状态',
                                                     `expires_at` datetime NOT NULL COMMENT '过期时间（创建时间+10分钟）',
                                                     `used_at` datetime DEFAULT NULL COMMENT '验证成功时间',
                                                     `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                     PRIMARY KEY (`id`),
                                                     UNIQUE KEY `uk_email` (`email`),
                                                     KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮箱验证码表（替代Redis）';
