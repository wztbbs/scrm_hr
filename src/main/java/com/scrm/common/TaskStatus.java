package com.scrm.common;

public enum TaskStatus {
    OVERDUE,    // 已逾期：next_followup_at < NOW()
    DUE_SOON,   // 即将到期：NOW() <= next_followup_at <= NOW() + 60min
    UPCOMING    // 今天待办：NOW() + 60min < next_followup_at <= 今天23:59
}
