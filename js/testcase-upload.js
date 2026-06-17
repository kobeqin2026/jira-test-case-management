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
        bcParent.textContent = parentSummary || parentKey;
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

    // Owner distribution: vertical stacked bar chart by status
    var ownerStatusMap = {};
    issues.forEach(function(i) {
        var owner = i.assignee || '未分配';
        var comps = i.components || [];
        var label = comps.length > 0 ? comps[0] + '/' + owner : owner;
        var s = i.status || 'Unknown';
        if (!ownerStatusMap[label]) ownerStatusMap[label] = {};
        ownerStatusMap[label][s] = (ownerStatusMap[label][s] || 0) + 1;
    });
    var statusColors = { 'todo': '#95a5a6', 'inprogress': '#3498db', 'done': '#1abc9c', 'validated': '#27ae60', 'closed': '#6c757d', 'blocked': '#e74c3c', 'waived': '#f39c12', 'other': '#9b59b6' };
    var sortedOwners = Object.keys(ownerStatusMap).sort(function(a, b) {
        var totalA = 0, totalB = 0;
        Object.keys(ownerStatusMap[a]).forEach(function(k) { totalA += ownerStatusMap[a][k]; });
        Object.keys(ownerStatusMap[b]).forEach(function(k) { totalB += ownerStatusMap[b][k]; });
        return totalB - totalA;
    }).slice(0, 10);

    var maxOwnerCount = 0;
    sortedOwners.forEach(function(o) {
        var total = 0;
        Object.keys(ownerStatusMap[o]).forEach(function(k) { total += ownerStatusMap[o][k]; });
        if (total > maxOwnerCount) maxOwnerCount = total;
    });

    // Collect all unique normalized statuses for legend
    var allNormStatuses = {};
    sortedOwners.forEach(function(o) {
        Object.keys(ownerStatusMap[o]).forEach(function(k) {
            var ns = normalizeStatus(k);
            allNormStatuses[ns] = k;
        });
    });

    var ownerHtml = '<div class="chart-card chart-wide" style="margin-top:4px;">';
    ownerHtml += '<h3>👤 负责人分布</h3>';
    ownerHtml += '<div class="vbar-chart">';
    sortedOwners.forEach(function(o) {
        var statusMap = ownerStatusMap[o];
        var total = 0;
        Object.keys(statusMap).forEach(function(k) { total += statusMap[k]; });
        var barHeight = maxOwnerCount > 0 ? (total / maxOwnerCount * 100) : 0;
        ownerHtml += '<div class="vbar-col">';
        ownerHtml += '<div class="vbar-count">' + total + '</div>';
        ownerHtml += '<div class="vbar-stack" style="height:' + barHeight + '%;">';
        var statusOrder = ['validated', 'done', 'closed', 'inprogress', 'todo', 'blocked', 'waived', 'other'];
        statusOrder.forEach(function(ns) {
            var origKey = null;
            Object.keys(statusMap).forEach(function(k) { if (normalizeStatus(k) === ns) origKey = k; });
            if (!origKey) return;
            var count = statusMap[origKey];
            var pct = total > 0 ? (count / total * 100) : 0;
            var color = statusColors[ns] || '#95a5a6';
            ownerHtml += '<div class="vbar-segment" style="height:' + pct + '%; background:' + color + ';" title="' + o + ': ' + origKey + ' = ' + count + '"></div>';
        });
        ownerHtml += '</div>';
        ownerHtml += '<div class="vbar-label" title="' + o + '">' + o + '</div>';
        ownerHtml += '</div>';
    });
    ownerHtml += '</div>';
    // Legend
    ownerHtml += '<div class="vbar-legend">';
    var legendOrder = ['validated', 'done', 'closed', 'inprogress', 'todo', 'blocked', 'waived', 'other'];
    legendOrder.forEach(function(ns) {
        if (!allNormStatuses[ns]) return;
        var color = statusColors[ns] || '#95a5a6';
        ownerHtml += '<div class="vbar-legend-item"><span class="vbar-legend-dot" style="background:' + color + ';"></span>' + allNormStatuses[ns] + '</div>';
    });
    ownerHtml += '</div></div>';
    document.getElementById('owner-row').innerHTML = ownerHtml;
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

    // Init component bar charts
    _pendingCompCharts.forEach(function(item) {
        var canvas = document.getElementById(item.canvasId);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
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

// ============ Tab 2: Upload ============

function onUploadProjectChange() {
    var project = document.getElementById('tc-project').value;
    if (project) loadUploadParents();
    else document.getElementById('upload-parent-list').innerHTML = '<div class="empty-state"><p>请选择项目</p></div>';
}

function loadUploadParents() {
    var project = document.getElementById('tc-project').value;
    if (!project) return;
    document.getElementById('upload-parent-list').innerHTML = '<div class="loading">加载中...</div>';

    fetch('/api/testcase/search?project=' + encodeURIComponent(project) + '&issuetype=Task,Test+Plan&maxResults=100', {
        credentials: 'same-origin',
        headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            currentPlans = data.data.issues || [];
            renderUploadParentList();
        }
    });
}

function renderUploadParentList() {
    var container = document.getElementById('upload-parent-list');
    if (currentPlans.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无 Task / Test Plan</p></div>';
        return;
    }
    var html = '<div class="parent-grid">';
    html += '<div class="parent-card' + (selectedPlanKey === '' ? ' selected' : '') + '" onclick="selectUploadPlan(\'\')">';
    html += '<div class="pc-header"><span class="pc-key" style="color:#999;">不关联</span></div>';
    html += '<div class="pc-title" style="color:#999; font-size:13px;">直接创建独立 Issue</div></div>';

    currentPlans.forEach(function(p) {
        var sel = selectedPlanKey === p.key ? ' selected' : '';
        var typeClass = p.issuetype === 'Test Plan' ? 'pc-type-testplan' : 'pc-type-task';
        html += '<div class="parent-card' + sel + '" onclick="selectUploadPlan(\'' + p.key + '\')">';
        html += '<div class="pc-header">';
        html += '<span class="pc-key"><a href="' + p.url + '" target="_blank" onclick="event.stopPropagation()">' + p.key + '</a></span>';
        html += '<span class="pc-type ' + typeClass + '">' + p.issuetype + '</span>';
        html += getStatusBadge(p.status);
        html += '</div>';
        html += '<div class="pc-title">' + escapeHtml(p.summary) + '</div>';
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

function selectUploadPlan(key) {
    selectedPlanKey = key;
    renderUploadParentList();
}

function toggleCreatePlan() {
    var form = document.getElementById('create-plan-form');
    form.style.display = form.style.display === 'none' || !form.style.display ? 'block' : 'none';
}

function createTestPlan() {
    var project = document.getElementById('tc-project').value;
    var name = document.getElementById('new-plan-name').value.trim();
    var desc = document.getElementById('new-plan-desc').value.trim();
    if (!project) { alert('请先选择项目'); return; }
    if (!name) { alert('请输入名称'); return; }

    fetch('/api/testcase/testplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {}) },
        credentials: 'same-origin',
        body: JSON.stringify({ project: project, summary: name, description: desc })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success && data.data) {
            alert('✅ 创建成功: ' + data.data.key);
            selectedPlanKey = data.data.key;
            document.getElementById('new-plan-name').value = '';
            document.getElementById('new-plan-desc').value = '';
            toggleCreatePlan();
            loadUploadParents();
        } else {
            alert('❌ 创建失败: ' + (data.error || '未知错误'));
        }
    });
}

// ============ File Upload & Parse ============

var uploadArea = document.getElementById('upload-area');
var fileInput = document.getElementById('tc-file');

uploadArea.addEventListener('click', function() { fileInput.click(); });
uploadArea.addEventListener('dragover', function(e) { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', function() { uploadArea.classList.remove('dragover'); });
uploadArea.addEventListener('drop', function(e) { e.preventDefault(); uploadArea.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', function() { if (fileInput.files.length > 0) handleFile(fileInput.files[0]); });

function handleFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) { parseCSVData(e.target.result, file.name); };
    reader.readAsText(file, 'UTF-8');
}

function parseCSVData(text, filename) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
    var rows = [], currentRow = [], currentField = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (inQuotes) {
            if (ch === '"') { if (i + 1 < text.length && text[i + 1] === '"') { currentField += '"'; i++; } else { inQuotes = false; } }
            else { currentField += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',' || ch === '\t') { currentRow.push(currentField.trim()); currentField = ''; }
            else if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') { currentRow.push(currentField.trim()); currentField = ''; if (currentRow.length > 0 && currentRow.some(function(c) { return c !== ''; })) rows.push(currentRow); currentRow = []; i++; }
            else if (ch === '\n' || ch === '\r') { currentRow.push(currentField.trim()); currentField = ''; if (currentRow.length > 0 && currentRow.some(function(c) { return c !== ''; })) rows.push(currentRow); currentRow = []; }
            else { currentField += ch; }
        }
    }
    if (currentField) currentRow.push(currentField.trim());
    if (currentRow.length > 0 && currentRow.some(function(c) { return c !== ''; })) rows.push(currentRow);
    if (rows.length < 2) { alert('CSV文件为空或格式不正确'); return; }
    headers = rows[0];
    parsedData = rows.slice(1).map(function(row) { var obj = {}; headers.forEach(function(h, idx) { obj[h] = (row[idx] || '').trim(); }); return obj; });
    uploadArea.innerHTML = '<div class="icon">✅</div><p>已加载 <strong>' + parsedData.length + '</strong> 条记录</p><p class="hint">' + (filename || 'file') + ' (' + headers.length + ' 列)</p>';
    renderPreview();
}

// ============ Preview ============

function renderPreview() {
    if (parsedData.length === 0) return;
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('preview-count').textContent = parsedData.length + ' 条记录';
    var thead = document.getElementById('preview-thead');
    thead.innerHTML = '';
    var headRow = document.createElement('tr');
    var thNum = document.createElement('th'); thNum.textContent = '#'; thNum.style.width = '40px'; headRow.appendChild(thNum);
    headers.forEach(function(h) { var th = document.createElement('th'); th.textContent = h; headRow.appendChild(th); });
    var thStatus = document.createElement('th'); thStatus.textContent = '状态'; thStatus.style.width = '100px'; headRow.appendChild(thStatus);
    thead.appendChild(headRow);
    var tbody = document.getElementById('preview-tbody');
    tbody.innerHTML = '';
    parsedData.forEach(function(row, idx) {
        var tr = document.createElement('tr');
        var tdNum = document.createElement('td'); tdNum.className = 'row-num'; tdNum.textContent = idx + 1; tr.appendChild(tdNum);
        headers.forEach(function(h) { var td = document.createElement('td'); td.textContent = row[h] || ''; td.title = row[h] || ''; td.className = 'editable-cell'; td.setAttribute('data-header', h); td.setAttribute('data-row', idx); td.addEventListener('dblclick', startEditCell); tr.appendChild(td); });
        var tdStatus = document.createElement('td'); tdStatus.className = 'status-pending'; tdStatus.textContent = '待上传'; tdStatus.id = 'status-' + idx; tr.appendChild(tdStatus);
        tbody.appendChild(tr);
    });
    document.getElementById('btn-start-upload').disabled = false;
}

function startEditCell(e) {
    var td = e.target; if (td.querySelector('input')) return;
    var header = td.getAttribute('data-header'), rowIdx = parseInt(td.getAttribute('data-row'));
    var oldValue = parsedData[rowIdx][header] || '';
    var input = document.createElement('input'); input.type = 'text'; input.className = 'cell-edit-input'; input.value = oldValue;
    input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') finishEdit(td, input, rowIdx, header); else if (ev.key === 'Escape') td.removeChild(input); });
    input.addEventListener('blur', function() { finishEdit(td, input, rowIdx, header); });
    td.appendChild(input); input.focus(); input.select();
}

function finishEdit(td, input, rowIdx, header) {
    var newValue = input.value.trim(); parsedData[rowIdx][header] = newValue; td.textContent = newValue; td.title = newValue;
}

// ============ Batch Upload ============

function startBatchUpload() {
    var project = document.getElementById('tc-project').value;
    if (!project) { alert('请先选择目标项目'); return; }
    if (parsedData.length === 0) { alert('没有可上传的数据'); return; }
    var issues = parsedData.map(function(row) {
        var issue = { summary: row['标题'] || row['summary'] || row['名称'] || '', description: row['描述'] || row['description'] || '', issuetype: row['Issue类型'] || row['类型'] || row['issuetype'] || document.getElementById('tc-issuetype').value, priority: row['优先级'] || row['priority'] || document.getElementById('tc-priority').value, labels: row['标签'] || row['labels'] || '', assignee: row['负责人'] || row['assignee'] || document.getElementById('tc-assignee').value, parentKey: row['父任务Key'] || row['parent'] || row['父任务'] || '' };
        if (selectedPlanKey && !issue.parentKey) { issue.parentKey = selectedPlanKey; if (!row['Issue类型'] && !row['类型'] && !row['issuetype']) issue.issuetype = 'Sub-task'; }
        return issue;
    });
    var validIssues = issues.filter(function(iss) { return iss.summary; });
    if (validIssues.length === 0) { alert('所有记录都缺少标题'); return; }

    document.getElementById('progress-section').style.display = 'block';
    document.getElementById('summary-section').style.display = 'none';
    document.getElementById('btn-start-upload').disabled = true;
    uploadResults = [];
    var total = validIssues.length, completed = 0, successCount = 0, failCount = 0;
    var logEl = document.getElementById('progress-log'); logEl.innerHTML = '';
    var batchSize = 10, batches = [];
    for (var i = 0; i < validIssues.length; i += batchSize) batches.push(validIssues.slice(i, i + batchSize));
    var batchIdx = 0;

    function processNextBatch() {
        if (batchIdx >= batches.length) { updateProgress(total, total, successCount, failCount); showSummary(total, successCount, failCount); document.getElementById('btn-start-upload').disabled = false; return; }
        var batch = batches[batchIdx++];
        fetch('/api/testcase/batch-create', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {}) }, credentials: 'same-origin', body: JSON.stringify({ project: project, issues: batch }) })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.data) {
                data.data.results.forEach(function(r) { completed++; successCount++; uploadResults.push(r); updateStatusCell(r.row - 1, 'created', r.key, r.url); addLog('✅ Row ' + r.row + ': ' + r.key + ' — ' + r.summary, 'ok'); });
                data.data.errors.forEach(function(err) { completed++; failCount++; updateStatusCell(err.row - 1, 'failed'); addLog('❌ Row ' + err.row + ': ' + err.summary + ' — ' + err.error, 'err'); });
            } else { batch.forEach(function() { completed++; failCount++; }); }
            updateProgress(total, completed, successCount, failCount);
            processNextBatch();
        })
        .catch(function(e) { batch.forEach(function() { completed++; failCount++; addLog('❌ 网络错误: ' + e.message, 'err'); }); updateProgress(total, completed, successCount, failCount); processNextBatch(); });
    }
    addLog('🚀 开始上传 ' + total + ' 条到 ' + project, 'ok');
    processNextBatch();
}

function updateProgress(total, completed) {
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-current').textContent = completed + ' / ' + total;
    document.getElementById('progress-percent').textContent = pct + '%';
}

function updateStatusCell(rowIdx, status, key, url) {
    var cell = document.getElementById('status-' + rowIdx); if (!cell) return;
    if (status === 'created') { cell.className = 'status-created'; cell.innerHTML = '<a href="' + url + '" target="_blank">' + key + '</a>'; }
    else { cell.className = 'status-failed'; cell.textContent = '❌'; }
}

function addLog(text, type) {
    var logEl = document.getElementById('progress-log'); var line = document.createElement('div'); line.className = type === 'ok' ? 'log-ok' : 'log-err'; line.textContent = text; logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
}

function showSummary(total, success, fail) {
    document.getElementById('summary-section').style.display = 'block';
    document.getElementById('sum-total').textContent = total;
    document.getElementById('sum-success').textContent = success;
    document.getElementById('sum-fail').textContent = fail;
}

function downloadTemplate() { window.location.href = '/api/testcase/template'; }

// ============ Init ============
checkAuth();
