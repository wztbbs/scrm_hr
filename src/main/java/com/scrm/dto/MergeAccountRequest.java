package com.scrm.dto;

import lombok.Data;

@Data
public class MergeAccountRequest {
    private String email;
    private String code;
    private Long targetUserId;
    private String targetUuid;
}
