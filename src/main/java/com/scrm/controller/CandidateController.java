package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.entity.Candidate;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.service.CandidateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/candidates")
public class CandidateController {

    @Autowired
    private CandidateService candidateService;

    @GetMapping
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String temperature,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String sort_by,
            @RequestParam(defaultValue = "desc") String sort_order,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Date sync_since) {
        if (pageSize > 100) pageSize = 100;
        List<Candidate> items = candidateService.listCandidates(search, temperature, status, source,
                sort_by, sort_order, sync_since, page, pageSize);
        long total = candidateService.countCandidates(search, temperature, status, source, sync_since);
        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        ApiResponse.Pagination pagination = new ApiResponse.Pagination();
        pagination.setPage(page);
        pagination.setPageSize(pageSize);
        pagination.setTotal(total);
        pagination.setTotalPages((int) Math.ceil((double) total / pageSize));
        return ApiResponse.success(data, pagination);
    }

    @GetMapping("/{id}")
    public ApiResponse<CandidateWithBLOBs> get(@PathVariable String id) {
        return ApiResponse.success(candidateService.getCandidate(id));
    }

    @PostMapping
    public ApiResponse<CandidateWithBLOBs> create(@RequestBody CandidateWithBLOBs candidate) {
        return ApiResponse.success(candidateService.createCandidate(candidate));
    }

    @PutMapping("/{id}")
    public ApiResponse<CandidateWithBLOBs> update(@PathVariable String id, @RequestBody CandidateWithBLOBs candidate) {
        return ApiResponse.success(candidateService.updateCandidate(id, candidate));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id,
                                                     @RequestParam(defaultValue = "false") boolean hard_delete) {
        candidateService.deleteCandidate(id, hard_delete);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("deleted_at", new Date());
        return ApiResponse.success(result);
    }

    @PostMapping("/batch")
    public ApiResponse<Map<String, Object>> batch(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        return ApiResponse.success(candidateService.batchCandidates(items));
    }

    @PutMapping("/{id}/follow-up")
    public ApiResponse<Map<String, Object>> updateFollowup(@PathVariable String id,
                                                            @RequestBody Map<String, Object> body) {
        String source = (String) body.getOrDefault("source", "manual");
        Long sequenceStepId = body.get("sequence_step_id") != null ? ((Number) body.get("sequence_step_id")).longValue() : null;
        Date nextFollowupAt = null;
        if (body.get("next_followup_at") != null) {
            nextFollowupAt = new Date(((Number) body.get("next_followup_at")).longValue());
        }
        candidateService.updateFollowup(id, nextFollowupAt, source, sequenceStepId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ApiResponse.success(result);
    }

    @PostMapping("/{id}/follow-up/done")
    public ApiResponse<Map<String, Object>> markFollowupDone(@PathVariable String id) {
        Map<String, Object> result = candidateService.markFollowupDone(id);
        return ApiResponse.success(result);
    }
}
