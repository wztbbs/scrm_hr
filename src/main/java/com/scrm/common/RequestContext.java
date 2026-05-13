package com.scrm.common;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public class RequestContext {

    public static Long getCurrentUserId() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) return 1L;
        HttpServletRequest request = attrs.getRequest();
        String userId = request.getHeader("X-User-Id");
        if (userId == null || userId.isEmpty()) {
            return 1L;
        }
        try {
            return Long.parseLong(userId);
        } catch (NumberFormatException e) {
            return 1L;
        }
    }
}
