package com.scrm.service;

import com.scrm.dto.FeedbackRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class FeedbackService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    @Value("${feedback.to-email}")
    private String toEmail;

    public void sendFeedback(FeedbackRequest request) {
        SimpleMailMessage message = new SimpleMailMessage();
        if (request.getEmail() != null && !request.getEmail().isEmpty()) {
            message.setFrom(request.getEmail());
        } else {
            message.setFrom(fromEmail);
        }
        message.setTo(toEmail);
        message.setSubject("LinkedIn SCRM Feedback");

        StringBuilder sb = new StringBuilder();
        sb.append("New feedback received:\n\n");
        sb.append("Content:\n").append(request.getContent()).append("\n\n");
        if (request.getEmail() != null && !request.getEmail().isEmpty()) {
            sb.append("From: ").append(request.getEmail()).append("\n");
        }
        if (request.getPageUrl() != null && !request.getPageUrl().isEmpty()) {
            sb.append("Page URL: ").append(request.getPageUrl()).append("\n");
        }
        if (request.getPluginVersion() != null && !request.getPluginVersion().isEmpty()) {
            sb.append("Plugin Version: ").append(request.getPluginVersion()).append("\n");
        }

        message.setText(sb.toString());
        mailSender.send(message);
    }
}
