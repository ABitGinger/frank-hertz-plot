// 全局变量
let chart = null;
let rawData = [];
let processedData = [];

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化文件上传事件
    document.getElementById('dataFile').addEventListener('change', handleFileUpload);
    
    // 初始化图表
    initChart();
});

// 处理文件上传
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            rawData = parseData(e.target.result);
            processData(rawData);
            updateChart();
            showCalculationProcess();
        } catch (error) {
            alert('文件解析错误: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// 解析上传的数据
function parseData(text) {
    const lines = text.split('\n');
    const data = [];
    
    for (const line of lines) {
        // 匹配表格行数据
        const match = line.match(/^\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/);
        if (match) {
            data.push({
                voltage: parseFloat(match[1]),
                current: parseFloat(match[2])
            });
        }
    }
    
    if (data.length === 0) {
        throw new Error('未找到有效数据');
    }
    
    return data;
}

// 处理数据并计算结果
function processData(data) {
    // 1. 识别峰值
    const peaks = findPeaks(data);
    
    // 2. 最小二乘法拟合
    const fitResult = linearFit(peaks);
    
    // 3. 计算不确定度
    const uncertainty = calculateUncertainty(data, peaks, fitResult);
    
    processedData = {
        raw: data,
        peaks: peaks,
        fit: fitResult,
        uncertainty: uncertainty
    };
}

// 识别电流峰值
function findPeaks(data) {
    const peaks = [];
    const windowSize = 5; // 滑动窗口大小
    
    for (let i = windowSize; i < data.length - windowSize; i++) {
        let isPeak = true;
        
        // 检查左侧窗口
        for (let j = 1; j <= windowSize; j++) {
            if (data[i].current <= data[i - j].current) {
                isPeak = false;
                break;
            }
        }
        
        // 检查右侧窗口
        if (isPeak) {
            for (let j = 1; j <= windowSize; j++) {
                if (data[i].current <= data[i + j].current) {
                    isPeak = false;
                    break;
                }
            }
        }
        
        // 确保峰值电流足够大(避免噪声)
        if (isPeak && data[i].current > 0.1 * Math.max(...data.map(d => d.current))) {
            peaks.push({
                voltage: data[i].voltage,
                current: data[i].current,
                peakIndex: i
            });
        }
    }
    
    return peaks;
}

// 最小二乘法线性拟合
function linearFit(peaks) {
    if (peaks.length < 2) {
        throw new Error('至少需要两个峰值点才能进行拟合');
    }
    
    const n = peaks.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    // 计算各项和
    for (let i = 0; i < n; i++) {
        const x = i + 1; // 峰序数n
        const y = peaks[i].voltage;
        
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    
    // 计算斜率和截距
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // 计算R平方
    let ssTot = 0, ssRes = 0;
    const meanY = sumY / n;
    
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        const y = peaks[i].voltage;
        const f = slope * x + intercept;
        
        ssTot += Math.pow(y - meanY, 2);
        ssRes += Math.pow(y - f, 2);
    }
    
    const rSquared = 1 - (ssRes / ssTot);
    
    return {
        slope: slope,
        intercept: intercept,
        rSquared: rSquared,
        firstExcitationPotential: slope // 斜率即为第一激发电位
    };
}

// 计算不确定度
function calculateUncertainty(data, peaks, fitResult) {
    const n = peaks.length;
    if (n < 2) return null;
    
    // 计算残差
    let sumResiduals2 = 0;
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        const y = peaks[i].voltage;
        const f = fitResult.slope * x + fitResult.intercept;
        sumResiduals2 += Math.pow(y - f, 2);
    }
    
    // 计算标准差
    const s = Math.sqrt(sumResiduals2 / (n - 2));
    
    // 计算Sxx
    let sumX = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        sumX += x;
        sumX2 += x * x;
    }
    const Sxx = sumX2 - Math.pow(sumX, 2) / n;
    
    // 计算斜率不确定度
    const slopeError = s / Math.sqrt(Sxx);
    
    // 计算截距不确定度
    const interceptError = s * Math.sqrt(sumX2 / (n * Sxx));
    
    // 95%置信区间
    const tValue = 2.776; // 对于n=5, 95%置信度
    
    return {
        slopeError: slopeError,
        interceptError: interceptError,
        confidenceInterval: {
            lower: fitResult.slope - tValue * slopeError,
            upper: fitResult.slope + tValue * slopeError
        }
    };
}

// 初始化图表
function initChart() {
    const ctx = document.getElementById('resultChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'I-UG2K曲线',
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                pointRadius: 3,
                pointHoverRadius: 5,
                showLine: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '第二栅极电压 UG2K (V)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '板极电流 I (nA)'
                    }
                }
            }
        }
    });
}

// 更新图表数据
function updateChart() {
    if (!chart || !processedData) return;
    
    // 原始数据
    chart.data.datasets[0] = {
        label: 'I-UG2K曲线',
        data: processedData.raw.map(d => ({x: d.voltage, y: d.current})),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        pointRadius: 3,
        pointHoverRadius: 5,
        showLine: true
    };
    
    // 峰值点
    if (processedData.peaks.length > 0) {
        chart.data.datasets[1] = {
            label: '峰值点',
            data: processedData.peaks.map(p => ({x: p.voltage, y: p.current})),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.8)',
            pointRadius: 5,
            pointHoverRadius: 7,
            showLine: false
        };
    }
    
    // 拟合直线
    if (processedData.fit) {
        const firstX = 1;
        const lastX = processedData.peaks.length;
        const firstY = processedData.fit.slope * firstX + processedData.fit.intercept;
        const lastY = processedData.fit.slope * lastX + processedData.fit.intercept;
        
        chart.data.datasets[2] = {
            label: '拟合直线',
            data: [
                {x: firstY, y: 0},
                {x: lastY, y: 0}
            ],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [5, 5],
            showLine: true
        };
    }
    
    chart.update();
    showResults();
}

