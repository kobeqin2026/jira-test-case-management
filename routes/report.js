// 会议纪要 HTML 报告生成
// POST /api/report/generate  { planKey, week, meetingDate, fileName, fileBase64 }
//   -> 解析上传的当周 pptx + 拉 JIRA 当下用例进度 -> 生成自包含 HTML 会议纪要
// GET  /api/report/list      -> 已生成报告列表
// GET  /api/report/file/:n   -> 下载/预览某一份报告
//
// 说明：本模块只读 JIRA（GET），不写任何 JIRA 数据；pptx 解析走 python3 + python-pptx
// （scripts/pptx_extract.py），本机 python3 已装 python-pptx 1.0.2。

var express = require('express');
var router = express.Router();
var fs = require('fs');
var os = require('os');
var path = require('path');
var { execFile } = require('child_process');
var jiraCfg = require('../lib/jiraConfig');
var auth = require('../middleware/auth');

var CF_PS = 'customfield_10300';
var CF_PE = 'customfield_10301';
var REPORTS_DIR = path.join(__dirname, '..', 'data', 'reports');
var DONE = ['Validated', 'Closed', 'Done', 'Resolved'];
var RUNNING = ['进行中', 'In Progress', 'In Review', 'Reopened'];

// ---------------------------------------------------------------- JIRA 访问
function jiraGet(apiPath) {
    var url = jiraCfg.baseUrl.replace(/\/$/, '') + apiPath;
    var headers = { 'Accept': 'application/json' };
    if (jiraCfg.pat) headers['Authorization'] = 'Bearer ' + jiraCfg.pat;
    return fetch(url, { headers: headers }).then(function (r) {
        if (!r.ok) {
            return r.text().then(function (t) {
                throw new Error('JIRA ' + apiPath + ' -> HTTP ' + r.status + ' ' + t.slice(0, 200));
            });
        }
        return r.json();
    });
}

function jiraSearch(jql, fields, limit) {
    limit = limit || 2000;
    var got = [];
    function page(start) {
        var q = '/rest/api/2/search?jql=' + encodeURIComponent(jql)
            + '&fields=' + encodeURIComponent(fields.join(','))
            + '&maxResults=100&startAt=' + start;
        return jiraGet(q).then(function (d) {
            got = got.concat(d.issues || []);
            var total = d.total || 0;
            if (got.length >= Math.min(total, limit) || !(d.issues || []).length) return got;
            return page(start + 100);
        });
    }
    return page(0);
}

function nm(x) { return x && typeof x === 'object' ? x.name : x; }
function disp(x) { return x && typeof x === 'object' ? x.displayName : x; }

// ------------------------------------------------------------- 计划/用例统计
function subPlanKeys(planKey) {
    return jiraGet('/rest/api/2/issue/' + planKey + '?fields=issuelinks').then(function (d) {
        var keys = [];
        ((d.fields && d.fields.issuelinks) || []).forEach(function (l) {
            if (l.outwardIssue && l.outwardIssue.key !== planKey) keys.push(l.outwardIssue.key);
        });
        return jiraSearch('parent = ' + planKey, ['key']).then(function (issues) {
            issues.forEach(function (i) { if (keys.indexOf(i.key) === -1) keys.push(i.key); });
            return keys;
        });
    });
}

