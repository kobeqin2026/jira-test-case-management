/**
 * @module sessions
 * @description Session management with file persistence. Handles generation of session tokens,
 * loading and saving sessions to disk, and provides auto-save and graceful shutdown support.
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var dataStore = require('./dataStore');

var SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
var sessions = {};

// ===== 会话有效期 (2026-11-13 修复「放久了 / 第二天回来报 401」) =====
// 旧逻辑: createdAt 起固定 24h 硬过期 + cookie maxAge 24h, 无滑动续期 → 用户第二天回来必 401。
// 新逻辑: 滑动空闲 72h + 绝对上限 30 天, cookie 与之对齐。
var SESSION_IDLE_TTL_MS = 72 * 60 * 60 * 1000;
var SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
var COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
var TOUCH_GRANULARITY_MS = 10 * 60 * 1000;
var COOKIE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function isSessionExpired(session, now) {
    if (!session) return true;
    now = now || Date.now();
    var created = session.createdAt || 0;
    var lastSeen = session.lastSeenAt || created;
    if (created && now - created > SESSION_ABSOLUTE_TTL_MS) return true;
    if (lastSeen && now - lastSeen > SESSION_IDLE_TTL_MS) return true;
    return false;
}

function touchSession(session, now) {
    if (!session) return session;
    now = now || Date.now();
    if (!session.lastSeenAt || now - session.lastSeenAt > TOUCH_GRANULARITY_MS) {
        session.lastSeenAt = now;
    }
    if (!session.firstSeenAt) session.firstSeenAt = session.createdAt || now;
    return session;
}

/**
 * 按 token 查会话。本应用的存储历史上按 username 作键(值内含 token), 故两者都查。
 */
function getSessionByToken(token) {
    if (!token) return null;
    if (sessions[token]) return sessions[token];
    var keys = Object.keys(sessions);
    for (var i = 0; i < keys.length; i++) {
        if (sessions[keys[i]] && sessions[keys[i]].token === token) return sessions[keys[i]];
    }
    return null;
}

/**
 * 按 token 删除会话(键可能是 username, 不能直接 delete sessions[token])。
 */
function purgeSession(token) {
    if (!token) return false;
    var removed = false;
    Object.keys(sessions).forEach(function(k) {
        if (k === token || (sessions[k] && sessions[k].token === token)) {
            delete sessions[k];
            removed = true;
        }
    });
    return removed;
}

/**
 * Generates a unique session token for the given username.
 * Uses the current timestamp, random bytes, and a SHA-256 hash truncated to 32 characters.
 *
 * @param {string} username - The username to generate a token for.
 * @returns {string} A 32-character hexadecimal session token.
 */
function generateToken(username) {
    var timestamp = Date.now();
    var random = crypto.randomBytes(16).toString('hex');
    return crypto.createHash('sha256').update(username + ':' + timestamp + ':' + random).digest('hex').substring(0, 32);
}

/**
 * Loads sessions from the sessions file into the in-memory sessions object.
 * If the file does not exist or fails to parse, initializes sessions to an empty object.
 *
 * @returns {object} The loaded sessions object mapping token strings to session data.
 */
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            var data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
            // 清理已过期会话 (滑动空闲 72h / 绝对 30 天): 老实现只在请求时判过期, 从不清理,
            // 文件里攒了 13 条 100 天前的死会话。
            var pruned = {};
            Object.keys(data).forEach(function(k) {
                var s = data[k];
                if (!s) return;
                if (isSessionExpired(s)) return;
                pruned[k] = s;
            });
            sessions = pruned;
            console.log('Loaded ' + Object.keys(sessions).length + ' sessions from file (pruned '
                + (Object.keys(data).length - Object.keys(sessions).length) + ')');
        }
    } catch (error) {
        console.error('Failed to load sessions:', error);
        sessions = {};
    }
    return sessions;
}

/**
 * Persists the current in-memory sessions to the sessions file.
 *
 * @returns {Promise<void>} Resolves when the sessions have been saved.
 */
async function saveSessions() {
    try {
        await dataStore.safeWriteJSON(SESSIONS_FILE, sessions, null);
    } catch (error) {
        console.error('Failed to save sessions:', error);
    }
}

/**
 * Returns the current in-memory sessions object.
 *
 * @returns {object} The sessions object.
 */
function getSessions() {
    return sessions;
}

/**
 * Registers process event handlers to save sessions on process exit, SIGINT, and SIGTERM.
 * This ensures sessions are persisted during graceful shutdown.
 *
 * @returns {void}
 */
function setupGracefulShutdown() {
    process.on('exit', function() {
        try {
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
        } catch (e) {}
    });
    process.on('SIGINT', function() {
        saveSessions().then(function() { process.exit(); });
    });
    process.on('SIGTERM', function() {
        saveSessions().then(function() { process.exit(); });
    });
}

/**
 * Starts a periodic auto-save timer that persists sessions at a specified interval.
 *
 * @param {number} [interval=30000] - The auto-save interval in milliseconds (default: 30000ms).
 * @returns {void}
 */
function startAutoSave(interval) {
    interval = interval || 30000;
    setInterval(saveSessions, interval);
}

module.exports = {
    generateToken, loadSessions, saveSessions, getSessions,
    getSessionByToken, isSessionExpired, touchSession, purgeSession,
    SESSION_IDLE_TTL_MS, SESSION_ABSOLUTE_TTL_MS, COOKIE_MAX_AGE_MS, COOKIE_REFRESH_INTERVAL_MS,
    setupGracefulShutdown, startAutoSave, SESSIONS_FILE
};
