// popup.js - Main popup logic

let currentCandidate = null;
let currentTab = 'overview';
let currentSequenceSubTab = 'templates';
let currentFilter = 'All Roles';
let manualEntryCandidateId = null;
let isDraggingCard = false;
let pipelineStages = [];

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

// ========== Tab Switching ==========
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    $(`tab-${currentTab}`).classList.add('active');
    if (currentTab === 'pipeline') renderPipeline();
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
async function loadCurrentCandidate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('linkedin.com/in/')) {
      $('ovName').textContent = 'No LinkedIn Profile';
      $('ovTitle').textContent = 'Open a candidate profile to get started';
      await renderOverviewTodayTasks();
      return;
    }

    // Try to get cached data from content script
    const response = await sendMessageToContentScript(tab.id, { action: 'scrape' });
    const tabUrl = tab.url || '';
    if (response && response.success && response.data) {
      const data = response.data;
      currentCandidate = await getCandidateByLinkedInId(data.linkedInId);
      if (!currentCandidate) {
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
      } else {
        // Update with latest scraped data
        Object.assign(currentCandidate, {
          linkedInUrl: tabUrl || currentCandidate.linkedInUrl,
          name: data.name || currentCandidate.name,
          headline: data.headline || currentCandidate.headline,
          company: data.company || currentCandidate.company,
          school: data.school || currentCandidate.school,
          summary: data.summary || currentCandidate.summary,
          skills: data.skills?.length ? data.skills : currentCandidate.skills,
          workExperiences: data.workExperiences?.length ? data.workExperiences : currentCandidate.workExperiences,
          educationExperiences: data.educationExperiences?.length ? data.educationExperiences : currentCandidate.educationExperiences,
          websites: data.websites?.length ? data.websites : currentCandidate.websites,
          emails: [],
          phones: [],
        });
      }
      renderOverview();
    } else {
      $('ovName').textContent = 'Unable to load';
      $('ovTitle').textContent = 'Try refreshing the page or click Save & Track';
    }
  } catch (e) {
    console.log('Load candidate error:', e);
    $('ovName').textContent = 'Error';
    $('ovTitle').textContent = e.message || 'Please open a LinkedIn profile';
  }
}

