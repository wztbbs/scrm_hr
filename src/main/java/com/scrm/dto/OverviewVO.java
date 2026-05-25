package com.scrm.dto;

import com.scrm.entity.Candidate;
import com.scrm.entity.CandidateWithBLOBs;

import java.util.List;
import java.util.Map;

public class OverviewVO {

    private Map<String, Object> user;
    private Map<String, Object> subscription;
    private List<Candidate> todayTasks;
    private List<Map<String, Object>> pipelineStages;
    private CandidateWithBLOBs candidate;

    public Map<String, Object> getUser() {
        return user;
    }

    public void setUser(Map<String, Object> user) {
        this.user = user;
    }

    public Map<String, Object> getSubscription() {
        return subscription;
    }

    public void setSubscription(Map<String, Object> subscription) {
        this.subscription = subscription;
    }

    public List<Candidate> getTodayTasks() {
        return todayTasks;
    }

    public void setTodayTasks(List<Candidate> todayTasks) {
        this.todayTasks = todayTasks;
    }

    public List<Map<String, Object>> getPipelineStages() {
        return pipelineStages;
    }

    public void setPipelineStages(List<Map<String, Object>> pipelineStages) {
        this.pipelineStages = pipelineStages;
    }

    public CandidateWithBLOBs getCandidate() {
        return candidate;
    }

    public void setCandidate(CandidateWithBLOBs candidate) {
        this.candidate = candidate;
    }
}
