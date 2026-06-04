package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.OrderMapper;
import com.scrm.dao.SubscriptionMapper;
import com.scrm.dao.sub.SubUserMapper;
import com.scrm.entity.Order;
import com.scrm.entity.OrderExample;
import com.scrm.entity.Subscription;
import com.scrm.entity.SubscriptionExample;
import com.scrm.entity.User;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private SubUserMapper userMapper;

    @Autowired
    private SubscriptionMapper subscriptionMapper;

    @Autowired
    private OrderMapper orderMapper;

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
        User existing = userMapper.selectByEmail(email);
        if (existing != null && existing.getIsActive() != null && existing.getIsActive()
                && !existing.getId().equals(userId)) {
            throw new BusinessException("Email already in use");
        }
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

    public void mergeUser(Long fromUserId, Long targetUserId) {
        userMapper.mergeToUser(fromUserId, targetUserId);
    }

    public void migrateUserData(Long fromUserId, Long targetUserId) {
        // Migrate subscriptions
        Subscription subscription = new Subscription();
        subscription.setUserId(targetUserId);
        SubscriptionExample subExample = new SubscriptionExample();
        subExample.createCriteria().andUserIdEqualTo(fromUserId);
        subscriptionMapper.updateByExampleSelective(subscription, subExample);

        // Migrate orders
        Order order = new Order();
        order.setUserId(targetUserId);
        OrderExample orderExample = new OrderExample();
        orderExample.createCriteria().andUserIdEqualTo(fromUserId);
        orderMapper.updateByExampleSelective(order, orderExample);
    }
}
