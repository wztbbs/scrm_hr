package com.scrm.common;

import com.scrm.dao.UserMapper;
import com.scrm.entity.User;
import com.scrm.entity.UserExample;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.annotation.PostConstruct;
import java.util.Date;
import java.util.List;

@Component
public class RequestContext {

    private static UserMapper staticUserMapper;

    @Autowired
    private UserMapper userMapper;

    @PostConstruct
    public void init() {
        staticUserMapper = userMapper;
    }

    public static Long getCurrentUserId() {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) return 1L;
        HttpServletRequest request = attrs.getRequest();
        String userIdHeader = request.getHeader("X-User-Id");
        if (userIdHeader == null || userIdHeader.isEmpty()) {
            return 1L;
        }

        // Try parse as Long first
        try {
            return Long.parseLong(userIdHeader);
        } catch (NumberFormatException e) {
            // Treat as UUID
        }

        // Lookup user by UUID, auto-create if not exists
        if (staticUserMapper != null) {
            UserExample example = new UserExample();
            example.createCriteria().andUuidEqualTo(userIdHeader);
            List<User> users = staticUserMapper.selectByExample(example);
            if (!users.isEmpty()) {
                return users.get(0).getId();
            }
            // Auto-create user for this UUID
            User newUser = new User();
            newUser.setUuid(userIdHeader);
            newUser.setEmail("anonymous_" + userIdHeader.substring(0, 8) + "@local");
            newUser.setTimezone("UTC");
            newUser.setLocale("en-US");
            newUser.setIsActive(true);
            newUser.setDailyAiUsed(0);
            newUser.setCreatedAt(new Date());
            newUser.setUpdatedAt(new Date());
            staticUserMapper.insert(newUser);
            // Re-fetch to get auto-generated id (insert does not populate id)
            UserExample refetch = new UserExample();
            refetch.createCriteria().andUuidEqualTo(userIdHeader);
            List<User> inserted = staticUserMapper.selectByExample(refetch);
            return !inserted.isEmpty() ? inserted.get(0).getId() : 1L;
        }

        return 1L;
    }
}
