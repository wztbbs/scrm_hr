package com.scrm.dao.sub;

import com.scrm.dao.CandidateNoteMapper;
import com.scrm.entity.CandidateNote;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface SubCandidateNoteMapper extends CandidateNoteMapper {

    long countUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);

    List<CandidateNote> selectUpdatedSince(@Param("since") Date since, @Param("userId") Long userId);
}
