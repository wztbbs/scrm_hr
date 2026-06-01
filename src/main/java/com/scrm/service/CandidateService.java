package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.common.TaskStatus;
import com.scrm.dao.CandidateMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.scrm.dao.CandidateSequenceMapper;
import com.scrm.dao.sub.SubCandidateMapper;
import com.scrm.entity.Candidate;
import com.scrm.entity.CandidateExample;
import com.scrm.entity.CandidateSequence;
import com.scrm.entity.CandidateSequenceExample;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class CandidateService {

    private static final Logger log = LoggerFactory.getLogger(CandidateService.class);

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    private SubCandidateMapper subCandidateMapper;
    @Autowired
    private SequenceService sequenceService;
    @Autowired
    private SubscriptionService subscriptionService;
    @Autowired
    private HistoryService historyService;
    @Autowired
    private CandidateSequenceMapper candidateSequenceMapper;

    public List<Candidate> listCandidates(String search, String temperature, String status,
                                          String source, String sortBy, String sortOrder,
                                          Date syncSince, int page, int pageSize) {
        Long userId = RequestContext.getCurrentUserId();
        int offset = (page - 1) * pageSize;
        return subCandidateMapper.searchByKeyword(userId, search, temperature, status, source,
                syncSince, sortBy, sortOrder, offset, pageSize);
    }

    public long countCandidates(String search, String temperature, String status,
                                String source, Date syncSince) {
        Long userId = RequestContext.getCurrentUserId();
        return subCandidateMapper.countSearchByKeyword(userId, search, temperature, status, source, syncSince);
    }

    public CandidateWithBLOBs getCandidate(String id) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = findById(userId, id);
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
        fillSequenceId(candidate);
        return candidate;
    }

    private CandidateWithBLOBs findById(Long userId, String id) {
        try {
            Long numericId = Long.parseLong(id);
            CandidateWithBLOBs c = candidateMapper.selectByPrimaryKey(numericId);
            if (c != null && !c.getUserId().equals(userId)) {
                return null;
            }
            return c;
        } catch (NumberFormatException e) {
            log.error("Invalid candidate id format", e);
            return null;
        }
    }

    @Transactional
    public CandidateWithBLOBs createCandidate(CandidateWithBLOBs candidate) {
        Long userId = RequestContext.getCurrentUserId();

        // Deduplication by linkedin_id + user_id
        CandidateWithBLOBs existing = null;
        if (candidate.getLinkedinId() != null && !candidate.getLinkedinId().isEmpty()) {
            CandidateExample example = new CandidateExample();
            example.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo(candidate.getLinkedinId());
            List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
            if (!list.isEmpty()) {
                existing = list.get(0);
            }
        }
        if (existing == null && candidate.getId() != null) {
            existing = candidateMapper.selectByPrimaryKey(candidate.getId());
        }
        if (existing != null) {
            String existingStage = existing.getPipelineStage();
            if (existingStage == null) existingStage = PipelineStageEnum.NEW.getValue();

            // If existing stage is delete or unclaimed, re-calculate to 'new' for manual save
            // Skip for linkedin_chat source: keep unclaimed as-is
            boolean isChatSource = "linkedin_chat".equalsIgnoreCase(candidate.getSource())
                    || "linkedin_chat".equalsIgnoreCase(existing.getSource());
            if (!isChatSource && (PipelineStageEnum.DELETE.getValue().equalsIgnoreCase(existingStage)
                    || PipelineStageEnum.UNCLAIMED.getValue().equalsIgnoreCase(existingStage))) {
                candidate.setPipelineStage(PipelineStageEnum.NEW.getValue());
                candidate.setPipelineEnteredAt(new Date());
            }

            // Update existing record
            candidate.setId(existing.getId());
            candidate.setUserId(userId);
            candidate.setCreatedAt(existing.getCreatedAt());
            candidate.setUpdatedAt(new Date());
            candidateMapper.updateByPrimaryKeySelective(candidate);
            return candidate;
        }

        // Check candidate limit before inserting new record
        subscriptionService.checkCandidateLimit(userId);

        // Insert new record
        candidate.setUserId(userId);

        if (candidate.getTemperature() == null) {
            candidate.setTemperature("cold");
        }
        if (candidate.getSource() == null) {
            candidate.setSource("linkedin_profile");
        }
        if (candidate.getPipelineStage() == null) {
            candidate.setPipelineStage(PipelineStageEnum.NEW.getValue());
        }
        if (candidate.getPipelinePosition() == null) {
            candidate.setPipelinePosition(0);
        }
        candidate.setCreatedAt(new Date());
        candidate.setUpdatedAt(new Date());
        candidateMapper.insertSelective(candidate);

        // Auto-record history
        historyService.recordHistory(candidate.getId(), "candidate_created",
                "Candidate created: " + candidate.getFullName(), "user");

        return candidate;
    }

    @Transactional
    public CandidateWithBLOBs updateCandidate(String id, CandidateWithBLOBs candidate) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findById(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }

        // Auto-recover from delete stage
        if (PipelineStageEnum.DELETE.getValue().equalsIgnoreCase(existing.getPipelineStage())) {
            candidate.setPipelineStage(PipelineStageEnum.NEW.getValue());
            historyService.recordHistory(existing.getId(), "status_change",
                    "Recovered from delete to new", "system");
        }

        // Detect pipeline stage change for history
        String newStage = candidate.getPipelineStage();
        if (newStage != null && !newStage.equalsIgnoreCase(existing.getPipelineStage())) {
            historyService.recordHistory(existing.getId(), "status_change",
                    "Moved from " + existing.getPipelineStage() + " to " + newStage, "user");
        }

        candidate.setId(existing.getId());
        candidate.setUserId(null);
        candidate.setCreatedAt(null);
        candidate.setUpdatedAt(new Date());
        candidateMapper.updateByPrimaryKeySelective(candidate);
        return candidateMapper.selectByPrimaryKey(existing.getId());
    }

    @Transactional
    public void deleteCandidate(String id, boolean hardDelete) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findById(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        historyService.recordHistory(existing.getId(), "candidate_deleted",
                "Candidate deleted: " + existing.getFullName(), "user");
        if (hardDelete) {
            candidateMapper.deleteByPrimaryKey(existing.getId());
        } else {
            CandidateWithBLOBs update = new CandidateWithBLOBs();
            update.setId(existing.getId());

            update.setPipelineStage(PipelineStageEnum.DELETE.getValue());
            update.setUpdatedAt(new Date());
            candidateMapper.updateByPrimaryKeySelective(update);
        }
    }

    @Transactional
    public void updateFollowup(String id, Date nextFollowupAt, String source, Long sequenceStepId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findById(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        subCandidateMapper.updateNextFollowup(existing.getId(), nextFollowupAt, source, sequenceStepId);
        historyService.recordHistory(existing.getId(), "follow_up_scheduled",
                "Follow-up scheduled for " + nextFollowupAt, "user");
    }

    @Transactional
    public void updatePipelineStage(String id, String pipelineStage) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findById(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        String oldStage = existing.getPipelineStage();
        subCandidateMapper.updatePipelineStage(existing.getId(), pipelineStage);
        historyService.recordHistory(existing.getId(), "status_change",
                "Moved from " + oldStage + " to " + pipelineStage, "user");
    }

    public CandidateWithBLOBs getCandidateByLinkedInId(String linkedInId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateExample example = new CandidateExample();
        example.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo(linkedInId);
        List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
        if (list.isEmpty()) {
            return null;
        }
        CandidateWithBLOBs candidate = list.get(0);
        fillSequenceId(candidate);
        return candidate;
    }

    private void fillSequenceId(CandidateWithBLOBs candidate) {
        if (candidate == null || candidate.getId() == null) {
            return;
        }
        CandidateSequenceExample example = new CandidateSequenceExample();
        example.createCriteria().andCandidateIdEqualTo(candidate.getId());
        List<CandidateSequence> bindings = candidateSequenceMapper.selectByExample(example);
        if (!bindings.isEmpty()) {
            candidate.setSequenceId(bindings.get(0).getSequenceId());
        }
    }

    private static final int DUE_SOON_MINUTES = 60;

    private TaskStatus evaluateTaskStatus(Date nextFollowupAt, long clientTimeMs) {
        if (nextFollowupAt == null) {
            return null;
        }
        long diffMs = nextFollowupAt.getTime() - clientTimeMs;
        if (diffMs < 0) {
            return TaskStatus.OVERDUE;
        }
        if (diffMs <= DUE_SOON_MINUTES * 60000L) {
            return TaskStatus.DUE_SOON;
        }
        return TaskStatus.UPCOMING;
    }

    public List<Candidate> listTodayTasks(Long clientTimeMs) {
        Long userId = RequestContext.getCurrentUserId();
        long thresholdMs = clientTimeMs + DUE_SOON_MINUTES * 60000L;
        List<Candidate> tasks = subCandidateMapper.selectTodayTasks(userId, clientTimeMs, thresholdMs);
        tasks.forEach(c -> c.setTaskStatus(evaluateTaskStatus(c.getNextFollowupAt(), clientTimeMs)));
        return tasks;
    }

    public long countOverdueTasks(Long clientTimeMs) {
        Long userId = RequestContext.getCurrentUserId();
        return subCandidateMapper.countOverdueTasks(userId, clientTimeMs);
    }

    public Map<String, Object> markFollowupDone(String id) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findById(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        Map<String, Object> result = sequenceService.markFollowupDone(existing.getId());
        historyService.recordHistory(existing.getId(), "follow_up_completed",
                "Follow-up completed", "user");
        return result;
    }


}
