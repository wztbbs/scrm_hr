package com.scrm.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.OptimizeResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
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

    private static final Logger log = LoggerFactory.getLogger(ReviewOptimizeSkill.class);

    private final OpenAiChatModel chatModel;
    private final Jinjava jinjava;
    private final String template;
    private final ObjectMapper objectMapper;

    public ReviewOptimizeSkill(OpenAiChatModel chatModel) {
        this.chatModel = chatModel;
        this.jinjava = new Jinjava();
        this.objectMapper = new ObjectMapper();
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

        String renderedPrompt = jinjava.render(template, context);
        String systemPrompt = "You are a sharp editor reviewing recruitment messages. Your job is to detect AI-generated patterns, repetition, and pushy sales language. You must output valid JSON only.";

        log.info("[ReviewOptimizeSkill] >>> CALL LLM START | model=qwen3.6-plus");
        log.debug("[ReviewOptimizeSkill] System Prompt:\n{}", systemPrompt);
        log.debug("[ReviewOptimizeSkill] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        var prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(renderedPrompt)),
                options
        );

        ChatResponse response = chatModel.call(prompt);
        String rawContent = response.getResult().getOutput().getContent();

        long duration = System.currentTimeMillis() - start;
        log.info("[ReviewOptimizeSkill] <<< CALL LLM END | duration={}ms", duration);
        log.debug("[ReviewOptimizeSkill] Raw Response:\n{}", rawContent);

        try {
            return objectMapper.readValue(rawContent, OptimizeResult.class);
        } catch (Exception e) {
            log.error("[ReviewOptimizeSkill] Failed to parse optimize result. Raw: {}", rawContent, e);
            throw new RuntimeException("Failed to parse optimize result: " + rawContent, e);
        }
    }
}
