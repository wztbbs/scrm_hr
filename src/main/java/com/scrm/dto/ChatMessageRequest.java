package com.scrm.dto;

import lombok.Data;

@Data
public class ChatMessageRequest {
    private String linkedInId;
    private String linkedInUrl;
    private String senderName;
    private String text;
    private Boolean isInbound;
    private String timestamp;
    private String conversationId;
    private String messageId;
}
