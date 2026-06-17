// content.js - 直接在 LinkedIn 页面执行

// === 调试开关：提交前设为 false ===
const DEBUG = true;
const log = DEBUG ? console.log.bind(console) : () => {};
const debug = DEBUG ? console.debug.bind(console) : () => {};

log('[SCRM_DEBUG] content.js loaded, DEBUG=', DEBUG, 'url=', location.href);

const CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

const extractLinkedInId = () => {
    // ==================== 第一梯队：从 DOM 提取真实 URN ID ====================

    // 优先级 1：Messaging Compose 链接的 recipient 参数（最干净，无需 decode）
    const msgLinks = document.querySelectorAll('a[href*="/messaging/compose/"]');
    for (const link of msgLinks) {
        const href = link.getAttribute('href') || '';
        const recipientMatch = href.match(/recipient=([A-Za-z0-9_-]+)/);
        if (recipientMatch) {
            const id = recipientMatch[1];
            if (id.startsWith('ACo')) {
                log('[SCRM] extractLinkedInId: URN from messaging recipient:', id);
                return id;
            }
        }
        // 方式 B：从 profileUrn 提取（需要 decodeURIComponent）
        const urnMatch = href.match(/profileUrn=urn%3Ali%3Afsd_profile%3A([^&]+)/);
        if (urnMatch) {
            const id = decodeURIComponent(urnMatch[1]);
            if (id.startsWith('ACo')) {
                log('[SCRM] extractLinkedInId: URN from messaging profileUrn:', id);
                return id;
            }
        }
    }

    // 优先级 2：Connection Of 搜索链接
    const connLinks = document.querySelectorAll('a[href*="connectionOf="]');
    for (const link of connLinks) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/connectionOf=%5B%22([A-Za-z0-9_-]+)%22%5D/);
        if (match) {
            const id = match[1];
            if (id.startsWith('ACo')) {
                log('[SCRM] extractLinkedInId: URN from connectionOf:', id);
                return id;
            }
        }
    }

    // 优先级 3：Component Key（React/Vue 组件 key）
    const compEls = document.querySelectorAll('[componentkey*="refACo"]');
    for (const el of compEls) {
        const key = el.getAttribute('componentkey') || '';
        const match = key.match(/ref([A-Za-z0-9_-]+)(?:Topcard|Activity|About|Skills|Experience)/);
        if (match) {
            const id = match[1];
            if (id.startsWith('ACo')) {
                log('[SCRM] extractLinkedInId: URN from componentkey:', id);
                return id;
            }
        }
    }

    // ==================== 第二梯队：URL Slug 兜底 ====================
    const url = window.location.href;
    const match = url.match(/linkedin\.com\/in\/([^\/\?#]+)/);
    if (match) {
        const slug = decodeURIComponent(match[1]);
        log('[SCRM] extractLinkedInId: fallback to URL slug:', slug);
        return slug;
    }

    log('[SCRM] extractLinkedInId: failed to extract any LinkedIn ID');
    return '';
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

            // 取名字下方、第一个 FIGURE（公司/学校 logo）之前的 <p>
            // LinkedIn 新版：前面几个 <p> 常是 "· 1度" / "· 2度" 等连接度，要跳过这些无意义文本，取第一个真正的 headline
            const firstFigureIndex = relevantElements.findIndex(el => el.tagName === 'FIGURE');
            const headlineEndIndex = firstFigureIndex === -1 ? relevantElements.length : firstFigureIndex;

            const pTextsBeforeFigure = [];
            for (let i = 0; i < headlineEndIndex; i++) {
                const el = relevantElements[i];
                if (el.tagName === 'P') {
                    pTextsBeforeFigure.push({ index: pTextsBeforeFigure.length + 1, raw: el.innerText?.trim() || '', cleaned: cleanLinkedInDegree(el.innerText?.trim() || '') });
                }
            }
            log('[SCRM_DEBUG] <p> elements before first figure:', pTextsBeforeFigure);

            // 判断一段文本是否只是连接度/分隔符垃圾信息
            const isMeaninglessText = (text) => {
                if (!text) return true;
                const stripped = text.replace(/[·•\s\-|]+/g, '');
                return stripped.length === 0;
            };

            let meaningfulPCount = 0;
            for (let i = 0; i < headlineEndIndex; i++) {
                const el = relevantElements[i];
                if (el.tagName !== 'P') continue;
                const text = cleanLinkedInDegree(el.innerText?.trim() || '');
                if (isMeaninglessText(text)) continue;

                meaningfulPCount++;
                if (meaningfulPCount === 1) {
                    // headline 通常是 "Product Engineer | Specializing in ..."，取岗位部分
                    headline = text.split('|')[0].trim();
                    break;
                } else if (meaningfulPCount === 3) {
                    country = text;
                }
            }

            // 兜底：如果没有找到有效 headline，尝试第一个非空 <p>
            if (!headline) {
                for (let i = 0; i < headlineEndIndex; i++) {
                    const el = relevantElements[i];
                    if (el.tagName !== 'P') continue;
                    const text = cleanLinkedInDegree(el.innerText?.trim() || '');
                    if (text) {
                        headline = text.split('|')[0].trim();
                        break;
                    }
                }
            }

            log('[SCRM_DEBUG] final headline:', headline);

            for (const el of relevantElements) {
                if (el.tagName === 'FIGURE') {
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
    // DEBUG 模式下强制重新抓取，方便看日志
    const effectiveForce = force || DEBUG;
    log('[SCRM_DEBUG] fetchAndCacheData called, force=', force, 'effectiveForce=', effectiveForce);
    const linkedInId = extractLinkedInId();
    log('[SCRM_DEBUG] extractLinkedInId result:', linkedInId);
    if (!linkedInId) return null;

    const cacheKey = `linkedin_cache_${linkedInId}`;

    if (!effectiveForce) {
        try {
            const cached = await chrome.storage.local.get([cacheKey]);
            if (cached[cacheKey] && (Date.now() - cached[cacheKey].cachedAt < CACHE_TTL)) {
                log('[SCRM_DEBUG] cache hit, skip scraping');
                return cached[cacheKey];
            }
            log('[SCRM_DEBUG] cache miss or expired');
        } catch (e) {}
    } else {
        log('[SCRM_DEBUG] DEBUG mode: force scrape');
    }

    log('[SCRM_DEBUG] start scrolling & scraping');
    await scrollUntilNoNewContent();
    log('[SCRM_DEBUG] calling extractBasicInfo');
    const basic = extractBasicInfo();
    log('[SCRM_DEBUG] extractBasicInfo result:', basic);
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
    log('[SCRM_BASE] content.js scraped data:', JSON.stringify(data));

    await chrome.storage.local.set({ [cacheKey]: data });
    return data;
}

function isCandidateProfilePage() {
    const url = window.location.href;
    return /linkedin\.com\/in\/[^\/]+\/?/.test(url);
}

async function autoScrollIfCandidatePage() {
    log('[SCRM_DEBUG] autoScrollIfCandidatePage, isCandidateProfilePage=', isCandidateProfilePage());
    if (!isCandidateProfilePage()) return;
    await new Promise(r => setTimeout(r, 1000));
    try {
        await fetchAndCacheData(false);
    } catch (err) {
        log('[SCRM_DEBUG] fetchAndCacheData error:', err);
    }
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
                log('[SCRM] Requesting microphone permission...');
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                log('[SCRM] Microphone permission granted');

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    log('[SCRM] SpeechRecognition not supported');
                    chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: 'not supported' });
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
                    log('[SCRM] Speech recognition result:', transcript);
                    // 实时发送给 popup，边说边显示
                    chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingInterim', text: transcript });
                };
                contentRecognition.onerror = (event) => {
                    // aborted 是主动 stop() 导致的正常错误，不算真正的错误
                    if (event.error === 'aborted') {
                        log('[SCRM] Speech recognition aborted (normal stop)');
                        return;
                    }
                    hasRealError = true;
                    log('[SCRM] Speech recognition error:', event.error);
                    chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: event.error });
                    contentRecognition = null;
                };
                contentRecognition.onend = () => {
                    log('[SCRM] Speech recognition ended, transcript:', transcript, 'hasRealError:', hasRealError);
                    // 真正出错时 onerror 已经发送了消息，这里避免重复发送
                    if (!hasRealError) {
                        chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingResult', text: transcript });
                    }
                    contentRecognition = null;
                };
                contentRecognition.start();
                log('[SCRM] Speech recognition started');
                sendResponse({ success: true });

                // 如果 start 之前收到了 stop 请求，立即 stop
                if (pendingStop) {
                    pendingStop = false;
                    log('[SCRM] Pending stop detected, stopping immediately');
                    try { contentRecognition.stop(); } catch (e) {}
                }
            } catch (err) {
                log('[SCRM] Start recording error:', err);
                if (err.name === 'NotAllowedError') {
                    chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: 'not-allowed' });
                } else {
                    chrome.runtime?.id && chrome.runtime.sendMessage({ action: 'voiceRecordingError', error: err.message || err.name || 'unknown' });
                }
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'stopVoiceRecording') {
        log('[SCRM] Stop voice recording requested');
        if (contentRecognition) {
            try { contentRecognition.stop(); } catch (e) {}
        } else {
            // 如果 recognition 还没创建，设置 pending stop，等 start 后立即 stop
            pendingStop = true;
            log('[SCRM] No active recognition, setting pending stop');
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
    static TEXT_SELECTORS = [
        '.msg-s-event-listitem__body',
        '.msg-s-event__content p'
    ];

    constructor() {
        this.seen = new Set();
        this.observer = null;
        this.container = null;
        this.onMessage = null;
        this._stopped = false;
        this.candidateId = null;
    }

    extractOtherName() {
        if (!this.container) return '';
        const titleEl = this.container.querySelector('.msg-overlay-bubble-header__title');
        if (titleEl) return titleEl.innerText?.trim() || '';
        return '';
    }

    extractLinkedInInfo() {
        if (!this.container) return { linkedinId: '', linkedinUrl: '' };
        const titleEl = this.container.querySelector('.msg-overlay-bubble-header__title');
        if (!titleEl) return { linkedinId: '', linkedinUrl: '' };
        const link = titleEl.querySelector('a');
        if (!link) return { linkedinId: '', linkedinUrl: '' };
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/in\/([^/]+)\/?/);
        if (match && match[1]) {
            const linkedinId = match[1];
            return { linkedinId, linkedinUrl: `https://www.linkedin.com/in/${linkedinId}` };
        }
        return { linkedinId: '', linkedinUrl: '' };
    }

    start(container, callback) {
        this.container = container;
        this.onMessage = callback;
        this._stopped = false;
        log('[SCRM] ===== MessageScraper 启动 =====');
        this.watch();
        this.scan();
    }

    stop() {
        this._stopped = true;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.seen.clear();
        this.container = null;
    }

    watch() {
        if (!this.container || this._stopped) return;
        this.observer = new MutationObserver(muts => {
            if (this._stopped) return;
            let newMsgCount = 0;
            const hasNew = muts.some(m => [...m.addedNodes].some(n => {
                if (n.nodeType !== 1) return false;
                const isMsg = n.matches?.('.msg-s-event-listitem') ||
                    n.querySelector?.('.msg-s-event-listitem');
                if (isMsg) newMsgCount++;
                return isMsg;
            }));

            if (hasNew) {
                log(`[SCRM] MutationObserver 检测到 ${newMsgCount} 个新增消息相关节点，触发扫描`);
                setTimeout(() => this.scan(), 100);
            }
        });

        this.observer.observe(this.container, { childList: true, subtree: true });
        log('[SCRM] MutationObserver 已开始监听变化');
    }

    scan() {
        if (this._stopped || !this.container) return;
        log('[SCRM] ===== 开始扫描消息 =====');

        const items = [...this.container.querySelectorAll('.msg-s-event-listitem')];
        log(`[SCRM] 容器内 ".msg-s-event-listitem" 匹配到 ${items.length} 个元素`);

        let parsedCount = 0;
        items.forEach(el => {
            const wasParsed = this.parse(el);
            if (wasParsed) parsedCount++;
        });
        log(`[SCRM] 扫描完成: 共 ${items.length} 条消息元素，新解析 ${parsedCount} 条，已缓存 ${this.seen.size} 条`);
    }

    parse(el) {
        const id = el.getAttribute('data-event-urn');
        if (!id || this.seen.has(id)) return false;

        let text = '';
        for (const sel of LinkedInMessageScraper.TEXT_SELECTORS) {
            const found = el.querySelector(sel);
            if (found) { text = found.innerText?.trim(); break; }
        }
        if (!text) return false;

        const isInbound = el.classList.contains('msg-s-event-listitem--other');
        const sender = isInbound
            ? (el.querySelector('.msg-s-message-group__name')?.innerText?.trim() || 'Them')
            : 'Me';
        const otherName = this.extractOtherName();
        const { linkedinId, linkedinUrl } = this.extractLinkedInInfo();

        const msg = {
            messageId: id,
            text,
            isInbound,
            senderName: sender,
            otherName,
            candidateId: this.candidateId,
            linkedinId,
            linkedinUrl,
            timestamp: new Date().toISOString(),
            conversationId: ''
        };

        const directionLabel = isInbound ? '收到' : '发送';
        const targetName = otherName || sender;
        log(`[SCRM] ${directionLabel}消息 | ${targetName}: "${text}"`);
        log('[SCRM] Chat message full data:', msg);

        this.onMessage?.(msg);
        this.seen.add(id);
        return true;
    }
}

