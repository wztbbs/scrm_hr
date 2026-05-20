package com.scrm.dao.sub;

import com.scrm.dao.SubscriptionMapper;
import com.scrm.entity.Subscription;
import org.apache.ibatis.annotations.Param;

public interface SubSubscriptionMapper extends SubscriptionMapper {

    Subscription selectByPaddleSubscriptionId(@Param("paddleSubscriptionId") String paddleSubscriptionId);

    Subscription selectActiveByUserId(@Param("userId") Long userId);

    Subscription selectValidActiveByUserId(@Param("userId") Long userId);
}
