// JIRA Test Case Management — Frontend Logic
// Step 1: Select project → Step 2: Select Task/Test Plan → Step 3: KPI + Detail

// ============ Chart.js Pie Label Plugin ============
var pieLabelPlugin = {
    id: 'pieLabel',
    afterDatasetsDraw: function(chart) {
        if (chart.config.type !== 'pie' && chart.config.type !== 'doughnut') return;
        var ctx = chart.ctx;
        var dataset = chart.data.datasets[0];
        var labels = chart.data.labels;
        var meta = chart.getDatasetMeta(0);
        var total = dataset.data.reduce(function(a, b) { return a + b; }, 0);
        if (total === 0) return;
        var centerX = meta.data[0].x;
        var centerY = meta.data[0].y;
        var outerRadius = meta.data[0].outerRadius;
        var innerRadius = meta.data[0].innerRadius || 0;
        ctx.save();
        meta.data.forEach(function(arc, i) {
            var value = dataset.data[i];
            var pct = Math.round((value / total) * 100);
            if (pct < 1) return;
            var label = labels[i] || '';
            var color = dataset.backgroundColor[i];
            var textColor = isLightColor(color) ? '#333' : '#fff';
            var angle = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
            var ringWidth = outerRadius - innerRadius;
            var labelR = innerRadius + ringWidth * 0.5;
            var labelX = centerX + Math.cos(angle) * labelR;
            var labelY = centerY + Math.sin(angle) * labelR;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var nameSize = Math.max(9, Math.min(12, ringWidth * 0.22));
            ctx.font = 'bold ' + nameSize + 'px sans-serif';
            ctx.fillStyle = textColor;
            ctx.fillText(label, labelX, labelY - nameSize * 0.55);
            var pctSize = Math.max(9, Math.min(11, ringWidth * 0.20));
            ctx.font = 'bold ' + pctSize + 'px sans-serif';
            ctx.fillText(pct + '%', labelX, labelY + pctSize * 0.6);
        });
        ctx.restore();
    }
};

function isLightColor(color) {
    var r = 0, g = 0, b = 0;
    if (color && color.startsWith('#')) {
        var hex = color.slice(1);
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
}

if (typeof Chart !== 'undefined') { Chart.register(pieLabelPlugin); }

// ============ Chart.js Bar Label Plugin ============
var barLabelPlugin = {
    id: 'barLabel',
    afterDatasetsDraw: function(chart) {
        if (chart.config.type !== 'bar') return;
        var ctx = chart.ctx;
        ctx.save();
        chart.data.datasets.forEach(function(dataset, di) {
            var meta = chart.getDatasetMeta(di);
            meta.data.forEach(function(bar, i) {
                var value = dataset.data[i];
                if (!value) return;
                var barHeight = bar.y - bar.base;
                if (barHeight < 8) return;
                ctx.fillStyle = di === 0 ? '#fff' : '#555';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(value, bar.x, bar.base + barHeight / 2);
            });
        });
        ctx.restore();
    }
};
if (typeof Chart !== 'undefined') { Chart.register(barLabelPlugin); }

var authToken = localStorage.getItem('testcaseAuthToken') || '';
var currentUserRole = localStorage.getItem('testcaseUserRole') || '';
var currentUserName = localStorage.getItem('testcaseUserName') || '';
var parsedData = [];
var headers = [];
var uploadResults = [];
var currentPlans = [];
var selectedPlanKey = '';

// ============ Auth ============

function checkAuth() {
    if (!authToken) {
        document.getElementById('login-overlay').style.display = 'flex';
        return;
    }
    fetch('/api/auth/verify', {
        credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + authToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.user) {
            document.getElementById('login-overlay').style.display = 'none';
            currentUserRole = data.user.role || '';
            currentUserName = data.user.name || data.user.username || '';
            localStorage.setItem('testcaseUserRole', currentUserRole);
            localStorage.setItem('testcaseUserName', currentUserName);
            updateHeaderUI();
            loadProjects();
        } else {
            authToken = '';
            localStorage.removeItem('testcaseAuthToken');
            localStorage.removeItem('testcaseUserRole');
            localStorage.removeItem('testcaseUserName');
            document.getElementById('login-overlay').style.display = 'flex';
            document.getElementById('btn-logout').style.display = 'none';
            document.getElementById('btn-profile').style.display = 'none';
        }
    })
    .catch(function() {
        document.getElementById('login-overlay').style.display = 'flex';
    });
}

function doLogin() {
    var user = document.getElementById('login-user').value.trim();
    var pass = document.getElementById('login-pass').value;
    if (!user || !pass) { showLoginError('请输入用户名和密码'); return; }
    var loginBtn = document.querySelector('.login-box button');
    if (loginBtn) loginBtn.textContent = '登录中...';

    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: user, password: pass })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (loginBtn) loginBtn.textContent = '登录';
        if (data.success && data.token) {
            authToken = data.token;
            currentUserRole = data.user ? data.user.role : '';
            currentUserName = data.user ? (data.user.name || data.user.username) : '';
            localStorage.setItem('testcaseAuthToken', authToken);
            localStorage.setItem('testcaseUserRole', currentUserRole);
            localStorage.setItem('testcaseUserName', currentUserName);
            document.getElementById('login-overlay').style.display = 'none';
            updateHeaderUI();
            loadProjects();
        } else {
            showLoginError(data.message || data.error || '登录失败');
        }
    })
    .catch(function(e) {
        if (loginBtn) loginBtn.textContent = '登录';
        showLoginError('网络错误: ' + e.message);
    });
}

function showLoginError(msg) {
    var el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function doLogout() {
    authToken = '';
    currentUserRole = '';
    currentUserName = '';
    localStorage.removeItem('testcaseAuthToken');
    localStorage.removeItem('testcaseUserRole');
    localStorage.removeItem('testcaseUserName');
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('btn-logout').style.display = 'none';
    document.getElementById('header-user-info').style.display = 'none';
    document.getElementById('btn-admin-users').style.display = 'none';
    document.getElementById('btn-profile').style.display = 'none';
}

document.getElementById('login-pass').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
});

// ============ Tab Switching ============

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
        btn.classList.toggle('active', (tab === 'browse' && i === 0) || (tab === 'upload' && i === 1));
    });
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
}

// ============ Header UI & User Management ============

function updateHeaderUI() {
    var infoEl = document.getElementById('header-user-info');
    var nameEl = document.getElementById('header-username');
    var roleEl = document.getElementById('header-role-badge');
    var logoutEl = document.getElementById('btn-logout');
    var adminBtn = document.getElementById('btn-admin-users');
    var profileBtn = document.getElementById('btn-profile');

    if (currentUserName) {
        nameEl.textContent = currentUserName;
        infoEl.style.display = 'inline';
    }
    if (currentUserRole === 'admin') {
        roleEl.textContent = '管理员';
        roleEl.style.background = '#fef3e0';
        roleEl.style.color = '#e65100';
        adminBtn.style.display = 'inline-flex';
    } else {
        roleEl.textContent = '用户';
        roleEl.style.background = '#e8f5e9';
        roleEl.style.color = '#27ae60';
        adminBtn.style.display = 'none';
    }
    profileBtn.style.display = 'inline-flex';
    logoutEl.style.display = 'inline-block';
}

function showUserModal() {
    document.getElementById('user-modal').style.display = 'flex';
    loadUserList();
}

function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
}

function loadUserList() {
    fetch('/api/auth/users', {
        credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + authToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        var container = document.getElementById('user-list');
        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#999; padding:16px;">暂无用户</div>';
            return;
        }
        var html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
        html += '<tr style="background:#f8f9fa;"><th style="padding:8px; text-align:left; border-bottom:1px solid #eee;">用户名</th><th style="padding:8px; text-align:left; border-bottom:1px solid #eee;">姓名</th><th style="padding:8px; text-align:left; border-bottom:1px solid #eee;">角色</th><th style="padding:8px; text-align:center; border-bottom:1px solid #eee;">操作</th></tr>';
        data.data.forEach(function(u) {
            var roleBadge = u.role === 'admin' ?
                '<span style="background:#fef3e0; color:#e65100; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:600;">管理员</span>' :
                '<span style="background:#e8f5e9; color:#27ae60; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:600;">用户</span>';
            html += '<tr>';
            html += '<td style="padding:8px; border-bottom:1px solid #f0f0f0;">' + escapeHtml(u.username) + '</td>';
            html += '<td style="padding:8px; border-bottom:1px solid #f0f0f0;">' + escapeHtml(u.name) + '</td>';
            html += '<td style="padding:8px; border-bottom:1px solid #f0f0f0;">' + roleBadge + '</td>';
            html += '<td style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:center;">';
            if (u.username !== 'admin') {
                html += '<button class="btn btn-sm" style="background:#e74c3c; color:#fff; padding:3px 8px; font-size:11px;" onclick="deleteUser(\'' + u.id + '\', \'' + escapeHtml(u.username) + '\')">删除</button>';
            }
            html += '</td></tr>';
        });
        html += '</table>';
        container.innerHTML = html;
    });
}

function addUser() {
    var username = document.getElementById('new-username').value.trim();
    var name = document.getElementById('new-name').value.trim();
    var password = document.getElementById('new-password').value;
    var role = document.getElementById('new-role').value;

    if (!username || !name || !password) {
        alert('请填写用户名、姓名和密码');
        return;
    }

    fetch('/api/auth/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
        },
        credentials: 'same-origin',
        body: JSON.stringify({ username: username, name: name, password: password, role: role })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            alert('✅ 用户添加成功: ' + username);
            document.getElementById('new-username').value = '';
            document.getElementById('new-name').value = '';
            document.getElementById('new-password').value = '';
            loadUserList();
        } else {
            alert('❌ ' + (data.message || data.error || '添加失败'));
        }
    });
}

function deleteUser(id, username) {
    if (!confirm('确定要删除用户 ' + username + ' 吗？')) return;
    fetch('/api/auth/users/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken },
        credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            alert('✅ 用户已删除');
            loadUserList();
        } else {
            alert('❌ ' + (data.message || data.error || '删除失败'));
        }
    });
}

// ============ JIRA Profile Settings ============

function showProfileModal() {
    document.getElementById('profile-modal').style.display = 'flex';
    loadProfile();
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

function loadProfile() {
    fetch('/api/auth/profile', {
        credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + authToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            document.getElementById('profile-jira-name').value = data.data.jiraName || '';
            document.getElementById('profile-pat-status').textContent = data.data.jiraPat ? '✅ PAT 已设置' : '⚠️ 未设置 PAT';
            document.getElementById('profile-pat-status').style.color = data.data.jiraPat ? '#27ae60' : '#e65100';
        }
    });
}

function saveProfile() {
    var pat = document.getElementById('profile-jira-pat').value.trim();
    var jiraName = document.getElementById('profile-jira-name').value.trim();

    if (!jiraName) {
        alert('请填写 JIRA 用户名');
        return;
    }

    var body = { jiraName: jiraName };
    if (pat) {
        body.jiraPat = pat;
    }

    fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
        },
        credentials: 'same-origin',
        body: JSON.stringify(body)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            alert('✅ JIRA 设置已保存');
            document.getElementById('profile-jira-pat').value = '';
            loadProfile();
        } else {
            alert('❌ ' + (data.message || data.error || '保存失败'));
        }
    });
}

// ============ Projects ============

function loadProjects() {
    fetch('/api/testcase/projects', {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            ['browse-project', 'tc-project'].forEach(function(id) {
                var sel = document.getElementById(id);
                sel.innerHTML = '<option value="">-- 选择项目 --</option>';
                data.data.forEach(function(p) {
                    var opt = document.createElement('option');
                    opt.value = p.key;
                    opt.textContent = p.key + ' — ' + p.name;
                    sel.appendChild(opt);
                });
            });
        }
    })
    .catch(function(e) {
        console.error('Load projects failed:', e);
    });
}

// ============ Step 1-2: Load Parents (Task + Test Plan) ============

var allParents = [];

function onProjectChange() {
    var project = document.getElementById('browse-project').value;
    document.getElementById('parent-section').style.display = 'none';
    document.getElementById('detail-section').style.display = 'none';
    document.getElementById('parent-status-bar').style.display = 'none';
    if (project) loadParents();
}

function backToProject() {
    document.getElementById('project-section').style.display = '';
    document.getElementById('parent-section').style.display = 'none';
    document.getElementById('detail-section').style.display = 'none';
    document.getElementById('parent-status-bar').style.display = 'none';
    document.getElementById('breadcrumb-bar').style.display = 'none';
    selectedParent = null;
}

