package com.scrm.dto;

import lombok.Data;

import java.util.List;

@Data
public class AiMessageResponse {
    private StrategyResult strategy;
    private boolean passed;
    private List<String> issues;
    private String recommendedTone;
    private List<MessageVersion> versions;

    @Data
    public static class MessageVersion {
        private String tone;
        private String content;
        private boolean recommended;
    }
}
