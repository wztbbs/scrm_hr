// api.js - Backend API client for LinkedIn SCRM
// Maps frontend local data models to backend REST APIs

const DEFAULT_API_BASE = 'http://localhost:8080';

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
  const base = await getApiBase();
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
      'Accept': 'application/json'
      // Auth header reserved for future use
      // 'Authorization': 'Bearer ' + await getAuthToken()
    }
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  try {
    const resp = await fetch(url, options);
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
      throw new Error(json.message || 'API error');
    }
    return json;
  } catch (err) {
    console.warn('[API] Request failed:', method, url, err.message);
    throw err;
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

  return {
    localId: frontendCandidate.localId || generateLocalId(),
    fullName: frontendCandidate.name || '',
    headline: frontendCandidate.headline || '',
    company: frontendCandidate.company || '',
    location: frontendCandidate.location || '',
    linkedinId: frontendCandidate.linkedInId || '',
    linkedinUrl: frontendCandidate.linkedInUrl || '',
    email: (frontendCandidate.emails && frontendCandidate.emails[0]) || '',
    phone: (frontendCandidate.phones && frontendCandidate.phones[0]) || '',
    temperature: frontendCandidate.temperature || 'Cold',
    source: frontendCandidate.source || 'extension',
    pipelineStage: frontendCandidate.pipelineStage || 'new',
    pipelinePosition: frontendCandidate.pipelinePosition || 0,
    pipelineEnteredAt: frontendCandidate.pipelineEnteredAt ? new Date(frontendCandidate.pipelineEnteredAt).toISOString() : null,
    rawProfileData: JSON.stringify(raw),
    tags: frontendCandidate.tags || '',
    nextFollowupAt: frontendCandidate.nextFollowup ? new Date(frontendCandidate.nextFollowup).toISOString() : null,
    nextFollowupSource: frontendCandidate.nextFollowupSource || 'none',
    nextFollowupSequenceStepId: frontendCandidate.nextFollowupSequenceStepId || null
  };
}

function candidateFromBackend(backend) {
  let extra = {};
  try {
    if (backend.rawProfileData) {
      extra = JSON.parse(backend.rawProfileData);
    }
  } catch (e) { /* ignore */ }

  const fc = {
    localId: backend.localId || '',
    serverId: backend.id || null,
    name: backend.fullName || '',
    headline: backend.headline || '',
    company: backend.company || '',
    location: backend.location || '',
    linkedInId: backend.linkedinId || '',
    linkedInUrl: backend.linkedinUrl || '',
    emails: backend.email ? [backend.email] : [],
    phones: backend.phone ? [backend.phone] : [],
    temperature: backend.temperature || 'Cold',
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
    tags: backend.tags || '',
    nextFollowup: backend.nextFollowupAt ? toTimestamp(backend.nextFollowupAt) : null,
    nextFollowupSource: backend.nextFollowupSource || 'none',
    nextFollowupSequenceStepId: backend.nextFollowupSequenceStepId || null,
    createdAt: toTimestamp(backend.createdAt) || Date.now(),
    updatedAt: toTimestamp(backend.updatedAt) || Date.now()
  };
  // Do not set id here; let IndexedDB assign or caller manage it
  return fc;
}

const CandidatesAPI = {
  async list(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/candidates', null, params);
    return resp;
  },

  async get(id) {
    const resp = await apiRequest('GET', `/api/v1/candidates/${id}`);
    return resp.data;
  },

  async create(candidate) {
    const body = candidateToBackend(candidate);
    const resp = await apiRequest('POST', '/api/v1/candidates', body);
    return candidateFromBackend(resp.data);
  },

  async update(id, candidate) {
    const body = candidateToBackend(candidate);
    body.localId = candidate.localId || id;
    const resp = await apiRequest('PUT', `/api/v1/candidates/${id}`, body);
    return candidateFromBackend(resp.data);
  },

  async delete(id, hard = false) {
    const resp = await apiRequest('DELETE', `/api/v1/candidates/${id}`, null, { hard_delete: hard });
    return resp.data;
  },

  async batch(items) {
    const bodyItems = items.map(candidateToBackend);
    const resp = await apiRequest('POST', '/api/v1/candidates/batch', { items: bodyItems });
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
  }
};

// ==================== History ====================

function historyToBackend(frontendHistory) {
  return {
    localId: frontendHistory.localId || generateLocalId(),
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
    id: backend.localId || backend.id,
    candidateId: backend.localCandidateId || backend.candidateId,
    type: backend.historyType || 'note',
    content: backend.description || backend.title || '',
    subtype: backend.actorType || 'System',
    actorName: backend.actorName || '',
    date: toTimestamp(backend.historyTime) || Date.now(),
    serverId: backend.id || null
  };
}

const HistoryAPI = {
  async list(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/history', null, params);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(historyFromBackend);
    }
    return resp;
  },

  async create(entry) {
    const body = historyToBackend(entry);
    const resp = await apiRequest('POST', '/api/v1/history', body);
    return historyFromBackend(resp.data);
  }
};

// ==================== Notes ====================

