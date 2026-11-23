package com.scrm.common;

/**
 * Pro Beta 赠送相关的常量。
 * 后续如果要关闭赠送，只需把 {@link #ENABLED_DEFAULT} 改成 false 重新部署即可。
 */
public final class ProBetaConstants {

    private ProBetaConstants() {
    }

    /** Pro Beta 套餐编码 */
    public static final String PLAN_CODE = "pro_beta";

    /** 赠送时长（天） */
    public static final int GIFT_DURATION_DAYS = 30;

    /** 赠送订阅的 payment_provider 标记 */
    public static final String PAYMENT_PROVIDER = "manual";

    /** 功能开关默认值：true=开启赠送，false=关闭赠送 */
    public static final boolean ENABLED_DEFAULT = true;
}