function renderOverview() {
  if (!currentCandidate) return;
  $('ovAvatar').textContent = getInitials(currentCandidate.name);
  $('ovAvatar').style.background = getAvatarColor(currentCandidate.name);
  $('ovName').textContent = currentCandidate.name || 'Unknown';
  $('ovTitle').textContent = currentCandidate.company || '-';

  $('ovTemperature').value = currentCandidate.temperature || 'Cold';

  const isRecruiting = currentCandidate.contactMode === 'recruiting';
  $('ovModeRecruiting').classList.toggle('active', isRecruiting);
  $('ovModeNurture').classList.toggle('active', !isRecruiting);

  $('ovKeyMemory').value = currentCandidate.keyMemory || '';

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
  const selectHtml = '<option value="">None (manual follow-up only)</option>' +
    sequences.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  const boundSeqId = currentCandidate.sequenceId;

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

async function renderOverviewTodayTasks() {
  const candidates = await getTodaysTasks();
  const countEl = $('ovTodayCount');
  const listEl = $('ovTodayTaskList');

  countEl.textContent = `${candidates.length} task${candidates.length !== 1 ? 's' : ''} ▼`;

  if (candidates.length === 0) {
    listEl.innerHTML = '<div class="text-gray text-sm text-center" style="padding:12px;">No tasks for today</div>';
    return;
  }

  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  listEl.innerHTML = candidates.map(candidate => {
    const followupTime = new Date(candidate.nextFollowup).getTime();
    const isOverdue = followupTime < now;
    const isToday = !isOverdue && followupTime <= todayEnd.getTime();

    let statusLabel = isOverdue ? `${Math.ceil((now - followupTime) / 86400000)}d overdue` : isToday ? 'Today' : 'Soon';
    let statusClass = isOverdue ? 'overdue' : isToday ? 'today' : 'tomorrow';
    let borderClass = isOverdue ? 'overdue' : isToday ? 'today' : 'tomorrow';

    const timeStr = new Date(candidate.nextFollowup).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="today-task-item">
        <div class="today-task-border ${borderClass}"></div>
        <div class="today-task-avatar" style="background:${getAvatarColor(candidate.name)}">${getInitials(candidate.name)}</div>
        <div class="today-task-info">
          <div class="today-task-name">${escapeHtml(candidate.name)}</div>
          <div class="today-task-desc">Follow-up · ${timeStr}</div>
        </div>
        <span class="today-task-status ${statusClass}">${statusLabel}</span>
      </div>
    `;
  }).join('');
}

// Overview events
$('ovTodayHeader').addEventListener('click', () => {
  const content = $('ovTodayContent');
  const isExpanded = !content.classList.contains('hidden');
  content.classList.toggle('hidden');
  const countEl = $('ovTodayCount');
  countEl.textContent = countEl.textContent.replace(isExpanded ? '▲' : '▼', isExpanded ? '▼' : '▲');
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
  if (currentCandidate) currentCandidate.temperature = $('ovTemperature').value;
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
  if (currentCandidate) currentCandidate.keyMemory = $('ovKeyMemory').value;
});

// ovNextFollowupInput 的事件由自定义 DateTime Picker 处理，见文件底部

$('ovVoiceMemoTextarea').addEventListener('input', () => {
  if (currentCandidate) currentCandidate.voiceMemo = $('ovVoiceMemoTextarea').value;
});

$('ovSaveBtn').addEventListener('click', async () => {
  if (!currentCandidate) {
    showToast('No candidate data to save');
    return;
  }
  const canSave = await checkCandidateLimit();
  if (!canSave) return;
  showLoading();
  try {
    const savedId = await saveCandidate(currentCandidate);
    if (!currentCandidate.id) currentCandidate.id = savedId;
    await addHistory({
      candidateId: currentCandidate.id,
      type: 'status_change',
      content: `Saved candidate ${currentCandidate.name}`,
      subtype: 'System',
      date: Date.now()
    });
    showToast('Saved & tracked!');
    trackEvent('candidate_saved', { category: 'engagement', label: 'overview' });
    await renderOverviewNextFollowup();
    await renderOverviewActiveSequence();
    // Switch to pipeline tab after saving
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
  } catch (e) {
    showToast('Save failed: ' + e.message);
  } finally {
    hideLoading();
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

  let allCandidates = await getAllCandidates();
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
      draggedId = parseInt(card.dataset.id);
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
      if (!draggedId) return;
      const newStage = col.dataset.status;
      const candidate = await getCandidateById(draggedId);
      if (candidate && (candidate.pipelineStage || 'new') !== newStage) {
        const oldStage = candidate.pipelineStage || 'new';
        candidate.pipelineStage = newStage;
        await updateCandidate(candidate);
        trackEvent('pipeline_moved', { category: 'engagement', label: `${oldStage}_to_${newStage}` });
        await addHistory({
          candidateId: candidate.id,
          type: 'status_change',
          content: `Pipeline stage changed from ${oldStage} to ${newStage}`,
          subtype: 'System',
          date: Date.now()
        });
        renderPipeline();
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
      const candidate = await getCandidateById(candidateId);
      if (!candidate) return;
      const confirmed = await showConfirm(`Are you sure you want to delete "${candidate.name}"?`);
      if (confirmed) {
        showLoading();
        try {
          await deleteCandidate(candidateId);
          showToast('Candidate deleted');
          renderPipeline();
          if (currentTab === 'history') renderHistory();
        } catch (err) {
          showToast('Delete failed: ' + err.message);
        } finally {
          hideLoading();
        }
      }
    });
  });
}

function bindPipelineSaveToNewEvents() {
  document.querySelectorAll('.board-card-save-to-new').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidateId = parseInt(btn.dataset.id);
      const candidate = await getCandidateById(candidateId);
      if (!candidate) return;
      showLoading();
      try {
        candidate.pipelineStage = 'new';
        await updateCandidate(candidate);
        trackEvent('candidate_promoted', { category: 'conversion', label: 'unclaimed_to_new' });
        await addHistory({
          candidateId: candidate.id,
          type: 'status_change',
          content: `Saved "${candidate.name}" from Unclaimed to New`,
          subtype: 'System',
          date: Date.now()
        });
        showToast('Candidate saved to New');
        renderPipeline();
        if (currentTab === 'history') renderHistory();
      } catch (err) {
        showToast('Save failed: ' + err.message);
      } finally {
        hideLoading();
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

function showUpgradeModal(config) {
  trackEvent('upgrade_prompt_shown', { category: 'conversion', label: config.label || '' });
  const titleEl = $('modalUpgradeTitle');
  const msgEl = $('modalUpgradeMessage');
  const subMsgEl = $('modalUpgradeSubMessage');
  const okBtn = $('modalUpgradeOk');
  const cancelBtn = $('modalUpgradeCancel');

  titleEl.textContent = config.title || '🚀 Limit Reached';
  msgEl.textContent = config.message || '';
  subMsgEl.textContent = config.subMessage || '';
  okBtn.textContent = config.okText || 'Upgrade to Pro';
  cancelBtn.textContent = config.cancelText || 'Continue with Free';

  $('modalUpgrade').classList.add('active');
  return new Promise(resolve => {
    upgradeResolve = resolve;
  });
}

$('modalUpgradeOk').addEventListener('click', () => {
  trackEvent('upgrade_clicked', { category: 'conversion', label: 'upgrade_modal' });
  $('modalUpgrade').classList.remove('active');
  if (upgradeResolve) { upgradeResolve(true); upgradeResolve = null; }
});

$('modalUpgradeCancel').addEventListener('click', () => {
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
      title: '🚀 You\'ve reached ' + limit + ' candidates',
      message: 'Free plan: ' + limit + ' candidates\nPro plan: Unlimited + AI messages',
      subMessage: 'Upgrade to unlock more candidates.',
      okText: 'Upgrade $29/mo',
      cancelText: 'Continue with Free'
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
      title: '📋 Sequence limit reached',
      message: 'Free plan: ' + limit + ' Sequence' + (limit > 1 ? 's' : '') + '\nPro plan: 10 Sequences + Auto-followup',
      subMessage: 'Upgrade to unlock more sequences.',
      okText: 'Upgrade to Pro',
      cancelText: 'Continue with Free'
    });
    return upgrade;
  }
  return true;
}

async function showAiLimitModal(used, limit) {
  return showUpgradeModal({
    title: '🤖 AI message limit reached',
    message: `You've used ${used}/${limit} AI messages today.\nUpgrade to Pro for ${limit >= 50 ? 'more' : '50'}/day.`,
    subMessage: '',
    okText: 'Upgrade to Pro',
    cancelText: 'Maybe Tomorrow'
  });
}

async function updateFilterDropdown() {
  const candidates = await getAllCandidates();
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

async function bindCandidateToSequence(candidateId, sequenceId) {
  console.log('[BIND_SEQ] START candidateId=', candidateId, 'sequenceId=', sequenceId);

  // Ensure candidate is saved to local DB first
  if (!candidateId && currentCandidate) {
    console.log('[BIND_SEQ] candidateId empty, saving candidate...');
    const canSave = await checkCandidateLimit();
    if (!canSave) return;
    candidateId = await saveCandidate(currentCandidate);
    currentCandidate.id = candidateId;
    console.log('[BIND_SEQ] saved candidateId=', candidateId);
  }

  let candidate = await getCandidateById(candidateId);
  console.log('[BIND_SEQ] candidate=', candidate ? { id: candidate.id, localId: candidate.localId, serverId: candidate.serverId, name: candidate.name } : null);

  if (!sequenceId) {
    console.log('[BIND_SEQ] sequenceId empty, unbinding');
    if (candidate) {
      delete candidate.sequenceId;
      await dbPut(STORES.candidates, candidate);
    }
    await addHistory({
      candidateId: candidateId,
      type: 'status_change',
      content: 'Unbound from sequence',
      subtype: 'System',
      date: Date.now()
    });
    return;
  }

  const seq = await getSequenceById(sequenceId);
  console.log('[BIND_SEQ] seq=', seq ? { id: seq.id, serverId: seq.serverId, name: seq.name, stepsLength: seq.steps ? seq.steps.length : 'NO_STEPS' } : null);
  if (!seq || !seq.steps || seq.steps.length === 0) {
    console.warn('[BIND_SEQ] ABORT: seq missing or no steps');
    return;
  }

  // Update candidate with bound sequence id
  if (candidate) {
    candidate.sequenceId = sequenceId;
    await dbPut(STORES.candidates, candidate);
  }

  await addHistory({
    candidateId: candidateId,
    type: 'status_change',
    content: `Bound to sequence "${seq.name}"`,
    subtype: 'System',
    date: Date.now()
  });
  console.log('[BIND_SEQ] history added');

  // Sync candidate-sequence binding to backend
  if (typeof window !== 'undefined' && window.API) {
    try {
      console.log('[BIND_SEQ] syncing to backend...');
      // Ensure candidate has serverId; sync to backend if needed
      if (candidate && !candidate.serverId) {
        console.log('[BIND_SEQ] candidate.serverId missing, creating on backend...');
        const created = await window.API.candidates.create(candidate);
        console.log('[BIND_SEQ] backend create result=', created);
        if (created && created.serverId) {
          candidate.serverId = created.serverId;
          await dbPut(STORES.candidates, candidate);
          console.log('[BIND_SEQ] serverId saved to DB:', candidate.serverId);
        }
      }

      const candidateServerId = candidate ? (candidate.serverId || candidate.id) : null;
      const sequenceServerId = seq.serverId || seq.id;
      console.log('[BIND_SEQ] candidateServerId=', candidateServerId, 'sequenceServerId=', sequenceServerId);
      if (candidateServerId && sequenceServerId) {
        console.log('[BIND_SEQ] calling createCandidateSequence...');
        await window.API.sequences.createCandidateSequence(
          candidateServerId,
          sequenceServerId,
          { stepIndex: 0, totalSteps: seq.steps.length, status: 'active' }
        );
        console.log('[BIND_SEQ] createCandidateSequence success');
        trackEvent('sequence_bound', { category: 'engagement', label: 'sequence_' + sequenceId });
      } else {
        console.warn('[BIND_SEQ] SKIP backend sync: missing id', { candidateServerId, sequenceServerId });
      }
    } catch (e) {
      console.warn('[BIND_SEQ] Sync candidate-sequence to backend failed:', e);
    }
  } else {
    console.warn('[BIND_SEQ] window.API not available');
  }

  // Prompt user to confirm the suggested follow-up time (Step 2 if exists)
  if (seq.steps.length >= 2 && candidate) {
    const nextStep = seq.steps[1]; // step 2
    const suggestedTime = Date.now() + nextStep.delayDays * 86400000;
    const suggestedDate = new Date(suggestedTime);
    const dateStr = suggestedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dayLabel = nextStep.delayDays > 0 ? `(${nextStep.delayDays} day${nextStep.delayDays > 1 ? 's' : ''} later)` : '(immediately)';

    const choice = await showSeqFollowupConfirm(`Sequence suggests follow-up:<br><strong>${dateStr}</strong> ${dayLabel}`);
    if (choice && choice.accepted) {
      const followupTime = choice.time ? choice.time.getTime() : suggestedTime;
      const source = choice.edited ? 'manual' : 'sequence';
      candidate.nextFollowup = `${new Date(followupTime).getFullYear()}-${String(new Date(followupTime).getMonth()+1).padStart(2,'0')}-${String(new Date(followupTime).getDate()).padStart(2,'0')}T${String(new Date(followupTime).getHours()).padStart(2,'0')}:${String(new Date(followupTime).getMinutes()).padStart(2,'0')}`;
      candidate.nextFollowupSource = source;
      candidate.nextFollowupSequenceStepId = source === 'sequence' ? nextStep.stepNumber : null;
      await dbPut(STORES.candidates, candidate);
      if (candidate.serverId || candidate.localId) {
        try {
          await window.API.candidates.updateFollowup(
            candidate.serverId || candidate.localId,
            new Date(followupTime),
            source,
            source === 'sequence' ? nextStep.stepNumber : null
          );
        } catch (e) {
          console.warn('[BIND_SEQ] update followup failed:', e);
        }
      }
      renderOverviewNextFollowup();
    }
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
    getCandidateById(candidateId).then(async candidate => {
      if (!candidate) return;
      $('meName').value = candidate.name || '';
      $('meHeadline').value = candidate.headline || '';
      $('meCompany').value = candidate.company || '';
      $('meLocation').value = candidate.location || '';
      $('meLinkedInUrl').value = candidate.linkedInUrl || '';
      $('meEmail').value = candidate.emails?.[0] || '';
      $('meStatus').value = candidate.pipelineStage || (pipelineStages[0]?.id || 'new');
      $('meNotes').value = candidate.keyMemory || '';
      const temp = candidate.temperature || 'Warm';
      document.querySelectorAll('.temp-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.temp === temp);
      });
      // Load current bound sequence
      await loadSequenceOptions($('meSequence'), candidate.sequenceId || '');
      $('modalManualEntry').classList.add('active');
    });
  } else {
    $('meName').value = '';
    $('meHeadline').value = '';
    $('meCompany').value = '';
    $('meLocation').value = '';
    $('meLinkedInUrl').value = '';
    $('meEmail').value = '';
    $('meStatus').value = pipelineStages[0]?.id || 'new';
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
      candidate = await getCandidateById(manualEntryCandidateId);
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
    candidate.keyMemory = $('meNotes').value.trim();

    const canSave = await checkCandidateLimit();
    if (!canSave) { hideLoading(); return; }
    const savedId = await saveCandidate(candidate);

    // Handle sequence binding
    const sequenceId = $('meSequence').value;
    if (sequenceId) {
      await bindCandidateToSequence(savedId, sequenceId);
    }

    if (!manualEntryCandidateId) {
      await addHistory({
        candidateId: savedId,
        type: 'status_change',
        content: `Added candidate ${name}`,
        subtype: 'System',
        date: Date.now()
      });
    }

    showToast(manualEntryCandidateId ? 'Candidate updated!' : 'Candidate added!');
    trackEvent('candidate_saved', { category: 'engagement', label: 'manual_entry' });
    closeManualEntryModal();
    if (currentTab === 'pipeline') renderPipeline();
    if (currentTab === 'history') renderHistory();
  } catch (e) {
    showToast('Save failed: ' + e.message);
  } finally {
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
    div.innerHTML = `
      <div class="seq-item-header">
        <span class="seq-item-name">${escapeHtml(seq.name)}</span>
        <span class="seq-item-count">${totalSteps} step${totalSteps !== 1 ? 's' : ''}</span>
      </div>
      <ul class="seq-steps">${stepsHtml}</ul>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn-sm seq-item-toggle" data-action="use" data-id="${seq.id}" style="flex:1;">Use</button>
        <button class="btn-sm seq-item-toggle" data-action="edit" data-id="${seq.id}" style="flex:1;background:#fff;color:#5b4cdb;border:1px solid #5b4cdb;">Edit</button>
      </div>
    `;
    container.appendChild(div);
  }

  // Safety tip
  const tip = document.createElement('div');
  tip.className = 'seq-safety-tip';
  tip.textContent = 'Safety: Max 20 connects/day · 1-2 per day · Manual approval. This sequence completes in 10 days.';
  container.appendChild(tip);
}

async function renderTodayTasks() {
  const now = new Date();
  $('todayDate').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const candidates = await getTodaysTasks();
  $('todayTasksTitle').textContent = `Today's Tasks (${candidates.length})`;

  const container = $('seqTodayList');
  if (candidates.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks for today</div>';
    return;
  }

  const nowTs = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  container.innerHTML = '';
  for (const candidate of candidates) {
    const followupTime = new Date(candidate.nextFollowup).getTime();
    const isOverdue = followupTime < nowTs;
    const isToday = !isOverdue && followupTime <= todayEnd.getTime();

    let statusLabel = isOverdue ? `${Math.ceil((nowTs - followupTime) / 86400000)}d overdue` : isToday ? 'Today' : 'Soon';
    let statusClass = isOverdue ? 'status-overdue' : isToday ? 'status-today' : 'status-tomorrow';
    let btnText = isOverdue ? 'Quick Send' : 'Go to Profile';

    const div = document.createElement('div');
    div.className = 'task-item';
    div.innerHTML = `
      <div class="task-avatar" style="background:${getAvatarColor(candidate.name)}">${getInitials(candidate.name)}</div>
      <div class="task-info">
        <div class="task-name">${escapeHtml(candidate.name)}</div>
        <div class="task-desc">Follow-up scheduled</div>
        <div class="task-schedule">${new Date(candidate.nextFollowup).toLocaleString()}</div>
      </div>
      <div class="task-right">
        <span class="task-status ${statusClass}">${statusLabel}</span>
        <button class="btn-sm task-action-btn" data-id="${candidate.id}">${btnText}</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll('.task-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const candidateId = parseInt(btn.dataset.id);
      const candidate = candidates.find(c => c.id === candidateId);
      if (candidate) {
        showToast(`Opening ${candidate.name}'s profile...`);
      }
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
              const disabled = opt.value < prevDelay;
              return `<option value="${opt.value}" ${opt.value === step.delayDays ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${opt.label}</option>`;
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
      let lastDelay = seqSteps[idx].delayDays;
      for (let i = idx + 1; i < seqSteps.length; i++) {
        if (seqSteps[i].delayDays < lastDelay) {
          seqSteps[i].delayDays = lastDelay;
        }
        lastDelay = seqSteps[i].delayDays;
      }
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

  const canCreate = await checkSequenceLimit();
  if (!canCreate) return;

  const steps = seqSteps.filter(s => s.name.trim()).map(s => ({
    name: s.name.trim(),
    delayDays: s.delayDays
  }));

  if (steps.length === 0) { showToast('Please enter at least one step'); return; }

  await saveSequence({ name, steps });
  showToast('Sequence saved!');
  $('modalNewSequence').classList.remove('active');
  $('modalSeqName').value = '';
  seqSteps = [{ name: 'Connection Request', delayDays: 0 }];
  renderSeqStepRows();
  renderSequenceTemplates();
});

