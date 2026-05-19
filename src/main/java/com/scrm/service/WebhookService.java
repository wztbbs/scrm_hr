package com.scrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scrm.dao.OrderMapper;
import com.scrm.dao.SubscriptionMapper;
import com.scrm.dao.sub.SubOrderMapper;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Order;
import com.scrm.entity.Subscription;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
import java.util.Map;

@Service
public class WebhookService {

    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);

    @Autowired
    private SubOrderMapper subOrderMapper;
    @Autowired
    private OrderMapper orderMapper;
    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;
    @Autowired
    private SubscriptionMapper subscriptionMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional
    @SuppressWarnings("unchecked")
    public void handlePaddleWebhook(Map<String, Object> payload) {
        String eventType = (String) payload.get("event_type");
        Map<String, Object> data = (Map<String, Object>) payload.get("data");
        if (data == null) {
            log.warn("Paddle webhook data is null");
            return;
        }

        switch (eventType) {
            case "transaction.completed" -> handleTransactionCompleted(data);
            case "subscription.created" -> handleSubscriptionCreated(data);
            case "subscription.updated" -> handleSubscriptionUpdated(data);
            case "subscription.canceled" -> handleSubscriptionCanceled(data);
            case "subscription.past_due", "subscription.payment_failed" -> handleSubscriptionPastDue(data);
            default -> log.info("Unhandled Paddle event type: {}", eventType);
        }
    }

    @SuppressWarnings("unchecked")
    private void handleTransactionCompleted(Map<String, Object> data) {
        String paddleTransactionId = (String) data.get("id");
        if (paddleTransactionId == null) {
            return;
        }

        // Idempotency
        Order existing = subOrderMapper.selectByPaddleTransactionId(paddleTransactionId);
        if (existing != null) {
            log.info("Transaction {} already processed, skipping", paddleTransactionId);
            return;
        }

        Map<String, Object> customData = (Map<String, Object>) data.get("customData");
        Number orderIdNum = customData != null ? (Number) customData.get("order_id") : null;
        Long orderId = orderIdNum != null ? orderIdNum.longValue() : null;

        String paddleSubscriptionId = null;
        List<Map<String, Object>> items = (List<Map<String, Object>>) data.get("items");
        if (items != null && !items.isEmpty()) {
            Map<String, Object> item = items.get(0);
            Map<String, Object> subscription = (Map<String, Object>) item.get("subscription");
            if (subscription != null) {
                paddleSubscriptionId = (String) subscription.get("id");
            }
        }

        if (orderId != null) {
            subOrderMapper.updateStatusPaidById(orderId, "paid", paddleTransactionId, paddleSubscriptionId, new Date());
            log.info("Order {} updated to paid, transaction {}", orderId, paddleTransactionId);
        }
    }

    @SuppressWarnings("unchecked")
    private void handleSubscriptionCreated(Map<String, Object> data) {
        String paddleSubId = (String) data.get("id");
        if (paddleSubId == null) {
            return;
        }

        // Idempotency
        Subscription existing = subSubscriptionMapper.selectByPaddleSubscriptionId(paddleSubId);
        if (existing != null) {
            log.info("Subscription {} already exists, skipping", paddleSubId);
            return;
        }

        Map<String, Object> customData = (Map<String, Object>) data.get("customData");
        Number orderIdNum = customData != null ? (Number) customData.get("order_id") : null;
        Long orderId = orderIdNum != null ? orderIdNum.longValue() : null;

        Order order = orderId != null ? orderMapper.selectByPrimaryKey(orderId) : null;

        Subscription sub = new Subscription();
        sub.setUserId(order != null ? order.getUserId() : null);
        sub.setPlanId(order != null ? order.getPlanId() : null);
        sub.setPaddleSubscriptionId(paddleSubId);
        sub.setPaddleCustomerId((String) data.get("customerId"));
        sub.setStatus("active");
        sub.setPaymentProvider("paddle");

        Map<String, Object> currentBillingPeriod = (Map<String, Object>) data.get("currentBillingPeriod");
        if (currentBillingPeriod != null) {
            String startsAt = (String) currentBillingPeriod.get("startsAt");
            String endsAt = (String) currentBillingPeriod.get("endsAt");
            sub.setCurrentPeriodStart(parseIsoDate(startsAt));
            sub.setCurrentPeriodEnd(parseIsoDate(endsAt));
        }

        sub.setCreatedAt(new Date());
        sub.setUpdatedAt(new Date());
        subscriptionMapper.insertSelective(sub);

        // Link order to subscription
        if (orderId != null) {
            Order updateOrder = new Order();
            updateOrder.setId(orderId);
            updateOrder.setSubscriptionId(sub.getId());
            updateOrder.setUpdatedAt(new Date());
            orderMapper.updateByPrimaryKeySelective(updateOrder);
        }

        log.info("Subscription {} created for user {}", paddleSubId, sub.getUserId());
    }

    @SuppressWarnings("unchecked")
    private void handleSubscriptionUpdated(Map<String, Object> data) {
        String paddleSubId = (String) data.get("id");
        if (paddleSubId == null) {
            return;
        }

        Subscription sub = subSubscriptionMapper.selectByPaddleSubscriptionId(paddleSubId);
        if (sub == null) {
            log.warn("Subscription {} not found for update", paddleSubId);
            return;
        }

        Subscription update = new Subscription();
        update.setId(sub.getId());
        update.setStatus(mapPaddleStatus((String) data.get("status")));

        Map<String, Object> currentBillingPeriod = (Map<String, Object>) data.get("currentBillingPeriod");
        if (currentBillingPeriod != null) {
            String startsAt = (String) currentBillingPeriod.get("startsAt");
            String endsAt = (String) currentBillingPeriod.get("endsAt");
            update.setCurrentPeriodStart(parseIsoDate(startsAt));
            update.setCurrentPeriodEnd(parseIsoDate(endsAt));
        }

        update.setUpdatedAt(new Date());
        subscriptionMapper.updateByPrimaryKeySelective(update);

        // If renewal, create a new paid order record
        Map<String, Object> billingCycle = (Map<String, Object>) data.get("billingCycle");
        if (billingCycle != null && sub.getPlanId() != null && sub.getUserId() != null) {
            Order renewalOrder = new Order();
            renewalOrder.setOrderNo(generateOrderNo());
            renewalOrder.setUserId(sub.getUserId());
            renewalOrder.setPlanId(sub.getPlanId());
            renewalOrder.setSubscriptionId(sub.getId());
            renewalOrder.setStatus("paid");
            renewalOrder.setPaddleSubscriptionId(paddleSubId);
            renewalOrder.setCurrency("USD");
            renewalOrder.setPaidAt(new Date());
            renewalOrder.setBillingCycle(sub.getPlanId() != null ? inferBillingCycle((String) billingCycle.get("interval")) : "monthly");
            renewalOrder.setCreatedAt(new Date());
            renewalOrder.setUpdatedAt(new Date());
            orderMapper.insertSelective(renewalOrder);
            log.info("Renewal order {} created for subscription {}", renewalOrder.getOrderNo(), paddleSubId);
        }

        log.info("Subscription {} updated", paddleSubId);
    }

    private void handleSubscriptionCanceled(Map<String, Object> data) {
        String paddleSubId = (String) data.get("id");
        if (paddleSubId == null) {
            return;
        }

        Subscription sub = subSubscriptionMapper.selectByPaddleSubscriptionId(paddleSubId);
        if (sub == null) {
            return;
        }

        Subscription update = new Subscription();
        update.setId(sub.getId());
        update.setStatus("cancelled");
        update.setCancelledAt(new Date());
        update.setUpdatedAt(new Date());
        subscriptionMapper.updateByPrimaryKeySelective(update);

        log.info("Subscription {} canceled", paddleSubId);
    }

    private void handleSubscriptionPastDue(Map<String, Object> data) {
        String paddleSubId = (String) data.get("id");
        if (paddleSubId == null) {
            return;
        }

        Subscription sub = subSubscriptionMapper.selectByPaddleSubscriptionId(paddleSubId);
        if (sub == null) {
            return;
        }

        Subscription update = new Subscription();
        update.setId(sub.getId());
        update.setStatus("past_due");
        update.setUpdatedAt(new Date());
        subscriptionMapper.updateByPrimaryKeySelective(update);

        log.info("Subscription {} past_due", paddleSubId);
    }

    private String mapPaddleStatus(String paddleStatus) {
        if (paddleStatus == null) {
            return "active";
        }
        return switch (paddleStatus.toLowerCase()) {
            case "active" -> "active";
            case "canceled" -> "cancelled";
            case "past_due" -> "past_due";
            case "paused" -> "paused";
            default -> paddleStatus;
        };
    }

    private Date parseIsoDate(String iso) {
        if (iso == null) {
            return null;
        }
        try {
            java.time.Instant instant = java.time.Instant.parse(iso);
            return Date.from(instant);
        } catch (Exception e) {
            return null;
        }
    }

    private String inferBillingCycle(String interval) {
        if (interval == null) {
            return "monthly";
        }
        return switch (interval.toLowerCase()) {
            case "year" -> "yearly";
            case "month" -> "monthly";
            default -> interval;
        };
    }

    private String generateOrderNo() {
        return "ORD-" + java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")) + "-"
                + String.format("%06d", (int) (Math.random() * 1000000));
    }
}
