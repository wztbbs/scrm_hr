package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.dao.*;
import com.scrm.entity.*;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
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
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    @Qualifier("sequenceMapper")
    private SequenceMapper sequenceMapper;
    @Autowired
    private UserMapper userMapper;

    public List<SubscriptionPlan> listPlans() {
        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andIsActiveEqualTo(true);
        example.setOrderByClause("sort_order ASC");
        return planMapper.selectByExample(example);
    }

    public Map<String, Object> getCurrentSubscription() {
        Long userId = RequestContext.getCurrentUserId();
        SubscriptionExample example = new SubscriptionExample();
        example.createCriteria().andUserIdEqualTo(userId);
        List<Subscription> subs = subscriptionMapper.selectByExample(example);

        Map<String, Object> result = new HashMap<>();
        Subscription activeSub = subs.stream()
                .filter(s -> "active".equals(s.getStatus()))
                .findFirst().orElse(null);
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
        CandidateExample ce = new CandidateExample();
        ce.createCriteria().andUserIdEqualTo(userId).andPipelineStageNotEqualTo(PipelineStageEnum.DELETE.getValue());
        long candidatesUsed = candidateMapper.countByExample(ce);
        usage.put("candidates_used", candidatesUsed);

        SequenceExample se = new SequenceExample();
        se.createCriteria().andUserIdEqualTo(userId);
        long sequencesUsed = sequenceMapper.countByExample(se);
        usage.put("sequences_used", sequencesUsed);

        usage.put("connects_used_today", 0);

        SubscriptionPlan freePlan = getFreePlan();
        if (activeSub != null) {
            SubscriptionPlan plan = planMapper.selectByPrimaryKey(activeSub.getPlanId());
            usage.put("candidates_limit", plan.getTotalCandidateLimit());
            usage.put("sequences_limit", plan.getSequenceLimit());
            usage.put("connects_daily_limit", plan.getDailyConnectLimit());
        } else if (freePlan != null) {
            usage.put("candidates_limit", freePlan.getTotalCandidateLimit());
            usage.put("sequences_limit", freePlan.getSequenceLimit());
            usage.put("connects_daily_limit", freePlan.getDailyConnectLimit());
        }
        result.put("usage", usage);
        return result;
    }

    private SubscriptionPlan getFreePlan() {
        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andPlanCodeEqualTo("free");
        List<SubscriptionPlan> list = planMapper.selectByExample(example);
        return list.isEmpty() ? null : list.get(0);
    }

    public Map<String, Object> checkout(String planCode, String successUrl, String cancelUrl, String couponCode) {
        SubscriptionPlanExample example = new SubscriptionPlanExample();
        example.createCriteria().andPlanCodeEqualTo(planCode);
        List<SubscriptionPlan> plans = planMapper.selectByExample(example);
        SubscriptionPlan plan = plans.isEmpty() ? null : plans.get(0);

        Map<String, Object> result = new HashMap<>();
        if (plan != null) {
            result.put("checkout_url", "https://checkout.stripe.com/" + planCode);
            result.put("session_id", "sess_" + System.currentTimeMillis());
            result.put("plan", plan);
            result.put("amount", plan.getPrice());
            result.put("currency", plan.getCurrency());
        }
        return result;
    }

    public void handleWebhook(Map<String, Object> payload) {
        // TODO: implement Stripe webhook handling
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
        if (user.getDailyAiUsed() != null && user.getDailyAiUsed() >= limit) {
            throw new BusinessException(429, "Daily AI message limit reached. You've used " + user.getDailyAiUsed() + "/" + limit + " messages today. Upgrade to Pro for more.");
        }

        user.setDailyAiUsed(user.getDailyAiUsed() != null ? user.getDailyAiUsed() + 1 : 1);
        user.setDailyAiResetAt(user.getDailyAiResetAt());
        userMapper.updateAiUsage(user);
    }

    public SubscriptionPlan getCurrentPlan(Long userId) {
        SubscriptionExample example = new SubscriptionExample();
        example.createCriteria().andUserIdEqualTo(userId).andStatusEqualTo("active");
        List<Subscription> subs = subscriptionMapper.selectByExample(example);
        Subscription activeSub = subs.stream().findFirst().orElse(null);
        if (activeSub != null) {
            return planMapper.selectByPrimaryKey(activeSub.getPlanId());
        }
        return getFreePlan();
    }

    public Map<String, Object> cancelSubscription(boolean atPeriodEnd) {
        Long userId = RequestContext.getCurrentUserId();
        SubscriptionExample example = new SubscriptionExample();
        example.createCriteria().andUserIdEqualTo(userId).andStatusEqualTo("active");
        List<Subscription> subs = subscriptionMapper.selectByExample(example);
        Map<String, Object> result = new HashMap<>();
        if (!subs.isEmpty()) {
            Subscription sub = subs.get(0);
            sub.setCancelAtPeriodEnd(atPeriodEnd);
            sub.setUpdatedAt(new Date());
            if (!atPeriodEnd) {
                sub.setStatus("cancelled");
                sub.setCancelledAt(new Date());
            }
            subscriptionMapper.updateByPrimaryKeySelective(sub);
            result.put("success", true);
            result.put("status", sub.getStatus());
            result.put("cancel_at_period_end", sub.getCancelAtPeriodEnd());
            result.put("current_period_end", sub.getCurrentPeriodEnd());
        } else {
            result.put("success", false);
        }
        return result;
    }
}
