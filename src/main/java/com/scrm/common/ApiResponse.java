package com.scrm.common;

import lombok.Data;

import java.util.UUID;

@Data
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;
    private Pagination pagination;
    private String requestId;

    @Data
    public static class Pagination {
        private int page;
        private int pageSize;
        private long total;
        private int totalPages;
    }

    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(0);
        resp.setMessage("success");
        resp.setData(data);
        resp.setRequestId(UUID.randomUUID().toString().replace("-", ""));
        return resp;
    }

    public static <T> ApiResponse<T> success(T data, Pagination pagination) {
        ApiResponse<T> resp = success(data);
        resp.setPagination(pagination);
        return resp;
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        ApiResponse<T> resp = new ApiResponse<>();
        resp.setCode(code);
        resp.setMessage(message);
        resp.setRequestId(UUID.randomUUID().toString().replace("-", ""));
        return resp;
    }

    public static <T> ApiResponse<T> error(String message) {
        return error(500, message);
    }
}
