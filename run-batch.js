#!/usr/bin/env node

/**
 * 批量爬取启动脚本
 * 支持自定义配置搜索编码和爬取参数
 */

const BatchCrawler = require('./batch-crawler');
const config = require('./src/config');

// =============== 用户配置区域 ===============
const USER_CONFIG = {
    // 搜索编码配置（可选择以下其中一种方式）

    // 方式1：使用预设编码组合
    // searchCodes: config.SEARCH_CODES.DEFAULT,        // 只搜索北京和上海 ['11-', '31-']
    // searchCodes: config.SEARCH_CODES.MAJOR_CITIES,   // 搜索主要城市 ['11-', '31-', '21-', '44-', '37-', '51-']
    // searchCodes: config.SEARCH_CODES.ALL_REGIONS,    // 搜索更多地区

    // 方式2：完全自定义搜索编码
    searchCodes: [
        // '11-',    // 北京
        '31-',    // 上海
        // '21-',    // 辽宁
        // '44-',    // 广东
        // '37-',    // 山东
        // '51-',    // 四川
        // '32-',    // 江苏
        // '33-',    // 浙江
        // '34-',    // 安徽（可根据需要添加更多）
        // '35-',    // 福建
        // '36-',    // 江西
        // '41-',    // 河南
        // '42-',    // 湖北
        // '43-',    // 湖南
        // '45-',    // 广西
        // '50-',    // 重庆
        // '52-',    // 贵州
        // '53-',    // 云南
        // '54-',    // 西藏
        // '61-',    // 陕西
        // '62-',    // 甘肃
        // '63-',    // 青海
        // '64-',    // 宁夏
        // '65-',    // 新疆
    ],

    // 爬取页面数配置
    maxPages: 0,              // 全局最大页面数，0 = 无限制，爬到底；设置数字如100表示最多爬100页
    maxPagesPerCode: 10,      // 每个搜索编码最大页面数（测试用，降低为10页）

    // 延时配置（毫秒）
    delayBetweenPages: [3000, 6000],   // 页面间随机延时范围
    delayBetweenCodes: [15000, 30000], // 搜索编码间随机延时范围（建议较长以避免被限制）

    // 其他配置
    saveFrequency: 3,         // 每处理多少页保存一次进度（建议3-5页）

    // 是否显示详细日志
    verbose: true,
};

// =============== 地区编码说明 ===============
const REGION_CODES = {
    '11-': '北京',
    '12-': '天津',
    '13-': '河北',
    '14-': '山西',
    '15-': '内蒙古',
    '21-': '辽宁',
    '22-': '吉林',
    '23-': '黑龙江',
    '31-': '上海',
    '32-': '江苏',
    '33-': '浙江',
    '34-': '安徽',
    '35-': '福建',
    '36-': '江西',
    '37-': '山东',
    '41-': '河南',
    '42-': '湖北',
    '43-': '湖南',
    '44-': '广东',
    '45-': '广西',
    '46-': '海南',
    '50-': '重庆',
    '51-': '四川',
    '52-': '贵州',
    '53-': '云南',
    '54-': '西藏',
    '61-': '陕西',
    '62-': '甘肃',
    '63-': '青海',
    '64-': '宁夏',
    '65-': '新疆',
};

// =============== 脚本执行部分 ===============

function printWelcomeMessage() {
    console.log('='.repeat(80));
    console.log('                    知网期刊批量爬取工具');
    console.log('='.repeat(80));
    console.log();

    console.log('当前配置:');
    console.log(`- 搜索编码: ${USER_CONFIG.searchCodes.join(', ')}`);

    // 显示对应的地区名称
    const regions = USER_CONFIG.searchCodes.map(code =>
        REGION_CODES[code] ? `${code}(${REGION_CODES[code]})` : code
    ).join(', ');
    console.log(`- 对应地区: ${regions}`);

    console.log(`- 全局最大页面数: ${USER_CONFIG.maxPages === 0 ? '无限制（爬到底）' : USER_CONFIG.maxPages}`);
    console.log(`- 每编码最大页面数: ${USER_CONFIG.maxPagesPerCode}`);
    console.log(`- 页面间延时: ${USER_CONFIG.delayBetweenPages[0]}-${USER_CONFIG.delayBetweenPages[1]}ms`);
    console.log(`- 编码间延时: ${USER_CONFIG.delayBetweenCodes[0]}-${USER_CONFIG.delayBetweenCodes[1]}ms`);
    console.log(`- 保存频率: 每${USER_CONFIG.saveFrequency}页`);
    console.log();

    // 估算时间
    const estimatedPages = USER_CONFIG.maxPages === 0 ?
        USER_CONFIG.searchCodes.length * USER_CONFIG.maxPagesPerCode :
        Math.min(USER_CONFIG.maxPages, USER_CONFIG.searchCodes.length * USER_CONFIG.maxPagesPerCode);

    const avgDelay = (USER_CONFIG.delayBetweenPages[0] + USER_CONFIG.delayBetweenPages[1]) / 2;
    const estimatedTimeMinutes = Math.ceil((estimatedPages * avgDelay) / (1000 * 60));

    console.log(`预估处理页面数: ${estimatedPages} 页`);
    console.log(`预估运行时间: ${Math.floor(estimatedTimeMinutes / 60)}小时${estimatedTimeMinutes % 60}分钟`);
    console.log();
    console.log('='.repeat(80));
}

