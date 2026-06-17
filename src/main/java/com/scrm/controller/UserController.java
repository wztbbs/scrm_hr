package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.common.ProBetaConstants;
import com.scrm.common.RequestContext;
import com.scrm.dto.BindEmailRequest;
import com.scrm.dto.SendVerificationCodeRequest;
import com.scrm.entity.EmailVerification;
import com.scrm.entity.User;
import com.scrm.dao.SubscriptionPlanMapper;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Subscription;
import com.scrm.entity.SubscriptionPlan;
import com.scrm.service.EmailVerificationService;
import com.scrm.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private EmailVerificationService emailVerificationService;

    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;

    @Autowired
    private SubscriptionPlanMapper planMapper;

    @Value("${feedback.to-email}")
    private String feedbackToEmail;

    @GetMapping("/me")
    public ApiResponse<Map<String, Object>> me() {
        User user = userService.getCurrentUser();
        Subscription activeSub = subSubscriptionMapper.selectValidActiveByUserId(user.getId());
        boolean isPro = activeSub != null;
        boolean isProBeta = isProBetaSubscription(activeSub);
        boolean needBindEmail = isPro && !isProBeta && (user.getEmail() == null || user.getEmail().trim().isEmpty());

        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        data.put("uuid", user.getUuid());
        data.put("email", user.getEmail());
        data.put("isActive", user.getIsActive());
        data.put("mergedToUserId", user.getMergedToUserId());
        data.put("isPro", isPro);
        data.put("needBindEmail", needBindEmail);
        data.put("feedbackEmail", feedbackToEmail);
        if (activeSub != null) {
            SubscriptionPlan plan = planMapper.selectByPrimaryKey(activeSub.getPlanId());
            if (plan != null) {
                data.put("plan", plan);
                data.put("plan_code", plan.getPlanCode());
                data.put("plan_name", plan.getName());
            }
        }
        return ApiResponse.success(data);
    }

    @PutMapping("/me")
    public ApiResponse<Map<String, Object>> updateMe(@RequestBody Map<String, Object> request) {
        String email = (String) request.get("email");
        if (email == null || email.trim().isEmpty()) {
            return ApiResponse.error(400, "Email is required");
        }
        userService.updateEmail(email.trim());
        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        return ApiResponse.success(data);
    }

    @PostMapping("/send-verification-code")
    public ApiResponse<Map<String, Object>> sendVerificationCode(@RequestBody SendVerificationCodeRequest request) {
        emailVerificationService.sendVerificationCode(request.getEmail());
        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        return ApiResponse.success(data);
    }

    private boolean isProBetaSubscription(Subscription activeSub) {
        if (activeSub == null) {
            return false;
        }
        SubscriptionPlan plan = planMapper.selectByPrimaryKey(activeSub.getPlanId());
        return plan != null && ProBetaConstants.PLAN_CODE.equals(plan.getPlanCode());
    }

    @PostMapping("/bind-email")
    public ApiResponse<Map<String, Object>> bindEmail(@RequestBody BindEmailRequest request) {
        // 1. Verify code
        EmailVerification record = emailVerificationService.verifyCode(request.getEmail(), request.getCode());

        // 2. Check if email already exists in users table
        User existingUser = userService.findByEmail(request.getEmail());
        Long currentUserId = RequestContext.getCurrentUserId();

        if (existingUser != null && existingUser.getIsActive() != null && existingUser.getIsActive()
                && !existingUser.getId().equals(currentUserId)) {
            // Conflict: merge current user into existing user and migrate data
            log.info("Email conflict detected: currentUserId={} will be merged into existingUserId={}", currentUserId, existingUser.getId());
            userService.mergeUser(currentUserId, existingUser.getId());
            userService.migrateUserData(currentUserId, existingUser.getId());
            emailVerificationService.markCodeAsUsed(record);

            Map<String, Object> data = new HashMap<>();
            data.put("success", true);
            data.put("merged", true);
            data.put("targetUuid", existingUser.getUuid());
            return ApiResponse.success(data);
        }

        // No conflict, bind directly
        emailVerificationService.markCodeAsUsed(record);
        userService.updateEmail(request.getEmail());

        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        return ApiResponse.success(data);
    }
}
