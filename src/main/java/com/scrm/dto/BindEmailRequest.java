package com.scrm.dto;

import lombok.Data;

@Data
public class BindEmailRequest {
    private String email;
    private String code;
}
