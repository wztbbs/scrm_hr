package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.service.HistoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/history")
public class HistoryController {

    @Autowired
    private HistoryService historyService;

    @PostMapping
    public ApiResponse<CandidateHistoryWithBLOBs> create(@RequestBody CandidateHistoryWithBLOBs history) {
        return ApiResponse.success(historyService.createHistory(history));
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(required = false) Long candidate_id,
            @RequestParam(required = false) String local_candidate_id,
            @RequestParam(required = false) String history_type,
            @RequestParam(required = false) String actor_type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) Date date_from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) Date date_to,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "false") Boolean include_deleted,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int page_size,
            @RequestParam(defaultValue = "history_time") String sort_by,
            @RequestParam(defaultValue = "desc") String sort_order) {
        if (page_size > 100) page_size = 100;
        List<CandidateHistoryWithBLOBs> allItems = historyService.listHistory(
                candidate_id, local_candidate_id, history_type, actor_type,
                date_from, date_to, keyword, include_deleted,
                sort_by, sort_order, page, page_size);
        long total = historyService.countHistory(
                candidate_id, local_candidate_id, history_type, actor_type,
                date_from, date_to, keyword, include_deleted);

        // in-memory pagination
        int fromIndex = (page - 1) * page_size;
        int toIndex = Math.min(fromIndex + page_size, allItems.size());
        List<CandidateHistoryWithBLOBs> items = fromIndex < allItems.size() ? allItems.subList(fromIndex, toIndex) : List.of();

        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        ApiResponse.Pagination pagination = new ApiResponse.Pagination();
        pagination.setPage(page);
        pagination.setPageSize(page_size);
        pagination.setTotal(total);
        pagination.setTotalPages((int) Math.ceil((double) total / page_size));
        return ApiResponse.success(data, pagination);
    }
}
