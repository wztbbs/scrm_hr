// popup.js - Main popup logic

let currentCandidate = null;
let currentTab = 'overview';
let currentSequenceSubTab = 'templates';
let currentFilter = 'All Roles';
let manualEntryCandidateId = null;
let isDraggingCard = false;
let pipelineStages = [];
let isSavingCandidate = false;
let hasSyncedData = false;

// 全局 Promise 未处理异常兜底
window.addEventListener('unhandledrejection', event => {
  event.preventDefault(); // 阻止控制台打印丑陋堆栈
  showToast('Something went wrong. Please refresh.');
});

// ========== Draft Cache (localStorage) ==========
function getDraftKey(candidate) {
  const id = candidate?.id || candidate?.linkedInId || candidate?.linkedinId || 'unknown';
  return `draft_${id}`;
}

function saveDraft(candidate) {
  if (!candidate) return;
  const draft = {
    keyMemory: candidate.keyMemory || '',
    voiceMemo: candidate.voiceMemo || '',
    temperature: candidate.temperature || '',
    savedAt: Date.now()
  };
  localStorage.setItem(getDraftKey(candidate), JSON.stringify(draft));
}

function loadDraft(candidate) {
  if (!candidate) return null;
  const raw = localStorage.getItem(getDraftKey(candidate));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearDraft(candidate) {
  if (!candidate) return;
  localStorage.removeItem(getDraftKey(candidate));
}

function applyDraft(candidate) {
  const draft = loadDraft(candidate);
  if (!draft) return;
  if (draft.keyMemory !== undefined) candidate.keyMemory = draft.keyMemory;
  if (draft.voiceMemo !== undefined) candidate.voiceMemo = draft.voiceMemo;
  if (draft.temperature !== undefined) candidate.temperature = draft.temperature;
}

// ========== Analytics / Tracking ==========
const sessionId = 'sess_' + Math.random().toString(36).slice(2, 10);

async function trackEvent(eventName, eventData = {}) {
  // GA4 tracking
  if (typeof gtag === 'function') {
    try {
      gtag('event', eventName, {
        event_category: eventData.category || 'engagement',
        event_label: eventData.label || '',
        value: eventData.value || 1,
        session_id: sessionId,
        ...eventData
      });
    } catch (e) { /* ignore */ }
  }

  // Backend tracking (fire and forget)
  if (typeof window !== 'undefined' && window.API) {
    try {
      await window.API.events.track(eventName, eventData, sessionId);
    } catch (e) { /* ignore */ }
  }
}

// ========== Utility ==========
function $(id) { return document.getElementById(id); }

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function showLoading() { $('loadingOverlay').classList.add('active'); }
function hideLoading() { $('loadingOverlay').classList.remove('active'); }

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(name) {
  const colors = ['#5b4cdb', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getTaskStatusConfig(taskStatus) {
  const map = {
    'OVERDUE':  { label: 'Follow up now — overdue',      color: '#ef4444', borderClass: 'task-border-overdue',  bgClass: 'task-border-overdue' },
    'DUE_SOON': { label: 'Due soon — ready to contact',   color: '#f97316', borderClass: 'task-border-due-soon', bgClass: 'task-border-due-soon' },
    'UPCOMING': { label: 'Follow-up scheduled',           color: '#3b82f6', borderClass: 'task-border-upcoming', bgClass: 'task-border-upcoming' }
  };
  return map[taskStatus] || map['UPCOMING'];
}

// ========== Tab Switching ==========
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    $(`tab-${currentTab}`).classList.add('active');
    if (currentTab === 'pipeline') {
      renderPipeline();
    }
    if (currentTab === 'sequence') renderSequence();
    if (currentTab === 'history') renderHistory();
    // Scroll popup to top on tab switch
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  });
});

// Sequence sub-tabs
document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSequenceSubTab = tab.dataset.subtab;
    document.querySelectorAll('.sub-content').forEach(c => {
      c.classList.toggle('hidden', !c.id.includes(currentSequenceSubTab));
    });
    if (currentSequenceSubTab === 'today') renderTodayTasks();
    else renderSequenceTemplates();
  });
});

// ========== Overview: Load Candidate from LinkedIn ==========
async function loadCurrentCandidate(preloadedBackendCandidate = null) {
  console.log('[PLUGIN_INIT] loadCurrentCandidate START');
  const start = performance.now();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('linkedin.com/in/')) {
      $('ovName').textContent = 'No LinkedIn Profile';
      $('ovTitle').textContent = 'Open a candidate profile to get started';
      return;
    }

    // Try to get cached data from content script
    const response = await sendMessageToContentScript(tab.id, { action: 'scrape' });
    const tabUrl = tab.url || '';
    if (response && response.success && response.data) {
      const data = response.data;
      console.log('[SCRM_BASE] popup.js received data from content:', JSON.stringify(data));
      // Build candidate immediately from scraped data for instant render
      currentCandidate = {
        linkedInId: data.linkedInId,
        linkedInUrl: tabUrl,
        name: data.name || '',
        headline: data.headline || '',
        company: data.company || '',
        school: data.school || '',
        summary: data.summary || '',
        skills: data.skills || [],
        workExperiences: data.workExperiences || [],
        educationExperiences: data.educationExperiences || [],
        websites: data.websites || [],
        emails: [],
        phones: [],
        temperature: 'Cold',
        contactMode: 'recruiting',
        keyMemory: '',
        nextFollowup: '',
        voiceMemo: ''
      };
      renderOverview();

      // Merge preloaded backend candidate if available
      if (preloadedBackendCandidate) {
        console.log('[SCRM_TEMPLATE] popup.js backendCandidate before merge:', JSON.stringify(preloadedBackendCandidate));
        console.log('[SCRM_TEMPLATE] popup.js currentCandidate before merge:', JSON.stringify(currentCandidate));
        Object.assign(currentCandidate, preloadedBackendCandidate, {
          linkedInUrl: tabUrl || preloadedBackendCandidate.linkedInUrl || currentCandidate.linkedInUrl,
          name: data.name || preloadedBackendCandidate.name || currentCandidate.name,
          headline: data.headline || preloadedBackendCandidate.headline || currentCandidate.headline,
          company: data.company || preloadedBackendCandidate.company || currentCandidate.company,
          skills: data.skills?.length ? data.skills : (preloadedBackendCandidate.skills || currentCandidate.skills),
          workExperiences: data.workExperiences?.length ? data.workExperiences : (preloadedBackendCandidate.workExperiences || currentCandidate.workExperiences),
          educationExperiences: data.educationExperiences?.length ? data.educationExperiences : (preloadedBackendCandidate.educationExperiences || currentCandidate.educationExperiences),
          websites: data.websites?.length ? data.websites : (preloadedBackendCandidate.websites || currentCandidate.websites),
        });
        console.log('[SCRM_TEMPLATE] popup.js currentCandidate after merge:', JSON.stringify(currentCandidate));
        renderOverview();
      } else if (typeof window !== 'undefined' && window.API) {
        // Fallback: fetch backend details asynchronously
        window.API.candidates.getByLinkedInId(data.linkedInId).then(backendCandidate => {
          if (backendCandidate) {
            console.log('[SCRM_TEMPLATE] popup.js backendCandidate before merge:', JSON.stringify(backendCandidate));
            console.log('[SCRM_TEMPLATE] popup.js currentCandidate before merge:', JSON.stringify(currentCandidate));
            Object.assign(currentCandidate, backendCandidate, {
              linkedInUrl: tabUrl || backendCandidate.linkedInUrl || currentCandidate.linkedInUrl,
              name: data.name || backendCandidate.name || currentCandidate.name,
              headline: data.headline || backendCandidate.headline || currentCandidate.headline,
              company: data.company || backendCandidate.company || currentCandidate.company,
              skills: data.skills?.length ? data.skills : (backendCandidate.skills || currentCandidate.skills),
              workExperiences: data.workExperiences?.length ? data.workExperiences : (backendCandidate.workExperiences || currentCandidate.workExperiences),
              educationExperiences: data.educationExperiences?.length ? data.educationExperiences : (backendCandidate.educationExperiences || currentCandidate.educationExperiences),
              websites: data.websites?.length ? data.websites : (backendCandidate.websites || currentCandidate.websites),
            });
            console.log('[SCRM_TEMPLATE] popup.js currentCandidate after merge:', JSON.stringify(currentCandidate));
            renderOverview();
          }
        }).catch(e => {
          console.warn('[Popup] Backend candidate fetch failed:', e.message);
        });
      }
    } else {
      $('ovName').textContent = 'Unable to load';
      $('ovTitle').textContent = 'Try refreshing the page or click Save & Track';
    }
  } catch (e) {
    console.log('Load candidate error:', e);
    $('ovName').textContent = 'Error';
    $('ovTitle').textContent = e.message || 'Please open a LinkedIn profile';
  } finally {
    console.log(`[PLUGIN_INIT] loadCurrentCandidate END 耗时=${(performance.now() - start).toFixed(1)}ms`);
  }
}

function renderOverview() {
  if (!currentCandidate) return;
  console.log('[SCRM_TEMPLATE] popup.js renderOverview currentCandidate:', JSON.stringify(currentCandidate));
  // Apply draft if exists (before rendering)
  console.log('[SCRM_TEMPLATE] popup.js renderOverview before applyDraft - keyMemory:', currentCandidate.keyMemory, 'voiceMemo:', currentCandidate.voiceMemo);
  applyDraft(currentCandidate);
  console.log('[SCRM_TEMPLATE] popup.js renderOverview after applyDraft - keyMemory:', currentCandidate.keyMemory, 'voiceMemo:', currentCandidate.voiceMemo);

  $('ovAvatar').textContent = getInitials(currentCandidate.name);
  $('ovAvatar').style.background = getAvatarColor(currentCandidate.name);
  $('ovName').textContent = currentCandidate.name || 'Unknown';
  $('ovTitle').textContent = currentCandidate.company || '-';

  const ovTempEl = $('ovTemperature');
  console.log('[SCRM_TEMPLATE] popup.js renderOverview ovTemperature options:', Array.from(ovTempEl.options).map(o => o.value));
  console.log('[SCRM_TEMPLATE] popup.js renderOverview setting ovTemperature.value to:', currentCandidate.temperature || 'Cold');
  ovTempEl.value = currentCandidate.temperature || 'Cold';
  console.log('[SCRM_TEMPLATE] popup.js renderOverview ovTemperature.value after set:', ovTempEl.value, 'selectedIndex:', ovTempEl.selectedIndex);

  const isRecruiting = currentCandidate.contactMode === 'recruiting';
  $('ovModeRecruiting').classList.toggle('active', isRecruiting);
  $('ovModeNurture').classList.toggle('active', !isRecruiting);

  $('ovKeyMemory').value = currentCandidate.keyMemory || '';

  // Reset AI message area only if NOT currently generating
  // (prevents re-enabling the button while a request is in flight)
  if ($('ovAiLoading').style.display !== 'block') {
    $('ovAiGenerateBtn').style.display = 'block';
    $('ovAiGenerateBtn').disabled = false;
    $('ovAiLoading').style.display = 'none';
    $('ovAiResult').style.display = 'none';
  }

  renderOverviewActiveSequence();
  renderOverviewNextFollowup();
  renderOverviewVoiceMemo();
  renderOverviewTodayTasks();
}

