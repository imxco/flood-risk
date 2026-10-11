// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let analysisCircle = null;
let lastAnalysis = null;

// ============================================================
// راه‌اندازی نقشه Leaflet
// ============================================================
function initMap() {
    const initialLat = parseFloat(document.getElementById('lat').value) || 35.6892;
    const initialLon = parseFloat(document.getElementById('lon').value) || 51.3890;

    map = L.map('map').setView([initialLat, initialLon], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    updateMarker(initialLat, initialLon);

    map.on('click', function(e) {
        const lat = e.latlng.lat.toFixed(4);
        const lon = e.latlng.lng.toFixed(4);

        document.getElementById('lat').value = lat;
        document.getElementById('lon').value = lon;

        updateMarker(parseFloat(lat), parseFloat(lon));
        console.log(`موقعیت انتخاب شد: ${lat}, ${lon}`);
    });
}

// ============================================================
// به‌روزرسانی مارکر
// ============================================================
function updateMarker(lat, lon) {
    if (!map) return;

    if (marker) map.removeLayer(marker);
    if (analysisCircle) map.removeLayer(analysisCircle);

    marker = L.marker([lat, lon], {
        draggable: true,
        title: 'موقعیت تحلیل'
    }).addTo(map);

    marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(4);
        document.getElementById('lon').value = pos.lng.toFixed(4);
        updateMarker(pos.lat, pos.lng);
    });

    analysisCircle = L.circle([lat, lon], {
        radius: 1000,
        color: '#3182ce',
        fillColor: '#3182ce',
        fillOpacity: 0.1,
        weight: 2
    }).addTo(map);

    marker.bindPopup(`
        <div style="text-align: center; font-family: Tahoma;">
            <strong>موقعیت تحلیل</strong><br>
            ${lat.toFixed(4)}, ${lon.toFixed(4)}<br>
            <small>می‌توانید مارکر را جابجا کنید</small>
        </div>
    `).openPopup();
}

// ============================================================
// مدیریت توکن
// ============================================================
function loadToken() {
    const token = localStorage.getItem('nasa_token');
    const input = document.getElementById('nasaToken');
    const status = document.getElementById('tokenStatus');
    if (token) {
        input.value = token;
        status.textContent = '✅ توکن ذخیره شده است';
        status.className = 'token-status ok';
    } else {
        status.textContent = '⚠️ توکن وارد نشده است. داده‌های NDVI دریافت نخواهند شد.';
        status.className = 'token-status missing';
    }
}

function saveToken() {
    const token = document.getElementById('nasaToken').value.trim();
    const status = document.getElementById('tokenStatus');
    if (token) {
        localStorage.setItem('nasa_token', token);
        status.textContent = '✅ توکن ذخیره شد';
        status.className = 'token-status ok';
    } else {
        localStorage.removeItem('nasa_token');
        status.textContent = '⚠️ توکن وارد نشده است.';
        status.className = 'token-status missing';
    }
}

function getToken() {
    return document.getElementById('nasaToken').value.trim() || localStorage.getItem('nasa_token') || '';
}

// ============================================================
// توابع کمکی
// ============================================================
function showError(msg) {
    const el = document.getElementById('error');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('loading').style.display = 'none';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

// ============================================================
// دریافت ارتفاع
// ============================================================
async function getElevation(lat, lon) {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در دریافت ارتفاع');
        const data = await res.json();
        return data.elevation[0];
    } catch (e) {
        console.warn('Elevation error:', e);
        return null;
    }
}

// ============================================================
// دریافت بارش اخیر
// ============================================================
async function getPrecipitation(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&past_days=10&forecast_days=1&timezone=auto`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در دریافت بارش');
        const data = await res.json();
        const precip = data.daily.precipitation_sum.filter(v => v !== null);
        if (precip.length === 0) return null;
        return {
            avg: precip.reduce((a, b) => a + b, 0) / precip.length,
            max: Math.max(...precip)
        };
    } catch (e) {
        console.warn('Precipitation error:', e);
        return null;
    }
}

// ============================================================
// دریافت بارش تاریخی
// ============================================================
async function getHistoricalPrecipitation(lat, lon) {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=precipitation_sum&timezone=auto`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در دریافت بارش تاریخی');
        const data = await res.json();
        const precip = data.daily.precipitation_sum.filter(v => v !== null);
        if (precip.length === 0) return null;
        return {
            annual: precip.reduce((a, b) => a + b, 0),
            maxDaily: Math.max(...precip)
        };
    } catch (e) {
        console.warn('Historical precipitation error:', e);
        return null;
    }
}

