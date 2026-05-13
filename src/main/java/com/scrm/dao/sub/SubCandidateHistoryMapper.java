package com.scrm.dao.sub;

import com.scrm.dao.CandidateHistoryMapper;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubCandidateHistoryMapper extends CandidateHistoryMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<CandidateHistoryWithBLOBs> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);
}
