package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.service.SyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

    @Autowired
    private SyncService syncService;

    @PostMapping
    public ApiResponse<Map<String, Object>> sync(@RequestBody Map<String, Object> body) {
        return ApiResponse.success(syncService.sync(body));
    }

    @GetMapping("/check")
    public ApiResponse<Map<String, Object>> check(@RequestParam long since) {
        return ApiResponse.success(syncService.checkUpdates(since));
    }

    @GetMapping("/pull")
    public ApiResponse<Map<String, Object>> pull(@RequestParam long since) {
        return ApiResponse.success(syncService.pullChanges(since));
    }
}
