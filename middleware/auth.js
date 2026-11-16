// Authentication middleware

var sessions = require('../lib/sessions');

function authenticateToken(req, res, next) {
    var token = req.cookies && req.cookies.token;
    
    if (!token) {
        var authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未登录或登录已过期' });
    }
    
    var allSessions = sessions.getSessions();
    var session = sessions.getSessionByToken ? sessions.getSessionByToken(token) : null;
    if (!session) {
        var sessionKeys = Object.keys(allSessions);
        for (var i = 0; i < sessionKeys.length; i++) {
            if (allSessions[sessionKeys[i]].token === token) {
                session = allSessions[sessionKeys[i]];
                break;
            }
        }
    }
    
    if (!session) {
        return res.status(401).json({ success: false, message: '无效的 token' });
    }

    // 会话有效期 = 滑动空闲 72h + 绝对上限 30 天 (2026-11-13 起; 旧的固定 24h 会让第二天回来必 401)
    if (sessions.isSessionExpired(session)) {
        if (sessions.purgeSession) {
            sessions.purgeSession(token);
        } else {
            delete allSessions[session.username];
        }
        sessions.saveSessions();
        res.clearCookie('token');
        return res.status(401).json({ success: false, message: '登录已过期（连续 3 天无操作），请重新登录' });
    }

    // 滑动续期 + cookie 滚动(节流 1h), 避免浏览器 cookie 先于会话过期
    if (sessions.touchSession) sessions.touchSession(session);
    var now = Date.now();
    if (!session.cookieRefreshedAt || now - session.cookieRefreshedAt > sessions.COOKIE_REFRESH_INTERVAL_MS) {
        session.cookieRefreshedAt = now;
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: sessions.COOKIE_MAX_AGE_MS,
            sameSite: 'lax'
        });
    }

    req.user = session;
    next();
}

function requireAdmin(req, res, next) {
    var logOperation = require('../lib/logger').logOperation;
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        logOperation(req.user && req.user.username, 'DENIED', 'admin-access', { reason: 'non-admin' });
        res.status(403).json({ success: false, message: '需要管理员权限' });
    }
}

module.exports = { authenticateToken, requireAdmin };
