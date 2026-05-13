package com.scrm.dto;

import lombok.Data;

@Data
public class FeedbackRequest {
    private String content;
    private String email;
    private String pageUrl;
    private String pluginVersion;
}
