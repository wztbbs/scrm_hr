package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.dto.OverviewVO;
import com.scrm.service.OverviewService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/overview")
public class OverviewController {

    @Autowired
    private OverviewService overviewService;

    @GetMapping
    public ApiResponse<OverviewVO> getOverview(@RequestParam(required = false) String linkedin_id) {
        OverviewVO vo = overviewService.buildOverview(linkedin_id);
        return ApiResponse.success(vo);
    }
}