async function renderOverviewActiveSequence() {
  if (!currentCandidate) {
    $('ovActiveSequence').innerHTML = '<div class="text-gray text-center text-sm" style="padding:12px">No active sequence</div>';
    return;
  }

  const sequences = await getAllSequences();
  const boundSeqId = currentCandidate.sequenceId;
  const selectHtml = '<option value="">None (manual follow-up only)</option>' +
    sequences.map(s => `<option value="${s.id}" ${s.id == boundSeqId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  if (!boundSeqId) {
    // Not bound
    $('ovActiveSequence').innerHTML = `
      <div id="ovSeqUnbound">
        <div class="text-gray text-center text-sm" style="padding:12px">No active sequence</div>
        <button class="btn-sm" id="ovSeqBindBtn" style="width:100%;">+ Bind to Sequence</button>
      </div>
      <div class="form-row hidden" id="ovSeqBindRow">
        <select class="form-select" id="ovSeqBindSelect">${selectHtml}</select>
      </div>
    `;
  } else {
    // Bound
    const seq = await getSequenceById(boundSeqId);
    const seqName = seq ? seq.name : 'Unknown Sequence';

    $('ovActiveSequence').innerHTML = `
      <div id="ovSeqBound">
        <div class="seq-card">
          <div class="seq-header">
            <span class="seq-name">${escapeHtml(seqName)}</span>
            <button class="seq-edit-btn" id="ovSeqEditBtn" style="background:none;border:none;color:#5b4cdb;font-size:13px;cursor:pointer;padding:0;">✎</button>
          </div>
          <div style="font-size:12px;color:#9ca3af">Bound to sequence</div>
        </div>
      </div>
      <div class="form-row hidden" id="ovSeqBindRow">
        <select class="form-select" id="ovSeqBindSelect">${selectHtml}</select>
      </div>
    `;
  }

  // Bind events
  const bindBtn = $('ovSeqBindBtn');
  if (bindBtn) {
    bindBtn.addEventListener('click', () => {
      $('ovSeqBindRow').classList.remove('hidden');
      $('ovSeqUnbound').classList.add('hidden');
    });
  }

  const editBtn = $('ovSeqEditBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      $('ovSeqBindRow').classList.remove('hidden');
      $('ovSeqBound').classList.add('hidden');
    });
  }

  const select = $('ovSeqBindSelect');
  if (select) {
    select.addEventListener('change', async () => {
      const seqId = select.value;
      await bindCandidateToSequence(currentCandidate.id, seqId);
      showToast(seqId ? 'Sequence bound!' : 'Sequence unbound');
      renderOverviewActiveSequence();
      renderOverviewNextFollowup();
    });
  }
}

async function renderOverviewNextFollowup() {
  const input = $('ovNextFollowupInput');
  const statusBar = $('ovFollowupStatusBar');
  const sourceTag = $('ovFollowupSourceTag');
  const suggestionEl = $('ovSequenceSuggestion');
  const suggestionText = $('ovSequenceSuggestionText');
  const markDoneRow = $('ovMarkDoneRow');

  if (!currentCandidate) {
    input.value = '';
    statusBar.textContent = '⚪ Set reminder';
    statusBar.className = 'followup-status-bar status-none';
    sourceTag.textContent = '';
    suggestionEl.style.display = 'none';
    markDoneRow.style.display = 'none';
    return;
  }

  let followupTime = null;

  // Use nextFollowup (from backend/manual) as primary source
  if (currentCandidate.nextFollowup) {
    followupTime = new Date(currentCandidate.nextFollowup).getTime();
    input.value = fmtDateTimeInput(new Date(currentCandidate.nextFollowup));
  }

  // Show source tag
  const source = currentCandidate.nextFollowupSource || 'none';
  if (source === 'manual') {
    sourceTag.textContent = 'Manual · Set by you';
  } else if (source === 'sequence') {
    sourceTag.textContent = 'From Sequence';
  } else {
    sourceTag.textContent = '';
  }

  // If no primary follow-up, calculate sequence suggestion from bound sequence steps
  let sequenceSuggestTime = null;
  if (currentCandidate.sequenceId && !followupTime) {
    const seq = await getSequenceById(currentCandidate.sequenceId);
    if (seq && seq.steps && seq.steps.length >= 2) {
      const nextStep = seq.steps[1]; // step 2
      sequenceSuggestTime = Date.now() + nextStep.delayDays * 86400000;
      followupTime = sequenceSuggestTime;
      input.value = fmtDateTimeInput(new Date(sequenceSuggestTime));
      sourceTag.textContent = 'From Sequence';
    }
  }

  if (!followupTime) {
    input.value = '';
    statusBar.textContent = '⚪ Set reminder';
    statusBar.className = 'followup-status-bar status-none';
    suggestionEl.style.display = 'none';
    markDoneRow.style.display = 'none';
    return;
  }

  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (followupTime < now) {
    const days = Math.ceil((now - followupTime) / 86400000);
    statusBar.textContent = `📅 Follow up now — ${days} day${days > 1 ? 's' : ''} overdue`;
    statusBar.className = 'followup-status-bar status-overdue';
    markDoneRow.style.display = 'block';
  } else if (followupTime <= todayEnd.getTime()) {
    statusBar.textContent = '📅 Follow up today';
    statusBar.className = 'followup-status-bar status-today';
    markDoneRow.style.display = 'block';
  } else {
    const dateStr = new Date(followupTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    statusBar.textContent = `📅 Follow up on ${dateStr}`;
    statusBar.className = 'followup-status-bar status-future';
    markDoneRow.style.display = 'none';
  }

  // Show sequence suggestion layer when source=manual but sequence has a suggestion
  if (source === 'manual' && sequenceSuggestTime) {
    const dateStr = new Date(sequenceSuggestTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    suggestionText.textContent = `Sequence suggests: ${dateStr}`;
    suggestionEl.style.display = 'block';
  } else {
    suggestionEl.style.display = 'none';
  }
}

function renderOverviewVoiceMemo() {
  if (currentCandidate) {
    $('ovVoiceMemoTextarea').value = currentCandidate.voiceMemo || '';
  } else {
    $('ovVoiceMemoTextarea').value = '';
  }
}

async function renderOverviewTodayTasks(preloadedTasks = null, preloadedOverdueCount = null) {
  console.log('[PLUGIN_INIT] renderOverviewTodayTasks START');
  const start = performance.now();
  let candidates = preloadedTasks;
  let overdueCount = preloadedOverdueCount;

  if (candidates === null && typeof window !== 'undefined' && window.API) {
    try {
      const resp = await window.API.candidates.tasks();
      if (resp.data && resp.data.items) {
        candidates = resp.data.items;
      }
      if (resp.data && typeof resp.data.overdueCount === 'number') {
        overdueCount = resp.data.overdueCount;
      }
    } catch (e) {
      console.warn('[Popup] Backend tasks fetch failed:', e.message);
      candidates = [];
      overdueCount = 0;
    }
  }
  if (!candidates) candidates = [];
  if (typeof overdueCount !== 'number') overdueCount = 0;

  const countEl = $('ovTodayCount');
  const listEl = $('ovTodayTaskList');
  const content = $('ovTodayContent');
  const banner = $('ovOverdueBanner');

  // Default expand/collapse based on task count
  if (candidates.length > 0) {
    content.classList.remove('hidden');
    countEl.textContent = `${candidates.length} task${candidates.length !== 1 ? 's' : ''} ▲`;
  } else {
    content.classList.add('hidden');
    countEl.textContent = '0 tasks ▼';
  }

  // Overdue banner
  if (overdueCount > 0) {
    banner.classList.remove('hidden');
    $('ovOverdueCount').textContent = overdueCount;
    $('ovOverduePlural').textContent = overdueCount > 1 ? 's' : '';
  } else {
    banner.classList.add('hidden');
  }

  if (candidates.length === 0) {
    listEl.innerHTML = '<div class="text-gray text-sm text-center" style="padding:12px;">No tasks for today</div>';
  } else {
    listEl.innerHTML = candidates.map(candidate => {
      const status = getTaskStatusConfig(candidate.taskStatus);
      const timeStr = candidate.nextFollowup
        ? new Date(candidate.nextFollowup).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '';
      const showMarkDone = candidate.taskStatus === 'OVERDUE' || candidate.taskStatus === 'DUE_SOON';

      return `
        <div class="today-task-item ${status.borderClass}">
          <div class="today-task-avatar" style="background:${getAvatarColor(candidate.name)}">${getInitials(candidate.name)}</div>
          <div class="today-task-info">
            <div class="today-task-name">${escapeHtml(candidate.name)}</div>
            <div class="today-task-desc" style="color:${status.color};font-weight:500;">${status.label}</div>
            <div class="today-task-desc">Follow-up · ${timeStr}</div>
          </div>
          <div class="today-task-right">
            <span class="today-task-status" style="color:${status.color};">${status.label}</span>
            <button class="btn-sm task-mark-done-btn" data-id="${candidate.id}" style="display:${showMarkDone ? 'inline-block' : 'none'};width:auto;padding:4px 10px;font-size:12px;background:#10b981;">✓ Mark Done</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.task-mark-done-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const candidateId = parseInt(btn.dataset.id);
        await doMarkFollowupDone(candidateId, () => {
          renderOverviewTodayTasks();
        });
      });
    });
  }
  console.log(`[PLUGIN_INIT] renderOverviewTodayTasks END 耗时=${(performance.now() - start).toFixed(1)}ms`);
}

// Overview events
$('ovTodayHeader').addEventListener('click', () => {
  const content = $('ovTodayContent');
  const isExpanded = !content.classList.contains('hidden');
  content.classList.toggle('hidden');
  const countEl = $('ovTodayCount');
  countEl.textContent = countEl.textContent.replace(isExpanded ? '▲' : '▼', isExpanded ? '▼' : '▲');
});

$('ovOverdueBanner').addEventListener('click', () => {
  const content = $('ovTodayContent');
  content.classList.remove('hidden');
  const countEl = $('ovTodayCount');
  if (countEl.textContent.includes('▼')) {
    countEl.textContent = countEl.textContent.replace('▼', '▲');
  }
  $('ovTodayCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('ovTodayViewAll').addEventListener('click', (e) => {
  e.preventDefault();
  // Switch to Sequence tab and Today's Tasks sub-tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.nav-tab[data-tab="sequence"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  $('tab-sequence').classList.add('active');
  currentTab = 'sequence';

  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.sub-tab[data-subtab="today"]').classList.add('active');
  currentSequenceSubTab = 'today';
  document.querySelectorAll('.sub-content').forEach(c => {
    c.classList.toggle('hidden', !c.id.includes('today'));
  });
  renderTodayTasks();
});

$('ovTemperature').addEventListener('change', () => {
  if (currentCandidate) {
    currentCandidate.temperature = $('ovTemperature').value;
    saveDraft(currentCandidate);
  }
});

$('ovModeRecruiting').addEventListener('click', () => {
  if (currentCandidate) currentCandidate.contactMode = 'recruiting';
  $('ovModeRecruiting').classList.add('active');
  $('ovModeNurture').classList.remove('active');
});

$('ovModeNurture').addEventListener('click', () => {
  if (currentCandidate) currentCandidate.contactMode = 'nurture';
  $('ovModeNurture').classList.add('active');
  $('ovModeRecruiting').classList.remove('active');
});

$('ovKeyMemory').addEventListener('input', () => {
  if (currentCandidate) {
    currentCandidate.keyMemory = $('ovKeyMemory').value;
    saveDraft(currentCandidate);
  }
});

// ovNextFollowupInput 的事件由自定义 DateTime Picker 处理，见文件底部

$('ovVoiceMemoTextarea').addEventListener('input', () => {
  if (currentCandidate) {
    currentCandidate.voiceMemo = $('ovVoiceMemoTextarea').value;
    saveDraft(currentCandidate);
  }
});

$('ovSaveBtn').addEventListener('click', async () => {
  if (isSavingCandidate) {
    showToast('Saving in progress, please wait...');
    return;
  }
  if (!currentCandidate) {
    showToast('No candidate data to save');
    return;
  }
  const canSave = await checkCandidateLimit();
  if (!canSave) return;
  isSavingCandidate = true;
  showLoading();
  const savePerfStart = performance.now();
  const perfLabel = '[SCRM_SAVE_PERF]';
  console.log(`${perfLabel} SAVE_START id=${currentCandidate.id || 'new'} mode=${currentCandidate.id ? 'UPDATE' : 'CREATE'}`);
  try {
    let saved;
    if (currentCandidate.id) {
      console.log(`${perfLabel} UPDATE_API_START id=${currentCandidate.id}`);
      const updateStart = performance.now();
      saved = await window.API.candidates.update(currentCandidate.id, currentCandidate);
      console.log(`${perfLabel} UPDATE_API_END duration=${(performance.now() - updateStart).toFixed(1)}ms`);
    } else {
      console.log(`${perfLabel} CREATE_API_START`);
      const createStart = performance.now();
      currentCandidate.source = 'linkedin_profile';
      saved = await window.API.candidates.create(currentCandidate);
      console.log(`${perfLabel} CREATE_API_END duration=${(performance.now() - createStart).toFixed(1)}ms`);
      if (saved) {
        currentCandidate.id = saved.id;
      }
    }
    // Sync sequence binding if needed (backend auto-records history)
    if (currentCandidate.sequenceId && currentCandidate.id) {
      try {
        console.log(`${perfLabel} BIND_SEQ_START seqId=${currentCandidate.sequenceId}`);
        const bindStart = performance.now();
        await bindCandidateToSequence(currentCandidate.id, currentCandidate.sequenceId);
        console.log(`${perfLabel} BIND_SEQ_END duration=${(performance.now() - bindStart).toFixed(1)}ms`);
      } catch (e) {
        console.warn('[Save] Sequence binding failed:', e.message);
      }
    }
    clearDraft(currentCandidate);
    showToast('Saved & tracked!');
    trackEvent('candidate_saved', { category: 'engagement', label: 'overview' });

    console.log(`${perfLabel} RENDER_OVERVIEW_START`);
    const renderOvStart = performance.now();
    await renderOverviewNextFollowup();
    await renderOverviewActiveSequence();
    console.log(`${perfLabel} RENDER_OVERVIEW_END duration=${(performance.now() - renderOvStart).toFixed(1)}ms`);

    // Switch to pipeline tab after saving
    console.log(`${perfLabel} SWITCH_TAB_START`);
    const tabStart = performance.now();
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.nav-tab[data-tab="pipeline"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    $('tab-pipeline').classList.add('active');
    currentTab = 'pipeline';
    renderPipeline();
    // Scroll popup to top after switching to pipeline
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    console.log(`${perfLabel} SWITCH_TAB_END duration=${(performance.now() - tabStart).toFixed(1)}ms`);
  } catch (e) {
    console.error(`${perfLabel} SAVE_FAILED`, e);
    const handled = await handleQuotaError(e);
    if (!handled) showToast('Save failed: ' + e.message);
  } finally {
    isSavingCandidate = false;
    hideLoading();
    console.log(`${perfLabel} SAVE_TOTAL duration=${(performance.now() - savePerfStart).toFixed(1)}ms`);
  }
  trackEvent('plugin_opened', { category: 'engagement' });
});

// Voice memo recording via content script (for microphone permission popup)
// recordingState: 'idle' | 'starting' | 'recording' | 'stopping'
let recordingState = 'idle';
let recordingTimeout = null;
let preRecordText = ''; // 录音前 textarea 的内容快照

const toggleRecording = async () => {
  console.log('[SCRM Popup] Toggle clicked, current state:', recordingState);
  if (recordingState === 'starting' || recordingState === 'stopping') {
    console.log('[SCRM Popup] Ignoring click, still processing');
    return;
  }
  if (recordingState === 'recording') {
    await stopRecording();
  } else {
    await startRecording();
  }
};

const startRecording = async () => {
  // 1. 先检查浏览器支持
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Your browser does not support voice input. Please type notes manually.');
    return;
  }

  recordingState = 'starting';
  console.log('[SCRM Popup] Starting recording...');

  // 2. 通过内容脚本请求麦克风权限并录音（浏览器会在页面弹出原生权限框）
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'startVoiceRecording' });
      console.log('[SCRM Popup] Content script acknowledged start');
      // 成功确认后才进入 recording 状态并更新 UI
      recordingState = 'recording';
      preRecordText = $('ovVoiceMemoTextarea').value;
      $('ovVoiceMemoBtn').classList.add('recording');
      $('ovVoiceMemoBtn').textContent = '🔴 Recording... (click to stop)';
      $('ovVoiceMemoStatus').textContent = 'Listening...';
      $('ovVoiceMemoStatus').classList.remove('hidden');

      // 安全超时：最多录 60 秒自动停止
      if (recordingTimeout) clearTimeout(recordingTimeout);
      recordingTimeout = setTimeout(() => {
        if (recordingState === 'recording') {
          console.log('[SCRM Popup] Auto-stop after 60s');
          stopRecording();
        }
      }, 60000);
      return;
    }
  } catch (e) {
    console.log('[SCRM Popup] Start recording via content script error', e);
  }

  // 3. Fallback: 尝试在 popup 中直接录音
  recordingState = 'recording';
  preRecordText = $('ovVoiceMemoTextarea').value;
  $('ovVoiceMemoBtn').classList.add('recording');
  $('ovVoiceMemoBtn').textContent = '🔴 Recording... (click to stop)';
  $('ovVoiceMemoStatus').textContent = 'Listening...';
  $('ovVoiceMemoStatus').classList.remove('hidden');
  startRecordingInPopup();
};

