package com.scrm.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 全局 CORS 配置 + 静态资源映射
 * 允许 LinkedIn 页面及 Chrome 扩展发起跨域请求
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // API 接口 CORS
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "https://www.linkedin.com",
                        "chrome-extension://*",
                        "null"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);

        // 静态页面 CORS（支持 Chrome Extension 直接打开 index.html、refund.html 等）
        registry.addMapping("/*.html")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "HEAD", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 显式声明 static 目录映射，确保所有静态文件可通过根路径访问
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // /refund 映射到 refund.html，使 index.html 中的链接可正常跳转
        registry.addViewController("/refund").setViewName("forward:/refund.html");
    }
}
