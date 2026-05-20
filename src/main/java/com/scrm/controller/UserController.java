package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.common.RequestContext;
import com.scrm.dto.BindEmailRequest;
import com.scrm.dto.MergeAccountRequest;
import com.scrm.dto.SendVerificationCodeRequest;
import com.scrm.entity.EmailVerification;
import com.scrm.entity.User;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.entity.Subscription;
import com.scrm.service.EmailVerificationService;
import com.scrm.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
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
        emailVerificationService.verifyCode(request.getEmail(), request.getCode());

        // 2. Check if email already exists in users table
        User existingUser = userService.findByEmail(request.getEmail());
        Long currentUserId = RequestContext.getCurrentUserId();

        if (existingUser != null && existingUser.getIsActive() != null && existingUser.getIsActive()
                && !existingUser.getId().equals(currentUserId)) {
            // Conflict: existing active user with this email
            Map<String, Object> data = new HashMap<>();
            data.put("conflict", true);
            Map<String, Object> existingUserInfo = new HashMap<>();
            existingUserInfo.put("id", existingUser.getId());
            existingUserInfo.put("uuid", existingUser.getUuid());
            existingUserInfo.put("email", existingUser.getEmail());
            data.put("existingUser", existingUserInfo);
            return ApiResponse.success(data);
        }

        // No conflict, bind directly
        emailVerificationService.markCodeAsUsed(
                emailVerificationService.verifyCode(request.getEmail(), request.getCode()));
        userService.updateEmail(request.getEmail());

        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        return ApiResponse.success(data);
    }

    @PostMapping("/merge-account")
    public ApiResponse<Map<String, Object>> mergeAccount(@RequestBody MergeAccountRequest request) {
        // 1. Verify code
        EmailVerification record = emailVerificationService.verifyCode(request.getEmail(), request.getCode());

        Long currentUserId = RequestContext.getCurrentUserId();
        Long targetUserId = request.getTargetUserId();

        // 2. Mark current user as merged to target user
        userService.mergeUser(currentUserId, targetUserId);

        // 3. Mark code as used
        emailVerificationService.markCodeAsUsed(record);

        // 4. Get target user's UUID for frontend switching
        User targetUser = userService.findByUuid(request.getTargetUuid());
        String targetUuid = targetUser != null ? targetUser.getUuid() : request.getTargetUuid();

        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        data.put("targetUuid", targetUuid);
        return ApiResponse.success(data);
    }

    @PostMapping("/keep-device-new")
    public ApiResponse<Map<String, Object>> keepDeviceNew(@RequestBody BindEmailRequest request) {
        // 1. Verify code
        EmailVerification record = emailVerificationService.verifyCode(request.getEmail(), request.getCode());

        // 2. Find existing user with this email and deactivate it
        User existingUser = userService.findByEmail(request.getEmail());
        if (existingUser != null) {
            userService.deactivateUser(existingUser.getId());
        }

        // 3. Bind email to current user
        userService.updateEmail(request.getEmail());

        // 4. Mark code as used
        emailVerificationService.markCodeAsUsed(record);

        Map<String, Object> data = new HashMap<>();
        data.put("success", true);
        return ApiResponse.success(data);
    }
}
