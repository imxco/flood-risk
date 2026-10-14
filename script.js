// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let analysisCircle = null;
let radarChart = null;
let barChart = null;

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
    });
}

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
}

// ============================================================
// جستجوی مکان (Nominatim)
// ============================================================
async function searchPlace(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ir&accept-language=fa`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'MultiHazardApp/1.0 (Educational Project)'
        }
    });

    if (!res.ok) throw new Error('خطا در جستجو');

    const data = await res.json();
    return data.map(item => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        displayName: item.display_name,
        type: item.type
    }));
}

// ============================================================
// جستجوی شرکت (Overpass)
// ============================================================
async function searchCompany(query) {
    const radius = 50000;
    const overpassQuery = `
        [out:json][timeout:25];
        (
            node["office"="company"]["name"~"${query}",i](around:${radius});
            way["office"="company"]["name"~"${query}",i](around:${radius});
            node["company"]["name"~"${query}",i](around:${radius});
            way["company"]["name"~"${query}",i](around:${radius});
        );
        out center;
    `;

    const servers = [
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    for (const serverUrl of servers) {
        try {
            const res = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'MultiHazardApp/1.0'
                },
                body: 'data=' + encodeURIComponent(overpassQuery)
            });

            if (!res.ok) continue;

            const data = await res.json();

            if (!data.elements || data.elements.length === 0) continue;

            return data.elements
                .filter(el => el.lat || el.center)
                .map(el => ({
                    lat: el.lat || el.center.lat,
                    lon: el.lon || el.center.lon,
                    displayName: el.tags?.name || 'شرکت بدون نام',
                    type: el.tags?.office || el.tags?.company || 'company'
                }))
                .slice(0, 5);
        } catch (e) {
            console.warn('Overpass error:', e);
            continue;
        }
    }

    return [];
}

// ============================================================
// تابع جستجو (مکان یا شرکت)
// ============================================================
async function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    const searchType = document.getElementById('searchType').value;
    const resultsDiv = document.getElementById('searchResults');

    if (!query) {
        resultsDiv.innerHTML = '<p style="color: #e53e3e;">لطفاً نام مکان یا شرکت را وارد کنید.</p>';
        return;
    }

    resultsDiv.innerHTML = '<p style="color: #3182ce;">⏳ در حال جستجو...</p>';

    try {
        let results;

        if (searchType === 'place') {
            results = await searchPlace(query);
        } else {
            results = await searchCompany(query);
        }

        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="color: #d69e2e;">❌ نتیجه‌ای یافت نشد.</p>';
            return;
        }

        resultsDiv.innerHTML = results.map((item, idx) => `
            <div class="search-result-item" onclick="selectSearchResult(${item.lat}, ${item.lon})">
                <strong>${item.displayName}</strong>
                <br><small>${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}</small>
            </div>
        `).join('');

    } catch (e) {
        console.error(e);
        resultsDiv.innerHTML = '<p style="color: #e53e3e;">❌ خطا در جستجو: ' + e.message + '</p>';
    }
}

function selectSearchResult(lat, lon) {
    document.getElementById('lat').value = lat.toFixed(4);
    document.getElementById('lon').value = lon.toFixed(4);

    if (map) {
        map.setView([lat, lon], 14);
        updateMarker(lat, lon);
    }

    document.getElementById('searchResults').innerHTML = '';
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
            max: Math.max(...precip),
            total: precip.reduce((a, b) => a + b, 0)
        };
    } catch (e) {
        console.warn('Precipitation error:', e);
        return null;
    }
}

// ============================================================
// دریافت بارش سالانه
// ============================================================
async function getAnnualPrecipitation(lat, lon) {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=precipitation_sum&timezone=auto`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در دریافت بارش تاریخی');
        const data = await res.json();
        const precip = data.daily.precipitation_sum.filter(v => v !== null);
        if (precip.length === 0) return null;
        const annualTotals = {};
        data.daily.time.forEach((t, i) => {
            const year = new Date(t).getFullYear();
            if (!annualTotals[year]) annualTotals[year] = 0;
            annualTotals[year] += precip[i] || 0;
        });
        const years = Object.keys(annualTotals);
        const avgAnnual = years.reduce((sum, y) => sum + annualTotals[y], 0) / years.length;
        return { annualAvg: avgAnnual, yearsCount: years.length };
    } catch (e) {
        console.warn('Annual precipitation error:', e);
        return null;
    }
}

