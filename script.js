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
        console.log('موقعیت انتخاب شد: ' + lat + ', ' + lon);
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

    marker.bindPopup(
        '<div style="text-align: center; font-family: Tahoma;">' +
            '<strong>موقعیت تحلیل</strong><br>' +
            lat.toFixed(4) + ', ' + lon.toFixed(4) + '<br>' +
            '<small>می‌توانید مارکر را جابجا کنید</small>' +
        '</div>'
    ).openPopup();
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
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + lat + '&longitude=' + lon;
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
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&daily=precipitation_sum&past_days=10&forecast_days=1&timezone=auto';
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

    const startDate = startYear + '-01-01';
    const endDate = endYear + '-12-31';

    console.log('دریافت بارش از ' + startDate + ' تا ' + endDate);

    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + startDate + '&end_date=' + endDate + '&daily=precipitation_sum&timezone=auto';

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
            yearRange: startYear + '-' + endYear,
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
// فاصله از نزدیک‌ترین رودخانه (OpenStreetMap Overpass API)
// ============================================================
async function getRiverDistance(lat, lon) {
    // شعاع جستجو: ۱۰ کیلومتر
    const radius = 10000;

    // کوئری Overpass برای دریافت آبراهه‌ها
    // شامل river (رودخانه)، stream (نهر)، canal (کانال)، drain (زهکش)
    const query = '[out:json][timeout:25];' +
        '(' +
            'way["waterway"~"river|stream|canal|drain"](around:' + radius + ',' + lat + ',' + lon + ');' +
        ');' +
        'out geom;';

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    console.log('River Distance Request URL:', url);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('Overpass API error:', res.status);
            return null;
        }

        const data = await res.json();

        if (!data.elements || data.elements.length === 0) {
            console.warn('هیچ آبراهه‌ای در شعاع ۱۰ کیلومتری یافت نشد');
            return {
                distance: null,
                distanceText: 'بیش از ۱۰ کیلومتر',
                name: null,
                type: null,
                found: false
            };
        }

        console.log('تعداد آبراهه‌های یافت‌شده:', data.elements.length);

        // محاسبه فاصله تا نزدیک‌ترین نقطه از هر آبراهه
        let minDistance = Infinity;
        let nearestWaterway = null;
        let nearestPoint = null;

        data.elements.forEach(element => {
            if (!element.geometry || !Array.isArray(element.geometry)) return;

            element.geometry.forEach(point => {
                const dist = haversineDistance(lat, lon, point.lat, point.lon);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestWaterway = element;
                    nearestPoint = point;
                }
            });
        });

        if (nearestWaterway === null) {
            return null;
        }

        // استخراج نام و نوع
        const tags = nearestWaterway.tags || {};
        const name = tags.name || tags['name:fa'] || tags['name:en'] || 'بدون نام';
        const type = tags.waterway || 'نامشخص';

        // تبدیل نوع به فارسی
        const typeMap = {
            'river': 'رودخانه',
            'stream': 'نهر',
            'canal': 'کانال',
            'drain': 'زهکش'
        };
        const typeFa = typeMap[type] || type;

        // فرمت فاصله
        let distanceText;
        if (minDistance < 1000) {
            distanceText = minDistance.toFixed(0) + ' متر';
        } else {
            distanceText = (minDistance / 1000).toFixed(2) + ' کیلومتر';
        }

        return {
            distance: minDistance,          // فاصله به متر
            distanceText: distanceText,     // متن فرمت‌شده
            name: name,                     // نام رودخانه
            type: typeFa,                   // نوع (رودخانه/نهر/کانال)
            found: true
        };

    } catch (e) {
        console.warn('River Distance error:', e);
        return null;
    }
}

// ============================================================
// محاسبه فاصله هاورساین (بین دو نقطه جغرافیایی)
// ============================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // شعاع زمین به متر
    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================
