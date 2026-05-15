package com.scrm.dao.sub;

import com.scrm.dao.UserMapper;
import com.scrm.entity.User;

public interface SubUserMapper extends UserMapper {

    int updateAiUsage(User row);
}
