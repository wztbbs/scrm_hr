package com.scrm.exception;

import java.util.Map;

public class QuotaExceededException extends BusinessException {
    private final String scenario;
    private final int used;
    private final int limit;
    private final Map<String, Object> extra;

    public QuotaExceededException(String scenario, int used, int limit, String message) {
        this(scenario, used, limit, message, null);
    }

    public QuotaExceededException(String scenario, int used, int limit, String message, Map<String, Object> extra) {
        super(429, message);
        this.scenario = scenario;
        this.used = used;
        this.limit = limit;
        this.extra = extra;
    }

    public String getScenario() {
        return scenario;
    }

    public int getUsed() {
        return used;
    }

    public int getLimit() {
        return limit;
    }

    public Map<String, Object> getExtra() {
        return extra;
    }
}
