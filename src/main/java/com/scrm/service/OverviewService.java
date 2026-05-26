package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.sub.SubSubscriptionMapper;
import com.scrm.dto.OverviewVO;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.entity.Subscription;
import com.scrm.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class OverviewService {

    private static final Logger log = LoggerFactory.getLogger(OverviewService.class);

    @Autowired
    private UserService userService;
    @Autowired
    private SubSubscriptionMapper subSubscriptionMapper;
    @Autowired
    private PipelineService pipelineService;
    @Autowired
    private CandidateService candidateService;

    public OverviewVO buildOverview(String linkedInId, Long clientTimeMs) {
        Long userId = RequestContext.getCurrentUserId();
        OverviewVO vo = new OverviewVO();

        // 1. User + Subscription
        try {
            User user = userService.getCurrentUser();
            Map<String, Object> userMap = new HashMap<>();
            userMap.put("id", user.getId());
            userMap.put("uuid", user.getUuid());
            userMap.put("email", user.getEmail());
            userMap.put("isActive", user.getIsActive());
            userMap.put("mergedToUserId", user.getMergedToUserId());
            vo.setUser(userMap);

            Subscription activeSub = subSubscriptionMapper.selectValidActiveByUserId(user.getId());
            boolean isPro = activeSub != null;
            boolean needBindEmail = isPro && (user.getEmail() == null || user.getEmail().trim().isEmpty());
            Map<String, Object> subMap = new HashMap<>();
            subMap.put("isPro", isPro);
            subMap.put("needBindEmail", needBindEmail);
            if (activeSub != null) {
                subMap.put("status", activeSub.getStatus());
                subMap.put("currentPeriodEnd", activeSub.getCurrentPeriodEnd());
                subMap.put("cancelAtPeriodEnd", activeSub.getCancelAtPeriodEnd());
            }
            vo.setSubscription(subMap);
        } catch (Exception e) {
            log.error("[Overview] Failed to load user/subscription", e);
        }

        // 2. Pipeline stages
        try {
            Map<String, Object> stagesData = pipelineService.listStages();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> stages = (List<Map<String, Object>>) stagesData.get("items");
            vo.setPipelineStages(stages);
        } catch (Exception e) {
            log.error("[Overview] Failed to load pipeline stages", e);
        }

        // 3. Today tasks
        try {
            vo.setTodayTasks(candidateService.listTodayTasks(clientTimeMs));
            vo.setTodayTaskOverdueCount((int) candidateService.countOverdueTasks(clientTimeMs));
        } catch (Exception e) {
            log.error("[Overview] Failed to load today tasks", e);
        }

        // 4. Candidate by linkedInId (optional, fail-safe)
        if (linkedInId != null && !linkedInId.isEmpty()) {
            try {
                CandidateWithBLOBs candidate = candidateService.getCandidateByLinkedInId(linkedInId);
                vo.setCandidate(candidate);
            } catch (Exception e) {
                log.warn("[Overview] Failed to load candidate by linkedInId: {}, error: {}", linkedInId, e.getMessage());
            }
        }

        return vo;
    }
}
