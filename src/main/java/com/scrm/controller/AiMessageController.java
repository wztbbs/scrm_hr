package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.dto.AiMessageRequest;
import com.scrm.dto.AiMessageResponse;
import com.scrm.service.AiMessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class AiMessageController {

    @Autowired
    private AiMessageService aiMessageService;

    @PostMapping("/candidates/{id}/ai-messages")
    public ApiResponse<AiMessageResponse> generateAiMessages(@PathVariable String id,
                                                              @RequestBody AiMessageRequest request) {
        try {
            request.setCandidateId(Long.parseLong(id));
        } catch (NumberFormatException e) {
            return ApiResponse.error(4001, "Please open the candidate's profile page and use this feature.");
        }
        return ApiResponse.success(aiMessageService.generateMessages(request));
    }
}