function validateConfig() {
    const errors = [];

    if (!USER_CONFIG.searchCodes || USER_CONFIG.searchCodes.length === 0) {
        errors.push('搜索编码不能为空');
    }

    if (USER_CONFIG.maxPages < 0) {
        errors.push('全局最大页面数不能小于0');
    }

    if (USER_CONFIG.maxPagesPerCode <= 0) {
        errors.push('每编码最大页面数必须大于0');
    }

    if (USER_CONFIG.delayBetweenPages[0] < 1000 || USER_CONFIG.delayBetweenPages[1] < 1000) {
        errors.push('页面间延时不能少于1000ms，以避免被限制访问');
    }

    if (USER_CONFIG.delayBetweenCodes[0] < 5000 || USER_CONFIG.delayBetweenCodes[1] < 5000) {
        errors.push('编码间延时不能少于5000ms，建议设置更长时间');
    }

    if (errors.length > 0) {
        console.error('配置错误:');
        errors.forEach(error => console.error(`- ${error}`));
        console.error('\n请修改配置后重新运行');
        process.exit(1);
    }
}

async function waitForUserConfirmation() {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('是否确认开始爬取？(输入 y 或 yes 确认，其他键退出): ', (answer) => {
            rl.close();
            const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
            resolve(confirmed);
        });
    });
}

async function main() {
    try {
        // 显示欢迎信息和当前配置
        printWelcomeMessage();

        // 验证配置
        validateConfig();

        // 等待用户确认
        console.log('⚠️  注意事项:');
        console.log('1. 请确保网络连接稳定');
        console.log('2. 爬取过程中请勿关闭浏览器窗口');
        console.log('3. 建议在网络空闲时间进行大量爬取');
        console.log('4. 数据将保存到 zhiwang_journals_complete.xlsx 文件');
        console.log('5. 可随时按 Ctrl+C 停止程序');
        console.log();

        const confirmed = await waitForUserConfirmation();

        if (!confirmed) {
            console.log('已取消爬取');
            process.exit(0);
        }

        console.log('\n开始初始化批量爬虫...\n');

        // 创建爬虫实例
        const crawler = new BatchCrawler({
            searchCodes: USER_CONFIG.searchCodes,
            maxPages: USER_CONFIG.maxPages,
            maxPagesPerCode: USER_CONFIG.maxPagesPerCode,
            delayBetweenPages: USER_CONFIG.delayBetweenPages,
            delayBetweenCodes: USER_CONFIG.delayBetweenCodes,
            saveFrequency: USER_CONFIG.saveFrequency,
            verbose: USER_CONFIG.verbose
        });

        // 设置优雅退出处理
        process.on('SIGINT', async () => {
            console.log('\n\n收到停止信号，正在保存进度并清理资源...');
            try {
                await crawler.saveProgress();
                await crawler.cleanup();
                console.log('清理完成，程序已退出');
                process.exit(0);
            } catch (error) {
                console.error('清理失败:', error);
                process.exit(1);
            }
        });

        // 开始爬取
        await crawler.run();

    } catch (error) {
        console.error('\n程序运行失败:', error);
        console.error('\n如果遇到问题，请检查:');
        console.error('1. 网络连接是否正常');
        console.error('2. 配置参数是否正确');
        console.error('3. 是否安装了所有依赖包 (npm install)');
        process.exit(1);
    }
}

// 检查是否为直接运行
if (require.main === module) {
    main();
}

module.exports = { USER_CONFIG, REGION_CODES };