package com.scrm.service.ai;

import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@Component
public class GenerationSkill {

    private final ChatClient chatClient;
    private final Jinjava jinjava;
    private final String template;

    public GenerationSkill(ChatClient chatClient) {
        this.chatClient = chatClient;
        this.jinjava = new Jinjava();
        try {
            this.template = new String(
                    new ClassPathResource("prompts/generation.txt").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load generation prompt template", e);
        }
    }

    public String generate(StrategyResult strategy, CandidateWithBLOBs candidate, String jobTitle, String jobFunction) {
        var options = OpenAiChatOptions.builder()
                .withModel("qwen3.6-plus")
                .withTemperature(0.6)
                .withMaxTokens(800)
                .build();

        Map<String, Object> context = new HashMap<>();
        context.put("goal", strategy.getGoal());
        context.put("reason", strategy.getReason());
        context.put("keyInsight", strategy.getKeyInsight());
        context.put("fullName", candidate.getFullName());
        context.put("jobTitle", candidate.getJobTitle());
        context.put("company", candidate.getCompany());
        context.put("location", candidate.getLocation());
        context.put("headline", candidate.getHeadline());
        context.put("jobTitleReq", jobTitle != null ? jobTitle : "Not specified");
        context.put("jobFunctionReq", jobFunction != null ? jobFunction : "Not specified");

        String prompt = jinjava.render(template, context);

        return chatClient.prompt()
                .options(options)
                .system("You are an expert recruitment copywriter specializing in LinkedIn outreach. You write highly personalized, natural-sounding messages that sound like they were written by a human, not an AI.")
                .user(prompt)
                .call()
                .content();
    }
}
