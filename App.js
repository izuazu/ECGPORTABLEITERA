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

    const MAX_CHART_POINTS = 200;
    const BUFFER_SIZE = 100;
    const FLUSH_INTERVAL = 2000;

    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    const connectionStatusEl = document.getElementById('connection-status');
    const bpmValueEl = document.getElementById('bpm-value');
    const hrvValueEl = document.getElementById('hrv-value');
    const statusValueEl = document.getElementById('status-value');
    const statusCardEl = document.getElementById('status-card');
    const modalReset = document.getElementById('modal-reset');
    const modalNoData = document.getElementById('modal-nodata');
    const modalDownload = document.getElementById('modal-download');

    let ecgChart;
    let ecgBuffer = [];
    let lastFlushTime = Date.now();

    const currentState = {
        bpm: "0",
        hrv: "0",
        status: "N/A"
    };

    function initCharts() {
        const ecgCtx = document.getElementById('ecgChart').getContext('2d');
        ecgChart = new Chart(ecgCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Sinyal ECG',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { display: false },
                    y: { min: -2, max: 2, ticks: { stepSize: 0.5 } }
                }
            }
        });
    }

    function updateConnectionStatus(msg, isConnected) {
        connectionStatusEl.textContent = msg;
        connectionStatusEl.style.color = isConnected ? 'var(--green-strong)' : 'var(--red-strong)';
    }
    
    function flushBufferToFirebase() {
        if (ecgBuffer.length === 0) return;

        const dataToPush = [...ecgBuffer];
        ecgBuffer = [];
        
        const updates = {};
        dataToPush.forEach(logEntry => {
            const newKey = database.ref('ecgdata/history').push().key;
            updates[`ecgdata/history/${newKey}`] = logEntry;
        });
        
        database.ref().update(updates)
            .catch(error => console.error("Firebase batch update failed:", error));
            
        lastFlushTime = Date.now();
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
                            if (!isNaN(num)) handleEcgData(num);
                        });
                    }
                } catch (e) {
                    const val = parseFloat(payload);
                    if (!isNaN(val)) handleEcgData(val);
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
                setInterval(flushBufferToFirebase, FLUSH_INTERVAL);
            },
            onFailure: m => updateConnectionStatus(`Connection Failed: ${m.errorMessage}`, false),
            userName: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            useSSL: true
        });
    }

    function handleEcgData(value) {
        const timestamp = new Date();
        updateChartData(ecgChart, timestamp.toLocaleTimeString('id-ID'), value);
        database.ref('ecgdata/realtime/ecg').set(value.toFixed(4));
        
        const logEntry = {
            timestamp: timestamp.toISOString(),
            ecg: value.toFixed(4),
            bpm: currentState.bpm,
            hrv: currentState.hrv,
            status: currentState.status
        };
        ecgBuffer.push(logEntry);
        
        if (ecgBuffer.length >= BUFFER_SIZE) {
            flushBufferToFirebase();
        }
    }
    
    function updateDashboard(topic, payload) {
        const value = parseFloat(payload);

        if (topic === BPM_TOPIC && !isNaN(value)) {
            currentState.bpm = String(Math.round(value));
            bpmValueEl.textContent = currentState.bpm;
            database.ref('ecgdata/realtime/BPM').set(currentState.bpm);
        } else if (topic === HRV_TOPIC && !isNaN(value)) {
            currentState.hrv = String(Math.round(value));
            hrvValueEl.textContent = currentState.hrv;
            database.ref('ecgdata/realtime/hrv').set(currentState.hrv);
        } else if (topic === STATUS_TOPIC) {
            currentState.status = payload;
            statusValueEl.textContent = payload;
            statusCardEl.classList.remove('status-normal', 'status-arrhythmia');
            statusCardEl.classList.add(payload.toLowerCase().includes('normal') ? 'status-normal' : 'status-arrhythmia');
            database.ref('ecgdata/realtime/status').set(currentState.status);
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
        flushBufferToFirebase();
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
        
        currentState.bpm = "0";
        currentState.status = "N/A";
        currentState.hrv = "0";
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function downloadDataAsXlsx() {
        const historyRef = database.ref('ecgdata/history');
        const snapshot = await historyRef.once('value');

        if (!snapshot.exists()) {
            modalNoData.classList.add('show');
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
        const filename = `ekg_log_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;

        if (window.AppInventor && window.AppInventor.setWebViewString) {
            console.log("Kodular environment detected. Sending file via WebViewString.");
            const base64String = await blobToBase64(blob);
            
            const payload = JSON.stringify({
                filename: filename,
                data: base64String,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            
            window.AppInventor.setWebViewString(payload);

        } else {
            console.log("Running in a standard browser. Triggering download.");
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
    }

    function setupEventListeners() {
        document.getElementById('downloadXlsxBtn').addEventListener('click', () => {
            modalDownload.classList.add('show');
        });

        document.getElementById('confirmDownload').addEventListener('click', () => {
            downloadDataAsXlsx();
            modalDownload.classList.remove('show');
        });

        document.getElementById('resetData').addEventListener('click', () => {
            modalReset.classList.add('show');
        });

        document.getElementById('confirmReset').addEventListener('click', () => {
            resetAllData();
            modalReset.classList.remove('show');
        });
        
        document.querySelectorAll('.modal-btn-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('show');
            });
        });
    }

    initCharts();
    setupEventListeners();
    connectMqtt();
});
