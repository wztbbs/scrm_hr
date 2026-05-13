package com.scrm.dao;

import com.scrm.entity.Candidate;
import org.apache.ibatis.annotations.Param;

import java.util.Date;
import java.util.List;

public interface CandidateExtMapper {
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
}
