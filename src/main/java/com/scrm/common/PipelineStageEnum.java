package com.scrm.common;

import java.util.Arrays;
import java.util.List;

public enum PipelineStageEnum {
    UNCLAIMED("unclaimed", "Unclaimed", "#9CA3AF", 0),
    NEW("new", "New", "#3B82F6", 1),
    MESSAGED("messaged", "Messaged", "#8B5CF6", 2),
    TALKING("talking", "Talking", "#F59E0B", 3),
    DONE("done", "Done", "#10B981", 4),
    DELETE("delete", "Delete", "#6B7280", 99);

    private final String value;
    private final String label;
    private final String color;
    private final int sortOrder;

    PipelineStageEnum(String value, String label, String color, int sortOrder) {
        this.value = value;
        this.label = label;
        this.color = color;
        this.sortOrder = sortOrder;
    }

    public String getValue() {
        return value;
    }

    public String getLabel() {
        return label;
    }

    public String getColor() {
        return color;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public static List<PipelineStageEnum> getDisplayStages() {
        // unclaimed 是系统后台暂存池，不在前端 Pipeline 看板展示
        return Arrays.asList(NEW, MESSAGED, TALKING, DONE);
    }

    public static List<PipelineStageEnum> getAllStages() {
        return Arrays.asList(values());
    }

    public static PipelineStageEnum fromValue(String value) {
        if (value == null) return null;
        for (PipelineStageEnum stage : values()) {
            if (stage.value.equalsIgnoreCase(value)) {
                return stage;
            }
        }
        return null;
    }

    public static boolean isTerminalOrHidden(String value) {
        PipelineStageEnum stage = fromValue(value);
        return stage == DELETE;
    }
}
