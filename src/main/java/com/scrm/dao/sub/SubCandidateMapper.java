package com.scrm.dao.sub;

import com.scrm.dao.CandidateMapper;
import com.scrm.entity.CandidateWithBLOBs;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubCandidateMapper extends CandidateMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<CandidateWithBLOBs> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    int updateNextFollowup(@Param("id") Long id,
                           @Param("nextFollowupAt") Date nextFollowupAt,
                           @Param("nextFollowupSource") String nextFollowupSource,
                           @Param("nextFollowupSequenceStepId") Long nextFollowupSequenceStepId);
}