const stopRecording = async () => {
  if (recordingState !== 'recording') {
    console.log('[SCRM Popup] Cannot stop, not recording. State:', recordingState);
    return;
  }
  recordingState = 'stopping';
  console.log('[SCRM Popup] Stopping recording...');
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }
  $('ovVoiceMemoBtn').classList.remove('recording');
  $('ovVoiceMemoBtn').textContent = 'Processing...';
  $('ovVoiceMemoStatus').textContent = 'Processing...';
  $('ovVoiceMemoStatus').classList.remove('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: 'stopVoiceRecording' });
      console.log('[SCRM Popup] Content script acknowledged stop');
      return;
    }
  } catch (e) {
    console.log('[SCRM Popup] Stop recording via content script error', e);
  }

  // fallback
  if (recognition) {
    try { recognition.stop(); } catch (e2) {}
  }
};

// Fallback: 在 popup 中直接录音（部分浏览器支持）
let recognition = null;
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const textarea = $('ovVoiceMemoTextarea');
    const current = textarea.value;
    textarea.value = current ? current + '\n' + transcript : transcript;
    if (currentCandidate) currentCandidate.voiceMemo = textarea.value;
    showToast('Voice memo saved');
  };
  rec.onerror = (event) => {
    console.log('[SCRM Popup] Fallback speech recognition error:', event.error);
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    if (event.error === 'not-allowed') {
      $('ovVoiceMemoStatus').textContent = 'Microphone access denied. Please allow permission in browser settings, or type notes manually.';
    } else if (event.error === 'no-speech') {
      $('ovVoiceMemoStatus').textContent = 'No speech detected. Please try again.';
    } else if (event.error === 'audio-capture') {
      $('ovVoiceMemoStatus').textContent = 'No microphone found. Please check your device.';
    } else if (event.error === 'network') {
      $('ovVoiceMemoStatus').textContent = 'Network error. Please check your connection.';
    } else {
      $('ovVoiceMemoStatus').textContent = 'Speech recognition failed: ' + event.error;
    }
    setTimeout(() => $('ovVoiceMemoStatus').classList.add('hidden'), 3000);
  };
  rec.onend = () => {
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    $('ovVoiceMemoStatus').classList.add('hidden');
  };
  return rec;
}

function startRecordingInPopup() {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) {
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    $('ovVoiceMemoStatus').textContent = 'Speech recognition not available';
    setTimeout(() => $('ovVoiceMemoStatus').classList.add('hidden'), 3000);
    return;
  }
  try {
    recognition.start();
  } catch (e) {
    console.log('[SCRM Popup] Recognition start error', e);
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    $('ovVoiceMemoStatus').textContent = 'Failed to start recording';
    setTimeout(() => $('ovVoiceMemoStatus').classList.add('hidden'), 3000);
  }
}

$('ovVoiceMemoBtn').addEventListener('click', toggleRecording);

// 监听来自 content script 的录音结果
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'voiceRecordingInterim') {
    // 边说边显示：在录音前已有内容的基础上追加实时文字
    if (recordingState === 'recording') {
      const textarea = $('ovVoiceMemoTextarea');
      const live = request.text || '';
      textarea.value = preRecordText ? preRecordText + '\n' + live : live;
    }
  }
  if (request.action === 'voiceRecordingResult') {
    console.log('[SCRM Popup] Received voiceRecordingResult:', request.text);
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    $('ovVoiceMemoStatus').classList.add('hidden');
    const textarea = $('ovVoiceMemoTextarea');
    const final = request.text || '';
    textarea.value = preRecordText ? preRecordText + '\n' + final : final;
    if (currentCandidate) currentCandidate.voiceMemo = textarea.value;
    preRecordText = '';
    if (final) {
      showToast('Voice memo saved');
    } else {
      showToast('No speech detected');
    }
  }
  if (request.action === 'voiceRecordingError') {
    console.log('[SCRM Popup] Received voiceRecordingError:', request.error);
    recordingState = 'idle';
    if (recordingTimeout) { clearTimeout(recordingTimeout); recordingTimeout = null; }
    $('ovVoiceMemoBtn').classList.remove('recording');
    $('ovVoiceMemoBtn').textContent = '🎙 Record';
    preRecordText = '';
    const err = request.error;
    if (err === 'not-allowed') {
      $('ovVoiceMemoStatus').textContent = 'Microphone access denied. Please allow permission in browser settings, or type notes manually.';
    } else if (err === 'no-speech') {
      $('ovVoiceMemoStatus').textContent = 'No speech detected. Please try again.';
    } else if (err === 'audio-capture') {
      $('ovVoiceMemoStatus').textContent = 'No microphone found. Please check your device.';
    } else if (err === 'network') {
      $('ovVoiceMemoStatus').textContent = 'Network error. Please check your connection.';
    } else {
      $('ovVoiceMemoStatus').textContent = 'Speech recognition failed: ' + err;
    }
    setTimeout(() => $('ovVoiceMemoStatus').classList.add('hidden'), 3000);
  }
});

// ========== Pipeline ==========
async function renderPipeline() {
  const boardEl = $('pipelineBoard');
  if (pipelineStages.length === 0) {
    boardEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Loading pipeline...</div>';
    return;
  }

  // Rebuild board columns dynamically based on backend stages
  boardEl.innerHTML = pipelineStages.map(stage => `
    <div class="board-column" data-status="${escapeHtml(stage.id)}" id="column-${stage.id}">
      <div class="board-column-header">${escapeHtml(stage.name)} (<span class="col-count">0</span>)</div>
      <div class="col-cards" id="col-${stage.id}"></div>
    </div>
  `).join('');

  let allCandidates = [];
  try {
    const resp = await window.API.candidates.list({ page: 1, pageSize: 100 });
    if (resp.data && resp.data.items) {
      allCandidates = resp.data.items;
    }
  } catch (e) {
    console.warn('[Pipeline] Failed to fetch candidates:', e.message);
  }
  if (currentFilter !== 'All Roles') {
    allCandidates = allCandidates.filter(c => c.headline === currentFilter);
  }

  const THIRTY_DAYS = 30 * 86400000;
  const now = Date.now();

  for (const stage of pipelineStages) {
    const col = $(`col-${stage.id}`);
    if (!col) continue;

    let stageCandidates = allCandidates.filter(c => {
      const ps = c.pipelineStage || 'new';
      return ps === stage.id;
    });

    // For unclaimed stage, only show candidates updated within 30 days
    let hiddenCount = 0;
    if (stage.id === 'unclaimed') {
      const visible = stageCandidates.filter(c => {
        const updated = c.updatedAt || c.createdAt || 0;
        return (now - updated) <= THIRTY_DAYS;
      });
      hiddenCount = stageCandidates.length - visible.length;
      stageCandidates = visible;
    }

    const count = stageCandidates.length;
    const colEl = col.closest('.board-column');
    if (colEl) colEl.querySelector('.col-count').textContent = count;

    // Hide unclaimed column if empty
    if (stage.id === 'unclaimed' && count === 0) {
      if (colEl) colEl.style.display = 'none';
      continue;
    }

    let cardsHtml = stageCandidates.map(c => renderPipelineCard(c)).join('');

    // Show auto-delete hint at top of unclaimed column
    if (stage.id === 'unclaimed' && count > 0) {
      cardsHtml = `
        <div class="unclaimed-hint">
          Auto-delete after 30 days
        </div>
      ` + cardsHtml;
    }

    // Show hint for hidden unclaimed candidates
    if (stage.id === 'unclaimed' && hiddenCount > 0) {
      cardsHtml += `
        <div style="padding:8px 12px;font-size:12px;color:#9ca3af;text-align:center;border-top:1px dashed #e5e7eb;margin-top:4px;">
          ${hiddenCount} candidate${hiddenCount > 1 ? 's' : ''} hidden (older than 30 days)
        </div>
      `;
    }

    col.innerHTML = cardsHtml;
  }
  bindPipelineDragEvents();
  bindPipelineCardClickEvents();
  bindPipelineDeleteEvents();
  bindPipelineSaveToNewEvents();
}

function renderPipelineCard(candidate) {
  const color = getAvatarColor(candidate.name);
  const linkedInLink = candidate.linkedInUrl ? `<a href="${escapeHtml(candidate.linkedInUrl)}" target="_blank" style="margin-left:4px;color:#0077b5;text-decoration:none;font-size:12px;" title="Open LinkedIn">&#128279;</a>` : '';
  const saveToNewBtn = (candidate.pipelineStage || 'new') === 'unclaimed'
    ? `<button class="board-card-save-to-new" data-id="${candidate.id}">Save → New</button>`
    : '';
  return `
    <div class="board-card" draggable="true" data-id="${candidate.id}" data-pipeline-stage="${candidate.pipelineStage || 'new'}">
      <div class="board-card-header">
        <div class="board-card-avatar" style="background:${color}">
          ${getInitials(candidate.name)}
          <button class="board-card-delete" data-id="${candidate.id}" title="Delete">×</button>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="board-card-name">${escapeHtml(candidate.name)}${linkedInLink}</div>
          <div class="board-card-title">${escapeHtml(candidate.headline || '')}</div>
        </div>
      </div>
      <div class="board-card-time">${timeAgo(candidate.updatedAt || candidate.createdAt)}</div>
      ${saveToNewBtn}
    </div>
  `;
}

function bindPipelineDragEvents() {
  let draggedId = null;
  document.querySelectorAll('.board-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      isDraggingCard = true;
      draggedId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', async () => {
      card.classList.remove('dragging');
      draggedId = null;
      setTimeout(() => { isDraggingCard = false; }, 100);
      await renderPipeline();
    });
  });

  document.querySelectorAll('.board-column').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const candidateId = draggedId;
      if (!candidateId) return;
      const newStage = col.dataset.status;
      try {
        const candidate = await window.API.candidates.get(candidateId);
        if (candidate && (candidate.pipelineStage || 'new') !== newStage) {
          const oldStage = candidate.pipelineStage || 'new';
          await window.API.candidates.updatePipelineStage(candidateId, newStage);
          trackEvent('pipeline_moved', { category: 'engagement', label: `${oldStage}_to_${newStage}` });
          renderPipeline();
        }
      } catch (e) {
        console.warn('[Pipeline] Move failed:', e.message);
      }
    });
  });
}

