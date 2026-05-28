package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.dao.*;
import com.scrm.dto.AiMessageRequest;
import com.scrm.dto.AiMessageResponse;
import com.scrm.dto.StrategyResult;
import com.scrm.entity.*;
import com.scrm.service.ai.MessagePipeline;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AiMessageService {

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    @Qualifier("candidateHistoryMapper")
    private CandidateHistoryMapper historyMapper;
    @Autowired
    @Qualifier("candidateSequenceMapper")
    private CandidateSequenceMapper candidateSequenceMapper;
    @Autowired
    @Qualifier("sequenceMapper")
    private SequenceMapper sequenceMapper;
    @Autowired
    @Qualifier("sequenceStepMapper")
    private SequenceStepMapper sequenceStepMapper;
    @Autowired
    private MessagePipeline messagePipeline;
    @Autowired
    private SubscriptionService subscriptionService;

    public AiMessageResponse generateMessages(AiMessageRequest request) {
        Long userId = RequestContext.getCurrentUserId();
        subscriptionService.checkAndIncrementAiUsage(userId);

        CandidateWithBLOBs candidate = resolveCandidate(userId, request);
        if (candidate == null) {
            throw new RuntimeException("Candidate not found");
        }
        Long candidateId = candidate.getId();

        List<CandidateHistoryWithBLOBs> histories = fetchHistory(userId, candidateId);
        String pipelineStage = resolvePipelineStage(candidate);
        SequenceContext seqCtx = resolveSequenceContext(userId, candidateId, request);

        String jobTitle = request.getJobTitle() != null ? request.getJobTitle() : seqCtx.jobTitle;
        String jobFunction = request.getJobFunction() != null ? request.getJobFunction() : seqCtx.jobFunction;
        String contactMode = request.getContactMode() != null ? request.getContactMode() : "recruiting";

        MessagePipeline.PipelineResult pipelineResult = messagePipeline.generate(
                candidate, histories, jobTitle, jobFunction, pipelineStage, contactMode
        );

        return buildResponse(pipelineResult);
    }

    private AiMessageResponse buildResponse(MessagePipeline.PipelineResult result) {
        StrategyResult strategy = result.strategy();
        String optimized = result.optimizedMessage();

        AiMessageResponse response = new AiMessageResponse();
        response.setStrategy(strategy);
        response.setMessage(optimized);
        return response;
    }

    private CandidateWithBLOBs resolveCandidate(Long userId, AiMessageRequest request) {
        if (request.getCandidateId() != null) {
            CandidateWithBLOBs c = candidateMapper.selectByPrimaryKey(request.getCandidateId());
            if (c != null && c.getUserId().equals(userId)) {
                return c;
            }
        }
        return null;
    }

    private List<CandidateHistoryWithBLOBs> fetchHistory(Long userId, Long candidateId) {
        CandidateHistoryExample example = new CandidateHistoryExample();
        example.createCriteria().andUserIdEqualTo(userId).andCandidateIdEqualTo(candidateId);
        example.setOrderByClause("history_time DESC");
        return historyMapper.selectByExampleWithBLOBs(example);
    }

    private String resolvePipelineStage(CandidateWithBLOBs candidate) {
        String stageValue = candidate.getPipelineStage();
        if (stageValue == null || stageValue.isEmpty()) {
            return "New";
        }
        PipelineStageEnum stage = PipelineStageEnum.fromValue(stageValue);
        return stage != null ? stage.getLabel() : "New";
    }

    private SequenceContext resolveSequenceContext(Long userId, Long candidateId, AiMessageRequest request) {
        SequenceContext ctx = new SequenceContext();
        ctx.currentStep = request.getCurrentStep() != null ? request.getCurrentStep() : 0;
        ctx.stepName = request.getStepName();
        ctx.lastMessageSentAt = request.getLastMessageSentAt();
        ctx.candidateReplied = request.getCandidateReplied() != null ? request.getCandidateReplied() : false;
        ctx.jobTitle = null;
        ctx.jobFunction = null;

        CandidateSequenceExample example = new CandidateSequenceExample();
        example.createCriteria().andUserIdEqualTo(userId).andCandidateIdEqualTo(candidateId).andStatusEqualTo("active");
        List<CandidateSequence> bindings = candidateSequenceMapper.selectByExample(example);
        if (!bindings.isEmpty()) {
            CandidateSequence binding = bindings.get(0);
            ctx.currentStep = binding.getCurrentStepNumber();
            Sequence seq = sequenceMapper.selectByPrimaryKey(binding.getSequenceId());
            if (seq != null) {
                ctx.jobTitle = seq.getJobTitle();
                ctx.jobFunction = seq.getJobFunction();
                SequenceStepExample stepEx = new SequenceStepExample();
                stepEx.createCriteria().andSequenceIdEqualTo(seq.getId()).andStepNumberEqualTo(ctx.currentStep + 1);
                List<SequenceStep> steps = sequenceStepMapper.selectByExample(stepEx);
                if (!steps.isEmpty()) {
                    ctx.stepName = steps.get(0).getName();
                }
            }
        }
        return ctx;
    }

    private static class SequenceContext {
        int currentStep;
        String stepName;
        String lastMessageSentAt;
        boolean candidateReplied;
        String jobTitle;
        String jobFunction;
    }
}
