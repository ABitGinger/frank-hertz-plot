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

// 高斯平滑函数
function gaussianSmooth(data, sigma = 1) {
    const kernel = [];
    const radius = Math.ceil(3 * sigma);
    let sum = 0;
    
    // 创建高斯核
    for (let i = -radius; i <= radius; i++) {
        const val = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel.push(val);
        sum += val;
    }
    
    // 归一化
    kernel.forEach((val, i) => kernel[i] = val / sum);
    
    // 应用平滑
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
        let smoothedVal = 0;
        for (let j = -radius; j <= radius; j++) {
            const idx = i + j;
            if (idx >= 0 && idx < data.length) {
                smoothedVal += data[idx].current * kernel[j + radius];
            }
        }
        smoothed.push({
            voltage: data[i].voltage,
            current: smoothedVal
        });
    }
    
    return smoothed;
}

// 计算导数
function calculateDerivative(data) {
    const derivative = [];
    for (let i = 1; i < data.length - 1; i++) {
        const dx = data[i + 1].voltage - data[i - 1].voltage;
        const dy = data[i + 1].current - data[i - 1].current;
        derivative.push({
            voltage: data[i].voltage,
            value: dy / dx
        });
    }
    return derivative;
}

// 识别电流峰值
function findPeaks(data) {
    // 1. 高斯平滑预处理
    const smoothed = gaussianSmooth(data, 2);
    
    // 2. 计算一阶导数
    const derivative = calculateDerivative(smoothed);
    
    // 3. 寻找导数过零点(从正变负)
    const peaks = [];
    const minPeakHeight = 0.1 * Math.max(...data.map(d => d.current));
    const minPeakWidth = 3; // 最小峰宽(数据点数)
    
    for (let i = 1; i < derivative.length - 1; i++) {
        // 检测导数从正变负的点
        if (derivative[i-1].value > 0 && derivative[i].value <= 0) {
            // 在原始数据中找到精确的峰值位置
            let peakIndex = i + 1; // 补偿导数计算的偏移
            let left = peakIndex - 1;
            let right = peakIndex + 1;
            
            // 确保是局部最大值
            while (left >= 0 && data[left].current > data[peakIndex].current) {
                peakIndex = left;
                left--;
            }
            while (right < data.length && data[right].current > data[peakIndex].current) {
                peakIndex = right;
                right++;
            }
            
            // 检查峰高和峰宽
            if (data[peakIndex].current >= minPeakHeight) {
                // 计算峰宽
                let leftWidth = peakIndex;
                while (leftWidth > 0 && data[leftWidth].current > 0.5 * data[peakIndex].current) {
                    leftWidth--;
                }
                
                let rightWidth = peakIndex;
                while (rightWidth < data.length - 1 && data[rightWidth].current > 0.5 * data[peakIndex].current) {
                    rightWidth++;
                }
                
                const peakWidth = rightWidth - leftWidth;
                
                if (peakWidth >= minPeakWidth) {
                    peaks.push({
                        voltage: data[peakIndex].voltage,
                        current: data[peakIndex].current,
                        peakIndex: peakIndex,
                        width: peakWidth
                    });
                }
            }
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
    
    let html = '<h3>详细计算过程</h3>';
    
    // 1. 峰值识别
    html += '<h4>1. 峰值点识别</h4>';
    html += '<p>采用基于导数的高斯平滑峰值检测算法：</p>';
    html += '<ol>';
    html += '<li>高斯平滑处理数据(σ=2)，减少噪声影响</li>';
    html += '<li>计算一阶导数，检测导数由正变负的点</li>';
    html += '<li>验证峰高(>最大电流10%)和峰宽(≥3个数据点)</li>';
    html += '</ol>';
    html += '<table><tr><th>峰序数(n)</th><th>电压U<sub>G2K</sub>(V)</th><th>电流I(nA)</th><th>峰宽</th></tr>';
    processedData.peaks.forEach((peak, i) => {
        html += `<tr><td>${i+1}</td><td>${peak.voltage.toFixed(2)}</td><td>${peak.current.toFixed(2)}</td><td>${peak.width || '-'}</td></tr>`;
    });
    html += '</table>';
    
    // 2. 最小二乘法拟合
    if (processedData.fit) {
        html += '<h4>2. 最小二乘法计算第一激发电位</h4>';
        html += '<p>根据公式: U<sub>G2K</sub> = a + nΔU</p>';
        html += '<p>其中: n为峰序数，ΔU为第一激发电位</p>';
        
        // 计算步骤
        html += '<h5>2.1 计算各项和</h5>';
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        processedData.peaks.forEach((peak, i) => {
            const x = i + 1;
            const y = peak.voltage;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        html += `<p>Σn = ${sumX}</p>`;
        html += `<p>ΣU<sub>G2K</sub> = ${sumY.toFixed(2)}</p>`;
        html += `<p>Σ(n×U<sub>G2K</sub>) = ${sumXY.toFixed(2)}</p>`;
        html += `<p>Σn² = ${sumX2}</p>`;
        
        // 斜率计算
        const n = processedData.peaks.length;
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        html += '<h5>2.2 计算斜率(第一激发电位ΔU)</h5>';
        html += `<p>ΔU = [n×Σ(nU<sub>G2K</sub>) - Σn×ΣU<sub>G2K</sub>] / [n×Σn² - (Σn)²]</p>`;
        html += `<p>ΔU = [${n}×${sumXY.toFixed(2)} - ${sumX}×${sumY.toFixed(2)}] / [${n}×${sumX2} - ${sumX}²] = ${slope.toFixed(2)} V</p>`;
        
        // 截距计算
        const intercept = (sumY - slope * sumX) / n;
        html += '<h5>2.3 计算截距a</h5>';
        html += `<p>a = [ΣU<sub>G2K</sub> - ΔU×Σn] / n = [${sumY.toFixed(2)} - ${slope.toFixed(2)}×${sumX}] / ${n} = ${intercept.toFixed(2)} V</p>`;
        
        // 拟合方程
        html += '<h5>2.4 拟合结果</h5>';
        html += `<p>拟合方程: U<sub>G2K</sub> = ${intercept.toFixed(2)} + ${slope.toFixed(2)} × n</p>`;
        html += `<p>相关系数 R² = ${processedData.fit.rSquared.toFixed(4)}</p>`;
    }
    
    // 3. 不确定度分析
    if (processedData.uncertainty) {
        html += '<h4>3. 不确定度分析</h4>';
        
        // 计算残差平方和
        let sumResiduals2 = 0;
        processedData.peaks.forEach((peak, i) => {
            const x = i + 1;
            const y = peak.voltage;
            const f = processedData.fit.slope * x + processedData.fit.intercept;
            sumResiduals2 += Math.pow(y - f, 2);
        });
        html += `<h5>3.1 残差平方和 Σ(y<sub>i</sub>-ŷ<sub>i</sub>)² = ${sumResiduals2.toFixed(4)}</h5>`;
        
        // 计算标准差
        const s = Math.sqrt(sumResiduals2 / (processedData.peaks.length - 2));
        html += `<h5>3.2 标准差 s = √[Σ(y<sub>i</sub>-ŷ<sub>i</sub>)²/(n-2)] = √[${sumResiduals2.toFixed(4)}/${processedData.peaks.length-2}] = ${s.toFixed(4)}</h5>`;
        
        // 计算Sxx
        let sumX = 0, sumX2 = 0;
        processedData.peaks.forEach((peak, i) => {
            const x = i + 1;
            sumX += x;
            sumX2 += x * x;
        });
        const Sxx = sumX2 - Math.pow(sumX, 2) / processedData.peaks.length;
        html += `<h5>3.3 S<sub>xx</sub> = Σn² - (Σn)²/n = ${sumX2} - ${sumX}²/${processedData.peaks.length} = ${Sxx.toFixed(2)}</h5>`;
        
        // 斜率不确定度
        const slopeError = s / Math.sqrt(Sxx);
        html += `<h5>3.4 斜率不确定度 u(ΔU) = s/√S<sub>xx</sub> = ${s.toFixed(4)}/√${Sxx.toFixed(2)} = ${slopeError.toFixed(4)} V</h5>`;
        
        // 置信区间
        const tValue = 2.776; // 对于n=5, 95%置信度
        html += `<h5>3.5 95%置信区间 ΔU ± t×u(ΔU) = ${processedData.fit.slope.toFixed(2)} ± ${tValue * slopeError.toFixed(4)} V</h5>`;
        html += `<p>最终结果: ΔU = ${processedData.fit.slope.toFixed(2)} ± ${processedData.uncertainty.slopeError.toFixed(2)} V</p>`;
    }
    
    // 4. 能级差计算
    if (processedData.fit) {
        html += '<h4>4. 能级差计算</h4>';
        html += '<p>根据公式: ΔE = eΔU</p>';
        html += `<p>其中: e = 1.602×10<sup>-19</sup> C (电子电荷)</p>`;
        const deltaE = processedData.fit.slope * 1.602e-19;
        html += `<p>ΔE = ${processedData.fit.slope.toFixed(2)} V × 1.602×10<sup>-19</sup> C = ${deltaE.toExponential(2)} J</p>`;
        html += `<p>换算为温度: ΔE/k<sub>B</sub> = ${deltaE}/1.3806×10<sup>-23</sup> = ${(deltaE / 1.3806e-23).toFixed(0)} K</p>`;
    }
    
    processDiv.innerHTML = html;
    
    // 渲染数学公式
    if (window.katex) {
        const mathElements = processDiv.querySelectorAll('.math');
        mathElements.forEach(el => {
            katex.render(el.textContent, el, {
                throwOnError: false
            });
        });
    }
}

// 显示计算结果
function showResults() {
    const resultDiv = document.getElementById('results');
    if (!resultDiv || !processedData || !processedData.fit) return;
    
    let html = '<h3>实验结果</h3>';
    html += `<p>氩原子第一激发电位: <strong>${processedData.fit.slope.toFixed(2)} ± ${processedData.uncertainty.slopeError.toFixed(2)} eV</strong></p>`;
    html += `<p>能级差: <strong>${(processedData.fit.slope * 1.602e-19).toExponential(2)} J</strong> (${(processedData.fit.slope * 1.602e-19 / 1.3806e-23).toFixed(0)} K)</p>`;
    
    resultDiv.innerHTML = html;
}