// نمره‌دهی فاصله از رودخانه
// ============================================================
function getRiverScore(distance) {
    if (distance === null || distance === undefined) return 1; // اگر پیدا نشد، ریسک کم
    if (distance < 100) return 10;
    if (distance < 200) return 8;
    if (distance < 300) return 6;
    if (distance < 500) return 4;
    return 2;
}

// ============================================================
// دریافت NDVI از ORNL DAAC
// ============================================================
async function getNDVI(lat, lon, token) {
    if (!token) {
        console.warn('توکن NASA وارد نشده است');
        return null;
    }

    const url = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset' +
        '?latitude=' + lat + '&longitude=' + lon +
        '&band=250m_16_days_NDVI' +
        '&startDate=A2023001&endDate=A2023096' +
        '&kmAboveBelow=1&kmLeftRight=1';

    console.log('NDVI Request URL:', url);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
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

    const url = 'https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset' +
        '?latitude=' + lat + '&longitude=' + lon +
        '&band=LC_Type1' +
        '&startDate=A2022001&endDate=A2022365' +
        '&kmAboveBelow=1&kmLeftRight=1';

    console.log('LandCover Request URL:', url);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
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
        for (const code in classCounts) {
            if (classCounts[code] > maxCount) {
                maxCount = classCounts[code];
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
        1:  { name: 'جنگل سوزنی‌برگ همیشه‌سبز', nameEn: 'Evergreen Needleleaf Forest', floodScore: 1, description: 'نفوذپذیری بالا' },
        2:  { name: 'جنگل پهن‌برگ همیشه‌سبز', nameEn: 'Evergreen Broadleaf Forest', floodScore: 1, description: 'نفوذپذیری بالا' },
        3:  { name: 'جنگل سوزنی‌برگ خزان‌کننده', nameEn: 'Deciduous Needleleaf Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        4:  { name: 'جنگل پهن‌برگ خزان‌کننده', nameEn: 'Deciduous Broadleaf Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        5:  { name: 'جنگل مختلط', nameEn: 'Mixed Forest', floodScore: 2, description: 'نفوذپذیری خوب' },
        6:  { name: 'بیشه‌زار', nameEn: 'Closed Shrublands', floodScore: 4, description: 'نفوذپذیری متوسط' },
        7:  { name: 'بوته‌زار باز', nameEn: 'Open Shrublands', floodScore: 5, description: 'نفوذپذیری متوسط تا کم' },
        8:  { name: 'ساوانای چوبی', nameEn: 'Woody Savannas', floodScore: 5, description: 'نفوذپذیری متوسط' },
        9:  { name: 'ساوانا', nameEn: 'Savannas', floodScore: 6, description: 'نفوذپذیری کم' },
        10: { name: 'مرتع', nameEn: 'Grasslands', floodScore: 6, description: 'نفوذپذیری کم' },
        11: { name: 'تالاب دائمی', nameEn: 'Permanent Wetlands', floodScore: 9, description: 'منطقه آبی' },
        12: { name: 'زمین‌های زراعی', nameEn: 'Croplands', floodScore: 7, description: 'رواناب بالا' },
        13: { name: 'زمین شهری و ساخته‌شده', nameEn: 'Urban and Built-up', floodScore: 10, description: 'نفوذناپذیر' },
        14: { name: 'زراعت/پوشش طبیعی', nameEn: 'Cropland/Natural Vegetation Mosaic', floodScore: 6, description: 'مختلط' },
        15: { name: 'برف و یخ دائمی', nameEn: 'Permanent Snow and Ice', floodScore: 3, description: 'ذوب برف' },
        16: { name: 'زمین بایر', nameEn: 'Barren or Sparsely Vegetated', floodScore: 4, description: 'نفوذپذیری متغیر' },
        17: { name: 'پهنه آبی', nameEn: 'Water Bodies', floodScore: 10, description: 'سطح آب' }
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
function calculateRisk(elevation, slopePercent, precipData, monthlyPrecip, ndviData, landCoverData, riverData) {
    const factors = [];
    let totalScore = 0;
    let weightSum = 0;

    // ۱. ارتفاع
    if (elevation !== null) {
        let score;
        if (elevation < 200) score = 10;
        else if (elevation < 500) score = 8;
        else if (elevation < 1000) score = 6;
        else if (elevation < 1500) score = 4;
        else if (elevation < 2000) score = 2;
        else score = 1;
        factors.push({ name: 'ارتفاع از سطح دریا', value: elevation.toFixed(0) + ' متر', score: score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۲. شیب
    if (slopePercent !== null) {
        let score;
        if (slopePercent < 0.5) score = 10;
        else if (slopePercent < 1) score = 8;
        else if (slopePercent < 2) score = 6;
        else if (slopePercent < 5) score = 4;
        else if (slopePercent < 10) score = 2;
        else score = 1;
        factors.push({ name: 'شیب زمین', value: slopePercent.toFixed(2) + '%', score: score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۳. بارش سالانه
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
            name: 'بارش سالانه (میانگین ' + yearsCount + ' سال)',
            value: annual.toFixed(0) + ' میلی‌متر',
            score: score,
            weight: 4
        });
        totalScore += score * 4;
        weightSum += 4;
    }

    // ۴. PCI
    if (monthlyPrecip) {
        const pci = monthlyPrecip.pci;
        const pciScore = getPCIScore(pci);
        const pciLabel = getPCILabel(pci);

        factors.push({
            name: 'شاخص تمرکز بارش (PCI)',
            value: pci.toFixed(1) + ' - ' + pciLabel.text,
            score: pciScore,
            weight: 3
        });
        totalScore += pciScore * 3;
        weightSum += 3;
    }

    // ۵. بارش اخیر
    if (precipData) {
        let score;
        const avg = precipData.avg;
        if (avg > 5) score = 10;
        else if (avg > 3) score = 8;
        else if (avg > 1) score = 6;
        else if (avg > 0.5) score = 4;
        else score = 2;
        factors.push({ name: 'بارش میانگین ۱۰ روز اخیر', value: avg.toFixed(2) + ' میلی‌متر', score: score, weight: 2 });
        totalScore += score * 2;
        weightSum += 2;
    }

    // ۶. NDVI
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
        factors.push({ name: 'شاخص پوشش گیاهی (NDVI)', value: ndvi.toFixed(3), score: score, weight: 3 });
        totalScore += score * 3;
        weightSum += 3;
    }

    // ۷. کاربری اراضی
    if (landCoverData) {
        const score = landCoverData.floodScore;
        factors.push({
            name: 'کاربری اراضی',
            value: landCoverData.name + ' (کد ' + landCoverData.code + ')',
            score: score,
            weight: 4
        });
        totalScore += score * 4;
        weightSum += 4;
    }

    // ۸. فاصله از رودخانه (جدید)
    if (riverData && riverData.found) {
        const score = getRiverScore(riverData.distance);
        let riverValue = riverData.distanceText;
        if (riverData.type && riverData.name && riverData.name !== 'بدون نام') {
            riverValue += ' تا ' + riverData.type + ' ' + riverData.name;
        } else if (riverData.type) {
            riverValue += ' تا ' + riverData.type;
        }

        factors.push({
            name: 'فاصله از نزدیک‌ترین آبراهه',
            value: riverValue,
            score: score,
            weight: 3
        });
        totalScore += score * 3;
        weightSum += 3;
    } else if (riverData && !riverData.found) {
        // اگر آبراهه‌ای پیدا نشد، ریسک کم
        factors.push({
            name: 'فاصله از نزدیک‌ترین آبراهه',
            value: 'بیش از ۱۰ کیلومتر (بدون آبراهه)',
            score: 1,
            weight: 3
        });
        totalScore += 1 * 3;
        weightSum += 3;
    }

    const finalScore = weightSum > 0 ? totalScore / weightSum : 0;
    return { factors: factors, finalScore: finalScore };
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
                    ticks:
