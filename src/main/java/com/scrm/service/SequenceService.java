package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.*;
import com.scrm.dao.sub.SubCandidateMapper;
import com.scrm.dto.SequenceRequest;
import com.scrm.dto.SequenceStepRequest;
import com.scrm.entity.*;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

@Service
public class SequenceService {

    private static final Logger log = LoggerFactory.getLogger(SequenceService.class);

    @Autowired
    @Qualifier("sequenceMapper")
    private SequenceMapper sequenceMapper;
    @Autowired
    @Qualifier("sequenceStepMapper")
    private SequenceStepMapper sequenceStepMapper;
    @Autowired
    @Qualifier("candidateSequenceMapper")
    private CandidateSequenceMapper candidateSequenceMapper;
    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    private SubCandidateMapper subCandidateMapper;
    @Autowired
    private SubscriptionService subscriptionService;
    @Autowired
    private HistoryService historyService;

    public List<Sequence> listSequences(Boolean isActive, Boolean isTemplate, String search) {
        Long userId = RequestContext.getCurrentUserId();
        SequenceExample example = new SequenceExample();

        // Criteria 1: user's own sequences
        SequenceExample.Criteria criteria1 = example.createCriteria().andUserIdEqualTo(userId);
        if (isActive != null) {
            criteria1.andIsActiveEqualTo(isActive);
        }
        if (search != null && !search.isEmpty()) {
            criteria1.andNameLike("%" + search + "%");
        }

        // Criteria 2: system templates / defaults
        SequenceExample.Criteria criteria2 = example.or().andIsTemplateEqualTo(true);
        if (isActive != null) {
            criteria2.andIsActiveEqualTo(isActive);
        }
        if (search != null && !search.isEmpty()) {
            criteria2.andNameLike("%" + search + "%");
        }

        return sequenceMapper.selectByExample(example);
    }

    public Sequence getSequence(String id) {
        Long userId = RequestContext.getCurrentUserId();
        Sequence seq = findSequence(userId, id);
        if (seq == null) throw new BusinessException("Sequence not found");
        SequenceStepExample example = new SequenceStepExample();
        example.createCriteria().andSequenceIdEqualTo(seq.getId());
        example.setOrderByClause("step_number ASC");
        List<SequenceStep> steps = sequenceStepMapper.selectByExample(example);
        // attach steps as a transient field
        seq.getClass();
        return seq;
    }

    public List<SequenceStep> getSequenceSteps(Long sequenceId) {
        SequenceStepExample example = new SequenceStepExample();
        example.createCriteria().andSequenceIdEqualTo(sequenceId);
        example.setOrderByClause("step_number ASC");
        return sequenceStepMapper.selectByExample(example);
    }

    private Sequence findSequence(Long userId, String id) {
        try {
            return sequenceMapper.selectByPrimaryKey(Long.parseLong(id));
        } catch (NumberFormatException e) {
            log.error("Invalid sequence id format", e);
            return null;
        }
    }

    @Transactional
    public Sequence createSequence(Sequence sequence, List<SequenceStepRequest> steps) {
        Long userId = RequestContext.getCurrentUserId();
        subscriptionService.checkSequenceLimit(userId);
        sequence.setUserId(userId);
        sequence.setStepCount(steps != null ? steps.size() : 0);
        sequence.setIsTemplate(false);
        sequence.setIsActive(true);
        sequence.setCreatedAt(new Date());
        sequence.setUpdatedAt(new Date());
        sequenceMapper.insertSelective(sequence);
        if (steps != null) {
            for (SequenceStepRequest req : steps) {
                SequenceStep step = new SequenceStep();
                step.setSequenceId(sequence.getId());
                step.setUserId(userId);
                step.setStepNumber(req.getStepNumber());
                step.setName(req.getName());
                step.setActionType(req.getActionType());
                step.setDelayType(req.getDelayType());
                step.setDelayValue(req.getDelayValue());
                step.setMessageTemplate(req.getMessageTemplate());
                step.setMessageSubject(req.getMessageSubject());
                step.setCreatedAt(new Date());
                step.setUpdatedAt(new Date());
                sequenceStepMapper.insertSelective(step);
            }
        }
        return sequence;
    }

