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
                                               String successUrl, String cancelUrl,
                                               Map<String, Object> customData) {
        String url = paddleProperties.getBaseUrl() + "/checkouts";

        Map<String, Object> body = new HashMap<>();
        body.put("items", List.of(Map.of("priceId", priceId, "quantity", 1)));
        body.put("customer", Map.of("email", email));
        if (successUrl != null) {
            body.put("successUrl", successUrl);
        }
        if (cancelUrl != null) {
            body.put("cancelUrl", cancelUrl);
        }
        if (customData != null) {
            body.put("customData", customData);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(paddleProperties.getApiKey());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.POST, entity, Map.class);
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
