package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.SyncRecordMapper;
import com.scrm.dao.sub.*;
import com.scrm.entity.*;
import com.scrm.entity.SyncRecordWithBLOBs;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class SyncService {

    @Autowired
    private SyncRecordMapper syncRecordMapper;
    @Autowired
    private SubCandidateMapper subCandidateMapper;
    @Autowired
    private SubCandidateNoteMapper subCandidateNoteMapper;
    @Autowired
    private SubCandidateHistoryMapper subCandidateHistoryMapper;
    @Autowired
    private SubSequenceMapper subSequenceMapper;
    @Autowired
    private SubSequenceStepMapper subSequenceStepMapper;
    @Autowired
    private SubCandidateSequenceMapper subCandidateSequenceMapper;

    @Transactional
    public Map<String, Object> sync(Map<String, Object> request) {
        Long userId = RequestContext.getCurrentUserId();
        String deviceId = (String) request.get("device_id");

        SyncRecordWithBLOBs record = new SyncRecordWithBLOBs();
        record.setUserId(userId);
        record.setDeviceId(deviceId);
        record.setStatus("completed");
        record.setStartedAt(new Date());
        record.setCompletedAt(new Date());
        record.setClientTimestamp(new Date());
        record.setServerTimestamp(new Date());
        record.setNextSyncToken(UUID.randomUUID().toString());
        syncRecordMapper.insert(record);

        Map<String, Object> result = new HashMap<>();
        result.put("sync_record_id", record.getId());
        result.put("sync_token", record.getNextSyncToken());
        result.put("server_timestamp", new Date());
        result.put("results", new HashMap<>());
        result.put("server_changes", new HashMap<>());
        result.put("has_more", false);
        return result;
    }

    public Map<String, Object> checkUpdates(long since) {
        Long userId = RequestContext.getCurrentUserId();
        Date sinceDate = new Date(since);

        boolean hasUpdates = subCandidateMapper.countUpdatedSince(sinceDate, userId) > 0
                || subCandidateNoteMapper.countUpdatedSince(sinceDate, userId) > 0
                || subCandidateHistoryMapper.countUpdatedSince(sinceDate, userId) > 0
                || subSequenceMapper.countUpdatedSince(sinceDate, userId) > 0
                || subSequenceStepMapper.countUpdatedSince(sinceDate, userId) > 0
                || subCandidateSequenceMapper.countUpdatedSince(sinceDate, userId) > 0;

        Map<String, Object> result = new HashMap<>();
        result.put("has_updates", hasUpdates);
        result.put("server_time", System.currentTimeMillis());
        return result;
    }

    public Map<String, Object> pullChanges(long since) {
        Long userId = RequestContext.getCurrentUserId();
        Date sinceDate = new Date(since);

        List<CandidateWithBLOBs> candidates = subCandidateMapper.selectUpdatedSince(sinceDate, userId);
        List<CandidateNote> notes = subCandidateNoteMapper.selectUpdatedSince(sinceDate, userId);
        List<CandidateHistoryWithBLOBs> history = subCandidateHistoryMapper.selectUpdatedSince(sinceDate, userId);
        List<Sequence> sequences = subSequenceMapper.selectUpdatedSince(sinceDate, userId);
        List<SequenceStep> sequenceSteps = subSequenceStepMapper.selectUpdatedSince(sinceDate, userId);
        List<CandidateSequence> candidateSequences = subCandidateSequenceMapper.selectUpdatedSince(sinceDate, userId);

        Map<String, Object> result = new HashMap<>();
        result.put("candidates", candidates);
        result.put("notes", notes);
        result.put("history", history);
        result.put("sequences", sequences);
        result.put("sequence_steps", sequenceSteps);
        result.put("candidate_sequences", candidateSequences);
        result.put("deleted_ids", new HashMap<>());
        result.put("server_time", System.currentTimeMillis());
        return result;
    }
}
