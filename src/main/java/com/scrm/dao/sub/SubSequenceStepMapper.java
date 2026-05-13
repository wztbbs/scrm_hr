package com.scrm.dao.sub;

import com.scrm.dao.SequenceStepMapper;
import com.scrm.entity.SequenceStep;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubSequenceStepMapper extends SequenceStepMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<SequenceStep> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);
}