function bindPipelineCardClickEvents() {
  document.querySelectorAll('.board-card').forEach(card => {
    card.addEventListener('click', () => {
      if (isDraggingCard) return;
      const candidateId = parseInt(card.dataset.id);
      if (candidateId) {
        openManualEntryModal(candidateId);
      }
    });
  });
}

function bindPipelineDeleteEvents() {
  document.querySelectorAll('.board-card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidateId = parseInt(btn.dataset.id);
      try {
        const candidate = await window.API.candidates.get(candidateId);
        if (!candidate) return;
        const confirmed = await showConfirm(`Are you sure you want to delete "${candidate.name}"?`);
        if (confirmed) {
          showLoading();
          try {
            await window.API.candidates.delete(candidateId, false);
            showToast('Candidate deleted');
            renderPipeline();
            if (currentTab === 'history') renderHistory();
          } catch (err) {
            showToast('Delete failed: ' + err.message);
          } finally {
            hideLoading();
          }
        }
      } catch (e) {
        console.warn('[Pipeline] Delete fetch failed:', e.message);
      }
    });
  });
}

function bindPipelineSaveToNewEvents() {
  document.querySelectorAll('.board-card-save-to-new').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidateId = parseInt(btn.dataset.id);
      try {
        const candidate = await window.API.candidates.get(candidateId);
        if (!candidate) return;
        showLoading();
        try {
          await window.API.candidates.updatePipelineStage(candidateId, 'new');
          trackEvent('candidate_promoted', { category: 'conversion', label: 'unclaimed_to_new' });
          showToast('Candidate saved to New');
          renderPipeline();
          if (currentTab === 'history') renderHistory();
        } catch (err) {
          showToast('Save failed: ' + err.message);
        } finally {
          hideLoading();
        }
      } catch (e) {
        console.warn('[Pipeline] Promote fetch failed:', e.message);
      }
    });
  });
}

// Confirm Modal
let confirmResolve = null;

function showConfirm(message) {
  $('modalConfirmMessage').textContent = message;
  $('modalConfirm').classList.add('active');
  return new Promise(resolve => {
    confirmResolve = resolve;
  });
}

$('modalConfirmOk').addEventListener('click', () => {
  $('modalConfirm').classList.remove('active');
  if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
});

$('modalConfirmCancel').addEventListener('click', () => {
  $('modalConfirm').classList.remove('active');
  if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
});

$('modalConfirm').addEventListener('click', (e) => {
  if (e.target === $('modalConfirm')) {
    $('modalConfirm').classList.remove('active');
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
  }
});

// ========== Subscription & Usage ==========
let _cachedUsage = null;
let _usageCacheTime = 0;
const USAGE_CACHE_TTL = 60000; // 1 minute

async function getSubscriptionUsage() {
  const now = Date.now();
  if (_cachedUsage && (now - _usageCacheTime) < USAGE_CACHE_TTL) {
    return _cachedUsage;
  }
  if (typeof window === 'undefined' || !window.API) return null;
  try {
    const resp = await window.API.subscription.current();
    _cachedUsage = resp.data;
    _usageCacheTime = now;
    return _cachedUsage;
  } catch (e) {
    console.warn('[Popup] Failed to fetch subscription usage:', e.message);
    return null;
  }
}

function invalidateUsageCache() {
  _cachedUsage = null;
  _usageCacheTime = 0;
}

let upgradeResolve = null;
let _cachedPlans = null;

async function fetchPlans() {
  if (_cachedPlans) return _cachedPlans;
  try {
    const resp = await window.API.subscription.listPlans();
    if (resp.data && resp.data.items) {
      _cachedPlans = resp.data.items;
      return _cachedPlans;
    }
  } catch (e) {
    console.warn('[Popup] Failed to fetch plans:', e.message);
  }
  return [];
}

function formatLimit(value, type) {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (num >= 999999) {
    if (type === 'candidates') return 'Unlimited cand.';
    return 'Unlimited';
  }
  if (type === 'candidates') return num + ' cand.';
  if (type === 'ai') return num + ' AI/day';
  if (type === 'sequences') return num + ' Sequence' + (num > 1 ? 's' : '');
  return String(value);
}

function renderPlanCard(plan, options) {
  const isFree = plan.planCode === 'free';
  const isCurrent = options.isCurrent;
  const highlightType = options.highlight;
  const cls = 'plan-card ' + (isCurrent ? 'current' : 'pro');

  const candidates = formatLimit(plan.totalCandidateLimit, 'candidates');
  const ai = formatLimit(plan.dailyConnectLimit, 'ai');
  const seq = formatLimit(plan.sequenceLimit, 'sequences');

  const items = [
    { key: 'candidates', text: '• ' + candidates },
    { key: 'ai', text: '• ' + ai },
    { key: 'sequences', text: '• ' + seq }
  ];
  if (!isFree) {
    items.push({ key: 'sync', text: '• Cross-device sync' });
  }

  const listHtml = items.map(it => {
    const hl = !isFree && it.key === highlightType ? 'highlight' : '';
    return `<li class="${hl}">${escapeHtml(it.text)}</li>`;
  }).join('');

  let actionHtml = '';
  if (isCurrent) {
    actionHtml = `<div class="plan-badge">Current</div>`;
  } else {
    const price = plan.price > 0 ? `$${plan.price}/${plan.billingCycle === 'yearly' ? 'yr' : 'mo'}` : '';
    actionHtml = `<div class="plan-price">${escapeHtml(price || '')}</div>
      <button class="btn-upgrade" data-plan-code="${escapeHtml(plan.planCode)}">Upgrade</button>`;
  }

  return `<div class="${cls}">
    <div class="plan-card-title">${escapeHtml(plan.name)}</div>
    <ul>${listHtml}</ul>
    ${actionHtml}
  </div>`;
}

async function showUpgradeModal(config) {
  trackEvent('upgrade_prompt_shown', { category: 'conversion', label: config.scenario || '' });

  const plans = await fetchPlans();
  const usage = await getSubscriptionUsage();
  const currentPlanCode = (usage && usage.subscription && usage.subscription.plan && usage.subscription.plan.planCode) || 'free';

  const headerEl = $('modalUpgradeHeader');
  const plansEl = $('modalUpgradePlans');

  let headerText = config.header || "You've reached your daily limit";
  if (config.scenario === 'ai') {
    const used = config.used || 0;
    const limit = config.limit || 10;
    headerText = `You've used ${used}/${limit} AI messages today`;
  } else if (config.scenario === 'candidate') {
    const used = config.used || 0;
    const limit = config.limit || 20;
    headerText = `Your pipeline is full (${used}/${limit})`;
  } else if (config.scenario === 'sequence') {
    const used = config.used || 0;
    const limit = config.limit || 1;
    headerText = `Sequence limit reached (${used}/${limit})`;
  }
  headerEl.textContent = headerText;

  const highlight = config.scenario === 'ai' ? 'ai' : config.scenario === 'candidate' ? 'candidates' : config.scenario === 'sequence' ? 'sequences' : '';

  const sorted = [...plans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const cardsHtml = sorted.map(p => renderPlanCard(p, {
    isCurrent: p.planCode === currentPlanCode,
    highlight: highlight
  })).join('');

  plansEl.innerHTML = cardsHtml;

  // Bind upgrade buttons
  plansEl.querySelectorAll('.btn-upgrade').forEach(btn => {
    btn.onclick = async () => {
      const planCode = btn.dataset.planCode;
      trackEvent('upgrade_clicked', { category: 'conversion', label: planCode });
      $('modalUpgrade').classList.remove('active');
      try {
        const successUrl = chrome.runtime.getURL('popup.html') + '?checkout=success';
        const cancelUrl = chrome.runtime.getURL('popup.html') + '?checkout=cancel';
        const resp = await window.API.subscription.checkout(planCode, successUrl, cancelUrl, '');
        if (resp.data && resp.data.checkout_url) {
          chrome.tabs.create({ url: resp.data.checkout_url });
        }
      } catch (e) {
        showToast('Checkout failed: ' + e.message);
      }
      if (upgradeResolve) { upgradeResolve(true); upgradeResolve = null; }
    };
  });

  $('modalUpgrade').classList.add('active');
  return new Promise(resolve => {
    upgradeResolve = resolve;
  });
}

$('modalUpgradeClose').addEventListener('click', () => {
  $('modalUpgrade').classList.remove('active');
  if (upgradeResolve) { upgradeResolve(false); upgradeResolve = null; }
});

$('modalUpgrade').addEventListener('click', (e) => {
  if (e.target === $('modalUpgrade')) {
    $('modalUpgrade').classList.remove('active');
    if (upgradeResolve) { upgradeResolve(false); upgradeResolve = null; }
  }
});

async function checkCandidateLimit() {
  const usage = await getSubscriptionUsage();
  if (!usage || !usage.usage) return true;
  const candidatesUsed = usage.usage.candidates_used || 0;
  const limit = usage.usage.candidates_limit || 20;
  if (candidatesUsed >= limit) {
    const upgrade = await showUpgradeModal({
      scenario: 'candidate',
      used: candidatesUsed,
      limit: limit
    });
    return upgrade;
  }
  return true;
}

async function checkSequenceLimit() {
  const usage = await getSubscriptionUsage();
  if (!usage || !usage.usage) return true;
  const sequencesUsed = usage.usage.sequences_used || 0;
  const limit = usage.usage.sequences_limit || 1;
  if (sequencesUsed >= limit) {
    const upgrade = await showUpgradeModal({
      scenario: 'sequence',
      used: sequencesUsed,
      limit: limit
    });
    return upgrade;
  }
  return true;
}

async function showAiLimitModal(used, limit) {
  return showUpgradeModal({
    scenario: 'ai',
    used: used,
    limit: limit
  });
}

async function handleQuotaError(err) {
  if (err.status === 429 || (err.data && err.data.scenario)) {
    const scenario = err.data && err.data.scenario ? err.data.scenario : 'ai';
    const used = err.data && err.data.used !== undefined ? err.data.used : 0;
    const limit = err.data && err.data.limit !== undefined ? err.data.limit : 10;
    await showUpgradeModal({ scenario, used, limit });
    return true;
  }
  return false;
}

async function updateFilterDropdown() {
  let candidates = [];
  try {
    const resp = await window.API.candidates.list({ page: 1, pageSize: 100 });
    if (resp.data && resp.data.items) {
      candidates = resp.data.items;
    }
  } catch (e) {
    console.warn('[Filter] Failed to fetch candidates:', e.message);
  }
  const roles = ['All Roles', ...new Set(candidates.map(c => c.headline).filter(Boolean))];
  const dropdown = $('pipelineFilterDropdown');
  dropdown.innerHTML = roles.map(r =>
    `<div class="pipeline-filter-dropdown-item ${r === currentFilter ? 'active' : ''}" data-role="${r}">${r}</div>`
  ).join('');

  dropdown.querySelectorAll('.pipeline-filter-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFilter = item.dataset.role;
      $('pipelineFilterLabel').textContent = currentFilter;
      dropdown.classList.remove('active');
      renderPipeline();
    });
  });
}

$('pipelineFilterBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = $('pipelineFilterDropdown');
  const isActive = dropdown.classList.contains('active');
  if (!isActive) {
    updateFilterDropdown();
  }
  dropdown.classList.toggle('active');
});

document.addEventListener('click', () => {
  $('pipelineFilterDropdown').classList.remove('active');
});

// Add Candidate Modal
$('pipelineAddBtn').addEventListener('click', () => {
  $('modalAddCandidate').classList.add('active');
});

$('btnAddFromLinkedIn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.linkedin.com/' });
  $('modalAddCandidate').classList.remove('active');
});

$('btnManualEntry').addEventListener('click', () => {
  $('modalAddCandidate').classList.remove('active');
  openManualEntryModal();
});

$('btnAddCandidateCancel').addEventListener('click', () => {
  $('modalAddCandidate').classList.remove('active');
});

$('modalAddCandidate').addEventListener('click', (e) => {
  if (e.target === $('modalAddCandidate')) $('modalAddCandidate').classList.remove('active');
});

