package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.dao.CandidateExtMapper;
import com.scrm.dao.CandidateMapper;
import com.scrm.dao.sub.SubCandidateMapper;
import com.scrm.entity.Candidate;
import com.scrm.entity.CandidateExample;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class CandidateService {

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;
    @Autowired
    private CandidateExtMapper candidateExtMapper;
    @Autowired
    private SubCandidateMapper subCandidateMapper;
    @Autowired
    private SequenceService sequenceService;
    @Autowired
    private SubscriptionService subscriptionService;
    @Autowired
    private HistoryService historyService;

    public List<Candidate> listCandidates(String search, String temperature, String status,
                                          String source, String sortBy, String sortOrder,
                                          Date syncSince, int page, int pageSize) {
        Long userId = RequestContext.getCurrentUserId();
        int offset = (page - 1) * pageSize;
        return candidateExtMapper.searchByKeyword(userId, search, temperature, status, source,
                syncSince, sortBy, sortOrder, offset, pageSize);
    }

    public long countCandidates(String search, String temperature, String status,
                                String source, Date syncSince) {
        Long userId = RequestContext.getCurrentUserId();
        return candidateExtMapper.countSearchByKeyword(userId, search, temperature, status, source, syncSince);
    }

    public CandidateWithBLOBs getCandidate(String id) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = findById(userId, id);
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
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
            if (PipelineStageEnum.DELETE.getValue().equalsIgnoreCase(existingStage)
                    || PipelineStageEnum.UNCLAIMED.getValue().equalsIgnoreCase(existingStage)) {
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
    public Map<String, Object> batchCandidates(List<Map<String, Object>> items) {
        Long userId = RequestContext.getCurrentUserId();
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> item : items) {
            Map<String, Object> result = new HashMap<>();
            String action = (String) item.getOrDefault("_sync_action", "create");
            try {
                // Resolve candidate by id or linkedin_id
                CandidateWithBLOBs existing = null;
                Object idObj = item.get("id");
                if (idObj != null) {
                    try {
                        existing = candidateMapper.selectByPrimaryKey(Long.parseLong(idObj.toString()));
                        if (existing != null && !existing.getUserId().equals(userId)) {
                            existing = null;
                        }
                    } catch (NumberFormatException ignored) {}
                }
                if (existing == null && item.get("linkedin_id") != null) {
                    CandidateExample ex = new CandidateExample();
                    ex.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo((String) item.get("linkedin_id"));
                    List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(ex);
                    if (!list.isEmpty()) {
                        existing = list.get(0);
                    }
                }

                if ("delete".equals(action)) {
                    if (existing != null) {
                        candidateMapper.deleteByPrimaryKey(existing.getId());
                    }
                    result.put("status", "deleted");
                } else {
                    CandidateWithBLOBs candidate = mapToCandidate(item);
                    candidate.setUserId(userId);
                    if (existing == null) {
                        subscriptionService.checkCandidateLimit(userId);
                        candidateMapper.insertSelective(candidate);
                        result.put("status", "created");
                        result.put("id", candidate.getId());
                    } else {
                        candidate.setId(existing.getId());
                        candidate.setUserId(null);
                        candidate.setCreatedAt(null);
                        candidate.setUpdatedAt(new Date());
                        candidateMapper.updateByPrimaryKeySelective(candidate);
                        result.put("status", "updated");
                        result.put("id", existing.getId());
                    }
                }
            } catch (Exception e) {
                result.put("status", "failed");
                result.put("error", e.getMessage());
            }
            results.add(result);
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("results", results);
        resp.put("sync_token", UUID.randomUUID().toString());
        return resp;
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

    public CandidateWithBLOBs getCandidateByLinkedInId(String linkedInId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateExample example = new CandidateExample();
        example.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo(linkedInId);
        List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
        return list.isEmpty() ? null : list.get(0);
    }

    public List<Candidate> listTodayTasks() {
        Long userId = RequestContext.getCurrentUserId();
        // End of today
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 23);
        cal.set(Calendar.MINUTE, 59);
        cal.set(Calendar.SECOND, 59);
        cal.set(Calendar.MILLISECOND, 999);
        Date endOfDay = cal.getTime();

        CandidateExample example = new CandidateExample();
        example.createCriteria()
                .andUserIdEqualTo(userId)
                .andNextFollowupAtIsNotNull()
                .andNextFollowupAtLessThanOrEqualTo(endOfDay)
                .andPipelineStageNotEqualTo(PipelineStageEnum.DELETE.getValue());
        example.setOrderByClause("next_followup_at ASC");
        return candidateMapper.selectByExample(example);
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

    private CandidateWithBLOBs mapToCandidate(Map<String, Object> map) {
        CandidateWithBLOBs c = new CandidateWithBLOBs();

        c.setFullName((String) map.get("full_name"));
        c.setHeadline((String) map.get("headline"));
        c.setJobTitle((String) map.get("job_title"));
        c.setCompany((String) map.get("company"));
        c.setLocation((String) map.get("location"));
        c.setLinkedinUrl((String) map.get("linkedin_url"));
        c.setLinkedinId((String) map.get("linkedin_id"));
        c.setEmail((String) map.get("email"));
        c.setPhone((String) map.get("phone"));
        c.setAvatarUrl((String) map.get("avatar_url"));
        c.setConnectionDegree((String) map.get("connection_degree"));
        c.setTemperature((String) map.get("temperature"));
        if (map.containsKey("is_ai_suggested_temp")) {
            c.setIsAiSuggestedTemp((Boolean) map.get("is_ai_suggested_temp"));
        }

        c.setSource((String) map.get("source"));
        if (map.get("tags") != null) {
            c.setTags(map.get("tags").toString());
        }
        if (map.get("raw_profile_data") != null) {
            c.setRawProfileData(map.get("raw_profile_data").toString());
        }
        return c;
    }
}
