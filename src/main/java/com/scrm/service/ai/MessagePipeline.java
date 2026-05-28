package com.scrm.service.ai;

import com.scrm.dto.OptimizeResult;
import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MessagePipeline {

    private final AnalysisStrategySkill analysisStrategySkill;
    private final GenerationSkill generationSkill;
    private final ReviewOptimizeSkillV2 reviewOptimizeSkillV2;

    public MessagePipeline(
            AnalysisStrategySkill analysisStrategySkill,
            GenerationSkill generationSkill,
            ReviewOptimizeSkillV2 reviewOptimizeSkillV2) {
        this.analysisStrategySkill = analysisStrategySkill;
        this.generationSkill = generationSkill;
        this.reviewOptimizeSkillV2 = reviewOptimizeSkillV2;
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

        // Step 1: 分析+策略（Gemini Flash，快）
        StrategyResult strategy = analysisStrategySkill.analyzeAndDecide(
                candidate, history, jobTitle, jobFunction, pipelineStage
        );

        // Step 2: 生成（Claude Sonnet，质量核心）
        String draft = generationSkill.generate(strategy, candidate, jobTitle, jobFunction);

        // Step 3: 审核+优化（Claude Haiku，输出多版本）
        OptimizeResult result = reviewOptimizeSkillV2.reviewAndOptimize(draft, history);

        return new PipelineResult(strategy, draft, result);
    }

    public record PipelineResult(
            StrategyResult strategy,
            String draft,
            OptimizeResult optimizeResult
    ) {}
}
