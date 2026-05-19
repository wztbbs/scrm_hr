package com.scrm.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "paddle")
public class PaddleProperties {
    private String apiKey;
    private String webhookSecret;
    private String environment = "sandbox";
    private Map<String, String> priceIds = new HashMap<>();

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getWebhookSecret() {
        return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
        this.webhookSecret = webhookSecret;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public Map<String, String> getPriceIds() {
        return priceIds;
    }

    public void setPriceIds(Map<String, String> priceIds) {
        this.priceIds = priceIds;
    }

    public boolean isSandbox() {
        return "sandbox".equalsIgnoreCase(environment);
    }

    public String getBaseUrl() {
        return isSandbox() ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
    }
}
