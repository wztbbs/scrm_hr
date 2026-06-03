package com.scrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scrm.config.PaddleProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class PaddleApiService {

    @Autowired
    private PaddleProperties paddleProperties;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    public Map<String, Object> createCheckout(String priceId, String email,
                                               String returnUrl, String cancelUrl,
                                               Map<String, Object> customData) {
        String url = paddleProperties.getBaseUrl() + "/checkouts";

        Map<String, Object> body = new HashMap<>();
        body.put("items", List.of(Map.of("price_id", priceId, "quantity", 1)));
        body.put("customer", Map.of("email", email));
        if (returnUrl != null) {
            body.put("return_url", returnUrl);
        }
        if (cancelUrl != null) {
            body.put("cancel_url", cancelUrl);
        }
        if (customData != null) {
            body.put("custom_data", customData);
        }

        // Debug: log request params
        String apiKey = paddleProperties.getApiKey();
        System.out.println("[PADDLE_DEBUG] environment=" + paddleProperties.getEnvironment());
        System.out.println("[PADDLE_DEBUG] baseUrl=" + paddleProperties.getBaseUrl());
        System.out.println("[PADDLE_DEBUG] url=" + url);
        System.out.println("[PADDLE_DEBUG] apiKeyPrefix=" + (apiKey != null && apiKey.length() > 10 ? apiKey.substring(0, 10) + "..." : "null/empty"));
        System.out.println("[PADDLE_DEBUG] apiKeyLength=" + (apiKey != null ? apiKey.length() : 0));
        System.out.println("[PADDLE_DEBUG] priceId=" + priceId);
        System.out.println("[PADDLE_DEBUG] email=" + email);
        System.out.println("[PADDLE_DEBUG] returnUrl=" + returnUrl);
        System.out.println("[PADDLE_DEBUG] cancelUrl=" + cancelUrl);
        try {
            System.out.println("[PADDLE_DEBUG] body=" + objectMapper.writeValueAsString(body));
        } catch (Exception e) {
            System.out.println("[PADDLE_DEBUG] body serialize failed: " + e.getMessage());
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        System.out.println("[PADDLE_DEBUG] responseStatus=" + response.getStatusCode());
        if (response.getBody() != null) {
            try {
                System.out.println("[PADDLE_DEBUG] responseBody=" + objectMapper.writeValueAsString(response.getBody()));
            } catch (Exception e) {
                System.out.println("[PADDLE_DEBUG] responseBody serialize failed: " + e.getMessage());
            }
        }
        if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
            return (Map<String, Object>) response.getBody().get("data");
        }
        throw new RuntimeException("Paddle checkout failed: " + response.getStatusCode());
    }

    public void cancelSubscription(String paddleSubscriptionId, String effectiveFrom) {
        String url = paddleProperties.getBaseUrl() + "/subscriptions/" + paddleSubscriptionId + "/cancel";

        Map<String, Object> body = new HashMap<>();
        body.put("effectiveFrom", effectiveFrom);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(paddleProperties.getApiKey());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Paddle cancel subscription failed: " + response.getStatusCode());
        }
    }
}
