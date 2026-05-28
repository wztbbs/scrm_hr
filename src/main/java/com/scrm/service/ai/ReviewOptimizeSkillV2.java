package com.scrm.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.OptimizeResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ReviewOptimizeSkill V2 — 使用原生 HTTP 调用阿里云百炼 OpenAI 兼容 API
 * 目的：测试 qwen3-8b 模型，支持手动控制 enable_thinking 参数
 * 与 V1 的区别：绕过 Spring AI，直接 HTTP 请求，方便调参对比
 */
@Component
public class ReviewOptimizeSkillV2 {

    private static final Logger log = LoggerFactory.getLogger(ReviewOptimizeSkillV2.class);

    // 手动填写（测试用）
    private static final String API_KEY = "sk-bae038fba269406d850a17bf9481f95c";
    private static final String BASE_URL = "https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions";

    private final HttpClient httpClient;
    private final Jinjava jinjava;
    private final String template;
    private final ObjectMapper objectMapper;

    public ReviewOptimizeSkillV2() {
        this.jinjava = new Jinjava();
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        try {
            this.template = new String(
                    new ClassPathResource("prompts/review-optimize.txt").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load review-optimize prompt template", e);
        }
    }

    public OptimizeResult reviewAndOptimize(String draft, List<CandidateHistoryWithBLOBs> history) {
        String historySnapshot = history.stream()
                .filter(h -> "chat_message".equals(h.getHistoryType()) || "message_sent".equals(h.getHistoryType()))
                .limit(5)
                .map(h -> {
                    String content = h.getContentSnapshot() != null ? h.getContentSnapshot() : h.getTitle();
                    return content.length() > 100 ? content.substring(0, 100) + "..." : content;
                })
                .collect(Collectors.joining(" | "));

        if (historySnapshot.length() > 600) {
            historySnapshot = historySnapshot.substring(0, 600) + "...";
        }

        Map<String, Object> context = new HashMap<>();
        context.put("draft", draft);
        context.put("historySnapshot", historySnapshot.isEmpty() ? "None" : historySnapshot);

        String renderedPrompt = jinjava.render(template, context);
        String systemPrompt = """
            You are a strict editor reviewing a LinkedIn recruiter message.
            Check: robotic, repetitive, pushy, generic, length 40-100 words.
            If passed, rewrite into ONE natural, low-pressure version (50-80 words, single paragraph, ends with short question).
            Output JSON: {"passed":boolean,"issues":[],"content":"string"}
            No markdown. No text outside JSON.
            """;

        log.info("[ReviewOptimizeSkillV2] >>> CALL LLM START | model=qwen3-8b");
        log.info("[ReviewOptimizeSkillV2] System Prompt:\n{}", systemPrompt);
        log.info("[ReviewOptimizeSkillV2] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        String rawContent = callHttp(systemPrompt, renderedPrompt);

        long duration = System.currentTimeMillis() - start;
        log.info("[ReviewOptimizeSkillV2] <<< CALL LLM END | duration={}ms", duration);
        log.info("[ReviewOptimizeSkillV2] Raw Response:\n{}", rawContent);

        try {
            return objectMapper.readValue(rawContent, OptimizeResult.class);
        } catch (Exception e) {
            log.error("[ReviewOptimizeSkillV2] Failed to parse optimize result. Raw: {}", rawContent, e);
            throw new RuntimeException("Failed to parse optimize result: " + rawContent, e);
        }
    }

    private String callHttp(String systemPrompt, String userPrompt) {
        try {
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", "qwen3-8b");
            requestBody.put("temperature", 0.3);
            requestBody.put("max_tokens", 1024);
            requestBody.put("enable_thinking", false); // 关键：非流式必须关闭 thinking

            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", systemPrompt));
            messages.add(Map.of("role", "user", "content", userPrompt));
            requestBody.put("messages", messages);

            String jsonBody = objectMapper.writeValueAsString(requestBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(BASE_URL))
                    .header("Authorization", "Bearer " + API_KEY)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(60))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() != 200) {
                throw new RuntimeException("HTTP " + response.statusCode() + ": " + response.body());
            }

            // 解析 OpenAI 兼容格式响应
            Map<String, Object> responseMap = objectMapper.readValue(response.body(), Map.class);
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseMap.get("choices");
            if (choices == null || choices.isEmpty()) {
                throw new RuntimeException("No choices in response: " + response.body());
            }
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            return (String) message.get("content");

        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("HTTP call failed", e);
        }
    }
}
