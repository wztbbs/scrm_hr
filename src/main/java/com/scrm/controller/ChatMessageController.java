package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.dto.ChatMessageRequest;
import com.scrm.service.ChatMessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/chat-messages")
public class ChatMessageController {

    @Autowired
    private ChatMessageService chatMessageService;

    @PostMapping
    public ApiResponse<Map<String, Object>> create(@RequestBody ChatMessageRequest request) {
        Map<String, Object> result = chatMessageService.processChatMessage(request);
        return ApiResponse.success(result);
    }
}