async function loadSequenceOptions(selectEl, selectedId = '') {
  const sequences = await getAllSequences();
  selectEl.innerHTML = '<option value="">None (manual follow-up only)</option>' +
    sequences.map(s => `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}

async function getSequenceById(id) {
  if (!id) return null;
  try {
    return await window.API.sequences.get(id);
  } catch (e) {
    return null;
  }
}

async function bindCandidateToSequence(candidateId, sequenceId) {
  console.log('[BIND_SEQ] START candidateId=', candidateId, 'sequenceId=', sequenceId);
  console.log('[BIND_SEQ] currentCandidate.sequenceId before=', currentCandidate ? currentCandidate.sequenceId : 'N/A');

  // Ensure candidate is saved to backend first
  if (!candidateId && currentCandidate) {
    console.log('[BIND_SEQ] candidateId empty, creating candidate on backend...');
    const canSave = await checkCandidateLimit();
    if (!canSave) return;
    try {
      currentCandidate.source = 'linkedin_profile';
      const created = await window.API.candidates.create(currentCandidate);
      if (created && created.id) {
        candidateId = created.id;
        currentCandidate.id = candidateId;
      }
      console.log('[BIND_SEQ] created candidateId=', candidateId);
    } catch (e) {
      console.error('[BIND_SEQ] create candidate failed:', e);
      return;
    }
  }

  let candidate = null;
  if (candidateId) {
    try {
      candidate = await window.API.candidates.get(candidateId);
    } catch (e) {
      console.warn('[BIND_SEQ] get candidate from API failed:', e);
    }
  }
  console.log('[BIND_SEQ] candidate=', candidate ? { id: candidate.id, name: candidate.name } : null);

  if (!sequenceId) {
    console.log('[BIND_SEQ] sequenceId empty, unbinding');
    if (candidate && candidate.id) {
      try {
        const resp = await window.API.sequences.listCandidateSequences({ candidate_id: candidate.id });
        if (resp.data && resp.data.items) {
          for (const cs of resp.data.items) {
            if (cs.id) {
              await window.API.sequences.deleteCandidateSequence(cs.id);
            }
          }
        }
        if (currentCandidate) currentCandidate.sequenceId = null;
      } catch (e) {
        console.warn('[BIND_SEQ] unbind sequence failed:', e);
      }
    }
    return;
  }

  const seq = await getSequenceById(sequenceId);
  console.log('[BIND_SEQ] seq=', seq ? { id: seq.id, name: seq.name, stepsLength: seq.steps ? seq.steps.length : 'NO_STEPS' } : null);
  if (!seq || !seq.steps || seq.steps.length === 0) {
    console.warn('[BIND_SEQ] ABORT: seq missing or no steps');
    return;
  }

  // Sync candidate-sequence binding to backend
  if (typeof window !== 'undefined' && window.API) {
    try {
      console.log('[BIND_SEQ] syncing to backend...');

      const candidateIdForSeq = candidate ? candidate.id : null;
      const sequenceIdForSeq = seq.id;
      console.log('[BIND_SEQ] candidateIdForSeq=', candidateIdForSeq, 'sequenceIdForSeq=', sequenceIdForSeq);
      if (candidateIdForSeq && sequenceIdForSeq) {
        console.log('[BIND_SEQ] calling createCandidateSequence...');
        const csResult = await window.API.sequences.createCandidateSequence(
          candidateIdForSeq,
          sequenceIdForSeq,
          { stepIndex: 0, totalSteps: seq.steps.length, status: 'active' }
        );
        console.log('[BIND_SEQ] createCandidateSequence success, rebound=', csResult ? csResult.rebound : 'N/A');
        trackEvent('sequence_bound', { category: 'engagement', label: 'sequence_' + sequenceId });

        // Prompt user to confirm the suggested follow-up time only on first bind or rebound
        if (csResult && csResult.rebound !== false && seq.steps.length >= 2 && candidate) {
          const nextStep = seq.steps[1]; // step 2
          const suggestedTime = Date.now() + nextStep.delayDays * 86400000;
          const suggestedDate = new Date(suggestedTime);
          const dateStr = suggestedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const dayLabel = nextStep.delayDays > 0 ? `(${nextStep.delayDays} day${nextStep.delayDays > 1 ? 's' : ''} later)` : '(immediately)';

          // Hide loading overlay so the modal is clickable
          hideLoading();
          const choice = await showSeqFollowupConfirm(`Sequence suggests follow-up:<br><strong>${dateStr}</strong> ${dayLabel}`);
          if (choice && choice.accepted) {
            showLoading();
            const followupTime = choice.time ? choice.time.getTime() : suggestedTime;
            const source = choice.edited ? 'manual' : 'sequence';
            if (candidate.id) {
              try {
                await window.API.candidates.updateFollowup(
                  candidate.id,
                  new Date(followupTime),
                  source,
                  source === 'sequence' ? nextStep.stepNumber : null
                );
                renderOverviewNextFollowup();
              } catch (e) {
                console.warn('[BIND_SEQ] update followup failed:', e);
              } finally {
                hideLoading();
              }
            } else {
              hideLoading();
            }
          }
        }
      } else {
        console.warn('[BIND_SEQ] SKIP backend sync: missing id', { candidateIdForSeq, sequenceIdForSeq });
      }
    } catch (e) {
      console.warn('[BIND_SEQ] Sync candidate-sequence to backend failed:', e);
    }
  } else {
    console.warn('[BIND_SEQ] window.API not available');
  }

  console.log('[BIND_SEQ] END');
}

// Manual Entry Modal
function openManualEntryModal(candidateId = null) {
  manualEntryCandidateId = candidateId;
  // Populate status dropdown from backend pipeline stages
  const statusSelect = $('meStatus');
  if (pipelineStages.length > 0) {
    statusSelect.innerHTML = pipelineStages.map(s =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
    ).join('');
  }
  if (candidateId) {
    window.API.candidates.get(candidateId).then(async candidate => {
      if (!candidate) return;
      $('meName').value = candidate.name || '';
      $('meHeadline').value = candidate.headline || '';
      $('meCompany').value = candidate.company || '';
      $('meLocation').value = candidate.location || '';
      $('meLinkedInUrl').value = candidate.linkedInUrl || '';
      $('meEmail').value = candidate.emails?.[0] || '';
      $('meStatus').value = candidate.pipelineStage || (pipelineStages[0]?.id || 'new');
      if (candidate.nextFollowup) {
        $('meNextFollowup').value = fmtDateTimeInput(new Date(candidate.nextFollowup));
      } else {
        $('meNextFollowup').value = '';
      }
      $('meNotes').value = candidate.keyMemory || '';
      const temp = candidate.temperature || 'Warm';
      document.querySelectorAll('.temp-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.temp === temp);
      });
      // Load current bound sequence
      await loadSequenceOptions($('meSequence'), candidate.sequenceId || '');
      $('modalManualEntry').classList.add('active');
    }).catch(e => {
      console.warn('[MANUAL_ENTRY] load candidate failed:', e);
      showToast('Failed to load candidate');
    });
  } else {
    $('meName').value = '';
    $('meHeadline').value = '';
    $('meCompany').value = '';
    $('meLocation').value = '';
    $('meLinkedInUrl').value = '';
    $('meEmail').value = '';
    $('meStatus').value = 'new';
    $('meNextFollowup').value = '';
    $('meNotes').value = '';
    document.querySelectorAll('.temp-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.temp === 'Warm');
    });
    loadSequenceOptions($('meSequence'), '');
    $('modalManualEntry').classList.add('active');
  }
}

function closeManualEntryModal() {
  $('modalManualEntry').classList.remove('active');
  manualEntryCandidateId = null;
}

document.querySelectorAll('.temp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.temp-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

$('meSaveBtn').addEventListener('click', async () => {
  const name = $('meName').value.trim();
  if (!name) {
    showToast('Full Name is required');
    return;
  }

  const temperature = document.querySelector('.temp-btn.active')?.dataset.temp || 'Warm';

  showLoading();
  try {
    let candidate;
    if (manualEntryCandidateId) {
      try {
        candidate = await window.API.candidates.get(manualEntryCandidateId);
      } catch (e) {
        candidate = null;
      }
      if (!candidate) {
        showToast('Candidate not found');
        hideLoading();
        return;
      }
    } else {
      candidate = {
        linkedInId: '',
        school: '',
        summary: '',
        skills: [],
        workExperiences: [],
        educationExperiences: [],
        websites: [],
        phones: [],
        contactMode: 'recruiting',
        nextFollowup: '',
        voiceMemo: '',
        createdAt: Date.now()
      };
    }

    candidate.name = name;
    candidate.headline = $('meHeadline').value.trim();
    candidate.company = $('meCompany').value.trim();
    candidate.location = $('meLocation').value.trim();
    candidate.linkedInUrl = $('meLinkedInUrl').value.trim();
    candidate.emails = $('meEmail').value.trim() ? [$('meEmail').value.trim()] : [];
    candidate.temperature = temperature;
    candidate.pipelineStage = $('meStatus').value;
    const nextFollowupVal = $('meNextFollowup').value;
    candidate.nextFollowup = nextFollowupVal ? new Date(nextFollowupVal).getTime() : '';
    candidate.keyMemory = $('meNotes').value.trim();

    const canSave = await checkCandidateLimit();
    if (!canSave) { hideLoading(); return; }
    isSavingCandidate = true;

    let savedId;
    try {
      if (manualEntryCandidateId) {
        await window.API.candidates.update(manualEntryCandidateId, candidate);
        savedId = manualEntryCandidateId;
      } else {
        candidate.source = 'manual_entry';
        const created = await window.API.candidates.create(candidate);
        savedId = created?.id;
      }
    } catch (e) {
      isSavingCandidate = false;
      hideLoading();
      const handled = await handleQuotaError(e);
      if (!handled) showToast('Save failed: ' + e.message);
      return;
    }

    // Handle sequence binding
    const sequenceId = $('meSequence').value;
    if (sequenceId) {
      await bindCandidateToSequence(savedId, sequenceId);
    }

    showToast(manualEntryCandidateId ? 'Candidate updated!' : 'Candidate added!');
    trackEvent('candidate_saved', { category: 'engagement', label: 'manual_entry' });
    closeManualEntryModal();
    if (currentTab === 'pipeline') renderPipeline();
    if (currentTab === 'history') renderHistory();
  } catch (e) {
    const handled = await handleQuotaError(e);
    if (!handled) showToast('Save failed: ' + e.message);
  } finally {
    isSavingCandidate = false;
    hideLoading();
  }
});

$('meCancelBtn').addEventListener('click', closeManualEntryModal);

$('modalManualEntry').addEventListener('click', (e) => {
  if (e.target === $('modalManualEntry')) closeManualEntryModal();
});

// ========== Sequence ==========
async function renderSequence() {
  if (currentSequenceSubTab === 'templates') renderSequenceTemplates();
  else renderTodayTasks();
}

async function renderSequenceTemplates() {
  const sequences = await getAllSequences();
  const container = $('seqTemplatesList');
  if (sequences.length === 0) {
    container.innerHTML = '<div class="empty-state">No sequences yet. Click + New to create one.</div>';
    return;
  }

  container.innerHTML = '';
  for (const seq of sequences) {
    const totalSteps = seq.steps?.length || 0;

    const stepsHtml = (seq.steps || []).map((step, idx) => {
      return `
        <li>
          <span><span class="seq-step-num">${idx + 1}</span>${escapeHtml(step.name)}</span>
        </li>
      `;
    }).join('');

    const div = document.createElement('div');
    div.className = 'seq-item';
    const isTemplate = seq.isTemplate === true;
    const actionsHtml = isTemplate ? '' : `
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn-sm seq-item-toggle" data-action="edit" data-id="${seq.id}" style="flex:1;background:#fff;color:#5b4cdb;border:1px solid #5b4cdb;">Edit</button>
        <button class="btn-sm seq-item-delete" data-id="${seq.id}" style="flex:1;background:#fff;color:#ef4444;border:1px solid #ef4444;">Delete</button>
      </div>
    `;
    div.innerHTML = `
      <div class="seq-item-header">
        <span class="seq-item-name">${escapeHtml(seq.name)}</span>
        <span class="seq-item-count">${totalSteps} step${totalSteps !== 1 ? 's' : ''}</span>
      </div>
      <ul class="seq-steps">${stepsHtml}</ul>
      ${actionsHtml}
    `;
    container.appendChild(div);
  }

  // Safety tip
  const tip = document.createElement('div');
  tip.className = 'seq-safety-tip';
  tip.textContent = 'LinkedIn safety tip: Limit connection requests to ~20/day to avoid account restrictions.';
  container.appendChild(tip);
}

async function renderTodayTasks() {
  const now = new Date();
  $('todayDate').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let candidates = [];
  let overdueCount = 0;
  try {
    const resp = await window.API.candidates.tasks();
    if (resp.data && resp.data.items) {
      candidates = resp.data.items;
    }
    if (resp.data && typeof resp.data.overdueCount === 'number') {
      overdueCount = resp.data.overdueCount;
    }
  } catch (e) {
    console.warn('[TodayTasks] Failed to fetch:', e.message);
  }

  $('todayTasksTitle').textContent = `Today's Tasks (${candidates.length})`;

  const badge = $('seqTodayBadge');
  if (candidates.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = candidates.length;
    badge.className = 'tab-badge ' + (overdueCount > 0 ? 'badge-red' : 'badge-gray');
  } else {
    badge.classList.add('hidden');
  }

  const container = $('seqTodayList');
  if (candidates.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks for today</div>';
    return;
  }

  container.innerHTML = '';
  for (const candidate of candidates) {
    const status = getTaskStatusConfig(candidate.taskStatus);
    const showMarkDone = candidate.taskStatus === 'OVERDUE' || candidate.taskStatus === 'DUE_SOON';

    const div = document.createElement('div');
    div.className = 'task-item ' + status.borderClass;
    div.innerHTML = `
      <div class="task-avatar" style="background:${getAvatarColor(candidate.name)}">${getInitials(candidate.name)}</div>
      <div class="task-info">
        <div class="task-name">${escapeHtml(candidate.name)}</div>
        <div class="task-desc" style="color:${status.color};font-weight:600;font-size:12px;">${status.label}</div>
        <div class="task-schedule">${candidate.nextFollowup ? new Date(candidate.nextFollowup).toLocaleString() : ''}</div>
      </div>
      <div class="task-right">
        <span class="task-status" style="color:${status.color};">${status.label}</span>
        <button class="btn-sm task-mark-done-btn" data-id="${candidate.id}" style="display:${showMarkDone ? 'block' : 'none'};margin-top:6px;width:auto;padding:4px 10px;font-size:12px;background:#10b981;">✓ Mark Done</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll('.task-mark-done-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const candidateId = parseInt(btn.dataset.id);
      await doMarkFollowupDone(candidateId, () => {
        renderTodayTasks();
      });
    });
  });
}

// New Sequence Modal
const SEQ_DELAY_OPTIONS = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: '1 day later' },
  { value: 3, label: '3 days later' },
  { value: 7, label: '7 days later' },
  { value: 14, label: '14 days later' },
  { value: 30, label: '30 days later' },
  { value: 60, label: '60 days later' }
];

let seqSteps = [{ name: 'Connection Request', delayDays: 0 }];
let editingSequenceId = null;

function renderSeqStepRows() {
  const container = $('modalSeqStepsContainer');
  container.innerHTML = seqSteps.map((step, idx) => {
    const prevDelay = idx > 0 ? seqSteps[idx - 1].delayDays : -1;
    const delayLabel = SEQ_DELAY_OPTIONS.find(o => o.value === step.delayDays)?.label || '';
    const noteHtml = step.delayDays > 0 ? `
      <div class="seq-step-note" style="margin-top:6px;font-size:12px;color:#ef4444;font-weight:500;background:#fef2f2;padding:6px 8px;border-radius:6px;border:1px solid #fecaca;">
        "${escapeHtml(delayLabel)}" means ${step.delayDays} day${step.delayDays > 1 ? 's' : ''} AFTER Step ${idx} is executed, not after binding.
      </div>
    ` : '';
    return `
      <div class="form-row seq-step-row" data-index="${idx}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <label class="form-label" style="margin-bottom:0;">Step ${idx + 1}</label>
          ${idx > 0 ? `<button type="button" class="seq-step-remove" data-index="${idx}" style="background:none;border:none;color:#9ca3af;font-size:12px;cursor:pointer;">Remove</button>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input seq-step-name" placeholder="Step name" value="${escapeHtml(step.name)}" style="flex:1;">
          <select class="form-select seq-step-delay" style="width:140px;flex-shrink:0;">
            ${SEQ_DELAY_OPTIONS.map(opt => {
              return `<option value="${opt.value}" ${opt.value === step.delayDays ? 'selected' : ''}>${opt.label}</option>`;
            }).join('')}
          </select>
        </div>
        ${noteHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.seq-step-name').forEach((input, idx) => {
    input.addEventListener('input', () => { seqSteps[idx].name = input.value; });
  });
  container.querySelectorAll('.seq-step-delay').forEach((select, idx) => {
    select.addEventListener('change', () => {
      seqSteps[idx].delayDays = parseInt(select.value);
      renderSeqStepRows();
    });
  });
  container.querySelectorAll('.seq-step-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      seqSteps.splice(idx, 1);
      renderSeqStepRows();
    });
  });
}

$('btnNewSequence').addEventListener('click', () => {
  editingSequenceId = null;
  $('modalSeqTitle').textContent = 'New Sequence';
  seqSteps = [{ name: 'Connection Request', delayDays: 0 }];
  $('modalSeqName').value = '';
  renderSeqStepRows();
  $('modalNewSequence').classList.add('active');
});

$('modalSeqCancel').addEventListener('click', () => {
  $('modalNewSequence').classList.remove('active');
});

$('modalSeqAddStep').addEventListener('click', () => {
  const lastDelay = seqSteps.length > 0 ? seqSteps[seqSteps.length - 1].delayDays : 0;
  seqSteps.push({ name: '', delayDays: lastDelay });
  renderSeqStepRows();
});

$('modalSeqSave').addEventListener('click', async () => {
  const name = $('modalSeqName').value.trim();
  if (!name) { showToast('Please enter a sequence name'); return; }

  const steps = seqSteps.filter(s => s.name.trim()).map(s => ({
    name: s.name.trim(),
    delayDays: s.delayDays
  }));

  if (steps.length === 0) { showToast('Please enter at least one step'); return; }

  try {
    if (editingSequenceId) {
      await window.API.sequences.update(editingSequenceId, { name, steps });
      showToast('Sequence updated!');
    } else {
      const canCreate = await checkSequenceLimit();
      if (!canCreate) return;
      await window.API.sequences.create({ name, steps });
      showToast('Sequence saved!');
    }
    $('modalNewSequence').classList.remove('active');
    $('modalSeqName').value = '';
    seqSteps = [{ name: 'Connection Request', delayDays: 0 }];
    renderSeqStepRows();
    editingSequenceId = null;
    $('modalSeqTitle').textContent = 'New Sequence';
    renderSequenceTemplates();
  } catch (e) {
    const handled = await handleQuotaError(e);
    if (!handled) showToast('Save failed: ' + e.message);
  }
});

$('modalNewSequence').addEventListener('click', (e) => {
  if (e.target === $('modalNewSequence')) $('modalNewSequence').classList.remove('active');
});

// ========== History ==========
async function getHistoryByCandidate(candidateId) {
  try {
    const resp = await window.API.history.list({ candidateId });
    return resp.data?.items || [];
  } catch (e) {
    console.warn('[getHistoryByCandidate] failed:', e);
    return [];
  }
}

async function renderHistoryContent(candidateId) {
  let candidate = null;
  try {
    candidate = await window.API.candidates.get(candidateId);
  } catch (e) {
    console.warn('[renderHistoryContent] get candidate failed:', e);
    return;
  }
  if (!candidate) return;

  const history = await getHistoryByCandidate(candidateId);
  const messagesCount = history.filter(h => h.type === 'sent' || h.type === 'replied').length;
  const callsCount = history.filter(h => h.type === 'call').length;

  let timelineHtml = '';
  if (history.length === 0) {
    timelineHtml = '<div class="text-gray text-sm text-center" style="padding:20px">No history yet</div>';
  } else {
    timelineHtml = '<div class="timeline">' +
      history.map(h => {
        const labelMap = { sent: 'You sent', replied: `${candidate.name} replied`, call: 'Phone call', status_change: 'Status change', note: 'Note' };
        const label = labelMap[h.type] || h.type;
        return `
          <div class="timeline-item">
            <div class="timeline-dot ${h.type}"></div>
            <div class="timeline-header">
              <span class="timeline-date">${formatDate(h.date)}</span>
              <span class="timeline-time">${formatTime(h.date)}</span>
            </div>
            <div class="timeline-label ${h.type}">${escapeHtml(label)}</div>
            <div class="timeline-content">${escapeHtml(h.content)}</div>
            ${h.subtype ? `<div class="timeline-subtype">${escapeHtml(h.subtype)}</div>` : ''}
          </div>
        `;
      }).join('') +
      '</div>';
  }

  $('historyContent').innerHTML = `
    <div class="history-candidate-header">
      <div class="history-candidate-avatar" style="background:${getAvatarColor(candidate.name)}">${getInitials(candidate.name)}</div>
      <div class="history-candidate-info">
        <div class="history-candidate-name">${escapeHtml(candidate.name)}</div>
        <div class="history-candidate-meta">${escapeHtml(candidate.headline || '')} · ${escapeHtml(candidate.company || '')} · ${messagesCount} message${messagesCount !== 1 ? 's' : ''} · ${callsCount} call${callsCount !== 1 ? 's' : ''}</div>
      </div>
    </div>
    ${timelineHtml}
    <div class="footer-hint">Scroll to load more history</div>
  `;
}

async function renderHistory() {
  let candidates = [];
  try {
    const resp = await window.API.candidates.list({ page: 1, pageSize: 100 });
    if (resp.data && resp.data.items) {
      candidates = resp.data.items;
    }
  } catch (e) {
    console.warn('[History] Failed to fetch candidates:', e.message);
  }
  const select = $('historyCandidateSelect');
  select.innerHTML = '<option value="">Select a candidate...</option>' +
    candidates.map(c => `<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.headline || '')}</option>`).join('');

  // Auto-select current candidate if available and has an id
  if (currentCandidate && currentCandidate.id) {
    select.value = currentCandidate.id;
    await renderHistoryContent(currentCandidate.id);
  } else {
    $('historyContent').innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <div>Select a candidate to view history</div>
      </div>`;
  }
}

