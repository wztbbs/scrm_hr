package com.scrm.service.ai;

import com.scrm.dto.StrategyResult;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MessagePipeline {

    private static final Logger log = LoggerFactory.getLogger(MessagePipeline.class);

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
     * 主入口：生成消息
     * 流程：Analysis → Generation → AI Tone Detector（本地规则）→ 可选 Review
     */
    public PipelineResult generate(
            CandidateWithBLOBs candidate,
            List<CandidateHistoryWithBLOBs> history,
            String jobTitle,
            String jobFunction,
            String pipelineStage,
            String contactMode) {

        // Step 1: 分析+策略（带本地缓存）
        StrategyResult strategy = analysisStrategySkill.analyzeAndDecide(
                candidate, history, jobTitle, jobFunction, pipelineStage
        );

        // Step 2: 生成草稿
        String draft = generationSkill.generate(strategy, candidate, jobTitle, jobFunction, contactMode);

        // Step 3: 本地 AI 腔检测（<1ms）
        String finalMessage;
        boolean reviewed;

        if (AiToneDetector.needsReview(draft)) {
            log.info("[MessagePipeline] AI tone detected, triggering review. Draft: {}", draft);
            finalMessage = reviewOptimizeSkill.reviewAndOptimize(draft, history);
            reviewed = true;
        } else {
            log.info("[MessagePipeline] Draft passed tone detector, skipping review.");
            finalMessage = draft;
            reviewed = false;
        }

        return new PipelineResult(strategy, draft, finalMessage, reviewed);
    }

    public record PipelineResult(
            StrategyResult strategy,
            String draft,
            String optimizedMessage,
            boolean reviewed
    ) {}
}
