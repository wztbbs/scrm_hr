package com.scrm.dao.sub;

import com.scrm.dao.CandidateSequenceMapper;
import com.scrm.entity.CandidateSequence;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubCandidateSequenceMapper extends CandidateSequenceMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<CandidateSequence> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);
}
