package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.EventMapper;
import com.scrm.entity.Event;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class EventService {

    @Autowired
    private EventMapper eventMapper;

    public void track(String eventName, String eventData, String sessionId) {
        Long userId = RequestContext.getCurrentUserId();
        Event event = new Event();
        event.setUserId(userId);
        event.setEventName(eventName);
        event.setEventData(eventData);
        event.setSessionId(sessionId);
        event.setCreatedAt(new Date());
        eventMapper.insertSelective(event);
    }
}