function planStats(keys) {
    if (!keys.length) return Promise.resolve({ plans: [], totals: {} });
    var jql = 'parent in (' + keys.join(',') + ')';
    return jiraSearch(jql, ['key', 'status', 'priority', 'parent', CF_PS, CF_PE]).then(function (issues) {
        var byPlan = {};
        keys.forEach(function (k) { byPlan[k] = { total: 0, validated: 0, waived: 0, running: 0, opened: 0 }; });
        var prio = {};
        issues.forEach(function (i) {
            var f = i.fields || {};
            var pk = f.parent && f.parent.key;
            var st = nm(f.status) || '';
            var pr = nm(f.priority) || '-';
            prio[pr] = prio[pr] || { total: 0, validated: 0 };
            prio[pr].total++;
            if (!byPlan[pk]) return;
            byPlan[pk].total++;
            if (st === 'WAIVED') byPlan[pk].waived++;
            else if (DONE.indexOf(st) >= 0) { byPlan[pk].validated++; prio[pr].validated++; }
            else if (RUNNING.indexOf(st) >= 0) byPlan[pk].running++;
            else byPlan[pk].opened++;
        });
        return Promise.all(keys.map(function (k) {
            return jiraGet('/rest/api/2/issue/' + k + '?fields=summary,components,assignee,' + CF_PS + ',' + CF_PE)
                .then(function (d) {
                    var f = d.fields || {};
                    var s = byPlan[k];
                    var rate = s.total ? (100 * s.validated / s.total) : 0;
                    return {
                        key: k,
                        name: f.summary,
                        component: (f.components || []).map(nm).join(', '),
                        assignee: disp(f.assignee),
                        total: s.total, validated: s.validated, waived: s.waived,
                        running: s.running, opened: s.opened,
                        rate: rate,
                        rateStr: (Math.round(rate * 10) / 10).toFixed(2) + '%',
                        ps: (f[CF_PS] || '').slice(0, 10), pe: (f[CF_PE] || '').slice(0, 10)
                    };
                });
        })).then(function (plans) {
            var t = { total: 0, validated: 0, waived: 0, running: 0, opened: 0 };
            plans.forEach(function (p) {
                t.total += p.total; t.validated += p.validated;
                t.waived += p.waived; t.running += p.running; t.opened += p.opened;
            });
            t.rate = t.total ? 100 * t.validated / t.total : 0;
            t.rateStr = t.rate.toFixed(2) + '%';
            t.prio = prio;
            return { plans: plans, totals: t };
        });
    });
}

function highestBugs(project, meetingDate, limit) {
    var jql = 'project = ' + project + ' AND issuetype = Bug AND priority = Highest AND created <= "' + meetingDate + '" ORDER BY created DESC';
    return jiraSearch(jql, ['key', 'summary', 'status', 'priority', 'components', 'assignee',
        'created', 'resolutiondate', 'updated'], limit || 20)
        .then(function (issues) { return issues; })
        .catch(function () { return []; });
}

// ---------------------------------------------------------------- pptx 解析
function extractDeck(filePath) {
    var script = path.join(__dirname, '..', 'scripts', 'pptx_extract.py');
    return new Promise(function (resolve, reject) {
        execFile('python3', [script, filePath], { maxBuffer: 32 * 1024 * 1024, timeout: 120000 },
            function (err, stdout, stderr) {
                if (err) return reject(new Error('pptx 解析失败: ' + (stderr || err.message).slice(0, 400)));
                try { resolve(JSON.parse(stdout)); } catch (e) {
                    reject(new Error('pptx 解析输出非 JSON: ' + stdout.slice(0, 200)));
                }
            });
    });
}

// ------------------------------------------------------------ 域块抽取规则
// 域页标题形如 "<项目KEY> [<Domain>] FE Status" / "<Domain> FE Status"（项目前缀任意，不写死具体项目）
// 注意：前缀必须单独用「大小写敏感」的全大写规则剥离 —— 早期合并成一个 /i 正则时，
// "Board Power FE Status" 里的 "Board" 会被当成项目前缀吃掉，域名叫成 "Power"（v1.9.1 修）。
var DOMAIN_BRACKET_RE = /^(?:\S+\s*)?\[([^\]]+)\]\s*FE\s*Status/i;   // 前缀可有可无: "PROJ [KMD] FE Status" / "[KMD] FE Status"
var DOMAIN_PLAIN_RE = /^([A-Za-z0-9 \/&\.\-]+?)\s*FE\s*Status/i;
var PROJECT_PREFIX_RE = /^[A-Z][A-Z0-9]{2,}\s+/;
var KEY_RE_SRC = '[A-Z][A-Z0-9]{1,9}-\\d+';          // 通用 issue key 形态: PROJ-123
var TRIAGE_RE = /bug triage|highest bug|high bug|bug 状态/i;

