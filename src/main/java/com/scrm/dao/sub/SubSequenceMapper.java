package com.scrm.dao.sub;

import com.scrm.dao.SequenceMapper;
import com.scrm.entity.Sequence;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubSequenceMapper extends SequenceMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<Sequence> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);
}
