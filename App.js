document.addEventListener('DOMContentLoaded', () => {
    const MQTT_BROKER = 'e81af177c9af406794c5f43addea8b52.s1.eu.hivemq.cloud';
    const MQTT_PORT = 8884;
    const MQTT_PATH = '/mqtt';
    const MQTT_USERNAME = 'ekgitera';
    const MQTT_PASSWORD = 'Itera123';
    const ECG_TOPIC = 'ekg/data';
    const BPM_TOPIC = 'ekg/bpm';
    const STATUS_TOPIC = 'ekg/status';
    const HRV_TOPIC = 'ekg/hrv';

    const firebaseConfig = {
        apiKey: "AIzaSyBnXD2kCG_V7wU3ooDjUNTaGHJIKP6mOY4",
        authDomain: "portableecgitera.firebaseapp.com",
        databaseURL: "https://portableecgitera-default-rtdb.firebaseio.com",
        projectId: "portableecgitera",
        storageBucket: "portableecgitera.appspot.com",
        messagingSenderId: "1049018106297",
        appId: "1:1049018106297:web:4744d70ad3c1cd43bd3668",
        measurementId: "G-V9J2L7CN9W"
    };

    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    const connectionStatusEl = document.getElementById('connection-status');
    const bpmValueEl = document.getElementById('bpm-value');
    const hrvValueEl = document.getElementById('hrv-value');
    const statusValueEl = document.getElementById('status-value');
    const statusCardEl = document.getElementById('status-card');
    const modalReset = document.getElementById('modal-reset');
    const modalNoData = document.getElementById('modal-nodata');

    const MAX_CHART_POINTS = 100;
    let ecgChart;
    let currentBpm = "", currentStatus = "", currentHrv = "";

    function initCharts() {
        const ecgCtx = document.getElementById('ecgChart').getContext('2d');
        ecgChart = new Chart(ecgCtx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Sinyal EKG', data: [], borderColor: 'rgb(75, 192, 192)', borderWidth: 1.5, pointRadius: 0, tension: 0.1 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { display: false }, y: { min: -2, max: 2, ticks: { stepSize: 0.5 } } } }
        });
    }

    function updateConnectionStatus(msg, isConnected) {
        connectionStatusEl.textContent = msg;
        connectionStatusEl.style.color = isConnected ? 'var(--green-strong)' : 'var(--red-strong)';
    }

    function updateFirebaseRealtime(data) {
        database.ref('ecgdata/realtime').set(data)
            .catch(error => console.error("Firebase update failed:", error));
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
                client.subscribe(HRV_TOPIC);
            },
            onFailure: m => updateConnectionStatus(`Connection Failed: ${m.errorMessage}`, false),
            userName: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            useSSL: true
        });
    }

    function updateDashboard(topic, payload) {
        const timestamp = new Date();
        const value = parseFloat(payload);

        if (topic === ECG_TOPIC && !isNaN(value)) {
            updateChartData(ecgChart, timestamp.toLocaleTimeString('id-ID'), value);
            const logEntry = {
                timestamp: timestamp.toISOString(),
                ecg: value.toFixed(4),
                bpm: currentBpm,
                hrv: currentHrv,
                status: currentStatus
            };
            database.ref('ecgdata/history').push(logEntry);
            database.ref('ecgdata/realtime/ecg').set(value.toFixed(4));
            
        } else if (topic === BPM_TOPIC && !isNaN(value)) {
            currentBpm = Math.round(value);
            bpmValueEl.textContent = currentBpm;
            database.ref('ecgdata/realtime/BPM').set(currentBpm);

        } else if (topic === HRV_TOPIC && !isNaN(value)) {
            currentHrv = Math.round(value);
            hrvValueEl.textContent = currentHrv;
            database.ref('ecgdata/realtime/hrv').set(currentHrv);

        } else if (topic === STATUS_TOPIC) {
            currentStatus = payload;
            statusValueEl.textContent = payload;
            statusCardEl.classList.remove('status-normal', 'status-arrhythmia');
            statusCardEl.classList.add(payload.toLowerCase().includes('normal') ? 'status-normal' : 'status-arrhythmia');
            database.ref('ecgdata/realtime/status').set(currentStatus);
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
        database.ref('ecgdata').remove()
            .then(() => console.log("Firebase data reset successfully."))
            .catch(error => console.error("Firebase reset failed:", error));
        
        bpmValueEl.textContent = '0';
        hrvValueEl.textContent = '0';
        statusValueEl.textContent = 'N/A';
        statusCardEl.classList.remove('status-normal', 'status-arrhythmia');
        
        ecgChart.data.labels = [];
        ecgChart.data.datasets[0].data = [];
        ecgChart.update();
        
        currentBpm = "";
        currentStatus = "";
        currentHrv = "";
    }

    function getFileName(extension) {
        return `ekg_log_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    }
    
    function downloadFile(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
    
    async function downloadDataAsXlsx() {
        const historyRef = database.ref('ecgdata/history');
        const snapshot = await historyRef.once('value');

        if (!snapshot.exists()) {
            modalNoData.style.display = 'flex';
            return;
        }

        const data = snapshot.val();
        const dataArray = Object.values(data);
        
        const worksheetData = dataArray.map(d => ({
            Waktu: new Date(d.timestamp).toLocaleString('id-ID'),
            ECG: d.ecg,
            BPM: d.bpm,
            HRV: d.hrv,
            Status: d.status
        }));
        
        const ws = XLSX.utils.json_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data EKG');
        
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        downloadFile(blob, getFileName('xlsx'));
    }

    function setupEventListeners() {
        document.getElementById('downloadXlsxBtn').addEventListener('click', downloadDataAsXlsx);

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