// ============================================================
// ارزیابی ریسک سیل
// ============================================================
function calculateFloodRisk(elevation, slopePercent, precipData, annualPrecip) {
    let totalScore = 0;
    let weightSum = 0;

    // ارتفاع
    if (elevation !== null) {
        let score;
        if (elevation < 200) score = 10;
        else if (elevation < 500) score = 8;
        else if (elevation < 1000) score = 6;
        else if (elevation < 1500) score = 4;
        else if (elevation < 2000) score = 2;
        else score = 1;
        totalScore += score * 3;
        weightSum += 3;
    }

    // شیب
    if (slopePercent !== null) {
        let score;
        if (slopePercent < 0.5) score = 10;
        else if (slopePercent < 1) score = 8;
        else if (slopePercent < 2) score = 6;
        else if (slopePercent < 5) score = 4;
        else if (slopePercent < 10) score = 2;
        else score = 1;
        totalScore += score * 3;
        weightSum += 3;
    }

    // بارش سالانه
    if (annualPrecip) {
        let score;
        const annual = annualPrecip.annualAvg;
        if (annual > 1000) score = 10;
        else if (annual > 700) score = 8;
        else if (annual > 500) score = 6;
        else if (annual > 300) score = 4;
        else if (annual > 150) score = 2;
        else score = 1;
        totalScore += score * 4;
        weightSum += 4;
    }

    // بارش اخیر
    if (precipData) {
        let score;
        const avg = precipData.avg;
        if (avg > 5) score = 10;
        else if (avg > 3) score = 8;
        else if (avg > 1) score = 6;
        else if (avg > 0.5) score = 4;
        else score = 2;
        totalScore += score * 2;
        weightSum += 2;
    }

    return weightSum > 0 ? totalScore / weightSum : 0;
}

// ============================================================
// ارزیابی ریسک زلزله (تخمینی بر اساس داده‌های موجود)
// ============================================================
async function calculateEarthquakeRisk(lat, lon) {
    // تخمین بر اساس داده‌های GEM و فاصله از گسل (ساده‌شده)
    // در نسخه واقعی باید از داده‌های GEM استفاده شود
    
    // فعلاً امتیاز تخمینی بر اساس موقعیت جغرافیایی
    // مناطق نزدیک به گسل‌های اصلی (البرز، زاگرس) امتیاز بالاتر
    
    let baseScore = 5;
    
    // البرز (شمال)
    if (lat > 35 && lat < 37 && lon > 49 && lon < 54) baseScore = 8;
    // زاگرس (غرب)
    else if (lat > 30 && lat < 35 && lon > 45 && lon < 52) baseScore = 7;
    // مرکزی (کم‌خطرتر)
    else if (lat > 32 && lat < 35 && lon > 51 && lon < 56) baseScore = 4;
    // جنوب (خلیج فارس)
    else if (lat < 30) baseScore = 3;
    
    return baseScore;
}

// ============================================================
// ارزیابی ریسک رانش زمین
// ============================================================
function calculateLandslideRisk(slopePercent, precipData, elevation) {
    let totalScore = 0;
    let weightSum = 0;

    // شیب (مهم‌ترین)
    if (slopePercent !== null) {
        let score;
        if (slopePercent > 25) score = 10;
        else if (slopePercent > 15) score = 8;
        else if (slopePercent > 10) score = 6;
        else if (slopePercent > 5) score = 4;
        else if (slopePercent > 2) score = 2;
        else score = 1;
        totalScore += score * 4;
        weightSum += 4;
    }

    // بارش
    if (precipData) {
        let score;
        const avg = precipData.avg;
        if (avg > 10) score = 10;
        else if (avg > 5) score = 8;
        else if (avg > 3) score = 6;
        else if (avg > 1) score = 4;
        else score = 2;
        totalScore += score * 3;
        weightSum += 3;
    }

    // ارتفاع
    if (elevation !== null) {
        let score;
        if (elevation > 2000) score = 8;
        else if (elevation > 1500) score = 6;
        else if (elevation > 1000) score = 4;
        else score = 2;
        totalScore += score * 2;
        weightSum += 2;
    }

    return weightSum > 0 ? totalScore / weightSum : 0;
}

