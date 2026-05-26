package com.scrm.dao.sub;

import com.scrm.dao.CandidateMapper;
import com.scrm.entity.Candidate;
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

    int updatePipelineStage(@Param("id") Long id,
                            @Param("pipelineStage") String pipelineStage);

    List<Candidate> searchByKeyword(@Param("userId") Long userId,
                                    @Param("search") String search,
                                    @Param("temperature") String temperature,
                                    @Param("status") String status,
                                    @Param("source") String source,
                                    @Param("syncSince") Date syncSince,
                                    @Param("sortBy") String sortBy,
                                    @Param("sortOrder") String sortOrder,
                                    @Param("offset") int offset,
                                    @Param("pageSize") int pageSize);

    long countSearchByKeyword(@Param("userId") Long userId,
                              @Param("search") String search,
                              @Param("temperature") String temperature,
                              @Param("status") String status,
                              @Param("source") String source,
                              @Param("syncSince") Date syncSince);

    List<Candidate> selectTodayTasks(@Param("userId") Long userId, @Param("threshold") Date threshold);

    long countOverdueTasks(@Param("userId") Long userId);
}
