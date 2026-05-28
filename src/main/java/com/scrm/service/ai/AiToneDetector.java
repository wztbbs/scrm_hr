package com.scrm.service.ai;

import java.util.List;

/**
 * 本地规则检测器：快速判断消息是否存在 AI 腔
 * 纯字符串匹配，耗时 <1ms，用于避免不必要的 LLM Review
 */
public class AiToneDetector {

    // 高危 AI 腔特征（出现任意一条即触发 Review）
    private static final List<String> HIGH_RISK_PATTERNS = List.of(
            "i hope this message finds you well",
            "i came across your profile",
            "delve",
            "leverage",
            "synergy",
            "passionate about",
            "game-changer",
            "revolutionary",
            "excited to connect",
            "dear hiring manager",
            "i am writing to",
            "keen interest",
            "cutting-edge",
            "groundbreaking",
            "state-of-the-art",
            "best-in-class",
            "world-class"
    );

    // 中度风险特征（出现 2 条以上触发 Review）
    private static final List<String> MID_RISK_PATTERNS = List.of(
            "best regards",
            "sincerely",
            "look forward to hearing from you",
            "i would love to",
            "amazing opportunity",
            "perfect fit",
            "ideal candidate",
            "i hope you're doing well",
            "i wanted to reach out",
            "reach out",
            "i noticed",
            "i saw"
    );

    /**
     * 判断消息是否需要 Review
     * @param message 待检测的消息文本
     * @return true = 存在 AI 腔，需要 Review；false = 质量可接受，直接用
     */
    public static boolean needsReview(String message) {
        if (message == null || message.isBlank()) {
            return true;
        }

        String lower = message.toLowerCase();

        // 高危：出现任意一条 → 必须 Review
        for (String pattern : HIGH_RISK_PATTERNS) {
            if (lower.contains(pattern)) {
                return true;
            }
        }

        // 中度：出现 2 条以上 → Review
        int midCount = 0;
        for (String pattern : MID_RISK_PATTERNS) {
            if (lower.contains(pattern)) {
                midCount++;
            }
        }

        return midCount >= 2;
    }
}
