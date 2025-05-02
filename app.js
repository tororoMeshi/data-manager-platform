'use strict';

let COLUMNS = [];
let ADD_BUTTON_LABEL = '追加';
let DELETE_BUTTON_LABEL = '削除';
let currentTheme = {};
let appDataKey = '';

document.addEventListener('DOMContentLoaded', () => {
    const appSelect = document.getElementById('app-select');

    // apps.jsonからアプリ一覧を読み込み
    fetch('apps.json')
        .then(response => response.json())
        .then(appList => {
            appList.apps.forEach(app => {
                const option = document.createElement('option');
                option.value = app.file;
                option.textContent = app.name;
                appSelect.appendChild(option);
            });

            // 最初のアプリを読み込み
            loadApp(appSelect.value);

            appSelect.addEventListener('change', () => {
                loadApp(appSelect.value);
            });
        })
        .catch(error => {
            alert('apps.jsonの読み込みに失敗しました: ' + error);
        });
});

function loadApp(configFile) {
    fetch(configFile)
        .then(response => response.json())
        .then(config => {
            COLUMNS = config.columns;
            ADD_BUTTON_LABEL = config.addButtonLabel || '追加';
            DELETE_BUTTON_LABEL = config.deleteButtonLabel || '削除';
            currentTheme = config.theme || {};
            appDataKey = 'data_' + configFile;

            // validate文字列を関数に変換
            COLUMNS.forEach(col => {
                if (typeof col.validate === 'string') {
                    col.validate = new Function('value', 'return (' + col.validate + ');');
                }
            });

            applyTheme(currentTheme);
            initApp();
        })
        .catch(error => {
            alert(configFile + ' の読み込みに失敗しました: ' + error);
        });
}

function applyTheme(theme) {
    document.body.style.backgroundColor = theme.backgroundColor || '';
    document.documentElement.style.setProperty('--primary-color', theme.primaryColor || '#007bff');
}

function initApp() {
    const form = document.getElementById('dynamic-form');
    const submitButton = document.getElementById('submit-button');
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.querySelector('#data-table tbody');
    const searchBox = document.getElementById('search-box');
    const exportButton = document.getElementById('export-csv');
    const backupButton = document.getElementById('backup-json');
    const restoreInput = document.getElementById('restore-json');

    form.innerHTML = '';
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    submitButton.textContent = ADD_BUTTON_LABEL;
    searchBox.value = '';

    let data = loadData();
    let sortKey = null;
    let sortAsc = true;

    generateForm();
    generateTableHeader();
    renderTable(data);

    function generateForm() {
        const groups = {};
        COLUMNS.forEach(col => {
            const groupName = col.formGroup || 'その他';
            if (!groups[groupName]) {
                const fieldset = document.createElement('fieldset');
                const legend = document.createElement('legend');
                legend.textContent = groupName;
                fieldset.appendChild(legend);
                groups[groupName] = fieldset;
            }

            const label = document.createElement('label');
            label.textContent = col.label + ':';

            const input = document.createElement('input');
            input.type = col.inputType;
            input.name = col.key;
            if (col.required) input.required = true;
            if (col.placeholder) input.placeholder = col.placeholder;

            label.appendChild(input);
            groups[groupName].appendChild(label);
            groups[groupName].appendChild(document.createElement('br'));
        });

        Object.values(groups).forEach(fieldset => {
            form.appendChild(fieldset);
        });
    }

    function generateTableHeader() {
        COLUMNS.forEach(col => {
            if (!col.visibleInTable) return;
            const th = document.createElement('th');
            th.textContent = col.label + ' ▲▼';
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => {
                if (sortKey === col.key) {
                    sortAsc = !sortAsc;
                } else {
                    sortKey = col.key;
                    sortAsc = true;
                }
                sortAndRender();
            });
            tableHeader.appendChild(th);
        });
        const actionTh = document.createElement('th');
        actionTh.textContent = '操作';
        tableHeader.appendChild(actionTh);
    }

    function renderTable(displayData) {
        tableBody.innerHTML = '';
        displayData.forEach((item, index) => {
            const row = document.createElement('tr');

            COLUMNS.forEach(col => {
                if (!col.visibleInTable) return;
                const cell = document.createElement('td');
                cell.textContent = item[col.key] || '';
                row.appendChild(cell);
            });

            const actionCell = document.createElement('td');
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = DELETE_BUTTON_LABEL;
            deleteBtn.addEventListener('click', () => {
                data.splice(index, 1);
                saveData();
                filterAndRender();
            });

            actionCell.appendChild(deleteBtn);
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        });
    }

    function sortAndRender() {
        if (!sortKey) {
            renderTable(data);
            return;
        }
        const sorted = [...data].sort((a, b) => {
            const valA = (a[sortKey] || '').toLowerCase();
            const valB = (b[sortKey] || '').toLowerCase();
            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
        renderTable(sorted);
    }

    function filterAndRender() {
        const keyword = searchBox.value.trim().toLowerCase();
        const filtered = data.filter(item =>
            COLUMNS.some(col => (item[col.key] || '').toLowerCase().includes(keyword))
        );
        renderTable(filtered);
    }

    function saveData() {
        localStorage.setItem(appDataKey, JSON.stringify(data));
    }

    function loadData() {
        const json = localStorage.getItem(appDataKey);
        return json ? JSON.parse(json) : [];
    }

    submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        const newItem = {};
        let errorMessage = '';

        COLUMNS.forEach(col => {
            const value = form[col.key]?.value.trim() || '';
            if (col.required && !value && !errorMessage) {
                errorMessage = `${col.label}は必須です。`;
            }
            if (col.validate && !errorMessage) {
                const result = col.validate(value);
                if (result !== true) {
                    errorMessage = result;
                }
            }
            newItem[col.key] = value;
        });

        if (errorMessage) {
            alert(errorMessage);
            return;
        }

        data.push(newItem);
        saveData();
        filterAndRender();
        form.reset();
    });

    searchBox.addEventListener('input', filterAndRender);

    exportButton.addEventListener('click', () => {
        const headers = COLUMNS.filter(c => c.visibleInTable).map(c => c.label);
        const csv = headers.join(',') + '\n' +
            data.map(item => COLUMNS.filter(c => c.visibleInTable).map(c => item[c.key] || '').join(',')).join('\n');
        download(csv, 'data.csv', 'text/csv');
    });

    backupButton.addEventListener('click', () => {
        const json = JSON.stringify(data, null, 2);
        download(json, 'data-backup.json', 'application/json');
    });

    restoreInput.addEventListener('change', () => {
        const file = restoreInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const imported = JSON.parse(reader.result);
                if (Array.isArray(imported)) {
                    data = imported;
                    saveData();
                    filterAndRender();
                    alert('データを復元しました。');
                } else {
                    alert('不正なファイルです。');
                }
            } catch (e) {
                alert('読み込みエラー: ' + e.message);
            }
        };
        reader.readAsText(file);
    });
}

