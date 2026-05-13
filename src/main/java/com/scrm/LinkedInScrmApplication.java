package com.scrm;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.scrm.dao")
public class LinkedInScrmApplication {

    public static void main(String[] args) {
        SpringApplication.run(LinkedInScrmApplication.class, args);
    }

}
