const UserAgent = require('user-agents');
const config = require('./config');

/**
 * 反爬虫检测工具类
 * 实现多种反检测机制来绕过知网的爬虫检测
 */
class AntiDetection {
    constructor() {
        this.userAgents = new UserAgent({ deviceCategory: 'desktop' });
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
        return this.userAgents.toString();
    }

    /**
     * 配置浏览器以避免检测
     * @param {Object} browser - Playwright浏览器实例
     * @param {Object} context - 浏览器上下文
     */
    async configureBrowser(browser, context) {
        // 设置随机User Agent
        await context.setExtraHTTPHeaders({
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        });

        // 注意：视口大小在创建context时设置，这里不需要重新设置
        // 视口大小已在浏览器配置中设置
    }

    /**
     * 在页面中注入反检测脚本
     * @param {Object} page - Playwright页面实例
     */
    async injectAntiDetectionScripts(page) {
        // 移除webdriver属性
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        // 伪装Chrome插件
        await page.addInitScript(() => {
            window.chrome = {
                runtime: {},
                // 其他Chrome API的模拟
            };
        });

        // 伪装权限API
        await page.addInitScript(() => {
            const originalQuery = window.navigator.permissions.query;
            return window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // 伪装语言设置
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en'],
            });
        });

        // 伪装平台信息
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32',
            });
        });
    }

    /**
     * 模拟人类行为的鼠标移动
     * @param {Object} page - Playwright页面实例
     */
    async simulateHumanBehavior(page) {
        // 随机鼠标移动
        const moves = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < moves; i++) {
            const x = Math.floor(Math.random() * 800) + 100;
            const y = Math.floor(Math.random() * 600) + 100;
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
            await this.randomWait(100, 500);
        }
    }

    /**
     * 模拟人类滚动行为
     * @param {Object} page - Playwright页面实例
     */
    async simulateScrolling(page) {
        const scrollCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < scrollCount; i++) {
            const scrollDistance = Math.floor(Math.random() * 500) + 200;
            await page.mouse.wheel(0, scrollDistance);
            await this.randomWait(200, 800);
        }
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
        try {
            // 等待网络空闲
            await page.waitForLoadState('networkidle', { timeout });

            // 额外等待一段时间确保JS执行完成
            await this.randomWait(1000, 3000);

            // 检查是否被阻止
            if (await this.isBlocked(page)) {
                await this.handleAntiBot(page);
            }

        } catch (error) {
            console.log('页面加载等待超时，继续执行...');
        }
    }
}

module.exports = AntiDetection;