$('historyCandidateSelect').addEventListener('change', async () => {
  const candidateId = parseInt($('historyCandidateSelect').value);
  if (!candidateId) {
    $('historyContent').innerHTML = `
      <div class="empty-state">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <div>Select a candidate to view history</div>
      </div>`;
    return;
  }
  await renderHistoryContent(candidateId);
});

// ========== Content Script Communication ==========
async function sendMessageToContentScript(tabId, message, maxRetries = 2) {
  console.log(`[PLUGIN_INIT] sendMessageToContentScript START action=${message.action}`);
  const start = performance.now();
  return new Promise((resolve, reject) => {
    let retries = 0;
    const trySend = () => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          if (retries < maxRetries) {
            retries++;
            console.log(`[PLUGIN_INIT] sendMessageToContentScript retry ${retries}/${maxRetries}`);
            chrome.scripting.executeScript({
              target: { tabId }, files: ['content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                console.warn(`[PLUGIN_INIT] sendMessageToContentScript FAILED 耗时=${(performance.now() - start).toFixed(1)}ms`, chrome.runtime.lastError.message);
                reject(new Error('Unable to inject content script'));
                return;
              }
              setTimeout(trySend, 500);
            });
          } else {
            console.warn(`[PLUGIN_INIT] sendMessageToContentScript FAILED 耗时=${(performance.now() - start).toFixed(1)}ms`);
            reject(new Error('Content script not responding'));
          }
        } else {
          console.log(`[PLUGIN_INIT] sendMessageToContentScript END 耗时=${(performance.now() - start).toFixed(1)}ms`);
          resolve(response);
        }
      });
    };
    trySend();
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}



// ========== Init Backend Data ==========
const PIPELINE_CACHE_KEY = 'cachedPipelineStages';
const PIPELINE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function loadPipelineStagesFromCache() {
  try {
    const cached = await getSetting(PIPELINE_CACHE_KEY, null);
    if (cached && cached.stages && cached.ts && (Date.now() - cached.ts) < PIPELINE_CACHE_TTL_MS) {
      pipelineStages = cached.stages;
      console.log('[PLUGIN_INIT] pipeline stages loaded from cache, count=' + pipelineStages.length);
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

async function initBackendData() {
  console.log('[PLUGIN_INIT] initBackendData START');
  const start = performance.now();
  if (typeof window === 'undefined' || !window.API) {
    console.log(`[PLUGIN_INIT] initBackendData END (skipped, no API) 耗时=${(performance.now() - start).toFixed(1)}ms`);
    return;
  }

  // 1. Try cache first — pipeline stages are hardcoded enum, never change
  const hadCache = await loadPipelineStagesFromCache();
  if (hadCache) {
    console.log(`[PLUGIN_INIT] initBackendData END (cache hit, no network) 耗时=${(performance.now() - start).toFixed(1)}ms`);
    return;
  }

  // 2. No cache: fetch from backend and save
  try {
    const stagesResp = await window.API.pipeline.listStages();
    if (stagesResp.data && stagesResp.data.items) {
      pipelineStages = stagesResp.data.items.map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder
      })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      await setSetting(PIPELINE_CACHE_KEY, { stages: pipelineStages, ts: Date.now() });
    }
  } catch (e) {
    console.warn('[Popup] Init backend data failed:', e.message);
  }

  console.log(`[PLUGIN_INIT] initBackendData END 耗时=${(performance.now() - start).toFixed(1)}ms`);
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[PLUGIN_INIT] ===== 插件初始化开始 =====');
  const totalStart = performance.now();
  showLoading();

  // Sequence list edit / delete handler (event delegation)
  $('seqTemplatesList').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.seq-item-delete');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (!id || !confirm('Are you sure you want to delete this sequence?')) return;
      try {
        await window.API.sequences.delete(id);
        showToast('Sequence deleted');
        renderSequenceTemplates();
      } catch (err) {
        showToast('Delete failed: ' + (err.message || 'Unknown error'));
      }
      return;
    }

    const editBtn = e.target.closest('.seq-item-toggle[data-action="edit"]');
    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const seq = await window.API.sequences.get(id);
        editingSequenceId = id;
        $('modalSeqTitle').textContent = 'Edit Sequence';
        $('modalSeqName').value = seq.name || '';
        seqSteps = (seq.steps || []).map(s => ({
          name: s.name || '',
          delayDays: s.delayDays || 0
        }));
        if (seqSteps.length === 0) {
          seqSteps = [{ name: 'Connection Request', delayDays: 0 }];
        }
        renderSeqStepRows();
        $('modalNewSequence').classList.add('active');
      } catch (err) {
        showToast('Failed to load sequence: ' + (err.message || 'Unknown error'));
      }
    }
  });

  try {
    await ensureUserId();

    // Determine if on LinkedIn profile page and get linkedInId
    let linkedInId = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('linkedin.com/in/')) {
        const response = await sendMessageToContentScript(tab.id, { action: 'scrape' });
        if (response && response.success && response.data) {
          linkedInId = response.data.linkedInId;
        }
      }
    } catch (e) {
      console.warn('[PLUGIN_INIT] Failed to scrape linkedinId, fallback to no-candidate mode');
    }

    // Try facade overview API first (single request)
    let overview = null;
    let useOverview = false;
    if (typeof window !== 'undefined' && window.API) {
      try {
        console.log('[PLUGIN_INIT] calling overview API, linkedinId=' + linkedInId);
        overview = await window.API.overview.get(linkedInId);
        useOverview = true;
        console.log('[PLUGIN_INIT] overview API success');
      } catch (e) {
        console.warn('[PLUGIN_INIT] overview API failed, fallback to legacy init:', e.message);
      }
    }

    if (useOverview && overview) {
      // 1. Pipeline stages
      if (overview.pipelineStages) {
        pipelineStages = overview.pipelineStages;
        await setSetting(PIPELINE_CACHE_KEY, { stages: pipelineStages, ts: Date.now() });
      }

      // 2. User + Subscription
      await initBindEmailState(overview.user, overview.subscription);

      // 3. Today tasks
      await renderOverviewTodayTasks(overview.todayTasks, overview.todayTaskOverdueCount);

      // 4. Candidate (scrape + merge with backend data)
      await loadCurrentCandidate(overview.candidate);
    } else {
      // Fallback to legacy multi-request init
      await initBackendData();
      await loadCurrentCandidate();
      await Promise.all([
        renderOverviewTodayTasks(),
        initBindEmailState()
      ]);
    }
  } catch (e) {
    console.error('Init error:', e);
  } finally {
    console.log(`[PLUGIN_INIT] ===== 插件初始化完成 总耗时=${(performance.now() - totalStart).toFixed(1)}ms =====`);
    hideLoading();
  }
});

