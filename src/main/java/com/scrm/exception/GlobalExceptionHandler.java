package com.scrm.exception;

import com.scrm.common.ApiResponse;
import com.scrm.common.RequestContext;
import com.scrm.dao.sub.SubSubscriptionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;

    @ExceptionHandler(NoResourceFoundException.class)
    public org.springframework.http.ResponseEntity<Void> handleNoResourceFoundException(NoResourceFoundException e) {
        String path = e.getResourcePath();
        if ("/favicon.ico".equals(path)) {
            // Silently ignore favicon.ico 404 to avoid log noise
            return org.springframework.http.ResponseEntity.noContent().build();
        }
        log.warn("[GlobalExceptionHandler] NoResourceFoundException: {}", path);
        return org.springframework.http.ResponseEntity.notFound().build();
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ApiResponse<Map<String, Object>> handleQuotaExceededException(QuotaExceededException e) {
        log.error("[GlobalExceptionHandler] QuotaExceededException: {}", e.getMessage(), e);
        Map<String, Object> data = new HashMap<>();
        data.put("scenario", e.getScenario());
        data.put("used", e.getUsed());
        data.put("limit", e.getLimit());

        // Determine if user can upgrade: free users can, paid users cannot
        try {
            Long userId = RequestContext.getCurrentUserId();
            boolean hasActiveSubscription = userId != null &&
                    subSubscriptionMapper.selectValidActiveByUserId(userId) != null;
            data.put("canUpgrade", !hasActiveSubscription);
        } catch (Exception ex) {
            data.put("canUpgrade", true); // default to allowing upgrade on error
        }

        if (e.getExtra() != null) {
            data.putAll(e.getExtra());
        }
        ApiResponse<Map<String, Object>> resp = ApiResponse.error(e.getCode(), e.getMessage());
        resp.setData(data);
        return resp;
    }

    @ExceptionHandler(BusinessException.class)
    public ApiResponse<Void> handleBusinessException(BusinessException e) {
        log.error("[GlobalExceptionHandler] BusinessException: {}", e.getMessage(), e);
        return ApiResponse.error(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ApiResponse<Void> handleException(Exception e) {
        log.error("[GlobalExceptionHandler] {}: {}", e.getClass().getSimpleName(), e.getMessage(), e);
        return ApiResponse.error(500, e.getClass().getSimpleName() + ": " + e.getMessage());
    }
}
