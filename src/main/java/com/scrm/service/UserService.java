package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.sub.SubUserMapper;
import com.scrm.entity.User;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private SubUserMapper userMapper;

    public User getCurrentUser() {
        Long userId = RequestContext.getCurrentUserId();
        User user = userMapper.selectByPrimaryKey(userId);
        if (user == null) {
            throw new BusinessException("User not found");
        }
        return user;
    }

    public void updateEmail(String email) {
        Long userId = RequestContext.getCurrentUserId();
        User user = new User();
        user.setId(userId);
        user.setEmail(email);
        userMapper.updateByPrimaryKeySelective(user);
    }

    public User findByEmail(String email) {
        return userMapper.selectByEmail(email);
    }

    public User findByUuid(String uuid) {
        return userMapper.selectByUuid(uuid);
    }

    public void deactivateUser(Long userId) {
        userMapper.deactivateById(userId);
    }

    public void mergeUser(Long fromUserId, Long targetUserId) {
        userMapper.mergeToUser(fromUserId, targetUserId);
    }
}