// ===== 多窗口 Scraper 管理 =====
// 用 linkedinId 做 key，避免 DOM 引用因重渲染而失效导致重复识别
const scrapers = new Map(); // linkedinId -> { scraper, container }
const pendingIds = new Set(); // 正在保存候选人的 linkedinId

function extractChatCandidateInfo(container) {
    if (!container) return null;
    const titleEl = container.querySelector('.msg-overlay-bubble-header__title');
    if (!titleEl) return null;
    const fullName = titleEl.innerText?.trim() || '';
    const link = titleEl.querySelector('a');
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/in\/([^/]+)\/?/);
    if (!match || !match[1]) return null;
    const linkedinId = match[1];

    // 防御：排除无意义名字（如给自己发消息时标题可能是 "Me"）
    const INVALID_NAMES = ['me', 'you', '', 'null', 'undefined'];
    if (INVALID_NAMES.includes(fullName.toLowerCase())) {
        log('[SCRM] 聊天窗口标题提取到无效名字，跳过保存:', fullName);
        return null;
    }

    return {
        linkedinId,
        linkedinUrl: `https://www.linkedin.com/in/${linkedinId}`,
        fullName,
        source: 'linkedin_chat'
    };
}

function isLinkedInPage() {
    const url = window.location.href;
    return url.includes('linkedin.com');
}

