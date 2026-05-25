package com.scrm.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class PaddleWebhookVerifier {

    private static final Logger log = LoggerFactory.getLogger(PaddleWebhookVerifier.class);

    public boolean verify(String payload, String signatureHeader, String secret) {
        if (signatureHeader == null || secret == null) {
            return false;
        }

        // Format: ts=1234567890;h1=base64signature
        String ts = null;
        String h1 = null;
        for (String part : signatureHeader.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("ts=")) {
                ts = trimmed.substring(3);
            } else if (trimmed.startsWith("h1=")) {
                h1 = trimmed.substring(3);
            }
        }

        if (ts == null || h1 == null) {
            return false;
        }

        try {
            String signedPayload = ts + ":" + payload;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKeySpec);
            byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
            String expected = Base64.getEncoder().encodeToString(hash);
            return expected.equals(h1);
        } catch (Exception e) {
            log.error("Paddle webhook signature verification failed", e);
            return false;
        }
    }
}
