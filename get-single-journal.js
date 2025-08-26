#!/usr/bin/env node

/**
 * 单个期刊详情测试脚本
 * 用于测试完整的期刊信息获取流程
 */

const { chromium } = require('playwright');
const config = require('./src/config');
const AntiDetection = require('./src/antiDetection');
const ExcelHandler = require('./src/excelHandler');

class SingleJournalTester {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.antiDetection = new AntiDetection();
        this.excelHandler = new ExcelHandler();
    }

    /**
     * 初始化浏览器
     */
    async initBrowser() {
        try {
            console.log('正在初始化浏览器...');

            // 使用增强的浏览器配置
            this.browser = await chromium.launch({
                headless: config.ANTI_DETECTION.BROWSER_CONFIG.headless,
                args: config.ANTI_DETECTION.BROWSER_CONFIG.args
            });

            // 使用增强的上下文配置
            const contextOptions = {
                ...config.ANTI_DETECTION.BROWSER_CONFIG.contextOptions,
                viewport: config.ANTI_DETECTION.BROWSER_CONFIG.viewport,
                userAgent: config.ANTI_DETECTION.BROWSER_CONFIG.userAgent
            };

            this.context = await this.browser.newContext(contextOptions);

            // 配置反检测
            await this.antiDetection.configureBrowser(this.browser, this.context);

            // 创建主页面
            this.page = await this.context.newPage();

            // 注入反检测脚本
            await this.antiDetection.injectAntiDetectionScripts(this.page);

            // 设置网络请求拦截（如果启用）
            if (config.ANTI_DETECTION.ADVANCED_OPTIONS.ENABLE_NETWORK_INTERCEPTION) {
                await this.antiDetection.setupNetworkInterception(this.page);
            }

            console.log('浏览器初始化完成 - 已启用高级反检测功能');
            return true;
        } catch (error) {
            console.error('浏览器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 搜索并获取第一个期刊
     */
    async findFirstJournal() {
        try {
            console.log('正在访问知网检索页面...');

            // 访问知网
            await this.page.goto(config.BASE_URL, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            await this.antiDetection.waitForPageLoad(this.page);
            await this.page.waitForTimeout(3000);

            console.log('正在搜索期刊...');

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
                        console.log(`找到搜索输入框: ${selector}`);
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
                console.log('已选择搜索类型: CN');
            } catch (e) {
                console.log('搜索类型选择失败，继续执行');
            }

            // 输入搜索关键词（改为31-）
            await inputElement.fill('31-');
            console.log('已输入搜索关键词: 31-');
            await this.page.waitForTimeout(1000);

            // 执行搜索
            await this.page.keyboard.press('Enter');
            console.log('已执行搜索');

            // 等待搜索结果
            await this.antiDetection.waitForPageLoad(this.page);
            await this.page.waitForTimeout(5000);

            // 跳转到第5页
            console.log('正在跳转到第5页...');
            const success = await this.goToPage(5);
            if (!success) {
                console.log('跳转第5页失败，尝试在当前页查找期刊');
            } else {
                console.log('成功跳转到第5页');
                await this.page.waitForTimeout(3000);
            }

            // 查找第一个期刊
            const journal = await this.findFirstJournalInResults();
            return journal;

        } catch (error) {
            console.error('搜索期刊失败:', error);
            throw error;
        }
    }

    /**
     * 跳转到指定页码
     */
    async goToPage(pageNumber) {
        try {
            console.log(`尝试跳转到第 ${pageNumber} 页`);

            // 方法1: 查找页码链接
            const pageSelectors = [
                `a[data-page="${pageNumber}"]`,
                `a:has-text("${pageNumber}")`,
                `.pagenav a:has-text("${pageNumber}")`
            ];

            for (const selector of pageSelectors) {
                try {
                    const pageLink = await this.page.$(selector);
                    if (pageLink && await pageLink.isVisible()) {
                        console.log(`找到第${pageNumber}页链接: ${selector}`);
                        await pageLink.click();
                        await this.antiDetection.waitForPageLoad(this.page);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 方法2: 逐步点击下一页
            console.log(`未找到直接页码链接，尝试逐步翻页到第${pageNumber}页`);
            let currentPage = 1;

            while (currentPage < pageNumber) {
                // 查找下一页按钮
                const nextSelectors = [
                    '.pagenav .next',
                    'a.next',
                    '.next',
                    'a:has-text("下一页")',
                    'a:has-text("下页")'
                ];

                let clickedNext = false;
                for (const selector of nextSelectors) {
                    try {
                        const nextButton = await this.page.$(selector);
                        if (nextButton && await nextButton.isVisible() && await nextButton.isEnabled()) {
                            console.log(`点击下一页按钮: ${selector} (当前第${currentPage}页)`);
                            await nextButton.click();
                            await this.page.waitForTimeout(2000);
                            currentPage++;
                            clickedNext = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!clickedNext) {
                    console.log('无法找到下一页按钮，停止翻页');
                    break;
                }

                if (currentPage >= 10) { // 防止无限循环
                    console.log('翻页次数过多，停止翻页');
                    break;
                }
            }

            return currentPage >= pageNumber;
        } catch (error) {
            console.error(`跳转到第${pageNumber}页失败:`, error);
            return false;
        }
    }

    /**
     * 在搜索结果中查找第一个期刊
     */
    async findFirstJournalInResults() {
        try {
            console.log('正在分析搜索结果...');

            // 等待结果加载
            await this.page.waitForTimeout(3000);

            // 查找结果项
            const resultSelectors = [
                'dl.result',
                '.result-table-list dl',
                '.grid-table tr'
            ];

            let results = [];
            let usedSelector = '';

            for (const selector of resultSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 10000 });
                    results = await this.page.$$(selector);
                    if (results.length > 0) {
                        usedSelector = selector;
                        console.log(`使用选择器 "${selector}" 找到 ${results.length} 个结果项`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (results.length === 0) {
                throw new Error('未找到搜索结果');
            }

            // 分析每个结果项，找到第一个期刊
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                console.log(`\n--- 分析第 ${i + 1} 个结果项 ---`);

                try {
                    // 先获取标题信息
                    const titleLink = await result.$('h1 a, dt a, .title a');
                    let title = '';
                    let href = '';

                    if (titleLink) {
                        title = await titleLink.textContent();
                        href = await titleLink.getAttribute('href');
                        console.log(`标题: ${title ? title.trim() : '未找到'}`);
                        console.log(`链接: ${href || '未找到'}`);
                    } else {
                        console.log('未找到标题链接');
                    }

                    // 检查类型标签
                    const tagElement = await result.$('.re_tag');
                    let tagText = '';
                    if (tagElement) {
                        tagText = await tagElement.textContent();
                        console.log(`类型标签: ${tagText || '空'}`);
                    } else {
                        console.log('未找到类型标签(.re_tag)');
                    }

                    // 放宽期刊识别条件
                    let isJournal = false;
                    let reason = '';

                    // 方法1: 通过类型标签识别
                    if (tagText) {
                        if (tagText.includes('期刊') || tagText.includes('杂志') ||
                            tagText.includes('学报') || tagText.includes('通讯') ||
                            tagText.includes('Journal')) {
                            isJournal = true;
                            reason = '类型标签匹配';
                        }
                    }

                    // 方法2: 通过标题关键词识别
                    if (!isJournal && title) {
                        const journalKeywords = ['期刊', '杂志', '学报', '通讯', '研究', '科学', '技术', '医学', '管理', '教育'];
                        if (journalKeywords.some(keyword => title.includes(keyword))) {
                            // 进一步检查标题长度和特征
                            if (title.length >= 3 && title.length <= 50 &&
                                !title.includes('首页') && !title.includes('登录') &&
                                !title.includes('注册') && !title.includes('帮助')) {
                                isJournal = true;
                                reason = '标题关键词匹配';
                            }
                        }
                    }

                    // 方法3: 如果前两种方法都没识别出来，但有合理的标题和链接，则作为候选
                    if (!isJournal && title && href && title.length >= 3 && title.length <= 50) {
                        // 检查是否是明显的非期刊内容
                        const excludeKeywords = ['首页', '登录', '注册', '帮助', '关于', '联系', '下载', '软件'];
                        if (!excludeKeywords.some(keyword => title.includes(keyword))) {
                            isJournal = true;
                            reason = '默认候选（有标题和链接）';
                        }
                    }

                    console.log(`是否为期刊: ${isJournal} (${reason})`);

                    if (isJournal && title && href) {
                        const fullUrl = href.startsWith('http') ? href : `https://navi.cnki.net${href}`;
                        console.log(`\n✓ 选择此期刊: ${title.trim()}`);
                        console.log(`期刊URL: ${fullUrl}`);

                        return {
                            title: title.trim(),
                            url: fullUrl
                        };
                    }
                } catch (e) {
                    console.log(`处理第 ${i + 1} 个结果项时出错:`, e.message);
                    continue;
                }
            }

            throw new Error('未找到期刊类型的结果');
        } catch (error) {
            console.error('分析搜索结果失败:', error);
            throw error;
        }
    }

    /**
     * 获取期刊详细信息
     */
    async getJournalDetails(journal) {
        try {
            console.log(`正在获取期刊详细信息: ${journal.title}`);

            // 打开期刊详情页
            await this.page.goto(journal.url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            await this.antiDetection.waitForPageLoad(this.page);
            await this.page.waitForTimeout(3000);

            console.log('期刊详情页加载完成，开始提取信息...');

            // 提取基本信息
            const basicInfo = await this.extractBasicInfo();
            console.log('基本信息:', basicInfo);

            // 提取投稿信息
            const submissionInfo = await this.extractSubmissionInfo();
            console.log('投稿信息:', submissionInfo);

            // 合并所有信息
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
        } catch (error) {
            console.error('获取期刊详细信息失败:', error);
            throw error;
        }
    }

    /**
     * 提取期刊详情页面的所有信息
     */
    async extractBasicInfo() {
        const info = {};

        try {
            console.log('开始提取期刊详情页面信息...');

            // 等待页面内容加载
            await this.page.waitForTimeout(3000);

            // 点击"更多介绍"按钮来获取完整信息
            console.log('尝试点击"更多介绍"按钮...');
            try {
                const moreIntroSelectors = [
                    '#J_sumBtn-stretch',
                    '.btn-stretch',
                    'a:has-text("更多介绍")',
                    'a[href="javascript:void(0);"]',
                    '.btn-stretch[href="javascript:void(0);"]'
                ];

                let moreButtonClicked = false;
                for (const selector of moreIntroSelectors) {
                    try {
                        const moreButton = await this.page.$(selector);
                        if (moreButton && await moreButton.isVisible()) {
                            console.log(`找到"更多介绍"按钮: ${selector}`);
                            await moreButton.click();
                            console.log('成功点击"更多介绍"按钮');

                            // 等待页面内容展开
                            await this.page.waitForTimeout(2000);
                            moreButtonClicked = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`尝试选择器 ${selector} 失败: ${e.message}`);
                        continue;
                    }
                }

                if (!moreButtonClicked) {
                    console.log('未找到"更多介绍"按钮，继续提取可见内容');
                }
            } catch (error) {
                console.warn('点击"更多介绍"按钮失败:', error.message);
            }

            // 获取页面文本内容
            const pageText = await this.page.textContent('body');

            // === 提取期刊标识信息 ===
            console.log('提取期刊标识信息...');

            // CN号 - 根据调试信息优化正则
            const cnMatch = pageText.match(/CN[：:]*([\d]+[\-\/][\d\w]+)/i);
            if (cnMatch && cnMatch[1]) {
                info.cnNumber = cnMatch[1].trim();
                console.log(`找到CN号: ${info.cnNumber}`);
            }

            // ISSN - 根据调试信息优化正则  
            const issnMatch = pageText.match(/ISSN[：:]*([\d]+[\-][\d]+)/i);
            if (issnMatch && issnMatch[1]) {
                info.issn = issnMatch[1].trim();
                console.log(`找到ISSN: ${info.issn}`);
            }

            // 数据库收录标识（SCI、JSTP等）
            const databaseTags = pageText.match(/(SCI|JSTP|CSCD|WJCI|AJ)[^\s]{0,10}/gi);
            if (databaseTags && databaseTags.length > 0) {
                info.databaseTags = databaseTags.join(' ');
                console.log(`找到数据库标识: ${info.databaseTags}`);
            }

            // === 基本信息栏 ===
            console.log('提取基本信息栏...');

            // 曾用刊名
            const formerNameMatch = pageText.match(/曾用刊名[\s：:]*([^\n\r]{5,100})/i);
            if (formerNameMatch && formerNameMatch[1]) {
                info.formerName = formerNameMatch[1].trim();
                console.log(`找到曾用刊名: ${info.formerName}`);
            }

            // 主办单位 - 使用多种策略提取
            const publisherPatterns = [
                /主办单位[：:]*([\u4e00-\u9fa5\w\s]{2,50})/i,
                /主办单位[：:]*\s*(复旦大学)/i,
                /主办单位[：:]*\s*([\u4e00-\u9fa5]{2,20}大学)/i,
                /主办单位[：:]*\s*([\u4e00-\u9fa5]{2,30})/i
            ];

            for (const pattern of publisherPatterns) {
                const publisherMatch = pageText.match(pattern);
                if (publisherMatch && publisherMatch[1]) {
                    let publisher = publisherMatch[1].trim();
                    // 清理可能的干扰内容
                    publisher = publisher
                        .replace(/[，,].*$/, '') // 移除逗号后的内容
                        .replace(/ISSN.*$/i, '')
                        .replace(/CN.*$/i, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (publisher && publisher.length > 1 && publisher.length < 50 && !publisher.includes('ISSN') && !publisher.includes('CN')) {
                        info.publisher = publisher;
                        console.log(`找到主办单位: ${info.publisher}`);
                        break;
                    }
                }
            }

            // 出版周期
            const publishCycleMatch = pageText.match(/出版周期[\s：:]*([^\n\r]{2,50})/i);
            if (publishCycleMatch && publishCycleMatch[1]) {
                info.publishCycle = publishCycleMatch[1].trim();
                console.log(`找到出版周期: ${info.publishCycle}`);
            }

            // 出版地
            const publishPlaceMatch = pageText.match(/出版地[\s：:]*([^\n\r；;语]{2,20})/i);
            if (publishPlaceMatch && publishPlaceMatch[1]) {
                info.publishPlace = publishPlaceMatch[1].trim();
                console.log(`找到出版地: ${info.publishPlace}`);
            }

            // 语种
            const languageMatch = pageText.match(/语种[\s：:]*([^\n\r；;开]{2,20})/i);
            if (languageMatch && languageMatch[1]) {
                info.language = languageMatch[1].trim().replace(/[;,].*$/, '');
                console.log(`找到语种: ${info.language}`);
            }

            // 开本
            const formatMatch = pageText.match(/开本[\s：:]*([^\n\r创]{2,10})/i);
            if (formatMatch && formatMatch[1]) {
                info.format = formatMatch[1].trim();
                console.log(`找到开本: ${info.format}`);
            }

            // 创刊时间
            const foundingTimeMatch = pageText.match(/创刊时间[\s：:]*([\d]{4})/i);
            if (foundingTimeMatch && foundingTimeMatch[1]) {
                info.foundingTime = foundingTimeMatch[1].trim();
                console.log(`找到创刊时间: ${info.foundingTime}`);
            }

            // === 出版信息栏 ===
            console.log('提取出版信息栏...');

            // 专辑名称
            const albumMatch = pageText.match(/专辑名称[\s：:]*([^\n\r]{2,100})/i);
            if (albumMatch && albumMatch[1]) {
                info.albumName = albumMatch[1].trim();
                console.log(`找到专辑名称: ${info.albumName}`);
            }

            // 专题名称
            const topicMatch = pageText.match(/专题名称[\s：:]*([^\n\r]{2,100})/i);
            if (topicMatch && topicMatch[1]) {
                info.topicName = topicMatch[1].trim();
                console.log(`找到专题名称: ${info.topicName}`);
            }

            // 出版文献量
            const publicationCountMatch = pageText.match(/出版文献量[\s：:]*([\d,]+[篇]*)/i);
            if (publicationCountMatch && publicationCountMatch[1]) {
                info.publicationCount = publicationCountMatch[1].trim();
                console.log(`找到出版文献量: ${info.publicationCount}`);
            }

            // 总下载次数
            const totalDownloadMatch = pageText.match(/总下载次数[\s：:]*([\d,]+次)/i);
            if (totalDownloadMatch && totalDownloadMatch[1]) {
                info.totalDownloads = totalDownloadMatch[1].trim();
                console.log(`找到总下载次数: ${info.totalDownloads}`);
            }

            // 总被引次数
            const totalCitationMatch = pageText.match(/总被引次数[\s：:]*([\d,]+次)/i);
            if (totalCitationMatch && totalCitationMatch[1]) {
                info.totalCitations = totalCitationMatch[1].trim();
                console.log(`找到总被引次数: ${info.totalCitations}`);
            }

            // === 评价信息栏 ===
            console.log('提取评价信息栏...');

            // 复合影响因子（含年份）
            const compositeFactorMatch = pageText.match(/\((\d{4})版\)复合影响因子[\s：:]*([\d.]+)/i);
            if (compositeFactorMatch && compositeFactorMatch[2]) {
                info.compositeFactor = compositeFactorMatch[2].trim();
                info.compositeFactorYear = compositeFactorMatch[1].trim();
                console.log(`找到复合影响因子: ${info.compositeFactor} (${info.compositeFactorYear}版)`);
            }

            // 综合影响因子（含年份）
            const comprehensiveFactorMatch = pageText.match(/\((\d{4})版\)综合影响因子[\s：:]*([\d.]+)/i);
            if (comprehensiveFactorMatch && comprehensiveFactorMatch[2]) {
                info.comprehensiveFactor = comprehensiveFactorMatch[2].trim();
                info.comprehensiveFactorYear = comprehensiveFactorMatch[1].trim();
                console.log(`找到综合影响因子: ${info.comprehensiveFactor} (${info.comprehensiveFactorYear}版)`);
            }

            // 数据库收录信息
            const databaseListMatch = pageText.match(/该刊被以下数据库收录[\s：:]*([^\n\r]{5,200})/i);
            if (databaseListMatch && databaseListMatch[1]) {
                info.databaseList = databaseListMatch[1].trim();
                console.log(`找到数据库收录信息: ${info.databaseList}`);
            }

            // 尝试从表格中提取更多信息
            await this.extractFromTablesDetailed(info);

            console.log('期刊详情信息提取完成:', info);
            return info;

        } catch (error) {
            console.error('提取期刊详情信息失败:', error);
            return {};
        }
    }

    /**
     * 从表格中提取详细信息
     */
    async extractFromTablesDetailed(info) {
        try {
            console.log('开始从表格中提取详细信息...');

            const tables = await this.page.$$('table');

            for (const table of tables) {
                const rows = await table.$$('tr');

                for (const row of rows) {
                    const cells = await row.$$('td, th');
                    if (cells.length >= 2) {
                        try {
                            const keyCell = await cells[0].textContent();
                            const valueCell = await cells[1].textContent();

                            if (keyCell && valueCell) {
                                const key = keyCell.trim();
                                const value = valueCell.trim();

                                // 根据关键词匹配对应字段
                                if (key.includes('主办单位') && !info.publisher && value.length > 1 && value.length < 100 && !value.includes('ISSN') && !value.includes('CN')) {
                                    info.publisher = value;
                                    console.log(`表格提取主办单位: ${value}`);
                                } else if (key.includes('出版周期') && !info.publishCycle && value.length > 1 && value.length < 30) {
                                    info.publishCycle = value;
                                    console.log(`表格提取出版周期: ${value}`);
                                } else if (key.includes('专辑名称') && !info.albumName && value.length > 1 && value.length < 100) {
                                    info.albumName = value;
                                    console.log(`表格提取专辑名称: ${value}`);
                                } else if (key.includes('专题名称') && !info.topicName && value.length > 1 && value.length < 100) {
                                    info.topicName = value;
                                    console.log(`表格提取专题名称: ${value}`);
                                } else if (key.includes('出版文献量') && !info.publicationCount && value.length > 1 && value.length < 50) {
                                    info.publicationCount = value;
                                    console.log(`表格提取出版文献量: ${value}`);
                                } else if (key.includes('复合影响因子') && !info.compositeFactor && value.length > 1 && value.length < 20) {
                                    info.compositeFactor = value;
                                    console.log(`表格提取复合影响因子: ${value}`);
                                } else if (key.includes('综合影响因子') && !info.comprehensiveFactor && value.length > 1 && value.length < 20) {
                                    info.comprehensiveFactor = value;
                                    console.log(`表格提取综合影响因子: ${value}`);
                                } else if (key.includes('曾用刊名') && !info.formerName && value.length > 1 && value.length < 100) {
                                    info.formerName = value;
                                    console.log(`表格提取曾用刊名: ${value}`);
                                } else if (key.includes('出版地') && !info.publishPlace && value.length > 1 && value.length < 50) {
                                    info.publishPlace = value;
                                    console.log(`表格提取出版地: ${value}`);
                                } else if (key.includes('语种') && !info.language && value.length > 1 && value.length < 50) {
                                    info.language = value;
                                    console.log(`表格提取语种: ${value}`);
                                } else if (key.includes('开本') && !info.format && value.length > 1 && value.length < 20) {
                                    info.format = value;
                                    console.log(`表格提取开本: ${value}`);
                                } else if (key.includes('创刊时间') && !info.foundingTime && value.length > 1 && value.length < 20) {
                                    info.foundingTime = value;
                                    console.log(`表格提取创刊时间: ${value}`);
                                } else if (key.includes('总下载次数') && !info.totalDownloads && value.length > 1 && value.length < 50) {
                                    info.totalDownloads = value;
                                    console.log(`表格提取总下载次数: ${value}`);
                                } else if (key.includes('总被引次数') && !info.totalCitations && value.length > 1 && value.length < 50) {
                                    info.totalCitations = value;
                                    console.log(`表格提取总被引次数: ${value}`);
                                }
                            }
                        } catch (e) {
                            // 忽略单个单元格的错误
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('从表格提取详细信息失败:', error);
        }
    }

    /**
     * 提取投稿信息
     */
    async extractSubmissionInfo() {
        const submissionInfo = {};

        try {
            console.log('开始提取投稿信息...');

            // 尝试点击投稿按钮
            const submitButtonSelectors = [
                '#TouGao',                              // 主要的ID选择器
                '.shares',                             // class选择器
                'a:has-text("投稿")',               // 包含投稿文本的链接
                'a[onclick*="tougao_click"]',          // 包含tougao_click函数的链接
                '.icon-contribute',                    // 图标class
                'li.item a:has-text("投稿")',        // 在li.item中的投稿链接
                '.item .shares',                       // 在item中的shares类
                'a.shares[onclick*="tougao_click"]'    // 组合选择器
            ];

            let foundSubmitButton = false;
            for (const selector of submitButtonSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button && await button.isVisible()) {
                        console.log(`找到投稿按钮: ${selector}`);

                        // 获取按钮的文本内容和URL用于调试
                        const buttonText = await button.textContent();
                        const buttonHref = await button.getAttribute('href');
                        const buttonOnclick = await button.getAttribute('onclick');
                        console.log(`按钮文本: ${buttonText}`);
                        console.log(`按钮Href: ${buttonHref}`);
                        console.log(`按钮Onclick: ${buttonOnclick}`);

                        // 点击投稿按钮
                        await button.click();
                        console.log('投稿按钮点击成功');

                        // 等待页面加载和可能的跳转
                        await this.page.waitForTimeout(5000);

                        // 检查是否有新窗口或新标签页
                        const pages = this.context.pages();
                        let targetPage = this.page;

                        if (pages.length > 1) {
                            // 如果有新页面，使用最新的页面
                            targetPage = pages[pages.length - 1];
                            console.log('检测到新页面，切换到投稿页面');
                            await targetPage.waitForTimeout(3000);
                        }

                        foundSubmitButton = true;

                        // 输出当前页面的标题和URL用于调试
                        const pageTitle = await targetPage.title();
                        const pageUrl = targetPage.url();
                        console.log(`投稿页面标题: ${pageTitle}`);
                        console.log(`投稿页面URL: ${pageUrl}`);

                        // 在投稿页面提取信息
                        const submissionPageInfo = await this.extractSubmissionPageInfo(targetPage);
                        Object.assign(submissionInfo, submissionPageInfo);
                        console.log('投稿页面信息提取结果:', submissionPageInfo);
                        break;
                    }
                } catch (e) {
                    console.log(`投稿按钮点击失败: ${selector} - ${e.message}`);
                    continue;
                }
            }

            if (!foundSubmitButton) {
                console.log('未找到投稿按钮');

                // 尝试从当前页面获取可能的投稿信息
                const pageText = await this.page.textContent('body');
                console.log('尝试从当前页面获取投稿信息...');

                // 使用正则表达式尝试提取信息
                const wjciMatch = pageText.match(/WJCI分区[\s：:]*([Q\d]+)/i);
                if (wjciMatch && wjciMatch[1]) {
                    submissionInfo.wjciPartition = wjciMatch[1].trim();
                    console.log(`当前页面提取WJCI分区: ${submissionInfo.wjciPartition}`);
                }
            }

        } catch (error) {
            console.warn('提取投稿信息时出错:', error);
        }

        return submissionInfo;
    }

    /**
     * 从投稿页面提取信息
     */
    async extractSubmissionPageInfo(page) {
        const info = {};

        try {
            console.log('开始从投稿页面提取信息...');

            // 等待页面内容加载
            await page.waitForTimeout(5000); // 增加等待时间

            // 调试: 获取页面所有可能的统计项目结构
            console.log('调试: 探测页面结构...');

            // 方法1: 尝试原始选择器
            const statItems = await page.$$('.info-stat .stat-item');
            console.log(`方法1 - 找到 ${statItems.length} 个 .info-stat .stat-item 统计项目`);

            // 方法2: 尝试更宽泛的选择器
            const allStatItems = await page.$$('.stat-item');
            console.log(`方法2 - 找到 ${allStatItems.length} 个 .stat-item 统计项目`);

            // 方法3: 尝试查找含有h3和p标签的元素
            const h3Elements = await page.$$('h3');
            console.log(`方法3 - 找到 ${h3Elements.length} 个h3元素`);

            // 输出前几个h3元素的文本内容用于调试
            for (let i = 0; i < Math.min(h3Elements.length, 10); i++) {
                try {
                    const h3Text = await h3Elements[i].textContent();
                    console.log(`h3[${i}]: ${h3Text}`);
                } catch (e) {
                    console.log(`h3[${i}]: 无法获取文本`);
                }
            }

            // 使用最宽泛的选拥器进行提取
            const itemsToProcess = statItems.length > 0 ? statItems : allStatItems;

            for (const item of itemsToProcess) {
                try {
                    const titleElement = await item.$('h3');
                    const valueElement = await item.$('p');

                    if (titleElement && valueElement) {
                        const title = await titleElement.textContent();
                        let value = await valueElement.textContent();

                        // 如果没有文本，尝试获取title属性（处理ellipsis1类的情况）
                        if (!value || value.trim() === '') {
                            value = await valueElement.getAttribute('title') || '';
                        }

                        if (title && (value || value === '/')) { // 允许'/'值
                            const cleanTitle = title.trim();
                            const cleanValue = value.trim();

                            console.log(`找到统计项: ${cleanTitle} = ${cleanValue}`);

                            // 根据标题匹配对应字段
                            if (cleanTitle.includes('WJCI分区')) {
                                info.wjciPartition = cleanValue;
                                console.log(`提取WJCI分区: ${cleanValue}`);
                            } else if (cleanTitle.includes('出版周期')) {
                                info.submissionPublishCycle = cleanValue;
                                console.log(`提取投稿出版周期: ${cleanValue}`);
                            } else if (cleanTitle.includes('是否收费')) {
                                info.submissionFeeInfo = cleanValue || '/';
                                console.log(`提取投稿是否收费: ${info.submissionFeeInfo}`);
                            } else if (cleanTitle.includes('复合影响因子')) {
                                // 可以作为备用信息
                                console.log(`备用-复合影响因子: ${cleanValue}`);
                            } else if (cleanTitle.includes('综合影响因子')) {
                                // 可以作为备用信息
                                console.log(`备用-综合影响因子: ${cleanValue}`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('处理统计项时出错:', e.message);
                    continue;
                }
            }

            // 如果上面没有找到，尝试使用正则表达式从页面文本中提取
            if (!info.wjciPartition || !info.submissionPublishCycle || !info.submissionFeeInfo) {
                console.log('使用正则表达式作为备用提取方法...');
                const pageText = await page.textContent('body');

                // 调试: 输出页面文本的前1000个字符用于调试
                console.log('页面文本预览:', pageText.substring(0, 1000));

                if (!info.wjciPartition) {
                    const wjciPatterns = [
                        /WJCI分区[\s：:]*([Q\d]+)/i,
                        /WJCI[\s]*分区[\s：:]*([Q\d]+)/i,
                        /分区[\s：:]*([Q\d]+)/i
                    ];
                    for (const pattern of wjciPatterns) {
                        const wjciMatch = pageText.match(pattern);
                        if (wjciMatch && wjciMatch[1]) {
                            info.wjciPartition = wjciMatch[1].trim();
                            console.log(`正则提取WJCI分区: ${info.wjciPartition}`);
                            break;
                        }
                    }
                }

                if (!info.submissionPublishCycle) {
                    const cyclePatterns = [
                        /出版周期[\s：:]*([^\n\r]{1,20})/i,
                        /出版周期[\s：:]*(双月)/i,
                        /出版周期[\s：:]*(月刊)/i,
                        /出版周期[\s：:]*(半月刊)/i,
                        /出版周期[\s：:]*(季刊)/i,
                        /(双月)/i,
                        /(月刊)/i,
                        /(半月刊)/i,
                        /(季刊)/i
                    ];
                    for (const pattern of cyclePatterns) {
                        const cycleMatch = pageText.match(pattern);
                        if (cycleMatch && cycleMatch[1]) {
                            info.submissionPublishCycle = cycleMatch[1].trim();
                            console.log(`正则提取出版周期: ${info.submissionPublishCycle}`);
                            break;
                        }
                    }
                }

                if (!info.submissionFeeInfo) {
                    const feePatterns = [
                        /是否收费[\s：:]*([^\/\n\r]{1,20})/i,
                        /是否收费[\s：:]*\//i,
                        /收费[\s：:]*([^\/\n\r]{1,20})/i,
                        /收费[\s：:]*\//i
                    ];
                    for (const pattern of feePatterns) {
                        const feeMatch = pageText.match(pattern);
                        if (feeMatch) {
                            if (feeMatch[1]) {
                                info.submissionFeeInfo = feeMatch[1].trim();
                                console.log(`正则提取是否收费: ${info.submissionFeeInfo}`);
                            } else {
                                info.submissionFeeInfo = '/';
                                console.log(`正则提取是否收费: /`);
                            }
                            break;
                        }
                    }
                }
            }

            // 新增: 点击投稿按钮获取编辑部信息
            console.log('尝试点击投稿按钮获取编辑部信息...');

            try {
                // 查找投稿按钮
                const submitButtonSelectors = [
                    'button.ant-btn-primary:has-text("投稿")',
                    'button.toolkit-green.ant-btn.ant-btn-primary',
                    'button.ant-btn-primary',
                    'button:has-text("投稿")',
                    '.ant-btn-primary'
                ];

                let foundButton = false;
                for (const selector of submitButtonSelectors) {
                    try {
                        const button = await page.$(selector);
                        if (button && await button.isVisible()) {
                            console.log(`找到投稿按钮: ${selector}`);

                            // 点击投稿按钮
                            await button.click();
                            console.log('投稿按钮点击成功');

                            // 等待页面加载（可能是弹窗或新页面）
                            await page.waitForTimeout(3000);

                            foundButton = true;
                            break;
                        }
                    } catch (e) {
                        console.log(`投稿按钮点击失败: ${selector} - ${e.message}`);
                        continue;
                    }
                }

                if (foundButton) {
                    // 提取编辑部信息
                    await this.extractEditorialInfo(page, info);
                } else {
                    console.log('未找到投稿按钮');
                }

            } catch (error) {
                console.warn('点击投稿按钮失败:', error.message);
            }

            console.log('投稿页面信息提取完成:', info);

        } catch (error) {
            console.warn('从投稿页面提取信息失败:', error);
        }

        return info;
    }

    /**
     * 提取投稿信息
     */
    async extractSubmissionInfo() {
        const info = {};

        try {
            console.log('开始提取投稿相关信息...');

            // 首先在当前页面查找投稿信息
            await this.extractSubmissionFromCurrentPage(info);
            console.log('当前页面提取结果:', info);

            // 尝试点击投稿按钮获取更多信息
            const submitButtons = [
                'a:has-text("投稿")',
                'a:has-text("征稿")',
                'button:has-text("投稿")',
                '.submit-btn',
                '.contribution-btn',
                'a[href*="contribute"]',
                'a[href*="submit"]'
            ];

            let foundSubmitButton = false;
            for (const selector of submitButtons) {
                try {
                    const button = await this.page.$(selector);
                    if (button && await button.isVisible()) {
                        console.log(`找到投稿按钮: ${selector}`);

                        // 点击投稿按钮
                        await button.click();
                        console.log('投稿按钮点击成功');

                        // 等待页面加载和可能的跳转
                        await this.page.waitForTimeout(5000);

                        // 检查是否有新窗口或新标签页
                        const pages = this.context.pages();
                        let targetPage = this.page;

                        if (pages.length > 1) {
                            // 如果有新页面，使用最新的页面
                            targetPage = pages[pages.length - 1];
                            console.log('检测到新页面，切换到新页面');
                            await targetPage.waitForTimeout(3000);
                        }

                        foundSubmitButton = true;

                        // 输出当前页面的标题和URL用于调试
                        const pageTitle = await targetPage.title();
                        const pageUrl = targetPage.url();
                        console.log(`当前页面标题: ${pageTitle}`);
                        console.log(`当前页面URL: ${pageUrl}`);

                        // 在投稿页面提取信息
                        const submissionPageInfo = await this.extractSubmissionPageInfo(targetPage);
                        // 合并投稿页面提取的信息
                        Object.assign(info, submissionPageInfo);
                        console.log('投稿页面提取结果:', submissionPageInfo);
                        break;
                    }
                } catch (e) {
                    console.log(`投稿按钮点击失败: ${selector} - ${e.message}`);
                    continue;
                }
            }

            if (!foundSubmitButton) {
                console.log('未找到投稿按钮，仅使用当前页面信息');
            }

        } catch (error) {
            console.warn('提取投稿信息时出错:', error);
        }

        return info;
    }

    /**
     * 提取编辑部信息
     */
    async extractEditorialInfo(page, info) {
        try {
            console.log('开始提取编辑部信息...');

            // 等待页面加载
            await page.waitForTimeout(3000);

            // 查找编辑部信息表格
            const tables = await page.$$('.ant-descriptions-view table');
            console.log(`找到 ${tables.length} 个编辑部信息表格`);

            if (tables.length === 0) {
                console.log('未找到编辑部信息表格，尝试其他选择器...');

                // 备用选择器
                const backupTables = await page.$$('table');
                console.log(`备用: 找到 ${backupTables.length} 个表格`);

                if (backupTables.length > 0) {
                    tables.push(...backupTables);
                }
            }

            for (const table of tables) {
                try {
                    // 获取表格中的所有行
                    const rows = await table.$$('tr.ant-descriptions-row');
                    console.log(`表格中找到 ${rows.length} 行`);

                    if (rows.length === 0) {
                        // 如果没找到ant-descriptions-row，尝试普通TR
                        const allRows = await table.$$('tr');
                        console.log(`备用: 表格中找到 ${allRows.length} 行`);
                        rows.push(...allRows);
                    }

                    for (const row of rows) {
                        try {
                            // 获取标签和内容
                            const labelElement = await row.$('th.ant-descriptions-item-label, th');
                            const contentElement = await row.$('td.ant-descriptions-item-content, td');

                            if (labelElement && contentElement) {
                                const label = await labelElement.textContent();
                                const content = await contentElement.textContent();

                                if (label && content) {
                                    const cleanLabel = label.trim().replace(/[：:]/g, '');
                                    const cleanContent = content.trim();

                                    console.log(`找到编辑部信息: ${cleanLabel} = ${cleanContent}`);

                                    // 根据标签匹配对应字段
                                    if (cleanLabel.includes('主编') && !cleanLabel.includes('副')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.chiefEditor = cleanContent;
                                            console.log(`提取主编: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('副主编')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.deputyEditor = cleanContent;
                                            console.log(`提取副主编: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('官网网址')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.officialWebsite = cleanContent;
                                            console.log(`提取官网网址: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('投稿网址')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.submissionWebsite = cleanContent;
                                            console.log(`提取投稿网址: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('投稿邮箱')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.submissionEmail = cleanContent;
                                            console.log(`提取投稿邮箱: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('咨询邮箱')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.consultationEmail = cleanContent;
                                            console.log(`提取咨询邮箱: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('编辑部地址')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.editorialAddress = cleanContent;
                                            console.log(`提取编辑部地址: ${cleanContent}`);
                                        }
                                    } else if (cleanLabel.includes('联系电话')) {
                                        if (cleanContent !== '暂无' && cleanContent.length > 0) {
                                            info.contactPhone = cleanContent;
                                            console.log(`提取联系电话: ${cleanContent}`);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('处理表格行时出错:', e.message);
                            continue;
                        }
                    }
                } catch (e) {
                    console.warn('处理表格时出错:', e.message);
                    continue;
                }
            }

            console.log('编辑部信息提取完成:', {
                chiefEditor: info.chiefEditor,
                deputyEditor: info.deputyEditor,
                officialWebsite: info.officialWebsite,
                submissionWebsite: info.submissionWebsite,
                submissionEmail: info.submissionEmail,
                consultationEmail: info.consultationEmail,
                editorialAddress: info.editorialAddress,
                contactPhone: info.contactPhone
            });

        } catch (error) {
            console.warn('提取编辑部信息失败:', error);
        }
    }

    /**
     * 清理提取的值
     */
    cleanExtractedValue(value, fieldType) {
        if (!value) return '';

        // 基本清理
        let cleaned = value.trim()
            .replace(/^[\s\uff1a:]*/, '') // 移除开头的空格和冒号
            .replace(/[\s\uff1a:]*$/, '') // 移除结尾的空格和冒号
            .replace(/\s+/g, ' '); // 合并多个空格

        // 根据字段类型进行特定清理
        switch (fieldType) {
            case 'chiefEditor':
            case 'deputyEditor':
                // 从主编/副主编名字中提取清洁的名字
                cleaned = cleaned
                    .replace(/副主编.*$/, '') // 移除"副主编"及其以后的内容
                    .replace(/网址.*$/, '')     // 移除"网址"及其以后的内容
                    .replace(/邮箱.*$/, '')     // 移除"邮箱"及其以后的内容
                    .replace(/电话.*$/, '')     // 移除"电话"及其以后的内容
                    .replace(/暂无.*$/, '')     // 移除"暂无"及其以后的内容
                    .replace(/官网.*$/, '')     // 移除"官网"及其以后的内容
                    .trim();
                break;

            case 'feeInfo':
                // 清理收费信息
                if (cleaned.includes('期刊介绍') || cleaned.includes('投稿须知') || cleaned.length > 30) {
                    return ''; // 如果包含不相关内容，返回空
                }
                break;

            case 'phone':
                // 清理电话号码，保留数字、连字符、括号和空格
                cleaned = cleaned.replace(/[^\d\-\s\(\)]/g, '').trim();
                break;

            case 'reviewCycle':
            case 'publishDelay':
                // 清理周期信息，保留数字和单位
                const timeMatch = cleaned.match(/([0-9\u4e00-\u4e5d十百千万]+[天月周日年])/)
                if (timeMatch) {
                    cleaned = timeMatch[1];
                }
                break;

            case 'acceptanceRate':
                // 清理录取率，保留百分数
                const rateMatch = cleaned.match(/([0-9.]+%)/)
                if (rateMatch) {
                    cleaned = rateMatch[1];
                }
                break;
        }

        return cleaned;
    }

    /**
     * 从当前页面提取投稿信息（增强版）
     */
    async extractSubmissionFromCurrentPage(info) {
        try {
            // 获取页面所有文本内容
            const pageText = await this.page.textContent('body');

            // 定义需要提取的字段和对应的正则表达式
            const patterns = {
                reviewCycle: [
                    /审稿周期[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /平均审稿周期[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /审稿时间[\s\uff1a:]*([^\n\r。，,]{1,20})/g
                ],
                publishDelay: [
                    /出版时滞[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /平均出版时滞[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /发表周期[\s\uff1a:]*([^\n\r。，,]{1,20})/g
                ],
                acceptanceRate: [
                    /录取率[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /平均录取率[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /录用率[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /接收率[\s\uff1a:]*([^\n\r。，,]{1,20})/g
                ],
                feeInfo: [
                    /版面费[\s\uff1a:]*([^\n\r。，,]{1,30})/g,
                    /是否收费[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /收费标准[\s\uff1a:]*([^\n\r。，,]{1,30})/g,
                    /费用[\s\uff1a:]*([^\n\r。，,]{1,30})/g
                ],
                chiefEditor: [
                    /主编[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /主编[\s\uff1a:]*([一-龥\w\s]{1,20})/g
                ],
                deputyEditor: [
                    /副主编[\s\uff1a:]*([^\n\r。，,]{1,20})/g,
                    /副编[\s\uff1a:]*([^\n\r。，,]{1,20})/g
                ],
                phone: [
                    /电话[\s\uff1a:]*(\d[\d\-\s\(\)]{6,20})/g,
                    /联系电话[\s\uff1a:]*(\d[\d\-\s\(\)]{6,20})/g,
                    /电话号码[\s\uff1a:]*(\d[\d\-\s\(\)]{6,20})/g
                ]
            };

            // 使用正则表达式提取信息
            for (const [key, regexList] of Object.entries(patterns)) {
                if (info[key]) continue; // 如果已经有值，跳过

                for (const regex of regexList) {
                    let matches = pageText.matchAll(regex);
                    for (const match of matches) {
                        if (match && match[1]) {
                            let value = match[1].trim();

                            // 清理值，移除多余的符号和内容
                            value = this.cleanExtractedValue ? this.cleanExtractedValue(value, key) : value.trim();

                            if (value && value.length > 0 && value.length < 50) {
                                // 进一步过滤无效值
                                if (!value.includes('未知') &&
                                    !value.includes('暂无') &&
                                    !value.includes('详情请咨询') &&
                                    !value.includes('网址') &&
                                    !value.includes('邮箱') &&
                                    !value.includes('电话') &&
                                    value !== '-' && value !== '—' && value !== '无') {
                                    info[key] = value;
                                    console.log(`正则匹配找到 ${key}: ${value}`);
                                    break;
                                }
                            }
                        }
                    }
                    if (info[key]) break; // 如果已经找到值，停止查找
                }
            }

            // 特殊处理邮箱
            if (!info.email) {
                // 方法1: 查找 mailto 链接
                try {
                    const emailLinks = await this.page.$$('a[href^="mailto:"]');
                    if (emailLinks.length > 0) {
                        const href = await emailLinks[0].getAttribute('href');
                        if (href) {
                            info.email = href.replace('mailto:', '').trim();
                            console.log(`找到邮箱链接: ${info.email}`);
                        }
                    }
                } catch (e) { }

                // 方法2: 使用正则表达式查找邮箱
                if (!info.email) {
                    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                    const emailMatches = pageText.match(emailRegex);
                    if (emailMatches && emailMatches.length > 0) {
                        // 过滤掉知网的邮箱，优先选择非知网邮箱
                        const filteredEmails = emailMatches.filter(email =>
                            !email.includes('cnki.net') &&
                            !email.includes('cnki.com')
                        );

                        if (filteredEmails.length > 0) {
                            info.email = filteredEmails[0];
                            console.log(`正则匹配找到邮箱: ${info.email}`);
                        } else if (emailMatches.length > 0) {
                            info.email = emailMatches[0];
                            console.log(`正则匹配找到邮箱(知网): ${info.email}`);
                        }
                    }
                }
            }

            // 特殊处理网址
            if (!info.website) {
                try {
                    // 查找非知网的网址链接
                    const websiteLinks = await this.page.$$('a[href^="http"]');
                    for (const link of websiteLinks) {
                        const href = await link.getAttribute('href');
                        if (href &&
                            !href.includes('cnki.net') &&
                            !href.includes('cnki.com') &&
                            !href.includes('weibo.com') &&
                            !href.includes('wechat') &&
                            href.length < 100) {
                            info.website = href;
                            console.log(`找到网址: ${info.website}`);
                            break;
                        }
                    }
                } catch (e) { }

                // 如果没有找到，使用正则表达式
                if (!info.website) {
                    const urlRegex = /https?:\/\/[^\s\u4e00-\u9fa5<>"']{10,80}/g;
                    const urlMatches = pageText.match(urlRegex);
                    if (urlMatches && urlMatches.length > 0) {
                        const filteredUrls = urlMatches.filter(url =>
                            !url.includes('cnki.net') &&
                            !url.includes('cnki.com') &&
                            !url.includes('weibo.com')
                        );

                        if (filteredUrls.length > 0) {
                            info.website = filteredUrls[0];
                            console.log(`正则匹配找到网址: ${info.website}`);
                        }
                    }
                }
            }

            // 通过表格结构提取信息
            await this.extractFromTables(info);

        } catch (error) {
            console.warn('从当前页面提取投稿信息失败:', error);
        }
    }

    /**
     * 从表格中提取信息
     */
    async extractFromTables(info) {
        try {
            const tables = await this.page.$$('table');

            for (const table of tables) {
                const rows = await table.$$('tr');

                for (const row of rows) {
                    const cells = await row.$$('td');
                    if (cells.length >= 2) {
                        const keyCell = await cells[0].textContent();
                        const valueCell = await cells[1].textContent();

                        if (keyCell && valueCell) {
                            const key = keyCell.trim();
                            const value = valueCell.trim();

                            // 根据关键词匹配对应字段
                            if (key.includes('审稿周期') && !info.reviewCycle && value.length < 30) {
                                info.reviewCycle = value;
                                console.log(`表格提取审稿周期: ${value}`);
                            } else if (key.includes('出版时滞') && !info.publishDelay && value.length < 30) {
                                info.publishDelay = value;
                                console.log(`表格提取出版时滞: ${value}`);
                            } else if (key.includes('录取率') && !info.acceptanceRate && value.length < 30) {
                                info.acceptanceRate = value;
                                console.log(`表格提取录取率: ${value}`);
                            } else if ((key.includes('费用') || key.includes('版面费')) && !info.feeInfo && value.length < 50) {
                                info.feeInfo = value;
                                console.log(`表格提取费用信息: ${value}`);
                            } else if (key.includes('主编') && !key.includes('副') && !info.chiefEditor && value.length < 30) {
                                info.chiefEditor = value;
                                console.log(`表格提取主编: ${value}`);
                            } else if (key.includes('副主编') && !info.deputyEditor && value.length < 30) {
                                info.deputyEditor = value;
                                console.log(`表格提取副主编: ${value}`);
                            } else if (key.includes('电话') && !info.phone && value.length < 30) {
                                info.phone = value;
                                console.log(`表格提取电话: ${value}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('从表格提取信息失败:', error);
        }
    }

    /**
     * 提取邮箱信息
     */
    async extractEmail(info) {
        try {
            if (!info.email) {
                // 方法1: 查找 mailto 链接
                const emailLinks = await this.page.$$('a[href^="mailto:"]');
                if (emailLinks.length > 0) {
                    const href = await emailLinks[0].getAttribute('href');
                    if (href) {
                        info.email = href.replace('mailto:', '').trim();
                        console.log(`找到邮箱链接: ${info.email}`);
                        return;
                    }
                }

                // 方法2: 使用正则表达式查找邮箱
                const pageText = await this.page.textContent('body');
                const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                const emailMatches = pageText.match(emailRegex);
                if (emailMatches && emailMatches.length > 0) {
                    // 过滤掉知网的邮箱，优先选择非知网邮箱
                    const filteredEmails = emailMatches.filter(email =>
                        !email.includes('cnki.net') &&
                        !email.includes('cnki.com')
                    );

                    if (filteredEmails.length > 0) {
                        info.email = filteredEmails[0];
                        console.log(`正则匹配找到邮箱: ${info.email}`);
                    } else if (emailMatches.length > 0) {
                        info.email = emailMatches[0];
                        console.log(`正则匹配找到邮箱(知网): ${info.email}`);
                    }
                }
            }
        } catch (error) {
            console.warn('提取邮箱信息失败:', error.message);
        }
    }

    /**
     * 提取网址信息
     */
    async extractWebsite(info) {
        try {
            if (!info.website) {
                // 查找非知网的网址链接
                const websiteLinks = await this.page.$$('a[href^="http"]');
                for (const link of websiteLinks) {
                    const href = await link.getAttribute('href');
                    if (href &&
                        !href.includes('cnki.net') &&
                        !href.includes('cnki.com') &&
                        !href.includes('weibo.com') &&
                        !href.includes('wechat') &&
                        href.length < 100) {
                        info.website = href;
                        console.log(`找到网址: ${info.website}`);
                        return;
                    }
                }

                // 如果没有找到，使用正则表达式
                const pageText = await this.page.textContent('body');
                const urlRegex = /https?:\/\/[^\s\u4e00-\u9fa5<>"']{10,80}/g;
                const urlMatches = pageText.match(urlRegex);
                if (urlMatches && urlMatches.length > 0) {
                    const filteredUrls = urlMatches.filter(url =>
                        !url.includes('cnki.net') &&
                        !url.includes('cnki.com') &&
                        !url.includes('weibo.com')
                    );

                    if (filteredUrls.length > 0) {
                        info.website = filteredUrls[0];
                        console.log(`正则匹配找到网址: ${info.website}`);
                    }
                }
            }
        } catch (error) {
            console.warn('提取网址信息失败:', error.message);
        }
    }



    /**
     * 从元素中提取值
     */
    async extractValueFromElement(element, keyword) {
        try {
            const text = await element.textContent();
            if (!text) return null;

            // 清理文本
            const cleanText = text.trim().replace(/\s+/g, ' ');

            // 如果文本中包含冒号，尝试提取冒号后的内容
            if (cleanText.includes(':')) {
                const parts = cleanText.split(':');
                for (let i = 0; i < parts.length - 1; i++) {
                    if (parts[i].includes(keyword)) {
                        const value = parts[i + 1].trim();
                        if (value && value.length > 0 && value !== keyword) {
                            return value;
                        }
                    }
                }
            }

            // 如果文本中包含关键词，尝试提取相关信息
            const keywordIndex = cleanText.indexOf(keyword);
            if (keywordIndex >= 0) {
                // 提取关键词后的内容
                const afterKeyword = cleanText.substring(keywordIndex + keyword.length).trim();
                if (afterKeyword && afterKeyword.length > 0) {
                    // 提取第一个有意义的部分
                    const match = afterKeyword.match(/^[：:\s]*([^，,。；;！!？?\s]+)/);
                    if (match && match[1] && match[1] !== keyword) {
                        return match[1];
                    }
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 保存到Excel
     */
    async saveToExcel(journalData) {
        try {
            console.log('正在保存到Excel...');

            // 初始化Excel处理器
            this.excelHandler.initExcel();

            // 添加数据
            this.excelHandler.addJournalData(journalData);

            // 保存文件
            const success = this.excelHandler.saveToExcel();

            if (success) {
                console.log('Excel文件保存成功!');
                const stats = this.excelHandler.getStats();
                console.log(`文件位置: ${stats.filepath}`);
                console.log(`总记录数: ${stats.totalRecords}`);
            } else {
                throw new Error('Excel文件保存失败');
            }

        } catch (error) {
            console.error('保存Excel文件失败:', error);
            throw error;
        }
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
     * 运行完整测试
     */
    async run() {
        try {
            console.log('='.repeat(60));
            console.log('     单个期刊详情获取测试');
            console.log('='.repeat(60));

            // 初始化
            await this.initBrowser();

            // 搜索并获取第一个期刊
            const journal = await this.findFirstJournal();

            if (!journal) {
                throw new Error('未找到期刊');
            }

            // 获取详细信息
            const journalDetails = await this.getJournalDetails(journal);

            // 显示获取到的信息
            console.log('\n' + '='.repeat(60));
            console.log('          获取到的期刊信息');
            console.log('='.repeat(60));
            Object.entries(journalDetails).forEach(([key, value]) => {
                console.log(`${key}: ${value}`);
            });

            // 保存到Excel
            await this.saveToExcel(journalDetails);

            console.log('\n' + '='.repeat(60));
            console.log('          测试完成');
            console.log('='.repeat(60));

        } catch (error) {
            console.error('\n测试失败:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// 运行测试
async function main() {
    const tester = new SingleJournalTester();
    try {
        await tester.run();
    } catch (error) {
        console.error('测试运行失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = SingleJournalTester;