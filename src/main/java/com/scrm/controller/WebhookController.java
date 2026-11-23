package com.scrm.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scrm.service.PaddleWebhookVerifier;
import com.scrm.service.WebhookService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    @Autowired
    private WebhookService webhookService;

    @Autowired
    private PaddleWebhookVerifier paddleWebhookVerifier;

    @Autowired
    private com.scrm.config.PaddleProperties paddleProperties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/paddle")
    public ResponseEntity<String> paddle(
            @RequestBody String payload,
            @RequestHeader("paddle-signature") String signature) {
        try {
            if (!paddleWebhookVerifier.verify(payload, signature, paddleProperties.getWebhookSecret())) {
                log.warn("Paddle webhook signature verification failed");
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized");
            }

            Map<String, Object> event = objectMapper.readValue(payload, new TypeReference<>() {});
            String eventType = (String) event.get("event_type");
            log.info("[PADDLE_WEBHOOK] Received event_type={}, payloadPreview={}", eventType,
                    payload.length() > 500 ? payload.substring(0, 500) + "..." : payload);
            webhookService.handlePaddleWebhook(event);
            return ResponseEntity.ok("OK");
        } catch (Exception e) {
            log.error("Error handling Paddle webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Error");
        }
    }
}
