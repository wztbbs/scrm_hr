package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.entity.SubscriptionPlan;
import com.scrm.service.SubscriptionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/subscription")
public class SubscriptionController {

    @Autowired
    private SubscriptionService subscriptionService;

    @GetMapping("/plans")
    public ApiResponse<Map<String, Object>> listPlans() {
        List<SubscriptionPlan> items = subscriptionService.listPlans();
        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        return ApiResponse.success(data);
    }

    @GetMapping("/current")
    public ApiResponse<Map<String, Object>> current() {
        return ApiResponse.success(subscriptionService.getCurrentSubscription());
    }

    @PostMapping("/checkout")
    public ApiResponse<Map<String, Object>> checkout(@RequestBody Map<String, Object> body) {
        String planCode = (String) body.get("plan_code");
        String successUrl = (String) body.get("success_url");
        String cancelUrl = (String) body.get("cancel_url");
        String couponCode = (String) body.get("coupon_code");
        return ApiResponse.success(subscriptionService.checkout(planCode, successUrl, cancelUrl, couponCode));
    }

    @PostMapping("/webhook")
    public ApiResponse<Map<String, Object>> webhook(@RequestBody Map<String, Object> body) {
        subscriptionService.handleWebhook(body);
        Map<String, Object> result = new HashMap<>();
        result.put("received", true);
        return ApiResponse.success(result);
    }

    @PostMapping("/cancel")
    public ApiResponse<Map<String, Object>> cancel(@RequestBody Map<String, Object> body) {
        boolean atPeriodEnd = (Boolean) body.getOrDefault("at_period_end", true);
        return ApiResponse.success(subscriptionService.cancelSubscription(atPeriodEnd));
    }
}
