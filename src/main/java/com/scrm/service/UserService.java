package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.UserMapper;
import com.scrm.entity.User;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private UserMapper userMapper;

    public User getCurrentUser() {
        Long userId = RequestContext.getCurrentUserId();
        User user = userMapper.selectByPrimaryKey(userId);
        if (user == null) {
            throw new BusinessException("User not found");
        }
        return user;
    }
}