function backToParentList() {
    document.getElementById('detail-section').style.display = 'none';
    document.getElementById('parent-section').style.display = 'block';
    // Hide regenerate description button
    document.getElementById('regen-desc-section').style.display = 'none';
    // Update breadcrumb: show project only
    var bcParent = document.getElementById('bc-parent');
    var bcStatus = document.getElementById('bc-status');
    var bcBackParent = document.getElementById('bc-back-parent');
    bcParent.style.display = 'none';
    bcStatus.style.display = 'none';
    bcBackParent.style.display = 'none';
    selectedParent = null;
}

function showBreadcrumb(project, parentKey, parentSummary, parentStatus) {
    var bar = document.getElementById('breadcrumb-bar');
    var bcProject = document.getElementById('bc-project');
    var bcParent = document.getElementById('bc-parent');
    var bcStatus = document.getElementById('bc-status');
    var bcBackParent = document.getElementById('bc-back-parent');
    var bcBackProject = document.getElementById('bc-back-project');

    bar.style.display = '';
    document.getElementById('project-section').style.display = 'none';
    bcBackProject.style.display = '';

    if (parentKey) {
        var jiraBase = 'https://jira01.birentech.com/browse/';
        bcParent.innerHTML = (parentKey ? '<a href="' + jiraBase + parentKey + '" target="_blank" style="color:#1a73e8; text-decoration:none; border-bottom:1px dashed #1a73e8;">' + parentKey + '</a> ' : '') + (parentSummary || '').replace(/</g, '&lt;');
        bcParent.style.display = '';
        bcBackParent.style.display = '';

        // Show status badge
        var st = (parentStatus || '').toLowerCase();
        bcStatus.style.display = '';
        if (st === 'closed' || st === 'validated') {
            bcStatus.textContent = '已完成';
            bcStatus.style.background = '#d1fae5';
            bcStatus.style.color = '#059669';
        } else {
            bcStatus.textContent = '进行中';
            bcStatus.style.background = '#dbeafe';
            bcStatus.style.color = '#2563eb';
        }
    } else {
        bcParent.style.display = 'none';
        bcStatus.style.display = 'none';
        bcBackParent.style.display = 'none';
    }
}

function loadParents() {
    var project = document.getElementById('browse-project').value;
    if (!project) return;

    document.getElementById('parent-section').style.display = 'block';
    document.getElementById('parent-grid').innerHTML = '<div class="loading">加载中...</div>';

    // Show breadcrumb with project
    showBreadcrumb(project);

    // Fetch both Task and Test Plan
    fetch('/api/testcase/search?project=' + encodeURIComponent(project) + '&issuetype=Task,Test+Plan&maxResults=100', {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            allParents = data.data.issues || [];
            document.getElementById('parent-count').textContent = allParents.length + ' 个';
            renderParentGrid(allParents);
        }
    })
    .catch(function(e) {
        document.getElementById('parent-grid').innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>';
    });
}

function renderParentGrid(parents) {
    var grid = document.getElementById('parent-grid');
    if (parents.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>没有找到 Task 或 Test Plan</p></div>';
        return;
    }

    var html = '';
    parents.forEach(function(p) {
        var typeClass = p.issuetype === 'Test Plan' ? 'pc-type-testplan' : 'pc-type-task';
        html += '<div class="parent-card" data-key="' + p.key + '" onclick="selectParent(\'' + p.key + '\')">';
        html += '<div class="pc-header">';
        html += '<span class="pc-key"><a href="' + p.url + '" target="_blank" onclick="event.stopPropagation()">' + p.key + '</a></span>';
        html += '<span class="pc-type ' + typeClass + '">' + p.issuetype + '</span>';
        html += getStatusBadge(p.status);
        html += '</div>';
        html += '<div class="pc-title">' + escapeHtml(p.summary) + '</div>';
        html += '<div class="pc-meta">' + (p.assignee || '未分配') + ' · ' + formatDate(p.created) + '</div>';
        html += '</div>';
    });
    grid.innerHTML = html;
}

function filterParents() {
    var q = document.getElementById('parent-search').value.toLowerCase();
    if (!q) { renderParentGrid(allParents); return; }
    var filtered = allParents.filter(function(p) {
        return p.key.toLowerCase().indexOf(q) >= 0 || p.summary.toLowerCase().indexOf(q) >= 0;
    });
    renderParentGrid(filtered);
}

// ============ Step 3: Select Parent → Load KPI + Detail ============

var selectedParent = null;
var subtasks = [];
var linkedPlans = [];

function selectParent(key) {
    document.querySelectorAll('.parent-card').forEach(function(c) {
        c.classList.toggle('selected', c.getAttribute('data-key') === key);
    });

    selectedParent = allParents.find(function(p) { return p.key === key; });
    if (!selectedParent) return;

    // Hide Step 2, show Step 3
    document.getElementById('parent-section').style.display = 'none';
    document.getElementById('detail-section').style.display = 'block';

    // Show regenerate description button
    document.getElementById('regen-desc-section').style.display = 'block';
    document.getElementById('regen-desc-status').textContent = '';

    // Update breadcrumb with parent info
    var project = document.getElementById('browse-project').value;
    showBreadcrumb(project, selectedParent.key, selectedParent.summary, selectedParent.status);
    document.getElementById('detail-thead').innerHTML = '<tr><th>加载中...</th></tr>';
    document.getElementById('detail-tbody').innerHTML = '';
    document.getElementById('kpi-total').textContent = '...';
    document.getElementById('dist-row').innerHTML = '';
    linkedPlans = [];

    // Step 1: Fetch issue details (links)
    fetch('/api/testcase/issue/' + key, {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data.success || !data.data) throw new Error(data.error || '加载失败');
        var issue = data.data;

        // Find linked Test Plans
        linkedPlans = (issue.links || []).filter(function(l) {
            return l.issuetype === 'Test Plan' || l.issuetype === 'Task';
        });

        // Step 2: Fetch direct sub-tasks
        var project = document.getElementById('browse-project').value;
        return fetch('/api/testcase/search?project=' + encodeURIComponent(project) + '&issuetype=Sub-task&parent=' + key + '&maxResults=200', {
            credentials: 'same-origin',
            headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
        });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        subtasks = (data.success && data.data) ? (data.data.issues || []) : [];

        // Step 3: Fetch sub-tasks for each linked plan
        var fetches = linkedPlans.map(function(lp) {
            var project = document.getElementById('browse-project').value;
            return fetch('/api/testcase/search?project=' + encodeURIComponent(project) + '&issuetype=Sub-task&parent=' + lp.key + '&maxResults=200', {
                credentials: 'same-origin',
                headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
            })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                lp.subtasks = (d.success && d.data) ? (d.data.issues || []) : [];
            });
        });

        return Promise.all(fetches);
    })
    .then(function() {
        // Merge all sub-tasks
        var allSubtasks = subtasks.slice();
        linkedPlans.forEach(function(lp) {
            lp.subtasks.forEach(function(st) { allSubtasks.push(st); });
        });

        renderLinkedPlans(linkedPlans);
        renderKPI(allSubtasks);
        renderDistributions(allSubtasks);
        initPendingPieCharts();
        renderDetailTable(allSubtasks);
    })
    .catch(function(e) {
        document.getElementById('detail-section').innerHTML = '<div class="empty-state"><p>加载失败: ' + e.message + '</p></div>';
    });
}

function renderLinkedPlans(plans) {
    // Remove old linked plans section if exists
    var oldSection = document.getElementById('linked-plans-section');
    if (oldSection) oldSection.remove();
    if (plans.length === 0) return;
    var html = '<div class="card" style="margin-bottom:16px; padding:14px; background:#f8f9fa;">';
    html += '<div style="font-size:13px; color:#555; font-weight:600; margin-bottom:8px;">📎 关联的 Sub-Test Plans</div>';
    plans.forEach(function(lp) {
        var typeClass = lp.issuetype === 'Test Plan' ? 'pc-type-testplan' : 'pc-type-task';
        html += '<div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #eee;">';
        html += '<a href="https://jira01.birentech.com/browse/' + lp.key + '" target="_blank" style="font-weight:600; color:#3498db; text-decoration:none;">' + lp.key + '</a>';
        html += '<span class="pc-type ' + typeClass + '" style="font-size:10px;">' + lp.issuetype + '</span>';
        html += '<span style="font-size:13px; color:#333; flex:1;">' + escapeHtml(lp.summary) + '</span>';
        html += '<span style="font-size:12px; color:#666;">' + lp.status + '</span>';
        html += '<span style="font-size:12px; color:#27ae60; font-weight:600;">' + (lp.subtasks ? lp.subtasks.length : 0) + ' cases</span>';
        html += '</div>';
    });
    html += '</div>';
    var wrapper = document.createElement('div'); wrapper.id = 'linked-plans-section'; wrapper.innerHTML = html.substring(html.indexOf('<div'));
    document.getElementById('detail-section').insertAdjacentElement('afterbegin', wrapper);
}

// ============ KPI Rendering ============

function renderKPI(issues) {
    var total = issues.length;
    var statusCount = {};
    var priorityCount = {};
    issues.forEach(function(i) {
        var s = normalizeStatus(i.status);
        statusCount[s] = (statusCount[s] || 0) + 1;
        var p = i.priority || 'Unknown';
        priorityCount[p] = (priorityCount[p] || 0) + 1;
    });

    var done = (statusCount['done'] || 0) + (statusCount['closed'] || 0);
    var validated = statusCount['validated'] || 0;
    var inProgress = statusCount['inprogress'] || 0;
    var todo = (statusCount['todo'] || 0) + (statusCount['open'] || 0);
    var blocked = statusCount['blocked'] || 0;
    var waived = statusCount['waived'] || 0;
    var completionRate = total > 0 ? Math.round((done + validated) / total * 100) : 0;
    var highPriority = priorityCount['Highest'] || 0;
    // Highest priority completion rate
    var highPriorityDone = 0;
    issues.forEach(function(i) {
        var p = (i.priority || '').toLowerCase();
        if (p === 'highest') {
            var ns = normalizeStatus(i.status);
            if (ns === 'done' || ns === 'closed' || ns === 'validated') highPriorityDone++;
        }
    });
    var highPriorityRate = highPriority > 0 ? Math.round(highPriorityDone / highPriority * 100) : 0;

    animateNumber('kpi-total', total);
    animateNumber('kpi-done', completionRate, '%');
    animateNumber('kpi-progress', highPriorityRate, '%');
    animateNumber('kpi-todo', done + validated);
    animateNumber('kpi-high', highPriority);
    animateNumber('kpi-blocked', blocked);

    // Check if all subtasks are validated → show completion banner
    var banner = document.getElementById('completion-banner');
    var bannerText = document.getElementById('completion-text');
    if (total > 0 && validated === total) {
        var parentName = selectedParent ? (selectedParent.summary || selectedParent.key) : '';
        var parentKey = selectedParent ? selectedParent.key : '';
        bannerText.textContent = parentKey + ' ' + parentName + ' 执行完成 ✅';
        banner.style.display = 'flex';
        // Update breadcrumb status to "已完成"
        var bcStatus = document.getElementById('bc-status');
        if (bcStatus) {
            bcStatus.textContent = '已完成';
            bcStatus.style.background = '#d1fae5';
            bcStatus.style.color = '#059669';
        }
    } else {
        banner.style.display = 'none';
    }
}

function animateNumber(elementId, target, suffix) {
    suffix = suffix || '';
    var el = document.getElementById(elementId);
    if (!el) return;
    var current = 0;
    var step = Math.max(1, Math.floor(target / 20));
    var interval = setInterval(function() {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(interval);
        }
        el.textContent = current + suffix;
    }, 30);
}

function normalizeStatus(status) {
    if (!status) return 'other';
    var s = status.toLowerCase();
    if (s === 'to do' || s === 'open' || s === 'new' || s === 'opened') return 'todo';
    if (s === 'in progress' || s === 'in review' || s === 'reopened' || s === '进行中') return 'inprogress';
    if (s === 'done' || s === 'resolved') return 'done';
    if (s === 'validated') return 'validated';
    if (s === 'closed' || s === 'rejected') return 'closed';
    if (s === 'blocked') return 'blocked';
    if (s === 'waived') return 'waived';
    return 'other';
}

// ============ Distribution Charts ============

