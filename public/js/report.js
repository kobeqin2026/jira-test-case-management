// 会议纪要（HTML 报告）一键生成 —— 前端逻辑
// 依赖 /api/report/*（routes/report.js）；登录态走 cookie，故 fetch 带 credentials。

(function () {
    var BASE_URL = null;

    function setStatus(msg, isErr) {
        var el = document.getElementById('rp-status');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = isErr ? '#c0392b' : '#777';
    }

    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () {
                var s = String(fr.result || '');
                var i = s.indexOf(',');
                resolve(i >= 0 ? s.slice(i + 1) : s);
            };
            fr.onerror = function () { reject(new Error('读取文件失败')); };
            fr.readAsDataURL(file);
        });
    }

    function chip(label, value, color) {
        return '<div style="min-width:120px;border:1px solid #e6e8eb;border-radius:6px;padding:8px 12px;background:#fff;">'
            + '<div style="font-size:18px;font-weight:700;color:' + (color || '#12395e') + '">' + value + '</div>'
            + '<div style="font-size:12px;color:#7a828c">' + label + '</div></div>';
    }

    window.generateMinutes = async function () {
        var planEl = document.getElementById('rp-plan');
        var weekEl = document.getElementById('rp-week');
        var dateEl = document.getElementById('rp-date');
        var fileEl = document.getElementById('rp-file');
        var btn = document.getElementById('rp-generate');

        var planKey = (planEl.value || '').trim().toUpperCase();
        if (!/^[A-Z0-9]+-\d+$/.test(planKey)) {
            setStatus('请填写合法的 Test Plan Key（例：PROJ-1234）', true);
            return;
        }
        var file = fileEl.files && fileEl.files[0];
        if (!file) {
            setStatus('请选择当周 PPT（.pptx）', true);
            return;
        }
        if (!/\.(pptx|pptm)$/i.test(file.name)) {
            setStatus('只支持 .pptx / .pptm', true);
            return;
        }

        btn.disabled = true;
        setStatus('上传并解析中…（PPT ' + (file.size / 1048576).toFixed(1) + 'MB，JIRA 取数约 10~30 秒）');
        try {
            var b64 = await fileToBase64(file);
            var resp = await fetch('/api/report/generate', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planKey: planKey,
                    week: (weekEl.value || '').trim(),
                    meetingDate: dateEl.value || '',
                    fileName: file.name,
                    fileBase64: b64
                })
            });
            var data = await resp.json();
            if (!resp.ok || !data.success) {
                throw new Error(data.message || ('HTTP ' + resp.status));
            }

            var s = data.summary || {};
            document.getElementById('rp-summary').innerHTML = [
                chip('用例总数', s.total),
                chip('Validated', s.validated, '#1e7d46'),
                chip('执行率', s.rate, '#0b6bcb'),
                chip('进行中', s.running),
                chip('未开始', s.opened),
                chip('Domain 段', s.domains),
                chip('Highest Bug', s.bugs),
                chip('PPT 页数', s.slideCount)
            ].join('');

            var iframe = document.getElementById('rp-preview');
            iframe.srcdoc = data.html;

            var openEl = document.getElementById('rp-open');
            openEl.href = data.url;
            openEl.style.display = '';
            var dlEl = document.getElementById('rp-download');
            dlEl.href = data.url;
            dlEl.setAttribute('download', data.file);
            dlEl.style.display = '';

            document.getElementById('rp-result').style.display = '';
            setStatus('已生成：' + data.file);
            loadHistory();
        } catch (e) {
            setStatus('生成失败：' + (e.message || e), true);
        } finally {
            btn.disabled = false;
        }
    };

    window.printMinutes = function () {
        var iframe = document.getElementById('rp-preview');
        if (iframe && iframe.contentWindow) iframe.contentWindow.print();
    };

    async function loadHistory() {
        var box = document.getElementById('rp-history');
        if (!box) return;
        try {
            var r = await fetch('/api/report/list', { credentials: 'include' });
            var d = await r.json();
            if (!d.success || !d.files.length) {
                box.innerHTML = '<span style="color:#999">暂无历史报告</span>';
                return;
            }
            box.innerHTML = d.files.slice(0, 12).map(function (f) {
                var t = new Date(f.mtime).toLocaleString('zh-CN', { hour12: false });
                return '<div style="padding:4px 0;border-bottom:1px dashed #eee;">'
                    + '<a href="' + f.url + '" target="_blank" style="color:#0b6bcb;">' + f.name + '</a>'
                    + '<span style="color:#999;margin-left:10px;">' + t + ' · ' + (f.size / 1024).toFixed(0) + 'KB</span></div>';
            }).join('');
        } catch (e) {
            box.innerHTML = '<span style="color:#c0392b">历史列表加载失败：' + (e.message || e) + '</span>';
        }
    }

    window.loadReportHistory = loadHistory;

    // Test Plan Key 默认值由 /api/config 下发（REPORT_DEFAULT_PLAN 环境变量注入；公开仓不内置项目 key）
    function prefillPlan() {
        var el = document.getElementById('rp-plan');
        if (!el || el.value) return;
        fetch('/api/config', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (cfg) { if (cfg && cfg.reportPlan && !el.value) el.value = cfg.reportPlan; })
            .catch(function () { /* 没有默认值也不影响手填 */ });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var d = document.getElementById('rp-date');
        if (d && !d.value) d.value = new Date().toISOString().slice(0, 10);
        prefillPlan();
        if (document.getElementById('tab-report')) loadHistory();
    });
})();
