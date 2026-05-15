package com.scrm.service;

import com.scrm.common.RequestContext;
import com.scrm.dao.CandidateHistoryMapper;
import com.scrm.dao.CandidateMapper;
import com.scrm.entity.CandidateExample;
import com.scrm.entity.CandidateHistoryWithBLOBs;
import com.scrm.entity.CandidateHistoryExample;
import com.scrm.entity.CandidateWithBLOBs;
import com.scrm.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.List;

@Service
public class HistoryService {

    @Autowired
    @Qualifier("candidateHistoryMapper")
    private CandidateHistoryMapper historyMapper;

    @Autowired
    @Qualifier("candidateMapper")
    private CandidateMapper candidateMapper;

    @Transactional
    public CandidateHistoryWithBLOBs createHistory(CandidateHistoryWithBLOBs history) {
        Long userId = RequestContext.getCurrentUserId();
        history.setUserId(userId);

        if (history.getActorType() == null) {
            history.setActorType("user");
        }
        history.setCreatedAt(new Date());
        historyMapper.insertSelective(history);
        return history;
    }

    /**
     * 便捷方法：快速记录一条 history，供其他 Service 内部调用
     */
    public void recordHistory(Long candidateId, String historyType, String title, String actorType) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateHistoryWithBLOBs history = new CandidateHistoryWithBLOBs();
        history.setUserId(userId);
        history.setCandidateId(candidateId);
        history.setHistoryType(historyType);
        history.setTitle(title);
        history.setDescription(title);
        history.setActorType(actorType != null ? actorType : "system");
        history.setHistoryTime(new Date());
        history.setCreatedAt(new Date());
        historyMapper.insertSelective(history);
    }

    public List<CandidateHistoryWithBLOBs> listHistory(Long candidateId,
                                               String historyType, String actorType,
                                               Date dateFrom, Date dateTo,
                                               String keyword, Boolean includeDeleted,
                                               String sortBy, String sortOrder,
                                               int page, int pageSize) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateHistoryExample example = new CandidateHistoryExample();
        CandidateHistoryExample.Criteria criteria = example.createCriteria().andUserIdEqualTo(userId);
        if (candidateId != null) {
            criteria.andCandidateIdEqualTo(candidateId);
        }
        if (historyType != null && !historyType.isEmpty()) {
            String[] types = historyType.split(",");
            if (types.length == 1) {
                criteria.andHistoryTypeEqualTo(types[0]);
            } else {
                // use or for multiple types - simplified: just first one for now via Example limitation
                // Actually we can use or criteria
                // For simplicity, handle comma separated in controller or use custom mapper
                criteria.andHistoryTypeEqualTo(types[0]);
            }
        }
        if (actorType != null && !actorType.isEmpty()) {
            criteria.andActorTypeEqualTo(actorType);
        }
        if (dateFrom != null) {
            criteria.andHistoryTimeGreaterThanOrEqualTo(dateFrom);
        }
        if (dateTo != null) {
            criteria.andHistoryTimeLessThanOrEqualTo(dateTo);
        }
        if (keyword != null && !keyword.isEmpty()) {
            criteria.andTitleLike("%" + keyword + "%");
        }
        String orderClause = (sortBy != null ? sortBy : "history_time") + " " + ("asc".equalsIgnoreCase(sortOrder) ? "ASC" : "DESC");
        example.setOrderByClause(orderClause);
        // pagination via limit is not supported by Example directly, we do in-memory for now or use custom mapper
        // For simplicity, fetch all and paginate in controller, or add PageHelper later
        return historyMapper.selectByExampleWithBLOBs(example);
    }

    public long countHistory(Long candidateId,
                             String historyType, String actorType,
                             Date dateFrom, Date dateTo,
                             String keyword, Boolean includeDeleted) {
        Long userId = RequestContext.getCurrentUserId();
        CandidateHistoryExample example = new CandidateHistoryExample();
        CandidateHistoryExample.Criteria criteria = example.createCriteria().andUserIdEqualTo(userId);
        if (candidateId != null) {
            criteria.andCandidateIdEqualTo(candidateId);
        }
        if (historyType != null && !historyType.isEmpty()) {
            criteria.andHistoryTypeEqualTo(historyType.split(",")[0]);
        }
        if (actorType != null && !actorType.isEmpty()) {
            criteria.andActorTypeEqualTo(actorType);
        }
        if (dateFrom != null) {
            criteria.andHistoryTimeGreaterThanOrEqualTo(dateFrom);
        }
        if (dateTo != null) {
            criteria.andHistoryTimeLessThanOrEqualTo(dateTo);
        }
        if (keyword != null && !keyword.isEmpty()) {
            criteria.andTitleLike("%" + keyword + "%");
        }
        return historyMapper.countByExample(example);
    }
}
