package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.config.PaddleProperties;
import com.scrm.dao.*;
import com.scrm.dao.sub.SubOrderMapper;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.dao.sub.SubUserMapper;
import com.scrm.entity.*;
import com.scrm.exception.BusinessException;
import com.scrm.exception.QuotaExceededException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SubscriptionService {

    @Autowired
    private SubscriptionPlanMapper planMapper;
    @Autowired
    private SubscriptionMapper subscriptionMapper;
    @Autowired
    private OrderMapper orderMapper;
    @Autowired
    private SubOrderMapper subOrderMapper;
    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;
    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    @Qualifier("sequenceMapper")
    private SequenceMapper sequenceMapper;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private SubUserMapper subUserMapper;
    @Autowired
    private PaddleApiService paddleApiService;
    @Autowired
    private PaddleProperties paddleProperties;

    public List<SubscriptionPlan> listPlans() {
        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andIsActiveEqualTo(true);
        example.setOrderByClause("sort_order ASC");
        return planMapper.selectByExample(example);
    }

    public Map<String, Object> getCurrentSubscription() {
        Long userId = RequestContext.getCurrentUserId();
        Subscription activeSub = subSubscriptionMapper.selectActiveByUserId(userId);

        Map<String, Object> result = new HashMap<>();
        result.put("has_subscription", activeSub != null);

        if (activeSub != null) {
            Map<String, Object> subMap = new HashMap<>();
            subMap.put("id", activeSub.getId());
            SubscriptionPlan plan = planMapper.selectByPrimaryKey(activeSub.getPlanId());
            subMap.put("plan", plan);
            subMap.put("status", activeSub.getStatus());
            subMap.put("current_period_start", activeSub.getCurrentPeriodStart());
            subMap.put("current_period_end", activeSub.getCurrentPeriodEnd());
            subMap.put("cancel_at_period_end", activeSub.getCancelAtPeriodEnd());
            subMap.put("payment_provider", activeSub.getPaymentProvider());
            result.put("subscription", subMap);
        } else {
            result.put("subscription", null);
        }

        // usage
        Map<String, Object> usage = new HashMap<>();
        long candidatesUsed = countActiveCandidates(userId);
        usage.put("candidates_used", candidatesUsed);

        long sequencesUsed = countActiveSequences(userId);
        usage.put("sequences_used", sequencesUsed);

        User user = userMapper.selectByPrimaryKey(userId);
        int aiUsed = user != null && user.getDailyAiUsed() != null ? user.getDailyAiUsed() : 0;
        usage.put("ai_used", aiUsed);

        SubscriptionPlan freePlan = getFreePlan();
        SubscriptionPlan currentPlan = activeSub != null ? planMapper.selectByPrimaryKey(activeSub.getPlanId()) : freePlan;
        int aiLimit = currentPlan != null ? currentPlan.getDailyConnectLimit() : 10;
        int candidateLimit = currentPlan != null ? currentPlan.getTotalCandidateLimit() : 20;
        int sequenceLimit = currentPlan != null ? currentPlan.getSequenceLimit() : 1;

        usage.put("ai_limit", aiLimit);
        usage.put("candidates_limit", candidateLimit);
        usage.put("sequences_limit", sequenceLimit);
        usage.put("connects_used_today", 0);
        usage.put("connects_daily_limit", aiLimit);

        result.put("usage", usage);
        return result;
    }

    private SubscriptionPlan getFreePlan() {
        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andPlanCodeEqualTo("free");
        List<SubscriptionPlan> list = planMapper.selectByExample(example);
        return list.isEmpty() ? null : list.get(0);
    }

    @Transactional
    public Map<String, Object> checkout(String planCode, String successUrl, String cancelUrl, String couponCode, String email) {
        Long userId = RequestContext.getCurrentUserId();
        User user = userMapper.selectByPrimaryKey(userId);
        if (user == null) {
            throw new BusinessException("User not found");
        }

        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andPlanCodeEqualTo(planCode);
        List<SubscriptionPlan> plans = planMapper.selectByExample(example);
        SubscriptionPlan plan = plans.isEmpty() ? null : plans.get(0);
        if (plan == null) {
            throw new BusinessException("Plan not found: " + planCode);
        }

        String priceId = paddleProperties.getPriceIds().get(planCode);
        if (priceId == null || priceId.isEmpty()) {
            throw new BusinessException("Paddle price ID not configured for plan: " + planCode);
        }

        // 1. Create local order
        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setUserId(userId);
        order.setPlanId(plan.getId());
        order.setStatus("pending");
        order.setAmount(plan.getPrice());
        order.setCurrency(plan.getCurrency());
        order.setBillingCycle(plan.getBillingCycle());
        order.setCreatedAt(new Date());
        order.setUpdatedAt(new Date());
        orderMapper.insertSelective(order);

        // 2. Call Paddle API to generate checkout URL (Standard Checkout Link)
        String frontendBase = paddleProperties.getFrontendUrl();
        String returnUrl = frontendBase + "/payment/success.html";
        String cancelUrlResolved = frontendBase + "/payment/cancel.html";

        Map<String, Object> customData = new HashMap<>();
        customData.put("order_id", order.getId());
        customData.put("user_id", userId);

        // 优先使用前端传入的 email（支付时临时输入的），否则 fallback 到数据库
        String emailForPaddle = StringUtils.hasText(email) ? email : user.getEmail();

        Map<String, Object> paddleData = paddleApiService.createCheckout(
                priceId, emailForPaddle, returnUrl, cancelUrlResolved, customData);

        String checkoutId = (String) paddleData.get("id");
        @SuppressWarnings("unchecked")
        Map<String, Object> checkout = (Map<String, Object>) paddleData.get("checkout");
        String checkoutUrl = checkout != null ? (String) checkout.get("url") : null;

        // 3. Update order with paddle checkout id
        Order updateOrder = new Order();
        updateOrder.setId(order.getId());
        updateOrder.setPaddleCheckoutId(checkoutId);
        updateOrder.setUpdatedAt(new Date());
        orderMapper.updateByPrimaryKeySelective(updateOrder);

        Map<String, Object> result = new HashMap<>();
        result.put("checkout_url", checkoutUrl);
        result.put("checkout_id", checkoutId);
        result.put("order_no", order.getOrderNo());
        return result;
    }

    private String generateOrderNo() {
        return "ORD-" + java.time.LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd")) + "-"
                + String.format("%06d", (int) (Math.random() * 1000000));
    }

    @Transactional
    public Map<String, Object> cancelSubscription(boolean atPeriodEnd) {
        Long userId = RequestContext.getCurrentUserId();
        Subscription sub = subSubscriptionMapper.selectActiveByUserId(userId);
        Map<String, Object> result = new HashMap<>();
        if (sub == null) {
            result.put("success", false);
            result.put("message", "No active subscription");
            return result;
        }

        if (!"paddle".equals(sub.getPaymentProvider()) || sub.getPaddleSubscriptionId() == null) {
            result.put("success", false);
            result.put("message", "Subscription is not managed by Paddle");
            return result;
        }

        String effectiveFrom = atPeriodEnd ? "next_billing_period" : "immediately";
        paddleApiService.cancelSubscription(sub.getPaddleSubscriptionId(), effectiveFrom);

        Subscription update = new Subscription();
        update.setId(sub.getId());
        update.setCancelAtPeriodEnd(atPeriodEnd);
        update.setUpdatedAt(new Date());
        if (!atPeriodEnd) {
            update.setStatus("cancelled");
            update.setCancelledAt(new Date());
        }
        subscriptionMapper.updateByPrimaryKeySelective(update);

        result.put("success", true);
        result.put("status", update.getStatus() != null ? update.getStatus() : sub.getStatus());
        result.put("cancel_at_period_end", atPeriodEnd);
        result.put("current_period_end", sub.getCurrentPeriodEnd());
        return result;
    }

    public void checkAndIncrementAiUsage(Long userId) {
        User user = userMapper.selectByPrimaryKey(userId);
        if (user == null) {
            // Auto-create default user if not exists (for anonymous users)
            user = new User();
            user.setId(userId);
            user.setUuid(java.util.UUID.randomUUID().toString());
            user.setEmail("anonymous_" + userId + "@local");
            user.setTimezone("UTC");
            user.setLocale("en-US");
            user.setIsActive(true);
            user.setDailyAiUsed(0);
            user.setCreatedAt(new Date());
            user.setUpdatedAt(new Date());
            userMapper.insert(user);
        }

        LocalDateTime now = LocalDateTime.now();
        Date resetAt = user.getDailyAiResetAt();
        boolean needReset = resetAt == null;
        if (!needReset && resetAt != null) {
            LocalDateTime resetLdt = new java.sql.Timestamp(resetAt.getTime()).toLocalDateTime();
            needReset = resetLdt.toLocalDate().isBefore(now.toLocalDate());
        }

        if (needReset) {
            user.setDailyAiUsed(0);
            user.setDailyAiResetAt(java.sql.Timestamp.valueOf(now));
        }

        SubscriptionPlan plan = getCurrentPlan(userId);
        int limit = plan != null ? plan.getDailyConnectLimit() : 10;
        int used = user.getDailyAiUsed() != null ? user.getDailyAiUsed() : 0;
        if (used >= limit) {
            throw new QuotaExceededException("ai", used, limit,
                    "You've used " + used + "/" + limit + " AI messages today.");
        }

        user.setDailyAiUsed(used + 1);
        user.setDailyAiResetAt(user.getDailyAiResetAt());
        subUserMapper.updateAiUsage(user);
    }

    public void checkCandidateLimit(Long userId) {
        long used = countActiveCandidates(userId);
        SubscriptionPlan plan = getCurrentPlan(userId);
        int limit = plan != null && plan.getTotalCandidateLimit() != null ? plan.getTotalCandidateLimit() : 20;
        if (used >= limit) {
            throw new QuotaExceededException("candidate", (int) used, limit,
                    "Your pipeline is full (" + used + "/" + limit + ")");
        }
    }

    public void checkSequenceLimit(Long userId) {
        long used = countActiveSequences(userId);
        SubscriptionPlan plan = getCurrentPlan(userId);
        int limit = plan != null && plan.getSequenceLimit() != null ? plan.getSequenceLimit() : 1;
        if (used >= limit) {
            throw new QuotaExceededException("sequence", (int) used, limit,
                    "Sequence limit reached (" + used + "/" + limit + ")");
        }
    }

    private long countActiveCandidates(Long userId) {
        CandidateExample ce = new CandidateExample();
        ce.createCriteria().andUserIdEqualTo(userId)
                .andPipelineStageNotEqualTo(PipelineStageEnum.DELETE.getValue())
                .andPipelineStageNotEqualTo(PipelineStageEnum.UNCLAIMED.getValue());
        return candidateMapper.countByExample(ce);
    }

    private long countActiveSequences(Long userId) {
        SequenceExample se = new SequenceExample();
        se.createCriteria().andUserIdEqualTo(userId);
        return sequenceMapper.countByExample(se);
    }

    public SubscriptionPlan getCurrentPlan(Long userId) {
        Subscription activeSub = subSubscriptionMapper.selectActiveByUserId(userId);
        if (activeSub != null) {
            return planMapper.selectByPrimaryKey(activeSub.getPlanId());
        }
        return getFreePlan();
    }
}
