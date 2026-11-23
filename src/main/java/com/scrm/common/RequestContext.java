package com.scrm.common;

import com.scrm.dao.SubscriptionPlanMapper;
import com.scrm.dao.UserMapper;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Subscription;
import com.scrm.entity.SubscriptionPlan;
import com.scrm.entity.SubscriptionPlanExample;
import com.scrm.entity.User;
import com.scrm.entity.UserExample;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.annotation.PostConstruct;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

@Component
public class RequestContext {

    private static final Logger log = LoggerFactory.getLogger(RequestContext.class);

    private static UserMapper staticUserMapper;
    private static SubscriptionPlanMapper staticPlanMapper;
    private static SubSubscriptionMapper staticSubSubscriptionMapper;
    private static boolean proBetaGiftEnabled;

    @Autowired
    private UserMapper userMapper;
    @Autowired
    private SubscriptionPlanMapper planMapper;
    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;

    @Value("${feature.pro-beta-gift.enabled:true}")
    private boolean proBetaGiftEnabledValue;

    @PostConstruct
    public void init() {
        staticUserMapper = userMapper;
        staticPlanMapper = planMapper;
        staticSubSubscriptionMapper = subSubscriptionMapper;
        proBetaGiftEnabled = proBetaGiftEnabledValue;
    }

    public static Long getCurrentUserId() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) return 1L;
        HttpServletRequest request = attrs.getRequest();
        String userIdHeader = request.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isEmpty()) {
            return 1L;
        }

        // Try parse as Long first
        try {
            return Long.parseLong(userIdHeader);
        } catch (NumberFormatException e) {
            log.warn("Failed to parse userId as Long, treating as UUID: {}", userIdHeader);
        }

        // Lookup user by UUID, auto-create if not exists
        if (staticUserMapper != null) {
            UserExample example = new UserExample();
            example.createCriteria().andUuidEqualTo(userIdHeader);
            List<User> users = staticUserMapper.selectByExample(example);
            if (!users.isEmpty()) {
                return users.get(0).getId();
            }
            // Auto-create user for this UUID
            User newUser = new User();
            newUser.setUuid(userIdHeader);
            newUser.setTimezone("UTC");
            newUser.setLocale("en-US");
            newUser.setIsActive(true);
            newUser.setDailyAiUsed(0);
            newUser.setCreatedAt(new Date());
            newUser.setUpdatedAt(new Date());
            staticUserMapper.insertSelective(newUser);
            // Re-fetch to get auto-generated id (insert does not populate id)
            UserExample refetch = new UserExample();
            refetch.createCriteria().andUuidEqualTo(userIdHeader);
            List<User> inserted = staticUserMapper.selectByExample(refetch);
            Long newUserId = !inserted.isEmpty() ? inserted.get(0).getId() : null;
            if (newUserId != null) {
                giftProBetaIfEnabled(newUserId);
            }
            return newUserId != null ? newUserId : 1L;
        }

        return 1L;
    }

    private static void giftProBetaIfEnabled(Long userId) {
        if (!proBetaGiftEnabled) {
            return;
        }
        if (staticPlanMapper == null || staticSubSubscriptionMapper == null) {
            log.warn("Pro Beta gift skipped: mappers not initialized");
            return;
        }
        try {
            SubscriptionPlanExample example = new SubscriptionPlanExample();
            example.createCriteria().andPlanCodeEqualTo(ProBetaConstants.PLAN_CODE);
            List<SubscriptionPlan> plans = staticPlanMapper.selectByExample(example);
            if (plans.isEmpty()) {
                log.warn("Pro Beta gift skipped: plan {} not found", ProBetaConstants.PLAN_CODE);
                return;
            }
            SubscriptionPlan plan = plans.get(0);

            Date now = new Date();
            Calendar calendar = Calendar.getInstance();
            calendar.setTime(now);
            calendar.add(Calendar.DATE, ProBetaConstants.GIFT_DURATION_DAYS);

            Subscription subscription = new Subscription();
            subscription.setUserId(userId);
            subscription.setPlanId(plan.getId());
            subscription.setStatus("active");
            subscription.setCurrentPeriodStart(now);
            subscription.setCurrentPeriodEnd(calendar.getTime());
            subscription.setCancelAtPeriodEnd(false);
            subscription.setPaymentProvider(ProBetaConstants.PAYMENT_PROVIDER);
            subscription.setCreatedAt(now);
            subscription.setUpdatedAt(now);
            staticSubSubscriptionMapper.insertSelective(subscription);
            log.info("Pro Beta gifted to user {} for {} days", userId, ProBetaConstants.GIFT_DURATION_DAYS);
        } catch (Exception e) {
            log.error("Failed to gift Pro Beta to user {}", userId, e);
        }
    }
}
