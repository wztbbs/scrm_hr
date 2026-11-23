package com.scrm.interceptor;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 全局请求/响应日志拦截器
 * 调试阶段使用，打印所有接口的请求参数和响应内容
 * 日志打印异常已做兜底，不影响业务流程
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    private static final java.util.Set<String> STATIC_EXTENSIONS = java.util.Set.of(
            ".html", ".htm", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif",
            ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map"
    );

    /**
     * 跳过静态资源和指定接口的日志打印
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        if ("GET".equals(method) && "/api/v1/pipeline/stages".equals(uri)) {
            return true;
        }
        String lowerUri = uri.toLowerCase();
        for (String ext : STATIC_EXTENSIONS) {
            if (lowerUri.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 包装 request/response 以支持重复读取 body
        ContentCachingRequestWrapper requestWrapper = new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper responseWrapper = new ContentCachingResponseWrapper(response);

        long startTime = System.currentTimeMillis();
        boolean logSuccess = false;

        try {
            filterChain.doFilter(requestWrapper, responseWrapper);
        } finally {
            try {
                long duration = System.currentTimeMillis() - startTime;
                logRequest(requestWrapper);
                logResponse(responseWrapper, duration);
                logSuccess = true;
            } catch (Exception e) {
                // 兜底：日志打印异常绝不能影响业务响应
                log.error("[RequestLoggingFilter] 打印请求/响应日志时发生异常，忽略此异常，不影响业务流程", e);
            } finally {
                // 必须将响应内容写回原始 response
                try {
                    responseWrapper.copyBodyToResponse();
                } catch (Exception ex) {
                    log.error("[RequestLoggingFilter] copyBodyToResponse 异常", ex);
                }
            }
        }
    }

    private void logRequest(ContentCachingRequestWrapper request) {
        String method = request.getMethod();
        String uri = request.getRequestURI();
        String queryString = request.getQueryString();
        String body = getRequestBody(request);
        Map<String, String[]> parameterMap = request.getParameterMap();

        StringBuilder params = new StringBuilder();
        boolean hasParams = false;

        if (queryString != null && !queryString.isEmpty()) {
            params.append("Query: ").append(queryString);
            hasParams = true;
        }

        if (!parameterMap.isEmpty()) {
            if (hasParams) {
                params.append(" | ");
            }
            params.append("Form: ").append(formatParameterMap(parameterMap));
            hasParams = true;
        }

        if (body != null && !body.isEmpty()) {
            if (hasParams) {
                params.append(" | ");
            }
            params.append("Body: ").append(body);
            hasParams = true;
        }

        if (!hasParams) {
            params.append("(no params)");
        }

        log.info("[REQUEST] {} {} | {}", method, uri, params);
    }

    private void logResponse(ContentCachingResponseWrapper response, long duration) {
        int status = response.getStatus();
        String body = getResponseBody(response);
        log.info("[RESPONSE] Status: {} | Duration: {}ms | Body: {}", status, duration, body);
    }

    private String getRequestBody(ContentCachingRequestWrapper request) {
        byte[] buf = request.getContentAsByteArray();
        if (buf == null || buf.length == 0) {
            return "";
        }
        String body = new String(buf, StandardCharsets.UTF_8);
        // 防止 body 过大，截断显示
        return truncate(body, 2000);
    }

    private String getResponseBody(ContentCachingResponseWrapper response) {
        byte[] buf = response.getContentAsByteArray();
        if (buf == null || buf.length == 0) {
            return "";
        }
        String body = new String(buf, StandardCharsets.UTF_8);
        return truncate(body, 2000);
    }

    private String formatParameterMap(Map<String, String[]> parameterMap) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        boolean first = true;
        for (Map.Entry<String, String[]> entry : parameterMap.entrySet()) {
            if (!first) {
                sb.append(", ");
            }
            sb.append(entry.getKey()).append("=");
            if (entry.getValue().length == 1) {
                sb.append(entry.getValue()[0]);
            } else {
                sb.append(java.util.Arrays.toString(entry.getValue()));
            }
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }

    private String truncate(String str, int maxLength) {
        if (str == null) {
            return "";
        }
        if (str.length() <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + "... [truncated, total length=" + str.length() + "]";
    }
}
