package com.scrm.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubspot.jinjava.Jinjava;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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
 * ReviewOptimizeSkill — 使用原生 HTTP 调用阿里云百炼 OpenAI 兼容 API
 * 输出单条优化后的消息文本，不再返回多版本 JSON
 */
@Component
public class ReviewOptimizeSkill {

    private static final Logger log = LoggerFactory.getLogger(ReviewOptimizeSkill.class);

    @Value("${spring.ai.openai.api-key}")
    private String apiKey;

    @Value("${spring.ai.openai.base-url}")
    private String baseUrl;

    private final HttpClient httpClient;
    private final Jinjava jinjava;
    private final String template;
    private final ObjectMapper objectMapper;

    public ReviewOptimizeSkill() {
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

    /**
     * 审核并优化草稿，返回单条优化后的消息文本
     */
    public String reviewAndOptimize(String draft, List<CandidateHistoryWithBLOBs> history) {
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

        String userPrompt = jinjava.render(template, context);

        String systemPrompt = "You are a strict editor rewriting AI-sounding LinkedIn recruiter messages. Return ONLY the rewritten message. No quotes, no JSON.";

        log.info("[ReviewOptimizeSkill] >>> CALL LLM START | model=qwen3-8b");
        log.info("[ReviewOptimizeSkill] User Prompt:\n{}", userPrompt);

        long start = System.currentTimeMillis();

        String optimizedMessage = callHttp(systemPrompt, userPrompt);

        long duration = System.currentTimeMillis() - start;
        log.info("[ReviewOptimizeSkill] <<< CALL LLM END | duration={}ms", duration);
        log.info("[ReviewOptimizeSkill] Optimized Message:\n{}", optimizedMessage);

        return cleanMarkdown(optimizedMessage);
    }

    private String callHttp(String systemPrompt, String userPrompt) {
        try {
            String chatUrl = baseUrl.endsWith("/") ? baseUrl + "v1/chat/completions" : baseUrl + "/v1/chat/completions";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", "qwen3-8b");
            requestBody.put("temperature", 0.3);
            requestBody.put("max_tokens", 512);
            requestBody.put("enable_thinking", false);

            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", systemPrompt));
            messages.add(Map.of("role", "user", "content", userPrompt));
            requestBody.put("messages", messages);

            String jsonBody = objectMapper.writeValueAsString(requestBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(chatUrl))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .timeout(Duration.ofSeconds(60))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() != 200) {
                throw new RuntimeException("HTTP " + response.statusCode() + ": " + response.body());
            }

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

    private String cleanMarkdown(String text) {
        if (text == null) return "";
        return text.replace("\"", "")
                   .replace("```", "")
                   .trim();
    }
}
