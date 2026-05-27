package com.scrm.service.ai;

import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.OptimizeResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class ReviewOptimizeSkill {

    private final ChatClient chatClient;
    private final Jinjava jinjava;
    private final String template;

    public ReviewOptimizeSkill(ChatClient chatClient) {
        this.chatClient = chatClient;
        this.jinjava = new Jinjava();
        try {
            this.template = new String(
                    new ClassPathResource("prompts/review-optimize.txt").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load review-optimize prompt template", e);
        }
    }

    public OptimizeResult reviewAndOptimize(String draft, List<CandidateHistoryWithBLOBs> history) {
        var options = OpenAiChatOptions.builder()
                .withModel("qwen3.6-plus")
                .withTemperature(0.7)
                .build();

        String historySnapshot = history.stream()
                .filter(h -> "chat_message".equals(h.getHistoryType()) || "message_sent".equals(h.getHistoryType()))
                .limit(5)
                .map(h -> h.getContentSnapshot() != null ? h.getContentSnapshot() : h.getTitle())
                .collect(Collectors.joining(" | "));

        Map<String, Object> context = new HashMap<>();
        context.put("draft", draft);
        context.put("historySnapshot", historySnapshot.isEmpty() ? "No history messages" : historySnapshot);

        String prompt = jinjava.render(template, context);

        return chatClient.prompt()
                .options(options)
                .system("You are a sharp editor reviewing recruitment messages. Your job is to detect AI-generated patterns, repetition, and pushy sales language. You must output valid JSON only.")
                .user(prompt)
                .call()
                .entity(OptimizeResult.class);
    }
}
