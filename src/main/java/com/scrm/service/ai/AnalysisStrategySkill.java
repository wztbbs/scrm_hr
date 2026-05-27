package com.scrm.service.ai;

import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
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
public class AnalysisStrategySkill {

    private final ChatClient chatClient;
    private final Jinjava jinjava;
    private final String template;

    public AnalysisStrategySkill(ChatClient chatClient) {
        this.chatClient = chatClient;
        this.jinjava = new Jinjava();
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

        String prompt = jinjava.render(template, context);

        return chatClient.prompt()
                .options(options)
                .system("You are an expert recruiter analyst. Analyze candidate profiles and interaction history to identify key signals and determine the optimal messaging strategy. Output must be valid JSON only.")
                .user(prompt)
                .call()
                .entity(StrategyResult.class);
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
