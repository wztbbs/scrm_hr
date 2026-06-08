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

    /**
     * Get or create a Paddle customer by email.
     * First queries existing customer by email, creates one if not found.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getOrCreateCustomer(String email) {
        // 1. Try to find existing customer by email
        Map<String, Object> existingCustomer = findCustomerByEmail(email);
        if (existingCustomer != null) {
            System.out.println("[PADDLE_DEBUG] existing customer found: id=" + existingCustomer.get("id"));
            return existingCustomer;
        }

        // 2. Create new customer if not found
        System.out.println("[PADDLE_DEBUG] no existing customer found, creating new one for email=" + email);
        return createCustomer(email);
    }

    /**
     * Find a Paddle customer by email via GET /customers?email={email}.
     * Returns the first matching customer, or null if none found.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> findCustomerByEmail(String email) {
        String url = paddleProperties.getBaseUrl() + "/customers?email=" + email;

        String apiKey = paddleProperties.getApiKey();
        System.out.println("[PADDLE_DEBUG] findCustomer url=" + url);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(apiKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
            System.out.println("[PADDLE_DEBUG] findCustomer responseStatus=" + response.getStatusCode());
            if (response.getBody() != null) {
                try {
                    System.out.println("[PADDLE_DEBUG] findCustomer responseBody=" + objectMapper.writeValueAsString(response.getBody()));
                } catch (Exception e) {
                    System.out.println("[PADDLE_DEBUG] findCustomer responseBody serialize failed: " + e.getMessage());
                }
            }
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                List<Map<String, Object>> dataList = (List<Map<String, Object>>) response.getBody().get("data");
                if (dataList != null && !dataList.isEmpty()) {
                    return dataList.get(0);
                }
            }
        } catch (Exception e) {
            System.out.println("[PADDLE_DEBUG] findCustomer failed: " + e.getMessage());
        }
        return null;
    }

    /**
     * Create a new Paddle customer by email.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> createCustomer(String email) {
        String url = paddleProperties.getBaseUrl() + "/customers";

        Map<String, Object> body = new HashMap<>();
        body.put("email", email);

        // Debug: log request params
        String apiKey = paddleProperties.getApiKey();
        System.out.println("[PADDLE_DEBUG] environment=" + paddleProperties.getEnvironment());
        System.out.println("[PADDLE_DEBUG] baseUrl=" + paddleProperties.getBaseUrl());
        System.out.println("[PADDLE_DEBUG] url=" + url);
        System.out.println("[PADDLE_DEBUG] apiKeyPrefix=" + (apiKey != null && apiKey.length() > 10 ? apiKey.substring(0, 10) + "..." : "null/empty"));
        System.out.println("[PADDLE_DEBUG] apiKeyLength=" + (apiKey != null ? apiKey.length() : 0));
        System.out.println("[PADDLE_DEBUG] email=" + email);
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
        throw new RuntimeException("Paddle create customer failed: " + response.getStatusCode());
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
