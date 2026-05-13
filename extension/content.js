// content.js - 直接在 LinkedIn 页面执行

const CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

const extractLinkedInId = () => {
    const url = window.location.href;
    const match = url.match(/linkedin\.com\/in\/([^\/\?#]+)/);
    return match ? match[1] : '';
};

// ========== 工具函数 ==========

const uniqueStrings = (arr) => [...new Set(arr.filter(s => s && s.trim()))];

const extractBasicInfo = () => {
    const main = document.querySelector('main');
    if (!main) {
        return { name: '', headline: '', company: '', school: '' };
    }

    const h2Elements = Array.from(main.querySelectorAll('h2'));
    const name = h2Elements[0]?.innerText?.trim() || '';

    let headline = '';
    let country = '';
    let company = '';
    let school = '';

    if (h2Elements[0]) {
        const h2El = h2Elements[0];
        const allElements = Array.from(main.querySelectorAll('*'));
        const h2Index = allElements.indexOf(h2El);

        if (h2Index !== -1) {
            const relevantElements = [];
            for (let i = h2Index + 1; i < allElements.length; i++) {
                const el = allElements[i];
                if (el.tagName === 'P' || el.tagName === 'FIGURE') {
                    const parentIndex = relevantElements.findIndex(re => re.contains && re.contains(el));
                    if (parentIndex === -1) {
                        relevantElements.push(el);
                    }
                }
            }

            let pCount = 0;
            for (const el of relevantElements) {
                if (el.tagName === 'P') {
                    pCount++;
                    const text = el.innerText?.trim() || '';
                    if (!text) continue;

                    if (pCount === 1) {
                        headline = text;
                    } else if (pCount === 3) {
                        country = text;
                    }
                } else if (el.tagName === 'FIGURE') {
                    const figIndex = relevantElements.indexOf(el);
                    for (let j = figIndex + 1; j < relevantElements.length; j++) {
                        if (relevantElements[j].tagName === 'P') {
                            const text = relevantElements[j].innerText?.trim() || '';
                            if (text) {
                                if (!company) {
                                    company = text;
                                } else if (!school) {
                                    school = text;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    return { name, headline, company, school };
};

const extractLazyLoadedInfo = async () => {
    const main = document.querySelector('main');
    const data = {
        summary: '',
        skills: [],
        workExperiences: [],
        educationExperiences: []
    };

    if (!main) return data;

    const h2Elements = Array.from(main.querySelectorAll('h2'));
    const pElements = Array.from(main.querySelectorAll('p'));

    // 个人简介
    const profileH2Index = h2Elements.findIndex(h => {
        const text = h.innerText?.trim() || '';
        return text === '个人简介' || text === 'About';
    });
    if (profileH2Index !== -1) {
        const h2El = h2Elements[profileH2Index];
        let span = h2El.parentElement?.nextElementSibling?.querySelector('span[data-testid="expandable-text-box"]');
        if (!span) {
            span = h2El.closest('section, div')?.querySelector('span[data-testid="expandable-text-box"]');
        }
        if (!span) {
            const allSpans = Array.from(main.querySelectorAll('span[data-testid="expandable-text-box"]'));
            const h2Rect = h2El.getBoundingClientRect();
            span = allSpans.find(s => {
                const r = s.getBoundingClientRect();
                return r.top > h2Rect.bottom;
            });
        }
        if (span) {
            data.summary = span.innerText?.trim() || '';
        }
    }

    // 技能
    const hotSkillsIndex = pElements.findIndex(p => {
        const text = p.innerText?.trim() || '';
        return text === '热门技能' || text === 'Top skills';
    });
    if (hotSkillsIndex !== -1 && pElements[hotSkillsIndex + 1]) {
        const skillsText = pElements[hotSkillsIndex + 1].innerText?.trim() || '';
        data.skills = skillsText.split(/[•·]/).map(s => s.trim()).filter(s => s.length > 0);
    }

    // 工作经历
    const workH2Index = h2Elements.findIndex(h => {
        const text = h.innerText?.trim() || '';
        return text === '工作经历' || text === 'Experience';
    });
    const eduH2Index = h2Elements.findIndex(h => {
        const text = h.innerText?.trim() || '';
        return text === '教育经历' || text === 'Education';
    });

    if (workH2Index !== -1) {
        const workSection = h2Elements[workH2Index].closest('section, div[class*="artdeco"]') || h2Elements[workH2Index].parentElement;
        const allLinks = workSection ? Array.from(workSection.querySelectorAll('a[tabindex="0"]')) : [];

        const workLinks = allLinks.filter(link => {
            const posToWork = link.compareDocumentPosition(h2Elements[workH2Index]);
            const isAfterWork = posToWork & Node.DOCUMENT_POSITION_PRECEDING;
            if (!isAfterWork) return false;
            if (eduH2Index !== -1) {
                const posToEdu = link.compareDocumentPosition(h2Elements[eduH2Index]);
                const isBeforeEdu = posToEdu & Node.DOCUMENT_POSITION_FOLLOWING;
                return isBeforeEdu;
            }
            return true;
        });

        data.workExperiences = workLinks.map((link) => {
            const allPs = Array.from(link.querySelectorAll('p'));
            const title = allPs[0]?.innerText?.trim() || '';
            const companyRaw = allPs[1]?.innerText?.trim() || '';
            const duration = allPs[2]?.innerText?.trim() || '';
            const location = allPs[3]?.innerText?.trim() || '';
            const description = allPs[4]?.innerText?.trim() || '';

            let company = companyRaw;
            if (companyRaw.includes('·')) {
                const parts = companyRaw.split('·').map(s => s.trim()).filter(Boolean);
                company = parts[0] || '';
            }

            return { company, title, duration, location, description };
        }).filter(exp => {
            const isEmpty = !exp.company && !exp.title && !exp.duration;
            return !isEmpty;
        });
    }

    // 教育经历
    if (eduH2Index !== -1) {
        const eduSection = h2Elements[eduH2Index].closest('section, div[class*="artdeco"]') || h2Elements[eduH2Index].parentElement;
        const allLinks = eduSection ? Array.from(eduSection.querySelectorAll('a[tabindex="0"]')) : [];

        const eduLinks = allLinks.filter(link => {
            const posToEdu = link.compareDocumentPosition(h2Elements[eduH2Index]);
            return posToEdu & Node.DOCUMENT_POSITION_PRECEDING;
        });

        const INVALID_KEYWORDS = ['关于', '无障碍模式', '人才解决方案', '社区准则', '招聘专版', '营销解决方案', '广告设置', '广告', '销售解决方案', '移动端', '小型企业', '安全中心', '需要咨询', '管理帐号', '推荐透明度', '隐私政策', '用户协议'];

        data.educationExperiences = eduLinks.map((link) => {
            const allPs = Array.from(link.querySelectorAll('p'));
            return {
                school: allPs[0]?.innerText?.trim() || '',
                major: allPs[1]?.innerText?.trim() || '',
                duration: allPs[2]?.innerText?.trim() || ''
            };
        }).filter(edu => {
            const text = (edu.school + ' ' + edu.major + ' ' + edu.duration).toLowerCase();
            const isEmpty = !edu.school && !edu.major && !edu.duration;
            if (isEmpty) return false;
            const isFooter = INVALID_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
            if (isFooter) return false;
            const isSocial = edu.major.includes('度+') || edu.duration.includes('度+') || /\d+\s*度\+/.test(edu.major) || /\d+\s*度\+/.test(edu.duration);
            if (isSocial) return false;
            return true;
        });
    }

    return data;
};

function doScroll(delta) {
    const before = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    window.scrollBy({ top: delta, behavior: 'instant' });
    let after = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    if (Math.abs(after - before) < 10) {
        const el = document.scrollingElement || document.documentElement || document.body;
        el.scrollTop += delta;
        after = el.scrollTop;
    }

    if (Math.abs(after - before) < 10) {
        const viewport = document.querySelector('.scaffold-layout__main, main, [class*="scaffold"], #main');
        if (viewport) {
            viewport.scrollTop += delta;
            after = viewport.scrollTop;
        }
    }

    return after - before;
}

async function scrollUntilNoNewContent() {
    let scrollCount = 0;
    let lastScrollTop = -1;
    let stuckCount = 0;

    while (true) {
        const delta = Math.floor(window.innerHeight * 0.8);
        const scrolled = doScroll(delta);
        scrollCount++;
        await new Promise(r => setTimeout(r, 100));

        const currentScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

        if (Math.abs(currentScrollTop - lastScrollTop) < 2) {
            stuckCount++;
            if (stuckCount >= 2) break;
        } else {
            stuckCount = 0;
        }
        lastScrollTop = currentScrollTop;
        await new Promise(r => setTimeout(r, 100));
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    const scrollEl = document.scrollingElement || document.documentElement || document.body;
    if (scrollEl) scrollEl.scrollTop = 0;
    const viewport = document.querySelector('.scaffold-layout__main, main, [class*="scaffold"], #main');
    if (viewport) viewport.scrollTop = 0;
    await new Promise(r => setTimeout(r, 800));
}

function cleanLinkedInDegree(text) {
    if (!text) return text;
    // 移除 "1度", "2度", "3度" 及 "1度+", "2度+" 等 LinkedIn 连接度信息
    return text.replace(/\d+\s*度\+?/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchAndCacheData(force = false) {
    const linkedInId = extractLinkedInId();
    if (!linkedInId) return null;

    const cacheKey = `linkedin_cache_${linkedInId}`;

    if (!force) {
        try {
            const cached = await chrome.storage.local.get([cacheKey]);
            if (cached[cacheKey] && (Date.now() - cached[cacheKey].cachedAt < CACHE_TTL)) {
                return cached[cacheKey];
            }
        } catch (e) {}
    }

    await scrollUntilNoNewContent();
    const basic = extractBasicInfo();
    const lazy = await extractLazyLoadedInfo();

    const data = {
        name: basic.name || '',
        headline: cleanLinkedInDegree(basic.headline) || '',
        company: cleanLinkedInDegree(basic.company) || '',
        school: cleanLinkedInDegree(basic.school) || '',
        summary: cleanLinkedInDegree(lazy.summary) || '',
        skills: (lazy.skills || []).map(cleanLinkedInDegree).filter(Boolean),
        workExperiences: (lazy.workExperiences || []).map(exp => ({
            company: cleanLinkedInDegree(exp.company) || '',
            title: cleanLinkedInDegree(exp.title) || '',
            duration: cleanLinkedInDegree(exp.duration) || '',
            location: cleanLinkedInDegree(exp.location) || '',
            description: cleanLinkedInDegree(exp.description) || ''
        })),
        educationExperiences: (lazy.educationExperiences || []).map(edu => ({
            school: cleanLinkedInDegree(edu.school) || '',
            major: cleanLinkedInDegree(edu.major) || '',
            duration: cleanLinkedInDegree(edu.duration) || ''
        })),
        linkedInId: linkedInId,
        cachedAt: Date.now()
    };

    await chrome.storage.local.set({ [cacheKey]: data });
    return data;
}

function isCandidateProfilePage() {
    const url = window.location.href;
    return /linkedin\.com\/in\/[^\/]+\/?/.test(url);
}

async function autoScrollIfCandidatePage() {
    if (!isCandidateProfilePage()) return;
    await new Promise(r => setTimeout(r, 1000));
    try {
        await fetchAndCacheData(false);
    } catch (err) {}
}
autoScrollIfCandidatePage();

let lastLinkedInId = extractLinkedInId();
new MutationObserver(() => {
    const currentLinkedInId = extractLinkedInId();
    if (currentLinkedInId && currentLinkedInId !== lastLinkedInId) {
        lastLinkedInId = currentLinkedInId;
        autoScrollIfCandidatePage();
    }
}).observe(document, { subtree: true, childList: true });

// Voice recording state in content script
let contentRecognition = null;
let pendingStop = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrape') {
        (async () => {
            try {
                const data = await fetchAndCacheData(false);
                if (!data) {
                    sendResponse({ success: false, error: '未找到候选人数据' });
                    return;
                }
                sendResponse({ success: true, data: data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'forceScrapeAndCache') {
        (async () => {
            try {
                const data = await fetchAndCacheData(true);
                if (!data) {
                    sendResponse({ success: false, error: '未找到候选人数据' });
                    return;
                }
                sendResponse({ success: true, data: data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'startVoiceRecording') {
        (async () => {
            try {
                // 显式请求麦克风权限 - 浏览器会弹出原生权限框
                console.log('[SCRM] Requesting microphone permission...');
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                console.log('[SCRM] Microphone permission granted');

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    console.log('[SCRM] SpeechRecognition not supported');
                    chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: 'not supported' });
                    sendResponse({ success: false, error: 'not supported' });
                    return;
                }

                contentRecognition = new SpeechRecognition();
                contentRecognition.lang = 'en-US';
                contentRecognition.continuous = true;  // 持续模式，直到用户点击停止
                contentRecognition.interimResults = true;

                let transcript = '';
                let hasRealError = false;

                contentRecognition.onresult = (event) => {
                    // 累加所有结果（包括 interim 和 final）
                    transcript = '';
                    for (let i = 0; i < event.results.length; i++) {
                        transcript += event.results[i][0].transcript;
                    }
                    console.log('[SCRM] Speech recognition result:', transcript);
                    // 实时发送给 popup，边说边显示
                    chrome.runtime.sendMessage({ action: 'voiceRecordingInterim', text: transcript });
                };
                contentRecognition.onerror = (event) => {
                    // aborted 是主动 stop() 导致的正常错误，不算真正的错误
                    if (event.error === 'aborted') {
                        console.log('[SCRM] Speech recognition aborted (normal stop)');
                        return;
                    }
                    hasRealError = true;
                    console.log('[SCRM] Speech recognition error:', event.error);
                    chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: event.error });
                    contentRecognition = null;
                };
                contentRecognition.onend = () => {
                    console.log('[SCRM] Speech recognition ended, transcript:', transcript, 'hasRealError:', hasRealError);
                    // 真正出错时 onerror 已经发送了消息，这里避免重复发送
                    if (!hasRealError) {
                        chrome.runtime.sendMessage({ action: 'voiceRecordingResult', text: transcript });
                    }
                    contentRecognition = null;
                };
                contentRecognition.start();
                console.log('[SCRM] Speech recognition started');
                sendResponse({ success: true });

                // 如果 start 之前收到了 stop 请求，立即 stop
                if (pendingStop) {
                    pendingStop = false;
                    console.log('[SCRM] Pending stop detected, stopping immediately');
                    try { contentRecognition.stop(); } catch (e) {}
                }
            } catch (err) {
                console.log('[SCRM] Start recording error:', err);
                if (err.name === 'NotAllowedError') {
                    chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: 'not-allowed' });
                } else {
                    chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: err.message || err.name || 'unknown' });
                }
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'stopVoiceRecording') {
        console.log('[SCRM] Stop voice recording requested');
        if (contentRecognition) {
            try { contentRecognition.stop(); } catch (e) {}
        } else {
            // 如果 recognition 还没创建，设置 pending stop，等 start 后立即 stop
            pendingStop = true;
            console.log('[SCRM] No active recognition, setting pending stop');
        }
        sendResponse({ success: true });
        return false;
    }
});

// ========== Shadow DOM 穿透查询工具 ==========

function deepQuerySelector(selector, root = document) {
    const el = root.querySelector(selector);
    if (el) return el;
    const all = root.querySelectorAll('*');
    for (const node of all) {
        if (node.shadowRoot) {
            const found = deepQuerySelector(selector, node.shadowRoot);
            if (found) return found;
        }
    }
    return null;
}

function deepQuerySelectorAll(selector, root = document) {
    let results = [...root.querySelectorAll(selector)];
    const all = root.querySelectorAll('*');
    for (const node of all) {
        if (node.shadowRoot) {
            results = results.concat(deepQuerySelectorAll(selector, node.shadowRoot));
        }
    }
    return results;
}

// ========== LinkedIn Message Scraper ==========

class LinkedInMessageScraper {
    // 备选选择器列表（按优先级）
    static CONTAINER_SELECTORS = [
        // === 浮动聊天窗口（右下角气泡）===
        '.msg-overlay-bubble .msg-s-message-list',                   // 浮动窗口内的消息列表
        '.msg-overlay-bubble .msg-s-message-list-content',
        '.msg-overlay-bubble',                                       // 浮动聊天窗口整体
        '.msg-overlay-conversation-bubble .msg-s-message-list',      // 旧版 class
        '.msg-overlay-conversation-bubble',
        '[data-test-conversation-bubble] .msg-s-message-list',
        // === 全屏 messaging 页面 ===
        '.msg-s-message-list',           // 首选：滚动区域
        '.msg-s-message-list-content',     // 备选：ul 列表本身
        '.msg-s-message-list-container',   // 兜底：外层容器
        '[class*="msg-s-message-list"]',   // 终极兜底：属性包含匹配
        // === 新版 LinkedIn UI 宽泛兜底 ===
        '[class*="overlay-bubble"]',     // 匹配 msg-overlay-bubble / msg-overlay-conversation-bubble
        '[class*="message-list"]'
    ];

    static MESSAGE_ITEM_SELECTORS = [
        '.msg-s-event-listitem',           // 单条消息
        '[data-event-urn]'                 // 终极兜底：有消息 ID 属性的元素
    ];

    static TEXT_SELECTORS = [
        '.msg-s-event-listitem__body',     // 消息文本
        '.msg-s-event__content p'          // 备选
    ];

    constructor() {
        this.seen = new Set();
        this.observer = null;
        this.conversationId = null;
        this.onMessage = null;
        this._stopped = false;
    }

    // 找一个存在的容器（支持 Shadow DOM）
    async findContainer() {
        console.log('[SCRM] ===== 开始查找消息容器 =====');
        for (const selector of LinkedInMessageScraper.CONTAINER_SELECTORS) {
            // 先尝试普通查询
            const els = document.querySelectorAll(selector);
            console.log(`[SCRM] 容器选择器 "${selector}" (document) 匹配到 ${els.length} 个元素`);
            if (els.length > 0) {
                console.log('[SCRM] 使用容器:', selector);
                return els[0];
            }
            // 再尝试穿透 Shadow DOM
            const deepEl = deepQuerySelector(selector);
            if (deepEl) {
                console.log(`[SCRM] 使用容器 (Shadow DOM): ${selector}`);
                return deepEl;
            }
        }
        console.warn('[SCRM] 未找到消息容器');
        return null;
    }

    extractConversationId() {
        const url = window.location.href;
        const match = url.match(/\/messaging\/thread\/([^\/?#]+)/);
        this.conversationId = match ? match[1] : '';
    }

    findBubble(el) {
        // 从消息元素向上找所在的聊天窗口
        return el.closest('.msg-overlay-conversation-bubble, .msg-overlay-bubble, [class*="msg-overlay-conversation-bubble"]');
    }

    extractOtherLinkedInId(el) {
        const bubble = this.findBubble(el);
        if (bubble) {
            // 优先从聊天窗口 header 标题中找
            const headerLink = bubble.querySelector('.msg-overlay-bubble-header__title a[href*="/in/"]');
            if (headerLink) {
                const href = headerLink.getAttribute('href') || '';
                const m = href.match(/\/in\/([^\/?#]+)/);
                if (m) return m[1];
            }
            // 备选：从聊天窗口内的 profile card 找
            const profileLink = bubble.querySelector('.msg-s-profile-card a[href*="/in/"], .msg-s-profile-card a[href*="/in/ACo"]');
            if (profileLink) {
                const href = profileLink.getAttribute('href') || '';
                const m = href.match(/\/in\/([^\/?#]+)/);
                if (m) return m[1];
            }
        }
        // 兜底：从消息元素内的发送者链接找
        const senderLink = el.querySelector('a[href*="/in/"]');
        if (senderLink) {
            const href = senderLink.getAttribute('href') || '';
            const m = href.match(/\/in\/([^\/?#]+)/);
            if (m) return m[1];
        }
        return '';
    }

    extractOtherName(el) {
        const bubble = this.findBubble(el);
        if (bubble) {
            // 优先从聊天窗口 header 标题中找
            const titleEl = bubble.querySelector('.msg-overlay-bubble-header__title');
            if (titleEl) {
                const text = titleEl.innerText?.trim() || '';
                if (text) return text;
            }
            // 备选：从 profile card 找
            const nameEl = bubble.querySelector('.msg-s-profile-card .artdeco-entity-lockup__title a span, .msg-s-profile-card a[href*="/in/"] span');
            if (nameEl) {
                return nameEl.innerText?.trim() || '';
            }
        }
        // 兜底：从消息内的发送者名字找
        const senderEl = el.querySelector('.msg-s-message-group__name');
        if (senderEl) {
            return senderEl.innerText?.trim() || '';
        }
        return '';
    }

    start(callback) {
        this.onMessage = callback;
        this._stopped = false;
        console.log('[SCRM] ===== MessageScraper 启动 =====');

        this.findContainer().then(container => {
            if (this._stopped) return;
            this.extractConversationId();
            console.log(`[SCRM] 当前会话 ID: ${this.conversationId || '(未提取到)'}`);
            this.watch(container);
            this.scan(container);
        }).catch(err => {
            console.error('[SCRM] Failed to find chat container:', err);
        });
    }

    stop() {
        this._stopped = true;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.seen.clear();
    }

    watch(container) {
        // 观察目标：如果容器在 Shadow DOM 内，直接观察容器；否则观察 body 捕获 Shadow Host 变化
        const observeTarget = container || document.body;
        this.observer = new MutationObserver(muts => {
            if (this._stopped) return;
            let newMsgCount = 0;
            const hasNew = muts.some(m => [...m.addedNodes].some(n => {
                if (n.nodeType !== 1) return false;
                // 检查新增节点是否是消息项，或包含消息项
                const isMsg = n.matches?.('.msg-s-event-listitem') ||
                    n.querySelector?.('.msg-s-event-listitem') ||
                    n.classList?.contains('msg-s-message-list__event'); // li 的 class
                if (isMsg) newMsgCount++;
                return isMsg;
            }));

            if (hasNew) {
                console.log(`[SCRM] MutationObserver 检测到 ${newMsgCount} 个新增消息相关节点，触发扫描`);
                setTimeout(() => this.scan(container), 100);
            }
        });

        this.observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('[SCRM] MutationObserver 已开始监听变化');
    }

    scan(container) {
        if (this._stopped) return;
        console.log('[SCRM] ===== 开始扫描消息 =====');

        let items = [];

        // 第1步：尝试在容器内搜索（普通 DOM）
        if (container) {
            items = [...container.querySelectorAll('.msg-s-event-listitem')];
            console.log(`[SCRM] 容器内 ".msg-s-event-listitem" 匹配到 ${items.length} 个元素`);
        }

        // 第2步：如果容器内没找到，穿透 Shadow DOM 搜索
        if (items.length === 0) {
            items = deepQuerySelectorAll('.msg-s-event-listitem');
            console.log(`[SCRM] Shadow DOM 穿透 ".msg-s-event-listitem" 匹配到 ${items.length} 个元素`);
        }

        // 第3步：备选 data-event-urn
        if (items.length === 0) {
            items = deepQuerySelectorAll('[data-event-urn]');
            console.log(`[SCRM] Shadow DOM 穿透 "[data-event-urn]" 匹配到 ${items.length} 个元素`);
        }

        let parsedCount = 0;
        items.forEach(el => {
            const wasParsed = this.parse(el);
            if (wasParsed) parsedCount++;
        });
        console.log(`[SCRM] 扫描完成: 共 ${items.length} 条消息元素，新解析 ${parsedCount} 条，已缓存 ${this.seen.size} 条`);
    }

    parse(el) {
        const id = el.getAttribute('data-event-urn') || this.hash(el);
        if (this.seen.has(id)) return false;

        console.log('[SCRM] --- 解析消息元素 ---');

        // 打印元素 class，用于调试 isInbound 判断
        const classList = Array.from(el.classList || []).join(', ');
        console.log(`[SCRM] 元素 classList: [${classList}]`);
        const hasOtherClass = el.classList.contains('msg-s-event-listitem--other');
        console.log(`[SCRM] 是否包含 'msg-s-event-listitem--other': ${hasOtherClass}`);

        // 多备选找文本
        let text = '';
        let matchedSelector = '';
        for (const sel of LinkedInMessageScraper.TEXT_SELECTORS) {
            const found = el.querySelector(sel);
            console.log(`[SCRM] 文本选择器 "${sel}" 匹配: ${found ? '✓' : '✗'}`);
            if (found) { text = found.innerText?.trim(); matchedSelector = sel; break; }
        }

        if (!text) {
            console.log('[SCRM] 未提取到文本，跳过此元素');
            return false;
        }
        console.log(`[SCRM] 文本提取成功 (选择器: ${matchedSelector}): "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);

        const isInbound = el.classList.contains('msg-s-event-listitem--other');
        const sender = el.querySelector('.msg-s-message-group__name')?.innerText?.trim() || (isInbound ? 'Them' : 'Me');
        const time = this.parseTime(el);
        const otherLinkedInId = this.extractOtherLinkedInId(el);
        const otherName = this.extractOtherName(el);

        const linkedInUrl = otherLinkedInId ? `https://www.linkedin.com/in/${otherLinkedInId}/` : '';
        const msg = {
            id,
            conversationId: this.conversationId,
            text,
            isInbound,
            sender,
            timestamp: time,
            linkedInId: otherLinkedInId,
            linkedInUrl,
            senderName: otherName || sender
        };

        // 在 console 中打印出来，方便调试
        const directionLabel = isInbound ? '收到' : '发送';
        const targetName = otherName || sender;
        console.log(`[SCRM] ${directionLabel}消息 | ${targetName}: "${text}"`);
        console.log('[SCRM] Chat message full data:', msg);

        this.onMessage?.(msg);

        this.seen.add(id);
        return true;
    }

    parseTime(el) {
        const timeEl = el.querySelector('.msg-s-message-group__timestamp');
        const timeText = timeEl?.innerText || '';

        // 找最近的日期分组标题（如 "4月17日"、"今天"）
        let dateText = '';
        let prev = el.previousElementSibling;
        while (prev) {
            const heading = prev.querySelector?.('.msg-s-message-list__time-heading');
            if (heading) { dateText = heading.innerText.trim(); break; }
            prev = prev.previousElementSibling;
        }

        return this.toISO(dateText, timeText);
    }

    toISO(dateStr, timeStr) {
        const now = new Date();
        let y = now.getFullYear(), m, d;

        if (dateStr.includes('今天')) {
            m = now.getMonth() + 1; d = now.getDate();
        } else if (dateStr.includes('昨天')) {
            const yest = new Date(now - 864e5);
            m = yest.getMonth() + 1; d = yest.getDate();
        } else {
            const match = dateStr.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
            if (match) { y = match[1] || y; m = +match[2]; d = +match[3]; }
        }

        const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
        return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).toISOString();
    }

    hash(el) {
        const text = el.innerText?.trim()?.slice(0, 50);
        let h = 0;
        for (const c of (text + '')) h = ((h << 5) - h) + c.charCodeAt(0);
        return 'msg_' + Math.abs(h).toString(36);
    }
}

// ===== 使用 =====
let messageScraper = null;

function isLinkedInPage() {
    const url = window.location.href;
    return url.includes('linkedin.com');
}

function hasChatContainer() {
    console.log('[SCRM] ===== 检查聊天容器 =====');
    // 先尝试找容器（普通 DOM）
    for (const selector of LinkedInMessageScraper.CONTAINER_SELECTORS) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
            console.log(`[SCRM] 聊天容器命中: "${selector}" → ${els.length} 个元素`);
            return true;
        }
    }
    // 再尝试穿透 Shadow DOM 找容器
    for (const selector of LinkedInMessageScraper.CONTAINER_SELECTORS) {
        const el = deepQuerySelector(selector);
        if (el) {
            console.log(`[SCRM] 聊天容器命中 (Shadow DOM): "${selector}"`);
            return true;
        }
    }
    // 备选：直接找消息元素（穿透 Shadow DOM）
    const msgItems = deepQuerySelectorAll('.msg-s-event-listitem, [data-event-urn]');
    if (msgItems.length > 0) {
        console.log(`[SCRM] 未找到容器，但 Shadow DOM 内检测到 ${msgItems.length} 条消息元素，视为聊天已打开`);
        return true;
    }
    console.log('[SCRM] 所有聊天容器选择器均未命中（含 Shadow DOM），也未找到消息元素');
    return false;
}

function startMessageScraper() {
    if (!isLinkedInPage()) {
        console.log('[SCRM] 当前不是 LinkedIn 页面，跳过启动');
        return;
    }
    if (!hasChatContainer()) {
        console.log('[SCRM] LinkedIn 页面未检测到聊天容器，暂不启动 scraper（等待用户打开聊天窗口）');
        return;
    }
    if (messageScraper && !messageScraper._stopped) {
        console.log('[SCRM] scraper 已在运行中，跳过重复启动');
        return;
    }
    console.log('[SCRM] startMessageScraper() 被调用');
    if (messageScraper) {
        console.log('[SCRM] 停止旧的 scraper');
        messageScraper.stop();
    }
    messageScraper = new LinkedInMessageScraper();
    messageScraper.start(msg => {
        chrome.runtime.sendMessage({ type: 'CHAT_MESSAGE', payload: msg });
    });
}

function stopMessageScraper() {
    if (messageScraper) {
        console.log('[SCRM] stopMessageScraper() 被调用');
        messageScraper.stop();
        messageScraper = null;
    }
}

// 页面加载时检查
if (isLinkedInPage()) {
    console.log('[SCRM] 当前是 LinkedIn 页面，1.5秒后检查聊天容器');
    setTimeout(startMessageScraper, 1500);
} else {
    console.log('[SCRM] 当前不是 LinkedIn 页面，不启动消息监听');
}

// 监听 DOM 变化：当聊天窗口出现/消失时自动启停 scraper
let chatObserver = null;
function startChatPresenceObserver() {
    if (chatObserver) return;
    let hadContainer = hasChatContainer();
    console.log(`[SCRM] 启动聊天容器监听，当前状态: ${hadContainer ? '有容器' : '无容器'}`);

    chatObserver = new MutationObserver(() => {
        const hasNow = hasChatContainer();
        if (hasNow && !hadContainer) {
            console.log('[SCRM] 检测到聊天容器出现，启动 scraper');
            setTimeout(startMessageScraper, 500);
        } else if (!hasNow && hadContainer) {
            console.log('[SCRM] 检测到聊天容器消失，停止 scraper');
            stopMessageScraper();
        }
        hadContainer = hasNow;
    });
    chatObserver.observe(document.body, { childList: true, subtree: true });
}

if (isLinkedInPage()) {
    startChatPresenceObserver();
}

// SPA 路由变化监听（离开 LinkedIn 时停止一切）
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        console.log(`[SCRM] 路由变化: ${lastUrl} → ${url}`);
        lastUrl = url;
        if (!isLinkedInPage()) {
            console.log('[SCRM] 已离开 LinkedIn，停止所有监听');
            stopMessageScraper();
            if (chatObserver) {
                chatObserver.disconnect();
                chatObserver = null;
            }
        } else if (!chatObserver) {
            console.log('[SCRM] 进入 LinkedIn，重新启动容器监听');
            startChatPresenceObserver();
            setTimeout(startMessageScraper, 1500);
        }
    }
}).observe(document, { subtree: true, childList: true });

window.addEventListener('beforeunload', () => stopMessageScraper());
