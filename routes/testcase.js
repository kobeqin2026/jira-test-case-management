// Test Case Upload to JIRA
// Bulk create JIRA issues from CSV/Excel data

var express = require('express');
var router = express.Router();
var url = require('url');
var auth = require('../middleware/auth');
var jiraConfig = require('../lib/jiraConfig');

/**
 * Build auth header for JIRA API
 * @param {string} [userPat] - User-specific PAT (overrides global)
 */
function getAuthHeader(userPat) {
    var pat = userPat || jiraConfig.pat;
    if (pat) {
        return 'Bearer ' + pat;
    } else if (jiraConfig.email && jiraConfig.apiToken) {
        var token = Buffer.from(jiraConfig.email + ':' + jiraConfig.apiToken).toString('base64');
        return 'Basic ' + token;
    } else if (jiraConfig.username && jiraConfig.password) {
        var creds = Buffer.from(jiraConfig.username + ':' + jiraConfig.password).toString('base64');
        return 'Basic ' + creds;
    }
    return null;
}

/**
 * Sanitize JIRA project/issue key (prevent JQL injection)
 */
function sanitizeKey(key) {
    if (!key) return '';
    return key.replace(/[^A-Za-z0-9\-]/g, '');
}

/**
 * Make a JIRA REST API request
 * @param {string} method
 * @param {string} apiPath
 * @param {object} [body]
 * @param {string} [userPat] - User-specific PAT
 */