// ============================================================
// تخمین شیب
// ============================================================
async function estimateSlope(lat, lon) {
    const delta = 0.01;
    const points = [
        { lat: lat + delta, lon: lon },
        { lat: lat - delta, lon: lon },
        { lat: lat, lon: lon + delta },
        { lat: lat, lon: lon - delta }
    ];
    const elevs = await Promise.all(points.map(p => getElevation(p.lat, p.lon)));
    const centerElev = await getElevation(lat, lon);
    if (centerElev === null || elevs.some(e => e === null)) return null;

    const dLat = delta * 111000;
    const dLon = delta * 111000 * Math.cos(lat * Math.PI / 180);
    const gradN = (elevs[0] - centerElev) / dLat;
    const gradS = (centerElev - elevs[1]) / dLat;
    const gradE = (elevs[2] - centerElev) / dLon;
    const gradW = (centerElev - elevs[3]) / dLon;
    const gradMag = Math.sqrt(Math.pow((gradN + gradS) / 2, 2) + Math.pow((gradE + gradW) / 2, 2));
    return { slopePercent: gradMag * 100 };
}

// ============================================================
// دریافت NDVI از ORNL DAAC
// ============================================================
async function getNDVI(lat, lon, token) {
    if (!token) {
        console.warn('توکن NASA وارد نشده است');
        return null;
    }

    const url = `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset` +
        `?latitude=${lat}&longitude=${lon}` +
        `&band=250m_16_days_NDVI` +
        `&startDate=A2023001&endDate=A2023096` +
        `&kmAboveBelow=1&kmLeftRight=1`;

    console.log('NDVI Request URL:', url);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log('NDVI Response Status:', res.status);

        if (!res.ok) {
            console.warn('NDVI request failed:', res.status);
            return null;
        }

        const data = await res.json();

        if (!data.subset || !Array.isArray(data.subset) || data.subset.length === 0) {
            console.warn('NDVI subset خالی است');
            return null;
        }

        const scale = parseFloat(data.scale) || 0.0001;

        const values = [];
        data.subset.forEach((item) => {
            let rawValue = null;
            if (item.value !== undefined) rawValue = item.value;
            else if (item.data !== undefined) rawValue = item.data;
            else if (item.ndvi !== undefined) rawValue = item.ndvi;

            if (rawValue === null) return;

            const numValue = parseFloat(rawValue);
            if (isNaN(numValue)) return;

            const scaledValue = numValue * scale;

            if (scaledValue >= -1 && scaledValue <= 1 && numValue !== -3000) {
                values.push(scaledValue);
            }
        });

        if (values.length === 0) {
            console.warn('هیچ مقدار NDVI معتبری یافت نشد');
            return null;
        }

        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        return {
            avg: avg,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length
        };

    } catch (e) {
        console.warn('NDVI error:', e);
        return null;
    }
}

// ============================================================
// دریافت کاربری اراضی از MODIS MCD12Q1
// ============================================================
async function getLandCover(lat, lon, token) {
    if (!token) {
        console.warn('توکن NASA وارد نشده است');
        return null;
    }

    const url = `https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset` +
        `?latitude=${lat}&longitude=${lon}` +
        `&band=LC_Type1` +
        `&startDate=A2022001&endDate=A2022365` +
        `&kmAboveBelow=1&kmLeftRight=1`;

    console.log('LandCover Request URL:', url);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        console.log('LandCover Response Status:', res.status);

        if (!res.ok) {
            const errText = await res.text();
            console.warn('LandCover request failed:', res.status, errText);
            return null;
        }

        const data = await res.json();
        console.log('LandCover Data:', data);

        if (!data.subset || !Array.isArray(data.subset) || data.subset.length === 0) {
            console.warn('LandCover subset خالی است');
            return null;
        }

        const classCounts = {};
        data.subset.forEach(item => {
            let rawValue = null;
            if (item.value !== undefined) rawValue = item.value;
            else if (item.data !== undefined) rawValue = item.data;

            if (rawValue === null) return;

            const classCode = parseInt(rawValue);
            if (isNaN(classCode) || classCode === 255) return;

            classCounts[classCode] = (classCounts[classCode] || 0) + 1;
        });

        if (Object.keys(classCounts).length === 0) {
            console.warn('هیچ کلاس کاربری اراضی معتبری یافت نشد');
            return null;
        }

        let dominantClass = null;
        let maxCount = 0;
        for (const [code, count] of Object.entries(classCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantClass = parseInt(code);
            }
        }

        const info = getLandCoverInfo(dominantClass);

        return {
            code: dominantClass,
            name: info.name,
            nameEn: info.nameEn,
            floodScore: info.floodScore,
            description: info.description,
            classCounts: classCounts,
            totalPixels: Object.values(classCounts).reduce((a, b) => a + b, 0)
        };

    } catch (e) {
        console.warn('LandCover error:', e);
        return null;
    }
}

