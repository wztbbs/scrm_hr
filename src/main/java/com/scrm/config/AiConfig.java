package com.scrm.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {

    @Bean
    public ChatClient chatClient(OpenAiChatModel chatModel) {
        return ChatClient.builder(chatModel)
                .defaultSystem("You are an expert recruiting assistant.")
                .build();
    }

    /**
     * OpenRouter 要求传 HTTP-Referer 和 X-Title
     */
    @Bean
    public RestClientCustomizer restClientCustomizer(
            @Value("${openrouter.site-url}") String siteUrl,
            @Value("${openrouter.app-name}") String appName) {
        return restClient -> restClient
                .defaultHeader("HTTP-Referer", siteUrl)
                .defaultHeader("X-Title", appName);
    }
}
