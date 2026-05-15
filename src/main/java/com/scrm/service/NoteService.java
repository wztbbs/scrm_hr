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
    @Autowired
    private HistoryService historyService;

    private CandidateNote findNoteById(Long id) {
        return noteMapper.selectByPrimaryKey(id);
    }

    private CandidateWithBLOBs findCandidateById(Long userId, Long id) {
        CandidateWithBLOBs c = candidateMapper.selectByPrimaryKey(id);
        if (c != null && !c.getUserId().equals(userId)) {
            return null;
        }
        return c;
    }

    public List<CandidateNote> listNotes(String candidateId) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateWithBLOBs candidate = findCandidateById(userId, Long.parseLong(candidateId));
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
        CandidateWithBLOBs candidate = findCandidateById(userId, Long.parseLong(candidateId));
        if (candidate == null) {
            throw new BusinessException("Candidate not found");
        }
        note.setCandidateId(candidate.getId());
        note.setUserId(userId);
        note.setCreatedAt(new Date());
        note.setUpdatedAt(new Date());
        noteMapper.insertSelective(note);
        historyService.recordHistory(candidate.getId(), "note_created",
                "Note created: " + (note.getContent() != null ? note.getContent().substring(0, Math.min(100, note.getContent().length())) : ""), "user");
        return note;
    }

    @Transactional
    public CandidateNote updateNote(String noteId, CandidateNote note) {
        CandidateNote existing = findNoteById(Long.parseLong(noteId));
        if (existing == null) {
            throw new BusinessException("Note not found");
        }
        note.setId(existing.getId());
        note.setCandidateId(null);
        note.setUserId(null);
        note.setCreatedAt(null);
        note.setUpdatedAt(new Date());
        noteMapper.updateByPrimaryKeySelective(note);
        historyService.recordHistory(existing.getCandidateId(), "note_updated",
                "Note updated", "user");
        return noteMapper.selectByPrimaryKey(existing.getId());
    }

    @Transactional
    public void deleteNote(String noteId) {
        CandidateNote existing = findNoteById(Long.parseLong(noteId));
        if (existing == null) {
            throw new BusinessException("Note not found");
        }
        noteMapper.deleteByPrimaryKey(existing.getId());
        historyService.recordHistory(existing.getCandidateId(), "note_deleted",
                "Note deleted", "user");
    }
}
