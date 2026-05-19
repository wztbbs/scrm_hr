package com.scrm.dao.sub;

import com.scrm.dao.OrderMapper;
import com.scrm.entity.Order;
import org.apache.ibatis.annotations.Param;

public interface SubOrderMapper extends OrderMapper {

    Order selectByOrderNo(@Param("orderNo") String orderNo);

    Order selectByPaddleTransactionId(@Param("paddleTransactionId") String paddleTransactionId);

    Order selectByPaddleCheckoutId(@Param("paddleCheckoutId") String paddleCheckoutId);

    int updateStatusPaidById(@Param("id") Long id,
                             @Param("status") String status,
                             @Param("paddleTransactionId") String paddleTransactionId,
                             @Param("paddleSubscriptionId") String paddleSubscriptionId,
                             @Param("paidAt") java.util.Date paidAt);
}