// ========== Custom DateTime Picker ==========
function fmtDateTimeInput(d) {
  if (!d || isNaN(d.getTime())) return '';
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initDatetimePicker(config) {
  const input = $(config.inputId);
  const picker = $(config.pickerId);
  const monthYear = $(config.monthYearId);
  const daysGrid = $(config.daysId);
  const hourSel = $(config.hourId);
  const minuteSel = $(config.minuteId);

  let viewDate = new Date();
  let selectedDate = null;
  let longPressTimer = null;
  const LONG_PRESS_MS = 400;

  // Init hour options (only once)
  if (hourSel.options.length === 0) {
    for (let i = 0; i < 24; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i.toString().padStart(2, '0');
      hourSel.appendChild(opt);
    }
  }
  // Init minute options (only once)
  if (minuteSel.options.length === 0) {
    for (let i = 0; i < 60; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i.toString().padStart(2, '0');
      minuteSel.appendChild(opt);
    }
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    monthYear.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    daysGrid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Previous month filler days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = document.createElement('div');
      day.className = 'dtp-day other-month';
      day.textContent = daysInPrevMonth - i;
      daysGrid.appendChild(day);
    }

    // Current month days
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const day = document.createElement('div');
      day.className = 'dtp-day';
      day.textContent = d;

      if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
        day.classList.add('today');
      }
      if (selectedDate && year === selectedDate.getFullYear() && month === selectedDate.getMonth() && d === selectedDate.getDate()) {
        day.classList.add('selected');
      }

      // Click to select (does not close)
      day.addEventListener('click', () => {
        selectedDate = new Date(year, month, d, parseInt(hourSel.value, 10), parseInt(minuteSel.value, 10));
        renderCalendar();
      });

      // Long press to select and confirm close
      day.addEventListener('mousedown', () => {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          selectedDate = new Date(year, month, d, parseInt(hourSel.value, 10), parseInt(minuteSel.value, 10));
          renderCalendar();
          confirmAndClose();
        }, LONG_PRESS_MS);
      });
      day.addEventListener('mouseup', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      });
      day.addEventListener('mouseleave', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      });

      daysGrid.appendChild(day);
    }

    // Next month filler days
    const remaining = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const day = document.createElement('div');
      day.className = 'dtp-day other-month';
      day.textContent = d;
      daysGrid.appendChild(day);
    }
  }

  function openPicker() {
    picker.classList.remove('hidden');
    let val = '';
    if (config.getInitialValue) {
      val = config.getInitialValue();
    }
    if (!val && input.value) {
      val = input.value;
    }
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        selectedDate = d;
        viewDate = new Date(d.getFullYear(), d.getMonth(), 1);
        hourSel.value = d.getHours();
        minuteSel.value = d.getMinutes();
      }
    }
    if (!selectedDate) {
      selectedDate = new Date();
      viewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      hourSel.value = selectedDate.getHours();
      minuteSel.value = selectedDate.getMinutes();
    }
    renderCalendar();
  }

  function closePicker() {
    picker.classList.add('hidden');
  }

  function confirmAndClose() {
    if (selectedDate) {
      const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), parseInt(hourSel.value, 10), parseInt(minuteSel.value, 10));
      input.value = fmtDateTimeInput(d);
      if (config.onConfirm) config.onConfirm(d);
    }
    closePicker();
  }

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    if (picker.classList.contains('hidden')) {
      openPicker();
    } else {
      closePicker();
    }
  });

  $(config.prevMonthId).addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });

  $(config.nextMonthId).addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });

  $(config.btnTodayId).addEventListener('click', (e) => {
    e.stopPropagation();
    const now = new Date();
    selectedDate = now;
    viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    hourSel.value = now.getHours();
    minuteSel.value = now.getMinutes();
    renderCalendar();
    confirmAndClose();
  });

  $(config.btnClearId).addEventListener('click', (e) => {
    e.stopPropagation();
    selectedDate = null;
    input.value = '';
    if (config.onClear) config.onClear();
    closePicker();
  });

  $(config.btnOkId).addEventListener('click', (e) => {
    e.stopPropagation();
    confirmAndClose();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && e.target !== input) {
      closePicker();
    }
  });

  // Prevent inside clicks from bubbling to document
  picker.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// Initialize Overview datetime picker
initDatetimePicker({
  inputId: 'ovNextFollowupInput',
  pickerId: 'ovDatetimePicker',
  monthYearId: 'dtpMonthYear',
  daysId: 'dtpDays',
  hourId: 'dtpHour',
  minuteId: 'dtpMinute',
  prevMonthId: 'dtpPrevMonth',
  nextMonthId: 'dtpNextMonth',
  btnTodayId: 'dtpBtnToday',
  btnClearId: 'dtpBtnClear',
  btnOkId: 'dtpBtnOk',
  getInitialValue: () => (currentCandidate && currentCandidate.nextFollowup) ? currentCandidate.nextFollowup : '',
  onConfirm: (d) => {
    if (currentCandidate) {
      const pad = n => n.toString().padStart(2, '0');
      currentCandidate.nextFollowup = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      currentCandidate.nextFollowupSource = 'manual';
      currentCandidate.nextFollowupSequenceStepId = null;
    }
  },
  onClear: () => {
    if (currentCandidate) currentCandidate.nextFollowup = '';
  }
});

// Initialize Manual Entry (Pipeline) datetime picker
initDatetimePicker({
  inputId: 'meNextFollowup',
  pickerId: 'meDatetimePicker',
  monthYearId: 'meDtpMonthYear',
  daysId: 'meDtpDays',
  hourId: 'meDtpHour',
  minuteId: 'meDtpMinute',
  prevMonthId: 'meDtpPrevMonth',
  nextMonthId: 'meDtpNextMonth',
  btnTodayId: 'meDtpBtnToday',
  btnClearId: 'meDtpBtnClear',
  btnOkId: 'meDtpBtnOk'
});

// ========== Sequence Follow-up Confirm Modal ==========
function showSeqFollowupConfirm(messageHtml) {
  return new Promise((resolve) => {
    const overlay = $('modalSeqFollowup');
    const textEl = $('modalSeqFollowupText');
    const acceptBtn = $('modalSeqFollowupAccept');
    const editBtn = $('modalSeqFollowupEdit');
    const editRow = $('modalSeqFollowupEditRow');
    const editInput = $('modalSeqFollowupEditInput');

    textEl.innerHTML = messageHtml;
    editRow.style.display = 'none';
    overlay.classList.add('active');

    const cleanup = () => {
      overlay.classList.remove('active');
      acceptBtn.onclick = null;
      editBtn.onclick = null;
      overlay.onclick = null;
    };

    acceptBtn.onclick = () => {
      const edited = editRow.style.display !== 'none';
      const time = edited && editInput.value ? new Date(editInput.value) : null;
      cleanup();
      resolve({ accepted: true, edited, time });
    };

    editBtn.onclick = () => {
      if (editRow.style.display === 'none') {
        editRow.style.display = 'block';
        // Default to suggested time + 3 days if not set
        if (!editInput.value) {
          const d = new Date(Date.now() + 3 * 86400000);
          const pad = n => n.toString().padStart(2, '0');
          editInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        editInput.focus();
      } else {
        const time = editInput.value ? new Date(editInput.value) : null;
        cleanup();
        resolve({ accepted: true, edited: true, time });
      }
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve({ accepted: false });
      }
    };
  });
}

// ========== Mark Done Follow-up Confirm Modal ==========
function showMarkDoneFollowupConfirm(messageHtml, showSkip = false) {
  return new Promise((resolve) => {
    const overlay = $('modalMarkDoneFollowup');
    const textEl = $('modalMarkDoneText');
    const acceptBtn = $('modalMarkDoneAccept');
    const editBtn = $('modalMarkDoneEdit');
    const skipBtn = $('modalMarkDoneSkip');
    const editRow = $('modalMarkDoneEditRow');
    const editInput = $('modalMarkDoneEditInput');

    textEl.innerHTML = messageHtml;
    editRow.style.display = 'none';
    skipBtn.style.display = showSkip ? 'inline-block' : 'none';
    overlay.classList.add('active');

    const cleanup = () => {
      overlay.classList.remove('active');
      acceptBtn.onclick = null;
      editBtn.onclick = null;
      skipBtn.onclick = null;
      overlay.onclick = null;
    };

    acceptBtn.onclick = () => {
      const edited = editRow.style.display !== 'none';
      const time = edited && editInput.value ? new Date(editInput.value) : null;
      cleanup();
      resolve({ accepted: true, edited, time, skipped: false });
    };

    editBtn.onclick = () => {
      if (editRow.style.display === 'none') {
        editRow.style.display = 'block';
        if (!editInput.value) {
          const d = new Date(Date.now() + 3 * 86400000);
          const pad = n => n.toString().padStart(2, '0');
          editInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        editInput.focus();
      } else {
        const time = editInput.value ? new Date(editInput.value) : null;
        cleanup();
        resolve({ accepted: true, edited: true, time, skipped: false });
      }
    };

    skipBtn.onclick = () => {
      cleanup();
      resolve({ accepted: false, skipped: true });
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve({ accepted: false, skipped: false });
      }
    };
  });
}

async function doMarkFollowupDone(candidateId, onComplete) {
  showLoading();
  try {
    let result = null;
    if (typeof window !== 'undefined' && window.API && candidateId) {
      result = await window.API.candidates.markFollowupDone(candidateId);
    }

    if (typeof window !== 'undefined' && window.API && candidateId) {
      try {
        await window.API.candidates.updateFollowup(candidateId, null, 'none', null);
      } catch (e) {
        console.warn('[MarkDone] clear followup failed:', e);
      }
    }

    if (result && result.has_suggestion) {
      const suggested = result.suggested_time ? new Date(result.suggested_time) : null;
      const dateStr = suggested ? suggested.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const msg = result.message || `Sequence suggests next follow-up on ${dateStr}`;
      const choice = await showMarkDoneFollowupConfirm(msg, false);
      if (choice && choice.accepted) {
        const followupTime = choice.time || suggested;
        const source = choice.edited ? 'manual' : 'sequence';
        try {
          await window.API.candidates.updateFollowup(
            candidateId,
            followupTime,
            source,
            source === 'sequence' ? (result.sequence_step_id || null) : null
          );
          if (currentCandidate && currentCandidate.id === candidateId) {
            const d = new Date(followupTime);
            const pad = n => n.toString().padStart(2, '0');
            currentCandidate.nextFollowup = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            currentCandidate.nextFollowupSource = source;
          }
        } catch (e) {
          console.warn('[MarkDone] update followup failed:', e);
        }
      }
    } else if (result && result.sequence_completed) {
      showToast('All sequence steps completed');
    }

    if (onComplete) onComplete();
    if (currentCandidate && currentCandidate.id === candidateId) {
      renderOverviewNextFollowup();
      renderOverviewTodayTasks();
    }
    showToast('Marked as done');
  } catch (e) {
    console.error('[MarkDone] error:', e);
    showToast('Failed to mark done');
  } finally {
    hideLoading();
  }
}

