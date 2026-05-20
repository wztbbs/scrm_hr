package com.scrm.dao;

import com.scrm.entity.EmailVerification;

public interface EmailVerificationMapper {
    int deleteByPrimaryKey(Long id);

    int insert(EmailVerification row);

    int insertSelective(EmailVerification row);

    EmailVerification selectByPrimaryKey(Long id);

    int updateByPrimaryKeySelective(EmailVerification row);

    int updateByPrimaryKey(EmailVerification row);
}