function noteToBackend(candidateId, frontendNote) {
  return {
    localId: frontendNote.localId || generateLocalId(),
    candidateId: Number(candidateId) || 0,
    content: frontendNote.content || ''
  };
}

function noteFromBackend(backend) {
  return {
    id: backend.localId || backend.id,
    candidateId: backend.candidateId,
    content: backend.content || '',
    createdAt: toTimestamp(backend.createdAt),
    updatedAt: toTimestamp(backend.updatedAt),
    serverId: backend.id || null
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
    const body = { localId: note.localId || noteId, content: note.content || '' };
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
    localId: s.localId || generateLocalId(),
    stepNumber: idx + 1,
    name: s.name || '',
    actionType: s.actionType || 'message',
    delayType: 'day',
    delayValue: s.delayDays || 0
  }));

  return {
    localId: frontendSeq.localId || generateLocalId(),
    name: frontendSeq.name || '',
    description: frontendSeq.description || '',
    steps
  };
}

function sequenceFromBackend(backend) {
  const steps = (backend.steps || []).map(s => ({
    localId: s.localId || generateLocalId(),
    name: s.name || '',
    delayDays: s.delayValue || 0,
    actionType: s.actionType || 'message',
    stepNumber: s.stepNumber || 1
  }));

  const fs = {
    id: backend.id || backend.localId || '',
    localId: backend.localId || '',
    serverId: backend.id || null,
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

function candidateSequenceToBackend(frontendTask, candidateLocalId, sequenceLocalId) {
  return {
    localId: frontendTask.localId || generateLocalId(),
    candidateId: candidateLocalId,
    sequenceId: sequenceLocalId,
    status: frontendTask.status || 'active',
    currentStepNumber: (frontendTask.stepIndex || 0) + 1,
    totalSteps: frontendTask.totalSteps || 1
  };
}

function candidateSequenceFromBackend(backend) {
  return {
    id: backend.localId || backend.id,
    localId: backend.localId || '',
    serverId: backend.id || null,
    candidateId: backend.candidateId,
    sequenceId: backend.sequenceId,
    status: backend.status || 'active',
    currentStepNumber: backend.currentStepNumber || 1,
    totalSteps: backend.totalSteps || 1,
    startedAt: toTimestamp(backend.startedAt),
    completedAt: toTimestamp(backend.completedAt)
  };
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
    body.localId = seq.localId || id;
    const resp = await apiRequest('PUT', `/api/v1/sequences/${id}`, body);
    return sequenceFromBackend(resp.data);
  },

  async delete(id) {
    const resp = await apiRequest('DELETE', `/api/v1/sequences/${id}`);
    return resp.data;
  },

  // Candidate Sequences
  async listCandidateSequences(params = {}) {
    const resp = await apiRequest('GET', '/api/v1/candidate-sequences', null, params);
    if (resp.data && resp.data.items) {
      resp.data.items = resp.data.items.map(candidateSequenceFromBackend);
    }
    return resp;
  },

  async createCandidateSequence(candidateLocalId, sequenceLocalId, task = {}) {
    console.log('[API] createCandidateSequence called:', { candidateLocalId, sequenceLocalId, task });
    const body = candidateSequenceToBackend(task, candidateLocalId, sequenceLocalId);
    console.log('[API] createCandidateSequence body=', body);
    const resp = await apiRequest('POST', '/api/v1/candidate-sequences', body);
    console.log('[API] createCandidateSequence response=', resp);
    return candidateSequenceFromBackend(resp.data);
  },

  async deleteCandidateSequence(id) {
    const resp = await apiRequest('DELETE', `/api/v1/candidate-sequences/${id}`);
    return resp.data;
  }
};

// ==================== Sync ====================

const SyncAPI = {
  async sync(body) {
    const resp = await apiRequest('POST', '/api/v1/sync', body);
    return resp.data;
  },

  async check(since) {
    const resp = await apiRequest('GET', '/api/v1/sync/check', null, { since });
    return resp.data;
  },

  async pull(since) {
    const resp = await apiRequest('GET', '/api/v1/sync/pull', null, { since });
    return resp.data;
  }
};

// ==================== User ====================

const UserAPI = {
  async me() {
    const resp = await apiRequest('GET', '/api/v1/user/me');
    return resp.data;
  }
};

const FeedbackAPI = {
  async submit(content, email = '') {
    const body = { content, email };
    const resp = await apiRequest('POST', '/api/v1/feedback', body);
    return resp;
  }
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
  async checkout(planCode, successUrl, cancelUrl, couponCode) {
    const resp = await apiRequest('POST', '/api/v1/subscription/checkout', { plan_code: planCode, success_url: successUrl, cancel_url: cancelUrl, coupon_code: couponCode });
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
    candidates: CandidatesAPI,
    history: HistoryAPI,
    notes: NotesAPI,
    pipeline: PipelineAPI,
    sequences: SequencesAPI,
    sync: SyncAPI,
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
    utils: { toISOString, toTimestamp, generateLocalId, candidateToBackend, candidateFromBackend, sequenceToBackend, sequenceFromBackend }
  };
}
