#!/usr/bin/env node

/**
 * 知网期刊批量爬取主脚本
 * 支持自定义搜索编码和最大爬取页面数
 */

const { chromium } = require('playwright');
const config = require('./src/config');
const AntiDetection = require('./src/antiDetection');
const ExcelHandler = require('./src/excelHandler');

class BatchCrawler {
    constructor(options = {}) {
        // 从options或使用默认配置
        this.searchCodes = options.searchCodes || ['11-', '31-', '21-', '44-']; // 可自定义搜索编码
        this.maxPages = options.maxPages !== undefined ? options.maxPages : 0; // 0表示无上限
        this.maxPagesPerCode = options.maxPagesPerCode || 50; // 每个编码最大页数限制
        this.saveFrequency = options.saveFrequency || 5; // 保存频率
        this.delayBetweenPages = options.delayBetweenPages || [3000, 6000]; // 页面间延时范围
        this.delayBetweenCodes = options.delayBetweenCodes || [10000, 20000]; // 编码间延时范围

        this.browser = null;
        this.context = null;
        this.page = null;
        this.antiDetection = new AntiDetection();
        this.excelHandler = new ExcelHandler();

        // 统计信息
        this.stats = {
            totalProcessed: 0,
            totalSaved: 0,
            totalSkipped: 0,
            totalErrors: 0,
            processedCodes: [],
            startTime: new Date()
        };

        console.log('批量爬虫初始化完成:');
        console.log(`- 搜索编码: ${this.searchCodes.join(', ')}`);
        console.log(`- 最大页面数: ${this.maxPages === 0 ? '无限制' : this.maxPages}`);
        console.log(`- 每编码最大页数: ${this.maxPagesPerCode}`);
    }

