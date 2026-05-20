package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.sub.SubEmailVerificationMapper;
import com.scrm.entity.EmailVerification;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

import jakarta.mail.internet.MimeMessage;
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

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private SubEmailVerificationMapper emailVerificationMapper;

    @Value("${feedback.to-email}")
    private String fromEmail;

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

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("Your RecruitFlow Verification Code");

            String textBody = "Your verification code is: " + code + ". Expires in " + EXPIRE_MINUTES + " minutes.";
            helper.setText(textBody, htmlBody);

            mailSender.send(message);
        } catch (Exception e) {
            throw new BusinessException("Failed to send email: " + e.getMessage());
        }
    }
}
