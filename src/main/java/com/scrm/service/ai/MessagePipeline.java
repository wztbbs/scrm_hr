package com.scrm.service.ai;

import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MessagePipeline {

    private final AnalysisStrategySkill analysisStrategySkill;
    private final GenerationSkill generationSkill;
    private final ReviewOptimizeSkill reviewOptimizeSkill;

    public MessagePipeline(
            AnalysisStrategySkill analysisStrategySkill,
            GenerationSkill generationSkill,
            ReviewOptimizeSkill reviewOptimizeSkill) {
        this.analysisStrategySkill = analysisStrategySkill;
        this.generationSkill = generationSkill;
        this.reviewOptimizeSkill = reviewOptimizeSkill;
    }

    /**
     * 主入口：生成消息（3步Pipeline）
     */
    public PipelineResult generate(
            CandidateWithBLOBs candidate,
            List<CandidateHistoryWithBLOBs> history,
            String jobTitle,
            String jobFunction,
            String pipelineStage) {

        // Step 1: 分析+策略
        StrategyResult strategy = analysisStrategySkill.analyzeAndDecide(
                candidate, history, jobTitle, jobFunction, pipelineStage
        );

        // Step 2: 生成草稿
        String draft = generationSkill.generate(strategy, candidate, jobTitle, jobFunction);

        // Step 3: 审核+优化（返回单条优化后的消息）
        String optimized = reviewOptimizeSkill.reviewAndOptimize(draft, history);

        return new PipelineResult(strategy, draft, optimized);
    }

    public record PipelineResult(
            StrategyResult strategy,
            String draft,
            String optimizedMessage
    ) {}
}
