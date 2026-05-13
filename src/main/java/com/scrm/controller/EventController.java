package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.service.EventService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {

    @Autowired
    private EventService eventService;

    @PostMapping
    public ApiResponse<Map<String, Object>> track(@RequestBody Map<String, Object> body) {
        String eventName = (String) body.get("event_name");
        String eventData = body.get("event_data") != null ? body.get("event_data").toString() : null;
        String sessionId = (String) body.get("session_id");
        eventService.track(eventName, eventData, sessionId);
        return ApiResponse.success(Map.of("tracked", true));
    }
}