function isFeatureTable(t) {
    var h = (t.rows[0] || []).join('|').toLowerCase();
    return /feature list|task list/.test(h) || (t.rows[0] || []).length >= 4;
}
function isBugTable(t) {
    var h = (t.rows[0] || []).join('|').toLowerCase();
    return /jira no|jira id/.test(h);
}
function cleanCell(t) {
    return String(t || '')
        .replace(new RegExp('\\[(' + KEY_RE_SRC + ')\\]\\s*[^|｜]{0,80}?-\\s*Jira', 'gi'), '$1')
        .replace(new RegExp('https?://[^\\s]*?/browse/(' + KEY_RE_SRC + ')', 'g'), '$1')   // URL -> 纯 key
        .replace(/\s+/g, ' ')
        .replace(/\s+([:：])/g, '$1')      // "1455 :" -> "1455:"
        .replace(/：\s*：/g, '：')
        .trim();
}

var OK_RE = /done|validated|pass|ok|complete|已完成|验证通过/i;
var BAD_RE = /in ?progress|ongoing|测试中|开发中|debug|debu|待测|pending|blocked|未开始/i;

var PURE_STATUS = ['validated', 'done', 'complete', 'completed', 'ok', 'pass', 'passed',
    'inprogress', 'ongoing', 'wip', 'closed', 'resolved', '测试中', '进行中', '已完成',
    '验证通过', '已关闭', '待验证'];

// 只把这些"纯状态词"当冗余去掉；带数字/百分比/额外说明的（如"测试中，目前进度80%"）继续显示
// deck 里常把"没有值"写成 "/"、"-"、"—"，这些不拼进正文
var PLACEHOLDER_RE = /^(?:[-–—\/\\|~_.\s]*|n\/?a|none|null|无|待定)$/i;
function isPlaceholder(v) { return PLACEHOLDER_RE.test(String(v == null ? '' : v).trim()); }

// 优先级不是"内容"，别拼进正文（deck 的第 3 列常是 Priority）
var PRIORITY_RE = /^(?:highest|high|medium|low|mid|trivial|p0|p1|p2|blocker)$/i;
function isPriority(v) { return PRIORITY_RE.test(String(v == null ? '' : v).trim()); }

function isPureStatus(st) {
    var t = String(st || '').trim()
        .replace(/^[-–—:：\s]+/, '')
        .replace(/[()（）\s]/g, '')
        .toLowerCase();
    return PURE_STATUS.indexOf(t) >= 0;
}

function statusTag(st) {
    if (!st || isPureStatus(st)) return '';
    return ' ' + esc(st);          // 只保留有信息量的说明，且是普通黑字（不做徽章/着色）
}

function domainOf(slide) {
    var title = (slide.title || '').replace(/\x0b/g, ' ');
    var m = DOMAIN_BRACKET_RE.exec(title) || DOMAIN_PLAIN_RE.exec(title);
    if (!m) return null;
    var name = m[1].trim().replace(/\s+/g, ' ').replace(PROJECT_PREFIX_RE, '');
    if (!name) return null;
    if (/^PHE$/i.test(name)) name = 'Board（PHE）';
    if (/^Board Power$/i.test(name)) name = 'Board (Power)';
    return name;
}

