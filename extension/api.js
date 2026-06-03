// api.js - Backend API client for LinkedIn SCRM
// Maps frontend local data models to backend REST APIs

const DEFAULT_API_BASE = 'https://api.hrscrm.net';

let _apiBase = null;

async function getApiBase() {
  if (_apiBase) return _apiBase;
  const stored = await getSetting('apiBase', '');
  _apiBase = stored || DEFAULT_API_BASE;
  return _apiBase;
}

function setApiBase(base) {
  _apiBase = base;
  return setSetting('apiBase', base);
}

// Simple UUID generator for local_id
function generateLocalId() {
  return crypto.randomUUID();
}

// Convert frontend timestamp (ms) to ISO string for backend
function toISOString(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  return new Date(ts).toISOString();
}

// Convert backend ISO string to frontend timestamp (ms)
function toTimestamp(iso) {
  if (!iso) return null;
  if (typeof iso === 'number') return iso;
  return new Date(iso).getTime();
}

async function apiRequest(method, path, body = null, query = null) {
  const perfLabel = `[API_PERF] ${method} ${path}`;
  const start = performance.now();
  console.log(`${perfLabel} START`);

  const t1 = performance.now();
  const base = await getApiBase();
  const t2 = performance.now();
  const userId = await getSetting('userId', '');
  const t3 = performance.now();
  console.log(`${perfLabel} storageReady apiBase=${(t2-t1).toFixed(1)}ms userId=${(t3-t2).toFixed(1)}ms`);

  let url = `${base}${path}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, v);
    }
    const qstr = qs.toString();
    if (qstr) url += (url.includes('?') ? '&' : '?') + qstr;
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-User-Id': userId,
      'X-Client-Time': Date.now()
    }
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const t4 = performance.now();
  try {
    let resp;
    try {
      // Route through background service worker to reuse persistent connections
      const bgResp = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        payload: { url, options }
      });
      if (!bgResp.ok) {
        throw new Error(bgResp.error || 'Background proxy failed');
      }
      resp = {
        status: bgResp.status,
        ok: bgResp.status >= 200 && bgResp.status < 300,
        json: async () => bgResp.json,
        text: async () => bgResp.text
      };
    } catch (bgErr) {
      // Fallback: background unavailable (e.g. service worker killed), fetch directly
      console.warn(`${perfLabel} background proxy failed, fallback to direct fetch:`, bgErr.message);
      resp = await fetch(url, options);
    }

    const t5 = performance.now();
    console.log(`${perfLabel} networkDone fetch=${(t5-t4).toFixed(1)}ms`);
    if (resp.status === 429) {
      const json = await resp.json().catch(() => null);
      const err = new Error(json && json.message ? json.message : 'Rate limit exceeded');
      err.status = 429;
      err.code = json && json.code ? json.code : 429;
      err.data = json && json.data ? json.data : null;
      throw err;
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    const json = await resp.json();
    if (json.code !== 0) {
      const err = new Error(json.message || 'API error');
      err.code = json.code;
      err.data = json.data || null;
      throw err;
    }
    console.log(`${perfLabel} END total=${(performance.now() - start).toFixed(1)}ms`);
    return json;
  } catch (err) {
    console.warn(`${perfLabel} FAILED total=${(performance.now() - start).toFixed(1)}ms fetch=${(performance.now()-t4).toFixed(1)}ms`, err.message);
    // 保留原始业务错误消息（如 "Email already in use"），网络错误兜底用通用提示
    const cleanErr = new Error(err.message || 'Something went wrong. Please try again.');
    cleanErr.status = err.status;
    cleanErr.code = err.code;
    cleanErr.data = err.data;
    throw cleanErr;
  }
}

// ==================== Candidates ====================

function candidateToBackend(frontendCandidate) {
  const raw = {
    keyMemory: frontendCandidate.keyMemory || '',
    voiceMemo: frontendCandidate.voiceMemo || '',
    contactMode: frontendCandidate.contactMode || 'recruiting',
    skills: frontendCandidate.skills || [],
    workExperiences: frontendCandidate.workExperiences || [],
    educationExperiences: frontendCandidate.educationExperiences || [],
    websites: frontendCandidate.websites || []
  };

  const body = {
    // localId removed: backend uses auto-increment id only
    fullName: frontendCandidate.name || frontendCandidate.fullName || '',
    headline: frontendCandidate.headline || '',
    company: frontendCandidate.company || '',
    location: frontendCandidate.location || '',
    linkedinId: frontendCandidate.linkedInId || frontendCandidate.linkedinId || '',
    linkedinUrl: frontendCandidate.linkedInUrl || frontendCandidate.linkedinUrl || '',
    email: (frontendCandidate.emails && frontendCandidate.emails[0]) || frontendCandidate.email || '',
    phone: (frontendCandidate.phones && frontendCandidate.phones[0]) || frontendCandidate.phone || '',
    temperature: (frontendCandidate.temperature ? frontendCandidate.temperature.toLowerCase() : null) || 'cold',
    source: frontendCandidate.source || 'linkedin_profile',
    pipelineStage: frontendCandidate.pipelineStage || 'new',
    pipelinePosition: frontendCandidate.pipelinePosition || 0,
    pipelineEnteredAt: frontendCandidate.pipelineEnteredAt ? new Date(frontendCandidate.pipelineEnteredAt).toISOString() : null,
    rawProfileData: JSON.stringify(raw),
    tags: frontendCandidate.tags || '[]',
    nextFollowupAt: frontendCandidate.nextFollowup ? new Date(frontendCandidate.nextFollowup).toISOString() : null,
    nextFollowupSource: frontendCandidate.nextFollowupSource || 'none',
    nextFollowupSequenceStepId: frontendCandidate.nextFollowupSequenceStepId || null,
    sequenceId: frontendCandidate.sequenceId != null ? Number(frontendCandidate.sequenceId) : null,
    updateFollowupFromSequence: frontendCandidate.updateFollowupFromSequence || false,
    sequenceFollowupAt: frontendCandidate.sequenceFollowupAt ? new Date(frontendCandidate.sequenceFollowupAt).toISOString() : null
  };
  console.log('[SCRM_BASE] api.js candidateToBackend temperature conversion:', frontendCandidate.temperature, '->', body.temperature);
  console.log('[SCRM_BASE] api.js candidateToBackend:', JSON.stringify(body));
  return body;
}

function candidateFromBackend(backend) {
  let extra = {};
  try {
    if (backend.rawProfileData) {
      extra = JSON.parse(backend.rawProfileData);
    }
  } catch (e) { /* ignore */ }

  const tempRaw = backend.temperature;
  const tempConverted = (tempRaw ? tempRaw.charAt(0).toUpperCase() + tempRaw.slice(1).toLowerCase() : null) || 'Cold';
  console.log('[SCRM_BASE] api.js candidateFromBackend temperature conversion:', tempRaw, '->', tempConverted);
  const fc = {
    id: backend.id || '',
    name: backend.fullName || '',
    headline: backend.headline || '',
    company: backend.company || '',
    location: backend.location || '',
    linkedInId: backend.linkedinId || '',
    linkedInUrl: backend.linkedinUrl || '',
    emails: backend.email ? [backend.email] : [],
    phones: backend.phone ? [backend.phone] : [],
    temperature: tempConverted,
    source: backend.source || 'extension',
    pipelineStage: backend.pipelineStage || 'new',
    pipelinePosition: backend.pipelinePosition || 0,
    pipelineEnteredAt: toTimestamp(backend.pipelineEnteredAt) || null,
    keyMemory: extra.keyMemory || '',
    voiceMemo: extra.voiceMemo || '',
    contactMode: extra.contactMode || 'recruiting',
    skills: extra.skills || [],
    workExperiences: extra.workExperiences || [],
    educationExperiences: extra.educationExperiences || [],
    websites: extra.websites || [],
    tags: backend.tags || '[]',
    nextFollowup: backend.nextFollowupAt ? toTimestamp(backend.nextFollowupAt) : null,
    nextFollowupSource: backend.nextFollowupSource || 'none',
    nextFollowupSequenceStepId: backend.nextFollowupSequenceStepId || null,
    sequenceId: backend.sequenceId != null ? backend.sequenceId : null,
    updateFollowupFromSequence: backend.updateFollowupFromSequence || false,
    sequenceFollowupAt: backend.sequenceFollowupAt ? toTimestamp(backend.sequenceFollowupAt) : null,
    taskStatus: backend.taskStatus || null,
    createdAt: toTimestamp(backend.createdAt) || Date.now(),
    updatedAt: toTimestamp(backend.updatedAt) || Date.now()
  };
  return fc;
}

const CandidatesAPI = {
  async list(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/candidates', null, params);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(candidateFromBackend);
    }
    return resp;
  },

  async get(id) {
    const resp = await apiRequest('GET', `/api/v1/candidates/${id}`);
    return resp.data ? candidateFromBackend(resp.data) : null;
  },

  async create(candidate) {
    const body = candidateToBackend(candidate);
    const resp = await apiRequest('POST', '/api/v1/candidates', body);
    return candidateFromBackend(resp.data);
  },

  async update(id, candidate) {
    const body = candidateToBackend(candidate);
    // localId removed: backend uses auto-increment id only
    const resp = await apiRequest('PUT', `/api/v1/candidates/${id}`, body);
    return candidateFromBackend(resp.data);
  },

  async delete(id, hard = false) {
    const resp = await apiRequest('DELETE', `/api/v1/candidates/${id}`, null, { hard_delete: hard });
    return resp.data;
  },

  async updatePipelineStage(id, stage) {
    const resp = await apiRequest('PUT', `/api/v1/candidates/${id}/pipeline-stage`, { pipeline_stage: stage });
    return resp.data;
  },

  async updateFollowup(id, nextFollowupAt, source, sequenceStepId) {
    const body = {
      next_followup_at: nextFollowupAt ? nextFollowupAt.getTime() : null,
      source: source || 'manual',
      sequence_step_id: sequenceStepId || null
    };
    const resp = await apiRequest('PUT', `/api/v1/candidates/${id}/follow-up`, body);
    return resp.data;
  },

  async markFollowupDone(id) {
    const resp = await apiRequest('POST', `/api/v1/candidates/${id}/follow-up/done`);
    return resp.data;
  },

  async generateAiMessages(id, request) {
    const resp = await apiRequest('POST', `/api/v1/candidates/${id}/ai-messages`, request);
    return resp.data;
  },

  async getByLinkedInId(linkedinId) {
    const resp = await apiRequest('GET', '/api/v1/candidates/by-linkedin-id', null, { linkedin_id: linkedinId });
    const result = resp.data ? candidateFromBackend(resp.data) : null;
    console.log('[SCRM_TEMPLATE] api.js getByLinkedInId result:', JSON.stringify(result));
    return result;
  },

  async tasks() {
    const resp = await apiRequest('GET', '/api/v1/candidates/tasks');
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(candidateFromBackend);
    }
    return resp;
  }
};

// ==================== Overview ====================

const OverviewAPI = {
  async get(linkedinId) {
    const query = linkedinId ? { linkedin_id: linkedinId } : null;
    const resp = await apiRequest('GET', '/api/v1/overview', null, query);
    const data = resp.data || {};

    // Transform nested candidate if present
    if (data.candidate) {
      data.candidate = candidateFromBackend(data.candidate);
    }
    // Transform today tasks if present
    if (data.todayTasks) {
      data.todayTasks = data.todayTasks.map(candidateFromBackend);
    }
    return data;
  }
};

// ==================== History ====================

function historyToBackend(frontendHistory) {
  return {
    localCandidateId: String(frontendHistory.candidateId || ''),
    historyType: frontendHistory.type || 'note',
    title: (frontendHistory.content || '').substring(0, 100),
    description: frontendHistory.content || '',
    actorType: frontendHistory.subtype || 'System',
    actorName: frontendHistory.actorName || '',
    historyTime: toISOString(frontendHistory.date) || new Date().toISOString()
  };
}

function historyFromBackend(backend) {
  return {
    id: backend.id || '',
    candidateId: backend.localCandidateId || backend.candidateId,
    type: backend.historyType || 'note',
    content: backend.description || backend.title || '',
    subtype: backend.actorType || 'System',
    actorName: backend.actorName || '',
    date: toTimestamp(backend.historyTime) || Date.now()
  };
}

const HistoryAPI = {
  async list(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/history', null, params);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(historyFromBackend);
    }
    return resp;
  }
  // create removed: history is now recorded automatically by backend services
};

// ==================== Notes ====================

function noteToBackend(candidateId, frontendNote) {
  return {
    candidateId: Number(candidateId) || 0,
    content: frontendNote.content || ''
  };
}

function noteFromBackend(backend) {
  return {
    id: backend.id || '',
    candidateId: backend.candidateId,
    content: backend.content || '',
    createdAt: toTimestamp(backend.createdAt),
    updatedAt: toTimestamp(backend.updatedAt)
  };
}

const NotesAPI = {
  async list(candidateId) {
    const resp = await apiRequest('GET', `/api/v1/candidates/${candidateId}/notes`);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(noteFromBackend);
    }
    return resp;
  },

  async create(candidateId, note) {
    const body = noteToBackend(candidateId, note);
    const resp = await apiRequest('POST', `/api/v1/candidates/${candidateId}/notes`, body);
    return noteFromBackend(resp.data);
  },

  async update(noteId, note) {
    const body = { content: note.content || '' };
    const resp = await apiRequest('PUT', `/api/v1/notes/${noteId}`, body);
    return noteFromBackend(resp.data);
  },

  async delete(noteId) {
    const resp = await apiRequest('DELETE', `/api/v1/notes/${noteId}`);
    return resp.data;
  }
};

// ==================== Pipeline ====================

const PipelineAPI = {
  // Boards
  async listBoards() {
    const resp = await apiRequest('GET', '/api/v1/pipeline/boards');
    return resp;
  },
  async createBoard(board) {
    const resp = await apiRequest('POST', '/api/v1/pipeline/boards', board);
    return resp.data;
  },
  async getBoard(id) {
    const resp = await apiRequest('GET', `/api/v1/pipeline/boards/${id}`);
    return resp.data;
  },
  async updateBoard(id, board) {
    const resp = await apiRequest('PUT', `/api/v1/pipeline/boards/${id}`, board);
    return resp.data;
  },
  async deleteBoard(id) {
    const resp = await apiRequest('DELETE', `/api/v1/pipeline/boards/${id}`);
    return resp.data;
  },

  // Stages
  async listStages(boardId) {
    const url = boardId
      ? `/api/v1/pipeline/boards/${boardId}/stages`
      : '/api/v1/pipeline/stages';
    const resp = await apiRequest('GET', url);
    return resp;
  },
  async createStage(stage) {
    const resp = await apiRequest('POST', '/api/v1/pipeline/stages', stage);
    return resp.data;
  },
  async updateStage(id, stage) {
    const resp = await apiRequest('PUT', `/api/v1/pipeline/stages/${id}`, stage);
    return resp.data;
  },
  async deleteStage(id) {
    const resp = await apiRequest('DELETE', `/api/v1/pipeline/stages/${id}`);
    return resp.data;
  },

  // Cards
  async getCards(boardId, includeDetails = false) {
    const resp = await apiRequest('GET', `/api/v1/pipeline/boards/${boardId}/cards`, null, { include_details: includeDetails });
    return resp;
  },
  async createCard(localId, candidateId, stageId, position = 0) {
    const resp = await apiRequest('POST', '/api/v1/pipeline/cards', { local_id: localId, candidate_id: candidateId, stage_id: stageId, position });
    return resp.data;
  },
  async moveCard(id, targetStageId, newPosition) {
    const resp = await apiRequest('PUT', `/api/v1/pipeline/cards/${id}/move`, { target_stage_id: targetStageId, new_position: newPosition });
    return resp.data;
  },
  async deleteCard(id) {
    const resp = await apiRequest('DELETE', `/api/v1/pipeline/cards/${id}`);
    return resp.data;
  }
};

// ==================== Sequences ====================

function sequenceToBackend(frontendSeq) {
  const steps = (frontendSeq.steps || []).map((s, idx) => ({
    stepNumber: idx + 1,
    name: s.name || '',
    actionType: s.actionType || 'message',
    delayType: s.delayDays === 0 ? 'immediately' : 'days',
    delayValue: s.delayDays || 0
  }));

  return {
    name: frontendSeq.name || '',
    description: frontendSeq.description || '',
    steps
  };
}

function sequenceFromBackend(backend) {
  const steps = (backend.steps || []).map(s => ({
    id: s.id || '',
    name: s.name || '',
    delayDays: s.delayValue || 0,
    actionType: s.actionType || 'message',
    stepNumber: s.stepNumber || 1
  }));

  const fs = {
    id: backend.id || '',
    name: backend.name || '',
    description: backend.description || '',
    isActive: backend.isActive !== undefined ? backend.isActive : true,
    isTemplate: backend.isTemplate || false,
    isDefault: backend.isDefault || false,
    userId: backend.userId || null,
    stepCount: steps.length,
    steps,
    createdAt: toTimestamp(backend.createdAt) || Date.now(),
    updatedAt: toTimestamp(backend.updatedAt) || Date.now()
  };
  return fs;
}

const SequencesAPI = {
  async list(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/sequences', null, params);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(sequenceFromBackend);
    }
    return resp;
  },

  async get(id) {
    const resp = await apiRequest('GET', `/api/v1/sequences/${id}`);
    return sequenceFromBackend(resp.data);
  },

  async create(seq) {
    const body = sequenceToBackend(seq);
    const resp = await apiRequest('POST', '/api/v1/sequences', body);
    return sequenceFromBackend(resp.data);
  },

  async update(id, seq) {
    const body = sequenceToBackend(seq);
    const resp = await apiRequest('PUT', `/api/v1/sequences/${id}`, body);
    return sequenceFromBackend(resp.data);
  },

  async delete(id) {
    const resp = await apiRequest('DELETE', `/api/v1/sequences/${id}`);
    return resp.data;
  }
};

async function getAllSequences() {
  const resp = await SequencesAPI.list({ is_active: true });
  if (resp.data && resp.data.items) {
    return resp.data.items;
  }
  return [];
}

// ==================== User ====================

const UserAPI = {
  async me() {
    const resp = await apiRequest('GET', '/api/v1/user/me');
    return resp.data;
  },

  async updateMe(data) {
    const resp = await apiRequest('PUT', '/api/v1/user/me', data);
    return resp.data;
  }

  // Deprecated: verification flow removed
  // async sendVerificationCode(email) { ... }
  // async bindEmail(email, code) { ... }
  // async mergeAccount(...) { ... }
  // async keepDeviceNew(...) { ... }
};

const FeedbackAPI = {
  // Deprecated: feedback now uses mailto
  // async submit(content, email = '') { ... }
};



// ==================== Subscription ====================

const SubscriptionAPI = {
  async listPlans() {
    const resp = await apiRequest('GET', '/api/v1/subscription/plans');
    return resp;
  },
  async current() {
    const resp = await apiRequest('GET', '/api/v1/subscription/current');
    return resp;
  },
  async checkout(planCode, email) {
    const resp = await apiRequest('POST', '/api/v1/subscription/checkout', { plan_code: planCode, email: email });
    return resp;
  },
  async cancel(atPeriodEnd = true) {
    const resp = await apiRequest('POST', '/api/v1/subscription/cancel', { at_period_end: atPeriodEnd });
    return resp;
  }
};

// ==================== Export ====================

if (typeof window !== 'undefined') {
  window.API = {
    base: { getApiBase, setApiBase },
    overview: OverviewAPI,
    candidates: CandidatesAPI,
    history: HistoryAPI,
    notes: NotesAPI,
    pipeline: PipelineAPI,
    sequences: SequencesAPI,
    user: UserAPI,
    feedback: FeedbackAPI,
    events: {
      async track(eventName, eventData, sessionId) {
        const body = {
          event_name: eventName,
          event_data: eventData ? JSON.stringify(eventData) : null,
          session_id: sessionId || null
        };
        const resp = await apiRequest('POST', '/api/v1/events', body);
        return resp.data;
      }
    },
    subscription: SubscriptionAPI,
    utils: { toISOString, toTimestamp, generateLocalId, candidateToBackend, candidateFromBackend, sequenceToBackend, sequenceFromBackend, getAllSequences }
  };
}