function jiraRequest(method, apiPath, body, userPat) {
    return new Promise(function(resolve, reject) {
        var authHeader = getAuthHeader(userPat);
        if (!authHeader) {
            return reject(new Error('JIRA认证未配置'));
        }

        var jiraUrl = jiraConfig.baseUrl;
        var parsedUrl = url.parse(jiraUrl);

        var options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: apiPath,
            method: method,
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            protocol: parsedUrl.protocol,
            timeout: 30000
        };

        var https = parsedUrl.protocol === 'https:' ? require('https') : require('http');

        var req = https.request(options, function(resp) {
            var data = '';
            resp.on('data', function(chunk) { data += chunk; });
            resp.on('end', function() {
                try {
                    // Handle empty response body (e.g., 204 No Content on PUT)
                    if (!data || data.trim() === '') {
                        if (resp.statusCode >= 200 && resp.statusCode < 300) {
                            resolve({});
                        } else {
                            reject(new Error('JIRA API ' + resp.statusCode + ': Empty response'));
                        }
                        return;
                    }
                    var parsed = JSON.parse(data);
                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        var errMsg = '';
                        if (parsed.errorMessages && parsed.errorMessages.length > 0) {
                            errMsg = parsed.errorMessages.join(', ');
                        } else if (parsed.errors) {
                            errMsg = Object.keys(parsed.errors).map(function(k) { return k + ': ' + parsed.errors[k]; }).join(', ');
                        } else {
                            errMsg = parsed.message || 'Unknown error';
                        }
                        reject(new Error('JIRA API ' + resp.statusCode + ': ' + errMsg));
                    }
                } catch (e) {
                    reject(new Error('JIRA API response parse error: ' + data.substring(0, 200)));
                }
            });
        });

        req.setTimeout(30000, function() {
            req.destroy();
            reject(new Error('JIRA API request timeout'));
        });

        req.on('error', function(e) {
            reject(new Error('JIRA API request failed: ' + e.message));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * POST /api/testcase/create
 * Create a single JIRA issue
 * Body: { project, issuetype, summary, description, priority, labels, assignee, parentKey }
 */
router.post('/create', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        if (!body.project || !body.summary) {
            return res.status(400).json({ success: false, error: 'project和summary为必填项' });
        }

        var projectKey = sanitizeKey(body.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '无效的项目Key' });
        }

        var userPat = req.user.jiraPat || '';
        var userJiraName = req.user.jiraName || req.user.username;
        var issueTypeName = (body.issuetype === 'Sub-test plan' ? 'Test Plan' : body.issuetype) || 'Task';

        var issueBody = {
            fields: {
                project: { key: projectKey },
                issuetype: { name: issueTypeName },
                summary: body.summary
            }
        };

        // Set reporter for non-Sub-task types (Sub-task screen doesn't support reporter field)
        if (issueTypeName !== 'Sub-task' && userJiraName) {
            issueBody.fields.reporter = { name: userJiraName };
        }

        if (body.description) {
            issueBody.fields.description = body.description;
        }
        if (body.priority) {
            issueBody.fields.priority = { name: body.priority };
        }
        if (body.labels && Array.isArray(body.labels)) {
            issueBody.fields.labels = body.labels;
        } else if (body.labels && typeof body.labels === 'string') {
            issueBody.fields.labels = body.labels.split(/[;,，]/).map(function(l) { return l.trim(); }).filter(Boolean);
        }
        if (body.assignee) {
            // Look up user by display name if not a username
            var assigneeName = body.assignee;
            if (!assigneeName.match(/^E\d+$/)) {
                try {
                    var searchResult = await jiraRequest('GET', '/rest/api/2/user/search?username=' + encodeURIComponent(assigneeName), null, userPat);
                    if (searchResult && searchResult.length > 0) {
                        var searchWords = assigneeName.toLowerCase().split(/\s+/);
                        for (var u = 0; u < searchResult.length; u++) {
                            var displayName = (searchResult[u].displayName || '').toLowerCase();
                            var allWordsMatch = searchWords.every(function(w) { return displayName.indexOf(w) !== -1; });
                            if (allWordsMatch) {
                                assigneeName = searchResult[u].name;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('[TestCase] User lookup failed:', e.message);
                }
            }
            issueBody.fields.assignee = { name: assigneeName };
        }
        if (body.parentKey) {
            var parentKey = sanitizeKey(body.parentKey);
            if (parentKey) {
                var issueTypeName = issueBody.fields.issuetype.name;
                if (issueTypeName === 'Sub-task') {
                    issueBody.fields.parent = { key: parentKey };
                }
                // For non-Sub-task, we'll add issuelink after creation
            }
        }

        var result = await jiraRequest('POST', '/rest/api/2/issue', issueBody, userPat);

        // For non-Sub-task issues with parentKey, add issuelink after creation
        if (body.parentKey && issueBody.fields.issuetype.name !== 'Sub-task') {
            var linkParentKey = sanitizeKey(body.parentKey);
            if (linkParentKey) {
                try {
                    await jiraRequest('POST', '/rest/api/2/issueLink', {
                        type: { name: 'Relates' },
                        inwardIssue: { key: linkParentKey },
                        outwardIssue: { key: result.key }
                    }, userPat);
                } catch (linkErr) {
                    console.error('[TestCase] Link creation failed:', linkErr.message);
                }
            }
        }
        res.json({
            success: true,
            data: {
                key: result.key,
                id: result.id,
                url: jiraConfig.baseUrl + '/browse/' + result.key
            }
        });
    } catch (error) {
        console.error('[TestCase] Create error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/batch-create
 * Batch create JIRA issues
 * Body: { project, issues: [{ summary, description, issuetype, priority, labels, assignee, parentKey }] }
 */
router.post('/batch-create', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        if (!body.project || !body.issues || !Array.isArray(body.issues) || body.issues.length === 0) {
            return res.status(400).json({ success: false, error: 'project和issues数组为必填项' });
        }

        if (body.issues.length > 50) {
            return res.status(400).json({ success: false, error: '单次最多创建50条Issue' });
        }

        var projectKey = sanitizeKey(body.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '无效的项目Key' });
        }

        var userPat = req.user.jiraPat || '';
        var userJiraName = req.user.jiraName || req.user.username;
        var results = [];
        var errors = [];
        var createdKeys = [];

        console.log('[TestCase] batch-create:', body.project, 'issues:', body.issues.length, 'parentKeys:', body.issues.map(function(i){return i.parentKey||'(none)';}));
        for (var i = 0; i < body.issues.length; i++) {
            var issue = body.issues[i];
            try {
                var batchIssueTypeName = (issue.issuetype === 'Sub-test plan' ? 'Test Plan' : issue.issuetype) || 'Task';
                var issueBody = {
                    fields: {
                        project: { key: projectKey },
                        issuetype: { name: batchIssueTypeName },
                        summary: issue.summary
                    }
                };

                // Set reporter for non-Sub-task types (Sub-task screen doesn't support reporter field)
                if (batchIssueTypeName !== 'Sub-task' && userJiraName) {
                    issueBody.fields.reporter = { name: userJiraName };
                }

                if (issue.description) {
                    issueBody.fields.description = issue.description;
                }
                if (issue.priority) {
                    issueBody.fields.priority = { name: issue.priority };
                }
                if (issue.labels) {
                    var labels = Array.isArray(issue.labels) ? issue.labels : issue.labels.split(/[;,，]/).map(function(l) { return l.trim(); }).filter(Boolean);
                    issueBody.fields.labels = labels;
                }
                if (issue.assignee) {
                    // Look up user by display name if not a username
                    var assigneeName = issue.assignee;
                    if (!assigneeName.match(/^E\d+$/)) {
                        // Search JIRA for user by display name
                        try {
                            var searchResult = await jiraRequest('GET', '/rest/api/2/user/search?username=' + encodeURIComponent(assigneeName), null, userPat);
                            if (searchResult && searchResult.length > 0) {
                                // Find match - check if all search words appear in displayName
                                var searchWords = assigneeName.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 1; });
                                for (var u = 0; u < searchResult.length; u++) {
                                    var displayName = (searchResult[u].displayName || '').toLowerCase();
                                    // Skip single-char words for matching
                                    if (searchWords.length === 0) {
                                        // All words were single chars, just use first result
                                        assigneeName = searchResult[u].name;
                                        break;
                                    }
                                    var allWordsMatch = searchWords.every(function(w) { return displayName.indexOf(w) !== -1; });
                                    if (allWordsMatch) {
                                        assigneeName = searchResult[u].name;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('[TestCase] User lookup failed:', e.message);
                        }
                    }
                    issueBody.fields.assignee = { name: assigneeName };
                }
                // Support parent key — Sub-task uses parent field, others use issuelinks (added after creation)
                if (issue.parentKey) {
                    var parentKey = sanitizeKey(issue.parentKey);
                    // Check if parentKey is a row reference (e.g. "row:0" means first created issue)
                    if (parentKey.indexOf('row:') === 0) {
                        var rowIdx = parseInt(parentKey.split(':')[1]);
                        if (createdKeys[rowIdx]) {
                            parentKey = createdKeys[rowIdx];
                        }
                    }
                    if (parentKey) {
                        var issueTypeName = issueBody.fields.issuetype.name;
                        if (issueTypeName === 'Sub-task') {
                            // Sub-task: use parent field at creation time
                            issueBody.fields.parent = { key: parentKey };
                        }
                        // For Test Plan / Task etc, we'll add issuelinks after creation
                    }
                }

                // Set components if provided
                if (issue.components) {
                    var compNames = Array.isArray(issue.components) ? issue.components : issue.components.split(/[;,，]/).map(function(c) { return c.trim(); }).filter(Boolean);
                    if (compNames.length > 0) {
                        issueBody.fields.components = compNames.map(function(c) { return { name: c }; });
                    }
                }

                var result = await jiraRequest('POST', '/rest/api/2/issue', issueBody, userPat);

                // For non-Sub-task issues with parentKey, add issuelink after creation
                if (issue.parentKey && issueBody.fields.issuetype.name !== 'Sub-task') {
                    var linkParentKey = sanitizeKey(issue.parentKey);
                    if (linkParentKey.indexOf('row:') === 0) {
                        var linkRowIdx = parseInt(linkParentKey.split(':')[1]);
                        if (createdKeys[linkRowIdx]) linkParentKey = createdKeys[linkRowIdx];
                    }
                    if (linkParentKey) {
                        try {
                            await jiraRequest('POST', '/rest/api/2/issueLink', {
                                type: { name: 'Relates' },
                                inwardIssue: { key: linkParentKey },
                                outwardIssue: { key: result.key }
                            }, userPat);
                        } catch (linkErr) {
                            console.error('[TestCase] Link creation failed:', linkErr.message);
                        }
                    }
                }

                createdKeys.push(result.key);
                results.push({
                    row: i + 1,
                    key: result.key,
                    id: result.id,
                    url: jiraConfig.baseUrl + '/browse/' + result.key,
                    summary: issue.summary,
                    status: 'created'
                });

                // Rate limit: 100ms between requests
                if (i < body.issues.length - 1) {
                    await new Promise(function(r) { setTimeout(r, 100); });
                }
            } catch (err) {
                console.error('[TestCase] Row ' + (i+1) + ' create failed:', err.message);
                errors.push({
                    row: i + 1,
                    summary: issue.summary,
                    error: err.message,
                    status: 'failed'
                });
            }
        }

        res.json({
            success: true,
            data: {
                total: body.issues.length,
                created: results.length,
                failed: errors.length,
                results: results,
                errors: errors
            }
        });
    } catch (error) {
        console.error('[TestCase] Batch create error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/template
 * Download CSV template
 */
router.get('/template', function(req, res) {
    var csv = '\uFEFF项目Key,Issue类型,标题,描述,优先级,标签,负责人,父任务Key\n';
    csv += 'BR200,Task,PCIe Gen3链路训练测试,验证LTSSM状态机在Gen3速率下的训练过程,Highest,"pcie;ltssm",qin.ke,\n';
    csv += 'BR200,Sub-task,IOMMU地址翻译测试,测试DMA地址翻译功能,High,"iommu;dma",qin.ke,BR200-100\n';
    csv += 'BR200,Task,GPIO中断测试,验证GPIO中断触发和处理,Medium,gpio,\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="testcase-template.csv"');
    res.send(csv);
});

/**
 * GET /api/testcase/projects
 * Get available JIRA projects for dropdown
 */
router.get('/projects', auth.authenticateToken, async function(req, res) {
    try {
        var userPat = req.user.jiraPat || '';
        var result = await jiraRequest('GET', '/rest/api/2/project', null, userPat);
        var projects = result.map(function(p) {
            return { key: p.key, name: p.name };
        }).sort(function(a, b) { return a.key.localeCompare(b.key); });
        res.json({ success: true, data: projects });
    } catch (error) {
        console.error('[TestCase] Get projects error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/issuetypes
 * Get issue types for a project
 */
router.get('/issuetypes/:project', auth.authenticateToken, async function(req, res) {
    try {
        var projectKey = sanitizeKey(req.params.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '无效的项目Key' });
        }
        var userPat = req.user.jiraPat || '';
        var result = await jiraRequest('GET', '/rest/api/2/issue/createmeta?projectKeys=' + projectKey + '&expand=projects.issuetypes', null, userPat);
        var types = [];
        if (result.projects && result.projects.length > 0) {
            types = result.projects[0].issuetypes.map(function(t) {
                return { name: t.name, subtask: t.subtask };
            });
        }
        res.json({ success: true, data: types });
    } catch (error) {
        console.error('[TestCase] Get issue types error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/search?project=XXX&startAt=0&maxResults=50&query=xxx
 * Search issues in a project via JQL
 */
router.get('/search', auth.authenticateToken, async function(req, res) {
    try {
        var projectKey = sanitizeKey(req.query.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '项目Key为必填项' });
        }

        var userPat = req.user.jiraPat || '';

        var startAt = parseInt(req.query.startAt) || 0;
        var maxResults = Math.min(parseInt(req.query.maxResults) || 20, 100);
        var searchText = req.query.query || '';
        var issueType = req.query.issuetype || '';
        var status = req.query.status || '';

        // Build JQL
        var jqlParts = ['project = ' + projectKey];
        if (searchText) {
            var safeText = searchText.replace(/"/g, '\\"');
            jqlParts.push('(summary ~ "' + safeText + '" OR description ~ "' + safeText + '" OR key = "' + safeText + '")');
        }
        if (issueType) {
            var types = issueType.split(',').map(function(t) { return t.trim(); });
            if (types.length > 1) {
                var typeList = types.map(function(t) { return '"' + t.replace(/"/g, '\\"') + '"'; }).join(', ');
                jqlParts.push('issuetype in (' + typeList + ')');
            } else {
                jqlParts.push('issuetype = "' + issueType.replace(/"/g, '\\"') + '"');
            }
        }
        if (status) {
            jqlParts.push('status = "' + status.replace(/"/g, '\\"') + '"');
        }
        // Support parent filter (e.g. parent=BR200-130)
        var parentKey = req.query.parent;
        if (parentKey) {
            var safeParent = sanitizeKey(parentKey);
            if (safeParent) {
                jqlParts.push('parent = ' + safeParent);
            }
        }
        var jql = jqlParts.join(' AND ') + ' ORDER BY created DESC';
        var apiPath = '/rest/api/2/search?jql=' + encodeURIComponent(jql)
            + '&startAt=' + startAt
            + '&maxResults=' + maxResults
            + '&fields=summary,status,assignee,priority,issuetype,created,updated,labels,description,components,customfield_10302,customfield_10303';

        var result = await jiraRequest('GET', apiPath, null, userPat);
        var issues = result.issues.map(function(issue) {
            return {
                key: issue.key,
                id: issue.id,
                summary: issue.fields.summary,
                description: issue.fields.description || '',
                status: issue.fields.status ? issue.fields.status.name : '',
                assignee: issue.fields.assignee ? issue.fields.assignee.displayName || issue.fields.assignee.name : '',
                priority: issue.fields.priority ? issue.fields.priority.name : '',
                issuetype: issue.fields.issuetype ? issue.fields.issuetype.name : '',
                labels: issue.fields.labels || [],
                components: (issue.fields.components || []).map(function(c) { return c.name || c; }),
                created: issue.fields.created,
                updated: issue.fields.updated,
                actualStartDate: issue.fields.customfield_10303 || '',
                actualEndDate: issue.fields.customfield_10302 || '',
                url: jiraConfig.baseUrl + '/browse/' + issue.key,
                parent: issue.fields.parent ? { key: issue.fields.parent.key, summary: issue.fields.parent.fields ? issue.fields.parent.fields.summary : '' } : null
            };
        });

        res.json({
            success: true,
            data: {
                total: result.total,
                startAt: result.startAt,
                maxResults: result.maxResults,
                issues: issues
            }
        });
    } catch (error) {
        console.error('[TestCase] Search error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/issue/:key
 * Get issue details including issuelinks
 */
router.get('/issue/:key', auth.authenticateToken, async function(req, res) {
    try {
        var key = sanitizeKey(req.params.key);
        if (!key) return res.status(400).json({ success: false, error: 'Invalid key' });

        var userPat = req.user.jiraPat || '';
        var apiPath = '/rest/api/2/issue/' + key + '?fields=summary,status,issuetype,description,assignee,created,issuelinks,parent,priority,labels';
        var result = await jiraRequest('GET', apiPath, null, userPat);

        // Extract linked issues
        var links = [];
        if (result.fields.issuelinks) {
            result.fields.issuelinks.forEach(function(l) {
                if (l.outwardIssue) {
                    links.push({
                        key: l.outwardIssue.key,
                        summary: l.outwardIssue.fields.summary,
                        issuetype: l.outwardIssue.fields.issuetype ? l.outwardIssue.fields.issuetype.name : '',
                        status: l.outwardIssue.fields.status ? l.outwardIssue.fields.status.name : '',
                        direction: l.type ? l.type.outward : ''
                    });
                }
                if (l.inwardIssue) {
                    links.push({
                        key: l.inwardIssue.key,
                        summary: l.inwardIssue.fields.summary,
                        issuetype: l.inwardIssue.fields.issuetype ? l.inwardIssue.fields.issuetype.name : '',
                        status: l.inwardIssue.fields.status ? l.inwardIssue.fields.status.name : '',
                        direction: l.type ? l.type.inward : ''
                    });
                }
            });
        }

        res.json({
            success: true,
            data: {
                key: result.key,
                id: result.id,
                summary: result.fields.summary,
                description: result.fields.description || '',
                status: result.fields.status ? result.fields.status.name : '',
                issuetype: result.fields.issuetype ? result.fields.issuetype.name : '',
                assignee: result.fields.assignee ? result.fields.assignee.displayName || result.fields.assignee.name : '',
                priority: result.fields.priority ? result.fields.priority.name : '',
                created: result.fields.created,
                parent: result.fields.parent ? result.fields.parent.key : '',
                links: links
            }
        });
    } catch (error) {
        console.error('[TestCase] Get issue error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/transitions/:key
 * Get available transitions for an issue
 */
router.get('/transitions/:key', auth.authenticateToken, async function(req, res) {
    try {
        var key = sanitizeKey(req.params.key);
        if (!key) return res.status(400).json({ success: false, error: 'Invalid key' });

        var userPat = req.user.jiraPat || '';
        var apiPath = '/rest/api/2/issue/' + key + '/transitions';
        var result = await jiraRequest('GET', apiPath, null, userPat);

        var transitions = (result.transitions || []).map(function(t) {
            return { id: t.id, name: t.name };
        });

        res.json({ success: true, data: { transitions: transitions } });
    } catch (error) {
        console.error('[TestCase] Get transitions error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/transition
 * Execute a transition on an issue
 */
router.post('/transition', auth.authenticateToken, async function(req, res) {
    try {
        var key = sanitizeKey(req.body.key);
        var transitionId = req.body.transitionId;
        if (!key || !transitionId) return res.status(400).json({ success: false, error: 'key and transitionId required' });

        var userPat = req.user.jiraPat || '';
        var apiPath = '/rest/api/2/issue/' + key + '/transitions';
        await jiraRequest('POST', apiPath, { transition: { id: transitionId } }, userPat);

        res.json({ success: true });
    } catch (error) {
        console.error('[TestCase] Transition error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/transition-batch
 * Execute transitions on multiple issues
 */
router.post('/transition-batch', auth.authenticateToken, async function(req, res) {
    try {
        var items = req.body.transitions || req.body.items || [];
        var results = [];
        var errors = [];
        var userPat = req.user.jiraPat || '';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            try {
                var apiPath = '/rest/api/2/issue/' + sanitizeKey(item.key) + '/transitions';
                await jiraRequest('POST', apiPath, { transition: { id: item.transitionId } }, userPat);
                results.push({ key: item.key, status: 'ok' });
            } catch (err) {
                errors.push({ key: item.key, error: err.message });
            }
            if (i < items.length - 1) await new Promise(function(r) { setTimeout(r, 100); });
        }

        res.json({ success: true, data: { total: items.length, ok: results.length, failed: errors.length, errors: errors } });
    } catch (error) {
        console.error('[TestCase] Batch transition error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/testplans?project=XXX
 * List test plans (Epics) from a JIRA project
 */
router.get('/testplans', auth.authenticateToken, async function(req, res) {
    try {
        var projectKey = sanitizeKey(req.query.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '项目Key为必填项' });
        }

        var userPat = req.user.jiraPat || '';

        // Fetch Epics from the project
        var jql = 'project = ' + projectKey + ' AND issuetype = Epic ORDER BY created DESC';
        var apiPath = '/rest/api/2/search?jql=' + encodeURIComponent(jql)
            + '&startAt=0&maxResults=100'
            + '&fields=summary,status,description,assignee,created';

        var result = await jiraRequest('GET', apiPath, null, userPat);
        var plans = result.issues.map(function(issue) {
            return {
                key: issue.key,
                id: issue.id,
                summary: issue.fields.summary,
                description: issue.fields.description || '',
                status: issue.fields.status ? issue.fields.status.name : '',
                assignee: issue.fields.assignee ? issue.fields.assignee.displayName || issue.fields.assignee.name : '',
                created: issue.fields.created,
                url: jiraConfig.baseUrl + '/browse/' + issue.key
            };
        });

        res.json({
            success: true,
            data: {
                total: result.total,
                plans: plans
            }
        });
    } catch (error) {
        console.error('[TestCase] Get test plans error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/components?project=XXX
 * Get all components for a JIRA project
 */
router.get('/components', auth.authenticateToken, async function(req, res) {
    try {
        var projectKey = sanitizeKey(req.query.project);
        if (!projectKey) return res.status(400).json({ success: false, error: 'project为必填项' });

        var userPat = req.user.jiraPat || '';
        var apiPath = '/rest/api/2/project/' + projectKey + '/components';
        var result = await jiraRequest('GET', apiPath, null, userPat);
        var components = (result || []).map(function(c) { return c.name; });
        res.json({ success: true, data: { components: components } });
    } catch (error) {
        console.error('[TestCase] Get components error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/testplan
 * Create a new test plan (Epic)
 * Body: { project, summary, description }
 */
router.post('/testplan', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        if (!body.project || !body.summary) {
            return res.status(400).json({ success: false, error: 'project和summary为必填项' });
        }

        var projectKey = sanitizeKey(body.project);
        if (!projectKey) {
            return res.status(400).json({ success: false, error: '无效的项目Key' });
        }

        var userPat = req.user.jiraPat || '';
        var userJiraName = req.user.jiraName || req.user.username;

        var issueBody = {
            fields: {
                project: { key: projectKey },
                issuetype: { name: 'Epic' },
                summary: body.summary,
                reporter: { name: userJiraName }
            }
        };

        if (body.description) {
            issueBody.fields.description = body.description;
        }

        var result = await jiraRequest('POST', '/rest/api/2/issue', issueBody, userPat);
        res.json({
            success: true,
            data: {
                key: result.key,
                id: result.id,
                summary: body.summary,
                url: jiraConfig.baseUrl + '/browse/' + result.key
            }
        });
    } catch (error) {
        console.error('[TestCase] Create test plan error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/testplan/description
 * Get a test plan's current description from JIRA
 * Query: planKey
 */
router.get('/testplan/description', auth.authenticateToken, async function(req, res) {
    try {
        var planKey = sanitizeKey(req.query.planKey);
        if (!planKey) {
            return res.status(400).json({ success: false, error: 'planKey为必填项' });
        }

        var userPat = req.user.jiraPat || '';
        var jiraResult = await jiraRequest('GET', '/rest/api/2/issue/' + planKey + '?fields=description', null, userPat);

        if (jiraResult && jiraResult.fields) {
            res.json({ success: true, data: { description: jiraResult.fields.description || '' } });
        } else {
            res.json({ success: false, error: '无法获取 Issue 描述' });
        }
    } catch (error) {
        console.error('[TestCase] Get description error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/testcase/testplan/description
 * Update a test plan's description with summary of linked sub-tasks
 * Body: { planKey, description }
 */
router.put('/testplan/description', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        var planKey = sanitizeKey(body.planKey);
        if (!planKey) {
            return res.status(400).json({ success: false, error: 'planKey为必填项' });
        }

        var userPat = req.user.jiraPat || '';
        var issueBody = {
            fields: {
                description: body.description || ''
            }
        };

        await jiraRequest('PUT', '/rest/api/2/issue/' + planKey, issueBody, userPat);
        res.json({ success: true });
    } catch (error) {
        console.error('[TestCase] Update plan description error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/testcase/testplan/linked-tasks/:planKey
 * Get all issues linked to a test plan, including sub-tasks (children) and linked issues
 */
router.get('/testplan/linked-tasks/:planKey', auth.authenticateToken, async function(req, res) {
        try {
            var planKey = sanitizeKey(req.params.planKey);
            if (!planKey) return res.status(400).json({ success: false, error: 'Invalid planKey' });

            var userPat = req.user.jiraPat || '';
            // Get plan summary
            var planResult = await jiraRequest('GET', '/rest/api/2/issue/' + planKey + '?fields=issuelinks,summary', null, userPat);

            var allSubtaskKeys = []; // all sub-tasks across all plans (3 levels)
            var allLinkedPlans = []; // only L1 linked plans for display

            // Helper: get issuelinks for a plan
            async function getLinkedPlanKeys(pKey) {
                try {
                    var r = await jiraRequest('GET', '/rest/api/2/issue/' + pKey + '?fields=issuelinks', null, userPat);
                    var keys = [];
                    if (r && r.fields && r.fields.issuelinks) {
                        r.fields.issuelinks.forEach(function(l) {
                            if (l.outwardIssue) keys.push(l.outwardIssue.key);
                            if (l.inwardIssue) keys.push(l.inwardIssue.key);
                        });
                    }
                    return keys;
                } catch (e) { return []; }
            }

            // Helper: get sub-tasks (children) for a plan
            async function getSubTaskKeys(pKey) {
                try {
                    var jql = 'parent = ' + pKey + ' ORDER BY created ASC';
                    var r = await jiraRequest('GET', '/rest/api/2/search?jql=' + encodeURIComponent(jql) + '&fields=summary,status,issuetype,priority,description,assignee,labels,components,parent&maxResults=200', null, userPat);
                    var keys = [];
                    if (r && r.issues) {
                        r.issues.forEach(function(issue) {
                            if (keys.indexOf(issue.key) === -1) keys.push(issue.key);
                        });
                    }
                    return keys;
                } catch (e) { return []; }
            }

            // Level 1: linked plans of parent
            var level1Keys = await getLinkedPlanKeys(planKey);
            // Exclude parent itself from linked plans
            level1Keys = level1Keys.filter(function(k) { return k !== planKey; });
            // Level 1: direct sub-tasks of parent
            var level1SubKeys = await getSubTaskKeys(planKey);
            level1SubKeys.forEach(function(k) { if (allSubtaskKeys.indexOf(k) === -1) allSubtaskKeys.push(k); });

            // Track all seen plan keys to avoid duplicates
            var seenPlanKeys = {};
            seenPlanKeys[planKey] = true;

            // Fetch info for level 1 linked plans
            for (var i = 0; i < level1Keys.length; i++) {
                if (seenPlanKeys[level1Keys[i]]) continue;
                seenPlanKeys[level1Keys[i]] = true;
                try {
                    var lr = await jiraRequest('GET', '/rest/api/2/issue/' + level1Keys[i] + '?fields=summary,issuetype', null, userPat);
                    allLinkedPlans.push({ key: level1Keys[i], summary: lr.fields.summary, issuetype: lr.fields.issuetype.name, level: 1, parentKey: planKey });
                } catch (e) {}
            }

            // Level 2: for each level 1 linked plan, get its sub-tasks and linked plans
            var level2PlanKeys = [];
            for (var i = 0; i < level1Keys.length; i++) {
                var subKeys = await getSubTaskKeys(level1Keys[i]);
                subKeys.forEach(function(k) { if (allSubtaskKeys.indexOf(k) === -1) allSubtaskKeys.push(k); });

                var linked2Keys = await getLinkedPlanKeys(level1Keys[i]);
                for (var j = 0; j < linked2Keys.length; j++) {
                    if (seenPlanKeys[linked2Keys[j]]) continue;
                    seenPlanKeys[linked2Keys[j]] = true;
                    level2PlanKeys.push(linked2Keys[j]);
                    // L2 plans not added to display list, only for sub-task collection
                }
            }

            // Level 3: for each level 2 linked plan, get its sub-tasks
            for (var i = 0; i < level2PlanKeys.length; i++) {
                var subKeys3 = await getSubTaskKeys(level2PlanKeys[i]);
                subKeys3.forEach(function(k) { if (allSubtaskKeys.indexOf(k) === -1) allSubtaskKeys.push(k); });
            }

            console.log('[TestCase] Linked-tasks:', planKey, '- L1 links:', level1Keys.length, ', L2 links:', level2PlanKeys.length, ', total sub-tasks:', allSubtaskKeys.length, ', linked plans:', allLinkedPlans.length);

            if (allSubtaskKeys.length === 0 && allLinkedPlans.length === 0) {
                return res.json({ success: true, data: { tasks: [], linkedPlans: [], planSummary: planResult.fields.summary } });
            }

            // Fetch details of all found sub-tasks
            var allTasks = [];
            var batchSize = 50;
            for (var i = 0; i < allSubtaskKeys.length; i += batchSize) {
                var batch = allSubtaskKeys.slice(i, i + batchSize);
                var jql = 'key in (' + batch.join(',') + ') ORDER BY created ASC';
                var searchResult = await jiraRequest('GET', '/rest/api/2/search?jql=' + encodeURIComponent(jql) + '&fields=summary,status,issuetype,priority,description,assignee,labels,components,created,updated,parent', null, userPat);
                if (searchResult && searchResult.issues) {
                    searchResult.issues.forEach(function(issue) {
                        allTasks.push({
                            key: issue.key,
                            summary: issue.fields.summary,
                            status: issue.fields.status ? issue.fields.status.name : '',
                            issuetype: issue.fields.issuetype ? issue.fields.issuetype.name : '',
                            priority: issue.fields.priority ? issue.fields.priority.name : '',
                            description: issue.fields.description || '',
                            assignee: issue.fields.assignee ? issue.fields.assignee.displayName || issue.fields.assignee.name : '',
                            labels: issue.fields.labels || [],
                            components: (issue.fields.components || []).map(function(c) { return c.name || c; }),
                            created: issue.fields.created,
                            updated: issue.fields.updated,
                            parent: issue.fields.parent ? issue.fields.parent.key : ''
                        });
                    });
                }
            }

            console.log('[TestCase] Linked-tasks total:', allTasks.length, 'sub-tasks for plan:', planKey);

            res.json({
                success: true,
                data: {
                    planKey: planKey,
                    planSummary: planResult.fields.summary,
                    tasks: allTasks,
                    linkedPlans: allLinkedPlans
                }
            });
        } catch (error) {
            console.error('[TestCase] Get linked tasks error:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
});

/**
 * POST /api/testcase/testplan/llm-evaluate
 * Use LLM as hardware testing expert to evaluate a test plan
 * Body: { planKey, tasks: [...] }  (tasks is the sub-task list from linked-tasks endpoint)
 * Returns: { evaluation: "LLM assessment text" }
 */
router.post('/testplan/llm-evaluate', auth.authenticateToken, async function(req, res) {
    var startTime = Date.now();
    try {
        var body = req.body;
        var planKey = sanitizeKey(body.planKey);
        var tasks = body.tasks || [];
        var planSummary = body.planSummary || '';
        var mode = body.mode || 'evaluate'; // 'evaluate' or 'generate_descriptions'

        console.log('[TestCase-LLMEval] Start:', planKey, 'tasks:', tasks.length, 'mode:', mode);

        if (!planKey) {
            return res.status(400).json({ success: false, error: 'planKey为必填项' });
        }

        var cfg = require('../lib/jiraConfig');
        var API_KEY = process.env['LLM_API_KEY'] || process.env['BAILIAN_API_KEY'] || '';
        var BASE_URL = cfg.llmBaseUrl || process.env.LLM_BASE_URL || process.env.BAILIAN_BASE_URL || 'https://aiapiidc.birentech.com/v1';
        var MODEL = cfg.llmModel || process.env.LLM_MODEL || process.env.BAILIAN_MODEL || 'br-qwen3';

        if (!API_KEY) {
            return res.status(500).json({ success: false, error: 'LLM API not configured (BAILIAN_API_KEY missing)' });
        }

        var cleanUrl = BASE_URL.replace(/\/+$/, '');
        var apiUrl = cleanUrl + '/chat/completions';

        function buildTaskListForBatch(batchTasks, startIndex) {
            return batchTasks.map(function(t, i) {
                var desc = (t.description || '').substring(0, 150);
                return (startIndex + i + 1) + '. [' + t.key + '] ' + (t.summary || '') + (desc ? ' — ' + desc : ' (无描述)');
            }).join('\n');
        }

        async function callLLM(systemPrompt, userPrompt, maxTokens) {
            var response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.4,
                    max_tokens: maxTokens
                }),
                signal: AbortSignal.timeout(300000)
            });
            var data = await response.text();
            var json = JSON.parse(data);
            if (json.error) {
                throw new Error(json.error.message || 'LLM API error');
            }
            var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
            if (!content) {
                throw new Error('LLM returned empty response');
            }
            return content;
        }

        function parseDescriptions(llmContent) {
            var parsed = null;
            try { parsed = JSON.parse(llmContent); } catch (_) {}
            if (!parsed) {
                var stripped = llmContent.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
                try { parsed = JSON.parse(stripped); } catch (_) {}
            }
            if (!parsed) {
                var match = llmContent.match(/\{[\s\S]*\}/);
                if (match) { try { parsed = JSON.parse(match[0]); } catch (_) {} }
            }
            if (!parsed) {
                var jsonMatch = llmContent.match(/\{[\s\S]*"descriptions"[\s\S]*\}/);
                if (jsonMatch) {
                    try { parsed = JSON.parse(jsonMatch[0]); } catch(e) { console.log('[TestCase-LLMEval] Aggressive parse error:', e.message); }
                }
            }
            return (parsed && parsed.descriptions) ? parsed.descriptions : {};
        }

        if (mode === 'generate_descriptions') {
            // Batch processing: split tasks into groups, 2 concurrent batches
            var BATCH_SIZE = 30;
            var CONCURRENCY = 2;
            var allDescriptions = {};
            var totalBatches = Math.ceil(tasks.length / BATCH_SIZE);

            console.log('[TestCase-LLMEval] Generating descriptions for:', planKey, 'tasks:', tasks.length, 'batches:', totalBatches, 'concurrency:', CONCURRENCY);

            var descSystemPrompt = '你是一位资深的硬件测试专家，专注于GPU/UCIe/PCIe/HBM/Ethernet高速接口芯片的验证与测试。' +
                '你需要为测试用例补充完善描述：' +
                '1. 如果测试用例没有描述，根据标题生成专业描述，包含测试目的和期望预期。' +
                '2. 如果测试用例已有描述，保留原有内容，在其基础上补充测试目的和期望预期。' +
                '请返回JSON格式：{"descriptions": {"BR200-xxx": "描述1", "BR200-yyy": "描述2"}}' +
                '注意：JSON的key必须是issue key（如BR200-315），不是完整标题。' +
                '返回所有测试用例的描述。使用中文，描述简洁专业。';

            function buildBatchPrompt(b) {
                var batchStart = b * BATCH_SIZE;
                var batchEnd = Math.min(batchStart + BATCH_SIZE, tasks.length);
                var batchTasks = tasks.slice(batchStart, batchEnd);
                var batchTaskList = buildTaskListForBatch(batchTasks, batchStart);

                var batchUserPrompt = 'Test Plan: ' + planKey + ' - ' + planSummary + '\n\n';
                batchUserPrompt += '测试用例列表（共 ' + tasks.length + ' 项，本批 ' + (b + 1) + '/' + totalBatches + '，第 ' + (batchStart + 1) + '-' + batchEnd + ' 项）：\n';
                batchUserPrompt += batchTaskList + '\n\n';
                batchUserPrompt += '请为上面本批测试用例补充测试目的和期望预期。已有描述的保留原内容并补充，没有描述的生成完整描述。';
                return batchUserPrompt;
            }

            async function processBatch(b) {
                var batchStart2 = Date.now();
                var batchUserPrompt = buildBatchPrompt(b);
                console.log('[TestCase-LLMEval] Batch ' + (b + 1) + '/' + totalBatches + ' start');
                var llmContent = await callLLM(descSystemPrompt, batchUserPrompt, 4000);
                var batchTime = ((Date.now() - batchStart2) / 1000).toFixed(1);
                console.log('[TestCase-LLMEval] Batch ' + (b + 1) + '/' + totalBatches + ' done in', batchTime, 's');
                var batchDescs = parseDescriptions(llmContent);
                console.log('[TestCase-LLMEval] Batch ' + (b + 1) + ' parsed:', Object.keys(batchDescs).length, 'descriptions');
                return batchDescs;
            }

            // Process batches with concurrency control
            for (var i = 0; i < totalBatches; i += CONCURRENCY) {
                var batchGroup = [];
                for (var j = i; j < Math.min(i + CONCURRENCY, totalBatches); j++) {
                    batchGroup.push(processBatch(j));
                }
                var groupResults = await Promise.all(batchGroup);
                groupResults.forEach(function(batchDescs) {
                    Object.assign(allDescriptions, batchDescs);
                });
                console.log('[TestCase-LLMEval] Group done, total descriptions so far:', Object.keys(allDescriptions).length);
            }

            var totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('[TestCase-LLMEval] All done in', totalTime, 's, total descriptions:', Object.keys(allDescriptions).length);
            res.json({ success: true, data: { descriptions: allDescriptions, batchCount: totalBatches, concurrency: CONCURRENCY } });
        } else if (body.mode === 'categorize') {
            // Mode: Categorize tasks using LLM (returns categorized description)
            var taskList = tasks.map(function(t, i) {
                var desc = (t.description || '').substring(0, 200);
                return (i + 1) + '. [' + t.key + '] ' + (t.summary || '') + (desc ? ' — ' + desc : ' (无描述)');
            }).join('\n');

            var catSystemPrompt = '你是一位资深的GPGPU芯片硬件测试专家，专注于GPU/UCIe/PCIe/HBM高速接口芯片的验证与测试。' +
                '请根据提供的Test Plan名称和测试用例列表，将测试用例按专业维度分类。' +
                '分类规则：' +
                '首先根据Test Plan名称和sub-task内容判断测试计划的类型（如HBM测试、Ethernet测试、Board测试、FW测试、PCIe测试、KMD测试、Tool测试、BBV测试、IODie测试等），' +
                '然后按照该类型的专业维度对测试用例进行分类。分类必须贴合该领域的实际测试场景。' +
                '例如：HBM测试计划应按HBM专业维度分类；Ethernet测试计划应按以太网专业维度分类；BBV测试计划应按板级验证维度分类。' +
                '没有用例的类别可省略。' +
                '请用JSON格式返回，格式如下：{ "categories": [{ "name": "类别名", "items": [{ "key": "BR200-xxx", "summary": "标题", "description": "简短描述" }] }] }' +
                '保持描述简洁，每条不超过100字。';

            var catUserPrompt = 'Test Plan: ' + planKey + ' - ' + planSummary + '\n\n';
            catUserPrompt += '测试用例列表（共 ' + tasks.length + ' 项）：\n';
            catUserPrompt += taskList;

            console.log('[TestCase-LLMEval] Categorizing plan:', planKey, 'tasks:', tasks.length);
            var catContent = await callLLM(catSystemPrompt, catUserPrompt, 2000);

            // Parse JSON response
            var categorized = null;
            try { categorized = JSON.parse(catContent); } catch (_) {}
            if (!categorized) {
                var stripped = catContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
                try { categorized = JSON.parse(stripped); } catch (_) {}
            }
            if (!categorized) {
                var jsonMatch = catContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) { try { categorized = JSON.parse(jsonMatch[0]); } catch (_) {} }
            }

            if (categorized && categorized.categories) {
                // Build JIRA wiki format description
                var desc = 'h2. Test Summary\n\n';
                desc += planSummary + '，共 ' + tasks.length + ' 项测试用例。\n\n';
                var catIdx = 1;
                categorized.categories.forEach(function(cat) {
                    if (!cat.items || cat.items.length === 0) return;
                    desc += 'h2. ' + catIdx + '. ' + cat.name + ' (' + cat.items.length + '项)\n\n';
                    desc += '||用例||描述||\n';
                    cat.items.forEach(function(item) {
                        var descText = item.description || item.summary || '';
                        if (descText.length > 120) descText = descText.substring(0, 120).replace(/\s+\S*$/, '') + '...';
                        descText = descText.replace(/\|/g, '\\|').replace(/\n/g, ' ');
                        desc += '|' + item.key + ' ' + (item.summary || '') + '|' + descText + '|\n';
                    });
                    desc += '\n';
                    catIdx++;
                });
                res.json({ success: true, data: { description: desc, categories: categorized.categories } });
            } else {
                console.error('[TestCase-LLMEval] Categorize parse failed:', catContent.substring(0, 500));
                res.status(500).json({ success: false, error: 'LLM categorization format error', raw: catContent.substring(0, 500) });
            }
        } else {
            // Mode: Evaluate test plan as hardware testing expert (single call)
            var taskList = tasks.map(function(t, i) {
                var desc = (t.description || '').substring(0, 200);
                return (i + 1) + '. [' + t.key + '] ' + (t.summary || '') + (desc ? ' — ' + desc : ' (无描述)') + ' [' + (t.status || 'N/A') + '] [' + (t.priority || 'N/A') + ']';
            }).join('\n');

            var evalSystemPrompt = '你是一位资深的GPGPU芯片硬件测试专家，专注于GPU/UCIe/PCIe/HBM高速接口芯片的验证与测试。' +
                '你擅长分析测试计划的完整性、覆盖度和风险点。' +
                '请根据提供的Test Plan名称和测试用例列表，给出专业的评估意见。' +
                '\n\n【重要：测试阶段上下文】' +
                '\n芯片验证通常分为以下阶段，每个阶段的测试目标和评估标准不同：' +
                '\n1. BringUp阶段：芯片首次上电，验证基本功能是否可用（时钟、电源、基本通信链路、基本读写等）。此阶段关注"能不能跑起来"，评估标准是基本功能是否通过。' +
                '\n2. Feature Enable阶段：在BringUp基础上，逐步开启和验证各项特性功能（PCIe/GPU/HBM/UCIe等各模块的完整功能）。评估标准是各项特性是否正常工作。' +
                '\n3. FST (Full Speed Test)阶段：全速/全压力测试，验证芯片在满负荷、全速率下的稳定性和性能。评估标准是性能指标和稳定性。' +
                '\n4. PVT (Production Validation Test)阶段：量产验证测试，确认芯片在大批量生产中的一致性和可靠性。评估标准是CPK/良率/一致性。' +
                '\n\n当前这些sub-task属于 *BringUp阶段* 的测试用例。后续还有Feature Enable、FST、PVT等阶段。' +
                '请在评估时注意：' +
                '\n- BringUp阶段的用例应聚焦基本功能验证，不要求Feature Enable/FST/PVT阶段才需要的高级特性测试。' +
                '\n- 评估覆盖度时，只评估BringUp阶段应有的覆盖范围，不要求Feature Enable阶段的内容。' +
                '\n- 风险与建议部分，可以提及后续阶段需要关注的内容，但标注为"后续阶段"。' +
                '\n\n评估内容包括：' +
                '\n1. 分类复盘：检查Test Plan描述中的分类是否准确，每个sub-task是否归入了正确的类别。如果有分类错误，直接给出修正后的正确分类（列出正确的类别名和对应的sub-task）。' +
                '\n2. BringUp阶段测试覆盖度评估：当前BringUp用例覆盖了哪些关键基础测试场景，是否有明显遗漏（仅限BringUp范围内）。' +
                '\n3. 测试重点分析：哪些是核心验证点，优先级是否合理' +
                '\n4. 风险与建议：当前阶段的潜在测试盲区，以及后续阶段（Feature Enable/FST/PVT）需要关注的要点' +
                '\n5. 整体评价：一句话总结当前BringUp阶段测试计划的质量水平' +
                '\n\n分类规则：' +
                '\n首先根据Test Plan名称和sub-task内容判断测试计划的类型（如HBM测试、Ethernet测试、Board测试、FW测试、PCIe测试、KMD测试、Tool测试等），' +
                '然后按照该类型的专业维度对测试用例进行分类。分类必须贴合该领域的实际测试场景，不要生搬硬套其他领域的分类。' +
                '\n例如：HBM测试计划应按HBM专业维度分类（初始化/通道读写/PHY训练/UCIe互联等）；' +
                'Ethernet测试计划应按以太网专业维度分类（PHY/PCS/PMA/链路/协议等）；' +
                'Board测试计划应按板级测试维度分类（外观/时钟/阻抗/电源/接口/复位等）；' +
                'KMD测试计划应按内核驱动维度分类（内存管理/命令处理/计算单元/中断控制/网络通信等）；' +
                'Tool测试计划应按工具维度分类（JTAG/调试/DFT/固件/寄存器等）。' +
                '\n没有用例的类别可省略。' +
                '\n请用中文回答，格式清晰，使用JIRA wiki markup格式（h3. 标题，*加粗*，- 列表等）。' +
                '保持简洁专业，控制在500字以内。';

            // Auto-detect testing phase from Test Plan name
            var planLower = (planSummary || '').toLowerCase();
            var detectedPhase = 'BringUp'; // default
            if (planLower.indexOf('feature enable') !== -1 || planLower.indexOf('feature-enable') !== -1) {
                detectedPhase = 'Feature Enable';
            } else if (planLower.indexOf('fst') !== -1 || planLower.indexOf('full speed') !== -1) {
                detectedPhase = 'FST (Full Speed Test)';
            } else if (planLower.indexOf('pvt') !== -1 || planLower.indexOf('production') !== -1) {
                detectedPhase = 'PVT (Production Validation Test)';
            } else if (planLower.indexOf('bu ') !== -1 || planLower.indexOf('bringup') !== -1 || planLower.indexOf('bring-up') !== -1 || planLower.indexOf('bu_') !== -1) {
                detectedPhase = 'BringUp';
            }

            var evalUserPrompt = 'Test Plan: ' + planKey + ' - ' + planSummary + '\n';
            evalUserPrompt += '【测试阶段】' + detectedPhase + '（后续阶段：Feature Enable → FST → PVT）\n\n';
            evalUserPrompt += '测试用例列表（共 ' + tasks.length + ' 项）：\n';
            evalUserPrompt += taskList;

            // Include existing description for categorization review
            var existingDesc = body.existingDescription || '';
            if (existingDesc) {
                evalUserPrompt += '\n\n--- 当前Test Plan描述（请复盘其中的分类是否准确）---\n';
                evalUserPrompt += existingDesc;
                evalUserPrompt += '\n--- 描述结束 ---\n';
            }

            // Include existing evaluation as context if available
            var existingEval = body.existingEvaluation || '';
            if (existingEval) {
                evalUserPrompt += '\n\n--- 之前的评估（请参考并在其基础上更新，如有新增测试用例请补充到评估中）---\n';
                evalUserPrompt += existingEval;
                evalUserPrompt += '\n--- 之前的评估结束 ---\n';
            }

            console.log('[TestCase-LLMEval] Evaluating plan:', planKey, 'tasks:', tasks.length);

            var llmContent = await callLLM(evalSystemPrompt, evalUserPrompt, 1000);

            var totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log('[TestCase-LLMEval] Completed in', totalTime, 's');
            res.json({ success: true, data: { evaluation: llmContent } });
        }
    } catch (error) {
        console.error('[TestCase-LLMEval] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/testplan/update-descriptions
 * Batch update sub-task descriptions in JIRA
 * Body: { descriptions: { "BR200-xxx": "desc1", "BR200-yyy": "desc2" } }
 */
router.post('/testplan/update-descriptions', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        var descriptions = body.descriptions || {};
        var userPat = req.user.jiraPat || '';

        if (Object.keys(descriptions).length === 0) {
            return res.status(400).json({ success: false, error: 'descriptions为必填项' });
        }

        var keys = Object.keys(descriptions);
        
        // Parallel batch update with concurrency limit of 5
        var results = [];
        var errors = [];
        var batchSize = 5;
        
        for (var i = 0; i < keys.length; i += batchSize) {
            var batch = keys.slice(i, i + batchSize);
            var batchPromises = batch.map(async function(key) {
                var sanitized = sanitizeKey(key);
                var desc = descriptions[key];
                try {
                    await jiraRequest('PUT', '/rest/api/2/issue/' + sanitized, {
                        fields: { description: desc }
                    }, userPat);
                    results.push({ key: sanitized, status: 'ok' });
                    console.log('[TestCase] Updated description for:', sanitized);
                } catch (err) {
                    errors.push({ key: sanitized, error: err.message });
                    console.error('[TestCase] Update description failed for:', sanitized, err.message);
                }
            });
            await Promise.all(batchPromises);
        }

        res.json({
            success: true,
            data: { total: keys.length, ok: results.length, failed: errors.length, errors: errors }
        });
    } catch (error) {
        console.error('[TestCase] Batch update descriptions error:', error.message);
        console.error('[TestCase] Error stack:', error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * GET /api/testcase/search-user?name=XXX
 * Search JIRA users by name
 */
router.get('/search-user', auth.authenticateToken, async function(req, res) {
    try {
        var name = req.query.name || '';
        if (!name) {
            return res.json({ success: true, data: { users: [] } });
        }

        var userPat = req.user.jiraPat || '';
        var searchResult = await jiraRequest('GET', '/rest/api/2/user/search?username=' + encodeURIComponent(name), null, userPat);
        
        var users = (searchResult || []).map(function(u) {
            return {
                name: u.name,
                displayName: u.displayName || '',
                emailAddress: u.emailAddress || ''
            };
        });

        // If search returns results, try to find best match
        var bestMatch = null;
        if (users.length > 0) {
            var searchWords = name.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 1; });
            for (var i = 0; i < users.length; i++) {
                var displayName = users[i].displayName.toLowerCase();
                if (searchWords.length === 0) {
                    bestMatch = users[i];
                    break;
                }
                var allWordsMatch = searchWords.every(function(w) { return displayName.indexOf(w) !== -1; });
                if (allWordsMatch) {
                    bestMatch = users[i];
                    break;
                }
            }
            if (!bestMatch && users.length > 0) {
                bestMatch = users[0];
            }
        }

        res.json({ success: true, data: { users: users, bestMatch: bestMatch } });
    } catch (error) {
        console.error('[TestCase] Search user error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
/**
 * POST /api/testcase/ai-generate
 * Natural language command -> JIRA issue creation
 */
router.post('/ai-generate', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        var project = sanitizeKey(body.project);
        var parentKey = body.parentKey || '';
        var parentSummary = body.parentSummary || '';
        var command = body.command || '';

        if (!project || !command) {
            return res.status(400).json({ success: false, error: 'project and command required' });
        }

        var cfg = require('../lib/jiraConfig');
        var API_KEY = process.env['LLM_API_KEY'] || process.env['BAILIAN_API_KEY'] || '';
        var BASE_URL = cfg.llmBaseUrl || process.env.LLM_BASE_URL || process.env.BAILIAN_BASE_URL || 'https://aiapiidc.birentech.com/v1';
        var MODEL = cfg.llmModel || process.env.LLM_MODEL || process.env.BAILIAN_MODEL || 'br-qwen3';

        if (!API_KEY) {
            return res.status(500).json({ success: false, error: 'LLM API not configured' });
        }

        var systemPrompt = 'You are a JIRA test management assistant. Parse natural language into JIRA issue creation. Rules: 1) Sub test plan -> issuetype Test Plan, MUST include parentKey field with the parent Test Plan key, priority Highest 2) Test case/sub-task -> issuetype Sub-task, MUST include parentKey, priority Highest 3) Top-level test plan -> issuetype Test Plan, priority Highest 4) Count as specified 5) Each has summary+description 6) Default priority Highest unless specified 7) If user mentions assignee (负责人), include assignee field with JIRA username. 8) If user mentions component (组件), include components field. Available issue types: Test Plan, Task, Sub-task. Return: { "actions": [{ "action": "create", "summary": "title", "description": "desc", "issuetype": "Test Plan or Sub-task", "priority": "Highest", "labels": "", "assignee": "", "components": "", "parentKey": "" }] }';

        var userPrompt = 'Project: ' + project + '\n';
        if (parentKey) userPrompt += 'Current Test Plan: ' + parentKey + ' - ' + parentSummary + '\n';
        userPrompt += '\nUser command: ' + command;

        var cleanUrl = BASE_URL.replace(/\/+$/, '');
        var apiUrl = cleanUrl + '/chat/completions';

        console.log('[TestCase-AI] Calling LLM:', MODEL);

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 4000
            }),
            signal: AbortSignal.timeout(300000)
        });

        var data = await response.text();
        var json = JSON.parse(data);

        if (json.error) {
            return res.status(500).json({ success: false, error: json.error.message || 'LLM API error' });
        }

        var llmContent = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
        if (!llmContent) {
            return res.status(500).json({ success: false, error: 'LLM returned empty' });
        }

        var parsed = null;
        try { parsed = JSON.parse(llmContent); } catch (_) {}
        if (!parsed) {
            var stripped = llmContent.replace(/^```(?:json)?\\s*/i, '').replace(/```\\s*$/i, '').trim();
            try { parsed = JSON.parse(stripped); } catch (_) {}
        }
        if (!parsed) {
            var match = llmContent.match(/\{[\s\S]*\}/);
            if (match) { try { parsed = JSON.parse(match[0]); } catch (_) {} }
        }

        if (!parsed || !parsed.actions || !Array.isArray(parsed.actions)) {
            console.error('[TestCase-AI] JSON parse failed:', llmContent.substring(0, 500));
            return res.status(500).json({ success: false, error: 'LLM format error', raw: llmContent.substring(0, 500) });
        }

        var actions = parsed.actions.map(function(action) {
            return {
                action: action.action || 'create',
                summary: action.summary || '',
                description: action.description || '',
                priority: action.priority || 'Highest',
                labels: action.labels || '',
                issuetype: action.issuetype || 'Sub-task',
                parentKey: action.parentKey || parentKey,
                assignee: action.assignee || '',
                components: action.components || ''
            };
        });

        console.log('[TestCase-AI] Parsed', actions.length, 'actions');
        res.json({ success: true, data: { actions: actions } });
    } catch (error) {
        console.error('[TestCase-AI] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/testcase/batch-update-dates
 * Batch update Actual Start Date and Actual End Date for multiple issues
 * Body: { keys: ["BR200-130", ...], actualStartDate: "2026-06-23", actualEndDate: "2026-06-25" }
 */
router.post('/batch-update-dates', auth.authenticateToken, async function(req, res) {
    try {
        var body = req.body;
        var keys = body.keys || [];
        var startDate = body.actualStartDate || null;
        var endDate = body.actualEndDate || null;
        var userPat = req.user.jiraPat || '';

        if (keys.length === 0) {
            return res.status(400).json({ success: false, error: 'keys为必填项' });
        }

        if (!startDate && !endDate) {
            return res.status(400).json({ success: false, error: '请至少提供一个日期' });
        }

        var fields = {};
        if (startDate) fields.customfield_10303 = startDate;  // Actual Start Date
        if (endDate) fields.customfield_10302 = endDate;      // Actual End Date

        var results = [];
        var errors = [];
        var batchSize = 5;

        for (var i = 0; i < keys.length; i += batchSize) {
            var batch = keys.slice(i, i + batchSize);
            var batchPromises = batch.map(async function(key) {
                var sanitized = sanitizeKey(key);
                try {
                    await jiraRequest('PUT', '/rest/api/2/issue/' + sanitized, {
                        fields: fields
                    }, userPat);
                    results.push({ key: sanitized, status: 'ok' });
                    console.log('[TestCase] Updated dates for:', sanitized);
                } catch (err) {
                    errors.push({ key: sanitized, error: err.message });
                    console.error('[TestCase] Update dates failed for:', sanitized, err.message);
                }
            });
            await Promise.all(batchPromises);
        }

        res.json({
            success: true,
            data: { total: keys.length, ok: results.length, failed: errors.length, errors: errors }
        });
    } catch (error) {
        console.error('[TestCase] Batch update dates error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


/**
 * GET /api/testcase/search-user?name=XXX
 * Search JIRA users by name
 */
router.get('/search-user', auth.authenticateToken, async function(req, res) {
    try {
        var name = req.query.name || '';
        if (!name) {
            return res.json({ success: true, data: { users: [] } });
        }

        var userPat = req.user.jiraPat || '';
        var searchResult = await jiraRequest('GET', '/rest/api/2/user/search?username=' + encodeURIComponent(name), null, userPat);
        
        var users = (searchResult || []).map(function(u) {
            return {
                name: u.name,
                displayName: u.displayName || '',
                emailAddress: u.emailAddress || ''
            };
        });

        // If search returns results, try to find best match
        var bestMatch = null;
        if (users.length > 0) {
            var searchWords = name.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 1; });
            for (var i = 0; i < users.length; i++) {
                var displayName = users[i].displayName.toLowerCase();
                if (searchWords.length === 0) {
                    bestMatch = users[i];
                    break;
                }
                var allWordsMatch = searchWords.every(function(w) { return displayName.indexOf(w) !== -1; });
                if (allWordsMatch) {
                    bestMatch = users[i];
                    break;
                }
            }
            if (!bestMatch && users.length > 0) {
                bestMatch = users[0];
            }
        }

        res.json({ success: true, data: { users: users, bestMatch: bestMatch } });
    } catch (error) {
        console.error('[TestCase] Search user error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

