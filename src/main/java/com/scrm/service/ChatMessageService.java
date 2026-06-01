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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ChatMessageService {

    private static final Logger log = LoggerFactory.getLogger(ChatMessageService.class);

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;

    @Autowired
    @Qualifier("candidateHistoryMapper")
    private CandidateHistoryMapper historyMapper;

    @Transactional
    public Map<String, Object> processChatMessage(ChatMessageRequest request) {
        Long userId = RequestContext.getCurrentUserId();

        // 1. 查找候选人：优先用 candidateId，其次用 linkedinId
        CandidateWithBLOBs candidate = null;
        if (request.getCandidateId() != null && !request.getCandidateId().isEmpty()) {
            try {
                Long cid = Long.parseLong(request.getCandidateId());
                candidate = candidateMapper.selectByPrimaryKey(cid);
                if (candidate != null && !candidate.getUserId().equals(userId)) {
                    candidate = null;
                }
            } catch (NumberFormatException e) {
                log.warn("Invalid candidateId format: {}", request.getCandidateId());
            }
        }

        if (candidate == null && request.getLinkedinId() != null && !request.getLinkedinId().isEmpty()) {
            CandidateExample example = new CandidateExample();
            example.createCriteria().andUserIdEqualTo(userId).andLinkedinIdEqualTo(request.getLinkedinId());
            List<CandidateWithBLOBs> list = candidateMapper.selectByExampleWithBLOBs(example);
            if (!list.isEmpty()) {
                candidate = list.get(0);
            }
        }

        if (candidate == null) {
            log.warn("[ChatMessage] 未找到对应候选人，跳过保存消息。candidateId={}, linkedinId={}",
                    request.getCandidateId(), request.getLinkedinId());
            Map<String, Object> result = new HashMap<>();
            result.put("skipped", true);
            result.put("reason", "candidate_not_found");
            return result;
        }

        // 2. 更新候选人最后活动时间
        CandidateWithBLOBs update = new CandidateWithBLOBs();
        update.setId(candidate.getId());
        update.setLastActivityAt(new Date());
        update.setUpdatedAt(new Date());
        candidateMapper.updateByPrimaryKeySelective(update);

        // 3. 根据消息方向推进 pipeline stage（只进不退，delete 恢复除外）
        // 规则：消息时间必须晚于当前 pipeline_entered_at，否则不更新 stage
        String currentStage = candidate.getPipelineStage();
        boolean isInbound = request.getIsInbound() != null && request.getIsInbound();
        Date messageTime = parseTimestamp(request.getTimestamp());
        Date pipelineEnteredAt = candidate.getPipelineEnteredAt();

        boolean shouldUpdateStage = true;
        if (messageTime != null && pipelineEnteredAt != null && !messageTime.after(pipelineEnteredAt)) {
            // 消息时间 <= 当前 stage 的进入时间，说明是历史消息，不更新 stage
            shouldUpdateStage = false;
            log.info("[ChatMessage] 消息时间 {} 不晚于 pipelineEnteredAt {}，跳过 stage 更新。candidateId={}",
                    messageTime, pipelineEnteredAt, candidate.getId());
        }

        String newStage = null;
        if (shouldUpdateStage) {
            if (currentStage == null) {
                // 未设置阶段：Inbound → talking（对方主动），Outbound → messaged（我主动）
                newStage = isInbound ? PipelineStageEnum.TALKING.getValue() : PipelineStageEnum.MESSAGED.getValue();
            } else if (PipelineStageEnum.DELETE.getValue().equalsIgnoreCase(currentStage)) {
                // delete 恢复：Inbound → talking，Outbound → messaged
                newStage = isInbound ? PipelineStageEnum.TALKING.getValue() : PipelineStageEnum.MESSAGED.getValue();
            } else if (PipelineStageEnum.DONE.getValue().equalsIgnoreCase(currentStage)
                    || PipelineStageEnum.TALKING.getValue().equalsIgnoreCase(currentStage)) {
                // 终态 或 已在对话中：不前进
                newStage = null;
            } else if (PipelineStageEnum.MESSAGED.getValue().equalsIgnoreCase(currentStage)) {
                // 已联系：只有对方回复(Inbound)才前进到 talking，我继续发消息保持 messaged
                if (isInbound) {
                    newStage = PipelineStageEnum.TALKING.getValue();
                }
            } else if (PipelineStageEnum.UNCLAIMED.getValue().equalsIgnoreCase(currentStage)
                    || PipelineStageEnum.NEW.getValue().equalsIgnoreCase(currentStage)) {
                // 未认领 / new：Inbound → talking，Outbound → messaged
                newStage = isInbound ? PipelineStageEnum.TALKING.getValue() : PipelineStageEnum.MESSAGED.getValue();
            }
        }

        String action = "existing";
        if (newStage != null && !newStage.equalsIgnoreCase(currentStage)) {
            CandidateWithBLOBs stageUpdate = new CandidateWithBLOBs();
            stageUpdate.setId(candidate.getId());
            stageUpdate.setPipelineStage(newStage);
            stageUpdate.setPipelineEnteredAt(messageTime != null ? messageTime : new Date());
            candidateMapper.updateByPrimaryKeySelective(stageUpdate);
            action = "upgraded";
        }

        // 3. 保存聊天记录
        CandidateHistoryWithBLOBs history = createHistoryFromChat(userId, candidate, request);

        Map<String, Object> result = new HashMap<>();
        result.put("candidateId", candidate.getId());
        result.put("historyId", history.getId());
        result.put("action", action);
        return result;
    }

    private CandidateHistoryWithBLOBs createHistoryFromChat(Long userId, CandidateWithBLOBs candidate, ChatMessageRequest request) {
        CandidateHistoryWithBLOBs history = new CandidateHistoryWithBLOBs();
        history.setUserId(userId);
        history.setCandidateId(candidate.getId());
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
            log.error("Failed to parse timestamp as Instant: {}", timestamp, e);
            try {
                return new Date(Long.parseLong(timestamp));
            } catch (Exception e2) {
                log.error("Failed to parse timestamp as Long: {}", timestamp, e2);
                return null;
            }
        }
    }
}
