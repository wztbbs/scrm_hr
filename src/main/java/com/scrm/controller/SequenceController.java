package com.scrm.controller;

import com.scrm.common.ApiResponse;
import com.scrm.dto.SequenceRequest;
import com.scrm.entity.Sequence;
import com.scrm.entity.SequenceStep;
import com.scrm.dao.SequenceStepMapper;
import com.scrm.entity.SequenceStepExample;
import com.scrm.service.SequenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SequenceController {

    @Autowired
    private SequenceService sequenceService;

    @Autowired
    private SequenceStepMapper sequenceStepMapper;

    @GetMapping("/sequences")
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(required = false) Boolean is_active,
            @RequestParam(required = false) Boolean is_template,
            @RequestParam(required = false) String search) {
        List<Sequence> items = sequenceService.listSequences(is_active, is_template, search);

        // Batch fetch steps for all sequences
        List<Long> sequenceIds = items.stream().map(Sequence::getId).collect(java.util.stream.Collectors.toList());
        Map<Long, List<SequenceStep>> stepsMap = new HashMap<>();
        if (!sequenceIds.isEmpty()) {
            com.scrm.entity.SequenceStepExample example = new com.scrm.entity.SequenceStepExample();
            example.createCriteria().andSequenceIdIn(sequenceIds);
            example.setOrderByClause("step_number ASC");
            List<SequenceStep> allSteps = sequenceStepMapper.selectByExample(example);
            for (SequenceStep step : allSteps) {
                stepsMap.computeIfAbsent(step.getSequenceId(), k -> new java.util.ArrayList<>()).add(step);
            }
        }

        List<Map<String, Object>> enrichedItems = new java.util.ArrayList<>();
        for (Sequence seq : items) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", seq.getId());
            map.put("name", seq.getName());
            map.put("description", seq.getDescription());
            map.put("jobTitle", seq.getJobTitle());
            map.put("jobFunction", seq.getJobFunction());
            map.put("isActive", seq.getIsActive());
            map.put("isTemplate", seq.getIsTemplate());
            map.put("stepCount", seq.getStepCount());
            map.put("steps", stepsMap.getOrDefault(seq.getId(), java.util.Collections.emptyList()));
            map.put("createdAt", seq.getCreatedAt());
            map.put("updatedAt", seq.getUpdatedAt());
            enrichedItems.add(map);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("items", enrichedItems);
        return ApiResponse.success(data);
    }

    @GetMapping("/sequences/{id}")
    public ApiResponse<Map<String, Object>> get(@PathVariable String id) {
        Sequence seq = sequenceService.getSequence(id);
        List<SequenceStep> steps = sequenceService.getSequenceSteps(seq.getId());
        Map<String, Object> data = new HashMap<>();
        data.put("id", seq.getId());
        data.put("name", seq.getName());
        data.put("description", seq.getDescription());
        data.put("jobTitle", seq.getJobTitle());
        data.put("jobFunction", seq.getJobFunction());
        data.put("isActive", seq.getIsActive());
        data.put("stepCount", seq.getStepCount());
        data.put("isTemplate", seq.getIsTemplate());
        data.put("steps", steps);
        data.put("createdAt", seq.getCreatedAt());
        return ApiResponse.success(data);
    }

    @PostMapping("/sequences")
    public ApiResponse<Sequence> create(@RequestBody SequenceRequest body) {
        Sequence seq = new Sequence();
        // localId not mapped in current entity
        seq.setName(body.getName());
        seq.setDescription(body.getDescription());
        seq.setJobTitle(body.getJobTitle());
        seq.setJobFunction(body.getJobFunction());
        return ApiResponse.success(sequenceService.createSequence(seq, body.getSteps()));
    }

    @PutMapping("/sequences/{id}")
    public ApiResponse<Sequence> update(@PathVariable String id, @RequestBody SequenceRequest body) {
        Sequence seq = new Sequence();
        seq.setName(body.getName());
        seq.setDescription(body.getDescription());
        seq.setJobTitle(body.getJobTitle());
        seq.setJobFunction(body.getJobFunction());
        return ApiResponse.success(sequenceService.updateSequence(id, seq, body.getSteps()));
    }

    @DeleteMapping("/sequences/{id}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id) {
        sequenceService.deleteSequence(id);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        return ApiResponse.success(result);
    }

    @PostMapping("/candidate-sequences/{id}/advance")
    public ApiResponse<Map<String, Object>> advanceCandidateSequence(@PathVariable String id) {
        Map<String, Object> result = sequenceService.advanceSequenceStep(Long.parseLong(id));
        return ApiResponse.success(result);
    }
}
