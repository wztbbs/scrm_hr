package com.scrm.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 数据源配置，启动时打印数据库连接信息，方便排查连接问题
 */
@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Bean
    public CommandLineRunner logDataSourceInfo(
            @Value("${spring.datasource.url:unknown}") String url,
            @Value("${spring.datasource.username:unknown}") String username) {
        return args -> {
            log.info("============================================================");
            log.info("Database connection info:");
            log.info("  URL      : {}", url);
            log.info("  Username : {}", username);
            log.info("============================================================");
        };
    }
}
