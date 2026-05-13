package com.scrm.dto;

import lombok.Data;

import java.util.List;

@Data
public class OptimizeResult {
    private boolean passed;
    private List<String> issues;
    private Versions versions;

    @Data
    public static class Versions {
        private String direct;
        private String gentle;
        private String casual;
    }
}
