package com.scrm.dto;

import lombok.Data;

@Data
public class SequenceStepRequest {
    private Integer stepNumber;
    private String name;
    private String actionType;
    private String delayType;
    private Integer delayValue;
    private String messageTemplate;
    private String messageSubject;
}
