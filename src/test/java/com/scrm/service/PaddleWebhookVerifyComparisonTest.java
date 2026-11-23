package com.scrm.service;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 对比 Paddle 官网 demo（hex 编码）vs 我们当前实现（Base64 编码）
 * 用 Paddle 实际发来的真实请求参数验证
 */
class PaddleWebhookVerifyComparisonTest {

    // ========== 真实请求参数（写死）==========
    private static final String SECRET = "pdl_ntfset_01krz4mfspvv4w3vexnpjxc842_KVJ4J9lF1453Sf+s2psFunM5K3f+amTI";

    private static final String SIGNATURE_HEADER = "ts=1780470238;h1=2fb55fc52b739c887c3bd713fa7fe7ecc5d78c204f772ed304eccc4ded5657e8";

    // 原始 JSON body（必须保持完全一致，包括空格和换行）
    private static final String BODY = "{\n" +
            "  \"data\": {\n" +
            "    \"id\": \"sub_01kt61p48pnqkvdspp5qrbt9kt\",\n" +
            "    \"items\": [\n" +
            "      {\n" +
            "        \"price\": {\n" +
            "          \"id\": \"pri_01krz2gdwbs31jje97e69f1jj5\",\n" +
            "          \"name\": null,\n" +
            "          \"type\": \"standard\",\n" +
            "          \"status\": \"active\",\n" +
            "          \"quantity\": {\n" +
            "            \"maximum\": 999999,\n" +
            "            \"minimum\": 1\n" +
            "          },\n" +
            "          \"tax_mode\": \"location\",\n" +
            "          \"created_at\": \"2026-05-19T02:54:43.595821Z\",\n" +
            "          \"product_id\": \"pro_01krz1pjkbxf6wc91vpmkw1dpc\",\n" +
            "          \"unit_price\": {\n" +
            "            \"amount\": \"2900\",\n" +
            "            \"currency_code\": \"USD\"\n" +
            "          },\n" +
            "          \"updated_at\": \"2026-05-19T02:54:43.595821Z\",\n" +
            "          \"custom_data\": null,\n" +
            "          \"description\": \"Pro Monthly $29\",\n" +
            "          \"import_meta\": null,\n" +
            "          \"trial_period\": null,\n" +
            "          \"billing_cycle\": {\n" +
            "            \"interval\": \"month\",\n" +
            "            \"frequency\": 1\n" +
            "          },\n" +
            "          \"unit_price_overrides\": []\n" +
            "        },\n" +
            "        \"status\": \"active\",\n" +
            "        \"product\": {\n" +
            "          \"id\": \"pro_01krz1pjkbxf6wc91vpmkw1dpc\",\n" +
            "          \"name\": \"RecruitFlow\",\n" +
            "          \"type\": \"standard\",\n" +
            "          \"status\": \"active\",\n" +
            "          \"image_url\": null,\n" +
            "          \"created_at\": \"2026-05-19T02:40:36.459Z\",\n" +
            "          \"updated_at\": \"2026-05-19T02:40:36.459Z\",\n" +
            "          \"custom_data\": null,\n" +
            "          \"description\": null,\n" +
            "          \"tax_category\": \"standard\"\n" +
            "        },\n" +
            "        \"quantity\": 1,\n" +
            "        \"recurring\": true,\n" +
            "        \"created_at\": \"2026-06-03T06:10:44.63Z\",\n" +
            "        \"updated_at\": \"2026-06-03T06:10:44.63Z\",\n" +
            "        \"trial_dates\": null,\n" +
            "        \"next_billed_at\": \"2026-07-03T06:10:43.854714Z\",\n" +
            "        \"previously_billed_at\": \"2026-06-03T06:10:43.854714Z\"\n" +
            "      }\n" +
            "    ],\n" +
            "    \"status\": \"active\",\n" +
            "    \"discount\": null,\n" +
            "    \"paused_at\": null,\n" +
            "    \"address_id\": \"add_01kt61csysyw06r6b11974ksnv\",\n" +
            "    \"created_at\": \"2026-06-03T06:10:44.63Z\",\n" +
            "    \"started_at\": \"2026-06-03T06:10:43.854714Z\",\n" +
            "    \"updated_at\": \"2026-06-03T06:10:44.63Z\",\n" +
            "    \"business_id\": null,\n" +
            "    \"canceled_at\": null,\n" +
            "    \"custom_data\": {\n" +
            "      \"user_id\": 9,\n" +
            "      \"order_id\": 21\n" +
            "    },\n" +
            "    \"customer_id\": \"ctm_01kt61c6734z5f67vkcw97ervz\",\n" +
            "    \"import_meta\": null,\n" +
            "    \"billing_cycle\": {\n" +
            "      \"interval\": \"month\",\n" +
            "      \"frequency\": 1\n" +
            "    },\n" +
            "    \"currency_code\": \"USD\",\n" +
            "    \"next_billed_at\": \"2026-07-03T06:10:43.854714Z\",\n" +
            "    \"transaction_id\": \"txn_01kt61ca1sp5z23qbmxtpq9ez3\",\n" +
            "    \"billing_details\": null,\n" +
            "    \"collection_mode\": \"automatic\",\n" +
            "    \"first_billed_at\": \"2026-06-03T06:10:43.854714Z\",\n" +
            "    \"scheduled_change\": null,\n" +
            "    \"consent_requirements\": [],\n" +
            "    \"current_billing_period\": {\n" +
            "      \"ends_at\": \"2026-07-03T06:10:43.854714Z\",\n" +
            "      \"starts_at\": \"2026-06-03T06:10:43.854714Z\"\n" +
            "    }\n" +
            "  },\n" +
            "  \"event_id\": \"evt_01kt61p4f0fbqz44w4z89anvfv\",\n" +
            "  \"event_type\": \"subscription.created\",\n" +
            "  \"occurred_at\": \"2026-06-03T06:10:44.832436Z\",\n" +
            "  \"notification_id\": \"ntf_01kt64qk732kxtpt09x1zn0hqd\"\n" +
            "}";