// ============================================================
// نگاشت کد IGBP به اطلاعات کاربری اراضی
// ============================================================
function getLandCoverInfo(code) {
    const mapping = {
        1:  { name: 'جنگل سوزنی‌برگ همیشه‌سبز', nameEn: 'Evergreen Needleleaf Forest', floodScore: 1, description: 'نفوذپذیری بالا، پوشش گیاهی متراکم' },
        2:  { name: 'جنگل پهن‌برگ همیشه‌سبز', nameEn: 'Evergreen Broadleaf Forest', floodScore: 1, description: 'نفوذپذیری بالا، پوشش گیاهی متراکم' },
        3:  { name: 'جنگل سوزنی‌برگ خزان‌کننده', nameEn: 'Deciduous Needleleaf Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        4:  { name: 'جنگل پهن‌برگ خزان‌کننده', nameEn: 'Deciduous Broadleaf Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        5:  { name: 'جنگل مختلط', nameEn: 'Mixed Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        6:  { name: 'بیشه‌زار', nameEn: 'Closed Shrublands', floodScore: 4, description: 'نفوذپذیری متوسط' },
        7:  { name: 'بوته‌زار باز', nameEn: 'Open Shrublands', floodScore: 5, description: 'نفوذپذیری متوسط تا کم' },
        8:  { name: 'ساوانای چوبی', nameEn: 'Woody Savannas', floodScore: 5, description: 'نفوذپذیری متوسط' },
        9:  { name: 'ساوانا', nameEn: 'Savannas', floodScore: 6, description: 'نفوذپذیری کم' },
        10: { name: 'مرتع', nameEn: 'Grasslands', floodScore: 6, description: 'نفوذپذیری کم' },
        11: { name: 'تالاب دائمی', nameEn: 'Permanent Wetlands', floodScore: 9, description: 'منطقه آبی، ریسک بالا' },
        12: { name: 'زمین‌های زراعی', nameEn: 'Croplands', floodScore: 7, description: 'نفوذپذیری کم، رواناب بالا' },
        13: { name: 'زمین شهری و ساخته‌شده', nameEn: 'Urban and Built-up', floodScore: 10, description: 'سطوح نفوذناپذیر، بالاترین ریسک' },
        14: { name: 'زراعت/پوشش طبیعی موزاییکی', nameEn: 'Cropland/Natural Vegetation Mosaic', floodScore: 6, description: 'مختلط' },
        15: { name: 'برف و یخ دائمی', nameEn: 'Permanent Snow and Ice', floodScore: 3, description: 'ذوب برف می‌تواند سیل ایجاد کند' },
        16: { name: 'زمین بایر', nameEn: 'Barren or Sparsely Vegetated', floodScore: 4, description: 'نفوذپذیری متغیر' },
        17: { name: 'پهنه آبی', nameEn: 'Water Bodies', floodScore: 10, description: 'سطح آب، ریسک بسیار بالا' }
    };

    return mapping[code] || { 
        name: 'نامشخص', 
        nameEn: 'Unknown', 
        floodScore: 5, 
        description: 'کد نامشخص' 
    };
}

// ============================================================
// محاسبه ریسک
// ============================================================
function calculateRisk(elevation, slopePercent, precipData, histPrecip, ndviData, landCoverData) {
    const factors = [];
    let totalScore = 0;
    let weightSum = 0;

    // ۱. ارتفاع (وزن ۳)
    if (elevation !== null) {
        let score;
        if (elevation < 200) score = 10;
        else if (elevation < 500) score = 8;
        else if (elevation < 1000) score = 6;
        else if (elevation < 1500) score = 4;
        else if (elevation < 2000) score = 2;
        else score = 1;
        factors.push({ name: 'ارتفاع از سطح دریا', value: `${elevation.toFixed(0)} متر`, score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۲. شیب (وزن ۳)
    if (slopePercent !== null) {
        let score;
        if (slopePercent < 0.5) score = 10;
        else if (slopePercent < 1) score = 8;
        else if (slopePercent < 2) score = 6;
        else if (slopePercent < 5) score = 4;
        else if (slopePercent < 10) score = 2;
        else score = 1;
        factors.push({ name: 'شیب زمین', value: `${slopePercent.toFixed(2)}%`, score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۳. بارش سالانه (وزن ۴)
    if (histPrecip) {
        let score;
        const annual = histPrecip.annual;
        if (annual > 1000) score = 10;
        else if (annual > 700) score = 8;
        else if (annual > 500) score = 6;
        else if (annual > 300) score = 4;
        else if (annual > 150) score = 2;
        else score = 1;
        factors.push({ name: 'بارش سالانه (تخمینی)', value: `${annual.toFixed(0)} میلی‌متر`, score, weight: 4 });
        totalScore += score * 4;
        weightSum += 4;

        let maxScore;
        const maxD = histPrecip.maxDaily;
        if (maxD > 50) maxScore = 10;
        else if (maxD > 30) maxScore = 8;
        else if (maxD > 20) maxScore = 6;
        else if (maxD > 10) maxScore = 4;
        else maxScore = 2;
        factors.push({ name: 'حداکثر بارش روزانه', value: `${maxD.toFixed(1)} میلی‌متر`, score: maxScore, weight: 2 });
        totalScore += maxScore * 2;
        weightSum += 2;
    }

    // ۴. بارش اخیر (وزن ۲)
    if (precipData) {
        let score;
        const avg = precipData.avg;
        if (avg > 5) score = 10;
        else if (avg > 3) score = 8;
        else if (avg > 1) score = 6;
        else if (avg > 0.5) score = 4;
        else score = 2;
        factors.push({ name: 'بارش میانگین ۱۰ روز اخیر', value: `${avg.toFixed(2)} میلی‌متر`, score, weight: 2 });
        totalScore += score * 2;
        weightSum += 2;
    }

    // ۵. NDVI (وزن ۳)
    if (ndviData) {
        let score;
        const ndvi = ndviData.avg;
        if (ndvi < 0) score = 10;
        else if (ndvi < 0.1) score = 9;
        else if (ndvi < 0.2) score = 7;
        else if (ndvi < 0.3) score = 5;
        else if (ndvi < 0.4) score = 4;
        else if (ndvi < 0.5) score = 3;
        else if (ndvi < 0.6) score = 2;
        else score = 1;
        factors.push({ name: 'شاخص پوشش گیاهی (NDVI)', value: ndvi.toFixed(3), score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۶. کاربری اراضی (وزن ۴)
    if (landCoverData) {
        const score = landCoverData.floodScore;
        factors.push({ 
            name: 'کاربری اراضی', 
            value: `${landCoverData.name} (کد ${landCoverData.code})`, 
            score, 
            weight: 4 
        });
        totalScore += score * 4;
        weightSum += 4;
    }

    const finalScore = weightSum > 0 ? totalScore / weightSum : 0;
    return { factors, finalScore };
}

// ============================================================
// تابع اصلی تحلیل
// ============================================================
async function analyzeFloodRisk() {
    hideError();
    const resultEl = document.getElementById('result');
    const loadingEl = document.getElementById('loading');
    const btn = document.getElementById('analyzeBtn');

    resultEl.classList.remove('show', 'very-low', 'low', 'medium', 'high', 'very-high');

    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);

    if (isNaN(lat) || isNaN(lon)) {
        showError('لطفاً مختصات معتبر وارد کنید');
        return;
    }

    btn.disabled = true;
    loadingEl.style.display = 'block';

    const token = getToken();

    try {
        const [elevation, slopeData, precipData, histPrecip, ndviData, landCoverData] = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getPrecipitation(lat, lon),
            getHistoricalPrecipitation(lat, lon),
            getNDVI(lat, lon, token),
            getLandCover(lat, lon, token)
        ]);

        loadingEl.style.display = 'none';

        if (elevation === null && !slopeData && !histPrecip) {
            showError('متأسفانه نتوانستیم داده‌ای برای این موقعیت دریافت کنیم.');
            btn.disabled = false;
            return;
        }

        const slopePercent = slopeData ? slopeData.slopePercent : null;
        const { factors, finalScore } = calculateRisk(elevation, slopePercent, precipData, histPrecip, ndviData, landCoverData);

        let riskLevel, riskClass, riskAdvice;
        if (finalScore >= 8) {
            riskLevel = '🔴 ریسک خیلی زیاد';
            riskClass = 'very-high';
            riskAdvice = 'این منطقه در معرض خطر جدی سیل قرار دارد. اقدامات فوری پیشگیری و آماده‌سازی لازم است.';
        } else if (finalScore >= 6) {
            riskLevel = '🟠 ریسک زیاد';
            riskClass = 'high';
            riskAdvice = 'خطر سیل قابل توجه است. برنامه‌های آمادگی و کاهش خطر توصیه می‌شود.';
        } else if (finalScore >= 4) {
            riskLevel = '🟡 ریسک متوسط';
            riskClass = 'medium';
            riskAdvice = 'ریسک سیل در حد متوسط است. پایش و اقدامات احتیاطی توصیه می‌شود.';
        } else if (finalScore >= 2) {
            riskLevel = '🟢 ریسک کم';
            riskClass = 'low';
            riskAdvice = 'ریسک سیل پایین است. اما همچنان هوشیاری در فصل بارش توصیه می‌شود.';
        } else {
            riskLevel = '🟢 ریسک خیلی کم';
            riskClass = 'very-low';
            riskAdvice = 'ریسک سیل در این منطقه بسیار پایین است.';
        }

        document.getElementById('riskLevel').textContent = riskLevel;
        document.getElementById('riskScore').innerHTML = 
            `<strong>نمره ریسک: ${finalScore.toFixed(2)} از ۱۰</strong>` +
            `<p style="margin-top: 10px; font-size: 14px; color: #4a5568; line-height: 1.6;">${riskAdvice}</p>`;

        let detailsHtml = '<h3 style="margin: 15px 0 10px;">📊 جزئیات پارامترها:</h3>';
        factors.forEach(f => {
            detailsHtml += `<div class="param-row">
                <span>${f.name}</span>
                <span>${f.value} (نمره: ${f.score}/10، وزن: ${f.weight})</span>
            </div>`;
        });

        if (!ndviData) {
            detailsHtml += '<p style="color: #d69e2e; margin-top: 10px;">⚠️ داده NDVI دریافت نشد. ' +
                (token ? 'ممکن است توکن نامعتبر باشد یا سرویس در دسترس نباشد.' : 'برای دریافت، توکن NASA را وارد کنید.') + '</p>';
        }

        if (!landCoverData) {
            detailsHtml += '<p style="color: #d69e2e; margin-top: 10px;">⚠️ داده کاربری اراضی دریافت نشد. ' +
                (token ? 'ممکن است محصول MCD12Q1 برای این سال موجود نباشد.' : 'برای دریافت، توکن NASA را وارد کنید.') + '</p>';
        }

        document.getElementById('details').innerHTML = detailsHtml;

        // ذخیره اطلاعات برای PDF
        lastAnalysis = {
            lat: lat,
            lon: lon,
            finalScore: finalScore,
            riskLevel: riskLevel,
            riskAdvice: riskAdvice,
            factors: factors
        };

        resultEl.classList.add('show', riskClass);

        if (map) {
            map.setView([lat, lon], 12);
            updateMarker(lat, lon);
        }

    } catch (e) {
        console.error(e);
        showError('خطا در تحلیل: ' + e.message);
    } finally {
        loadingEl.style.display = 'none';
        btn.disabled = false;
    }
}

// ============================================================
// تولید و دانلود PDF (نسخه فارسی)
// ============================================================
async function downloadPDF() {
    if (!lastAnalysis) {
        alert('ابتدا یک تحلیل انجام دهید');
        return;
    }

    const btn = document.getElementById('pdfBtn');
    btn.disabled = true;
    btn.textContent = '⏳ در حال تولید PDF...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 15;
        const contentWidth = pageWidth - 2 * margin;

        // ========== بارگذاری فونت فارسی ==========
        try {
            const fontResponse = await fetch('Vazirmatn-Regular.ttf');
            const fontBuffer = await fontResponse.arrayBuffer();
            const fontBase64 = arrayBufferToBase64(fontBuffer);

            doc.addFileToVFS('Vazirmatn-Regular.ttf', fontBase64);
            doc.addFont('Vazirmatn-Regular.ttf', 'Vazirmatn', 'normal');
            doc.setFont('Vazirmatn');
            console.log('✅ فونت فارسی بارگذاری شد');
        } catch (fontErr) {
            console.warn('⚠️ خطا در بارگذاری فونت فارسی:', fontErr);
            doc.setFont('helvetica');
        }

        // ========== تابع کمکی برای متن فارسی ==========
        // jsPDF از راست‌چین پشتیبانی نمی‌کند، پس متن را دستی اصلاح می‌کنیم
        function faText(text) {
            // معکوس کردن کلمات برای نمایش درست
            return text;
        }

        // سربرگ
        doc.setFillColor(49, 130, 206);
        doc.rect(0, 0, pageWidth, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text('گزارش ارزیابی ریسک سیل', pageWidth - margin, 15, { align: 'right' });

        doc.setFontSize(10);
        const now = new Date();
        const dateStr = now.toLocaleDateString('fa-IR') + ' - ' + now.toLocaleTimeString('fa-IR');
        doc.text(dateStr, pageWidth - margin, 24, { align: 'right' });

        // مختصات
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        let yPos = 45;

        doc.setFont('Vazirmatn', 'bold');
        doc.text('موقعیت جغرافیایی:', pageWidth - margin, yPos, { align: 'right' });
        doc.setFont('Vazirmatn', 'normal');
        yPos += 7;

        doc.text(`عرض جغرافیایی: ${lastAnalysis.lat.toFixed(4)}`, pageWidth - margin, yPos, { align: 'right' });
        doc.text(`طول جغرافیایی: ${lastAnalysis.lon.toFixed(4)}`, pageWidth - margin - 80, yPos, { align: 'right' });
        yPos += 12;

        // نمره نهایی
        const scoreColor = getScoreRGB(lastAnalysis.finalScore);
        doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('Vazirmatn', 'bold');
        doc.text(`نمره ریسک: ${lastAnalysis.finalScore.toFixed(2)} از ۱۰`, pageWidth - margin - 5, yPos + 10, { align: 'right' });

        doc.setFontSize(12);
        doc.text(`سطح ریسک: ${getRiskLevelFa(lastAnalysis.finalScore)}`, pageWidth - margin - 5, yPos + 18, { align: 'right' });

        yPos += 35;

        // نقشه
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('Vazirmatn', 'bold');
        doc.text('نقشه موقعیت:', pageWidth - margin, yPos, { align: 'right' });
        yPos += 5;

        try {
            const mapElement = document.getElementById('map');
            const canvas = await html2canvas(mapElement, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                backgroundColor: '#ffffff'
            });
            const mapImage = canvas.toDataURL('image/png');

            const mapHeight = 70;
            doc.addImage(mapImage, 'PNG', margin, yPos, contentWidth, mapHeight);
            yPos += mapHeight + 10;
        } catch (mapErr) {
            console.warn('خطا در تبدیل نقشه:', mapErr);
            doc.setFont('Vazirmatn', 'normal');
            doc.setFontSize(10);
            doc.text('(تصویر نقشه تولید نشد)', pageWidth - margin, yPos, { align: 'right' });
            yPos += 10;
        }

        // جدول پارامترها
        doc.setFontSize(12);
        doc.setFont('Vazirmatn', 'bold');
        doc.text('پارامترهای تحلیل‌شده:', pageWidth - margin, yPos, { align: 'right' });
        yPos += 7;

        // سربرگ جدول (از راست به چپ)
        const colWidths = [contentWidth * 0.15, contentWidth * 0.15, contentWidth * 0.35, contentWidth * 0.35];
        // موقعیت ستون‌ها از راست
        const rightX = pageWidth - margin;
        const col1X = rightX - colWidths[0];           // وزن
        const col2X = col1X - colWidths[1];            // نمره
        const col3X = col2X - colWidths[2];            // مقدار
        const col4X = col3X - colWidths[3];            // نام پارامتر

        doc.setFillColor(226, 232, 240);
        doc.rect(margin, yPos, contentWidth, 8, 'F');

        doc.setFontSize(10);
        doc.setFont('Vazirmatn', 'bold');
        doc.text('وزن', rightX - 2, yPos + 5.5, { align: 'right' });
        doc.text('نمره', col1X - 2, yPos + 5.5, { align: 'right' });
        doc.text('مقدار', col2X - 2, yPos + 5.5, { align: 'right' });
        doc.text('پارامتر', col3X - 2, yPos + 5.5, { align: 'right' });
        yPos += 8;

        // ردیف‌های جدول
        doc.setFont('Vazirmatn', 'normal');
        doc.setFontSize(9);

        lastAnalysis.factors.forEach((f, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(247, 250, 252);
                doc.rect(margin, yPos, contentWidth, 8, 'F');
            }

            doc.text(`${f.weight}`, rightX - 2, yPos + 5.5, { align: 'right' });
            doc.text(`${f.score}/10`, col1X - 2, yPos + 5.5, { align: 'right' });
            doc.text(f.value, col2X - 2, yPos + 5.5, { align: 'right' });
            doc.text(f.name, col3X - 2, yPos + 5.5, { align: 'right' });

            yPos += 8;
        });

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPos, margin + contentWidth, yPos);
        yPos += 10;

        // توصیه
        doc.setFontSize(11);
        doc.setFont('Vazirmatn', 'bold');
        doc.text('توصیه:', pageWidth - margin, yPos, { align: 'right' });
        yPos += 6;

        doc.setFont('Vazirmatn', 'normal');
        doc.setFontSize(9);

        // شکستن متن طولانی به چند خط
        const adviceLines = doc.splitTextToSize(lastAnalysis.riskAdvice, contentWidth);
        adviceLines.forEach(line => {
            doc.text(line, pageWidth - margin, yPos, { align: 'right' });
            yPos += 5;
        });

        // پانویس
        const footerY = pageHeight - 20;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, footerY - 5, margin + contentWidth, footerY - 5);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.setFont('Vazirmatn', 'normal');
        doc.text(
            'این تحلیل بر اساس داده‌های جهانی و مدل‌های ساده‌شده انجام شده و جایگزین مطالعات دقیق هیدرولوژیکی نیست.',
            pageWidth - margin,
            footerY,
            { align: 'right' }
        );
        doc.text(
            `تولید شده توسط ابزار ارزیابی ریسک سیل - ${now.toLocaleString('fa-IR')}`,
            pageWidth - margin,
            footerY + 5,
            { align: 'right' }
        );

        // ذخیره
        const fileName = `flood-risk-${lastAnalysis.lat.toFixed(4)}-${lastAnalysis.lon.toFixed(4)}-${Date.now()}.pdf`;
        doc.save(fileName);

        console.log('✅ PDF فارسی با موفقیت تولید شد:', fileName);

    } catch (e) {
        console.error('خطا در تولید PDF:', e);
        alert('خطا در تولید PDF: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 دانلود گزارش PDF';
    }
}

// ============================================================
// توابع کمکی PDF
// ============================================================
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function getScoreRGB(score) {
    if (score >= 8) return [229, 62, 62];
    if (score >= 6) return [221, 107, 32];
    if (score >= 4) return [214, 158, 46];
    if (score >= 2) return [56, 161, 105];
    return [34, 84, 61];
}

function getRiskLevelFa(score) {
    if (score >= 8) return 'خیلی زیاد';
    if (score >= 6) return 'زیاد';
    if (score >= 4) return 'متوسط';
    if (score >= 2) return 'کم';
    return 'خیلی کم';
}
// ============================================================
// راه‌اندازی اولیه
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
    loadToken();
    initMap();
    console.log('برنامه با موفقیت راه‌اندازی شد 🚀 (فاز ۳)');
});
