package com.scrm.dto;

import lombok.Data;

@Data
public class ChatMessageRequest {
    private String candidateId;
    private String linkedinId;
    private String linkedinUrl;
    private String senderName;
    private String text;
    private Boolean isInbound;
    private String timestamp;
    private String conversationId;
    private String messageId;
}