    @Transactional
    public Sequence updateSequence(String id, Sequence sequence, List<SequenceStepRequest> steps) {
        Long userId = RequestContext.getCurrentUserId();
        Sequence existing = findSequence(userId, id);
        if (existing == null) throw new BusinessException("Sequence not found");
        sequence.setId(existing.getId());
        sequence.setUserId(null);
        sequence.setCreatedAt(null);
        sequence.setUpdatedAt(new Date());
        if (steps != null) {
            sequence.setStepCount(steps.size());
        }
        sequenceMapper.updateByPrimaryKeySelective(sequence);
        if (steps != null) {
            // delete old steps
            SequenceStepExample ex = new SequenceStepExample();
            ex.createCriteria().andSequenceIdEqualTo(existing.getId());
            for (SequenceStep s : sequenceStepMapper.selectByExample(ex)) {
                sequenceStepMapper.deleteByPrimaryKey(s.getId());
            }
            // insert new steps
            for (SequenceStepRequest req : steps) {
                SequenceStep step = new SequenceStep();
                step.setSequenceId(existing.getId());
                step.setUserId(userId);
                step.setStepNumber(req.getStepNumber());
                step.setName(req.getName());
                step.setActionType(req.getActionType());
                step.setDelayType(req.getDelayType());
                step.setDelayValue(req.getDelayValue());
                step.setMessageTemplate(req.getMessageTemplate());
                step.setMessageSubject(req.getMessageSubject());
                step.setCreatedAt(new Date());
                step.setUpdatedAt(new Date());
                sequenceStepMapper.insertSelective(step);
            }
        }
        return sequenceMapper.selectByPrimaryKey(existing.getId());
    }

    @Transactional
    public void deleteSequence(String id) {
        Long userId = RequestContext.getCurrentUserId();
        Sequence existing = findSequence(userId, id);
        if (existing == null) throw new BusinessException("Sequence not found");
        // delete steps
        SequenceStepExample ex = new SequenceStepExample();
        ex.createCriteria().andSequenceIdEqualTo(existing.getId());
        for (SequenceStep s : sequenceStepMapper.selectByExample(ex)) {
            sequenceStepMapper.deleteByPrimaryKey(s.getId());
        }
        // delete candidate bindings
        CandidateSequenceExample cse = new CandidateSequenceExample();
        cse.createCriteria().andSequenceIdEqualTo(existing.getId());
        for (CandidateSequence cs : candidateSequenceMapper.selectByExample(cse)) {
            candidateSequenceMapper.deleteByPrimaryKey(cs.getId());
        }
        sequenceMapper.deleteByPrimaryKey(existing.getId());
    }

    // Candidate Sequences
    public List<CandidateSequence> listCandidateSequences(String status, String candidateId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateSequenceExample example = new CandidateSequenceExample();
        CandidateSequenceExample.Criteria criteria = example.createCriteria().andUserIdEqualTo(userId);
        if (status != null && !status.isEmpty()) {
            criteria.andStatusEqualTo(status);
        }
        if (candidateId != null && !candidateId.isEmpty()) {
            // find candidate id
            Long cid = resolveCandidateId(userId, candidateId);
            if (cid != null) {
                criteria.andCandidateIdEqualTo(cid);
            }
        }
        return candidateSequenceMapper.selectByExample(example);
    }