function findAllChatContainers() {
    const containers = [];
    const seen = new Set();

    for (const selector of ['.msg-overlay-conversation-bubble', '.msg-overlay-bubble']) {
        document.querySelectorAll(selector).forEach(el => {
            if (seen.has(el)) return;
            if (el.querySelector('.msg-s-message-list') || el.querySelector('.msg-s-event-listitem')) {
                seen.add(el);
                containers.push(el);
            }
        });
        deepQuerySelectorAll(selector).forEach(el => {
            if (seen.has(el)) return;
            if (el.querySelector('.msg-s-message-list') || el.querySelector('.msg-s-event-listitem')) {
                seen.add(el);
                containers.push(el);
            }
        });
    }

    deepQuerySelectorAll('[class*="overlay-bubble"]').forEach(el => {
        if (seen.has(el)) return;
        if (el.querySelector('.msg-s-message-list') || el.querySelector('.msg-s-event-listitem')) {
            seen.add(el);
            containers.push(el);
        }
    });

    return containers;
}

function syncScrapers() {
    if (!isLinkedInPage()) return;
    const containers = findAllChatContainers();
    log(`[SCRM] syncScrapers: 发现 ${containers.length} 个聊天窗口`);

    // 收集当前所有窗口的 linkedinId
    const activeIds = new Set();

    containers.forEach(container => {
        const info = extractChatCandidateInfo(container);
        if (!info || !info.linkedinId) {
            log('[SCRM] 该窗口无法提取候选人标识，跳过');
            return;
        }
        activeIds.add(info.linkedinId);

        if (scrapers.has(info.linkedinId) || pendingIds.has(info.linkedinId)) {
            log(`[SCRM] linkedinId=${info.linkedinId} 已在监听或保存中，跳过`);
            return;
        }

        pendingIds.add(info.linkedinId);
        log('[SCRM] 识别到新聊天窗口，准备保存候选人:', info);
        log('[SCRM] pendingIds 当前状态:', [...pendingIds]);

        if (!chrome.runtime?.id) {
            pendingIds.delete(info.linkedinId);
            log('[SCRM] Extension context gone, skip save candidate');
            return;
        }
        chrome.runtime.sendMessage(
            { type: 'SAVE_CHAT_CANDIDATE', payload: info },
            (response) => {
                pendingIds.delete(info.linkedinId);
                log('[SCRM] SAVE_CHAT_CANDIDATE 回调执行, linkedinId=' + info.linkedinId);
                if (chrome.runtime.lastError) {
                    log('[SCRM] 保存候选人出错:', chrome.runtime.lastError);
                    return;
                }
                if (!response || !response.success) {
                    log('[SCRM] 保存候选人失败:', response?.error);
                    return;
                }
                const candidateId = response.data?.id;
                log('[SCRM] 候选人已保存/确认，candidateId=' + candidateId);

                const scraper = new LinkedInMessageScraper();
                scraper.candidateId = candidateId ? String(candidateId) : null;
                scraper.start(container, msg => {
                    chrome.runtime?.id && chrome.runtime.sendMessage({ type: 'CHAT_MESSAGE', payload: msg });
                });
                scrapers.set(info.linkedinId, { scraper, container });
                log('[SCRM] scraper 已启动并注册, linkedinId=' + info.linkedinId + ', scrapers.size=' + scrapers.size);
            }
        );
    });

    // 清理已关闭窗口的 scraper
    scrapers.forEach((entry, linkedinId) => {
        if (!activeIds.has(linkedinId)) {
            log('[SCRM] 窗口已关闭，停止 scraper, linkedinId=' + linkedinId);
            entry.scraper.stop();
            scrapers.delete(linkedinId);
        }
    });
}

