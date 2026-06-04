package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.common.RequestContext;
import com.scrm.dto.BindEmailRequest;
import com.scrm.dto.SendVerificationCodeRequest;
import com.scrm.entity.EmailVerification;
import com.scrm.entity.User;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Subscription;
import com.scrm.service.EmailVerificationService;
import com.scrm.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private EmailVerificationService emailVerificationService;

    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;

    @Value("${feedback.to-email}")
    private String feedbackToEmail;

    @GetMapping("/me")
    public ApiResponse<Map<String, Object>> me() {
        User user = userService.getCurrentUser();
        Subscription activeSub = subSubscriptionMapper.selectValidActiveByUserId(user.getId());
        boolean isPro = activeSub != null;
        boolean needBindEmail = isPro && (user.getEmail() == null || user.getEmail().trim().isEmpty());

        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        data.put("uuid", user.getUuid());
        data.put("email", user.getEmail());
        data.put("isActive", user.getIsActive());
        data.put("mergedToUserId", user.getMergedToUserId());
        data.put("isPro", isPro);
        data.put("needBindEmail", needBindEmail);
        data.put("feedbackEmail", feedbackToEmail);
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