// ============================================================
// تابع اصلی تحلیل چندمخاطره‌ای
// ============================================================
async function analyzeMultiHazard() {
    hideError();
    const resultEl = document.getElementById('result');
    const loadingEl = document.getElementById('loading');
    const btn = document.getElementById('analyzeBtn');
    const chartSection = document.getElementById('chartSection');
    const barChartSection = document.getElementById('barChartSection');

    resultEl.classList.remove('show');
    chartSection.style.display = 'none';
    barChartSection.style.display = 'none';

    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);

    if (isNaN(lat) || isNaN(lon)) {
        showError('لطفاً مختصات معتبر وارد کنید');
        return;
    }

    btn.disabled = true;
    loadingEl.style.display = 'block';

    try {
        // دریافت داده‌های پایه
        const [elevation, slopeData, precipData, annualPrecip] = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getPrecipitation(lat, lon),
            getAnnualPrecipitation(lat, lon)
        ]);

        loadingEl.style.display = 'none';

        const slopePercent = slopeData ? slopeData.slopePercent : null;

        // محاسبه ریسک هر مخاطره
        const floodRisk = calculateFloodRisk(elevation, slopePercent, precipData, annualPrecip);
        const earthquakeRisk = await calculateEarthquakeRisk(lat, lon);
        const landslideRisk = calculateLandslideRisk(slopePercent, precipData, elevation);

        // محاسبه ریسک کلی (میانگین)
        const overallScore = (floodRisk + earthquakeRisk + landslideRisk) / 3;

        // نمایش نتیجه
        let overallLevel, overallClass;
        if (overallScore >= 8) { overallLevel = '🔴 ریسک کلی: خیلی زیاد'; overallClass = 'very-high'; }
        else if (overallScore >= 6) { overallLevel = '🟠 ریسک کلی: زیاد'; overallClass = 'high'; }
        else if (overallScore >= 4) { overallLevel = '🟡 ریسک کلی: متوسط'; overallClass = 'medium'; }
        else if (overallScore >= 2) { overallLevel = '🟢 ریسک کلی: کم'; overallClass = 'low'; }
        else { overallLevel = '🟢 ریسک کلی: خیلی کم'; overallClass = 'very-low'; }

        document.getElementById('overallRisk').textContent = overallLevel;
        document.getElementById('overallScore').innerHTML = `<strong>نمره کلی: ${overallScore.toFixed(2)} از ۱۰</strong>`;

        // کارت‌های مخاطره
        const getScoreClass = (score) => {
            if (score >= 8) return 'very-high';
            if (score >= 6) return 'high';
            if (score >= 4) return 'medium';
            return 'low';
        };

        document.getElementById('hazardCards').innerHTML = `
            <div class="hazard-card">
                <h4>🌊 سیل</h4>
                <div class="score ${getScoreClass(floodRisk)}">${floodRisk.toFixed(2)}</div>
            </div>
            <div class="hazard-card">
                <h4>🌍 زلزله</h4>
                <div class="score ${getScoreClass(earthquakeRisk)}">${earthquakeRisk.toFixed(2)}</div>
            </div>
            <div class="hazard-card">
                <h4>⛰️ رانش زمین</h4>
                <div class="score ${getScoreClass(landslideRisk)}">${landslideRisk.toFixed(2)}</div>
            </div>
        `;

        // رسم نمودار راداری
        drawRadarChart([floodRisk, earthquakeRisk, landslideRisk]);
        drawBarChart([floodRisk, earthquakeRisk, landslideRisk]);

        resultEl.classList.add('show');
        chartSection.style.display = 'block';
        barChartSection.style.display = 'block';

    } catch (e) {
        console.error(e);
        showError('خطا در تحلیل: ' + e.message);
    } finally {
        loadingEl.style.display = 'none';
        btn.disabled = false;
    }
}

// ============================================================
// نمودار راداری
// ============================================================
function drawRadarChart(scores) {
    const ctx = document.getElementById('radarChart').getContext('2d');

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['سیل', 'زلزله', 'رانش زمین'],
            datasets: [{
                label: 'نمره ریسک',
                data: scores.map(s => parseFloat(s.toFixed(2))),
                backgroundColor: 'rgba(49, 130, 206, 0.3)',
                borderColor: '#3182ce',
                borderWidth: 2,
                pointBackgroundColor: '#3182ce',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 10,
                    ticks: { stepSize: 2, font: { family: 'Tahoma' } },
                    pointLabels: { font: { family: 'Tahoma', size: 13 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ============================================================
// نمودار میله‌ای
// ============================================================
function drawBarChart(scores) {
    const ctx = document.getElementById('barChart').getContext('2d');

    if (barChart) barChart.destroy();

    const colors = scores.map(s => {
        if (s >= 8) return '#e53e3e';
        if (s >= 6) return '#dd6b20';
        if (s >= 4) return '#d69e2e';
        return '#38a169';
    });

    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['سیل', 'زلزله', 'رانش زمین'],
            datasets: [{
                label: 'نمره ریسک',
                data: scores.map(s => parseFloat(s.toFixed(2))),
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 10,
                    title: { display: true, text: 'نمره ریسک', font: { family: 'Tahoma' } },
                    ticks: { font: { family: 'Tahoma' } }
                },
                x: {
                    ticks: { font: { family: 'Tahoma', size: 13 } }
                }
            }
        }
    });
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
// راه‌اندازی اولیه
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
    initMap();
    console.log('برنامه چندمخاطره‌ای راه‌اندازی شد 🚀');
});
