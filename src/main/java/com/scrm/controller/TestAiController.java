package com.scrm.controller;

import com.scrm.common.ApiResponse;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/test-ai")
public class TestAiController {

    private static final String API_URL = "https://router.nerver.cc/v1/chat/completions";
    private static final String API_KEY = "sk-zBuKgh2JRFN7DTOwn4oJdgYFbhI81xLalgLp8Jg3lN9paX5l";
    private static final String MODEL = "gpt-5.5";

    private final RestTemplate restTemplate;

    public TestAiController() {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);    // 连接超时 10s
        factory.setReadTimeout(300_000);      // 读超时 300s（LLM 推理耗时长）
        this.restTemplate = new RestTemplate(factory);
    }

    @PostMapping("/chat")
    public ApiResponse<Map<String, Object>> chat(@RequestBody Map<String, String> body) {
        String message = body.get("message");
        if (message == null || message.trim().isEmpty()) {
            return ApiResponse.error(400, "message parameter is required");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", "application/json");
        headers.set("Authorization", "Bearer " + API_KEY);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", MODEL);
//        requestBody.put("reasoning_effort", "high");

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", message);
        messages.add(userMessage);
        requestBody.put("messages", messages);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    API_URL,
                    HttpMethod.POST,
                    entity,
                    Map.class
            );
            return ApiResponse.success(response.getBody());
        } catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("error", e.getMessage());
            return ApiResponse.error(500, "AI API call failed: " + e.getMessage());
        }
    }
}
