package com.scrm.service.ai;

import com.scrm.dto.OptimizeResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class ReviewOptimizeSkill {

    private final ChatClient chatClient;

    public ReviewOptimizeSkill(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    public OptimizeResult reviewAndOptimize(String draft, List<CandidateHistoryWithBLOBs> history) {
        var options = OpenAiChatOptions.builder()
                .withModel("anthropic/claude-3.5-haiku")
                .withTemperature(0.7)
                .build();

        String historySnapshot = history.stream()
                .filter(h -> "chat_message".equals(h.getHistoryType()) || "message_sent".equals(h.getHistoryType()))
                .limit(5)
                .map(h -> h.getContentSnapshot() != null ? h.getContentSnapshot() : h.getTitle())
                .collect(Collectors.joining(" | "));

        String prompt = String.format("""
            【待审查消息】
            %s
            
            【历史消息（用于查重）】
            %s
            
            【任务】
            1. 审查：是否有AI腔？是否重复历史内容？是否过于推销？（passed: true/false）
            2. 将消息改写成 3 个版本：
               - direct：直接版，开门见山
               - gentle：温和版，礼貌试探
               - casual：轻松版，随意自然
            
            输出 JSON：
            {
              "passed": boolean,
              "issues": ["string"],
              "versions": {
                "direct": "string",
                "gentle": "string",
                "casual": "string"
              }
            }
            """,
                draft,
                historySnapshot.isEmpty() ? "无历史消息" : historySnapshot
        );

        return chatClient.prompt()
                .options(options)
                .system("You are a sharp editor who spots AI-generated text, repetition, and pushy sales language in recruitment messages. Output must be valid JSON.")
                .user(prompt)
                .call()
                .entity(OptimizeResult.class);
    }
}
