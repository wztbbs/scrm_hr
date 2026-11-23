package com.scrm.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scrm.dao.EventMapper;
import com.scrm.dao.OrderMapper;
import com.scrm.dao.SubscriptionMapper;
import com.scrm.dao.SubscriptionPlanMapper;
import com.scrm.dao.sub.SubOrderMapper;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Event;
import com.scrm.entity.Order;
import com.scrm.entity.Subscription;
import com.scrm.entity.SubscriptionPlan;
import com.scrm.entity.SubscriptionPlanExample;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Date;
import java.util.HashMap;
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
    @Autowired
    private SubscriptionPlanMapper planMapper;
    @Autowired
    private EventMapper eventMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private void trackEvent(Long userId, String eventName, Map<String, Object> eventData) {
        try {
            Event event = new Event();
            event.setUserId(userId);
            event.setEventName(eventName);
            event.setEventData(objectMapper.writeValueAsString(eventData));
            event.setCreatedAt(new Date());
            eventMapper.insert(event);
        } catch (Exception e) {
            log.warn("Failed to track event {}: {}", eventName, e.getMessage());
        }
    }

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
            case "transaction.payment_failed" -> handleTransactionFailed(data);
            case "subscription.created" -> handleSubscriptionCreated(data);
            case "subscription.updated" -> handleSubscriptionUpdated(data);
            case "subscription.canceled" -> handleSubscriptionCanceled(data);
            case "subscription.past_due" -> handleSubscriptionPastDue(data);
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
        if (customData == null) {
            customData = (Map<String, Object>) data.get("custom_data");
        }
        Number orderIdNum = customData != null ? (Number) customData.get("order_id") : null;
        Long orderId = orderIdNum != null ? orderIdNum.longValue() : null;

        String paddleSubscriptionId = (String) data.get("subscription_id");

        if (orderId != null) {
            subOrderMapper.updateStatusPaidById(orderId, "paid", paddleTransactionId, paddleSubscriptionId, new Date());
            log.info("Order {} updated to paid, transaction {}", orderId, paddleTransactionId);
        }

        // Track: checkout_completed or subscription_renewed
        try {
            String origin = (String) data.get("origin");
            boolean isCheckout = "web".equals(origin) || "api".equals(origin);
            String eventName = isCheckout ? "checkout_completed" : "subscription_renewed";

            Long uid = null;
            if (orderId != null) {
                Order order = orderMapper.selectByPrimaryKey(orderId);
                if (order != null) uid = order.getUserId();
            }
            if (uid == null && customData != null) {
                Object userIdObj = customData.get("user_id");
                if (userIdObj instanceof Number) uid = ((Number) userIdObj).longValue();
                else if (userIdObj instanceof String) {
                    try { uid = Long.parseLong((String) userIdObj); } catch (NumberFormatException ignored) {}
                }
            }

            String planCode = customData != null ? (String) customData.get("plan_code") : null;
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("plan_code", planCode);
            eventData.put("transaction_id", paddleTransactionId);
            eventData.put("subscription_id", paddleSubscriptionId);
            eventData.put("origin", origin);

            Map<String, Object> details = (Map<String, Object>) data.get("details");
            if (details != null) {
                Map<String, Object> totals = (Map<String, Object>) details.get("totals");
                if (totals != null) {
                    Object total = totals.get("total");
                    if (total != null) eventData.put("revenue", total);
                }
            }

            trackEvent(uid, eventName, eventData);
        } catch (Exception e) {
            log.warn("Failed to track transaction event: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void handleTransactionFailed(Map<String, Object> data) {
        String paddleTransactionId = (String) data.get("id");
        if (paddleTransactionId == null) {
            return;
        }

        Map<String, Object> customData = (Map<String, Object>) data.get("customData");
        if (customData == null) {
            customData = (Map<String, Object>) data.get("custom_data");
        }

        String errorCode = (String) data.get("error_code");
        String planCode = customData != null ? (String) customData.get("plan_code") : null;

        Long uid = null;
        if (customData != null) {
            Object userIdObj = customData.get("user_id");
            if (userIdObj instanceof Number) uid = ((Number) userIdObj).longValue();
            else if (userIdObj instanceof String) {
                try { uid = Long.parseLong((String) userIdObj); } catch (NumberFormatException ignored) {}
            }
        }

        // Track payment_failed
        try {
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("plan_code", planCode);
            eventData.put("transaction_id", paddleTransactionId);
            eventData.put("error_code", errorCode);
            trackEvent(uid, "payment_failed", eventData);
        } catch (Exception e) {
            log.warn("Failed to track payment_failed: {}", e.getMessage());
        }

        log.info("Transaction {} payment_failed, error_code={}", paddleTransactionId, errorCode);
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
        if (customData == null) {
            customData = (Map<String, Object>) data.get("custom_data");
        }
        Number orderIdNum = customData != null ? (Number) customData.get("order_id") : null;
        Long orderId = orderIdNum != null ? orderIdNum.longValue() : null;

        Order order = orderId != null ? orderMapper.selectByPrimaryKey(orderId) : null;

        // Fallback: if order not found, try user_id from customData
        Long userId = order != null ? order.getUserId() : null;
        if (userId == null && customData != null) {
            Object userIdObj = customData.get("user_id");
            if (userIdObj instanceof Number) {
                userId = ((Number) userIdObj).longValue();
            } else if (userIdObj instanceof String) {
                try {
                    userId = Long.parseLong((String) userIdObj);
                } catch (NumberFormatException e) {
                    log.warn("Invalid user_id in customData: {}", userIdObj);
                }
            }
        }

        // Fallback: get plan from customData.plan_code if order not found
        Long planId = order != null ? order.getPlanId() : null;
        if (planId == null && customData != null) {
            String planCode = (String) customData.get("plan_code");
            if (planCode != null) {
                SubscriptionPlanExample example = new SubscriptionPlanExample();
                example.createCriteria().andPlanCodeEqualTo(planCode);
                List<SubscriptionPlan> plans = planMapper.selectByExample(example);
                if (!plans.isEmpty()) {
                    planId = plans.get(0).getId();
                }
            }
        }

        Subscription sub = new Subscription();
        sub.setUserId(userId);
        sub.setPlanId(planId);
        sub.setPaddleSubscriptionId(paddleSubId);
        String customerId = (String) data.get("customerId");
        if (customerId == null) {
            customerId = (String) data.get("customer_id");
        }
        sub.setPaddleCustomerId(customerId);
        sub.setStatus("active");
        sub.setPaymentProvider("paddle");

        Map<String, Object> currentBillingPeriod = (Map<String, Object>) data.get("currentBillingPeriod");
        if (currentBillingPeriod == null) {
            currentBillingPeriod = (Map<String, Object>) data.get("current_billing_period");
        }
        if (currentBillingPeriod != null) {
            String startsAt = (String) currentBillingPeriod.get("startsAt");
            if (startsAt == null) {
                startsAt = (String) currentBillingPeriod.get("starts_at");
            }
            String endsAt = (String) currentBillingPeriod.get("endsAt");
            if (endsAt == null) {
                endsAt = (String) currentBillingPeriod.get("ends_at");
            }
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

        // Track subscription_created
        try {
            String planCode = customData != null ? (String) customData.get("plan_code") : null;
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("plan_code", planCode);
            eventData.put("subscription_id", paddleSubId);
            eventData.put("customer_id", customerId);
            trackEvent(userId, "subscription_created", eventData);
        } catch (Exception e) {
            log.warn("Failed to track subscription_created: {}", e.getMessage());
        }
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
        if (currentBillingPeriod == null) {
            currentBillingPeriod = (Map<String, Object>) data.get("current_billing_period");
        }
        if (currentBillingPeriod != null) {
            String startsAt = (String) currentBillingPeriod.get("startsAt");
            if (startsAt == null) {
                startsAt = (String) currentBillingPeriod.get("starts_at");
            }
            String endsAt = (String) currentBillingPeriod.get("endsAt");
            if (endsAt == null) {
                endsAt = (String) currentBillingPeriod.get("ends_at");
            }
            update.setCurrentPeriodStart(parseIsoDate(startsAt));
            update.setCurrentPeriodEnd(parseIsoDate(endsAt));
        }

        update.setUpdatedAt(new Date());
        subscriptionMapper.updateByPrimaryKeySelective(update);

        // If renewal, create a new paid order record
        Map<String, Object> billingCycle = (Map<String, Object>) data.get("billingCycle");
        if (billingCycle == null) {
            billingCycle = (Map<String, Object>) data.get("billing_cycle");
        }
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

        // Track subscription_updated
        try {
            String oldPlanCode = null;
            if (sub.getPlanId() != null) {
                SubscriptionPlan oldPlan = planMapper.selectByPrimaryKey(sub.getPlanId());
                if (oldPlan != null) oldPlanCode = oldPlan.getPlanCode();
            }
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("subscription_id", paddleSubId);
            eventData.put("old_plan_code", oldPlanCode);
            eventData.put("new_status", update.getStatus());
            trackEvent(sub.getUserId(), "subscription_updated", eventData);
        } catch (Exception e) {
            log.warn("Failed to track subscription_updated: {}", e.getMessage());
        }
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

        // Track subscription_cancelled
        try {
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("subscription_id", paddleSubId);
            if (sub.getPlanId() != null) {
                SubscriptionPlan plan = planMapper.selectByPrimaryKey(sub.getPlanId());
                if (plan != null) eventData.put("plan_code", plan.getPlanCode());
            }
            trackEvent(sub.getUserId(), "subscription_cancelled", eventData);
        } catch (Exception e) {
            log.warn("Failed to track subscription_cancelled: {}", e.getMessage());
        }
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

        // Track subscription_past_due
        try {
            Map<String, Object> eventData = new HashMap<>();
            eventData.put("subscription_id", paddleSubId);
            eventData.put("customer_id", sub.getPaddleCustomerId());
            if (sub.getPlanId() != null) {
                SubscriptionPlan plan = planMapper.selectByPrimaryKey(sub.getPlanId());
                if (plan != null) eventData.put("plan_code", plan.getPlanCode());
            }
            trackEvent(sub.getUserId(), "subscription_past_due", eventData);
        } catch (Exception e) {
            log.warn("Failed to track subscription_past_due: {}", e.getMessage());
        }
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
            log.error("Failed to parse ISO date: {}", iso, e);
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
