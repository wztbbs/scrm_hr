// background.js - Service Worker

importScripts('db.js');

const DEFAULT_API_BASE = 'http://localhost:8080';

async function getApiBase() {
    try {
        const stored = await chrome.storage.local.get(['apiBase']);
        return stored.apiBase || DEFAULT_API_BASE;
    } catch (e) {
        return DEFAULT_API_BASE;
    }
}

async function getStoredToken() {
    try {
        const stored = await chrome.storage.local.get(['authToken']);
        return stored.authToken || null;
    } catch (e) {
        return null;
    }
}

async function checkCandidateExists(linkedInId) {
    if (!linkedInId) return false;
    try {
        const candidate = await getCandidateByLinkedInId(linkedInId);
        return !!candidate;
    } catch (err) {
        console.warn('[SCRM] Failed to query local candidate DB:', err.message);
        return false;
    }
}

// 获取或生成用户标识（插件暂不需要登录，用本地 UUID 标识用户）
async function getOrCreateUserId() {
    try {
        let userId = await getSetting('userId');
        if (!userId) {
            userId = crypto.randomUUID();
            await setSetting('userId', userId);
            console.log('[SCRM] Generated new userId:', userId);
        }
        return userId;
    } catch (e) {
        // Fallback: use a random ID if IndexedDB is not available
        return crypto.randomUUID();
    }
}

// 当检测到 LinkedIn 页面时，显示红色角标吸引用户点击
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && tab.url.includes('linkedin.com')) {
        chrome.action.setBadgeText({ text: "1", tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    }
});

// 创建定时同步闹钟：每 10 分钟检查一次
chrome.alarms.create('sync-check', { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'sync-check') {
        await performBackgroundSync();
    }
});

