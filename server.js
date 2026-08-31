// JIRA Test Case Manager - Independent Server
// Standalone Express app for test case management

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var rateLimit = require('express-rate-limit');

// 加载本地环境变量(~/skills/.env; JIRA 地址/项目名/密钥均经此注入, 不入公开仓库)
var fs = require('fs');
var envFile = path.join(process.env.HOME || '', 'skills', '.env');
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(function(line) {
        line = line.trim();
        if (line && !line.startsWith('#') && line.indexOf('=') !== -1) {
            var idx = line.indexOf('=');
            var key = line.substring(0, idx).trim();
            if (!process.env[key]) process.env[key] = line.substring(idx + 1).trim();
        }
    });
}

var sessions = require('./lib/sessions');
var dataStore = require('./lib/dataStore');

// Initialize data directory
dataStore.ensureDataDir();

// Load sessions and start auto-save
sessions.loadSessions();
sessions.startAutoSave(30000);
sessions.setupGracefulShutdown();

var app = express();
var PORT = process.env.PORT || 3001;

// Global error handlers to prevent crashes
process.on('uncaughtException', function(err) {
    console.error('[FATAL] Uncaught Exception:', err.message);
    console.error(err.stack);
});
process.on('unhandledRejection', function(err) {
    console.error('[FATAL] Unhandled Rejection:', err);
});

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
// 2026-08-27: nginx 代理带 X-Forwarded-For, express-rate-limit v7 默认校验在 trust proxy=false 时抛
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (日志刷屏/潜在 500) —— 声明信任第一跳代理
app.set('trust proxy', 1);
var generalLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max: 120,               // 120 requests per minute per IP
    message: { success: false, error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', generalLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/testcase', require('./routes/testcase'));

// 运行配置下发(env 注入; 公开仓默认仅占位示例, 真实值在 ~/skills/.env)
app.get('/api/config', function(req, res) {
    var jiraCfg = require('./lib/jiraConfig');
    res.json({
        jiraBase: jiraCfg.baseUrl,
        tcProject: process.env.TESTCASE_PROJECT || 'DEMO-TC'
    });
});

// Logs route (admin only)
app.get('/api/logs/:date?', require('./middleware/auth').authenticateToken, require('./middleware/auth').requireAdmin, async function(req, res) {
    try {
        var date = req.params.date || new Date().toISOString().split('T')[0];
        var logs = require('./lib/logger').readLogByDate(date);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// SPA fallback — serve index.html for non-API routes
app.get('*', function(req, res) {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'jira-test-case-management.html'));
    } else {
        res.status(404).json({ success: false, error: 'API not found' });
    }
});

app.listen(PORT, '0.0.0.0', function() {
    console.log('JIRA Test Case Manager running on http://0.0.0.0:' + PORT);
    console.log('Data directory: ' + dataStore.DATA_DIR);
});