    @Transactional
    public CandidateSequence createCandidateSequence(CandidateSequence cs) {
        Long userId = RequestContext.getCurrentUserId();

        // 1. Check if candidate already has an active binding to the SAME sequence
        CandidateSequenceExample existingExample = new CandidateSequenceExample();
        existingExample.createCriteria()
                .andUserIdEqualTo(userId)
                .andCandidateIdEqualTo(cs.getCandidateId())
                .andStatusEqualTo("active");
        List<CandidateSequence> existingList = candidateSequenceMapper.selectByExample(existingExample);
        if (!existingList.isEmpty()) {
            CandidateSequence existing = existingList.get(0);
            if (existing.getSequenceId().equals(cs.getSequenceId())) {
                // Same sequence, no change needed, no popup
                existing.setRebound(false);
                return existing;
            }
            // Different sequence: delete old binding (rebound)
            for (CandidateSequence old : existingList) {
                candidateSequenceMapper.deleteByPrimaryKey(old.getId());
            }
        }

        // 2. Create new binding (first time or rebound)
        cs.setUserId(userId);
        cs.setCreatedAt(new Date());
        cs.setUpdatedAt(new Date());
        cs.setCurrentStepNumber(1);
        cs.setStatus("active");

        // get sequence steps to set total_steps
        SequenceStepExample example = new SequenceStepExample();
        example.createCriteria().andSequenceIdEqualTo(cs.getSequenceId());
        example.setOrderByClause("step_number ASC");
        List<SequenceStep> steps = sequenceStepMapper.selectByExample(example);
        cs.setTotalSteps(steps.size());
        candidateSequenceMapper.insertSelective(cs);

        // Auto-record history
        historyService.recordHistory(cs.getCandidateId(), "sequence_started",
                "Sequence started (step 1/" + cs.getTotalSteps() + ")", "system");

        cs.setRebound(true);
        return cs;
    }

