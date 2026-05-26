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

    @GetMapping
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(name = "candidateId", required = false) Long candidateId,
            @RequestParam(name = "historyType", required = false) String historyType,
            @RequestParam(name = "actorType", required = false) String actorType,
            @RequestParam(name = "dateFrom", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) Date dateFrom,
            @RequestParam(name = "dateTo", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) Date dateTo,
            @RequestParam(required = false) String keyword,
            @RequestParam(name = "includeDeleted", required = false, defaultValue = "false") Boolean includeDeleted,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "pageSize", defaultValue = "20") int pageSize,
            @RequestParam(name = "sortBy", defaultValue = "history_time") String sortBy,
            @RequestParam(name = "sortOrder", defaultValue = "desc") String sortOrder) {
        if (pageSize > 100) pageSize = 100;
        List<CandidateHistoryWithBLOBs> allItems = historyService.listHistory(
                candidateId, historyType, actorType,
                dateFrom, dateTo, keyword, includeDeleted,
                sortBy, sortOrder, page, pageSize);
        long total = historyService.countHistory(
                candidateId, historyType, actorType,
                dateFrom, dateTo, keyword, includeDeleted);

        // in-memory pagination
        int fromIndex = (page - 1) * pageSize;
        int toIndex = Math.min(fromIndex + pageSize, allItems.size());
        List<CandidateHistoryWithBLOBs> items = fromIndex < allItems.size() ? allItems.subList(fromIndex, toIndex) : List.of();

        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        ApiResponse.Pagination pagination = new ApiResponse.Pagination();
        pagination.setPage(page);
        pagination.setPageSize(pageSize);
        pagination.setTotal(total);
        pagination.setTotalPages((int) Math.ceil((double) total / pageSize));
        return ApiResponse.success(data, pagination);
    }
}
