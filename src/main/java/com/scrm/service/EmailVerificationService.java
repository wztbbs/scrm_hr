package com.scrm.service;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import com.scrm.common.RequestContext;
import com.scrm.dao.sub.SubEmailVerificationMapper;
import com.scrm.entity.EmailVerification;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Date;
import java.util.Random;
import java.util.regex.Pattern;

@Service
public class EmailVerificationService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$");
    private static final int CODE_LENGTH = 5;
    private static final int EXPIRE_MINUTES = 10;
    private static final String FROM_EMAIL = "support@hrscrm.net";

    @Value("${resend.api-key}")
    private String resendApiKey;

    @Autowired
    private SubEmailVerificationMapper emailVerificationMapper;

    public void sendVerificationCode(String email) {
        if (email == null || email.trim().isEmpty()) {
            throw new BusinessException("Email is required");
        }
        email = email.trim();
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new BusinessException("Invalid email format");
        }

        String code = generateCode();

        // Delete existing record for this email to avoid unique key conflict, then insert new
        emailVerificationMapper.deleteByEmail(email);

        EmailVerification record = new EmailVerification();
        record.setEmail(email);
        record.setUserId(RequestContext.getCurrentUserId());
        record.setCode(code);
        record.setType("email_bind");
        record.setStatus("unused");
        record.setExpiresAt(getExpireTime());
        record.setCreatedAt(new Date());
        emailVerificationMapper.insertSelective(record);

        sendEmail(email, code);
    }

    public EmailVerification verifyCode(String email, String code) {
        if (email == null || email.trim().isEmpty()) {
            throw new BusinessException("Email is required");
        }
        if (code == null || code.trim().isEmpty()) {
            throw new BusinessException("Verification code is required");
        }
        email = email.trim();
        code = code.trim();

        EmailVerification record = emailVerificationMapper.selectLatestByEmail(email);
        if (record == null) {
            throw new BusinessException("Verification code not found, please resend");
        }
        if (!"unused".equals(record.getStatus())) {
            throw new BusinessException("Verification code has already been used or expired");
        }
        if (record.getExpiresAt() != null && record.getExpiresAt().before(new Date())) {
            throw new BusinessException("Verification code has expired, please resend");
        }
        if (!code.equals(record.getCode())) {
            throw new BusinessException("Invalid verification code");
        }
        return record;
    }

    public void markCodeAsUsed(EmailVerification record) {
        record.setStatus("used");
        record.setUsedAt(new Date());
        emailVerificationMapper.updateByPrimaryKeySelective(record);
    }

    private String generateCode() {
        Random random = new Random();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    private Date getExpireTime() {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.MINUTE, EXPIRE_MINUTES);
        return cal.getTime();
    }

    private void sendEmail(String toEmail, String code) {
        try {
            ClassPathResource resource = new ClassPathResource("email_verification_template.html");
            String htmlBody = StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
            htmlBody = htmlBody.replace("{{CODE}}", code);

            String textBody = "Your verification code is: " + code + ". Expires in " + EXPIRE_MINUTES + " minutes.";

            Resend resend = new Resend(resendApiKey);

            CreateEmailOptions params = CreateEmailOptions.builder()
                    .from(FROM_EMAIL)
                    .to(toEmail)
                    .subject("Your RecruitFlow Verification Code")
                    .text(textBody)
                    .html(htmlBody)
                    .build();

            CreateEmailResponse data = resend.emails().send(params);
        } catch (ResendException e) {
            throw new BusinessException("Failed to send email: " + e.getMessage());
        } catch (Exception e) {
            throw new BusinessException("Failed to send email: " + e.getMessage());
        }
    }
}