// Mark Done button
$('ovMarkDoneBtn').addEventListener('click', async () => {
  if (!currentCandidate) return;
  await doMarkFollowupDone(currentCandidate.id, () => {
    renderOverviewNextFollowup();
  });
});

// Sync to Sequence button
$('ovSyncToSequenceBtn').addEventListener('click', async () => {
  if (!currentCandidate || !currentCandidate.sequenceId) return;
  showLoading();
  try {
    const seq = await getSequenceById(currentCandidate.sequenceId);
    if (seq && seq.steps && seq.steps.length >= 2) {
      const nextStep = seq.steps[1]; // step 2
      const d = new Date(Date.now() + nextStep.delayDays * 86400000);
      if (typeof window !== 'undefined' && window.API && currentCandidate.id) {
        try {
          await window.API.candidates.updateFollowup(
            currentCandidate.id,
            d,
            'sequence',
            null
          );
        } catch (e) {
          console.warn('[SyncToSeq] update followup failed:', e);
        }
      }
      renderOverviewNextFollowup();
      showToast('Synced to sequence');
    }
  } catch (e) {
    console.error('[SyncToSeq] error:', e);
    showToast('Failed to sync');
  } finally {
    hideLoading();
  }
});

// ========== Feedback Modal ==========
(function initFeedbackModal() {
  const overlay = $('feedbackOverlay');
  const openBtn = $('feedbackOpenBtn');
  const closeBtn = $('feedbackCloseBtn');
  const cancelBtn = $('feedbackCancelBtn');
  const copyBtn = $('feedbackCopyBtn');
  const copyEmailContentBtn = $('feedbackCopyEmailContentBtn');
  const emailBtn = $('feedbackEmailBtn');
  const uuidDisplay = $('feedbackUuidDisplay');
  const toEmailSpan = $('feedbackToEmail');

  function openModal() {
    overlay.classList.remove('hidden');
    if (currentUserUuid) {
      uuidDisplay.value = currentUserUuid;
    }
    if (currentUserFeedbackEmail) {
      toEmailSpan.textContent = currentUserFeedbackEmail;
    }
  }

  function closeModal() {
    overlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  async function copyUuid() {
    if (!currentUserUuid) return;
    try {
      await navigator.clipboard.writeText(currentUserUuid);
      showToast('User ID copied!');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = currentUserUuid;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('User ID copied!');
      } catch (e) {
        showToast('Copy failed. Please copy manually.');
      }
      document.body.removeChild(ta);
    }
  }

  copyBtn.addEventListener('click', copyUuid);

  async function copyEmailContent() {
    if (!currentUserUuid || !currentUserFeedbackEmail) return;
    const text = `To: ${currentUserFeedbackEmail}\nSubject: [Feedback] User: ${currentUserUuid}\n\nHi team,\n\nMy feedback:\n[Please describe your idea or attach screenshots here]\n\n---\nUser ID: ${currentUserUuid}\nSent from LinkedIn SCRM Plugin`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Email content copied! Paste into your email client.');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('Email content copied! Paste into your email client.');
      } catch (e) {
        showToast('Copy failed. Please copy manually.');
      }
      document.body.removeChild(ta);
    }
  }

  copyEmailContentBtn.addEventListener('click', copyEmailContent);

  emailBtn.addEventListener('click', () => {
    if (!currentUserUuid || !currentUserFeedbackEmail) return;
    const subject = encodeURIComponent(`[Feedback] User: ${currentUserUuid}`);
    const body = encodeURIComponent(`Hi team,\n\nMy User ID: ${currentUserUuid}\n\nMy feedback:\n\n[Please describe your idea or attach screenshots here]\n\n`);
    const mailtoUrl = `mailto:${currentUserFeedbackEmail}?subject=${subject}&body=${body}`;
    chrome.tabs.create({ url: mailtoUrl });
  });
})();

// ========== Bind Email Modal ==========
let currentUserEmail = null;
let currentUserNeedBindEmail = false;
let currentUserUuid = null;
let currentUserFeedbackEmail = null;
let currentUserSupportEmail = null;

async function initBindEmailState(preloadedUser = null, preloadedSubscription = null) {
  console.log('[PLUGIN_INIT] initBindEmailState START');
  const start = performance.now();
  try {
    let user = preloadedUser;
    if (!user && typeof window !== 'undefined' && window.API) {
      user = await window.API.user.me();
    }
    if (user) {
      currentUserEmail = user.email || null;
      currentUserNeedBindEmail = (preloadedSubscription ? preloadedSubscription.needBindEmail : user.needBindEmail) || false;
      currentUserUuid = user.uuid || null;
      currentUserFeedbackEmail = user.feedbackEmail || 'richardtao2001@gmail.com';
      currentUserSupportEmail = user.supportEmail || 'richardtao2001@gmail.com';
      updateBindEmailButton();
      renderEmailAlertCard();
    }
  } catch (e) {
    console.error('[BindEmail] Failed to get user:', e);
  } finally {
    console.log(`[PLUGIN_INIT] initBindEmailState END 耗时=${(performance.now() - start).toFixed(1)}ms`);
  }
}

function renderEmailAlertCard() {
  const alertCard = $('ovEmailAlertCard');
  if (!alertCard) return;
  if (currentUserNeedBindEmail && !currentUserEmail) {
    alertCard.classList.remove('hidden');
  } else {
    alertCard.classList.add('hidden');
  }
}

function updateBindEmailButton() {
  const btn = $('bindEmailOpenBtn');
  if (currentUserEmail) {
    btn.textContent = '📧';
    btn.title = 'Email: ' + currentUserEmail;
  } else {
    btn.textContent = '📧 Bind Email';
    btn.title = 'Bind Email';
  }
}

(function initBindEmailModal() {
  const bindOverlay = $('bindEmailOverlay');
  const bindOpenBtn = $('bindEmailOpenBtn');
  const bindCloseBtn = $('bindEmailCloseBtn');
  const bindCancelBtn = $('bindEmailCancelBtn');
  const bindSubmitBtn = $('bindEmailSubmitBtn');
  const bindEmailInput = $('bindEmailInput');

  function openBindModal() {
    bindOverlay.classList.remove('hidden');
    bindEmailInput.value = currentUserEmail || '';
    bindEmailInput.focus();
  }

  function closeBindModal() {
    bindOverlay.classList.add('hidden');
  }

  bindOpenBtn.addEventListener('click', () => {
    openBindModal();
  });

  // Overview tab email alert button
  const ovEmailAlertBtn = $('ovEmailAlertBtn');
  if (ovEmailAlertBtn) {
    ovEmailAlertBtn.addEventListener('click', openBindModal);
  }

  bindCloseBtn.addEventListener('click', closeBindModal);
  bindCancelBtn.addEventListener('click', closeBindModal);
  bindOverlay.addEventListener('click', (e) => {
    if (e.target === bindOverlay) closeBindModal();
  });

  bindSubmitBtn.addEventListener('click', async () => {
    const email = bindEmailInput.value.trim();
    if (!email) {
      showToast('Please enter your email');
      bindEmailInput.focus();
      return;
    }
    bindSubmitBtn.disabled = true;
    bindSubmitBtn.textContent = 'Saving...';
    try {
      await window.API.user.updateMe({ email });
      showToast('Email linked successfully!');
      currentUserEmail = email;
      updateBindEmailButton();
      closeBindModal();
    } catch (e) {
      console.error('[BindEmail] Failed to save:', e);
      const msg = e.message || '';
      if (msg.toLowerCase().includes('already in use') || msg.includes('Email already in use')) {
        closeBindModal();
        openEmailConflictModal();
      } else {
        showToast(msg || 'Failed to save email. Please try again.');
      }
    } finally {
      bindSubmitBtn.disabled = false;
      bindSubmitBtn.textContent = 'Save';
    }
  });
})();

// ========== Email Conflict Modal ==========
(function initEmailConflictModal() {
  const conflictOverlay = $('emailConflictOverlay');
  const conflictCloseBtn = $('emailConflictCloseBtn');
  const conflictCloseBtn2 = $('emailConflictCloseBtn2');
  const conflictCopyBtn = $('emailConflictCopyBtn');
  const conflictCopyUserIdBtn = $('emailConflictCopyUserIdBtn');
  const conflictUuidInput = $('emailConflictUuidInput');
  const conflictUuidSpan = $('emailConflictUuid');
  const conflictSupportEmail = $('emailConflictSupportEmail');

  function openEmailConflictModal() {
    if (currentUserUuid) {
      conflictUuidInput.value = currentUserUuid;
      conflictUuidSpan.textContent = currentUserUuid;
    }
    if (currentUserSupportEmail) {
      conflictSupportEmail.textContent = currentUserSupportEmail;
    }
    conflictOverlay.classList.remove('hidden');
  }

  function closeEmailConflictModal() {
    conflictOverlay.classList.add('hidden');
  }

  window.openEmailConflictModal = openEmailConflictModal;

  conflictCloseBtn.addEventListener('click', closeEmailConflictModal);
  conflictCloseBtn2.addEventListener('click', closeEmailConflictModal);
  conflictOverlay.addEventListener('click', (e) => {
    if (e.target === conflictOverlay) closeEmailConflictModal();
  });

  async function copyUuid() {
    if (!currentUserUuid) return;
    try {
      await navigator.clipboard.writeText(currentUserUuid);
      showToast('User ID copied!');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = currentUserUuid;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('User ID copied!');
      } catch (e) {
        showToast('Copy failed. Please copy manually.');
      }
      document.body.removeChild(ta);
    }
  }

  conflictCopyBtn.addEventListener('click', copyUuid);
  conflictCopyUserIdBtn.addEventListener('click', copyUuid);
})();
// ========== AI Message Generation ==========
(function initAiMessage() {
  $('ovAiGenerateBtn').addEventListener('click', async () => {
    if (!currentCandidate) return;

    const btn = $('ovAiGenerateBtn');
    const loading = $('ovAiLoading');
    const result = $('ovAiResult');

    btn.disabled = true;
    loading.style.display = 'block';
    result.style.display = 'none';

    try {
      if (!currentCandidate.id) {
        const canSave = await checkCandidateLimit();
        if (!canSave) {
          btn.disabled = false;
          loading.style.display = 'none';
          return;
        }
        try {
          currentCandidate.source = 'linkedin_profile';
          const created = await window.API.candidates.create(currentCandidate);
          if (created && created.id) {
            currentCandidate.id = created.id;
          } else {
            showToast('Failed to save candidate');
            btn.disabled = false;
            loading.style.display = 'none';
            return;
          }
        } catch (e) {
          console.error('[AI_GEN] Auto-save candidate failed:', e);
          showToast('Failed to save candidate: ' + (e.message || 'Unknown error'));
          btn.disabled = false;
          loading.style.display = 'none';
          return;
        }
      }

      const request = {
        candidate_id: currentCandidate.id,
        pipeline_stage: currentCandidate.pipelineStage,
        job_title: currentCandidate.jobTitle,
        job_function: currentCandidate.jobFunction,
        contact_mode: currentCandidate.contactMode || 'recruiting'
      };

      const data = await window.API.candidates.generateAiMessages(currentCandidate.id, request);
      renderAiResult(data);
    } catch (err) {
      console.error('[AI_GEN] catch err:', err);
      const quotaHandled = await handleQuotaError(err);
      console.error('[AI_GEN] quotaHandled:', quotaHandled);
      if (quotaHandled) {
        // 额度超限，已弹出升级框
      } else if (err.code === 4001) {
        await showConfirm(err.message || "Please open the candidate's profile page and use this feature.");
      } else {
        showToast('Failed to generate: ' + (err.message || 'Unknown error'));
      }
      console.error('[SCRM_TEMPLATE] AI generation failed:', err);
    } finally {
      btn.disabled = false;
      loading.style.display = 'none';
    }
  });

  function renderAiResult(data) {
    const versionsEl = $('ovAiVersions');
    const message = data.message || '';
    if (message) {
      versionsEl.innerHTML = `
        <div class="ai-version" style="margin-bottom:10px;padding:10px;border:1px solid #5b4cdb;border-radius:8px;background:#f5f3ff;">
          <textarea id="aiMessageEditor" style="width:100%;min-height:80px;font-size:13px;color:#1f2937;line-height:1.5;padding:8px;border:1px solid #ddd;border-radius:6px;resize:vertical;background:#fff;box-sizing:border-box;">${escapeHtml(message)}</textarea>
          <button class="btn-copy" style="margin-top:8px;font-size:12px;padding:4px 10px;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:4px;cursor:pointer;">Copy</button>
        </div>
      `;

      versionsEl.querySelector('.btn-copy').addEventListener('click', () => {
        const editedText = $('aiMessageEditor').value;
        copyToClipboard(editedText);
        showToast('Copied!');
      });
    } else {
      versionsEl.innerHTML = '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:12px;">No message generated</div>';
    }

    $('ovAiResult').style.display = 'block';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function copyToClipboard(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) {
        console.error('Copy failed:', e);
      }
      document.body.removeChild(ta);
    }
  }
})();
