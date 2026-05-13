package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import com.scrm.common.RequestContext;
import com.scrm.dao.CandidateHistoryMapper;
import com.scrm.dao.CandidateMapper;
import com.scrm.dto.ChatMessageRequest;
import com.scrm.entity.CandidateExample;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateWithBLOBs;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ChatMessageService {

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;

    @Autowired
    @Qualifier("candidateHistoryMapper")
    private CandidateHistoryMapper historyMapper;

    @Transactional
    public Map<String, Object> processChatMessage(ChatMessageRequest request) {
        Long userId = RequestContext.getCurrentUserId();

        CandidateWithBLOBs candidate = findCandidateByLinkedInId(userId, request.getLinkedInId());
        String action;

        if (candidate == null) {
            candidate = createCandidateFromChat(userId, request);
            action = "created";
        } else {
            String currentStage = candidate.getPipelineStage();
            if (currentStage == null) currentStage = "new";

            if (PipelineStageEnum.DELETE.getValue().equalsIgnoreCase(currentStage)
                    || PipelineStageEnum.UNCLAIMED.getValue().equalsIgnoreCase(currentStage)) {
                // Re-calculate stage based on chat interaction: upgrade to 'messaged'
                CandidateWithBLOBs update = new CandidateWithBLOBs();
                update.setId(candidate.getId());
                update.setPipelineStage(PipelineStageEnum.MESSAGED.getValue());
                update.setPipelineEnteredAt(new Date());
                update.setLastActivityAt(new Date());
                update.setUpdatedAt(new Date());
                candidateMapper.updateByPrimaryKeySelective(update);
                candidate.setPipelineStage(PipelineStageEnum.MESSAGED.getValue());
                action = "upgraded";
            } else {
                // Just update last activity
                CandidateWithBLOBs update = new CandidateWithBLOBs();
                update.setId(candidate.getId());
                update.setLastActivityAt(new Date());
                update.setUpdatedAt(new Date());
                candidateMapper.updateByPrimaryKeySelective(update);
                action = "existing";
            }
        }

        CandidateHistoryWithBLOBs history = createHistoryFromChat(userId, candidate, request);

        Map<String, Object> result = new HashMap<>();
        result.put("candidateId", candidate.getId());
        result.put("historyId", history.getId());
        result.put("action", action);
        return result;
    }

    private CandidateWithBLOBs findCandidateByLinkedInId(Long userId, String linkedInId) {
        if (linkedInId == null || linkedInId.isEmpty()) {
            return null;
        }
        CandidateExample example = new CandidateExample();
        example.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo(linkedInId);
        List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
        return list.isEmpty() ? null : list.get(0);
    }

    private CandidateWithBLOBs createCandidateFromChat(Long userId, ChatMessageRequest request) {
        CandidateWithBLOBs candidate = new CandidateWithBLOBs();
        candidate.setLocalId("auto-chat-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        candidate.setUserId(userId);
        candidate.setFullName(request.getSenderName() != null ? request.getSenderName() : "Unknown");
        candidate.setLinkedinId(request.getLinkedInId());
        candidate.setLinkedinUrl(request.getLinkedInUrl() != null ? request.getLinkedInUrl() : "");

        candidate.setTemperature("cold");
        candidate.setSource("linkedin_chat");
        candidate.setPipelineStage(PipelineStageEnum.UNCLAIMED.getValue());
        candidate.setPipelinePosition(0);
        candidate.setPipelineEnteredAt(new Date());
        candidate.setLastActivityAt(new Date());
        candidate.setCreatedAt(new Date());
        candidate.setUpdatedAt(new Date());
        candidateMapper.insertSelective(candidate);
        return candidate;
    }

    private CandidateHistoryWithBLOBs createHistoryFromChat(Long userId, CandidateWithBLOBs candidate, ChatMessageRequest request) {
        CandidateHistoryWithBLOBs history = new CandidateHistoryWithBLOBs();
        history.setLocalId("auto-chat-hist-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        history.setUserId(userId);
        history.setCandidateId(candidate.getId());
        history.setLocalCandidateId(candidate.getLocalId());
        history.setHistoryType("chat_message");
        String direction = (request.getIsInbound() != null && request.getIsInbound()) ? "Received" : "Sent";
        String text = request.getText() != null ? request.getText() : "";
        String title = direction + ": " + (text.length() > 100 ? text.substring(0, 100) : text);
        history.setTitle(title);
        history.setDescription(text);
        history.setActorType((request.getIsInbound() != null && request.getIsInbound()) ? "candidate" : "user");
        history.setActorName(request.getSenderName());
        history.setFullContent(text);

        String metadata = String.format("{\"conversationId\":\"%s\",\"messageId\":\"%s\",\"isInbound\":%s}",
                request.getConversationId() != null ? request.getConversationId() : "",
                request.getMessageId() != null ? request.getMessageId() : "",
                request.getIsInbound() != null ? request.getIsInbound() : false);
        history.setMetadata(metadata);

        Date historyTime = parseTimestamp(request.getTimestamp());
        history.setHistoryTime(historyTime != null ? historyTime : new Date());
        history.setCreatedAt(new Date());

        historyMapper.insertSelective(history);
        return history;
    }

    private Date parseTimestamp(String timestamp) {
        if (timestamp == null || timestamp.isEmpty()) {
            return null;
        }
        try {
            return new Date(Instant.parse(timestamp).toEpochMilli());
        } catch (Exception e) {
            try {
                return new Date(Long.parseLong(timestamp));
            } catch (Exception e2) {
                return null;
            }
        }
    }
}
