package com.scrm.service;

import com.scrm.common.PipelineStageEnum;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PipelineService {

    public Map<String, Object> listStages() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (PipelineStageEnum stage : PipelineStageEnum.getDisplayStages()) {
            Map<String, Object> stageMap = new LinkedHashMap<>();
            stageMap.put("id", stage.getValue());
            stageMap.put("name", stage.getLabel());
            stageMap.put("color", stage.getColor());
            stageMap.put("sort_order", stage.getSortOrder());
            items.add(stageMap);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("items", items);
        return data;
    }
}