function collectDomains(deck, projectPrefix) {
    var domains = [];
    var index = {};
    deck.slides.forEach(function (sl) {
        if (TRIAGE_RE.test(sl.title || '')) return;
        if (sl.index <= 2) return;
        var name = domainOf(sl);
        if (!name) return;
        var d = index[name];
        if (!d) {
            d = index[name] = { name: name, order: domains.length, validated: [], progress: [], hot: [], notes: [], status: sl.status };
            domains.push(d);
        }
        (sl.tables || []).forEach(function (t) {
            var rows = t.rows || [];
            if (!rows.length) return;
            if (isBugTable(t)) {
                rows.slice(1).forEach(function (r) {
                    if ((r[1] || '').trim()) {
                        var hk = cleanCell(r[1]);
                        if (/^\d+$/.test(hk) && projectPrefix) hk = projectPrefix + '-' + hk;
                        var hd = cleanCell(r[2]);
                        d.hot.push({ key: hk, desc: isPlaceholder(hd) ? '' : hd,
                                     prio: cleanCell(r[3]), assignee: cleanCell(r[4]), debug: cleanCell(r[5]) });
                    }
                });
            } else if (isFeatureTable(t)) {
                rows.slice(1).forEach(function (r) {
                    var cells = r.filter(function (c) { return c && c.trim(); });
                    if (cells.length < 2) return;
                    if (/^(?:\d+|-|\/)$/.test(cleanCell(r[1] || r[0]))) return;
                    var status = cleanCell(r[r.length - 1]);
                    var task = cleanCell(r[1] || r[0]).replace(/[：:]\s*$/, '');
                    var extra = cleanCell(r[2]);
                    if (extra === status || isPlaceholder(extra) || isPriority(extra) || extra === task) extra = '';
                    if (/^-\s+/.test(status)) status = status.replace(/^-\s+/, '');
                    if (isPlaceholder(task)) return;
                    var text = extra ? task + '：' + extra : task;
                    if (new RegExp('^' + KEY_RE_SRC + '$').test(status)) status = '见 hot issue';
                    var item = { text: text, status: status };
                    if (BAD_RE.test(status) || (!OK_RE.test(status) && status)) d.progress.push(item);
                    else d.validated.push(item);
                });
            }
        });
        (sl.texts || []).forEach(function (tx) {
            if (!/highlight|hot issue/i.test(tx)) return;
            var kept = tx.split('\n').map(function (l) { return l.trim(); })
                .filter(function (l) {
                    if (!l) return false;
                    if (/^(FE Status )?Highlights?:?$/i.test(l)) return false;
                    if (/^Hot Issues?:?$/i.test(l)) return false;
                    if (/^(?:\d+%?|-|\/|\d+\/\d+)$/.test(l)) return false;   // "40%"、"-" 这类噪声
                    return true;
                });
            if (kept.length) d.notes.push(kept.join(' / '));
        });
    });
    return domains;
}

// ------------------------------------------------------------------ HTML 渲染
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function linkify(s) {
    s = String(s == null ? '' : s).replace(new RegExp('https?://[^\\s<>]*?/browse/(' + KEY_RE_SRC + ')', 'g'), '$1');
    return esc(s).replace(new RegExp('\\b(' + KEY_RE_SRC + ')\\b', 'g'), function (k) {
        return '<a href="' + jiraCfg.baseUrl.replace(/\/$/, '') + '/browse/' + k + '" target="_blank">' + k + '</a>';
    });
}
function linkifyPlain(s) {
    // 已含 <url> 形态的文本：把 KEY <url> 收敛成 KEY 链接，URL 不显示
    return linkify(String(s).replace(/<\s*(https?:\/\/[^>]+)\s*>/g, ''));
}

