package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.service.WebhookService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    @Autowired
    private WebhookService webhookService;

    @PostMapping("/stripe")
    public ApiResponse<Map<String, Object>> stripe(@RequestBody Map<String, Object> payload) {
        webhookService.handleStripeWebhook(payload);
        Map<String, Object> result = new HashMap<>();
        result.put("received", true);
        return ApiResponse.success(result);
    }
}
