package com.scrm.dao.sub;

import com.scrm.dao.EmailVerificationMapper;
import com.scrm.entity.EmailVerification;
import org.apache.ibatis.annotations.Param;

public interface SubEmailVerificationMapper extends EmailVerificationMapper {

    EmailVerification selectLatestByEmail(@Param("email") String email);

    int updateStatusByEmail(@Param("email") String email, @Param("status") String status);

    int deleteByEmail(@Param("email") String email);
}
