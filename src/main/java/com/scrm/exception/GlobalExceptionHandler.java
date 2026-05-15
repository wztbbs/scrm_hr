package com.scrm.exception;

import com.scrm.common.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(QuotaExceededException.class)
    public ApiResponse<Map<String, Object>> handleQuotaExceededException(QuotaExceededException e) {
        log.error("[GlobalExceptionHandler] QuotaExceededException: {}", e.getMessage(), e);
        Map<String, Object> data = new HashMap<>();
        data.put("scenario", e.getScenario());
        data.put("used", e.getUsed());
        data.put("limit", e.getLimit());
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
        log.error("[GlobalExceptionHandler] Exception: {}", e.getMessage(), e);
        return ApiResponse.error(500, e.getMessage());
    }
}
