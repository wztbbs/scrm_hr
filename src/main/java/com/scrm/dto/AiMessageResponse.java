package com.scrm.dto;

import lombok.Data;

@Data
public class AiMessageResponse {
    private StrategyResult strategy;
    private String message;
}