$('modalNewSequence').addEventListener('click', (e) => {
  if (e.target === $('modalNewSequence')) $('modalNewSequence').classList.remove('active');
});

// ========== History ==========
async function renderHistoryContent(candidateId) {
  const candidate = await getCandidateById(candidateId);
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
  const candidates = await getAllCandidates();
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
  return new Promise((resolve, reject) => {
    let retries = 0;
    const trySend = () => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          if (retries < maxRetries) {
            retries++;
            chrome.scripting.executeScript({
              target: { tabId }, files: ['content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                reject(new Error('Unable to inject content script'));
                return;
              }
              setTimeout(trySend, 500);
            });
          } else {
            reject(new Error('Content script not responding'));
          }
        } else {
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

// ========== Data Sync from Backend ==========
async function syncDataFromBackend() {
  if (typeof window === 'undefined' || !window.API) return;
  try {
    // Sync candidates
    const candidatesResp = await window.API.candidates.list({ page: 1, pageSize: 100 });
    if (candidatesResp.data && candidatesResp.data.items) {
      for (const backendCand of candidatesResp.data.items) {
        const fc = window.API.utils.candidateFromBackend(backendCand);
        // Try to find existing by linkedInId or localId
        let existing = null;
        if (fc.linkedInId) {
          existing = await getCandidateByLinkedInId(fc.linkedInId);
        }
        if (!existing && fc.localId) {
          const all = await getAllCandidates();
          existing = all.find(c => c.localId === fc.localId);
        }
        if (existing) {
          fc.id = existing.id;
          // Merge: preserve local extra fields if backend list doesn't include rawProfileData
          fc.keyMemory = existing.keyMemory || fc.keyMemory;
          fc.voiceMemo = existing.voiceMemo || fc.voiceMemo;
          fc.contactMode = existing.contactMode || fc.contactMode;
          fc.skills = (fc.skills && fc.skills.length) ? fc.skills : (existing.skills || []);
          fc.workExperiences = (fc.workExperiences && fc.workExperiences.length) ? fc.workExperiences : (existing.workExperiences || []);
          fc.educationExperiences = (fc.educationExperiences && fc.educationExperiences.length) ? fc.educationExperiences : (existing.educationExperiences || []);
          fc.websites = (fc.websites && fc.websites.length) ? fc.websites : (existing.websites || []);
          fc.updatedAt = Date.now();
          await dbPut(STORES.candidates, fc);
        } else {
          delete fc.id;
          fc.createdAt = fc.createdAt || Date.now();
          fc.updatedAt = Date.now();
          await dbAdd(STORES.candidates, fc);
        }
      }
    }

    // Sequences and pipeline are now fetched directly from backend on init
    console.log('[Popup] Data synced from backend');
  } catch (e) {
    console.warn('[Popup] Sync from backend failed:', e.message);
  }
}

// ========== Init Backend Data ==========
async function initBackendData() {
  if (typeof window === 'undefined' || !window.API) return;
  try {
    // Refresh sequences from backend
    await refreshSequences();

    // Fetch pipeline stages from backend (fixed enum, no boards)
    const stagesResp = await window.API.pipeline.listStages();
    if (stagesResp.data && stagesResp.data.items) {
      pipelineStages = stagesResp.data.items.map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sort_order || s.sortOrder
      })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
  } catch (e) {
    console.warn('[Popup] Init backend data failed:', e.message);
  }
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  showLoading();
  try {
    await ensureUserId();
    await initBackendData();
    await syncDataFromBackend();
    await loadCurrentCandidate();
    await renderOverviewTodayTasks();
  } catch (e) {
    console.error('Init error:', e);
  } finally {
    hideLoading();
  }
});

// ========== Custom DateTime Picker ==========
function fmtDateTimeInput(d) {
  if (!d || isNaN(d.getTime())) return '';
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

(function initDatetimePicker() {
  const input = $('ovNextFollowupInput');
  const picker = $('ovDatetimePicker');
  const monthYear = $('dtpMonthYear');
  const daysGrid = $('dtpDays');
  const hourSel = $('dtpHour');
  const minuteSel = $('dtpMinute');

  let viewDate = new Date();
  let selectedDate = null;
  let longPressTimer = null;
  const LONG_PRESS_MS = 400;

  // Init hour options
  for (let i = 0; i < 24; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i.toString().padStart(2, '0');
    hourSel.appendChild(opt);
  }
  // Init minute options
  for (let i = 0; i < 60; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i.toString().padStart(2, '0');
    minuteSel.appendChild(opt);
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
    if (currentCandidate && currentCandidate.nextFollowup) {
      val = currentCandidate.nextFollowup;
    } else if (input.value) {
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
      if (currentCandidate) {
        const pad = n => n.toString().padStart(2, '0');
        currentCandidate.nextFollowup = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        // Manual edit → source becomes manual (sacred)
        currentCandidate.nextFollowupSource = 'manual';
        currentCandidate.nextFollowupSequenceStepId = null;
      }
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

  $('dtpPrevMonth').addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });

  $('dtpNextMonth').addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });

  $('dtpBtnToday').addEventListener('click', (e) => {
    e.stopPropagation();
    const now = new Date();
    selectedDate = now;
    viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    hourSel.value = now.getHours();
    minuteSel.value = now.getMinutes();
    renderCalendar();
    confirmAndClose();
  });

  $('dtpBtnClear').addEventListener('click', (e) => {
    e.stopPropagation();
    selectedDate = null;
    input.value = '';
    if (currentCandidate) currentCandidate.nextFollowup = '';
    closePicker();
  });

  $('dtpBtnOk').addEventListener('click', (e) => {
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
})();

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
    overlay.classList.remove('hidden');

    const cleanup = () => {
      overlay.classList.add('hidden');
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
    overlay.classList.remove('hidden');

    const cleanup = () => {
      overlay.classList.add('hidden');
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

// Mark Done button
$('ovMarkDoneBtn').addEventListener('click', async () => {
  if (!currentCandidate) return;
  showLoading();
  try {
    // Call backend mark follow-up done
    let result = null;
    if (typeof window !== 'undefined' && window.API && (currentCandidate.serverId || currentCandidate.localId)) {
      result = await window.API.candidates.markFollowupDone(currentCandidate.serverId || currentCandidate.localId);
    }

    // Clear local follow-up
    currentCandidate.nextFollowup = '';
    currentCandidate.nextFollowupSource = 'none';
    currentCandidate.nextFollowupSequenceStepId = null;
    await dbPut(STORES.candidates, currentCandidate);

    await addHistory({
      candidateId: currentCandidate.id,
      type: 'followup_completed',
      content: 'Follow-up marked as done',
      subtype: 'System',
      date: Date.now()
    });

    // If sequence has next suggestion, prompt user
    if (result && result.has_suggestion) {
      const suggested = result.suggested_time ? new Date(result.suggested_time) : null;
      const dateStr = suggested ? suggested.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const msg = result.message || `Sequence suggests next follow-up on ${dateStr}`;
      const choice = await showMarkDoneFollowupConfirm(msg, false);
      if (choice && choice.accepted) {
        const followupTime = choice.time || suggested;
        const source = choice.edited ? 'manual' : 'sequence';
        currentCandidate.nextFollowup = `${followupTime.getFullYear()}-${String(followupTime.getMonth()+1).padStart(2,'0')}-${String(followupTime.getDate()).padStart(2,'0')}T${String(followupTime.getHours()).padStart(2,'0')}:${String(followupTime.getMinutes()).padStart(2,'0')}`;
        currentCandidate.nextFollowupSource = source;
        currentCandidate.nextFollowupSequenceStepId = source === 'sequence' ? (result.sequence_step_id || null) : null;
        await dbPut(STORES.candidates, currentCandidate);
        if (typeof window !== 'undefined' && window.API && (currentCandidate.serverId || currentCandidate.localId)) {
          await window.API.candidates.updateFollowup(
            currentCandidate.serverId || currentCandidate.localId,
            followupTime,
            source,
            source === 'sequence' ? (result.sequence_step_id || null) : null
          );
        }
      }
    } else if (result && result.sequence_completed) {
      showToast('All sequence steps completed');
    }

    renderOverviewNextFollowup();
    showToast('Marked as done');
  } catch (e) {
    console.error('[MarkDone] error:', e);
    showToast('Failed to mark done');
  } finally {
    hideLoading();
  }
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
      currentCandidate.nextFollowup = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      currentCandidate.nextFollowupSource = 'sequence';
      currentCandidate.nextFollowupSequenceStepId = null;
      await dbPut(STORES.candidates, currentCandidate);
      if (typeof window !== 'undefined' && window.API && (currentCandidate.serverId || currentCandidate.localId)) {
        await window.API.candidates.updateFollowup(
          currentCandidate.serverId || currentCandidate.localId,
          d,
          'sequence',
          null
        );
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
  const sendBtn = $('feedbackSendBtn');
  const contentEl = $('feedbackContent');
  const emailEl = $('feedbackEmail');

  function openModal() {
    overlay.classList.remove('hidden');
    contentEl.value = '';
    emailEl.value = '';
    contentEl.focus();
  }

  function closeModal() {
    overlay.classList.add('hidden');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Click overlay background to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  sendBtn.addEventListener('click', async () => {
    const content = contentEl.value.trim();
    if (!content) {
      showToast('Please enter your feedback');
      contentEl.focus();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const email = emailEl.value.trim();
      await window.API.feedback.submit(content, email);
      showToast('Feedback sent! Thank you.');
      trackEvent('feedback_submitted', { category: 'engagement' });
      closeModal();
    } catch (e) {
      console.error('[Feedback] Failed to send:', e);
      showToast('Failed to send feedback. Please try again.');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  });
})();