function renderDistributions(issues) {
    var statusCount = {};
    var priorityCount = {};
    var statusColorMap = {};

    issues.forEach(function(i) {
        var s = i.status || 'Unknown';
        statusCount[s] = (statusCount[s] || 0) + 1;
        // Map each actual status to its normalized color
        var ns = normalizeStatus(i.status);
        var colorLookup = { 'todo': '#95a5a6', 'inprogress': '#3498db', 'done': '#1abc9c', 'validated': '#27ae60', 'closed': '#6c757d', 'blocked': '#e74c3c', 'waived': '#f39c12', 'other': '#9b59b6' };
        statusColorMap[s] = colorLookup[ns] || '#9b59b6';

        var p = i.priority || 'Unknown';
        priorityCount[p] = (priorityCount[p] || 0) + 1;
    });

    var html = '';

    // 1. Status Pie Chart — use actual JIRA status names with colors
    html += '<div class="chart-card">';
    html += '<h3>📊 状态分布</h3>';
    html += renderPieChart(statusCount, statusColorMap);
    html += '</div>';

    // 2. Components Distribution — vertical bar chart via Chart.js
    html += '<div class="chart-card">';
    html += '<h3>🧩 组件分布</h3>';
    var compData = {};
    issues.forEach(function(i) {
        var comps = i.components || [];
        var keys = comps.length > 0 ? comps : ['未分配'];
        keys.forEach(function(c) {
            if (!compData[c]) compData[c] = { total: 0, done: 0 };
            compData[c].total++;
            var ns = normalizeStatus(i.status);
            if (ns === 'done' || ns === 'closed' || ns === 'validated') compData[c].done++;
        });
    });
    var compSorted = Object.keys(compData).sort(function(a, b) { return compData[b].total - compData[a].total; });
    var compLabels = compSorted;
    var compTotalData = compSorted.map(function(c) { return compData[c].total; });
    var compDoneData = compSorted.map(function(c) { return compData[c].done; });
    var compCanvasId = 'comp-chart-' + (_pieChartCounter++);
    _pendingCompCharts = [{ canvasId: compCanvasId, labels: compLabels, totalData: compTotalData, doneData: compDoneData }];
    html += '<div style="position:relative; height:260px;"><canvas id="' + compCanvasId + '"></canvas></div>';
    html += '</div>';

    document.getElementById('dist-row').innerHTML = html;

    // Daily execution trend: track how many test cases were set to Validated each day
    // Only show dates within the execution period (Actual Start Date to Actual End Date)
    var execStart = selectedParent ? (selectedParent.actualStartDate || '').substring(0, 10) : '';
    var execEnd = selectedParent ? (selectedParent.actualEndDate || '').substring(0, 10) : '';
    
    var validatedDaily = {};
    var totalValidated = 0;
    issues.forEach(function(i) {
        if (i.status === 'Validated') {
            var d = '';
            if (i.updated) {
                d = i.updated.substring(0, 10);
            } else if (i.created) {
                d = i.created.substring(0, 10);
            }
            // Only count if within execution period
            if (d && (!execStart || d >= execStart) && (!execEnd || d <= execEnd)) {
                validatedDaily[d] = (validatedDaily[d] || 0) + 1;
                totalValidated++;
            }
        }
    });
    
    // Generate all dates in execution period for complete x-axis
    var allDates = [];
    if (execStart && execEnd) {
        var current = new Date(execStart);
        var end = new Date(execEnd);
        while (current <= end) {
            allDates.push(current.toISOString().substring(0, 10));
            current.setDate(current.getDate() + 1);
        }
    } else {
        allDates = Object.keys(validatedDaily).sort();
    }
    
    // Fill in dates with 0 if no data
    allDates.forEach(function(d) {
        if (!validatedDaily[d]) validatedDaily[d] = 0;
    });
    var sortedDates = allDates.sort();
    
    // Calculate progress
    var totalIssues = issues.length;
    var progressPercent = totalIssues > 0 ? Math.round((totalValidated / totalIssues) * 100) : 0;
    
    // If no data, show empty state
    if (sortedDates.length === 0) {
        document.getElementById('owner-row').innerHTML = '<div class="chart-card chart-wide"><h3>📈 每日执行趋势</h3><p style="color:#999;text-align:center;">暂无已验证的测试用例</p></div>';
    } else {
        // Aggregate by date (count of test cases validated that day)
        var trendCanvasId = 'trend-chart-' + (_pieChartCounter++);
        var trendHtml = '<div class="chart-card chart-wide">';
        trendHtml += '<h3>📈 每日执行趋势</h3>';
        trendHtml += '<div style="margin-bottom:10px;font-size:13px;color:#666;">已验证: <span style="color:#27ae60;font-weight:bold;">' + totalValidated + '</span> / ' + totalIssues + ' (' + progressPercent + '%)</div>';
        trendHtml += '<div style="position:relative; height:200px;"><canvas id="' + trendCanvasId + '"></canvas></div>';
        trendHtml += '</div>';
        document.getElementById('owner-row').innerHTML = trendHtml;
        // Defer chart creation
        _pendingCompCharts.push({
            canvasId: trendCanvasId,
            isTrend: true,
            labels: sortedDates,
            data: sortedDates.map(function(d) { return validatedDaily[d]; })
        });
    }
}

function inferCategory(summary) {
    var s = summary.toLowerCase();
    if (/性能|throughput|latency|bandwidth|吞吐|延迟/.test(s)) return '性能测试';
    if (/压力|stress|soak|长时间|稳定性/.test(s)) return '压力测试';
    if (/信号|signal|eye|jitter|眼图|抖动|serdes/.test(s)) return '信号测试';
    if (/功耗|power|voltage|电流|电压|热|thermal/.test(s)) return '功耗测试';
    if (/接口|register|mmio|config|配置空间|寄存器|link|lane/.test(s)) return '接口测试';
    if (/功能|feature|enable|支持|disable|reset|link/.test(s)) return '功能测试';
    return '其他';
}

var _pieChartCounter = 0;
var _pendingPieCharts = [];
var _pendingCompCharts = [];

function renderPieChart(countMap, colorMap, displayNames) {
    displayNames = displayNames || {};
    var total = 0;
    var labels = [];
    var data = [];
    var colors = [];

    Object.keys(countMap).forEach(function(k) {
        if (countMap[k] > 0) {
            labels.push(displayNames[k] || k);
            data.push(countMap[k]);
            colors.push(colorMap[k] || '#95a5a6');
            total += countMap[k];
        }
    });

    if (total === 0) return '<div style="text-align:center; color:#999; padding:20px;">无数据</div>';

    var canvasId = 'pie-chart-' + (_pieChartCounter++);
    _pendingPieCharts.push({ canvasId: canvasId, labels: labels, data: data, colors: colors });

    return '<div style="position:relative; height:260px;"><canvas id="' + canvasId + '"></canvas></div>';
}

function initPendingPieCharts() {
    _pendingPieCharts.forEach(function(item) {
        var canvas = document.getElementById(item.canvasId);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: item.labels,
                datasets: [{
                    data: item.data,
                    backgroundColor: item.colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    pieLabel: {},
                    legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 } } }
                }
            }
        });
    });
    _pendingPieCharts = [];

    // Init component bar charts + trend charts
    _pendingCompCharts.forEach(function(item) {
        var canvas = document.getElementById(item.canvasId);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        if (item.isTrend) {
            // Daily execution trend line chart
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: item.labels.map(function(d) { return d.substring(5); }), // MM-DD
                    datasets: [{
                        label: '执行数量',
                        data: item.data,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52,152,219,0.15)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: '#3498db'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        } else {
            // Component stacked bar chart
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: item.labels,
                    datasets: [
                        { label: '已完成', data: item.doneData, backgroundColor: '#27ae60', borderRadius: 4 },
                        { label: '未完成', data: item.totalData.map(function(t, i) { return t - item.doneData[i]; }), backgroundColor: '#ddd', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 } } }
                    }
                }
            });
        }
    });
    _pendingCompCharts = [];
}


// ============ Detail Table ============
// ============ Detail Table with Filter / Sort / Batch ============

var pendingChanges = {};      // { key: transitionId }
var transitionCache = {};     // { key: [{ id, name }] }
var allDetailIssues = [];     // store for re-render
var allSubtasksGlobal = [];   // all subtasks for current parent
var filterState = { status: '', owner: '', search: '', components: '' };
var sortState = { column: '', direction: 'asc' };
var selectedKeys = new Set();

function renderDetailTable(issues) {
    allSubtasksGlobal = issues;
    allDetailIssues = issues;
    pendingChanges = {};
    transitionCache = {};
    selectedKeys.clear();
    updateChangeUI();
    updateBatchBar();

    document.getElementById('detail-count').textContent = issues.length + ' 条';

    // Show filter card and populate dropdowns
    if (issues.length > 0) {
        document.getElementById('filter-card').style.display = '';
        populateFilterDropdowns(issues);
    } else {
        document.getElementById('filter-card').style.display = 'none';
    }

    // Reset filter state
    filterState = { status: '', owner: '', search: '', components: '' };
    sortState = { column: '', direction: 'asc' };
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-owner').value = '';
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-components').value = '';

    applyFilters();
}

function populateFilterDropdowns(issues) {
    var statusCount = {};
    var ownerCount = {};
    var compCount = {};
    issues.forEach(function(i) {
        var s = i.status || 'Unknown';
        statusCount[s] = (statusCount[s] || 0) + 1;
        var owner = i.assignee || '未分配';
        ownerCount[owner] = (ownerCount[owner] || 0) + 1;
        var comps = i.components || [];
        if (comps.length > 0) {
            comps.forEach(function(c) { compCount[c] = (compCount[c] || 0) + 1; });
        } else {
            compCount['未分配'] = (compCount['未分配'] || 0) + 1;
        }
    });

    var statusSel = document.getElementById('filter-status');
    var savedStatus = statusSel.value;
    statusSel.innerHTML = '<option value="">全部状态 (' + issues.length + ')</option>';
    Object.keys(statusCount).sort().forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s + ' (' + statusCount[s] + ')';
        statusSel.appendChild(opt);
    });
    if (savedStatus) statusSel.value = savedStatus;

    var ownerSel = document.getElementById('filter-owner');
    var savedOwner = ownerSel.value;
    ownerSel.innerHTML = '<option value="">全部负责人</option>';
    Object.keys(ownerCount).sort().forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o + ' (' + ownerCount[o] + ')';
        ownerSel.appendChild(opt);
    });
    if (savedOwner) ownerSel.value = savedOwner;

    var compSel = document.getElementById('filter-components');
    var savedComp = compSel.value;
    compSel.innerHTML = '<option value="">\u5168\u90e8\u7ec4\u4ef6</option>';
    Object.keys(compCount).sort().forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c + ' (' + compCount[c] + ')';
        compSel.appendChild(opt);
    });
    if (savedComp) compSel.value = savedComp;
}

function applyFilters() {
    filterState.status = document.getElementById('filter-status').value;
    filterState.owner = document.getElementById('filter-owner').value;
    filterState.search = document.getElementById('filter-search').value.toLowerCase();
    filterState.components = document.getElementById('filter-components').value;

    var filtered = allSubtasksGlobal.filter(function(i) {
        if (filterState.status && i.status !== filterState.status) return false;
        var owner = i.assignee || '未分配';
        if (filterState.owner && owner !== filterState.owner) return false;
        if (filterState.components) {
            var comps = i.components || [];
            if (filterState.components === '\u672a\u5206\u914d') {
                if (comps.length > 0) return false;
            } else {
                if (comps.indexOf(filterState.components) < 0) return false;
            }
        }
        if (filterState.search) {
            var key = (i.key || '').toLowerCase();
            var summary = (i.summary || '').toLowerCase();
            if (key.indexOf(filterState.search) < 0 && summary.indexOf(filterState.search) < 0) return false;
        }
        return true;
    });

    // Apply sort
    if (sortState.column) {
        filtered = sortIssues(filtered, sortState.column, sortState.direction);
    }

    // Show filter count
    var countEl = document.getElementById('filter-count');
    var hasFilter = filterState.status || filterState.owner || filterState.search || filterState.components;
    if (hasFilter) {
        countEl.style.display = '';
        countEl.textContent = '筛选结果: ' + filtered.length + ' / ' + allSubtasksGlobal.length + ' 条';
    } else {
        countEl.style.display = 'none';
    }

    renderDetailTableBody(filtered);
}

function clearFilters() {
    filterState = { status: '', owner: '', search: '', components: '' };
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-owner').value = '';
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-components').value = '';
    applyFilters();
}