function stopAllScrapers() {
    scrapers.forEach(entry => entry.scraper.stop());
    scrapers.clear();
}

function stopMessageScraper() {
    stopAllScrapers();
}

function startMessageScraper() {
    if (!isLinkedInPage()) {
        log('[SCRM] 当前不是 LinkedIn 页面，跳过启动');
        return;
    }
    syncScrapers();
}

// 页面加载时检查
if (isLinkedInPage()) {
    log('[SCRM] 当前是 LinkedIn 页面，1.5秒后检查聊天容器');
    setTimeout(startMessageScraper, 1500);
} else {
    log('[SCRM] 当前不是 LinkedIn 页面，不启动消息监听');
}

// 监听 DOM 变化 + 轮询：当聊天窗口出现/消失时自动启停 scraper
let chatObserver = null;
let chatPollInterval = null;
function startChatPresenceObserver() {
    if (chatObserver) return;
    log('[SCRM] 启动聊天容器监听（轮询 + DOM 辅助）');

    chatPollInterval = setInterval(() => {
        syncScrapers();
    }, 3000);

    chatObserver = new MutationObserver(() => {
        syncScrapers();
    });
    chatObserver.observe(document.body, { childList: true, subtree: true });
}

function stopChatPresenceObserver() {
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
    if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
    }
}