    /**
     * 初始化浏览器
     */
    async initBrowser() {
        try {
            console.log('正在初始化浏览器...');

            this.browser = await chromium.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1366, height: 768 },
                userAgent: config.ANTI_DETECTION.BROWSER_CONFIG.userAgent
            });

            await this.antiDetection.configureBrowser(this.browser, this.context);
            this.page = await this.context.newPage();
            await this.antiDetection.injectAntiDetectionScripts(this.page);

            console.log('浏览器初始化完成');
            return true;
        } catch (error) {
            console.error('浏览器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 执行搜索
     */
    async performSearch(searchCode) {
        try {
            console.log(`\n开始搜索编码: ${searchCode}`);

            await this.page.goto(config.BASE_URL, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            await this.antiDetection.waitForPageLoad(this.page);
            await this.randomDelay(2000, 4000);

            // 查找搜索输入框
            const inputSelectors = [
                'input[name="txt_1_value1"]',
                'input[id="txt_1_value1"]',
                '.search-input',
                'input[type="text"]:visible'
            ];

            let inputElement = null;
            for (const selector of inputSelectors) {
                try {
                    inputElement = await this.page.$(selector);
                    if (inputElement && await inputElement.isVisible()) {
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!inputElement) {
                throw new Error('未找到搜索输入框');
            }

            // 选择搜索类型（CN）
            try {
                await this.page.selectOption('select[name="txt_1_sel"]', 'CN');
            } catch (e) {
                console.log('搜索类型选择失败，继续执行');
            }

            // 输入搜索关键词
            await inputElement.fill('');
            await this.randomDelay(500, 1000);
            await inputElement.fill(searchCode);
            console.log(`已输入搜索关键词: ${searchCode}`);
            await this.randomDelay(1000, 2000);

            // 执行搜索
            await this.page.keyboard.press('Enter');
            console.log('已执行搜索');

            await this.antiDetection.waitForPageLoad(this.page);
            await this.randomDelay(3000, 5000);

            return true;
        } catch (error) {
            console.error(`搜索 ${searchCode} 失败:`, error);
            throw error;
        }
    }

    /**
     * 处理单个搜索结果页面
     */
    async processResultsPage(pageNumber, searchCode) {
        try {
            console.log(`\n处理第 ${pageNumber} 页结果 (编码: ${searchCode})`);

            await this.randomDelay(2000, 4000);

            const journals = await this.extractJournalsFromPage();
            console.log(`在第 ${pageNumber} 页找到 ${journals.length} 个期刊`);

            let pageStats = { processed: 0, saved: 0, skipped: 0, errors: 0 };

            for (let i = 0; i < journals.length; i++) {
                const journal = journals[i];
                console.log(`\n处理期刊 ${i + 1}/${journals.length}: ${journal.title}`);

                try {
                    if (this.excelHandler.isJournalExists(journal.title)) {
                        console.log('期刊已存在，跳过');
                        pageStats.skipped++;
                        this.stats.totalSkipped++;
                        continue;
                    }

                    const details = await this.getJournalDetails(journal);

                    if (details && details['期刊名称']) {
                        this.excelHandler.addJournalData(details);
                        console.log(`✓ 成功处理期刊: ${details['期刊名称']}`);
                        pageStats.saved++;
                        this.stats.totalSaved++;
                    } else {
                        console.log('× 期刊信息不完整，跳过');
                        pageStats.skipped++;
                        this.stats.totalSkipped++;
                    }

                } catch (error) {
                    console.error(`处理期刊失败: ${journal.title}`, error.message);
                    pageStats.errors++;
                    this.stats.totalErrors++;
                }

                pageStats.processed++;
                this.stats.totalProcessed++;

                if (i < journals.length - 1) {
                    await this.randomDelay(2000, 4000);
                }
            }

            console.log(`页面 ${pageNumber} 处理完成: 处理${pageStats.processed}个, 保存${pageStats.saved}个, 跳过${pageStats.skipped}个, 错误${pageStats.errors}个`);

            // 每设定页数保存一次
            if (pageNumber % this.saveFrequency === 0) {
                await this.saveProgress();
            }

            return pageStats;

        } catch (error) {
            console.error(`处理第 ${pageNumber} 页失败:`, error);
            throw error;
        }
    }

    /**
     * 从当前页面提取期刊列表
     */
    async extractJournalsFromPage() {
        try {
            console.log('开始提取期刊列表...');
            await this.page.waitForTimeout(3000);

            // 先尝试更广泛的选择器来调试
            console.log('检测页面结构...');

            // 检查页面是否有搜索结果
            const hasResults = await this.page.$('.result-table-list, .grid-table, .result');
            if (!hasResults) {
                console.log('未找到搜索结果容器，可能需要等待或页面结构变化');
                // 尝试等待更长时间
                await this.page.waitForTimeout(5000);
            }

            const resultSelectors = [
                'dl.result',                    // 标准结果项
                '.result-table-list dl',        // 表格列表中的结果
                '.grid-table tr',               // 网格表格行
                '.result',                      // 通用结果项
                'tbody tr',                     // 表格行
                '.item',                        // 通用项目
                'dl',                           // 任何dl元素
                'tr'                            // 任何表格行
            ];

            let results = [];
            let usedSelector = '';

            for (const selector of resultSelectors) {
                try {
                    console.log(`尝试选择器: ${selector}`);
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    results = await this.page.$$(selector);
                    console.log(`选择器 "${selector}" 找到 ${results.length} 个元素`);

                    if (results.length > 0) {
                        usedSelector = selector;
                        break;
                    }
                } catch (e) {
                    console.log(`选择器 "${selector}" 失败: ${e.message}`);
                    continue;
                }
            }

            if (results.length === 0) {
                console.log('所有选择器都未找到结果，输出页面调试信息...');

                // 输出页面标题用于调试
                const pageTitle = await this.page.title();
                console.log(`当前页面标题: ${pageTitle}`);

                // 输出页面URL
                const pageUrl = this.page.url();
                console.log(`当前页面URL: ${pageUrl}`);

                // 检查是否有明显的错误信息
                const errorSelectors = ['.error', '.no-result', '.empty'];
                for (const errorSelector of errorSelectors) {
                    const errorElement = await this.page.$(errorSelector);
                    if (errorElement) {
                        const errorText = await errorElement.textContent();
                        console.log(`发现错误信息 (${errorSelector}): ${errorText}`);
                    }
                }

                return [];
            }

            console.log(`使用选择器 "${usedSelector}" 开始分析 ${results.length} 个结果项...`);
            const journals = [];

            for (let i = 0; i < Math.min(results.length, 50); i++) { // 限制最多处理50个，避免过长
                const result = results[i];
                console.log(`\n--- 分析第 ${i + 1} 个结果项 ---`);

                try {
                    // 扩展标题链接选择器
                    const titleLinkSelectors = [
                        'h1 a', 'dt a', '.title a',     // 原有选择器
                        'a[href*="journal"]',          // 包含journal的链接
                        'a[href*="navi.cnki.net"]',    // 知网链接
                        'a[title]',                     // 有title属性的链接
                        'a',                            // 任何链接
                        'h1', 'h2', 'h3',              // 标题元素
                        '.name', '.journal-name'       // 可能的名称类
                    ];

                    let titleElement = null;
                    let title = '';
                    let href = '';

                    for (const selector of titleLinkSelectors) {
                        titleElement = await result.$(selector);
                        if (titleElement) {
                            try {
                                title = await titleElement.textContent();
                                href = await titleElement.getAttribute('href') || '';
                                console.log(`使用选择器 "${selector}" 找到: 标题="${title}", 链接="${href}"`);

                                if (title && title.trim().length > 0) {
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    }

                    if (!title || title.trim().length === 0) {
                        console.log('未找到有效标题，跳过此项');
                        continue;
                    }

                    title = title.trim();
                    console.log(`提取到标题: "${title}"`);
                    console.log(`提取到链接: "${href}"`);

                    // 严格检查是否为期刊（根据.re_tag中的标识）
                    let tagText = '';
                    let isJournal = false;
                    let reason = '';

                    try {
                        const tagElement = await result.$('.re_tag');
                        if (tagElement) {
                            tagText = await tagElement.textContent();
                            console.log(`类型标签完整内容: "${tagText}"`);

                            // 检查是否有期刊标识
                            const hasJournalSpan = await tagElement.$('span');
                            if (hasJournalSpan) {
                                const spanText = await hasJournalSpan.textContent();
                                console.log(`标签span内容: "${spanText}"`);

                                // 严格匹配：只有明确标记为"期刊"的才是期刊
                                if (spanText.trim() === '期刊') {
                                    isJournal = true;
                                    reason = '官方标记为期刊';
                                    console.log(`✓ 确认为期刊`);
                                } else if (spanText.trim() === '报纸') {
                                    isJournal = false;
                                    reason = '官方标记为报纸，排除';
                                    console.log(`× 排除报纸: ${spanText}`);
                                } else {
                                    isJournal = false;
                                    reason = `未知类型标记: ${spanText}`;
                                    console.log(`? 未知类型: ${spanText}`);
                                }
                            }

                            // 检查em标签的class（qk_tag表示期刊，bz_tag表示报纸）
                            const emElement = await tagElement.$('em');
                            if (emElement) {
                                const emClass = await emElement.getAttribute('class');
                                console.log(`em标签class: "${emClass}"`);

                                if (emClass && emClass.includes('qk_tag')) {
                                    if (!isJournal) {
                                        isJournal = true;
                                        reason = 'qk_tag标识为期刊';
                                        console.log(`✓ 通过qk_tag确认为期刊`);
                                    }
                                } else if (emClass && emClass.includes('bz_tag')) {
                                    isJournal = false;
                                    reason = 'bz_tag标识为报纸，排除';
                                    console.log(`× 通过bz_tag排除报纸`);
                                }
                            }

                            // 检查b标签中的英文标识
                            const bElement = await tagElement.$('b');
                            if (bElement) {
                                const bText = await bElement.textContent();
                                console.log(`b标签内容: "${bText}"`);

                                if (bText.trim() === 'Journal') {
                                    if (!isJournal) {
                                        isJournal = true;
                                        reason = '英文Journal标识为期刊';
                                        console.log(`✓ 通过Journal确认为期刊`);
                                    }
                                } else if (bText.trim() === 'Newspaper') {
                                    isJournal = false;
                                    reason = '英文Newspaper标识为报纸，排除';
                                    console.log(`× 通过Newspaper排除报纸`);
                                }
                            }
                        } else {
                            console.log(`未找到.re_tag元素`);
                            // 如果没有标签元素，则不处理，确保安全
                            isJournal = false;
                            reason = '没有类型标签，无法确认';
                        }
                    } catch (e) {
                        console.log(`检查类型标签时出错: ${e.message}`);
                        isJournal = false;
                        reason = '类型检查失败';
                    }

                    console.log(`期刊判断结果: ${isJournal} (${reason})`);

                    // 只有明确确认为期刊的内容才会被收集
                    if (isJournal && title && title.length > 0) {
                        // 确保URL是完整的
                        let fullUrl = href;
                        if (href && !href.startsWith('http')) {
                            if (href.startsWith('/')) {
                                fullUrl = `https://navi.cnki.net${href}`;
                            } else {
                                fullUrl = `https://navi.cnki.net/${href}`;
                            }
                        }

                        // 即使没有链接，也可以尝试处理（可能是纯文本）
                        if (!fullUrl || fullUrl === 'https://navi.cnki.net/') {
                            fullUrl = `https://navi.cnki.net/knavi/journals/index?search=${encodeURIComponent(title)}`;
                            console.log(`生成搜索链接: ${fullUrl}`);
                        }

                        journals.push({
                            title: title,
                            url: fullUrl,
                            reason: reason,
                            tagInfo: tagText
                        });

                        console.log(`✓ 添加期刊: "${title}"`);
                    } else {
                        console.log(`× 跳过非期刊内容: "${title}" (原因: ${reason})`);
                    }

                } catch (e) {
                    console.log(`处理第 ${i + 1} 个结果项时出错: ${e.message}`);
                    continue;
                }
            }

            console.log(`\n期刊提取完成，共找到 ${journals.length} 个期刊`);
            if (journals.length > 0) {
                console.log('前3个期刊:');
                journals.slice(0, 3).forEach((journal, index) => {
                    console.log(`  ${index + 1}. ${journal.title} (${journal.reason})`);
                });
            }

            return journals;

        } catch (error) {
            console.error('提取期刊列表失败:', error);
            return [];
        }
    }

    /**
     * 获取期刊详细信息
     */
    async getJournalDetails(journal) {
        try {
            const detailPage = await this.context.newPage();
            await this.antiDetection.injectAntiDetectionScripts(detailPage);

            try {
                await detailPage.goto(journal.url, {
                    waitUntil: 'networkidle',
                    timeout: 30000
                });

                await this.antiDetection.waitForPageLoad(detailPage);
                await this.randomDelay(2000, 4000);

                const basicInfo = await this.extractBasicInfoFromPage(detailPage);
                const submissionInfo = await this.extractSubmissionInfoFromPage(detailPage);

                const completeInfo = {
                    '期刊名称': journal.title,
                    'CN号': basicInfo.cnNumber || '未知',
                    'ISSN': basicInfo.issn || '未知',
                    '数据库标识': basicInfo.databaseTags || '未知',
                    '曾用刊名': basicInfo.formerName || '未知',
                    '主办单位': basicInfo.publisher || '未知',
                    '出版周期': basicInfo.publishCycle || '未知',
                    '出版地': basicInfo.publishPlace || '未知',
                    '语种': basicInfo.language || '未知',
                    '开本': basicInfo.format || '未知',
                    '创刊时间': basicInfo.foundingTime || '未知',
                    '专辑名称': basicInfo.albumName || '未知',
                    '专题名称': basicInfo.topicName || '未知',
                    '出版文献量': basicInfo.publicationCount || '未知',
                    '总下载次数': basicInfo.totalDownloads || '未知',
                    '总被引次数': basicInfo.totalCitations || '未知',
                    '复合影响因子': basicInfo.compositeFactor || '未知',
                    '复合影响因子年份': basicInfo.compositeFactorYear || '未知',
                    '综合影响因子': basicInfo.comprehensiveFactor || '未知',
                    '综合影响因子年份': basicInfo.comprehensiveFactorYear || '未知',
                    '数据库收录列表': basicInfo.databaseList || '未知',
                    'WJCI分区': submissionInfo.wjciPartition || '未知',
                    '投稿出版周期': submissionInfo.submissionPublishCycle || '未知',
                    '投稿是否收费': submissionInfo.submissionFeeInfo || '未知',
                    '主编': submissionInfo.chiefEditor || '未知',
                    '副主编': submissionInfo.deputyEditor || '未知',
                    '官网网址': submissionInfo.officialWebsite || '未知',
                    '投稿网址': submissionInfo.submissionWebsite || '未知',
                    '投稿邮箱': submissionInfo.submissionEmail || '未知',
                    '咨询邮箱': submissionInfo.consultationEmail || '未知',
                    '编辑部地址': submissionInfo.editorialAddress || '未知',
                    '联系电话': submissionInfo.contactPhone || '未知',
                    '获取时间': new Date().toLocaleString('zh-CN')
                };

                return completeInfo;

            } finally {
                await detailPage.close();
            }

        } catch (error) {
            console.error('获取期刊详细信息失败:', error);
            return null;
        }
    }

    /**
     * 从详情页面提取基本信息
     */
    async extractBasicInfoFromPage(page) {
        const info = {};

        try {
            // 点击"更多介绍"按钮
            try {
                const moreButton = await page.$('#J_sumBtn-stretch, .btn-stretch');
                if (moreButton && await moreButton.isVisible()) {
                    await moreButton.click();
                    await page.waitForTimeout(2000);
                }
            } catch (e) {
                // 忽略错误
            }

            const pageText = await page.textContent('body');

            // 提取基本信息
            const patterns = {
                cnNumber: /CN[：:]*([\d]+[\-\/][\d\w]+)/i,
                issn: /ISSN[：:]*([\d]+[\-][\d]+)/i,
                formerName: /曾用刊名[\s：:]*([^\n\r]{5,100})/i,
                publisher: /主办单位[：:]*([\u4e00-\u9fa5\w\s]{2,50})/i,
                publishCycle: /出版周期[\s：:]*([^\n\r]{2,50})/i,
                publishPlace: /出版地[\s：:]*([^\n\r；;语]{2,20})/i,
                language: /语种[\s：:]*([^\n\r；;开]{2,20})/i,
                format: /开本[\s：:]*([^\n\r创]{2,10})/i,
                foundingTime: /创刊时间[\s：:]*([\d]{4})/i,
                albumName: /专辑名称[\s：:]*([^\n\r]{2,100})/i,
                topicName: /专题名称[\s：:]*([^\n\r]{2,100})/i,
                publicationCount: /出版文献量[\s：:]*([\d,]+[篇]*)/i,
                totalDownloads: /总下载次数[\s：:]*([\d,]+次)/i,
                totalCitations: /总被引次数[\s：:]*([\d,]+次)/i
            };

            for (const [key, pattern] of Object.entries(patterns)) {
                const match = pageText.match(pattern);
                if (match && match[1]) {
                    info[key] = match[1].trim();
                }
            }

            // 提取数据库标识
            const databaseTags = pageText.match(/(SCI|JSTP|CSCD|WJCI|AJ)[^\s]{0,10}/gi);
            if (databaseTags && databaseTags.length > 0) {
                info.databaseTags = databaseTags.join(' ');
            }

            // 提取影响因子
            const compositeFactorMatch = pageText.match(/\((\d{4})版\)复合影响因子[\s：:]*([\d.]+)/i);
            if (compositeFactorMatch) {
                info.compositeFactor = compositeFactorMatch[2].trim();
                info.compositeFactorYear = compositeFactorMatch[1].trim();
            }

            const comprehensiveFactorMatch = pageText.match(/\((\d{4})版\)综合影响因子[\s：:]*([\d.]+)/i);
            if (comprehensiveFactorMatch) {
                info.comprehensiveFactor = comprehensiveFactorMatch[2].trim();
                info.comprehensiveFactorYear = comprehensiveFactorMatch[1].trim();
            }

        } catch (error) {
            console.warn('提取基本信息失败:', error);
        }

        return info;
    }

    /**
     * 从详情页面提取投稿信息
     */
    async extractSubmissionInfoFromPage(page) {
        const info = {};

        try {
            // 尝试点击投稿按钮
            const submitButtonSelectors = ['#TouGao', '.shares', 'a:has-text("投稿")'];

            for (const selector of submitButtonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button && await button.isVisible()) {
                        await button.click();
                        await page.waitForTimeout(3000);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 检查是否有新窗口
            const pages = this.context.pages();
            let targetPage = page;

            if (pages.length > 1) {
                targetPage = pages[pages.length - 1];
                await targetPage.waitForTimeout(3000);
            }

            const pageText = await targetPage.textContent('body');

            // 提取投稿信息
            const patterns = {
                wjciPartition: /WJCI分区[\s：:]*([Q\d]+)/i,
                submissionPublishCycle: /出版周期[\s：:]*([^\n\r]{1,20})/i,
                submissionFeeInfo: /是否收费[\s：:]*([^\/\n\r]{1,20})/i,
                chiefEditor: /主编[\s：:]*([^\n\r]{1,20})/i,
                deputyEditor: /副主编[\s：:]*([^\n\r]{1,20})/i,
                officialWebsite: /官网网址[\s：:]*([^\n\r\s]{10,100})/i,
                submissionWebsite: /投稿网址[\s：:]*([^\n\r\s]{10,100})/i,
                submissionEmail: /投稿邮箱[\s：:]*([^\n\r\s]{5,50})/i,
                consultationEmail: /咨询邮箱[\s：:]*([^\n\r\s]{5,50})/i,
                editorialAddress: /编辑部地址[\s：:]*([^\n\r]{5,100})/i,
                contactPhone: /联系电话[\s：:]*([^\n\r]{5,30})/i
            };

            for (const [key, pattern] of Object.entries(patterns)) {
                const match = pageText.match(pattern);
                if (match && match[1] && match[1].trim() !== '暂无') {
                    info[key] = match[1].trim();
                }
            }

            // 特殊处理收费信息
            if (!info.submissionFeeInfo && pageText.includes('是否收费')) {
                info.submissionFeeInfo = '/';
            }

            // 如果打开了新页面，关闭它
            if (pages.length > 1) {
                await targetPage.close();
            }

        } catch (error) {
            console.warn('提取投稿信息失败:', error);
        }

        return info;
    }

    /**
     * 翻页到下一页
     */
    async goToNextPage() {
        try {
            console.log('开始尝试翻到下一页...');

            // 等待页面稳定
            await this.page.waitForTimeout(2000);

            const nextSelectors = [
                '.pagenav .next',               // 标准下一页按钮
                'a.next',                       // 类名为next的链接
                '.next',                        // 任何next类
                'a:has-text("下一页")',        // 包含“下一页”文本的链接
                'a:has-text("下页")',          // 包含“下页”文本的链接  
                'a[title*="下一页"]',        // title属性包含下一页
                '.pagenav a:last-child',        // 翻页导航的最后一个链接
                '.page-next',                   // 可能的翻页类名
                'a[onclick*="next"]',          // 包含next的onclick事件
                '.pagination .next',            // Bootstrap样式的翻页
                '.paging .next'                 // 其他可能的翻页样式
            ];

            for (let i = 0; i < nextSelectors.length; i++) {
                const selector = nextSelectors[i];
                console.log(`尝试选择器 ${i + 1}/${nextSelectors.length}: ${selector}`);

                try {
                    const nextButton = await this.page.$(selector);
                    if (nextButton) {
                        const isVisible = await nextButton.isVisible();
                        const isEnabled = await nextButton.isEnabled();
                        const buttonText = await nextButton.textContent().catch(() => '');
                        const href = await nextButton.getAttribute('href').catch(() => '');

                        console.log(`  找到按钮: 可见=${isVisible}, 启用=${isEnabled}, 文本="${buttonText}", 链接="${href}"`);

                        if (isVisible && isEnabled) {
                            console.log(`  点击下一页按钮: ${selector}`);
                            await nextButton.click();
                            console.log('  等待页面加载...');
                            await this.antiDetection.waitForPageLoad(this.page);
                            await this.randomDelay(...this.delayBetweenPages);
                            console.log('  ✓ 翻页成功');
                            return true;
                        } else {
                            console.log(`  × 按钮不可用或不可见`);
                        }
                    } else {
                        console.log(`  × 未找到按钮`);
                    }
                } catch (e) {
                    console.log(`  × 选择器失败: ${e.message}`);
                    continue;
                }
            }

            // 如果所有选择器都失败，尝试查找数字页码链接
            console.log('尝试查找数字页码链接...');
            try {
                const pageLinks = await this.page.$$('.pagenav a, .pagination a, .paging a');
                console.log(`找到 ${pageLinks.length} 个页码链接`);

                for (let i = 0; i < pageLinks.length; i++) {
                    const link = pageLinks[i];
                    const linkText = await link.textContent().catch(() => '');
                    const href = await link.getAttribute('href').catch(() => '');
                    console.log(`  页码链接 ${i + 1}: 文本="${linkText}", 链接="${href}"`);

                    // 尝试找数字页码（如果存在）
                    if (/^\d+$/.test(linkText.trim())) {
                        const pageNum = parseInt(linkText.trim());
                        console.log(`  发现数字页码: ${pageNum}`);
                    }
                }
            } catch (e) {
                console.log(`查找数字页码失败: ${e.message}`);
            }

            console.log('× 所有翻页尝试都失败，可能已到达最后一页');
            return false;

        } catch (error) {
            console.error('翻页失败:', error);
            return false;
        }
    }

    /**
     * 处理单个搜索编码的所有页面
     */
    async processSearchCode(searchCode) {
        try {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`开始处理搜索编码: ${searchCode}`);
            console.log(`${'='.repeat(50)}`);

            await this.performSearch(searchCode);

            let currentPage = 1;
            let totalPages = 0;
            let hasNextPage = true;

            while (hasNextPage) {
                // 检查页面限制
                if (this.maxPages > 0 && totalPages >= this.maxPages) {
                    console.log(`已达到全局最大页面数限制: ${this.maxPages}`);
                    break;
                }

                if (currentPage > this.maxPagesPerCode) {
                    console.log(`已达到当前编码最大页面数限制: ${this.maxPagesPerCode}`);
                    break;
                }

                try {
                    const pageStats = await this.processResultsPage(currentPage, searchCode);

                    // 注释掉原有的停止逻辑，让程序能继续翻页
                    // if (pageStats.processed === 0) {
                    //     console.log('当前页面没有可处理的内容，停止翻页');
                    //     break;
                    // }

                    hasNextPage = await this.goToNextPage();

                    if (hasNextPage) {
                        currentPage++;
                        totalPages++;
                    } else {
                        console.log('已到达最后一页或无法翻页，停止对当前编码的处理');
                    }

                } catch (error) {
                    console.error(`处理第 ${currentPage} 页时出错:`, error);

                    if (currentPage === 1) {
                        throw error;
                    } else {
                        console.log('尝试继续下一页...');
                        hasNextPage = await this.goToNextPage();
                        if (hasNextPage) {
                            currentPage++;
                            totalPages++;
                        }
                    }
                }
            }

            console.log(`编码 ${searchCode} 处理完成，共处理了 ${currentPage} 页`);
            this.stats.processedCodes.push({
                code: searchCode,
                pages: currentPage,
                time: new Date()
            });

            // 编码间延时
            await this.randomDelay(...this.delayBetweenCodes);

        } catch (error) {
            console.error(`处理搜索编码 ${searchCode} 失败:`, error);
            throw error;
        }
    }

    /**
     * 保存进度
     */
    async saveProgress() {
        try {
            console.log('\n正在保存进度到Excel文件...');
            const success = this.excelHandler.saveToExcel();

            if (success) {
                const stats = this.excelHandler.getStats();
                console.log(`✓ 进度已保存: ${stats.totalRecords} 条记录`);
            }

            return success;
        } catch (error) {
            console.error('保存进度失败:', error);
            return false;
        }
    }

    /**
     * 随机延时
     */
    async randomDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        console.log(`随机等待 ${delay}ms...`);
        await this.page.waitForTimeout(delay);
    }

    /**
     * 打印统计信息
     */
    printStats() {
        const endTime = new Date();
        const duration = endTime - this.stats.startTime;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

        console.log('\n' + '='.repeat(60));
        console.log('                    爬取统计');
        console.log('='.repeat(60));
        console.log(`总处理: ${this.stats.totalProcessed} 个期刊`);
        console.log(`成功保存: ${this.stats.totalSaved} 个期刊`);
        console.log(`跳过重复: ${this.stats.totalSkipped} 个期刊`);
        console.log(`出现错误: ${this.stats.totalErrors} 个期刊`);
        console.log(`运行时间: ${hours}小时${minutes}分钟`);
        console.log(`处理编码: ${this.stats.processedCodes.map(c => c.code).join(', ')}`);
        console.log('='.repeat(60));
    }

    /**
     * 清理资源
     */
    async cleanup() {
        try {
            if (this.page) await this.page.close();
            if (this.context) await this.context.close();
            if (this.browser) await this.browser.close();
            console.log('资源清理完成');
        } catch (error) {
            console.error('资源清理失败:', error);
        }
    }

    /**
     * 运行批量爬取
     */
    async run() {
        try {
            console.log('='.repeat(60));
            console.log('         知网期刊批量爬取开始');
            console.log('='.repeat(60));

            // 初始化
            await this.initBrowser();
            this.excelHandler.initExcel();

            // 处理每个搜索编码
            for (const searchCode of this.searchCodes) {
                try {
                    await this.processSearchCode(searchCode);
                } catch (error) {
                    console.error(`处理搜索编码 ${searchCode} 失败，继续下一个编码:`, error);
                    continue;
                }
            }

            // 最终保存
            await this.saveProgress();

            console.log('\n' + '='.repeat(60));
            console.log('         批量爬取完成');
            console.log('='.repeat(60));

            this.printStats();

        } catch (error) {
            console.error('\n批量爬取失败:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// 主函数，支持自定义配置
async function main() {
    // 自定义配置示例
    const options = {
        searchCodes: ['11-', '31-', '21-', '44-', '37-', '51-'], // 可自定义搜索编码
        maxPages: 0, // 0表示无上限，爬到底；设置数字表示最大页面数
        maxPagesPerCode: 50, // 每个编码最大页数
    };

    const crawler = new BatchCrawler(options);

    try {
        await crawler.run();
    } catch (error) {
        console.error('批量爬取运行失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = BatchCrawler;