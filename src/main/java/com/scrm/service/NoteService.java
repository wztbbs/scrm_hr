package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.CandidateMapper;
import com.scrm.dao.CandidateNoteMapper;
import com.scrm.entity.CandidateNote;
import com.scrm.entity.CandidateNoteExample;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.List;

@Service
public class NoteService {

    @Autowired
    @Qualifier("candidateNoteMapper")
    private CandidateNoteMapper noteMapper;
    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;

    private CandidateNote findByIdOrLocalId(Long userId, String id) {
        if (id.startsWith("local:")) {
            String localId = id.substring(6);
            CandidateNoteExample example = new CandidateNoteExample();
            example.createCriteria().andLocalIdEqualTo(localId);
            List<CandidateNote> list = noteMapper.selectByExample(example);
            return list.isEmpty() ? null : list.get(0);
        } else {
            try {
                Long numericId = Long.parseLong(id);
                return noteMapper.selectByPrimaryKey(numericId);
            } catch (NumberFormatException e) {
                CandidateNoteExample example = new CandidateNoteExample();
                example.createCriteria().andLocalIdEqualTo(id);
                List<CandidateNote> list = noteMapper.selectByExample(example);
                return list.isEmpty() ? null : list.get(0);
            }
        }
    }

    private CandidateWithBLOBs findCandidate(Long userId, String id) {
        if (id.startsWith("local:")) {
            String localId = id.substring(6);
            var example = new com.scrm.entity.CandidateExample();
            example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(localId);
            var list = candidateMapper.selectByExample(example);
            return list.isEmpty() ? null : (CandidateWithBLOBs) list.get(0);
        } else {
            try {
                Long numericId = Long.parseLong(id);
                return candidateMapper.selectByPrimaryKey(numericId);
            } catch (NumberFormatException e) {
                var example = new com.scrm.entity.CandidateExample();
                example.createCriteria().andUserIdEqualTo(userId).andLocalIdEqualTo(id);
                var list = candidateMapper.selectByExample(example);
                return list.isEmpty() ? null : (CandidateWithBLOBs) list.get(0);
            }
        }
    }

    public List<CandidateNote> listNotes(String candidateId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = findCandidate(userId, candidateId);
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
        CandidateNoteExample example = new CandidateNoteExample();
        example.createCriteria().andCandidateIdEqualTo(candidate.getId());
        return noteMapper.selectByExample(example);
    }

    @Transactional
    public CandidateNote createNote(String candidateId, CandidateNote note) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = findCandidate(userId, candidateId);
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
        note.setCandidateId(candidate.getId());
        note.setUserId(userId);
        note.setCreatedAt(new Date());
        note.setUpdatedAt(new Date());
        noteMapper.insertSelective(note);
        return note;
    }

    @Transactional
    public CandidateNote updateNote(String noteId, CandidateNote note) {
        CandidateNote existing = findByIdOrLocalId(RequestContext.getCurrentUserId(), noteId);
        if (existing == null) {
            throw new BusinessException("Note not found");
        }
        note.setId(existing.getId());
        note.setCandidateId(null);
        note.setUserId(null);
        note.setLocalId(null);
        note.setCreatedAt(null);
        note.setUpdatedAt(new Date());
        noteMapper.updateByPrimaryKeySelective(note);
        return noteMapper.selectByPrimaryKey(existing.getId());
    }

    @Transactional
    public void deleteNote(String noteId) {
        CandidateNote existing = findByIdOrLocalId(RequestContext.getCurrentUserId(), noteId);
        if (existing == null) {
            throw new BusinessException("Note not found");
        }
        noteMapper.deleteByPrimaryKey(existing.getId());
    }
}
