package com.scrm.dto;

import lombok.Data;

import java.util.List;

@Data
public class SequenceRequest {
    private String name;
    private String description;
    private String jobTitle;
    private String jobFunction;
    private List<SequenceStepRequest> steps;
}
