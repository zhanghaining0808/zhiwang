const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const config = require('./config');

/**
 * Excel数据处理类
 * 负责期刊数据的存储和管理
 */
class ExcelHandler {
    constructor() {
        this.filename = config.EXCEL_CONFIG.FILENAME;
        this.sheetName = config.EXCEL_CONFIG.SHEET_NAME;
        this.headers = config.EXCEL_CONFIG.HEADERS;
        this.data = [];
        this.filepath = path.join(process.cwd(), this.filename);
    }

    /**
     * 初始化Excel文件
     */
    initExcel() {
        // 如果文件已存在，先读取现有数据
        if (fs.existsSync(this.filepath)) {
            try {
                const workbook = XLSX.readFile(this.filepath);
                const worksheet = workbook.Sheets[this.sheetName];
                if (worksheet) {
                    this.data = XLSX.utils.sheet_to_json(worksheet);
                    console.log(`已加载现有数据，共 ${this.data.length} 条记录`);
                }
            } catch (error) {
                console.log('读取现有Excel文件失败，将创建新文件');
                this.data = [];
            }
        }
    }

    /**
     * 添加期刊数据
     * @param {Object} journalData - 期刊数据对象
     */
    addJournalData(journalData) {
        // 如果数据已经是正确的格式（包含中文字段名），直接使用
        if (journalData['期刊名称']) {
            // 确保所有字段都存在
            const record = {};
            this.headers.forEach(header => {
                record[header] = journalData[header] || '未知';
            });

            this.data.push(record);
            console.log(`已添加期刊数据：${record['期刊名称']}`);
            return;
        }

        // 兼容旧的英文字段名格式
        const record = {
            '期刊名称': journalData.name || journalData['期刊名称'] || '',
            '期刊编码': journalData.code || journalData['期刊编码'] || '',
            '期刊类型': journalData.type || journalData['期刊类型'] || '',
            '主办单位': journalData.publisher || journalData['主办单位'] || '',
            '出版周期': journalData.publishCycle || journalData['出版周期'] || '',
            '平均审稿周期': journalData.reviewCycle || journalData['平均审稿周期'] || '',
            '平均出版时滞': journalData.publishDelay || journalData['平均出版时滞'] || '',
            '平均录取率': journalData.acceptanceRate || journalData['平均录取率'] || '',
            '是否收费': journalData.feeInfo || journalData['是否收费'] || '',
            '主编': journalData.chiefEditor || journalData['主编'] || '',
            '副主编': journalData.deputyEditor || journalData['副主编'] || '',
            '网址': journalData.website || journalData['网址'] || '',
            '邮箱': journalData.email || journalData['邮箱'] || '',
            '电话': journalData.phone || journalData['电话'] || '',
            '获取时间': journalData['获取时间'] || new Date().toLocaleString('zh-CN')
        };

        this.data.push(record);
        console.log(`已添加期刊数据：${record['期刊名称']}`);
    }

    /**
     * 保存数据到Excel文件
     */
    saveToExcel() {
        try {
            // 创建工作簿
            const workbook = XLSX.utils.book_new();

            // 创建工作表
            const worksheet = XLSX.utils.json_to_sheet(this.data, { header: this.headers });

            // 设置列宽
            const colWidths = [
                { wch: 30 }, // 期刊名称
                { wch: 15 }, // 期刊编码
                { wch: 10 }, // 期刊类型
                { wch: 30 }, // 主办单位
                { wch: 15 }, // 出版周期
                { wch: 15 }, // 平均审稿周期
                { wch: 15 }, // 平均出版时滞
                { wch: 15 }, // 平均录取率
                { wch: 10 }, // 是否收费
                { wch: 20 }, // 主编
                { wch: 20 }, // 副主编
                { wch: 40 }, // 网址
                { wch: 30 }, // 邮箱
                { wch: 20 }, // 电话
                { wch: 20 }  // 获取时间
            ];
            worksheet['!cols'] = colWidths;

            // 添加工作表到工作簿
            XLSX.utils.book_append_sheet(workbook, worksheet, this.sheetName);

            // 写入文件
            XLSX.writeFile(workbook, this.filepath);

            console.log(`数据已保存到 ${this.filepath}，共 ${this.data.length} 条记录`);
            return true;
        } catch (error) {
            console.error('保存Excel文件失败：', error.message);
            return false;
        }
    }

    /**
     * 检查期刊是否已存在
     * @param {string} journalName - 期刊名称
     * @param {string} journalCode - 期刊编码
     * @returns {boolean} 是否已存在
     */
    isJournalExists(journalName, journalCode) {
        return this.data.some(record =>
            record['期刊名称'] === journalName ||
            (journalCode && record['期刊编码'] === journalCode)
        );
    }

    /**
     * 获取当前数据统计
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            totalRecords: this.data.length,
            filename: this.filename,
            filepath: this.filepath
        };
    }

    /**
     * 清空数据
     */
    clearData() {
        this.data = [];
        console.log('已清空所有数据');
    }

    /**
     * 备份现有文件
     */
    backupExistingFile() {
        if (fs.existsSync(this.filepath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = this.filepath.replace('.xlsx', `_backup_${timestamp}.xlsx`);
            try {
                fs.copyFileSync(this.filepath, backupPath);
                console.log(`已备份现有文件到：${backupPath}`);
                return backupPath;
            } catch (error) {
                console.error('备份文件失败：', error.message);
                return null;
            }
        }
        return null;
    }

    /**
     * 导出数据为JSON格式
     * @returns {string} JSON字符串
     */
    exportToJSON() {
        return JSON.stringify(this.data, null, 2);
    }

    /**
     * 从JSON导入数据
     * @param {string} jsonData - JSON数据字符串
     */
    importFromJSON(jsonData) {
        try {
            const importedData = JSON.parse(jsonData);
            if (Array.isArray(importedData)) {
                this.data = importedData;
                console.log(`已从JSON导入 ${this.data.length} 条记录`);
                return true;
            } else {
                console.error('JSON数据格式错误，必须是数组格式');
                return false;
            }
        } catch (error) {
            console.error('JSON导入失败：', error.message);
            return false;
        }
    }
}

module.exports = ExcelHandler;