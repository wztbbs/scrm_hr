package com.scrm.service.ai;

import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

@Component
public class GenerationSkill {

    private final ChatClient chatClient;

    public GenerationSkill(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    public String generate(StrategyResult strategy, CandidateWithBLOBs candidate, String jobTitle, String jobFunction) {
        var options = OpenAiChatOptions.builder()
                .withModel("anthropic/claude-3.5-sonnet")
                .withTemperature(0.6)
                .withMaxTokens(800)
                .build();

        String prompt = String.format("""
            【消息目标】%s
            【目标理由】%s
            【关键洞察】%s
            
            【候选人】
            %s（%s at %s）
            地点：%s
            Headline：%s
            
            【在招岗位】
            %s（%s 领域）
            
            【写作要求】
            1. 语气自然，像真人猎头写的，绝对不要 "I hope this message finds you well"
            2. 不要过度推销，用"worth a brief chat"而不是"life-changing opportunity"
            3. 引用候选人背景的具体细节（公司、技能），不要泛泛而谈
            4. 长度控制在 50-80 个英文单词
            5. 直接输出消息正文，不要加标题、签名、JSON格式
            
            请写一条 LinkedIn 消息。
            """,
                strategy.getGoal(),
                strategy.getReason(),
                strategy.getKeyInsight(),
                candidate.getFullName(),
                candidate.getJobTitle(),
                candidate.getCompany(),
                candidate.getLocation(),
                candidate.getHeadline(),
                jobTitle != null ? jobTitle : "未指定",
                jobFunction != null ? jobFunction : "未指定"
        );

        return chatClient.prompt()
                .options(options)
                .system("You are an expert recruitment copywriter who writes highly personalized, natural-sounding LinkedIn messages.")
                .user(prompt)
                .call()
                .content();
    }
}