function sortIssues(issues, column, direction) {
    var priorityOrder = { 'highest': 0, 'high': 1, 'medium': 2, 'low': 3, 'lowest': 4 };
    return issues.slice().sort(function(a, b) {
        var va, vb;
        switch (column) {
            case 'key':
                va = a.key || ''; vb = b.key || '';
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'summary':
                va = a.summary || ''; vb = b.summary || '';
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'status':
                va = a.status || ''; vb = b.status || '';
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'assignee':
                va = a.assignee || '\uffff'; vb = b.assignee || '\uffff';
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'components':
                va = (a.components || []).join(', '); vb = (b.components || []).join(', ');
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            case 'priority':
                va = priorityOrder[(a.priority || '').toLowerCase()] || 5;
                vb = priorityOrder[(b.priority || '').toLowerCase()] || 5;
                return direction === 'asc' ? va - vb : vb - va;
            case 'created':
                va = a.created || ''; vb = b.created || '';
                return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            default:
                return 0;
        }
    });
}

function onSort(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'asc';
    }
    applyFilters();
}

function renderDetailTableBody(issues) {
    var thead = document.getElementById('detail-thead');
    var columns = [
        { key: 'key', label: 'Key', width: '120px' },
        { key: 'summary', label: '标题', width: '' },
        { key: 'status', label: '状态 (点击修改)', width: '140px' },
        { key: 'assignee', label: '负责人', width: '100px' },
        { key: 'components', label: '组件', width: '100px' },
        { key: 'priority', label: '优先级', width: '80px' },
        { key: 'created', label: '创建时间', width: '140px' }
    ];

    var theadHtml = '<tr><th class="chk-col"><input type="checkbox" id="select-all-cb" onchange="toggleSelectAll(this.checked)" /></th>';
    columns.forEach(function(col) {
        var sortClass = 'sortable';
        var sortIcon = '\u2195';
        if (sortState.column === col.key) {
            sortClass += sortState.direction === 'asc' ? ' sort-asc' : ' sort-desc';
            sortIcon = sortState.direction === 'asc' ? '\u2191' : '\u2193';
        }
        theadHtml += '<th class="' + sortClass + '" style="width:' + col.width + '" onclick="onSort(\'' + col.key + '\')">' + col.label + ' <span class="sort-icon">' + sortIcon + '</span></th>';
    });
    theadHtml += '</tr>';
    thead.innerHTML = theadHtml;

    var tbody = document.getElementById('detail-tbody');
    tbody.innerHTML = '';

    if (issues.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#999;">暂无 Sub-task</td></tr>';
        return;
    }

    var fragment = document.createDocumentFragment();
    issues.forEach(function(issue) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-key', issue.key);
        if (selectedKeys.has(issue.key)) tr.classList.add('selected-row');

        // Checkbox
        var tdChk = document.createElement('td');
        tdChk.className = 'chk-col';
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selectedKeys.has(issue.key);
        chk.setAttribute('data-key', issue.key);
        chk.addEventListener('change', function(e) { toggleSelect(e.target.getAttribute('data-key'), e.target.checked); });
        tdChk.appendChild(chk);
        tr.appendChild(tdChk);

        // Key
        var tdKey = document.createElement('td');
        tdKey.innerHTML = '<a href="' + issue.url + '" target="_blank">' + issue.key + '</a>';
        tr.appendChild(tdKey);

        // Summary
        var tdSummary = document.createElement('td');
        tdSummary.textContent = issue.summary || '';
        tdSummary.title = issue.summary || '';
        tr.appendChild(tdSummary);

        // Status — clickable to edit
        var tdStatus = document.createElement('td');
        tdStatus.className = 'editable-status';
        tdStatus.setAttribute('data-key', issue.key);
        tdStatus.setAttribute('data-original', issue.status || '');
        tdStatus.innerHTML = getStatusBadge(issue.status);
        tdStatus.style.cursor = 'pointer';
        tdStatus.title = '点击修改状态';
        tdStatus.addEventListener('click', onStatusClick);
        tr.appendChild(tdStatus);

        // Assignee
        var tdAssignee = document.createElement('td');
        tdAssignee.textContent = issue.assignee || '-';
        tr.appendChild(tdAssignee);

        // Components
        var tdComp = document.createElement('td');
        var comps = issue.components || [];
        if (comps.length > 0) {
            tdComp.textContent = comps.join(', ');
            tdComp.title = comps.join(', ');
        } else {
            tdComp.textContent = '-';
            tdComp.style.color = '#ccc';
        }
        tr.appendChild(tdComp);

        // Priority
        var tdPriority = document.createElement('td');
        tdPriority.innerHTML = getPriorityHtml(issue.priority);
        tr.appendChild(tdPriority);

        // Created
        var tdCreated = document.createElement('td');
        tdCreated.textContent = formatDate(issue.created);
        tr.appendChild(tdCreated);

        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    // Update select-all checkbox state
    updateSelectAllState();
}

// ============ Batch Select ============

function toggleSelectAll(checked) {
    var filtered = getFilteredIssues();
    if (checked) {
        filtered.forEach(function(i) { selectedKeys.add(i.key); });
    } else {
        selectedKeys.clear();
    }
    updateCheckboxVisuals();
    updateBatchBar();
}

function toggleSelect(key, checked) {
    if (checked) {
        selectedKeys.add(key);
    } else {
        selectedKeys.delete(key);
    }
    var tr = document.querySelector('tr[data-key="' + key + '"]');
    if (tr) tr.classList.toggle('selected-row', checked);
    updateSelectAllState();
    updateBatchBar();
}

function clearSelection() {
    selectedKeys.clear();
    updateCheckboxVisuals();
    updateBatchBar();
}

function updateCheckboxVisuals() {
    document.querySelectorAll('#detail-tbody input[type="checkbox"]').forEach(function(cb) {
        var key = cb.getAttribute('data-key');
        cb.checked = selectedKeys.has(key);
        var tr = cb.closest('tr');
        if (tr) tr.classList.toggle('selected-row', selectedKeys.has(key));
    });
    updateSelectAllState();
}

function updateSelectAllState() {
    var selectAllCb = document.getElementById('select-all-cb');
    if (!selectAllCb) return;
    var filtered = getFilteredIssues();
    if (filtered.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
        return;
    }
    var checkedCount = filtered.filter(function(i) { return selectedKeys.has(i.key); }).length;
    selectAllCb.checked = checkedCount === filtered.length;
    selectAllCb.indeterminate = checkedCount > 0 && checkedCount < filtered.length;
}

function getFilteredIssues() {
    var filtered = allSubtasksGlobal.filter(function(i) {
        if (filterState.status && i.status !== filterState.status) return false;
        var owner = i.assignee || '未分配';
        if (filterState.owner && owner !== filterState.owner) return false;
        if (filterState.components) {
            var comps = i.components || [];
            if (filterState.components === '\u672a\u5206\u914d') {
                if (comps.length > 0) return false;
            } else {
                if (comps.indexOf(filterState.components) < 0) return false;
            }
        }
        if (filterState.search) {
            var key = (i.key || '').toLowerCase();
            var summary = (i.summary || '').toLowerCase();
            if (key.indexOf(filterState.search) < 0 && summary.indexOf(filterState.search) < 0) return false;
        }
        return true;
    });
    if (sortState.column) {
        filtered = sortIssues(filtered, sortState.column, sortState.direction);
    }
    return filtered;
}

function updateBatchBar() {
    var bar = document.getElementById('batch-bar');
    var countEl = document.getElementById('batch-count');
    var statusSel = document.getElementById('batch-status-select');
    var count = selectedKeys.size;

    if (count === 0) {
        bar.classList.remove('visible');
        return;
    }

    bar.classList.add('visible');
    countEl.textContent = '已选择 ' + count + ' 项';

    // Collect common transitions from cached data
    var commonTransitions = null;
    selectedKeys.forEach(function(key) {
        var transitions = transitionCache[key];
        if (!transitions) return;
        if (!commonTransitions) {
            commonTransitions = transitions.map(function(t) { return { id: t.id, name: t.name }; });
        } else {
            commonTransitions = commonTransitions.filter(function(ct) {
                return transitions.some(function(t) { return t.id === ct.id && t.name === ct.name; });
            });
        }
    });

    statusSel.innerHTML = '<option value="">-- 选择目标状态 --</option>';
    if (commonTransitions && commonTransitions.length > 0) {
        commonTransitions.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            statusSel.appendChild(opt);
        });
    } else if (count > 0) {
        // Fetch transitions for uncached selected items
        statusSel.innerHTML = '<option value="">加载中...</option>';
        fetchTransitionsForSelected().then(function() {
            updateBatchBar();
        });
    }
}

function fetchTransitionsForSelected() {
    var keys = Array.from(selectedKeys).filter(function(k) { return !transitionCache[k]; });
    if (keys.length === 0) return Promise.resolve();

    var fetches = keys.map(function(key) {
        return fetch('/api/testcase/transitions/' + key, {
            credentials: 'same-origin',
            headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.data) {
                transitionCache[key] = data.data;
            }
        })
        .catch(function() {});
    });

    return Promise.all(fetches);
}

function batchApplyStatus() {
    var statusSel = document.getElementById('batch-status-select');
    var transitionId = statusSel.value;
    if (!transitionId) {
        alert('请选择目标状态');
        return;
    }

    // Find transition name for display
    var tName = '';
    statusSel.querySelectorAll('option').forEach(function(opt) {
        if (opt.value === transitionId) tName = opt.textContent;
    });

    var count = 0;
    selectedKeys.forEach(function(key) {
        var transitions = transitionCache[key];
        if (!transitions) return;
        var match = transitions.find(function(t) { return t.id === transitionId; });
        if (match) {
            pendingChanges[key] = transitionId;
            count++;
            // Update the status cell visually
            var td = document.querySelector('td.editable-status[data-key="' + key + '"]');
            if (td) {
                var origStatus = td.getAttribute('data-original');
                td.innerHTML = getStatusBadge(origStatus) + ' \u2192 <span style="color:#27ae60; font-weight:600;">' + tName + '</span>';
            }
        }
    });

    updateChangeUI();
    clearSelection();
}

// ============ Status Editing (single cell) ============

function onStatusClick(e) {
    var td = e.currentTarget;
    var key = td.getAttribute('data-key');
    var currentStatus = td.getAttribute('data-original');

    // If already showing a dropdown, ignore
    if (td.querySelector('select')) return;

    // Check cache
    if (transitionCache[key]) {
        showStatusDropdown(td, key, transitionCache[key], currentStatus);
        return;
    }

    // Fetch available transitions
    td.innerHTML = '<span style="font-size:12px; color:#999;">加载中...</span>';
    fetch('/api/testcase/transitions/' + key, {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            transitionCache[key] = data.data;
            showStatusDropdown(td, key, data.data, currentStatus);
        } else {
            td.innerHTML = getStatusBadge(currentStatus);
        }
    })
    .catch(function() {
        td.innerHTML = getStatusBadge(currentStatus);
    });
}

function showStatusDropdown(td, key, transitions, currentStatus) {
    if (!transitions || transitions.length === 0) {
        td.innerHTML = getStatusBadge(currentStatus) + ' <span style="font-size:11px; color:#999;">(无可用转换)</span>';
        return;
    }

    var select = document.createElement('select');
    select.style.cssText = 'width:100%; padding:4px 6px; border:2px solid #3498db; border-radius:4px; font-size:12px; background:#fff;';

    // Current status as disabled option
    var optCurrent = document.createElement('option');
    optCurrent.value = '';
    optCurrent.textContent = currentStatus + ' (当前)';
    optCurrent.disabled = true;
    optCurrent.selected = true;
    select.appendChild(optCurrent);

    transitions.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        select.appendChild(opt);
    });

    select.addEventListener('change', function() {
        var newId = select.value;
        if (newId) {
            pendingChanges[key] = newId;
            // Find the transition name for display
            var tName = '';
            transitions.forEach(function(t) { if (t.id === newId) tName = t.name; });
            td.innerHTML = getStatusBadge(currentStatus) + ' \u2192 <span style="color:#27ae60; font-weight:600;">' + tName + '</span>';
            td.style.cursor = 'pointer';
        } else {
            delete pendingChanges[key];
            td.innerHTML = getStatusBadge(currentStatus);
            td.style.cursor = 'pointer';
        }
        updateChangeUI();
    });

    // Click outside to close
    function onBlur() {
        setTimeout(function() {
            if (!td.querySelector('select')) return;
            if (pendingChanges[key]) {
                var tName = '';
                transitions.forEach(function(t) { if (t.id === pendingChanges[key]) tName = t.name; });
                td.innerHTML = getStatusBadge(currentStatus) + ' \u2192 <span style="color:#27ae60; font-weight:600;">' + tName + '</span>';
            } else {
                td.innerHTML = getStatusBadge(currentStatus);
            }
            td.style.cursor = 'pointer';
            td.removeEventListener('blur', onBlur);
        }, 150);
    }

    td.innerHTML = '';
    td.appendChild(select);
    td.style.cursor = 'default';
    select.focus();
    select.addEventListener('blur', onBlur);
}

