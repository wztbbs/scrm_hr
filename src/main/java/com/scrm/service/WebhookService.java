package com.scrm.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class WebhookService {

    public void handleStripeWebhook(Map<String, Object> payload) {
        // TODO: implement Stripe webhook handling
        // Verify signature, process events like invoice.payment_succeeded, subscription.updated, etc.
    }
}