function renderReport(model) {
    var t = model.totals;
    var PRIO_ORDER = ['Highest', 'High', 'Medium', 'Low', 'Trivial'];
    var prioRows = Object.keys(t.prio || {}).sort(function (a, b) {
        var ia = PRIO_ORDER.indexOf(a), ib = PRIO_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }).map(function (p) {
        var v = t.prio[p];
        var r = v.total ? (100 * v.validated / v.total).toFixed(1) : '0.0';
        return '<tr><td>' + esc(p) + '</td><td>' + v.total + '</td><td>' + v.validated + '</td><td>' + r + '%</td></tr>';
    }).join('');

    var domainHtml = model.domains.map(function (d, i) {
        var rows = [];
        if (d.validated.length) {
            rows.push('<div class="ln"><b>Validated：</b>' + d.validated.map(function (x) {
                return linkifyPlain(x.text) + statusTag(x.status);
            }).join(' ｜ ') + '</div>');
        }
        if (d.progress.length) {
            rows.push('<div class="ln"><b>In Progress：</b>' + d.progress.map(function (x) {
                return linkifyPlain(x.text) + statusTag(x.status);
            }).join(' ｜ ') + '</div>');
        }
        if (d.hot.length) {
            rows.push('<div class="ln"><b>Hot issue：</b>' + d.hot.map(function (h) {
                return '<a class="jira" href="' + jiraCfg.baseUrl.replace(/\/$/, '') + '/browse/' + esc(h.key) + '" target="_blank">' + esc(h.key) + '</a> '
                    + esc(h.desc) + (h.prio ? '（' + esc(h.prio) + (h.assignee ? ', ' + esc(h.assignee) : '') + '）' : '')
                    + (h.debug ? '<div class="dbg">' + linkify(h.debug) + '</div>' : '');
            }).join('') + '</div>');
        }
        if (d.notes && d.notes.length) {
            var hi = d.notes.filter(function (n) { return !/hot issue/i.test(n); })
                .map(function (n) { return linkifyPlain(n.replace(/\n/g, ' / ')); });
            if (hi.length) rows.push('<div class="ln"><b>Highlights：</b>' + hi.join(' ｜ ') + '</div>');
        }
        if (!rows.length) {
            rows.push('<div class="ln muted">（该域本周无结构化表格，内容见 PPT 原文）</div>');
        }
        return '<section class="domain"><h3>' + (i + 1) + ') ' + esc(d.name) + '</h3>' + rows.join('') + '</section>';
    }).join('');

    var planRows = model.plans.map(function (p) {
        return '<tr><td class="k">' + linkify(p.key) + '</td><td>' + esc(p.name) + '</td>'
            + '<td class="n">' + p.total + '</td><td class="n">' + p.validated + '</td>'
            + '<td class="n">' + p.rateStr + '</td><td class="n">' + p.opened + '</td>'
            + '<td class="n">' + p.running + '</td><td class="n">0</td><td class="n">' + p.waived + '</td><td class="n">0</td></tr>';
    }).join('');

    var bugRows = model.bugs.map(function (b, i) {
        var f = b.fields || {};
        return '<tr><td class="n">' + (i + 1) + '</td><td class="k">' + linkify(b.key) + '</td>'
            + '<td>' + esc(f.summary) + '</td><td>' + esc(nm(f.priority) || '') + '</td>'
            + '<td>' + esc((f.components || []).map(nm).join(', ')) + '</td>'
            + '<td>' + esc(disp(f.assignee) || '') + '</td>'
            + '<td>' + esc(nm(f.status) || '') + ' / ' + esc((f.resolutiondate || f.updated || '').slice(0, 10)) + '</td></tr>';
    }).join('');

    return '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
        + '<title>' + esc(model.planKey) + ' ' + esc(model.week) + ' 会议纪要</title>'
        + '<style>'
        + 'body{font-family:"Microsoft YaHei",Calibri,Arial,sans-serif;color:#1a1a1a;max-width:1180px;margin:0 auto;padding:28px 31px;line-height:1.65}'
        + 'h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e6e8eb}'
        + 'h3{font-size:15px;margin:16px 0 6px;color:#000}'
        + 'table{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}'
        + 'th,td{border:1px solid #dcdfe4;padding:5px 7px;vertical-align:top;text-align:left}'
        + 'th{background:#f2f4f7;font-weight:600}td.n{text-align:right;white-space:nowrap}td.k{white-space:nowrap}'
        + 'a{color:#0b6bcb;text-decoration:none}a:hover{text-decoration:underline}'
        + '.meta{background:#f8fafc;border:1px solid #e6e8eb;border-radius:6px;padding:12px 16px;font-size:13px;margin:14px 0 6px}'
        + '.cards{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0 4px}'
        + '.card{flex:1;min-width:132px;border:1px solid #e6e8eb;border-radius:6px;padding:10px 14px;background:#fff}'
        + '.card .v{font-size:22px;font-weight:700;color:#12395e}.card .l{font-size:12px;color:#7a828c}'
        + '.domain{border-left:3px solid #c9ced6;padding:2px 0 2px 12px;margin:10px 0}'
        + '.ln{margin:3px 0;font-size:13.5px;color:#000}.dbg{color:#000;font-size:12.5px;margin:2px 0 6px 14px}'
        + '.domain{font-family:"DengXian","等线","Microsoft YaHei",Calibri,Arial,sans-serif;font-size:12pt}'
        + '.domain, .domain *{color:#000;font-family:inherit;font-size:12pt}'
        + '.domain h3{font-weight:700;font-size:12pt;margin:18px 0 6px}'
        + '.domain a{color:#0b6bcb;text-decoration:underline}'
        + '.tag{font-size:11px;padding:1px 6px;border-radius:9px;white-space:nowrap;color:#000;border:1px solid #c9ced6}'
        + '.muted{color:#8a919a}.note{font-size:12.5px;color:#5a6472}'
        + '@media print{body{padding:0}h2{page-break-after:avoid}.domain{page-break-inside:avoid}}'
        + '</style></head><body>'
        + '<h1>' + esc(model.title) + '</h1>'
        + '<div class="meta">'
        + '<div>Test plan：' + linkify(model.planKey) + ' ' + esc(model.planName || '') + '</div>'
        + '<div>会议：' + esc(model.meetingDate) + '（' + esc(model.week) + '）　材料：' + esc(model.fileName || '-') + '（' + model.slideCount + ' 页）</div>'
        + '<div>数据源：JIRA ' + esc(jiraCfg.baseUrl) + ' 实时拉取于 ' + esc(model.generatedAt) + '；正文结构与 domain 内容取自当周 PPT</div>'
        + '</div>'
        + '<h2>一、整体进展</h2>'
        + '<div class="cards">'
        + '<div class="card"><div class="v">' + t.total + '</div><div class="l">用例总数（' + model.plans.length + ' 个计划）</div></div>'
        + '<div class="card"><div class="v">' + t.validated + '</div><div class="l">Validated</div></div>'
        + '<div class="card"><div class="v">' + t.rateStr + '</div><div class="l">执行率（Validated / 总数）</div></div>'
        + '<div class="card"><div class="v">' + t.running + '</div><div class="l">进行中</div></div>'
        + '<div class="card"><div class="v">' + t.opened + '</div><div class="l">未开始</div></div>'
        + '<div class="card"><div class="v">' + t.waived + '</div><div class="l">WAIVED</div></div>'
        + '</div>'
        + '<div class="note">计划周期：' + esc(model.period || '-') + '；优先级分布见下表。</div>'
        + '<table><thead><tr><th>Priority</th><th>用例数</th><th>Validated</th><th>执行率</th></tr></thead><tbody>' + prioRows + '</tbody></table>'
        + '<h2>二、各 Domain 状态（取自当周 PPT）</h2>' + (domainHtml || '<div class="muted">未从 PPT 识别到 Domain 页</div>')
        + '<h2>三、用例执行明细（JIRA 实时）</h2>'
        + '<table><thead><tr><th>Domain Key</th><th>Domain 名称</th><th>用例总数</th><th>已执行(Validated)</th><th>执行率</th>'
        + '<th>未开始</th><th>进行中</th><th>已完成未验证</th><th>已豁免</th><th>阻塞/其他</th></tr></thead>'
        + '<tbody>' + planRows + '</tbody></table>'
        + '<h2>四、Highest bug triage（JIRA 快照）</h2>'
        + (bugRows ? '<table><thead><tr><th>#</th><th>JIRA ID</th><th>描述</th><th>Priority</th><th>Component</th><th>Assignee</th><th>状态 / 日期</th></tr></thead><tbody>' + bugRows + '</tbody></table>'
            : '<div class="muted">未取到 Highest bug</div>')
        + '<h2>五、数据核对说明</h2><ul class="note">'
        + '<li>用例统计为 JIRA 实时口径：共 ' + t.total + ' 条，Validated ' + t.validated + ' 条 → 执行率 ' + t.rateStr + '（WAIVED ' + t.waived + ' 条不计入分子）。</li>'
        + '<li>Domain 段落与 Bug hot issue 取自上传 PPT 的对应页面；PPT 里未给 key 的条目不会自动出现在本表。</li>'
        + '<li>若 PPT 数字与上表不一致，以 JIRA 为准（PPT 为上周五快照）。</li>'
        + '</ul>'
        + '<div class="note" style="margin-top:18px">生成时间：' + esc(model.generatedAt) + '　·　本报告由 JIRA Test Case Manager 一键生成（只读 JIRA，未修改任何数据）</div>'
        + '</body></html>';
}