function updateChangeUI() {
    var count = Object.keys(pendingChanges).length;
    var countEl = document.getElementById('change-count');
    var btnEl = document.getElementById('btn-save-status');
    if (count > 0) {
        countEl.textContent = count + ' 项待保存';
        countEl.style.display = 'inline';
        btnEl.style.display = 'inline-flex';
    } else {
        countEl.style.display = 'none';
        btnEl.style.display = 'none';
    }
}

function saveStatusToJira() {
    var keys = Object.keys(pendingChanges);
    if (keys.length === 0) return;

    var btn = document.getElementById('btn-save-status');
    var countEl = document.getElementById('change-count');
    btn.disabled = true;
    btn.textContent = '\u23f3 保存中...';
    countEl.textContent = '0 / ' + keys.length;

    var transitions = keys.map(function(key) {
        return { key: key, transitionId: pendingChanges[key] };
    });

    fetch('/api/testcase/transition-batch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {})
        },
        credentials: 'same-origin',
        body: JSON.stringify({ transitions: transitions })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        btn.disabled = false;
        if (data.success && data.data) {
            var ok = data.data.results.length;
            var fail = data.data.errors.length;
            if (fail > 0) {
                var errMsg = data.data.errors.map(function(e) { return e.key + ': ' + e.error; }).join('\n');
                alert('\u2705 成功 ' + ok + ' 条\n\u274c 失败 ' + fail + ' 条\n\n' + errMsg);
            }
            btn.textContent = '\U0001f4be 保存到JIRA';
            // Reload data then check auto-close
            if (selectedParent) {
                selectParent(selectedParent.key);
                setTimeout(function() { checkAndAutoCloseParent(); }, 1500);
            }
        } else {
            alert('\u274c 保存失败: ' + (data.error || '未知错误'));
            btn.textContent = '\U0001f4be 保存到JIRA';
        }
    })
    .catch(function(e) {
        btn.disabled = false;
        btn.textContent = '\U0001f4be 保存到JIRA';
        alert('\u274c 网络错误: ' + e.message);
    });
}
// ============ Utility Functions ============

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusBadge(status) {
    if (!status) return '<span class="badge-status badge-default">未知</span>';
    var ns = normalizeStatus(status);
    var cls = 'badge-default';
    if (ns === 'todo') cls = 'badge-todo';
    else if (ns === 'inprogress') cls = 'badge-inprogress';
    else if (ns === 'done') cls = 'badge-done';
    else if (ns === 'closed') cls = 'badge-closed';
    return '<span class="badge-status ' + cls + '">' + status + '</span>';
}

function getPriorityHtml(priority) {
    if (!priority) return '-';
    var p = priority.toLowerCase();
    var cls = '';
    if (p === 'highest') cls = 'priority-highest';
    else if (p === 'high') cls = 'priority-high';
    else if (p === 'medium') cls = 'priority-medium';
    else if (p === 'low' || p === 'lowest') cls = 'priority-low';
    return '<span class="' + cls + '">' + priority + '</span>';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        var d = new Date(dateStr);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    } catch (e) { return dateStr; }
}

// ============ Tab 2: Upload — 3-Step Flow ============

var uploadSelectedPlanKey = '';
var uploadSelectedPlanSummary = '';
var uploadSelectedPlanStatus = '';
var uploadAllParents = [];

function onUploadProjectChange() {
    var project = document.getElementById('tc-project').value;
    if (!project) return;

    // Show parent section, hide content
    document.getElementById('upload-parent-section').style.display = 'block';
    document.getElementById('upload-content-section').style.display = 'none';
    document.getElementById('upload-breadcrumb').style.display = 'none';
    document.getElementById('upload-project-section').style.display = 'none';

    // Update breadcrumb project name
    var opt = document.getElementById('tc-project').options[document.getElementById('tc-project').selectedIndex];
    document.getElementById('ubc-project').textContent = opt.text.split(' — ')[0];

    loadUploadParents();
}

function loadUploadParents() {
    var project = document.getElementById('tc-project').value;
    if (!project) return;

    var grid = document.getElementById('upload-parent-grid');
    grid.innerHTML = '<div class="loading">加载中...</div>';

    fetch('/api/testcase/search?project=' + encodeURIComponent(project) + '&issuetype=Task,Test+Plan&maxResults=100', {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data.success || !data.data || !data.data.issues) {
            grid.innerHTML = '<div style="color:#999; padding:20px; text-align:center;">加载失败</div>';
            return;
        }
        var issues = data.data.issues;
        uploadAllParents = issues;

        if (issues.length === 0) {
            grid.innerHTML = '<div style="color:#999; padding:20px; text-align:center;">没有找到 Task 或 Test Plan，请新建一个</div>';
            document.getElementById('upload-parent-count').textContent = '(0)';
            return;
        }

        document.getElementById('upload-parent-count').textContent = '(' + issues.length + ')';
        renderUploadParents(issues);
    })
    .catch(function(e) {
        grid.innerHTML = '<div style="color:#e74c3c; padding:20px; text-align:center;">加载失败: ' + e.message + '</div>';
    });
}

function renderUploadParents(issues) {
    var grid = document.getElementById('upload-parent-grid');
    grid.innerHTML = '';
    issues.forEach(function(issue) {
        var card = document.createElement('div');
        card.className = 'parent-card';
        card.setAttribute('data-key', issue.key);
        card.onclick = function() { selectUploadParent(issue.key, issue.summary, issue.status); };

        var typeName = issue.issuetype === 'Test Plan' ? 'Test Plan' : 'Task';
        var typeClass = typeName === 'Test Plan' ? 'pc-type-testplan' : 'pc-type-task';

        card.innerHTML = '<div class="pc-header">' +
            '<span class="pc-key">' + issue.key + '</span>' +
            '<span class="pc-type ' + typeClass + '">' + typeName + '</span>' +
            '</div>' +
            '<div class="pc-title">' + (issue.summary || '').replace(/</g, '&lt;') + '</div>' +
            '<div class="pc-meta">' + (issue.status || '') + '</div>';

        grid.appendChild(card);
    });
}

function filterUploadParents() {
    var query = (document.getElementById('upload-parent-search').value || '').toLowerCase();
    var filtered = uploadAllParents.filter(function(p) {
        return !query || (p.key || '').toLowerCase().indexOf(query) !== -1 ||
               (p.summary || '').toLowerCase().indexOf(query) !== -1;
    });
    renderUploadParents(filtered);
}

function selectUploadParent(key, summary, status) {
    uploadSelectedPlanKey = key;
    uploadSelectedPlanSummary = summary;
    uploadSelectedPlanStatus = status || '';

    // Hide step 1 & 2, show breadcrumb + content
    document.getElementById('upload-project-section').style.display = 'none';
    document.getElementById('upload-parent-section').style.display = 'none';
    document.getElementById('upload-content-section').style.display = 'block';

    // Show regenerate description button in breadcrumb
    var regenBtn = document.getElementById('ubc-regen-desc');
    if (regenBtn) regenBtn.style.display = 'inline-block';

    // Disable LLM eval button (reset for new plan)
    var llmBtn = document.getElementById('btn-llm-eval');
    if (llmBtn) { llmBtn.disabled = true; llmBtn.textContent = '🧠 LLM评估上传的sub task'; }
    // Enable re-evaluate button so user can re-run LLM eval on existing plan
    var ubcBtn = document.getElementById('ubc-regen-desc');
    if (ubcBtn) { ubcBtn.disabled = false; ubcBtn.textContent = '🧠 LLM重新评估'; }

    // Show breadcrumb
    showUploadBreadcrumb(key, summary, status);
}

function showUploadBreadcrumb(key, summary, status) {
    var bar = document.getElementById('upload-breadcrumb');
    bar.style.display = 'block';

    var bcProject = document.getElementById('ubc-project');
    var bcSep = document.getElementById('ubc-sep');
    var bcParent = document.getElementById('ubc-parent');
    var bcStatus = document.getElementById('ubc-status');
    var bcBackParent = document.getElementById('ubc-back-parent');
    var bcBackProject = document.getElementById('ubc-back-project');

    bcProject.style.display = 'inline';
    bcSep.style.display = 'inline';
    bcParent.style.display = 'inline';
    var jiraBase = 'https://jira01.birentech.com/browse/';
    bcParent.innerHTML = (key ? '<a href="' + jiraBase + key + '" target="_blank" style="color:#1a73e8; text-decoration:none; border-bottom:1px dashed #1a73e8;">' + key + '</a> ' : '') + (summary || '').replace(/</g, '&lt;');
    bcBackParent.style.display = 'inline';
    bcBackProject.style.display = 'inline';

    if (status) {
        bcStatus.style.display = 'inline-block';
        bcStatus.textContent = status;
        var isOpen = status.indexOf('进行中') !== -1 || status.indexOf('Opened') !== -1 || status.indexOf('In Progress') !== -1;
        bcStatus.style.background = isOpen ? '#dbeafe' : '#dcfce7';
        bcStatus.style.color = isOpen ? '#2563eb' : '#16a34a';
    } else {
        bcStatus.style.display = 'none';
    }
}

function uploadBackToParentList() {
    document.getElementById('upload-content-section').style.display = 'none';
    document.getElementById('upload-parent-section').style.display = 'block';
    document.getElementById('upload-breadcrumb').style.display = 'none';
    document.getElementById('upload-project-section').style.display = 'none';
    // Hide regenerate description button
    var regenBtn = document.getElementById('ubc-regen-desc');
    if (regenBtn) regenBtn.style.display = 'none';
    uploadSelectedPlanKey = '';
    uploadSelectedPlanSummary = '';
}

function uploadBackToProject() {
    document.getElementById('upload-content-section').style.display = 'none';
    document.getElementById('upload-parent-section').style.display = 'none';
    document.getElementById('upload-breadcrumb').style.display = 'none';
    document.getElementById('upload-project-section').style.display = 'block';
    // Hide regenerate description button
    var regenBtn = document.getElementById('ubc-regen-desc');
    if (regenBtn) regenBtn.style.display = 'none';
    uploadSelectedPlanKey = '';
    uploadSelectedPlanSummary = '';
}

function toggleCreatePlan() {
    var form = document.getElementById('create-plan-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function createTestPlan() {
    var project = document.getElementById('tc-project').value;
    var name = document.getElementById('new-plan-name').value.trim();
    var desc = document.getElementById('new-plan-desc').value.trim();
    if (!project || !name) { alert('请填写项目和名称'); return; }

    fetch('/api/testcase/testplan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {})
        },
        credentials: 'same-origin',
        body: JSON.stringify({ project: project, summary: name, description: desc })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            document.getElementById('new-plan-name').value = '';
            document.getElementById('new-plan-desc').value = '';
            document.getElementById('create-plan-form').style.display = 'none';
            // Select the newly created plan
            selectUploadParent(data.data.key, data.data.summary, '进行中');
        } else {
            alert('创建失败: ' + (data.error || '未知错误'));
        }
    })
    .catch(function(e) { alert('创建失败: ' + e.message); });
}

// ============ Natural Language Command ============

var aiGeneratedIssues = [];

function fillCommand(text) {
    document.getElementById('ai-prompt').value = text;
}

