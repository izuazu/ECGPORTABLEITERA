document.addEventListener('DOMContentLoaded', () => {
    const MQTT_BROKER = 'e81af177c9af406794c5f43addea8b52.s1.eu.hivemq.cloud';
    const MQTT_PORT = 8884;
    const MQTT_PATH = '/mqtt';
    const MQTT_USERNAME = 'ekgitera';
    const MQTT_PASSWORD = 'Itera123';
    const ECG_TOPIC = 'ekg/data';
    const BPM_TOPIC = 'ekg/bpm';
    const STATUS_TOPIC = 'ekg/status';

    const connectionStatusEl = document.getElementById('connection-status');
    const bpmValueEl = document.getElementById('bpm-value');
    const statusValueEl = document.getElementById('status-value');
    const statusCardEl = document.getElementById('status-card');
    const modalReset = document.getElementById('modal-reset');
    const modalNoData = document.getElementById('modal-nodata');
    const modalAction = document.getElementById('modal-action');

    const MAX_CHART_POINTS = 100;
    
    let processedLog = [], ecgChart;
    let currentBpm = "", currentStatus = "";
    let pendingAction = null;

    function initCharts() {
        const ecgCtx = document.getElementById('ecgChart').getContext('2d');
        ecgChart = new Chart(ecgCtx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Sinyal EKG', data: [], borderColor: 'rgb(75, 192, 192)', borderWidth: 1.5, pointRadius: 0, tension: 0.1 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { display: false }, y: { min: -2, max: 2, beginAtZero: false, ticks: { stepSize: 0.5 } } } }
        });
    }

    function updateConnectionStatus(msg, isConnected) {
        connectionStatusEl.textContent = msg;
        connectionStatusEl.style.color = isConnected ? 'var(--green-strong)' : 'var(--red-strong)';
    }

    function connectMqtt() {
        const clientId = 'web-dashboard-' + Math.random().toString(16).substr(2, 8);
        updateConnectionStatus('Connecting...', false);
        const client = new Paho.MQTT.Client(MQTT_BROKER, MQTT_PORT, MQTT_PATH, clientId);

        client.onConnectionLost = res => {
            if (res.errorCode !== 0) {
                updateConnectionStatus('Disconnected. Retrying...', false);
                setTimeout(connectMqtt, 5000);
            }
        };

        client.onMessageArrived = msg => {
            const topic = msg.destinationName;
            const payload = msg.payloadString;

            if (topic === ECG_TOPIC) {
                try {
                    const values = JSON.parse(payload);
                    if (Array.isArray(values)) {
                        values.forEach(val => {
                            const num = parseFloat(val);
                            if (!isNaN(num)) updateDashboard(ECG_TOPIC, num);
                        });
                    } else {
                        const val = parseFloat(payload);
                        if (!isNaN(val)) updateDashboard(topic, val);
                    }
                } catch (e) {
                    const val = parseFloat(payload);
                    if (!isNaN(val)) updateDashboard(topic, val);
                }
            } else {
                updateDashboard(topic, payload);
            }
        };

        client.connect({
            onSuccess: () => {
                updateConnectionStatus('Connected', true);
                client.subscribe(ECG_TOPIC);
                client.subscribe(BPM_TOPIC);
                client.subscribe(STATUS_TOPIC);
            },
            onFailure: m => updateConnectionStatus(`Connection Failed: ${m.errorMessage}`, false),
            userName: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            useSSL: true
        });
    }

    function updateDashboard(topic, payload) {
        const timestamp = new Date();
        const time = timestamp.toLocaleTimeString('id-ID');
        const value = parseFloat(payload);

        if (topic === ECG_TOPIC && !isNaN(value)) {
            updateChartData(ecgChart, time, value);
            const logEntry = {
                time: time,
                timestamp: timestamp.toISOString(),
                ecg: value.toFixed(4),
                bpm: currentBpm,
                status: currentStatus
            };
            processedLog.push(logEntry);
        } else if (topic === STATUS_TOPIC) {
            currentStatus = payload;
            statusValueEl.textContent = payload;
            statusCardEl.classList.remove('status-normal', 'status-arrhythmia');
            statusCardEl.classList.add(payload.toLowerCase().includes('normal') ? 'status-normal' : 'status-arrhythmia');
        } else if (topic === BPM_TOPIC && !isNaN(value)) {
            currentBpm = Math.round(value);
            bpmValueEl.textContent = currentBpm;
        }
    }

    function updateChartData(chart, label, data) {
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        if (chart.data.labels.length > MAX_CHART_POINTS) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update('none');
    }

    function resetAllData() {
        processedLog = [];
        bpmValueEl.textContent = '0';
        statusValueEl.textContent = 'N/A';
        statusCardEl.classList.remove('status-normal', 'status-arrhythmia');
        ecgChart.data.labels = [];
        ecgChart.data.datasets[0].data = [];
        ecgChart.update();
        currentBpm = "";
        currentStatus = "";
    }

    function getFileName(extension) {
        return `ekg_log_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    }

    function createBlob(type) {
        let content, mimeType;
        const headers = "Waktu,ECG,BPM,Status\n";

        switch (type) {
            case 'txt':
                content = "Waktu\tECG\tBPM\tStatus\n";
                processedLog.forEach(d => { content += `${d.time}\t${d.ecg}\t${d.bpm}\t${d.status}\n`; });
                mimeType = 'text/plain';
                break;
            case 'csv':
                content = headers;
                processedLog.forEach(d => { content += `"${d.time}","${d.ecg}","${d.bpm}","${d.status}"\n`; });
                mimeType = 'text/csv;charset=utf-8;';
                break;
            case 'xlsx':
                const worksheetData = processedLog.map(d => ({ Waktu: d.time, ECG: d.ecg, BPM: d.bpm, Status: d.status }));
                const ws = XLSX.utils.json_to_sheet(worksheetData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Data EKG');
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        }
        return new Blob([content], { type: mimeType });
    }

    function downloadFile(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    
    async function shareFile(blob, filename) {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'EKG Data Log',
                    text: `Berikut adalah data log EKG yang diambil pada ${new Date().toLocaleString('id-ID')}.`
                });
            } catch (error) {
                console.error('Sharing failed', error);
                if (error.name !== 'AbortError') {
                   alert('Gagal membagikan file.');
                }
            }
        } else {
            alert('Browser Anda tidak mendukung fitur berbagi file ini. File akan diunduh sebagai gantinya.');
            downloadFile(blob, filename);
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.action-btn').forEach(button => {
            button.addEventListener('click', () => {
                const type = button.dataset.type;
                const target = button.dataset.target;
                const hasData = type.startsWith('chart') ? ecgChart.data.labels.length > 0 : processedLog.length > 0;
                
                if (!hasData) {
                    modalNoData.style.display = 'flex';
                } else {
                    pendingAction = { type, target };
                    modalAction.style.display = 'flex';
                }
            });
        });

        document.getElementById('confirm-download').addEventListener('click', () => {
            if (!pendingAction) return;
            const { type, target } = pendingAction;
            if (type === 'chart') {
                downloadFile(ecgChart.toBase64Image(), `hrv_chart.png`);
            } else {
                const blob = createBlob(type);
                downloadFile(blob, getFileName(type));
            }
            modalAction.style.display = 'none';
            pendingAction = null;
        });

        document.getElementById('confirm-share').addEventListener('click', () => {
            if (!pendingAction) return;
            const { type, target } = pendingAction;
            
            if (type === 'chart') {
                ecgChart.canvas.toBlob(blob => {
                   if (blob) shareFile(blob, `hrv_chart.png`);
                });
            } else {
                const blob = createBlob(type);
                shareFile(blob, getFileName(type));
            }

            modalAction.style.display = 'none';
            pendingAction = null;
        });

        document.getElementById('resetData').addEventListener('click', () => {
            modalReset.style.display = 'flex';
        });

        document.getElementById('confirmReset').addEventListener('click', () => {
            resetAllData();
            modalReset.style.display = 'none';
        });
        
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').style.display = 'none';
            });
        });
    }

    initCharts();
    setupEventListeners();
    connectMqtt();
});