// ---------- columns.json GUIエディタ ----------
document.getElementById('open-editor').addEventListener('click', () => {
    const json = JSON.stringify({
        columns: COLUMNS,
        addButtonLabel: ADD_BUTTON_LABEL,
        deleteButtonLabel: DELETE_BUTTON_LABEL,
        theme: currentTheme
    }, null, 2);

    const editorWindow = window.open('', '_blank');
    editorWindow.document.write(`
        <html>
        <head>
            <title>アプリ定義エディタ</title>
            <style>
                body { font-family: Arial; margin: 20px; }
                textarea { width: 100%; height: 60vh; }
                ul { list-style-type: none; padding: 0; }
                li { padding: 5px; border: 1px solid #ccc; margin-bottom: 5px; cursor: grab; background: #f9f9f9; }
            </style>
        </head>
        <body>
            <h1>アプリ定義エディタ</h1>
            <ul id="column-list"></ul>
            <button onclick="addColumn()">カラムを追加</button><br><br>
            <button onclick="downloadJSON()">columns.jsonをダウンロード</button>
            <button onclick="generateAppsJSON()">apps.json用コード生成</button>
            <pre id="apps-code"></pre>
            <script>
                const original = ${json};
                const list = document.getElementById('column-list');

                function renderList() {
                    list.innerHTML = '';
                    original.columns.forEach((col, index) => {
                        const li = document.createElement('li');
                        li.textContent = col.label + ' (' + col.key + ')';
                        li.draggable = true;

                        li.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text/plain', index);
                        });

                        li.addEventListener('dragover', (e) => e.preventDefault());

                        li.addEventListener('drop', (e) => {
                            e.preventDefault();
                            const from = e.dataTransfer.getData('text/plain');
                            const to = index;
                            const moved = original.columns.splice(from, 1)[0];
                            original.columns.splice(to, 0, moved);
                            renderList();
                        });

                        const delBtn = document.createElement('button');
                        delBtn.textContent = '削除';
                        delBtn.onclick = () => {
                            original.columns.splice(index, 1);
                            renderList();
                        };

                        li.appendChild(delBtn);
                        list.appendChild(li);
                    });
                }

                renderList();

                function addColumn() {
                    const key = prompt('キー名（英数字）');
                    const label = prompt('表示名');
                    if (!key || !label) return;
                    original.columns.push({
                        key: key,
                        label: label,
                        inputType: 'text',
                        required: false,
                        placeholder: '',
                        formGroup: '',
                        visibleInTable: true
                    });
                    renderList();
                }

                function downloadJSON() {
                    const blob = new Blob([JSON.stringify(original, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'new-columns.json';
                    a.click();
                    URL.revokeObjectURL(url);
                }

                function generateAppsJSON() {
                    const code = '{ "file": "new-columns.json", "name": "' + 
                        (prompt('アプリ名（表示名）') || '新アプリ') + '" }';
                    document.getElementById('apps-code').textContent = code;
                }
            </script>
        </body>
        </html>
    `);
});

// ---------- columns.json インポート機能 ----------
document.getElementById('import-definition').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            const newFileName = prompt('新しいアプリファイル名（例: custom.json）');
            if (!newFileName) return;

            const blob = new Blob([JSON.stringify(imported, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = newFileName;
            a.click();
            URL.revokeObjectURL(url);

            alert('"' + newFileName + '" をダウンロードしました。apps.jsonに追加してください。');
        } catch (e) {
            alert('ファイル読み込みエラー: ' + e.message);
        }
    };
    reader.readAsText(file);
});
