package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.service.PipelineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/pipeline")
public class PipelineController {

    @Autowired
    private PipelineService pipelineService;

    @GetMapping("/stages")
    public ApiResponse<Map<String, Object>> listStages() {
        return ApiResponse.success(pipelineService.listStages());
    }
}
