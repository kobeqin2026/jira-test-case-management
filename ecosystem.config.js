var fs = require('fs');
var path = require('path');

// Load environment variables from skills/.env if exists
var envFile = path.join(process.env.HOME, 'skills', '.env');
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(function(line) {
        line = line.trim();
        if (line && !line.startsWith('#') && line.indexOf('=') !== -1) {
            var idx = line.indexOf('=');
            var key = line.substring(0, idx).trim();
            var val = line.substring(idx + 1).trim();
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

module.exports = {
  apps: [{
    name: 'jira-testcase',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JIRA_BASE_URL: process.env.JIRA_BASE_URL || 'https://jira01.birentech.com',
      JIRA_PAT: process.env.JIRA_PAT || '',
      BAILIAN_API_KEY: process.env.BAILIAN_API_KEY || '',
      BAILIAN_BASE_URL: process.env.BAILIAN_BASE_URL || 'https://aiapiidc.birentech.com/v1',
      BAILIAN_MODEL: process.env.BAILIAN_MODEL || 'br-qwen3',
      DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
      DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || 'user123'
    }
  }]
};
