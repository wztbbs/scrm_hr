package com.scrm.service.ai;

import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class AnalysisStrategySkill {

    private final ChatClient chatClient;

    public AnalysisStrategySkill(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    public StrategyResult analyzeAndDecide(
            CandidateWithBLOBs candidate,
            List<CandidateHistoryWithBLOBs> history,
            String jobTitle,
            String jobFunction,
            String pipelineStage) {

        var options = OpenAiChatOptions.builder()
                .withModel("google/gemini-1.5-flash")
                .withTemperature(0.1)
                .build();

        String prompt = String.format("""
            【候选人画像】
            姓名：%s
            当前职位：%s @ %s
            地点：%s
            LinkedIn Headline：%s
            温度/意向：%s
            
            【互动历史】
            %s
            
            【在招岗位需求】
            岗位名称：%s
            职能领域：%s
            
            【当前 Pipeline 阶段】
            %s
            
            请完成以下任务：
            1. 提取候选人关键信息（技能、跳槽意向、关注因素）
            2. 根据 Pipeline 阶段和互动历史，决定本次消息目标
            3. 输出 JSON：{intent: string, goal: string, reason: string, keyInsight: string}
            
            goal 只能是以下之一：break_ice（破冰）/ advance（推进）/ re_activate（重新激活）/ close（关闭）
            """,
                candidate.getFullName(),
                candidate.getJobTitle(),
                candidate.getCompany(),
                candidate.getLocation(),
                candidate.getHeadline(),
                candidate.getTemperature(),
                formatHistory(history),
                jobTitle != null ? jobTitle : "未指定",
                jobFunction != null ? jobFunction : "未指定",
                pipelineStage
        );

        return chatClient.prompt()
                .options(options)
                .system("You are an expert recruiter analyst. Analyze candidate profiles and interaction history to identify key signals and optimal messaging angles. Output must be valid JSON.")
                .user(prompt)
                .call()
                .entity(StrategyResult.class);
    }

    private String formatHistory(List<CandidateHistoryWithBLOBs> history) {
        if (history == null || history.isEmpty()) {
            return "暂无互动历史";
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
