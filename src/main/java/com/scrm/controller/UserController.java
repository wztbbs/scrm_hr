package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.entity.User;
import com.scrm.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/user")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping("/me")
    public ApiResponse<User> me() {
        return ApiResponse.success(userService.getCurrentUser());
    }
}
