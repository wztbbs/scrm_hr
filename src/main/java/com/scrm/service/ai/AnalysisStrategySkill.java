package com.scrm.service.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
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
import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Component
public class AnalysisStrategySkill {

    private static final Logger log = LoggerFactory.getLogger(AnalysisStrategySkill.class);

    private final OpenAiChatModel chatModel;
    private final Jinjava jinjava;
    private final String template;
    private final ObjectMapper objectMapper;

    // 本地缓存：候选人画像 30 分钟内不会变
    private final Cache<Long, StrategyResult> analysisCache = Caffeine.newBuilder()
            .expireAfterWrite(30, TimeUnit.MINUTES)
            .maximumSize(1000)
            .build();

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

        Long candidateId = candidate != null ? candidate.getId() : null;

        // 先查本地缓存
        if (candidateId != null) {
            StrategyResult cached = analysisCache.getIfPresent(candidateId);
            if (cached != null) {
                log.info("[AnalysisStrategySkill] Cache HIT | candidateId={}", candidateId);
                return cached;
            }
        }

        var options = OpenAiChatOptions.builder()
                .withModel("qwen-plus")
                .withTemperature(0.1)
                .withMaxTokens(512)
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
        String systemPrompt = "You are an expert recruiter analyst. Output must be valid JSON only.";

        log.info("[AnalysisStrategySkill] >>> CALL LLM START | model=qwen-plus");
        log.info("[AnalysisStrategySkill] System Prompt:\n{}", systemPrompt);
        log.info("[AnalysisStrategySkill] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        var prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(renderedPrompt)),
                options
        );

        ChatResponse response = chatModel.call(prompt);
        String rawContent = response.getResult().getOutput().getContent();

        long duration = System.currentTimeMillis() - start;
        log.info("[AnalysisStrategySkill] <<< CALL LLM END | duration={}ms", duration);
        log.info("[AnalysisStrategySkill] Raw Response:\n{}", rawContent);

        try {
            StrategyResult result = objectMapper.readValue(rawContent, StrategyResult.class);
            if (candidateId != null) {
                analysisCache.put(candidateId, result);
            }
            return result;
        } catch (Exception e) {
            log.error("[AnalysisStrategySkill] Failed to parse strategy result. Raw: {}", rawContent, e);
            throw new RuntimeException("Failed to parse strategy result: " + rawContent, e);
        }
    }

    private static final SimpleDateFormat HISTORY_TIME_FMT = new SimpleDateFormat("MM-dd HH:mm");

    private String formatHistory(List<CandidateHistoryWithBLOBs> history) {
        if (history == null || history.isEmpty()) {
            return "No interaction history yet.";
        }
        return history.stream()
                // 过滤包含 null 的记录
                .filter(h -> {
                    String title = h.getTitle() != null ? h.getTitle() : "";
                    String desc = h.getDescription() != null ? h.getDescription() : "";
                    return !title.toLowerCase().contains("null") && !desc.toLowerCase().contains("null");
                })
                .limit(5)
                .map(h -> {
                    String timeStr = h.getHistoryTime() != null
                            ? HISTORY_TIME_FMT.format(h.getHistoryTime())
                            : "--";
                    String title = h.getTitle() != null ? h.getTitle().trim() : "";
                    String desc = h.getDescription() != null ? h.getDescription().trim() : "";

                    // 去重：title 和 description 相同则只保留一份
                    if (!desc.isEmpty() && title.equalsIgnoreCase(desc)) {
                        return String.format("- [%s] %s", timeStr, title);
                    }
                    if (!desc.isEmpty()) {
                        return String.format("- [%s] %s: %s", timeStr, title, desc);
                    }
                    return String.format("- [%s] %s", timeStr, title);
                })
                .collect(Collectors.joining("\n"));
    }
}
