package com.scrm.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
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

    // 原 OpenRouter 需要注入 HTTP-Referer / X-Title header，
    // 阿里云百炼兼容模式不需要，已移除。
    // 如果后续切回 OpenRouter，请恢复此 Bean。
    //
    // @Bean
    // public RestClientCustomizer restClientCustomizer(
    //         @Value("${openrouter.site-url}") String siteUrl,
    //         @Value("${openrouter.app-name}") String appName) {
    //     return restClient -> restClient
    //             .defaultHeader("HTTP-Referer", siteUrl)
    //             .defaultHeader("X-Title", appName);
    // }
}
