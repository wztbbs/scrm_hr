package com.scrm.dao.sub;

import com.scrm.dao.UserMapper;
import com.scrm.entity.User;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface SubUserMapper extends UserMapper {

    int updateAiUsage(User row);

    User selectByEmail(@Param("email") String email);

    User selectByUuid(@Param("uuid") String uuid);

    int mergeToUser(@Param("id") Long id, @Param("targetUserId") Long targetUserId);
}