// Handle paste of tab-separated or space-separated data
var aiPromptEl = document.getElementById('ai-prompt');
if (aiPromptEl) {
    aiPromptEl.addEventListener('paste', function(e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text) return;

    // Normalize line endings and split
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(function(l) { return l.trim(); });
    if (lines.length < 1) return;

    var issues = [];
    lines.forEach(function(line) {
        var title, desc, priority;

        // ALWAYS try tab split first
        var tabParts = line.split('\t');
        if (tabParts.length >= 2) {
            // Tab-separated
            title = tabParts[0].trim();
            desc = tabParts[1].trim();
            priority = (tabParts[2] || '').trim();
        } else {
            // No tab - try to split English title from Chinese description
            var trimmed = line.trim();
            var match = trimmed.match(/^([A-Za-z0-9_+\-]+(?:\s+[A-Za-z0-9_+\-]+){0,3})\s+([\u4e00-\u9fa5].+)$/);
            if (match) {
                title = match[1].trim();
                desc = match[2].trim();
            } else {
                title = trimmed;
                desc = '';
            }
            priority = '';
        }

        // Remove leading/trailing pipes if pasted from markdown table
        title = title.replace(/^\|/, '').replace(/\|$/, '').trim();
        desc = desc.replace(/^\|/, '').replace(/\|$/, '').trim();
        priority = priority.replace(/^\|/, '').replace(/\|$/, '').trim();

        // Map priority
        var validPriorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
        if (!priority || !validPriorities.some(function(p) { return p.toLowerCase() === priority.toLowerCase(); })) {
            priority = 'Highest';
        } else {
            priority = validPriorities.find(function(p) { return p.toLowerCase() === priority.toLowerCase(); });
        }

        // Skip empty, pure header rows, or assignee hint lines
        if (title && !title.match(/^[#=|]+$/) && title.length > 0 && !title.match(/负责人/)) {
            issues.push({
                action: 'create',
                summary: title,
                description: desc,
                issuetype: 'Sub-task',
                priority: priority,
                labels: '',
                parentKey: uploadSelectedPlanKey || '',
                assignee: ''
            });
        }
    }); // end lines.forEach

    if (issues.length > 0) {
        // APPEND to existing text (don't overwrite)
        var textarea = document.getElementById('ai-prompt');
        var existing = textarea.value.trim();
        if (existing) {
            textarea.value = existing + '\n' + text;
        } else {
            textarea.value = text;
        }
        window._pendingPasteIssues = issues;
        var statusEl = document.getElementById('ai-status');
        statusEl.className = 'ai-status success';
        statusEl.textContent = '✅ 检测到 ' + issues.length + ' 条数据，点击「解析并创建」按钮解析';
        statusEl.style.display = 'block';
    }
    // If no valid issues parsed, let the default paste happen (regular text)
});
} // end if (aiPromptEl)

function generateWithAI() {
    // Check if there's pending paste data
    if (window._pendingPasteIssues && window._pendingPasteIssues.length > 0) {
        var command = document.getElementById('ai-prompt').value.trim();
        
        // Search entire text for assignee (e.g., "负责人为Cao Xianjie" or "负责人为E01860")
        var assignee = '';
        var assigneeMatch = command.match(/负责人[为是:：]\s*(.+)/);
        if (assigneeMatch) {
            assignee = assigneeMatch[1].trim();
        }
        
        // Apply assignee to all issues
        aiGeneratedIssues = window._pendingPasteIssues.map(function(issue) {
            return Object.assign({}, issue, { assignee: assignee || issue.assignee || '' });
        });
        window._pendingPasteIssues = null;
        
        console.log('[AI] Final issues with assignee:', JSON.stringify(aiGeneratedIssues[0], null, 2));
        
        var statusEl = document.getElementById('ai-status');
        statusEl.className = 'ai-status success';
        var assigneeInfo = assignee ? '，负责人: ' + assignee : '';
        statusEl.textContent = '✅ 已解析 ' + aiGeneratedIssues.length + ' 条测试用例' + assigneeInfo;
        statusEl.style.display = 'block';
        renderAiPreview();
        document.getElementById('btn-ai-upload').disabled = false;
        document.getElementById('ai-prompt').value = '';
        return;
    }

    var project = document.getElementById('tc-project').value;
    if (!project) { alert('请先选择目标项目'); return; }

    var command = document.getElementById('ai-prompt').value.trim();
    if (!command) { alert('请输入指令'); return; }

    var parentKey = uploadSelectedPlanKey || '';
    var parentSummary = uploadSelectedPlanSummary || '';

    var statusEl = document.getElementById('ai-status');
    statusEl.className = 'ai-status loading';
    statusEl.textContent = '🔄 正在解析指令...';
    statusEl.style.display = 'block';

    document.getElementById('btn-ai-generate').disabled = true;
    document.getElementById('btn-ai-upload').disabled = true;

    fetch('/api/testcase/ai-generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {})
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            project: project,
            parentKey: parentKey,
            parentSummary: parentSummary,
            command: command
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data && data.data.actions) {
            aiGeneratedIssues = data.data.actions;
            statusEl.className = 'ai-status success';
            var summary = aiGeneratedIssues.map(function(a) { return a.issuetype + ': ' + a.summary; }).join(', ');
            statusEl.textContent = '✅ 解析完成，共 ' + aiGeneratedIssues.length + ' 个操作: ' + summary;
            renderAiPreview();
            document.getElementById('btn-ai-upload').disabled = false;
        } else {
            statusEl.className = 'ai-status error';
            statusEl.textContent = '❌ ' + (data.error || '解析失败');
            if (data.raw) statusEl.textContent += '\n\n' + data.raw.substring(0, 300);
        }
    })
    .catch(function(e) {
        statusEl.className = 'ai-status error';
        statusEl.textContent = '❌ 网络错误: ' + e.message;
    })
    .finally(function() {
        document.getElementById('btn-ai-generate').disabled = false;
    });
}

function renderAiPreview() {
    var previewSection = document.getElementById('preview-section');
    var previewCount = document.getElementById('preview-count');
    var thead = document.getElementById('preview-thead');
    var tbody = document.getElementById('preview-tbody');

    previewSection.style.display = 'block';
    previewCount.textContent = '(' + aiGeneratedIssues.length + ' 条)';

    thead.innerHTML = '<tr><th>#</th><th>类型</th><th>标题</th><th>描述</th><th>优先级</th><th>负责人</th><th>父任务</th><th>操作</th></tr>';
    tbody.innerHTML = '';

    aiGeneratedIssues.forEach(function(issue, idx) {
        var tr = document.createElement('tr');
        var typeBadge = issue.issuetype === 'Test Plan' ?
            '<span style="background:#fef3e0; color:#e65100; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">Test Plan</span>' :
            '<span style="background:#e8f0fe; color:#1a73e8; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">Sub-task</span>';

        tr.innerHTML = '<td>' + (idx + 1) + '</td>' +
            '<td><select class="inline-select" data-field="issuetype" onchange="updateAiIssue(' + idx + ', this)">' +
                '<option value="Test Plan"' + (issue.issuetype === 'Test Plan' ? ' selected' : '') + '>Test Plan</option>' +
                '<option value="Sub-task"' + (issue.issuetype === 'Sub-task' ? ' selected' : '') + '>Sub-task</option>' +
                '<option value="Task"' + (issue.issuetype === 'Task' ? ' selected' : '') + '>Task</option>' +
            '</select></td>' +
            '<td contenteditable="true" class="editable-cell" data-field="summary">' + escapeHtml(issue.summary) + '</td>' +
            '<td contenteditable="true" class="editable-cell" data-field="description" style="max-width:300px; white-space:pre-wrap; font-size:12px;">' + escapeHtml(issue.description) + '</td>' +
            '<td><select class="inline-select" data-field="priority" onchange="updateAiIssue(' + idx + ', this)">' +
                '<option value="Highest"' + (issue.priority === 'Highest' ? ' selected' : '') + '>Highest</option>' +
                '<option value="High"' + (issue.priority === 'High' ? ' selected' : '') + '>High</option>' +
                '<option value="Medium"' + (issue.priority === 'Medium' ? ' selected' : '') + '>Medium</option>' +
                '<option value="Low"' + (issue.priority === 'Low' ? ' selected' : '') + '>Low</option>' +
                '<option value="Lowest"' + (issue.priority === 'Lowest' ? ' selected' : '') + '>Lowest</option>' +
            '</select></td>' +
            '<td contenteditable="true" class="editable-cell" data-field="assignee" style="font-size:12px;">' + escapeHtml(issue.assignee || '') + '</td>' +
            '<td style="font-size:12px; color:#888;">' + escapeHtml(issue.parentKey || uploadSelectedPlanKey || '-') + '</td>' +
            '<td><button class="btn btn-outline btn-sm" onclick="removeAiIssue(' + idx + ')" style="color:#e74c3c; font-size:11px;">删除</button></td>';
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.editable-cell').forEach(function(cell) {
        cell.addEventListener('blur', function() {
            var idx = parseInt(this.closest('tr').querySelector('td').textContent) - 1;
            var field = this.dataset.field;
            if (idx >= 0 && idx < aiGeneratedIssues.length) {
                aiGeneratedIssues[idx][field] = this.textContent.trim();
            }
        });
    });
}

function updateAiIssue(idx, selectEl) {
    if (idx >= 0 && idx < aiGeneratedIssues.length) {
        aiGeneratedIssues[idx][selectEl.dataset.field] = selectEl.value;
    }
}

function removeAiIssue(idx) {
    aiGeneratedIssues.splice(idx, 1);
    renderAiPreview();
    if (aiGeneratedIssues.length === 0) {
        document.getElementById('btn-ai-upload').disabled = true;
    }
}

function clearAiResults() {
    aiGeneratedIssues = [];
    document.getElementById('ai-prompt').value = '';
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('ai-status').style.display = 'none';
    document.getElementById('btn-ai-upload').disabled = true;
    // Disable LLM eval button
    var llmBtn = document.getElementById('btn-llm-eval');
    if (llmBtn) { llmBtn.disabled = true; llmBtn.textContent = '🧠 LLM评估上传的sub task'; }
}

function uploadAiResults() {
    if (aiGeneratedIssues.length === 0) { alert('没有可创建的内容'); return; }

    var project = document.getElementById('tc-project').value;
    if (!project) { alert('请先选择目标项目'); return; }

    // Build issues for batch-create
    parsedData = aiGeneratedIssues.map(function(action) {
        return {
            '标题': action.summary,
            '描述': action.description,
            '优先级': action.priority,
            'Issue类型': action.issuetype,
            '标签': action.labels || '',
            '父任务Key': action.parentKey || uploadSelectedPlanKey || '',
            '负责人': action.assignee || ''
        };
    });

    headers = ['标题', '描述', '优先级', 'Issue类型', '标签', '父任务Key'];
    startBatchUpload();
}

// ============ Batch Upload ============

function startBatchUpload() {
    var project = document.getElementById('tc-project').value;
    if (!project) {
        alert('请先选择目标项目');
        return;
    }

    if (parsedData.length === 0) {
        alert('没有可上传的数据');
        return;
    }

    var issues = parsedData.map(function(row) {
        var issue = {
            summary: row['标题'] || row['summary'] || row['名称'] || '',
            description: row['描述'] || row['description'] || '',
            issuetype: row['Issue类型'] || row['类型'] || row['issuetype'] || document.getElementById('tc-issuetype').value,
            priority: row['优先级'] || row['priority'] || document.getElementById('tc-priority').value,
            labels: row['标签'] || row['labels'] || '',
            assignee: row['负责人'] || row['assignee'] || document.getElementById('tc-assignee').value,
            parentKey: row['父任务Key'] || row['parent'] || row['父任务'] || ''
        };

        // If a test plan is selected and no explicit parent, use the test plan as parent
        if (selectedPlanKey && !issue.parentKey) {
            issue.parentKey = selectedPlanKey;
            if (!row['Issue类型'] && !row['类型'] && !row['issuetype']) {
                issue.issuetype = 'Sub-task';
            }
        }

        return issue;
    });

    var validIssues = issues.filter(function(iss) { return iss.summary; });
    if (validIssues.length === 0) {
        alert('所有记录都缺少标题，无法上传');
        return;
    }

    document.getElementById('progress-section').style.display = 'block';
    document.getElementById('summary-section').style.display = 'none';
    document.getElementById('btn-start-upload').disabled = true;

    uploadResults = [];
    var total = validIssues.length;
    var completed = 0;
    var successCount = 0;
    var failCount = 0;
    var logEl = document.getElementById('progress-log');
    logEl.innerHTML = '';

    var batchSize = 10;
    var batches = [];
    for (var i = 0; i < validIssues.length; i += batchSize) {
        batches.push(validIssues.slice(i, i + batchSize));
    }

    var batchIdx = 0;
    function processNextBatch() {
        if (batchIdx >= batches.length) {
            updateProgress(total, total, successCount, failCount);
            showSummary(total, successCount, failCount);
            document.getElementById('btn-start-upload').disabled = false;
            return;
        }

        var batch = batches[batchIdx];
        batchIdx++;

        fetch('/api/testcase/batch-create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ project: project, issues: batch })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.data) {
                data.data.results.forEach(function(r) {
                    completed++;
                    successCount++;
                    uploadResults.push(r);
                    updateStatusCell(r.row - 1, 'created', r.key, r.url);
                    addLog('✅ Row ' + r.row + ': ' + r.key + ' — ' + r.summary, 'ok');
                });
                data.data.errors.forEach(function(err) {
                    completed++;
                    failCount++;
                    updateStatusCell(err.row - 1, 'failed', null, null, err.error);
                    addLog('❌ Row ' + err.row + ': ' + err.summary + ' — ' + err.error, 'err');
                });
            } else {
                batch.forEach(function(iss) {
                    completed++;
                    failCount++;
                    addLog('❌ ' + iss.summary + ' — ' + (data.error || '请求失败'), 'err');
                });
            }
            updateProgress(total, completed, successCount, failCount);
            processNextBatch();
        })
        .catch(function(e) {
            batch.forEach(function(iss) {
                completed++;
                failCount++;
                addLog('❌ ' + iss.summary + ' — 网络错误: ' + e.message, 'err');
            });
            updateProgress(total, completed, successCount, failCount);
            processNextBatch();
        });
    }

    var planInfo = uploadSelectedPlanKey ? ' (Plan: ' + uploadSelectedPlanKey + ')' : '';
    addLog('🚀 开始上传 ' + total + ' 条 Issue 到 ' + project + planInfo, 'ok');
    processNextBatch();
}

