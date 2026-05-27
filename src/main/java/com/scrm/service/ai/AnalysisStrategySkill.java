package com.scrm.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
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
public class AnalysisStrategySkill {

    private static final Logger log = LoggerFactory.getLogger(AnalysisStrategySkill.class);

    private final OpenAiChatModel chatModel;
    private final Jinjava jinjava;
    private final String template;
    private final ObjectMapper objectMapper;

    public AnalysisStrategySkill(OpenAiChatModel chatModel) {
        this.chatModel = chatModel;
        this.jinjava = new Jinjava();
        this.objectMapper = new ObjectMapper();
        try {
            this.template = new String(
                    new ClassPathResource("prompts/analysis-strategy.txt").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load analysis-strategy prompt template", e);
        }
    }

    public StrategyResult analyzeAndDecide(
            CandidateWithBLOBs candidate,
            List<CandidateHistoryWithBLOBs> history,
            String jobTitle,
            String jobFunction,
            String pipelineStage) {

        var options = OpenAiChatOptions.builder()
                .withModel("qwen3.7-max")
                .withTemperature(0.1)
                .build();

        Map<String, Object> context = new HashMap<>();
        context.put("fullName", candidate.getFullName());
        context.put("jobTitle", candidate.getJobTitle());
        context.put("company", candidate.getCompany());
        context.put("location", candidate.getLocation());
        context.put("headline", candidate.getHeadline());
        context.put("temperature", candidate.getTemperature());
        context.put("history", formatHistory(history));
        context.put("jobTitleReq", jobTitle != null ? jobTitle : "Not specified");
        context.put("jobFunctionReq", jobFunction != null ? jobFunction : "Not specified");
        context.put("pipelineStage", pipelineStage);

        String renderedPrompt = jinjava.render(template, context);
        String systemPrompt = "You are an expert recruiter analyst. Analyze candidate profiles and interaction history to identify key signals and determine the optimal messaging strategy. Output must be valid JSON only.";

        log.info("[AnalysisStrategySkill] >>> CALL LLM START | model=qwen3.7-max");
        log.debug("[AnalysisStrategySkill] System Prompt:\n{}", systemPrompt);
        log.debug("[AnalysisStrategySkill] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        var prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(renderedPrompt)),
                options
        );

        ChatResponse response = chatModel.call(prompt);
        String rawContent = response.getResult().getOutput().getContent();

        long duration = System.currentTimeMillis() - start;
        log.info("[AnalysisStrategySkill] <<< CALL LLM END | duration={}ms", duration);
        log.debug("[AnalysisStrategySkill] Raw Response:\n{}", rawContent);

        try {
            return objectMapper.readValue(rawContent, StrategyResult.class);
        } catch (Exception e) {
            log.error("[AnalysisStrategySkill] Failed to parse strategy result. Raw: {}", rawContent, e);
            throw new RuntimeException("Failed to parse strategy result: " + rawContent, e);
        }
    }

    private String formatHistory(List<CandidateHistoryWithBLOBs> history) {
        if (history == null || history.isEmpty()) {
            return "No interaction history yet.";
        }
        return history.stream()
                .limit(10)
                .map(h -> String.format("- [%s] %s: %s",
                        h.getHistoryTime(),
                        h.getTitle(),
                        h.getDescription() != null ? h.getDescription() : ""))
                .collect(Collectors.joining("\n"));
    }
}