// -------------------------------------------------------------------- routes
router.post('/generate', auth.authenticateToken, function (req, res) {
    var body = req.body || {};
    var planKey = (body.planKey || '').trim().toUpperCase();
    var fileName = body.fileName || 'deck.pptx';
    var meetingDate = (body.meetingDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    var week = body.week || '';
    if (!/^[A-Z0-9]+-\d+$/.test(planKey)) {
        return res.status(400).json({ success: false, message: 'planKey 不合法（例：PROJ-1234）' });
    }
    if (!body.fileBase64) {
        return res.status(400).json({ success: false, message: '缺少 pptx 文件内容（fileBase64）' });
    }
    var buf = Buffer.from(body.fileBase64, 'base64');
    if (buf.length < 1000) {
        return res.status(400).json({ success: false, message: 'pptx 文件为空或过小' });
    }
    var tmp = path.join(os.tmpdir(), 'report_' + Date.now() + '.pptx');
    fs.writeFileSync(tmp, buf);

    var projectKey = planKey.split('-')[0];
    var model = { planKey: planKey, meetingDate: meetingDate, week: week, fileName: fileName };

    jiraGet('/rest/api/2/issue/' + planKey + '?fields=summary').then(function (d) {
        model.planName = (d.fields || {}).summary || '';
        return extractDeck(tmp);
    }).then(function (deck) {
        model.slideCount = deck.slides.length;
        model.domains = collectDomains(deck, projectKey);
        if (!model.week) {
            var m = /WW\s*(\d+)/i.exec(deck.slides.length ? (deck.slides[0].title || '') : '');
            model.week = m ? 'WW' + m[1] : 'WW--';
        }
        model.title = planKey + ' ' + model.week + ' 会议纪要';
        return subPlanKeys(planKey);
    }).then(function (keys) {
        return planStats(keys);
    }).then(function (st) {
        model.plans = st.plans;
        model.totals = st.totals;
        var ps = st.plans.map(function (p) { return p.ps; }).filter(Boolean).sort();
        var pe = st.plans.map(function (p) { return p.pe; }).filter(Boolean).sort();
        model.period = (ps.length ? ps[0] : '-') + ' ~ ' + (pe.length ? pe[pe.length - 1] : '-');
        return highestBugs(projectKey, meetingDate, 20);
    }).then(function (bugs) {
        model.bugs = bugs;
        model.generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
        var html = renderReport(model);
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        var name = planKey + '-' + (model.week || 'WW--') + '-' + meetingDate.replace(/-/g, '') + '-' + Date.now() + '.html';
        fs.writeFileSync(path.join(REPORTS_DIR, name), html, 'utf8');
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
        res.json({
            success: true,
            file: name,
            url: '/api/report/file/' + encodeURIComponent(name),
            html: html,
            summary: {
                planKey: planKey, week: model.week, meetingDate: meetingDate,
                slideCount: model.slideCount, domains: model.domains.length,
                plans: model.plans.length, total: model.totals.total,
                validated: model.totals.validated, rate: model.totals.rateStr,
                running: model.totals.running, opened: model.totals.opened,
                waived: model.totals.waived, bugs: model.bugs.length
            }
        });
    }).catch(function (e) {
        try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
        res.status(500).json({ success: false, message: e.message || String(e) });
    });
});

router.get('/list', auth.authenticateToken, function (req, res) {
    try {
        if (!fs.existsSync(REPORTS_DIR)) return res.json({ success: true, files: [] });
        var files = fs.readdirSync(REPORTS_DIR).filter(function (f) { return /\.html$/.test(f); })
            .map(function (f) {
                var st = fs.statSync(path.join(REPORTS_DIR, f));
                return { name: f, size: st.size, mtime: st.mtime.toISOString(), url: '/api/report/file/' + encodeURIComponent(f) };
            }).sort(function (a, b) { return a.mtime < b.mtime ? 1 : -1; });
        res.json({ success: true, files: files });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/file/:name', auth.authenticateToken, function (req, res) {
    var name = path.basename(req.params.name || '');
    var fp = path.join(REPORTS_DIR, name);
    if (!/\.html$/.test(name) || !fs.existsSync(fp)) {
        return res.status(404).send('not found');
    }
    res.type('html').send(fs.readFileSync(fp, 'utf8'));
});

module.exports = router;