function updateProgress(total, completed, success, fail) {
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-current').textContent = completed + ' / ' + total;
    document.getElementById('progress-percent').textContent = pct + '%';
}

function updateStatusCell(rowIdx, status, key, url, errorMsg) {
    var cell = document.getElementById('status-' + rowIdx);
    if (!cell) return;

    if (status === 'created') {
        cell.className = 'status-created';
        cell.innerHTML = '<a href="' + url + '" target="_blank">' + key + '</a>';
    } else if (status === 'failed') {
        cell.className = 'status-failed';
        cell.textContent = '❌ 失败';
        cell.title = errorMsg || '';
    }
}

function addLog(text, type) {
    var logEl = document.getElementById('progress-log');
    var line = document.createElement('div');
    line.className = type === 'ok' ? 'log-ok' : 'log-err';
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function showSummary(total, success, fail) {
    var section = document.getElementById('summary-section');
    section.style.display = 'block';
    document.getElementById('sum-total').textContent = total;
    document.getElementById('sum-success').textContent = success;
    document.getElementById('sum-fail').textContent = fail;

    // Reset LLM eval status
    var llmEl = document.getElementById('llm-eval-status');
    if (llmEl) llmEl.style.display = 'none';

    addLog('📊 上传完成: ' + success + ' 成功 / ' + fail + ' 失败 / ' + total + ' 总计', success > 0 ? 'ok' : 'err');

    // Enable LLM eval button if there were successful uploads to a test plan
    var llmBtn = document.getElementById('btn-llm-eval');
    if (uploadSelectedPlanKey && success > 0 && llmBtn) {
        llmBtn.disabled = false;
    }
}

function llmEvalAfterUpload() {
    if (!uploadSelectedPlanKey) {
        alert('请先选择一个 Test Plan');
        return;
    }
    var btn = document.getElementById('btn-llm-eval');
    var startTime = Date.now();
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ 评估中...';
    }
    showLlmEvalStatus('loading', '⏳ 正在评估中...');

    // Call updatePlanDescription which handles the full flow
    updatePlanDescription(uploadSelectedPlanKey);

    // Monitor completion
    var checkCount = 0;
    var ubcBtn2 = document.getElementById('ubc-regen-desc');
    var checkInterval = setInterval(function() {
        checkCount++;
        var logEl = document.getElementById('progress-log');
        if (logEl) {
            var logs = logEl.textContent;
            var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            if (logs.indexOf('Test Plan 描述已更新: ' + uploadSelectedPlanKey) !== -1) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM评估上传的sub task'; }
                if (ubcBtn2) { ubcBtn2.disabled = false; ubcBtn2.textContent = '🧠 LLM重新评估'; }
                showLlmEvalStatus('ok', '✅ 评估完成，耗时 ' + elapsed + ' 秒');
            } else if (logs.indexOf('更新描述失败') !== -1) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM评估上传的sub task'; }
                if (ubcBtn2) { ubcBtn2.disabled = false; ubcBtn2.textContent = '🧠 LLM重新评估'; }
                showLlmEvalStatus('err', '❌ 评估失败，请重试 (耗时 ' + elapsed + ' 秒)');
            } else if (checkCount > 300) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM评估上传的sub task'; }
                if (ubcBtn2) { ubcBtn2.disabled = false; ubcBtn2.textContent = '🧠 LLM重新评估'; }
                showLlmEvalStatus('err', '⚠️ 超时 (已等待 ' + elapsed + ' 秒)，请检查日志');
            } else if (checkCount % 5 === 0) {
                showLlmEvalStatus('loading', '⏳ 评估中...已等待 ' + elapsed + ' 秒');
            }
        }
    }, 1000);
}

function showLlmEvalStatus(status, text) {
    var el = document.getElementById('llm-eval-status');
    var icon = document.getElementById('llm-eval-icon');
    var textEl = document.getElementById('llm-eval-text');
    if (!el) return;
    el.style.display = 'flex';
    if (status === 'loading') {
        el.style.background = '#eff6ff';
        el.style.color = '#2563eb';
        icon.textContent = '🤖';
        textEl.textContent = text;
    } else if (status === 'ok') {
        el.style.background = '#f0fdf4';
        el.style.color = '#16a34a';
        icon.textContent = '✅';
        textEl.textContent = text;
    } else if (status === 'skip') {
        el.style.background = '#fffbeb';
        el.style.color = '#d97706';
        icon.textContent = '⚠️';
        textEl.textContent = text;
    } else if (status === 'err') {
        el.style.background = '#fef2f2';
        el.style.color = '#dc2626';
        icon.textContent = '❌';
        textEl.textContent = text;
    }
}

function updatePlanDescription(planKey) {
    addLog('📝 正在生成 Test Plan 描述摘要...', 'ok');
    showLlmEvalStatus('loading', '正在获取 Sub-task 列表...');

    fetch('/api/testcase/testplan/linked-tasks/' + planKey, {
        credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + authToken }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data.success || !data.data || !data.data.tasks || data.data.tasks.length === 0) {
            addLog('⚠️ 未找到关联的 Sub-task', 'err');
            return;
        }

        var tasks = data.data.tasks;
        var planSummary = data.data.planSummary || planKey;

        // Always call LLM: generate for missing, enhance for existing
        var tasksNeedingGen = tasks.filter(function(t) { return !t.description || t.description.trim() === ''; });
        var tasksNeedingEnhance = tasks.filter(function(t) { return t.description && t.description.trim() !== ''; });

        if (tasksNeedingGen.length > 0) {
            addLog('🤖 ' + tasksNeedingGen.length + ' 条缺少描述，' + tasksNeedingEnhance.length + ' 条需要增强，LLM 处理中...', 'ok');
        } else {
            addLog('🤖 ' + tasksNeedingEnhance.length + ' 条描述需要 LLM 增强...', 'ok');
        }
        showLlmEvalStatus('loading', 'LLM 正在处理 ' + tasks.length + ' 条 Sub-task 描述...');

        // Call LLM to generate/enhance descriptions
        return fetch('/api/testcase/testplan/llm-evaluate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                planKey: planKey,
                planSummary: planSummary,
                tasks: tasks.map(function(t) {
                    return { key: t.key, summary: t.summary, description: t.description || '', status: t.status || '', priority: t.priority || '' };
                }),
                mode: 'generate_descriptions'
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(llmResult) {
            if (llmResult.success && llmResult.data && llmResult.data.descriptions) {
                var descMap = llmResult.data.descriptions;
                // Logic: 
                // - Has original description → keep original + append LLM enhancement with test steps
                // - No description → use LLM generated full description with test steps
                var enhanced = 0;
                var generated = 0;
                tasks.forEach(function(t) {
                    if (descMap[t.key]) {
                        var origDesc = (t.description || '').trim();
                        if (origDesc) {
                            // Has original → keep original, append LLM enhancement
                            t.description = origDesc + '\n\n' + descMap[t.key];
                            enhanced++;
                        } else {
                            // No description → use LLM generated
                            t.description = descMap[t.key];
                            generated++;
                        }
                    }
                });
                addLog('✅ LLM 处理完成: ' + generated + ' 条新生成, ' + enhanced + ' 条增强补充', 'ok');
                showLlmEvalStatus('loading', '正在将描述写回 JIRA...');

                // Build map: ALL tasks that got LLM descriptions
                var allDescMap = {};
                tasks.forEach(function(t) {
                    if (descMap[t.key]) {
                        allDescMap[t.key] = t.description;
                    }
                });

                if (Object.keys(allDescMap).length === 0) {
                    addLog('ℹ️ 无描述需要更新', 'ok');
                    return generateAndUploadDescription(tasks, planSummary, planKey);
                }

                // Write all updated descriptions back to JIRA sub-tasks
                return fetch('/api/testcase/testplan/update-descriptions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ descriptions: allDescMap })
                })
                .then(function(r) { return r.json(); })
                .then(function(updateResult) {
                    if (updateResult.success && updateResult.data) {
                        addLog('✅ JIRA 描述已更新: ' + updateResult.data.ok + ' 成功 / ' + updateResult.data.failed + ' 失败', 'ok');
                    } else {
                        addLog('⚠️ JIRA 描述更新失败: ' + (updateResult.error || '未知错误'), 'err');
                    }
                    return generateAndUploadDescription(tasks, planSummary, planKey);
                });
            } else {
                addLog('⚠️ LLM 描述处理跳过', 'err');
                return generateAndUploadDescription(tasks, planSummary, planKey);
            }
        });
    })
    .then(function(result) {
        if (result && result.success) {
            addLog('✅ Test Plan 描述已更新: ' + planKey, 'ok');
            showLlmEvalStatus('ok', '✅ Test Plan 描述已更新: ' + planKey);
        } else if (result) {
            addLog('❌ 更新描述失败: ' + (result.error || '未知错误'), 'err');
            showLlmEvalStatus('err', '描述更新失败: ' + (result.error || '未知错误'));
        }
    })
    .catch(function(e) {
        addLog('❌ 更新描述失败: ' + e.message, 'err');
        showLlmEvalStatus('err', '描述更新失败: ' + e.message);
    });
}

