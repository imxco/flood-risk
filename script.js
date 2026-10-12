// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let analysisCircle = null;
let lastAnalysis = null;
let rainChart = null;

const MONTH_NAMES_FA = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

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
// دریافت بارش اخیر (۱۰ روز)
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
            max: Math.max(...precip),
            total: precip.reduce((a, b) => a + b, 0)
        };
    } catch (e) {
        console.warn('Precipitation error:', e);
        return null;
    }
}

// ============================================================
// دریافت بارش ماهانه ۱۰ سال اخیر (بازه پویا)
// ============================================================
async function getMonthlyPrecipitation(lat, lon) {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;

    const startDate = `${startYear}-01-01`;
    const endDate = `${endYear}-12-31`;

    console.log(`دریافت بارش از ${startDate} تا ${endDate}`);

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum&timezone=auto`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در دریافت بارش تاریخی');
        const data = await res.json();

        if (!data.daily || !data.daily.time || !data.daily.precipitation_sum) {
            return null;
        }

        const times = data.daily.time;
        const precip = data.daily.precipitation_sum;

        const yearlyTotals = {};

        for (let i = 0; i < times.length; i++) {
            const date = new Date(times[i]);
            const month = date.getMonth();
            const year = date.getFullYear();
            const value = precip[i];

            if (value === null || value === undefined) continue;

            if (!yearlyTotals[year]) {
                yearlyTotals[year] = Array.from({ length: 12 }, () => 0);
            }
            yearlyTotals[year][month] += value;
        }

        const monthlyAvg = Array.from({ length: 12 }, () => []);
        const years = Object.keys(yearlyTotals);

        for (const year of years) {
            for (let m = 0; m < 12; m++) {
                monthlyAvg[m].push(yearlyTotals[year][m]);
            }
        }

        const monthlyAverages = monthlyAvg.map(arr =>
            arr.reduce((a, b) => a + b, 0) / arr.length
        );

        // نگاشت به تقویم شمسی (تقریبی)
        const monthOrder = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
        const persianMonthlyAvg = monthOrder.map(m => monthlyAverages[m]);

        const annualTotals = years.map(y =>
            yearlyTotals[y].reduce((a, b) => a + b, 0)
        );
        const annualAvg = annualTotals.reduce((a, b) => a + b, 0) / annualTotals.length;

        const sumMonthly = persianMonthlyAvg.reduce((a, b) => a + b, 0);
        const sumSquared = persianMonthlyAvg.reduce((a, b) => a + b * b, 0);
        const pci = sumMonthly > 0 ? (sumSquared / (sumMonthly * sumMonthly)) * 100 : 0;

        let maxMonthIndex = 0;
        let maxMonthValue = 0;
        persianMonthlyAvg.forEach((v, i) => {
            if (v > maxMonthValue) {
                maxMonthValue = v;
                maxMonthIndex = i;
            }
        });

        const threshold = annualAvg * 0.1;
        const rainyMonthsCount = persianMonthlyAvg.filter(v => v > threshold).length;

        return {
            monthlyAvg: persianMonthlyAvg,
            annualAvg: annualAvg,
            pci: pci,
            maxMonth: {
                index: maxMonthIndex,
                name: MONTH_NAMES_FA[maxMonthIndex],
                value: maxMonthValue
            },
            rainyMonthsCount: rainyMonthsCount,
            yearsCount: years.length,
            yearRange: `${startYear}-${endYear}`,
            startDate: startDate,
            endDate: endDate
        };

    } catch (e) {
        console.warn('Monthly precipitation error:', e);
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
// نمره‌دهی PCI
// ============================================================
function getPCIScore(pci) {
    if (pci < 10) return 2;
    if (pci < 15) return 4;
    if (pci < 20) return 6;
    if (pci < 25) return 8;
    return 10;
}

function getPCILabel(pci) {
    if (pci < 10) return { text: 'بسیار پخش‌شده', class: 'pci-low' };
    if (pci < 15) return { text: 'پخش‌شده', class: 'pci-low' };
    if (pci < 20) return { text: 'نیمه‌متمرکز', class: 'pci-medium' };
    if (pci < 25) return { text: 'متمرکز', class: 'pci-high' };
    return { text: 'بسیار متمرکز', class: 'pci-very-high' };
}

// ============================================================
// محاسبه ریسک
// ============================================================
function calculateRisk(elevation, slopePercent, precipData, monthlyPrecip, ndviData, landCoverData) {
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
    if (monthlyPrecip) {
        let score;
        const annual = monthlyPrecip.annualAvg;
        const yearsCount = monthlyPrecip.yearsCount || 10;
        if (annual > 1000) score = 10;
        else if (annual > 700) score = 8;
        else if (annual > 500) score = 6;
        else if (annual > 300) score = 4;
        else if (annual > 150) score = 2;
        else score = 1;
        factors.push({
            name: `بارش سالانه (میانگین ${yearsCount} سال)`,
            value: `${annual.toFixed(0)} میلی‌متر`,
            score,
            weight: 4
        });
        totalScore += score * 4;
        weightSum += 4;
    }

    // ۴. شاخص تمرکز بارش (PCI) - وزن ۳
    if (monthlyPrecip) {
        const pci = monthlyPrecip.pci;
        const pciScore = getPCIScore(pci);
        const pciLabel = getPCILabel(pci);

        factors.push({
            name: 'شاخص تمرکز بارش (PCI)',
            value: `${pci.toFixed(1)} - ${pciLabel.text}`,
            score: pciScore,
            weight: 3
        });
        totalScore += pciScore * 3;
        weightSum += 3;
    }

    // ۵. بارش اخیر (وزن ۲)
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

    // ۶. NDVI (وزن ۳)
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

    // ۷. کاربری اراضی (وزن ۴)
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
// رسم نمودار بارش ماهانه
// ============================================================
function drawRainChart(monthlyData) {
    const chartSection = document.getElementById('chartSection');
    const ctx = document.getElementById('rainChart').getContext('2d');

    if (rainChart) {
        rainChart.destroy();
        rainChart = null;
    }

    const maxVal = Math.max(...monthlyData.monthlyAvg);
    const colors = monthlyData.monthlyAvg.map(v => {
        const ratio = maxVal > 0 ? v / maxVal : 0;
        if (ratio > 0.8) return '#c53030';
        if (ratio > 0.6) return '#dd6b20';
        if (ratio > 0.4) return '#d69e2e';
        if (ratio > 0.2) return '#38a169';
        return '#68d391';
    });

    rainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTH_NAMES_FA,
            datasets: [{
                label: 'میانگین بارش (mm)',
                data: monthlyData.monthlyAvg.map(v => parseFloat(v.toFixed(1))),
                backgroundColor: colors,
                borderColor: colors.map(c => c),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    rtl: true,
                    textDirection: 'rtl',
                    titleFont: { family: 'Tahoma', size: 14 },
                    bodyFont: { family: 'Tahoma', size: 13 },
                    callbacks: {
                        label: function(context) {
                            return 'بارش: ' + context.parsed.y + ' میلی‌متر';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'بارش (میلی‌متر)',
                        font: { family: 'Tahoma', size: 12 }
                    },
                    ticks: { font: { family: 'Tahoma' } }
                },
                x: {
                    title: {
                        display: true,
                        text: 'ماه',
                        font: { family: 'Tahoma', size: 12 }
                    },
                    ticks: { font: { family: 'Tahoma', size: 11 } }
                }
            }
        }
    });

    // به‌روزرسانی عنوان با بازه تاریخ
    const chartTitle = document.getElementById('chartTitle');
    if (chartTitle && monthlyData.yearRange) {
        chartTitle.textContent = `📊 میانگین بارش ماهانه (${monthlyData.yearRange})`;
    }

    const pciLabel = getPCILabel(monthlyData.pci);
        const infoHtml = 
        '<div><strong>بازه تحلیل:</strong> ' + monthlyData.yearRange + ' (' + monthlyData.yearsCount + ' سال)</div>' +
        '<div><strong>بارش سالانه (میانگین ' + monthlyData.yearsCount + ' سال):</strong> ' + monthlyData.annualAvg.toFixed(0) + ' میلی‌متر</div>' +
        '<div><strong>پرباران‌ترین ماه:</strong> ' + monthlyData.maxMonth.name + ' با ' + monthlyData.maxMonth.value.toFixed(1) + ' میلی‌متر</div>' +
        '<div><strong>تعداد ماه‌های پرباران:</strong> ' + monthlyData.rainyMonthsCount + ' ماه</div>' +
        '<div><strong>شاخص تمرکز بارش (PCI):</strong> ' + monthlyData.pci.toFixed(1) + 
            ' <span class="pci-badge ' + pciLabel.class + '">' + pciLabel.text + '</span>' +
        '</div>' +
        '<div style="font-size: 12px; color: #718096; margin-top: 8px;">PCI پایین‌تر = بارش پخش‌شده در سال (ریسک سیل کمتر) | PCI بالاتر = بارش متمرکز (ریسک سیل بیشتر)</div>';
    document.getElementById('chartInfo').innerHTML = infoHtml;

    chartSection.style.display = 'block';
}

// ============================================================
// تابع اصلی تحلیل
// ============================================================
async function analyzeFloodRisk() {
    hideError();
    const resultEl = document.getElementById('result');
    const loadingEl = document.getElementById('loading');
    const btn = document.getElementById('analyzeBtn');
    const chartSection = document.getElementById('chartSection');

    resultEl.classList.remove('show', 'very-low', 'low', 'medium', 'high', 'very-high');
    chartSection.style.display = 'none';

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
        const [elevation, slopeData, precipData, monthlyPrecip, ndviData, landCoverData] = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getPrecipitation(lat, lon),
            getMonthlyPrecipitation(lat, lon),
            getNDVI(lat, lon, token),
            getLandCover(lat, lon, token)
        ]);

        loadingEl.style.display = 'none';

        if (elevation === null && !slopeData && !monthlyPrecip) {
            showError('متأسفانه نتوانستیم داده‌ای برای این موقعیت دریافت کنیم.');
            btn.disabled = false;
            return;
        }

        const slopePercent = slopeData ? slopeData.slopePercent : null;
        const { factors, finalScore } = calculateRisk(
            elevation, slopePercent, precipData, monthlyPrecip, ndviData, landCoverData
        );

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

        if (monthlyPrecip && monthlyPrecip.monthlyAvg) {
            drawRainChart(monthlyPrecip);
        }

        lastAnalysis = {
            lat: lat,
            lon: lon,
            finalScore: finalScore,
            riskLevel: riskLevel,
            riskAdvice: riskAdvice,
            factors: factors,
            monthlyPrecip: monthlyPrecip
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
// تولید و دانلود PDF
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
        const now = new Date();
        document.getElementById('pdfDate').textContent =
            now.toLocaleDateString('fa-IR') + ' - ' + now.toLocaleTimeString('fa-IR');
        document.getElementById('pdfLat').textContent = lastAnalysis.lat.toFixed(4);
        document.getElementById('pdfLon').textContent = lastAnalysis.lon.toFixed(4);

        let riskText, riskColor;
        if (lastAnalysis.finalScore >= 8) {
            riskText = '🔴 ریسک خیلی زیاد';
            riskColor = '#e53e3e';
        } else if (lastAnalysis.finalScore >= 6) {
            riskText = '🟠 ریسک زیاد';
            riskColor = '#dd6b20';
        } else if (lastAnalysis.finalScore >= 4) {
            riskText = '🟡 ریسک متوسط';
            riskColor = '#d69e2e';
        } else if (lastAnalysis.finalScore >= 2) {
            riskText = '🟢 ریسک کم';
            riskColor = '#38a169';
        } else {
            riskText = '🟢 ریسک خیلی کم';
            riskColor = '#22543d';
        }

        document.getElementById('pdfRiskLevel').textContent = riskText;
        document.getElementById('pdfScore').textContent = `نمره ریسک: ${lastAnalysis.finalScore.toFixed(2)} از ۱۰`;
        document.getElementById('pdfScoreBox').style.background = riskColor;
        document.getElementById('pdfAdvice').textContent = lastAnalysis.riskAdvice;

        // جدول پارامترها
        const tbody = document.getElementById('pdfParamsBody');
        tbody.innerHTML = '';
        lastAnalysis.factors.forEach((f, i) => {
            const row = document.createElement('tr');
            row.style.background = i % 2 === 0 ? '#f7fafc' : 'white';
            row.innerHTML = `
                <td style="padding: 8px; border: 1px solid #cbd5e0;">${f.name}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e0;">${f.value}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e0; text-align: center;">${f.score}/10</td>
                <td style="padding: 8px; border: 1px solid #cbd5e0; text-align: center;">${f.weight}</td>
            `;
            tbody.appendChild(row);
        });

        // کپی نقشه
        const mapContainer = document.getElementById('pdfMapContainer');
        const mapElement = document.getElementById('map');

        try {
            const mapCanvas = await html2canvas(mapElement, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                backgroundColor: '#ffffff'
            });
            const mapImg = document.createElement('img');
            mapImg.src = mapCanvas.toDataURL('image/png');
            mapImg.style.width = '100%';
            mapImg.style.height = '100%';
            mapImg.style.objectFit = 'cover';
            mapContainer.innerHTML = '';
            mapContainer.appendChild(mapImg);
        } catch (mapErr) {
            console.warn('خطا در عکس‌برداری از نقشه:', mapErr);
            mapContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #718096;">نقشه در دسترس نیست</p>';
        }

        // کپی نمودار
        const pdfChartContainer = document.getElementById('pdfChartContainer');
        const pdfChartImage = document.getElementById('pdfChartImage');

        if (rainChart && lastAnalysis.monthlyPrecip) {
            try {
                const chartCanvas = document.getElementById('rainChart');
                const chartImg = document.createElement('img');
                chartImg.src = chartCanvas.toDataURL('image/png');
                chartImg.style.width = '100%';
                chartImg.style.maxWidth = '600px';
                pdfChartImage.innerHTML = '';
                pdfChartImage.appendChild(chartImg);

                const pciLabel = getPCILabel(lastAnalysis.monthlyPrecip.pci);
                const mp = lastAnalysis.monthlyPrecip;
                const infoDiv = document.createElement('div');
                infoDiv.style.marginTop = '10px';
                infoDiv.style.fontSize = '13px';
                infoDiv.style.lineHeight = '1.8';
                infoDiv.style.textAlign = 'right';
                infoDiv.innerHTML = `
                    <div><strong>بازه تحلیل:</strong> ${mp.yearRange} (${mp.yearsCount} سال)</div>
                    <div><strong>بارش سالانه:</strong> ${mp.annualAvg.toFixed(0)} میلی‌متر</div>
                    <div><strong>پرباران‌ترین ماه:</strong> ${mp.maxMonth.name} با ${mp.maxMonth.value.toFixed(1)} میلی‌متر</div>
                    <div><strong>شاخص تمرکز بارش (PCI):</strong> ${mp.pci.toFixed(1)} - ${pciLabel.text}</div>
                `;
                pdfChartImage.appendChild(infoDiv);

                pdfChartContainer.style.display = 'block';
            } catch (chartErr) {
                console.warn('خطا در کپی نمودار:', chartErr);
                pdfChartContainer.style.display = 'none';
            }
        } else {
            pdfChartContainer.style.display = 'none';
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const template = document.getElementById('pdfTemplate');
        const canvas = await html2canvas(template, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: 800
        });

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - 2 * margin;

        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (imgHeight <= pageHeight - 2 * margin) {
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            doc.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
        } else {
            const totalPages = Math.ceil(imgHeight / (pageHeight - 2 * margin));
            const pageContentHeight = pageHeight - 2 * margin;
            const pageCanvasHeight = (pageContentHeight / imgHeight) * canvas.height;

            for (let page = 0; page < totalPages; page++) {
                if (page > 0) doc.addPage();

                const srcY = page * pageCanvasHeight;
                const srcHeight = Math.min(pageCanvasHeight, canvas.height - srcY);

                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = srcHeight;

                const ctx = pageCanvas.getContext('2d');
                ctx.drawImage(
                    canvas,
                    0, srcY, canvas.width, srcHeight,
                    0, 0, canvas.width, srcHeight
                );

                const pageData = pageCanvas.toDataURL('image/jpeg', 0.95);
                const displayHeight = (srcHeight * imgWidth) / canvas.width;
                doc.addImage(pageData, 'JPEG', margin, margin, imgWidth, displayHeight);
            }
        }

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
// راه‌اندازی اولیه
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
    loadToken();
    initMap();
    console.log('برنامه با موفقیت راه‌اندازی شد 🚀 (نسخه نهایی با نمودار)');
});
