package com.scrm.dto;

import lombok.Data;

@Data
public class StrategyResult {
    private String intent;
    private String goal;
    private String reason;
    private String keyInsight;
}
