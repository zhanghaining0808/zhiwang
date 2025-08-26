const UserAgent = require('user-agents');
const config = require('./config');
const fs = require('fs');
const path = require('path');

/**
 * 反爬虫检测工具类
 * 实现多种反检测机制来绕过知网的爬虫检测
 */
class AntiDetection {
    constructor() {
        this.userAgents = new UserAgent({ deviceCategory: 'desktop' });
        // 存储浏览器指纹信息
        this.fingerprints = {
            screen: {
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040,
                colorDepth: 24,
                pixelDepth: 24
            },
            timezone: 'Asia/Shanghai',
            language: 'zh-CN',
            platform: 'Win32',
            hardwareConcurrency: 8
        };

        // 预定义的真实浏览器用户代理
        this.realUserAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ];

        // 记录行为模式
        this.behaviorPattern = {
            clickCount: 0,
            scrollCount: 0,
            typeSpeed: 150, // 平均打字速度(ms)
            lastActionTime: Date.now()
        };
    }

    /**
     * 获取随机延时时间
     * @param {number} min - 最小延时（毫秒）
     * @param {number} max - 最大延时（毫秒）
     * @returns {number} 随机延时时间
     */
    getRandomDelay(min = config.ANTI_DETECTION.MIN_DELAY, max = config.ANTI_DETECTION.MAX_DELAY) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 随机等待
     * @param {number} min - 最小等待时间
     * @param {number} max - 最大等待时间
     */
    async randomWait(min, max) {
        const delay = this.getRandomDelay(min, max);
        console.log(`随机等待 ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * 获取随机User Agent
     * @returns {string} 随机的User Agent字符串
     */
    getRandomUserAgent() {
        // 随机选择真实的用户代理，而不是生成的
        return this.realUserAgents[Math.floor(Math.random() * this.realUserAgents.length)];
    }

    /**
     * 生成随机的屏幕分辨率
     * @returns {Object} 屏幕分辨率信息
     */
    getRandomScreenSize() {
        const commonResolutions = [
            { width: 1920, height: 1080, availHeight: 1040 },
            { width: 1366, height: 768, availHeight: 728 },
            { width: 1536, height: 864, availHeight: 824 },
            { width: 1440, height: 900, availHeight: 860 },
            { width: 1680, height: 1050, availHeight: 1010 }
        ];

        const resolution = commonResolutions[Math.floor(Math.random() * commonResolutions.length)];
        return {
            width: resolution.width,
            height: resolution.height,
            availWidth: resolution.width,
            availHeight: resolution.availHeight,
            colorDepth: 24,
            pixelDepth: 24
        };
    }

    /**
     * 配置浏览器以避免检测
     * @param {Object} browser - Playwright浏览器实例
     * @param {Object} context - 浏览器上下文
     */
    async configureBrowser(browser, context) {
        const screenSize = this.getRandomScreenSize();
        this.fingerprints.screen = screenSize;

        // 设置随机User Agent和更真实的HTTP头
        const userAgent = this.getRandomUserAgent();
        await context.setExtraHTTPHeaders({
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1',
            'Connection': 'keep-alive'
        });

        console.log(`已设置浏览器参数: ${userAgent.substring(0, 50)}...`);
        console.log(`屏幕分辨率: ${screenSize.width}x${screenSize.height}`);
    }

    /**
     * 在页面中注入反检测脚本
     * @param {Object} page - Playwright页面实例
     */
    async injectAntiDetectionScripts(page) {
        console.log('正在注入反检测脚本...');

        // 1. 移除webdriver属性 - 最关键的检测点
        await page.addInitScript(() => {
            // 完全移除webdriver属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // 删除webdriver相关的全局变量
            delete window.webdriver;
            delete window._selenium;
            delete window._phantom;
            delete window.callSelenium;
            delete window.callPhantom;
            delete window.__webdriver_evaluate;
            delete window.__selenium_evaluate;
            delete window.__webdriver_script_function;
            delete window.__webdriver_script_func;
            delete window.__webdriver_script_fn;
            delete window.__fxdriver_evaluate;
            delete window.__driver_unwrapped;
            delete window.__webdriver_unwrapped;
            delete window.__driver_evaluate;
            delete window.__selenium_unwrapped;
            delete window.__fxdriver_unwrapped;
        });

        // 2. 伪装Chrome插件和API
        await page.addInitScript(() => {
            window.chrome = {
                runtime: {
                    onConnect: undefined,
                    onMessage: undefined,
                    onStartup: undefined,
                    onInstalled: undefined,
                    onSuspend: undefined,
                    onSuspendCanceled: undefined,
                    sendMessage: function () { },
                    connect: function () { }
                },
                storage: {
                    local: {
                        get: function () { },
                        set: function () { },
                        remove: function () { },
                        clear: function () { }
                    }
                },
                tabs: {
                    create: function () { },
                    query: function () { },
                    update: function () { }
                }
            };
        });

        // 3. 伪装权限API
        await page.addInitScript(() => {
            if (window.navigator.permissions) {
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => {
                    return parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters);
                };
            }
        });

        // 4. 伪装语言设置
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en-US', 'en'],
            });

            Object.defineProperty(navigator, 'language', {
                get: () => 'zh-CN',
            });
        });

        // 5. 伪装平台信息
        await page.addInitScript((fingerprints) => {
            Object.defineProperty(navigator, 'platform', {
                get: () => fingerprints.platform,
            });

            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => fingerprints.hardwareConcurrency,
            });
        }, this.fingerprints);

        // 6. 伪装屏幕信息 - 非常重要
        await page.addInitScript((screenInfo) => {
            Object.defineProperty(screen, 'width', {
                get: () => screenInfo.width,
            });
            Object.defineProperty(screen, 'height', {
                get: () => screenInfo.height,
            });
            Object.defineProperty(screen, 'availWidth', {
                get: () => screenInfo.availWidth,
            });
            Object.defineProperty(screen, 'availHeight', {
                get: () => screenInfo.availHeight,
            });
            Object.defineProperty(screen, 'colorDepth', {
                get: () => screenInfo.colorDepth,
            });
            Object.defineProperty(screen, 'pixelDepth', {
                get: () => screenInfo.pixelDepth,
            });
        }, this.fingerprints.screen);

        // 7. 伪装时区
        await page.addInitScript((timezone) => {
            Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
                get: () => function () {
                    return { timeZone: timezone };
                },
            });
        }, this.fingerprints.timezone);

        // 8. 伪装插件信息
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    return [
                        {
                            name: 'Chrome PDF Plugin',
                            filename: 'internal-pdf-viewer',
                            description: 'Portable Document Format',
                            length: 1
                        },
                        {
                            name: 'Chrome PDF Viewer',
                            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                            description: '',
                            length: 1
                        },
                        {
                            name: 'Native Client',
                            filename: 'internal-nacl-plugin',
                            description: '',
                            length: 2
                        }
                    ];
                },
            });
        });

        // 9. 修改getUserMedia等API
        await page.addInitScript(() => {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
                navigator.mediaDevices.getUserMedia = function (constraints) {
                    return originalGetUserMedia.call(this, constraints);
                };
            }
        });

        // 10. 隐藏自动化相关的全局变量
        await page.addInitScript(() => {
            // 隐藏Playwright相关的标识
            delete window.playwright;
            delete window.__playwright;
            delete window._playwright;

            // 修改错误堆栈信息
            const originalError = Error.prepareStackTrace;
            Error.prepareStackTrace = function (error, stack) {
                if (originalError) {
                    return originalError(error, stack);
                }
                return stack;
            };
        });

        // 11. 伪装鼠标和键盘事件
        await page.addInitScript(() => {
            const originalAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                // 为鼠标和键盘事件添加真实性
                if (type === 'mousedown' || type === 'mouseup' || type === 'click') {
                    const wrappedListener = function (event) {
                        // 模拟真实的鼠标事件属性
                        Object.defineProperty(event, 'isTrusted', {
                            get: () => true,
                        });
                        return listener.call(this, event);
                    };
                    return originalAddEventListener.call(this, type, wrappedListener, options);
                }
                return originalAddEventListener.call(this, type, listener, options);
            };
        });

        // 12. 伪装Canvas指纹
        await page.addInitScript(() => {
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

            HTMLCanvasElement.prototype.toDataURL = function (...args) {
                // 添加微小的随机噪声
                const canvas = this;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        if (Math.random() < 0.001) {
                            imageData.data[i] = Math.floor(Math.random() * 255);
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                }
                return originalToDataURL.apply(this, args);
            };
        });

        console.log('反检测脚本注入完成');
    }

    /**
     * 模拟人类行为的鼠标移动
     * @param {Object} page - Playwright页面实例
     */
    async simulateHumanBehavior(page) {
        console.log('模拟人类行为...');

        // 更真实的鼠标移动模式
        const behaviorTypes = [
            'reading', // 阅读模式
            'browsing', // 浏览模式
            'searching' // 搜索模式
        ];

        const currentBehavior = behaviorTypes[Math.floor(Math.random() * behaviorTypes.length)];
        console.log(`当前行为模式: ${currentBehavior}`);

        switch (currentBehavior) {
            case 'reading':
                await this.simulateReadingBehavior(page);
                break;
            case 'browsing':
                await this.simulateBrowsingBehavior(page);
                break;
            case 'searching':
                await this.simulateSearchingBehavior(page);
                break;
        }

        // 更新行为统计
        this.behaviorPattern.lastActionTime = Date.now();
    }

    /**
     * 模拟阅读行为
     */
    async simulateReadingBehavior(page) {
        // 模拟阅读时的鼠标移动和停留
        const readingPoints = 3 + Math.floor(Math.random() * 4); // 3-6个阅读点

        for (let i = 0; i < readingPoints; i++) {
            const x = 200 + Math.floor(Math.random() * 800); // 内容区域
            const y = 150 + Math.floor(Math.random() * 500);

            // 缓慢移动到目标位置
            await page.mouse.move(x, y, {
                steps: 20 + Math.floor(Math.random() * 30)
            });

            // 停留阅读
            await this.randomWait(800, 2500);

            // 偶尔选中文本
            if (Math.random() < 0.3) {
                await page.mouse.down();
                await page.mouse.move(x + 50 + Math.random() * 100, y, { steps: 5 });
                await this.randomWait(200, 500);
                await page.mouse.up();
            }
        }
    }

    /**
     * 模拟浏览行为
     */
    async simulateBrowsingBehavior(page) {
        // 随机鼠标移动，模拟浏览
        const moves = 4 + Math.floor(Math.random() * 6); // 4-9次移动

        for (let i = 0; i < moves; i++) {
            const x = Math.floor(Math.random() * 1200) + 100;
            const y = Math.floor(Math.random() * 700) + 100;

            await page.mouse.move(x, y, {
                steps: 10 + Math.floor(Math.random() * 20)
            });

            await this.randomWait(300, 1000);

            // 偶尔悬停在链接上
            if (Math.random() < 0.4) {
                await this.randomWait(500, 1500);
            }
        }
    }

    /**
     * 模拟搜索行为
     */
    async simulateSearchingBehavior(page) {
        // 模拟在搜索框附近的移动
        const searchArea = {
            x: 300 + Math.floor(Math.random() * 400),
            y: 100 + Math.floor(Math.random() * 200)
        };

        // 移动到搜索区域
        await page.mouse.move(searchArea.x, searchArea.y, { steps: 15 });
        await this.randomWait(500, 1200);

        // 在附近小范围移动
        for (let i = 0; i < 3; i++) {
            const nearX = searchArea.x + (Math.random() - 0.5) * 100;
            const nearY = searchArea.y + (Math.random() - 0.5) * 50;

            await page.mouse.move(nearX, nearY, { steps: 5 });
            await this.randomWait(200, 600);
        }
    }

    /**
     * 模拟人类滚动行为
     * @param {Object} page - Playwright页面实例
     */
    async simulateScrolling(page) {
        console.log('模拟滚动行为...');

        const scrollPatterns = ['smooth', 'stepwise', 'reading'];
        const pattern = scrollPatterns[Math.floor(Math.random() * scrollPatterns.length)];

        switch (pattern) {
            case 'smooth':
                await this.smoothScrolling(page);
                break;
            case 'stepwise':
                await this.stepwiseScrolling(page);
                break;
            case 'reading':
                await this.readingScrolling(page);
                break;
        }

        this.behaviorPattern.scrollCount++;
    }

    /**
     * 平滑滚动
     */
    async smoothScrolling(page) {
        const scrollDistance = 300 + Math.floor(Math.random() * 500);
        const steps = 8 + Math.floor(Math.random() * 12);
        const stepDistance = scrollDistance / steps;

        for (let i = 0; i < steps; i++) {
            await page.mouse.wheel(0, stepDistance);
            await this.randomWait(50, 150);
        }
    }

    /**
     * 逐步滚动
     */
    async stepwiseScrolling(page) {
        const scrollCount = 2 + Math.floor(Math.random() * 4);

        for (let i = 0; i < scrollCount; i++) {
            const distance = 200 + Math.floor(Math.random() * 300);
            await page.mouse.wheel(0, distance);
            await this.randomWait(800, 2000);
        }
    }

    /**
     * 阅读式滚动
     */
    async readingScrolling(page) {
        // 模拟阅读时的滚动行为
        const readingSections = 3 + Math.floor(Math.random() * 3);

        for (let i = 0; i < readingSections; i++) {
            // 小幅度滚动
            await page.mouse.wheel(0, 150 + Math.random() * 100);

            // 阅读停留
            await this.randomWait(1500, 4000);

            // 偶尔向上回滚
            if (Math.random() < 0.3) {
                await page.mouse.wheel(0, -50 - Math.random() * 50);
                await this.randomWait(500, 1000);
            }
        }
    }

    /**
     * 模拟真实的打字速度
     * @param {Object} page - Playwright页面实例
     * @param {string} element - 输入框选择器
     * @param {string} text - 要输入的文本
     */
    async humanizedTyping(page, element, text) {
        console.log(`模拟人类打字: ${text}`);

        const inputElement = await page.$(element);
        if (!inputElement) {
            throw new Error(`未找到输入框: ${element}`);
        }

        // 清空现有内容
        await inputElement.click();
        await page.keyboard.press('Control+A');
        await this.randomWait(100, 300);

        // 逐个字符输入
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // 随机打字速度
            const baseDelay = this.behaviorPattern.typeSpeed;
            const variance = baseDelay * 0.3; // 30%的变化
            const delay = baseDelay + (Math.random() - 0.5) * variance;

            await page.keyboard.type(char);

            // 在某些字符后添加额外停顿
            if (char === ' ' || char === '-' || char === '_') {
                await this.randomWait(delay * 1.5, delay * 2);
            } else {
                await this.randomWait(delay * 0.5, delay * 1.5);
            }

            // 偶尔模拟打错和修正
            if (Math.random() < 0.05 && i < text.length - 1) { // 5%的几率打错
                const wrongChar = String.fromCharCode(65 + Math.floor(Math.random() * 26));
                await page.keyboard.type(wrongChar);
                await this.randomWait(100, 300);
                await page.keyboard.press('Backspace');
                await this.randomWait(100, 200);
            }
        }

        // 输入完成后稍作停留
        await this.randomWait(500, 1000);
    }

    /**
     * 检测页面是否被重定向或阻止
     * @param {Object} page - Playwright页面实例
     * @returns {boolean} 是否被检测/阻止
     */
    async isBlocked(page) {
        const url = page.url();
        const title = await page.title();

        // 检查常见的反爬虫页面特征
        const blockIndicators = [
            '验证码',
            'captcha',
            '403',
            '404',
            'blocked',
            'forbidden',
            '拒绝访问',
            '访问被拒绝'
        ];

        const urlBlocked = blockIndicators.some(indicator =>
            url.toLowerCase().includes(indicator.toLowerCase())
        );

        const titleBlocked = blockIndicators.some(indicator =>
            title.toLowerCase().includes(indicator.toLowerCase())
        );

        return urlBlocked || titleBlocked;
    }

    /**
     * 处理验证码或反爬虫页面
     * @param {Object} page - Playwright页面实例
     */
    async handleAntiBot(page) {
        console.log('检测到可能的反爬虫机制，等待处理...');

        // 等待更长时间
        await this.randomWait(5000, 10000);

        // 尝试刷新页面
        await page.reload({ waitUntil: 'networkidle' });

        // 再次等待
        await this.randomWait(3000, 6000);
    }

    /**
     * 智能等待页面加载完成
     * @param {Object} page - Playwright页面实例
     * @param {number} timeout - 超时时间
     */
    async waitForPageLoad(page, timeout = 30000) {
        console.log('等待页面加载...');

        try {
            // 多阶段等待策略
            await Promise.race([
                page.waitForLoadState('domcontentloaded'),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);

            await Promise.race([
                page.waitForLoadState('networkidle'),
                new Promise(resolve => setTimeout(resolve, timeout))
            ]);

            // 模拟真实用户的等待时间
            await this.randomWait(1500, 4000);

            // 检查是否被阻止
            if (await this.isBlocked(page)) {
                console.log('检测到可能的反爬虫机制');
                await this.handleAntiBot(page);
            }

        } catch (error) {
            console.log(`页面加载等待超时: ${error.message}，继续执行...`);
        }
    }

    /**
     * 模拟真实的点击行为
     * @param {Object} page - Playwright页面实例
     * @param {string} selector - 元素选择器
     * @param {Object} options - 点击选项
     */
    async humanizedClick(page, selector, options = {}) {
        console.log(`模拟人类点击: ${selector}`);

        const element = await page.$(selector);
        if (!element) {
            throw new Error(`未找到元素: ${selector}`);
        }

        // 确保元素可见
        await element.scrollIntoViewIfNeeded();
        await this.randomWait(300, 800);

        // 获取元素位置
        const box = await element.boundingBox();
        if (!box) {
            throw new Error('无法获取元素位置');
        }

        // 随机点击位置（在元素范围内）
        const x = box.x + box.width * (0.3 + Math.random() * 0.4);
        const y = box.y + box.height * (0.3 + Math.random() * 0.4);

        // 缓慢移动到目标位置
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
        await this.randomWait(200, 500);

        // 模拟真实的点击时间
        await page.mouse.down();
        await this.randomWait(80, 150);
        await page.mouse.up();

        // 点击后停留
        await this.randomWait(300, 800);

        this.behaviorPattern.clickCount++;
        console.log(`点击完成, 总点击数: ${this.behaviorPattern.clickCount}`);
    }

    /**
     * 设置网络请求拦截
     * @param {Object} page - Playwright页面实例
     */
    async setupNetworkInterception(page) {
        console.log('设置网络请求拦截...');

        // 拦截网络请求，模拟真实浏览器行为
        await page.route('**/*', async (route) => {
            const request = route.request();
            const url = request.url();

            // 添加真实的请求头
            const headers = {
                ...request.headers(),
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': this.getSecFetchDest(url),
                'Sec-Fetch-Mode': this.getSecFetchMode(url),
                'Sec-Fetch-Site': this.getSecFetchSite(url)
            };

            // 随机延迟，模拟网络延迟
            if (Math.random() < 0.1) { // 10%的请求添加小延迟
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 200));
            }

            await route.continue({ headers });
        });
    }

    /**
     * 获取Sec-Fetch-Dest值
     */
    getSecFetchDest(url) {
        if (url.includes('.js')) return 'script';
        if (url.includes('.css')) return 'style';
        if (url.includes('.png') || url.includes('.jpg') || url.includes('.gif')) return 'image';
        return 'document';
    }

    /**
     * 获取Sec-Fetch-Mode值
     */
    getSecFetchMode(url) {
        if (url.includes('.js') || url.includes('.css')) return 'no-cors';
        return 'navigate';
    }

    /**
     * 获取Sec-Fetch-Site值
     */
    getSecFetchSite(url) {
        if (url.includes('cnki.net')) return 'same-origin';
        return 'cross-site';
    }

    /**
     * 模拟浏览器标签页操作
     * @param {Object} context - 浏览器上下文
     */
    async simulateTabBehavior(context) {
        console.log('模拟浏览器标签页操作...');

        // 在后台创建一个新标签页，模拟真实用户行为
        const backgroundPage = await context.newPage();

        // 访问一个无关的网站（模拟多标签浏览）
        try {
            await backgroundPage.goto('https://www.baidu.com', {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            // 等待一段随机时间
            await this.randomWait(2000, 5000);

            // 关闭后台标签页
            await backgroundPage.close();

            console.log('后台标签页模拟完成');
        } catch (error) {
            console.log('后台标签页模拟失败，继续执行');
            try {
                await backgroundPage.close();
            } catch (e) { }
        }
    }

    /**
     * 获取当前行为统计信息
     */
    getBehaviorStats() {
        const now = Date.now();
        const sessionDuration = now - this.behaviorPattern.lastActionTime;

        return {
            clickCount: this.behaviorPattern.clickCount,
            scrollCount: this.behaviorPattern.scrollCount,
            typeSpeed: this.behaviorPattern.typeSpeed,
            sessionDuration,
            actionsPerMinute: (this.behaviorPattern.clickCount + this.behaviorPattern.scrollCount) / (sessionDuration / 60000)
        };
    }

    /**
     * 重置行为数据
     */
    resetBehaviorStats() {
        this.behaviorPattern = {
            clickCount: 0,
            scrollCount: 0,
            typeSpeed: 120 + Math.random() * 60, // 120-180ms
            lastActionTime: Date.now()
        };

        console.log(`行为数据已重置，新打字速度: ${this.behaviorPattern.typeSpeed}ms`);
    }
}

module.exports = AntiDetection;