    // 解析 header
    private static final String TS = "1780470238";
    private static final String H1 = "2fb55fc52b739c887c3bd713fa7fe7ecc5d78c204f772ed304eccc4ded5657e8";

    // ========== 方法1：Paddle 官网 demo 方式（hex 编码） ==========
    @Test
    void testVerifyWithHexEncoding() throws Exception {
        String signedPayload = TS + ":" + BODY;

        Mac sha256_HMAC = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKey = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        sha256_HMAC.init(secretKey);
        byte[] hash = sha256_HMAC.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));

        // hex 编码
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        String computedHash = hexString.toString();

        System.out.println("[HEX] computed: " + computedHash);
        System.out.println("[HEX] expected: " + H1);
        System.out.println("[HEX] match:    " + computedHash.equals(H1));

        assertEquals(H1, computedHash, "Paddle official demo (hex) should match");
    }

    // ========== 方法2：我们当前实现方式（Base64 编码） ==========
    @Test
    void testVerifyWithBase64Encoding() throws Exception {
        String signedPayload = TS + ":" + BODY;

        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(secretKeySpec);
        byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));

        // Base64 编码（我们当前的实现）
        String computedHash = Base64.getEncoder().encodeToString(hash);

        System.out.println("[B64] computed: " + computedHash);
        System.out.println("[B64] expected: " + H1);
        System.out.println("[B64] match:    " + computedHash.equals(H1));

        // 这个测试会失败，证明 Base64 方式是错的
        assertNotEquals(H1, computedHash, "Our current Base64 implementation should NOT match hex signature");
    }

    // ========== 额外验证：hex 和 Base64 互转 ==========
    @Test
    void testHexVsBase64() throws Exception {
        String signedPayload = TS + ":" + BODY;

        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(secretKeySpec);
        byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));

        String hexHash = bytesToHex(hash);
        String b64Hash = Base64.getEncoder().encodeToString(hash);

        System.out.println("[COMPARE] hex: " + hexHash);
        System.out.println("[COMPARE] b64: " + b64Hash);
        System.out.println("[COMPARE] Paddle h1 is hex: " + H1.equals(hexHash));

        assertEquals(H1, hexHash);
        assertNotEquals(H1, b64Hash);
    }

    // ========== 方法3：尝试 compact JSON（无换行无空格）==========
    @Test
    void testVerifyWithCompactBody() throws Exception {
        // 用 Jackson 把 pretty JSON 转成 compact
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        Object parsed = mapper.readValue(BODY, Object.class);
        String compactBody = mapper.writeValueAsString(parsed);

        String signedPayload = TS + ":" + compactBody;
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(secretKeySpec);
        byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
        String computedHash = bytesToHex(hash);

        System.out.println("[COMPACT] body:   " + compactBody.substring(0, 200) + "...");
        System.out.println("[COMPACT] computed: " + computedHash);
        System.out.println("[COMPACT] expected: " + H1);
        System.out.println("[COMPACT] match:    " + computedHash.equals(H1));

        if (computedHash.equals(H1)) {
            System.out.println("✅ 找到正确格式：compact JSON");
        }

        assertEquals(H1, computedHash, "Compact JSON body should match Paddle signature");
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
