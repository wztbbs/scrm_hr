package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.dto.FeedbackRequest;
import com.scrm.service.FeedbackService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {

    @Autowired
    private FeedbackService feedbackService;

    @PostMapping("/feedback")
    public ApiResponse<Map<String, Object>> submitFeedback(@RequestBody FeedbackRequest request) {
        if (request.getContent() == null || request.getContent().trim().isEmpty()) {
            return ApiResponse.error("Content is required");
        }
        feedbackService.sendFeedback(request);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ApiResponse.success(result);
    }
}