if (isLinkedInPage()) {
    startChatPresenceObserver();
}

// ========== Preconnect: keep background SW alive & connection warm ==========
let preconnectInterval = null;

function startPreconnect() {
    if (preconnectInterval) return;
    const doPing = () => {
        if (chrome.runtime?.id) {
            log('[SCRM] Preconnect ping → background');
            chrome.runtime.sendMessage({ type: 'PRECONNECT' }).catch(() => {});
        } else {
            log('[SCRM] Extension context gone, stop preconnect');
            stopPreconnect();
        }
    };
    doPing(); // 立即执行一次
    preconnectInterval = setInterval(doPing, 25000);
    log('[SCRM] Preconnect started, interval=25s');
}

function stopPreconnect() {
    if (preconnectInterval) {
        clearInterval(preconnectInterval);
        preconnectInterval = null;
        log('[SCRM] Preconnect stopped');
    }
}

// SPA 路由变化监听（离开 LinkedIn 时停止一切）
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        log(`[SCRM] 路由变化: ${lastUrl} → ${url}`);
        lastUrl = url;
        if (!isLinkedInPage()) {
            log('[SCRM] 已离开 LinkedIn，停止所有监听');
            stopMessageScraper();
            stopPreconnect();
            stopChatPresenceObserver();
        } else if (!chatObserver) {
            log('[SCRM] 进入 LinkedIn，重新启动容器监听');
            startChatPresenceObserver();
            setTimeout(startMessageScraper, 1500);
        }
        // 在 LinkedIn 任何页面保持预连接
        if (isLinkedInPage()) {
            startPreconnect();
        } else {
            stopPreconnect();
        }
    }
}).observe(document, { subtree: true, childList: true });

// 初始检查
if (isLinkedInPage()) {
    startPreconnect();
}

window.addEventListener('beforeunload', () => {
    stopMessageScraper();
    stopPreconnect();
});
