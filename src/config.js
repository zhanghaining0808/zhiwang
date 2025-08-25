// 知网期刊爬虫配置文件
const config = {
    // 基础URL配置
    BASE_URL: 'https://navi.cnki.net/knavi/#',

    // 搜索配置
    SEARCH_CODES: {
        // 预设编码组合
        DEFAULT: ['11-', '31-'], // 北京和上海
        MAJOR_CITIES: ['11-', '31-', '21-', '44-', '37-', '51-'], // 主要城市
        ALL_REGIONS: ['11-', '31-', '21-', '44-', '37-', '51-', '32-', '33-', '34-', '35-'], // 更多地区
        CUSTOM: [], // 用户自定义，可在运行时覆盖
    },
    SEARCH_TYPE: 'CN', // 搜索类型

    // 批量爬取配置
    BATCH_CONFIG: {
        MAX_TOTAL_PAGES: 0, // 全局最大页面数，0表示无限制
        MAX_PAGES_PER_CODE: 50, // 每个搜索编码最大页面数
        DELAY_BETWEEN_PAGES: [3000, 6000], // 页面间延时范围（毫秒）
        DELAY_BETWEEN_CODES: [10000, 20000], // 编码间延时范围（毫秒）
        SAVE_FREQUENCY: 5, // 每处理多少页保存一次进度
        RETRY_ATTEMPTS: 3, // 失败重试次数
    },

    // 翻页配置
    PAGINATION: {
        MAX_PAGES: 50,  // 每个搜索编码最多翻页数（已弃用，使用BATCH_CONFIG.MAX_PAGES_PER_CODE）
        PAGE_SIZE: 20, // 每页结果数（知网默认）
        NEXT_PAGE_SELECTORS: [
            '.pagenav .next',  // 知网实际的下一页按钮
            'a.next',
            '.next',
            '.page-next',
            'a:has-text("下一页")',
            'a:has-text("下页")',
            'a[title="下一页"]'
        ],
        // 特定页码跳转选择器
        PAGE_NUMBER_SELECTOR: '.pagenav a[data-page]',
        CURRENT_PAGE_SELECTOR: '.pagenav span.active'
    },

    // 反爬虫配置
    ANTI_DETECTION: {
        // 随机延时范围（毫秒）
        MIN_DELAY: 2000,
        MAX_DELAY: 5000,

        // 页面加载等待时间
        PAGE_LOAD_TIMEOUT: 30000,

        // 请求间隔
        REQUEST_INTERVAL: {
            MIN: 1000,
            MAX: 3000
        },

        // 浏览器配置
        BROWSER_CONFIG: {
            headless: false, // 非无头模式，更难被检测
            viewport: { width: 1366, height: 768 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    },

    // 选择器配置
    SELECTORS: {
        // 主页面选择器
        SEARCH_TYPE_SELECT: 'select[name="searchType"]',
        SEARCH_INPUT: 'input[name="searchValue"]',
        SEARCH_BUTTON: 'button[type="submit"]',

        // 结果页面选择器
        RESULT_LIST: '.result-list',
        JOURNAL_LINKS: 'a[href*="/journal/"]',
        JOURNAL_TITLE: '.title',

        // 详情页面选择器
        JOURNAL_INFO: '.journal-info',
        SUBMIT_BUTTON: '.submit-btn, .contribution-btn',

        // 投稿页面选择器
        REVIEW_CYCLE: '.review-cycle',
        PUBLISH_DELAY: '.publish-delay',
        ACCEPTANCE_RATE: '.acceptance-rate',
        FEE_INFO: '.fee-info',
        EDITOR_INFO: '.editor-info',
        CONTACT_INFO: '.contact-info'
    },

    // Excel输出配置
    EXCEL_CONFIG: {
        FILENAME: 'zhiwang_journals_complete.xlsx',
        SHEET_NAME: 'Journal_Info',
        HEADERS: [
            '期刊名称',
            'CN号',
            'ISSN',
            '数据库标识',
            '曾用刊名',
            '主办单位',
            '出版周期',
            '出版地',
            '语种',
            '开本',
            '创刊时间',
            '专辑名称',
            '专题名称',
            '出版文献量',
            '总下载次数',
            '总被引次数',
            '复合影响因子',
            '复合影响因子年份',
            '综合影响因子',
            '综合影响因子年份',
            '数据库收录列表',
            'WJCI分区',
            '投稿出版周期',
            '投稿是否收费',
            '主编',
            '副主编',
            '官网网址',
            '投稿网址',
            '投稿邮箱',
            '咨询邮箱',
            '编辑部地址',
            '联系电话',
            '获取时间'
        ]
    },

    // 日志配置
    LOG_CONFIG: {
        level: 'info',
        format: 'YYYY-MM-DD HH:mm:ss',
        filename: 'scraper.log'
    }
};

module.exports = config;