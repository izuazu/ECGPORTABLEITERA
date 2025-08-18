document.addEventListener('DOMContentLoaded', () => {
    const MQTT_BROKER='e81af177c9af406794c5f43addea8b52.s1.eu.hivemq.cloud';
    const MQTT_PORT=8884;
    const MQTT_PATH='/mqtt';
    const MQTT_USERNAME='ekgitera';
    const MQTT_PASSWORD='Itera123';
    const ECG_TOPIC='ekg/data';
    const BPM_TOPIC='ekg/bpm';
    const STATUS_TOPIC='ekg/status';
    const connectionStatusEl=document.getElementById('connection-status');
    const bpmValueEl=document.getElementById('bpm-value');
    const statusValueEl=document.getElementById('status-value');
    const statusCardEl=document.getElementById('status-card');
    const dataLogTableBody=document.getElementById('data-log-table');
    const MAX_CHART_POINTS=100;
    const MAX_TABLE_ROWS=50;
    let dataLog=[],ecgChart,bpmChart;

    function initCharts(){
        const ecgCtx=document.getElementById('ecgChart').getContext('2d');
        ecgChart=new Chart(ecgCtx,{type:'line',data:{labels:[],datasets:[{label:'Sinyal EKG',data:[],borderColor:'rgb(75, 192, 192)',borderWidth:1.5,pointRadius:0,tension:0.1}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{display:false},y:{min:-2,max:2,beginAtZero:false,ticks:{stepSize:0.5}}}}});
        const bpmCtx=document.getElementById('bpmChart').getContext('2d');
        bpmChart=new Chart(bpmCtx,{type:'line',data:{labels:[],datasets:[{label:'BPM',data:[],borderColor:'rgb(255, 99, 132)',backgroundColor:'rgba(255, 99, 132, 0.2)',borderWidth:2,fill:true}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:220}}}});
    }

    function updateConnectionStatus(msg,isConnected){
        connectionStatusEl.textContent=msg;
        connectionStatusEl.style.color=isConnected?'var(--green-strong)':'var(--red-strong)';
    }

    function connectMqtt(){
        const clientId='web-dashboard-'+Math.random().toString(16).substr(2,8);
        updateConnectionStatus('Connecting...',false);
        const client=new Paho.MQTT.Client(MQTT_BROKER,MQTT_PORT,MQTT_PATH,clientId);
        client.onConnectionLost=res=>{
            if(res.errorCode!==0){
                updateConnectionStatus('Disconnected. Retrying...',false);
                setTimeout(connectMqtt,5000);
            }
        };
        client.onMessageArrived=msg=>{
            const topic=msg.destinationName;
            const payload=msg.payloadString;
            const timestamp=new Date();
            const logEntry={time:timestamp.toLocaleTimeString('id-ID'),timestamp:timestamp.toISOString(),topic, payload};
            dataLog.push(logEntry);
            updateDashboard(logEntry);
        };
        client.connect({onSuccess:()=>{updateConnectionStatus('Connected',true);client.subscribe(ECG_TOPIC);client.subscribe(BPM_TOPIC);client.subscribe(STATUS_TOPIC);},onFailure:m=>updateConnectionStatus(`Connection Failed: ${m.errorMessage}`,false),userName:MQTT_USERNAME,password:MQTT_PASSWORD,useSSL:true});
    }

    function updateDashboard(logEntry){
        const {topic,payload,time}=logEntry;
        const value=parseFloat(payload);
        if(topic===ECG_TOPIC&&!isNaN(value)) updateChartData(ecgChart,time,value);
        else if(topic===BPM_TOPIC&&!isNaN(value)){bpmValueEl.textContent=Math.round(value);updateChartData(bpmChart,time,Math.round(value));}
        else if(topic===STATUS_TOPIC){statusValueEl.textContent=payload;statusCardEl.classList.remove('status-normal','status-arrhythmia');statusCardEl.classList.add(payload.toLowerCase().includes('normal')?'status-normal':'status-arrhythmia');}
        updateLogTable(logEntry);
    }

    function updateChartData(chart,label,data){
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(data);
        if(chart.data.labels.length>MAX_CHART_POINTS){chart.data.labels.shift();chart.data.datasets[0].data.shift();}
        chart.update('none');
    }

    function updateLogTable({time,topic,payload}){
        const newRow=dataLogTableBody.insertRow(0);
        newRow.insertCell(0).textContent=time;
        newRow.insertCell(1).textContent=topic;
        newRow.insertCell(2).textContent=payload;
        if(dataLogTableBody.rows.length>MAX_TABLE_ROWS)dataLogTableBody.deleteRow(MAX_TABLE_ROWS);
    }

    function resetAllData(){
        dataLog=[];
        dataLogTableBody.innerHTML='';
        bpmValueEl.textContent='0';
        statusValueEl.textContent='N/A';
        statusCardEl.classList.remove('status-normal','status-arrhythmia');
        ecgChart.data.labels=[];ecgChart.data.datasets[0].data=[];ecgChart.update();
        bpmChart.data.labels=[];bpmChart.data.datasets[0].data=[];bpmChart.update();
    }

    function shareFile(filename,data,type){
        const blob=new Blob([data],{type});
        const filesArray=[new File([blob],filename,{type})];
        if(navigator.canShare&&navigator.canShare({files:filesArray})){
            navigator.share({files:filesArray}).catch(err=>console.error('Share failed:',err));
        }else{
            const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;link.click();URL.revokeObjectURL(link.href);
        }
    }

    function setupEventListeners(){
        document.getElementById('downloadEcgChart').addEventListener('click',()=>{shareFile('grafik_ekg.png',ecgChart.toBase64Image(),'image/png');});
        document.getElementById('downloadBpmChart').addEventListener('click',()=>{shareFile('grafik_bpm.png',bpmChart.toBase64Image(),'image/png');});
        document.getElementById('downloadXlsx').addEventListener('click',()=>{if(dataLog.length===0)return alert('Tidak ada data untuk dibagikan.');const ws=XLSX.utils.json_to_sheet(dataLog);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data EKG");const wbout=XLSX.write(wb,{bookType:'xlsx',type:'array'});shareFile('ekg_data.xlsx',wbout,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');});
        document.getElementById('downloadCsv').addEventListener('click',()=>{if(dataLog.length===0)return alert('Tidak ada data untuk dibagikan.');let csvContent='timestamp,topic,payload\n';dataLog.forEach(l=>{csvContent+=`"${l.timestamp}","${l.topic}","${l.payload}"\n`;});shareFile('ekg_data.csv',csvContent,'text/csv;charset=utf-8;');});
        document.getElementById('downloadTxt').addEventListener('click',()=>{if(dataLog.length===0)return alert('Tidak ada data untuk dibagikan.');let txtContent='Log Data EKG\n====================\n';dataLog.forEach(l=>{txtContent+=`[${l.timestamp}] | Topic: ${l.topic} | Payload: ${l.payload}\n`;});shareFile('ekg_data.txt',txtContent,'text/plain;charset=utf-8;');});
        document.getElementById('resetData').addEventListener('click',()=>{document.getElementById('modal-reset').style.display='flex';});
        document.getElementById('cancelReset').addEventListener('click',()=>{document.getElementById('modal-reset').style.display='none';});
        document.getElementById('confirmReset').addEventListener('click',()=>{resetAllData();document.getElementById('modal-reset').style.display='none';});
    }

    initCharts();
    setupEventListeners();
    connectMqtt();
});
