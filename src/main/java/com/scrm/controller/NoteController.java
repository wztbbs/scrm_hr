package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.entity.CandidateNote;
import com.scrm.service.NoteService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class NoteController {

    @Autowired
    private NoteService noteService;

    @GetMapping("/candidates/{candidateId}/notes")
    public ApiResponse<Map<String, Object>> list(@PathVariable String candidateId) {
        List<CandidateNote> items = noteService.listNotes(candidateId);
        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        return ApiResponse.success(data);
    }

    @PostMapping("/candidates/{candidateId}/notes")
    public ApiResponse<CandidateNote> create(@PathVariable String candidateId, @RequestBody CandidateNote note) {
        return ApiResponse.success(noteService.createNote(candidateId, note));
    }

    @PutMapping("/notes/{noteId}")
    public ApiResponse<CandidateNote> update(@PathVariable String noteId, @RequestBody CandidateNote note) {
        return ApiResponse.success(noteService.updateNote(noteId, note));
    }

    @DeleteMapping("/notes/{noteId}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String noteId) {
        noteService.deleteNote(noteId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ApiResponse.success(result);
    }
}