// 显示计算过程
function showCalculationProcess() {
    const processDiv = document.getElementById('calculationProcess');
    if (!processDiv || !processedData) return;
    
    let html = '<h3>计算过程</h3>';
    
    // 1. 数据收集与预处理
    html += '<h4>1. 数据收集与预处理</h4>';
    html += '<p>实验数据格式要求：</p>';
    html += '<pre>| UG2K/V | I/nA |\n| ---- | ---- |\n| 1.0 | 0.0 |\n| 2.0 | 0.0 |\n...</pre>';
    html += '<p>数据预处理：检查数据完整性，去除异常值</p>';
    
    // 2. 峰值检测
    html += '<h4>2. 峰值点识别</h4>';
    html += '<p>采用滑动窗口法识别峰值点，窗口大小=5：</p>';
    html += '<p>判断条件：</p>';
    html += '<ul>';
    html += '<li>当前点电流值 > 左侧5个点的电流值</li>';
    html += '<li>当前点电流值 > 右侧5个点的电流值</li>';
    html += '<li>电流值 > 最大电流的10% (避免噪声干扰)</li>';
    html += '</ul>';
    html += '<table><tr><th>峰序数</th><th>电压(V)</th><th>电流(nA)</th></tr>';
    processedData.peaks.forEach((peak, i) => {
        html += `<tr><td>${i+1}</td><td>${peak.voltage.toFixed(2)}</td><td>${peak.current.toFixed(2)}</td></tr>`;
    });
    html += '</table>';
    
    // 3. 最小二乘法拟合
    if (processedData.fit) {
        html += '<h4>3. 最小二乘法拟合</h4>';
        html += '<p>根据弗兰克-赫兹实验原理：</p>';
        html += '<p>U<sub>G2K</sub> = a + nΔU</p>';
        html += '<p>其中：</p>';
        html += '<ul>';
        html += '<li>n - 峰序数</li>';
        html += '<li>ΔU - 第一激发电位</li>';
        html += '<li>a - 截距</li>';
        html += '</ul>';
        
        html += '<p>最小二乘法计算步骤：</p>';
        html += '<ol>';
        html += '<li>计算各项和：Σx, Σy, Σxy, Σx²</li>';
        html += '<li>计算斜率：b = (nΣxy - ΣxΣy)/(nΣx² - (Σx)²)</li>';
        html += '<li>计算截距：a = (Σy - bΣx)/n</li>';
        html += '</ol>';
        
        html += `<p>拟合结果：U<sub>G2K</sub> = ${processedData.fit.intercept.toFixed(2)} + ${processedData.fit.slope.toFixed(2)} × n</p>`;
        html += `<p>相关系数 R² = ${processedData.fit.rSquared.toFixed(4)}</p>`;
        html += `<p>第一激发电位 ΔU = ${processedData.fit.slope.toFixed(2)} V</p>`;
    }
    
    // 4. 不确定度分析
    if (processedData.uncertainty) {
        html += '<h4>4. 不确定度分析</h4>';
        html += '<p>计算步骤：</p>';
        html += '<ol>';
        html += '<li>计算残差平方和：Σ(y_i - ŷ_i)²</li>';
        html += '<li>计算标准差：s = √[Σ(y_i - ŷ_i)²/(n-2)]</li>';
        html += '<li>计算Sxx = Σx² - (Σx)²/n</li>';
        html += '<li>斜率不确定度：u(b) = s/√Sxx</li>';
        html += '</ol>';
        
        html += `<p>斜率不确定度: ±${processedData.uncertainty.slopeError.toFixed(4)} V</p>`;
        html += `<p>95%置信区间: [${processedData.uncertainty.confidenceInterval.lower.toFixed(2)}, ${processedData.uncertainty.confidenceInterval.upper.toFixed(2)}] V</p>`;
    }
    
    // 5. 能级差计算
    if (processedData.fit) {
        html += '<h4>5. 能级差计算</h4>';
        html += '<p>根据公式：ΔE = eΔU</p>';
        html += '<p>其中：</p>';
        html += '<ul>';
        html += '<li>e - 电子电荷 (1.602×10⁻¹⁹ C)</li>';
        html += '<li>ΔU - 第一激发电位</li>';
        html += '</ul>';
        html += `<p>计算结果：ΔE = ${(processedData.fit.slope * 1.602e-19).toExponential(2)} J</p>`;
        html += `<p>温度当量：${(processedData.fit.slope * 1.602e-19 / 1.3806e-23).toFixed(0)} K</p>`;
    }
    
    processDiv.innerHTML = html;
}

// 显示计算结果
function showResults() {
    const resultDiv = document.getElementById('results');
    if (!resultDiv || !processedData || !processedData.fit) return;
    
    let html = '<h3>实验结果</h3>';
    html += `<p>氩原子第一激发电位: <strong>${processedData.fit.slope.toFixed(2)} ± ${processedData.uncertainty.slopeError.toFixed(2)} V</strong></p>`;
    html += `<p>能级差: <strong>${(processedData.fit.slope * 1.602e-19).toExponential(2)} J</strong> (${(processedData.fit.slope * 1.602e-19 / 1.3806e-23).toFixed(0)} K)</p>`;
    
    resultDiv.innerHTML = html;
}
