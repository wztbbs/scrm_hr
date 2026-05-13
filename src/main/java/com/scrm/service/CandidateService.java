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
        CandidateWithBLOBs candidate = findByIdOrLocalId(userId, id);
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
        return candidate;
    }

    private CandidateWithBLOBs findByIdOrLocalId(Long userId, String id) {
        if (id.startsWith("local:")) {
            String localId = id.substring(6);
            CandidateExample example = new CandidateExample();
            example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(localId);
            List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
            return list.isEmpty() ? null : list.get(0);
        } else {
            try {
                Long numericId = Long.parseLong(id);
                CandidateWithBLOBs c = candidateMapper.selectByPrimaryKey(numericId);
                if (c != null && !c.getUserId().equals(userId)) {
                    return null;
                }
                return c;
            } catch (NumberFormatException e) {
                CandidateExample example = new CandidateExample();
                example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(id);
                List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
                return list.isEmpty() ? null : list.get(0);
            }
        }
    }

    @Transactional
    public CandidateWithBLOBs createCandidate(CandidateWithBLOBs candidate) {
        Long userId = RequestContext.getCurrentUserId();

        // Upsert logic: query first, update if exists, insert if not
        CandidateWithBLOBs existing = null;
        if (candidate.getId() != null) {
            existing = candidateMapper.selectByPrimaryKey(candidate.getId());
        }
        if (existing == null && candidate.getLocalId() != null) {
            CandidateExample example = new CandidateExample();
            example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(candidate.getLocalId());
            List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
            if (!list.isEmpty()) {
                existing = list.get(0);
            }
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
        return candidate;
    }

    @Transactional
    public CandidateWithBLOBs updateCandidate(String id, CandidateWithBLOBs candidate) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findByIdOrLocalId(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        candidate.setId(existing.getId());
        candidate.setUserId(null);
        candidate.setLocalId(null);
        candidate.setCreatedAt(null);
        candidate.setUpdatedAt(new Date());
        candidateMapper.updateByPrimaryKeySelective(candidate);
        return candidateMapper.selectByPrimaryKey(existing.getId());
    }

    @Transactional
    public void deleteCandidate(String id, boolean hardDelete) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findByIdOrLocalId(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
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
            String localId = (String) item.get("local_id");
            result.put("local_id", localId);
            String action = (String) item.getOrDefault("_sync_action", "create");
            try {
                if ("delete".equals(action)) {
                    CandidateExample example = new CandidateExample();
                    example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(localId);
                    List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
                    if (!list.isEmpty()) {
                        candidateMapper.deleteByPrimaryKey(list.get(0).getId());
                    }
                    result.put("status", "deleted");
                } else {
                    CandidateWithBLOBs candidate = mapToCandidate(item);
                    candidate.setUserId(userId);
                    CandidateExample example = new CandidateExample();
                    example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(localId);
                    List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
                    if (list.isEmpty()) {
                        candidateMapper.insertSelective(candidate);
                        result.put("status", "created");
                        result.put("id", candidate.getId());
                    } else {
                        candidate.setId(list.get(0).getId());
                        candidate.setLocalId(null);
                        candidate.setUserId(null);
                        candidate.setCreatedAt(null);
                        candidate.setUpdatedAt(new Date());
                        candidateMapper.updateByPrimaryKeySelective(candidate);
                        result.put("status", "updated");
                        result.put("id", list.get(0).getId());
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
        CandidateWithBLOBs existing = findByIdOrLocalId(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        subCandidateMapper.updateNextFollowup(existing.getId(), nextFollowupAt, source, sequenceStepId);
    }

    public Map<String, Object> markFollowupDone(String id) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs existing = findByIdOrLocalId(userId, id);
        if (existing == null) {
            throw new BusinessException("Candidate not found");
        }
        return sequenceService.markFollowupDone(existing.getId());
    }

    private CandidateWithBLOBs mapToCandidate(Map<String, Object> map) {
        CandidateWithBLOBs c = new CandidateWithBLOBs();
        c.setLocalId((String) map.get("local_id"));
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
