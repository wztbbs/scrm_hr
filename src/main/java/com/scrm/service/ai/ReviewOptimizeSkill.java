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
                .withModel("qwen3-8b")
                .withTemperature(0.3)
                .withMaxTokens(1024)
                .build();

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
                You are a strict editor reviewing recruitment LinkedIn DMs.
                Check: robotic, repetitive, pushy, generic, length 40-100 words.
                If passed, output 3 versions (50-80 words each):
                - direct: professional
                - gentle: soft, "maybe"
                - casual: contractions, friendly
                Output JSON schema: {"passed":bool,"issues":[],"versions":{"direct":"","gentle":"","casual":""}}
                No markdown. No text outside JSON.
                """;

        log.info("[ReviewOptimizeSkill] >>> CALL LLM START | model=qwen3-8b");
        log.info("[ReviewOptimizeSkill] System Prompt:\n{}", systemPrompt);
        log.info("[ReviewOptimizeSkill] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        var prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(renderedPrompt)),
                options
        );

        ChatResponse response = chatModel.call(prompt);
        String rawContent = response.getResult().getOutput().getContent();

        long duration = System.currentTimeMillis() - start;
        log.info("[ReviewOptimizeSkill] <<< CALL LLM END | duration={}ms", duration);
        log.info("[ReviewOptimizeSkill] Raw Response:\n{}", rawContent);

        try {
            return objectMapper.readValue(rawContent, OptimizeResult.class);
        } catch (Exception e) {
            log.error("[ReviewOptimizeSkill] Failed to parse optimize result. Raw: {}", rawContent, e);
            throw new RuntimeException("Failed to parse optimize result: " + rawContent, e);
        }
    }
}
