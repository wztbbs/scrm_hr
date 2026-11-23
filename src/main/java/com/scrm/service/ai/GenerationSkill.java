package com.scrm.service.ai;

import com.hubspot.jinjava.Jinjava;
import com.scrm.dto.StrategyResult;
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

@Component
public class GenerationSkill {

    private static final Logger log = LoggerFactory.getLogger(GenerationSkill.class);

    private final OpenAiChatModel chatModel;
    private final Jinjava jinjava;
    private final String template;

    public GenerationSkill(OpenAiChatModel chatModel) {
        this.chatModel = chatModel;
        this.jinjava = new Jinjava();
        try {
            this.template = new String(
                    new ClassPathResource("prompts/generation.txt").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load generation prompt template", e);
        }
    }

    public String generate(StrategyResult strategy, CandidateWithBLOBs candidate, String jobTitle, String jobFunction, String contactMode) {
        var options = OpenAiChatOptions.builder()
                .withModel("qwen-plus")
                .withTemperature(0.7)
                .withMaxTokens(512)
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
        context.put("mode", contactMode != null ? contactMode : "recruiting");

        String renderedPrompt = jinjava.render(template, context);
        String systemPrompt = "You are a busy senior recruiter who messages 100+ people a week. You sound curious, human, and low-pressure. Return ONLY the message body text. No quotes, no JSON, no signatures.";

        log.info("[GenerationSkill] >>> CALL LLM START | model=qwen-plus");
        log.info("[GenerationSkill] System Prompt:\n{}", systemPrompt);
        log.info("[GenerationSkill] User Prompt:\n{}", renderedPrompt);

        long start = System.currentTimeMillis();

        var prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(renderedPrompt)),
                options
        );

        ChatResponse response = chatModel.call(prompt);
        String rawContent = response.getResult().getOutput().getContent();

        long duration = System.currentTimeMillis() - start;
        log.info("[GenerationSkill] <<< CALL LLM END | duration={}ms", duration);
        log.info("[GenerationSkill] Raw Response:\n{}", rawContent);

        return rawContent;
    }
}
