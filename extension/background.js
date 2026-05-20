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
        const senderName = request.payload.senderName || request.payload.sender;
        console.log(`[SCRM] ${directionLabel}消息 | ${senderName}: "${request.payload.text}"`);
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
            } catch (err) {
                console.warn('[SCRM] Failed to save chat message:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    return false;
});
