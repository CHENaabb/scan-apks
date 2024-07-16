const express = require('express');
const path = require('path');
const app = express();
const port = 3010;
const qr = require('qrcode');
const os = require('os');
const qrCodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const fsP = fs.promises;

const local = process.env.PLATFORM === 'local';
const currentDir = path.resolve(local ? __dirname : process.execPath);
async function nodeFindKeys() {
    console.log('loading...');
    // const ora = await import('ora');
    // const spinner = ora.default('Loading').start();
    const dirPath = path.resolve(currentDir, '..');
    const apkFiles = await findAPKsAsync(dirPath);

    apkFiles?.forEach(async (file) => {
        const downloadUrl = ip + "download?n=" + file;
        const filename = file.split("\\").pop();
        const createDate = await getFileCreationTime(file)
        console.log(downloadUrl);
        console.log(filename + ' ' + createDate.toLocaleString());
        qrCodeTerminal.generate(downloadUrl, { small: true })
    })
    // spinner.succeed('🐂');
}

async function findAPKsAsync(dirPath) {
    let apkFiles = []; // 初始化累积的apk文件数组

    async function search(dir) {
        const files = await fsP.readdir(dir);
        for (let item of files) {
            const itemPath = path.join(dir, item);

            // 排除条件检查
            if (itemPath.includes('node_modules') || itemPath.includes('debug')) continue;

            try {
                const stat = await fsP.stat(itemPath);
                if (stat.isDirectory()) {
                    // 递归查找子目录
                    await search(itemPath);
                } else if (['.apk'].includes(path.extname(item))) {
                    // 如果是apk文件，添加到累积数组
                    apkFiles.push(itemPath);
                }
            } catch (err) {
                console.error(`Error processing ${itemPath}:`, err);
            }
        }
    }

    // 开始搜索并等待完成
    await search(dirPath);

    return apkFiles;
}

async function getFileCreationTime(filePath) {
    const stats = await fsP.stat(filePath);
    return stats.mtime;
}

function getIP() {
    // 获取本机网络接口信息
    const networkInterfaces = os.networkInterfaces();

    let ipAddress = '';

    // 遍历网络接口，通常我们选择IPv4地址作为本地IP
    for (const name of Object.keys(networkInterfaces)) {
        for (const interfaceInfo of networkInterfaces[name]) {
            // 过滤回环地址和未分配的IP，只保留IPv4地址
            if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
                ipAddress = interfaceInfo.address;
                break; // 一般取第一个非内部IPv4地址
            }
        }

        if (ipAddress) break; // 如果找到合适的IP，就跳出循环
    }
    return ipAddress
}

/**
 * 更新下载记录
 */
function updateRecord(record) {
    downloadRecord = [...downloadRecord, record];
}

let ip = '';
let downloadRecord = [];
// 设置下载路由
app.get('/download', (req, res) => {

    const filename = req.query.n;
    const name = filename.split("\\").pop();
    const dirPath = path.resolve(currentDir, '..');

    // 必须是当前目录下的文件
    if (!filename.includes(dirPath) || !filename.includes('.apk')) {
        res.status(403).send('无效路径');
        return;
    }
    // 检查文件是否存在
    if (!fs.existsSync(filename)) {
        res.status(404).send('File not found');
        return;
    }

    // 设置响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename=' + name);
    // 发送文件
    res.download(filename, (err) => {
        if (err) {
            console.log(err.name, err.message);
            updateRecord(`${err.name}${err.message}`)
            // res.status(500).send('Error while downloading file');
        } else {
            // const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            console.log(req.socket.remoteAddress + '🐎' + filename, new Date().toLocaleString());
            updateRecord(req.socket.remoteAddress + '🐎' + filename, new Date().toLocaleString())
        }
    });


});
app.get('/', (req, res) => {
    if (local) {
        res.sendFile(path.join(currentDir, 'src', 'index.html'));
    } else {
        res.status(202).send('hi!');
    }
});
app.get('/view', async (req, res) => {
    // 获取当前目录的上一级目录路径
    const dirPath = path.resolve(currentDir, '..');
    const apkFiles = await findAPKsAsync(dirPath);
    const data = apkFiles?.map((file) => {
        const downloadUrl = req.query.n + "download?n=" + file;
        console.log(downloadUrl);
        const svg = qr.toString(downloadUrl, { type: 'svg', width: 140, height: 140 }, (err, svg) => {
            if (err) throw err;
            return svg
        });
        return { title: file, svg }
    })

    res.send(data);

});

app.get('/record', async (req, res) => {
    res.send(downloadRecord);
});
// 启动
app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    ip = 'http://' + getIP() + ':' + port + '/';
    try {
        await nodeFindKeys()
    } catch (error) {
        console.log(error);
    }
});