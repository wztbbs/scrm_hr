package com.scrm.dto;

import lombok.Data;

@Data
public class AiMessageRequest {
    private Long candidateId;
    private String localCandidateId;
    private String pipelineStage;
    private Integer currentStep;
    private String stepName;
    private String lastMessageSentAt;
    private Boolean candidateReplied;
    private String jobTitle;
    private String jobFunction;
}