function generateAndUploadDescription(tasks, planSummary, planKey) {
    // Categorize tasks by keywords in summary/description
    // Dynamically select categories based on Test Plan type
    var planLower = (planSummary || '').toLowerCase();
    var categories;

    if (planLower.indexOf('ethernet') !== -1 || planLower.indexOf('以太网') !== -1) {
        // Ethernet test plan categories
        categories = [
            { name: 'PCB 验证', keywords: ['pcb', 'tdr', 'insertion loss', 'impedance'] },
            { name: '基础测量', keywords: ['voltage', 'clock', 'reference clock', 'measurement'] },
            { name: '固件与启动', keywords: ['firmware', 'boot', 'bringup', 'bring-up', 'memtest'] },
            { name: 'Auto-Negotiation', keywords: ['auto-negotiation', 'an ', 'an-status', 'an+lt'] },
            { name: 'Link Training', keywords: ['link training', 'serdes link', 'lt '] },
            { name: 'Loopback 测试', keywords: ['loopback', 'nes', 'fep', 'tx2rx', 'rx2tx'] },
            { name: 'RxEQ 测试', keywords: ['rxeq', 'rx eq', 'bert'] },
            { name: 'A test', keywords: ['atest', 'a test', 'bu_atest'] }
        ];
    } else if (planLower.indexOf('hbm') !== -1) {
        // HBM test plan categories
        categories = [
            { name: 'Protocol & Module 特性验证', keywords: ['protocol stack', 'protocol type', 'protocol format', 'link speed', 'link width', 'single module'] },
            { name: 'LSM 验证', keywords: ['fdi lsm', 'rdi lsm', 'adapter sideband', 'physical ltsm'] },
            { name: '复位机制验证', keywords: ['cold-rst', 'soft-rst'] },
            { name: '数据通路验证', keywords: ['mainband', 'data path', 'datapath'] },
            { name: '诊断能力验证', keywords: ['register dump', 'diag access', 'diag ', 'linkup'] },
            { name: 'PMA 验证', keywords: ['pma loopback', 'internal loopback', 'loopback'] },
            { name: 'Dual Die 验证', keywords: ['dual die'] },
            { name: '稳定性测试', keywords: ['training status', 'dcl status', 'dcl config', 'power cycle', 'hot reset', 'reboot'] },
            { name: 'HBM 测试', keywords: ['hbm', 'mc_phy', 'mc bist', 'training status', 'voltage', 'eye', 'pclk', 'diagnostic'] },
            { name: 'PCIe 测试', keywords: ['pcie', 'link', 'bar', 'msi', 'intx', 'refclk', 'gen5', 'lane', 'polarity'] }
        ];
    } else {
        // Default categories (UCIe/PCIe general)
        categories = [
            { name: 'Protocol & Module 特性验证', keywords: ['protocol stack', 'protocol type', 'protocol format', 'link speed', 'link width', 'single module'] },
            { name: 'LSM 验证', keywords: ['fdi lsm', 'rdi lsm', 'adapter sideband', 'physical ltsm'] },
            { name: '复位机制验证', keywords: ['cold-rst', 'soft-rst'] },
            { name: '数据通路验证', keywords: ['mainband', 'data path', 'datapath'] },
            { name: '诊断能力验证', keywords: ['register dump', 'diag access', 'diag ', 'linkup'] },
            { name: 'PMA 验证', keywords: ['pma loopback', 'internal loopback', 'loopback'] },
            { name: 'Dual Die 验证', keywords: ['dual die'] },
            { name: '稳定性测试', keywords: ['training status', 'dcl status', 'dcl config', 'power cycle', 'hot reset', 'reboot'] },
            { name: 'HBM 测试', keywords: ['hbm', 'mc_phy', 'mc bist', 'training status', 'voltage', 'eye', 'pclk', 'diagnostic'] },
            { name: 'PCIe 测试', keywords: ['pcie', 'link', 'bar', 'msi', 'intx', 'refclk', 'gen5', 'lane', 'polarity'] }
        ];
    }

    var uncategorized = [];
    var categorized = {};

    tasks.forEach(function(task) {
        var text = ((task.summary || '') + ' ' + (task.description || '')).toLowerCase();
        var matched = false;
        for (var i = 0; i < categories.length; i++) {
            var cat = categories[i];
            for (var j = 0; j < cat.keywords.length; j++) {
                if (text.indexOf(cat.keywords[j]) !== -1) {
                    if (!categorized[cat.name]) categorized[cat.name] = [];
                    categorized[cat.name].push(task);
                    matched = true;
                    break;
                }
            }
            if (matched) break;
        }
        if (!matched) {
            uncategorized.push(task);
        }
    });

    // Build JIRA wiki format description (sub-task summary)
    var desc = 'h2. Test Summary\n\n';
    desc += planSummary + '，共 ' + tasks.length + ' 项测试用例。\n\n';

    var catIndex = 1;
    // Render each category
    categories.forEach(function(cat) {
        var items = categorized[cat.name];
        if (!items || items.length === 0) return;
        desc += 'h2. ' + catIndex + '. ' + cat.name + ' (' + items.length + '项)\n\n';
        desc += '||用例||描述||\n';
        items.forEach(function(task) {
            var descText = task.description || task.summary;
            // Truncate long descriptions to first sentence
            if (descText.length > 120) {
                descText = descText.substring(0, 120).replace(/\s+\S*$/, '') + '...';
            }
            // Escape JIRA wiki pipe characters
            descText = descText.replace(/\|/g, '\\|').replace(/\n/g, ' ');
            desc += '|' + task.key + ' ' + task.summary + '|' + descText + '|\n';
        });
        desc += '\n';
        catIndex++;
    });

    // Uncategorized tasks
    if (uncategorized.length > 0) {
        desc += 'h2. ' + catIndex + '. 其他测试 (' + uncategorized.length + '项)\n\n';
        desc += '||用例||描述||\n';
        uncategorized.forEach(function(task) {
            var descText = task.description || task.summary;
            if (descText.length > 120) {
                descText = descText.substring(0, 120).replace(/\s+\S*$/, '') + '...';
            }
            descText = descText.replace(/\|/g, '\\|').replace(/\n/g, ' ');
            desc += '|' + task.key + ' ' + task.summary + '|' + descText + '|\n';
        });
        desc += '\n';
    }

    // Step 2: Call LLM for expert evaluation
    addLog('🤖 正在调用 LLM 专家评估...', 'ok');
    showLlmEvalStatus('loading', 'LLM硬件专家评估 Test Plan 中...');

    return fetch('/api/testcase/testplan/llm-evaluate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
            planKey: planKey,
            planSummary: planSummary,
            tasks: tasks.map(function(t) {
                return { key: t.key, summary: t.summary, description: t.description || '', status: t.status || '', priority: t.priority || '' };
            })
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(llmResult) {
        if (llmResult.success && llmResult.data && llmResult.data.evaluation) {
            addLog('✅ LLM 专家评估完成', 'ok');
            showLlmEvalStatus('ok', '✅ LLM硬件专家评估 Test Plan 完毕');
            // Append LLM evaluation to description
            desc += 'h2. 🔍 专家评估 (LLM)\n\n';
            desc += llmResult.data.evaluation + '\n\n';
        } else {
            addLog('⚠️ LLM 评估跳过: ' + (llmResult.error || '未知原因'), 'err');
            showLlmEvalStatus('skip', 'LLM 评估跳过: ' + (llmResult.error || '未知原因'));
        }

        // Step 3: Update plan description with combined content
        return fetch('/api/testcase/testplan/description', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ planKey: planKey, description: desc })
        }).then(function(r) { return r.json(); });
    });
}

function regeneratePlanDescription() {
    // Support both browse tab and upload tab
    var planKey = '';
    var isUploadTab = false;
    if (typeof uploadSelectedPlanKey !== 'undefined' && uploadSelectedPlanKey) {
        planKey = uploadSelectedPlanKey;
        isUploadTab = true;
    } else if (typeof selectedParent !== 'undefined' && selectedParent && selectedParent.key) {
        planKey = selectedParent.key;
    }

    if (!planKey) {
        alert('请先选择一个 Test Plan');
        return;
    }

    var btn = document.getElementById('btn-regen-desc');
    var ubcBtn = document.getElementById('ubc-regen-desc');
    var statusEl = document.getElementById('regen-desc-status');
    var ubcStatus = document.getElementById('ubc-regen-status');
    var startTime = Date.now();

    function updateStatus(text, color) {
        if (statusEl) { statusEl.textContent = text; statusEl.style.color = color; }
        if (ubcStatus) {
            ubcStatus.style.display = 'inline';
            ubcStatus.textContent = text;
            ubcStatus.style.color = color;
        }
    }

    if (btn) { btn.disabled = true; btn.textContent = '⏳ 评估中...'; }
    if (ubcBtn) { ubcBtn.disabled = true; ubcBtn.textContent = '⏳ 评估中...'; }
    updateStatus('⏳ 正在评估中...', '#2563eb');

    // Call updatePlanDescription which handles the full flow
    updatePlanDescription(planKey);

    // Monitor completion via a simple polling (max 5 minutes to match backend timeout)
    var checkCount = 0;
    var checkInterval = setInterval(function() {
        checkCount++;
        var logEl = document.getElementById('progress-log');
        if (logEl) {
            var logs = logEl.textContent;
            var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            if (logs.indexOf('Test Plan 描述已更新: ' + planKey) !== -1) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM 评估 Test Plan'; }
                if (ubcBtn) { ubcBtn.disabled = false; ubcBtn.textContent = '🧠 LLM重新评估'; }
                updateStatus('✅ 评估完成，耗时 ' + elapsed + ' 秒', '#16a34a');
            } else if (logs.indexOf('更新描述失败') !== -1) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM 评估 Test Plan'; }
                if (ubcBtn) { ubcBtn.disabled = false; ubcBtn.textContent = '🧠 LLM重新评估'; }
                updateStatus('❌ 生成失败，请重试 (耗时 ' + elapsed + ' 秒)', '#dc2626');
            } else if (checkCount > 300) {
                clearInterval(checkInterval);
                if (btn) { btn.disabled = false; btn.textContent = '🧠 LLM 评估 Test Plan'; }
                if (ubcBtn) { ubcBtn.disabled = false; ubcBtn.textContent = '🧠 LLM重新评估'; }
                updateStatus('⚠️ 超时 (已等待 ' + elapsed + ' 秒)，请检查日志', '#d97706');
            } else if (checkCount % 5 === 0) {
                updateStatus('⏳ 评估中...已等待 ' + elapsed + ' 秒', '#2563eb');
            }
        }
    }, 1000);
}

function downloadTemplate() {
    window.location.href = '/api/testcase/template';
}

// ============ Date Setting Modal ============
function showDateModal() {
    if (!selectedParent) { alert('请先选择一个 Test Plan'); return; }
    document.getElementById('date-modal').style.display = 'flex';
    document.getElementById('date-modal-status').style.display = 'none';
    document.getElementById('btn-save-dates').disabled = false;
    // Pre-fill with existing dates if available
    if (selectedParent.startDate) {
        document.getElementById('date-actual-start').value = selectedParent.startDate;
    }
    if (selectedParent.endDate) {
        document.getElementById('date-actual-end').value = selectedParent.endDate;
    }
}

function closeDateModal() {
    document.getElementById('date-modal').style.display = 'none';
}

function saveDates() {
    var startDate = document.getElementById('date-actual-start').value;
    var endDate = document.getElementById('date-actual-end').value;
    var statusEl = document.getElementById('date-modal-status');
    var btn = document.getElementById('btn-save-dates');

    // Allow closing without setting dates
    if (!startDate && !endDate) {
        closeDateModal();
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ 保存中...';
    statusEl.style.display = 'block';
    statusEl.style.color = '#2563eb';
    statusEl.textContent = '正在保存到 JIRA...';

    // Collect all issue keys: parent + linked sub-tasks + sub-tasks of linked plans
    var keys = [selectedParent.key];
    if (linkedPlans && linkedPlans.length > 0) {
        linkedPlans.forEach(function(p) { keys.push(p.key); });
    }
    
    // Also fetch sub-tasks of each linked plan using search API
    var fetchPromises = [];
    if (linkedPlans && linkedPlans.length > 0) {
        linkedPlans.forEach(function(p) {
            fetchPromises.push(
                fetch('/api/testcase/search?project=' + selectedParent.key.replace(/-.*/, '') + '&parent=' + p.key + '&maxResults=100', {
                    credentials: 'same-origin',
                    headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success && data.data && data.data.issues) {
                        data.data.issues.forEach(function(issue) {
                            if (keys.indexOf(issue.key) === -1) keys.push(issue.key);
                        });
                    }
                })
                .catch(function() {})
            );
        });
    }
    
    Promise.all(fetchPromises).then(function() {
        return fetch('/api/testcase/batch-update-dates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                keys: keys,
                actualStartDate: startDate || null,
                actualEndDate: endDate || null
            })
        });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            statusEl.style.color = '#16a34a';
            statusEl.textContent = '✅ 已更新 ' + data.data.ok + ' 个 issue 的日期';
            // Update local state
            if (startDate) selectedParent.startDate = startDate;
            if (endDate) selectedParent.endDate = endDate;
            setTimeout(closeDateModal, 1500);
        } else {
            statusEl.style.color = '#dc2626';
            statusEl.textContent = '❌ ' + (data.error || '保存失败');
            btn.disabled = false;
            btn.textContent = '💾 保存';
        }
    })
    .catch(function(e) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = '❌ 网络错误: ' + e.message;
        btn.disabled = false;
        btn.textContent = '💾 保存';
    });
}

// Toast通知函数
function showToast(message, type) {
    // 移除已存在的toast
    var existing = document.getElementById('llm-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.id = 'llm-toast';
    toast.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; padding:16px 24px; border-radius:8px; font-size:14px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; align-items:center; gap:10px; animation:slideIn 0.3s ease; max-width:400px;';
    
    if (type === 'success') {
        toast.style.background = '#f0fdf4';
        toast.style.color = '#16a34a';
        toast.style.border = '2px solid #16a34a';
    } else if (type === 'error') {
        toast.style.background = '#fef2f2';
        toast.style.color = '#dc2626';
        toast.style.border = '2px solid #dc2626';
    } else if (type === 'loading') {
        toast.style.background = '#eff6ff';
        toast.style.color = '#2563eb';
        toast.style.border = '2px solid #2563eb';
    }
    
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    // 3秒后自动消失
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ Init ============
checkAuth();