    @Transactional
    public void deleteCandidateSequence(String id) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateSequence cs = findCandidateSequence(userId, id);
        if (cs == null) throw new BusinessException("Candidate sequence not found");
        candidateSequenceMapper.deleteByPrimaryKey(cs.getId());
    }

    /**
     * Advance candidate sequence to next step and update follow-up.
     * Returns the suggested next follow-up info (null if no more steps).
     */
    @Transactional
    public Map<String, Object> advanceSequenceStep(Long candidateSequenceId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateSequence cs = candidateSequenceMapper.selectByPrimaryKey(candidateSequenceId);
        if (cs == null || !cs.getUserId().equals(userId)) {
            throw new BusinessException("Candidate sequence not found");
        }

        int nextStepNumber = cs.getCurrentStepNumber() + 1;
        if (nextStepNumber > cs.getTotalSteps()) {
            // all steps completed
            cs.setStatus("completed");
            cs.setCompletedAt(new Date());
            candidateSequenceMapper.updateByPrimaryKeySelective(cs);
            return Map.of("completed", true);
        }

        // update current step
        cs.setCurrentStepNumber(nextStepNumber);
        cs.setUpdatedAt(new Date());
        candidateSequenceMapper.updateByPrimaryKeySelective(cs);

        // Auto-record history
        historyService.recordHistory(cs.getCandidateId(), "sequence_advanced",
                "Advanced to step " + nextStepNumber + "/" + cs.getTotalSteps(), "system");

        // find next step for follow-up
        SequenceStepExample example = new SequenceStepExample();
        example.createCriteria().andSequenceIdEqualTo(cs.getSequenceId()).andStepNumberEqualTo(nextStepNumber + 1);
        List<SequenceStep> nextSteps = sequenceStepMapper.selectByExample(example);

        if (nextSteps.isEmpty()) {
            return Map.of("completed", false, "current_step", nextStepNumber, "has_next_suggestion", false);
        }

        SequenceStep nextStep = nextSteps.get(0);
        Date suggestedTime = calculateFollowupTime(new Date(), nextStep.getDelayType(), nextStep.getDelayValue());

        // check candidate source before updating
        CandidateWithBLOBs candidate = candidateMapper.selectByPrimaryKey(cs.getCandidateId());
        if (candidate != null) {
            if ("manual".equals(candidate.getNextFollowupSource())) {
                // do not overwrite, just return suggestion
                return Map.of(
                        "completed", false,
                        "current_step", nextStepNumber,
                        "has_next_suggestion", true,
                        "suggested_time", suggestedTime,
                        "sequence_step_id", nextStep.getId(),
                        "source", "manual",
                        "message", "Sequence suggests: " + suggestedTime
                );
            } else {
                // auto update
                subCandidateMapper.updateNextFollowup(cs.getCandidateId(), suggestedTime, "sequence", nextStep.getId());
                return Map.of(
                        "completed", false,
                        "current_step", nextStepNumber,
                        "has_next_suggestion", true,
                        "suggested_time", suggestedTime,
                        "sequence_step_id", nextStep.getId(),
                        "source", "sequence",
                        "updated", true
                );
            }
        }

        return Map.of("completed", false, "current_step", nextStepNumber, "has_next_suggestion", false);
    }

    /**
     * Mark follow-up as done.
     * Clears next_followup_at. If sequence has next step, returns suggestion.
     */
    @Transactional
    public Map<String, Object> markFollowupDone(Long candidateId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = candidateMapper.selectByPrimaryKey(candidateId);
        if (candidate == null || !candidate.getUserId().equals(userId)) {
            throw new BusinessException("Candidate not found");
        }

        // clear user follow-up
        subCandidateMapper.updateNextFollowup(candidateId, null, "none", null);

        // Auto-record history
        historyService.recordHistory(candidateId, "follow_up_completed",
                "Follow-up completed", "user");

        // find active candidate sequence
        CandidateSequenceExample example = new CandidateSequenceExample();
        example.createCriteria().andCandidateIdEqualTo(candidateId).andStatusEqualTo("active");
        List<CandidateSequence> css = candidateSequenceMapper.selectByExample(example);

        if (css.isEmpty()) {
            return Map.of("sequence_completed", true, "message", "All sequence steps completed");
        }

        CandidateSequence cs = css.get(0);
        int nextStepNumber = cs.getCurrentStepNumber() + 1;
        if (nextStepNumber > cs.getTotalSteps()) {
            cs.setStatus("completed");
            cs.setCompletedAt(new Date());
            candidateSequenceMapper.updateByPrimaryKeySelective(cs);
            return Map.of("sequence_completed", true, "message", "All sequence steps completed");
        }

        // find next step for suggestion
        SequenceStepExample se = new SequenceStepExample();
        se.createCriteria().andSequenceIdEqualTo(cs.getSequenceId()).andStepNumberEqualTo(nextStepNumber + 1);
        List<SequenceStep> nextSteps = sequenceStepMapper.selectByExample(se);

        if (nextSteps.isEmpty()) {
            return Map.of("sequence_completed", false, "has_suggestion", false);
        }

        SequenceStep nextStep = nextSteps.get(0);
        Date suggestedTime = calculateFollowupTime(new Date(), nextStep.getDelayType(), nextStep.getDelayValue());

        return Map.of(
                "sequence_completed", false,
                "has_suggestion", true,
                "suggested_time", suggestedTime,
                "sequence_step_id", nextStep.getId(),
                "message", "Sequence suggests next follow-up on " + suggestedTime
        );
    }

    @Transactional
    public void updateCandidateFollowup(Long candidateId, Date nextFollowupAt, String source, Long sequenceStepId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = candidateMapper.selectByPrimaryKey(candidateId);
        if (candidate == null || !candidate.getUserId().equals(userId)) {
            throw new BusinessException("Candidate not found");
        }
        subCandidateMapper.updateNextFollowup(candidateId, nextFollowupAt, source, sequenceStepId);
    }

    private Date calculateFollowupTime(Date base, String delayType, Integer delayValue) {
        if (base == null) base = new Date();
        if (delayValue == null || delayValue <= 0) return base;
        Calendar cal = Calendar.getInstance();
        cal.setTime(base);
        switch (delayType != null ? delayType.toLowerCase() : "days") {
            case "immediately":
                break;
            case "minutes":
                cal.add(Calendar.MINUTE, delayValue);
                break;
            case "hours":
                cal.add(Calendar.HOUR, delayValue);
                break;
            case "days":
                cal.add(Calendar.DAY_OF_YEAR, delayValue);
                break;
            case "weeks":
                cal.add(Calendar.WEEK_OF_YEAR, delayValue);
                break;
            default:
                cal.add(Calendar.DAY_OF_YEAR, delayValue);
        }
        return cal.getTime();
    }

    private CandidateSequence findCandidateSequence(Long userId, String id) {
        try {
            return candidateSequenceMapper.selectByPrimaryKey(Long.parseLong(id));
        } catch (NumberFormatException e) {
            log.error("Invalid candidate sequence id format", e);
            return null;
        }
    }

    private Long resolveCandidateId(Long userId, String id) {
        try {
            return Long.parseLong(id);
        } catch (NumberFormatException e) {
            log.error("Invalid candidate id format", e);
            return null;
        }
    }
}