async function performBackgroundSync() {
    try {
        const base = await getApiBase();
        const lastSync = await getMeta('last_sync_at') || 0;
        const userId = await getOrCreateUserId();

        // 增量拉取
        const resp = await fetch(`${base}/api/v1/sync/pull?since=${lastSync}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-User-Id': userId
            }
        });

        if (!resp.ok) {
            console.warn('[SCRM] BG Sync pull failed:', resp.status);
            return;
        }

        const json = await resp.json();
        if (json.code !== 0) {
            console.warn('[SCRM] BG Sync pull error:', json.message);
            return;
        }

        const data = json.data;

        // 写入 IndexedDB
        await writeSyncDataToIndexedDB(data);

        // 更新同步时间
        await setMeta('last_sync_at', Date.now());

        // 通知前端刷新
        try {
            const views = await chrome.extension.getViews({ type: 'popup' });
            if (views.length > 0) {
                chrome.runtime.sendMessage({ type: 'DATA_UPDATED', source: 'background_sync' });
            }
        } catch (e) {
            // ignore
        }
    } catch (e) {
        console.error('[SCRM] BG Sync failed:', e);
    }
}

async function writeSyncDataToIndexedDB(data) {
    // db.js functions are available via importScripts (global scope)
    if (data.candidates?.length) {
        for (const c of data.candidates) {
            const mapped = mapBackendCandidateToFrontend(c);
            await dbPut('candidates', mapped);
        }
    }
    if (data.notes?.length) {
        for (const n of data.notes) {
            await dbPut('notes', n);
        }
    }
    if (data.history?.length) {
        for (const h of data.history) {
            await dbPut('history', h);
        }
    }
}

function mapBackendCandidateToFrontend(c) {
    let extra = {};
    try {
        if (c.rawProfileData) {
            extra = JSON.parse(c.rawProfileData);
        }
    } catch (e) { /* ignore */ }

    // Parse ISO date strings to timestamps
    const toTs = (val, fallback) => val ? new Date(val).getTime() : (fallback !== undefined ? fallback : null);

    return {
        id: c.id,
        localId: c.localId || '',
        serverId: c.id || null,
        name: c.fullName || '',
        headline: c.headline || '',
        company: c.company || '',
        location: c.location || '',
        linkedInId: c.linkedinId || '',
        linkedInUrl: c.linkedinUrl || '',
        emails: c.email ? [c.email] : [],
        phones: c.phone ? [c.phone] : [],
        temperature: c.temperature || 'Cold',
        source: c.source || 'extension',
        pipelineStage: c.pipelineStage || 'new',
        pipelinePosition: c.pipelinePosition || 0,
        pipelineEnteredAt: toTs(c.pipelineEnteredAt),
        keyMemory: extra.keyMemory || '',
        voiceMemo: extra.voiceMemo || '',
        contactMode: extra.contactMode || 'recruiting',
        skills: extra.skills || [],
        workExperiences: extra.workExperiences || [],
        educationExperiences: extra.educationExperiences || [],
        websites: extra.websites || [],
        tags: c.tags || '',
        nextFollowup: c.nextFollowupAt ? toTs(c.nextFollowupAt) : null,
        nextFollowupSource: c.nextFollowupSource || 'none',
        nextFollowupSequenceStepId: c.nextFollowupSequenceStepId || null,
        createdAt: toTs(c.createdAt, Date.now()),
        updatedAt: toTs(c.updatedAt, Date.now())
    };
}

async function getMeta(key) {
    try {
        const stored = await chrome.storage.local.get([key]);
        return stored[key] || null;
    } catch (e) {
        return null;
    }
}

async function setMeta(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch (e) {
        console.warn('[BG] setMeta failed:', e);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openPopup') {
        try {
            if (chrome.action.openPopup) {
                chrome.action.openPopup().catch(err => {
                    console.log('[SCRM] openPopup failed:', err);
                });
            }
        } catch (e) {
            console.log('[SCRM] openPopup error:', e);
        }
        return false;
    }

    if (request.type === 'CHAT_MESSAGE') {
        const directionLabel = request.payload.isInbound ? '收到' : '发送';
        const sender = request.payload.senderName || request.payload.sender;
        console.log(`[SCRM] ${directionLabel}消息 | ${sender}: "${request.payload.text}"`);
        console.log('[SCRM] Chat message full data:', request.payload);
        (async () => {
            try {
                const userId = await getOrCreateUserId();
                const base = await getApiBase();
                const url = `${base}/api/v1/chat-messages`;
                console.log(`[SCRM] Sending chat message to: ${url}`);
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-User-Id': userId
                    },
                    body: JSON.stringify(request.payload)
                });
                console.log(`[SCRM] Chat message API status: ${resp.status}`);
                if (!resp.ok) {
                    const text = await resp.text();
                    console.warn('[SCRM] Chat message API failed:', resp.status, text);
                    sendResponse({ success: false, error: `HTTP ${resp.status}: ${text}` });
                    return;
                }
                const json = await resp.json();
                if (json.code !== 0) {
                    console.warn('[SCRM] Chat message API error:', json.message);
                    sendResponse({ success: false, error: json.message });
                    return;
                }
                console.log('[SCRM] Chat message saved:', json.data);
                // Track chat-import event to backend
                try {
                    const trackBody = {
                        event_name: 'candidate_imported_chat',
                        event_data: JSON.stringify({ is_inbound: request.payload.isInbound, sender: request.payload.senderName }),
                        session_id: request.payload.sessionId || 'bg_' + Date.now()
                    };
                    fetch(`${base}/api/v1/events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-User-Id': userId },
                        body: JSON.stringify(trackBody)
                    }).catch(() => {});
                } catch (e) { /* ignore */ }
                sendResponse({ success: true, data: json.data });
                // Trigger background sync to pull new/updated candidate data
                performBackgroundSync().catch(e => console.warn('[SCRM] Post-chat sync failed:', e));
            } catch (err) {
                console.warn('[SCRM] Failed to save chat message:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.type === 'START_BACKGROUND_SYNC') {
        (async () => {
            await performBackgroundSync();
            sendResponse({ success: true });
        })();
        return true;
    }

    return false;
});
