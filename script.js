// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let radarChart = null;
let barChart = null;

const WORKER_URL = 'https://nassaproxyv2.behnam-zamani.workers.dev';

const MONTH_NAMES_FA = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

// ============================================================
// راه‌اندازی نقشه
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
        document.getElementById('manualRiverDistance').value = '';
        document.getElementById('manualElevation').value = '';
    });
}

function updateMarker(lat, lon) {
    if (!map) return;
    if (marker) map.removeLayer(marker);

    marker = L.marker([lat, lon], { draggable: true }).addTo(map);

    marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(4);
        document.getElementById('lon').value = pos.lng.toFixed(4);
        document.getElementById('manualRiverDistance').value = '';
        document.getElementById('manualElevation').value = '';
    });
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
        status.textContent = '⚠️ توکن وارد نشده.';
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
        status.textContent = '⚠️ توکن وارد نشده.';
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

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// جستجوی هوشمند (Autocomplete)
// ============================================================
let searchTimeout = null;

function setupSmartSearch() {
    const input = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    if (!input || !resultsDiv) return;

    input.addEventListener('input', function() {
        const query = this.value.trim();
        if (searchTimeout) clearTimeout(searchTimeout);
        if (query.length < 2) {
            resultsDiv.classList.remove('show');
            resultsDiv.innerHTML = '';
            return;
        }
        searchTimeout = setTimeout(() => performSmartSearch(query), 400);
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-box')) {
            resultsDiv.classList.remove('show');
        }
    });

    input.addEventListener('keydown', function(e) {
        const items = resultsDiv.querySelectorAll('.search-result-item');
        const active = resultsDiv.querySelector('.search-result-item.active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!active) { if (items[0]) items[0].classList.add('active'); }
            else { active.classList.remove('active'); if (active.nextElementSibling) active.nextElementSibling.classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (active) { active.classList.remove('active'); if (active.previousElementSibling) active.previousElementSibling.classList.add('active'); }
        } else if (e.key === 'Enter') {
            if (active) { e.preventDefault(); active.click(); }
        } else if (e.key === 'Escape') {
            resultsDiv.classList.remove('show');
        }
    });
}

async function performSmartSearch(query) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="search-loading">⏳ در حال جستجو...</div>';
    resultsDiv.classList.add('show');

    try {
        const [places, companies] = await Promise.allSettled([
            searchPlace(query),
            searchCompany(query)
        ]);

        const allResults = [];
        if (places.status === 'fulfilled' && places.value) {
            places.value.forEach(p => allResults.push({ ...p, source: 'place' }));
        }
        if (companies.status === 'fulfilled' && companies.value) {
            companies.value.forEach(c => allResults.push({ ...c, source: 'company' }));
        }

        if (allResults.length === 0) {
            resultsDiv.innerHTML = '<div class="search-no-result">❌ نتیجه‌ای یافت نشد</div>';
            return;
        }

        resultsDiv.innerHTML = allResults.slice(0, 8).map((item) => {
            const icon = item.source === 'company' ? '🏢' : '📍';
            const sourceLabel = item.source === 'company' ? 'شرکت' : 'مکان';
            const name = item.displayName.split(',')[0];
            return '<div class="search-result-item" onclick="selectSearchResult(' + item.lat + ', ' + item.lon + ')">' +
                '<div class="icon">' + icon + '</div>' +
                '<div class="info">' +
                    '<div class="name">' + name + ' <span class="search-source">(' + sourceLabel + ')</span></div>' +
                    '<div class="address">' + item.displayName + '</div>' +
                    '<div class="coords">' + item.lat.toFixed(4) + ', ' + item.lon.toFixed(4) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        console.error('Search error:', e);
        resultsDiv.innerHTML = '<div class="search-no-result">❌ خطا در جستجو</div>';
    }
}

async function searchPlace(query) {
    const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=5&countrycodes=ir&accept-language=fa&addressdetails=1';
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MultiHazardApp/1.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(item => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            displayName: item.display_name
        }));
    } catch (e) { return []; }
}

async function searchCompany(query) {
    const radius = 100000;
    const safeQuery = query.replace(/["\\]/g, ''); // جلوگیری از خطای Overpass
    const q = '[out:json][timeout:25];(node["office"="company"]["name"~"' + safeQuery + '",i](around:' + radius + ');way["office"="company"]["name"~"' + safeQuery + '",i](around:' + radius + '););out center 5;';
    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q);
    const url = WORKER_URL + '/?url=' + encodeURIComponent(overpassUrl);
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.elements || data.elements.length === 0) return [];
        return data.elements
            .filter(el => el.lat || el.center)
            .map(el => ({
                lat: el.lat || el.center.lat,
                lon: el.lon || el.center.lon,
                displayName: (el.tags && el.tags.name) || 'شرکت بدون نام'
            }));
    } catch (e) { return []; }
}

function selectSearchResult(lat, lon) {
    document.getElementById('lat').value = lat.toFixed(4);
    document.getElementById('lon').value = lon.toFixed(4);
    if (map) {
        map.setView([lat, lon], 14);
        updateMarker(lat, lon);
    }
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('searchInput').value = '';
}

// ============================================================
// دریافت داده‌های محیطی
// ============================================================
async function getElevation(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + lat + '&longitude=' + lon;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data.elevation[0];
    } catch (e) { return null; }
}

async function getPrecipitation(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&daily=precipitation_sum&past_days=10&forecast_days=1&timezone=auto';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const precip = data.daily.precipitation_sum.filter(v => v !== null);
        if (precip.length === 0) return null;
        return {
            avg: precip.reduce((a, b) => a + b, 0) / precip.length,
            max: Math.max(...precip)
        };
    } catch (e) { return null; }
}

async function getMonthlyPrecipitation(lat, lon) {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + startYear + '-01-01&end_date=' + endYear + '-12-31&daily=precipitation_sum&timezone=auto';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.daily) return null;
        const precip = data.daily.precipitation_sum;
        const yearlyTotals = {};
        data.daily.time.forEach((t, i) => {
            const date = new Date(t);
            const year = date.getFullYear();
            const month = date.getMonth();
            if (precip[i] === null) return;
            if (!yearlyTotals[year]) yearlyTotals[year] = Array(12).fill(0);
            yearlyTotals[year][month] += precip[i];
        });
        const years = Object.keys(yearlyTotals);
        const monthlyAvg = Array(12).fill(0);
        years.forEach(y => {
            for (let m = 0; m < 12; m++) monthlyAvg[m] += yearlyTotals[y][m];
        });
        for (let m = 0; m < 12; m++) monthlyAvg[m] /= years.length;

        const monthOrder = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
        const persianMonthly = monthOrder.map(m => monthlyAvg[m]);

        const annualAvg = persianMonthly.reduce((a, b) => a + b, 0);
        const sumSq = persianMonthly.reduce((a, b) => a + b * b, 0);
        const pci = annualAvg > 0 ? (sumSq / (annualAvg * annualAvg)) * 100 : 0;

        let maxMonth = 0, maxVal = 0;
        persianMonthly.forEach((v, i) => { if (v > maxVal) { maxVal = v; maxMonth = i; } });

        return {
            monthlyAvg: persianMonthly,
            annualAvg: annualAvg,
            pci: pci,
            maxMonth: { index: maxMonth, name: MONTH_NAMES_FA[maxMonth], value: maxVal },
            yearsCount: years.length,
            yearRange: startYear + '-' + endYear
        };
    } catch (e) { return null; }
}

async function estimateSlope(lat, lon) {
    const delta = 0.01;
    const points = [
        { lat: lat + delta, lon: lon },
        { lat: lat - delta, lon: lon },
        { lat: lat, lon: lon + delta },
        { lat: lat, lon: lon - delta }
    ];
    const centerElev = await getElevation(lat, lon);
    if (centerElev === null) return null;
    
    const elevs = await Promise.all(points.map(p => getElevation(p.lat, p.lon)));
    if (elevs.some(e => e === null)) return null;
    
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
// GloFAS - دبی رودخانه
// ============================================================
async function getFloodDischarge(lat, lon) {
    const url = 'https://flood-api.open-meteo.com/v1/flood?latitude=' + lat + '&longitude=' + lon + '&daily=river_discharge,river_discharge_max&past_days=30&forecast_days=7&timezone=auto';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.daily || !data.daily.river_discharge) return null;
        const discharge = data.daily.river_discharge.filter(v => v !== null);
        if (discharge.length === 0) return null;
        const current = discharge[discharge.length - 1];
        const avg = discharge.reduce((a, b) => a + b, 0) / discharge.length;
        const ratio = avg > 0 ? current / avg : 0;
        return { current, avg, ratio };
    } catch (e) { return null; }
}

// ============================================================
// NDVI (NASA)
// ============================================================
async function getNDVI(lat, lon, token) {
    if (!token) return null;
    const nasaUrl = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset' +
        '?latitude=' + lat + '&longitude=' + lon +
        '&band=250m_16_days_NDVI' +
        '&startDate=A2023001&endDate=A2023096' +
        '&kmAboveBelow=1&kmLeftRight=1';
    
    const url = WORKER_URL + '/?url=' + encodeURIComponent(nasaUrl);
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.subset || data.subset.length === 0) return null;
        const scale = parseFloat(data.scale) || 0.0001;
        const values = [];
        data.subset.forEach(item => {
            const raw = item.value !== undefined ? item.value : item.data;
            if (raw === undefined || raw === null) return;
            const num = parseFloat(raw);
            if (isNaN(num)) return;
            const scaled = num * scale;
            if (scaled >= -1 && scaled <= 1 && num !== -3000) values.push(scaled);
        });
        if (values.length === 0) return null;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return { avg: avg };
    } catch (e) { return null; }
}

// ============================================================
// کاربری اراضی (NASA)
// ============================================================
async function getLandCover(lat, lon, token) {
    if (!token) return null;
    const nasaUrl = 'https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset' +
        '?latitude=' + lat + '&longitude=' + lon +
        '&band=LC_Type1' +
        '&startDate=A2022001&endDate=A2022365' +
        '&kmAboveBelow=1&kmLeftRight=1';
    const url = WORKER_URL + '/?url=' + encodeURIComponent(nasaUrl);
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.subset || data.subset.length === 0) return null;
        
        const counts = {};
        data.subset.forEach(item => {
            const raw = item.value !== undefined ? item.value : item.data;
            if (raw === undefined) return;
            const code = parseInt(raw);
            if (isNaN(code) || code === 255) return;
            counts[code] = (counts[code] || 0) + 1;
        });
        
        let dominant = null, maxCount = 0;
        for (const code in counts) {
            if (counts[code] > maxCount) { maxCount = counts[code]; dominant = parseInt(code); }
        }
        const info = getLandCoverInfo(dominant);
        return { code: dominant, name: info.name, floodScore: info.floodScore };
    } catch (e) { return null; }
}

function getLandCoverInfo(code) {
    const m = {
        1:  { name: 'جنگل سوزنی‌برگ', floodScore: 1 },
        2:  { name: 'جنگل پهن‌برگ', floodScore: 1 },
        3:  { name: 'جنگل خزان‌کننده', floodScore: 2 },
        4:  { name: 'جنگل پهن‌برگ خزان', floodScore: 2 },
        5:  { name: 'جنگل مختلط', floodScore: 2 },
        6:  { name: 'بیشه‌زار', floodScore: 4 },
        7:  { name: 'بوته‌زار باز', floodScore: 5 },
        8:  { name: 'ساوانای چوبی', floodScore: 5 },
        9:  { name: 'ساوانا', floodScore: 6 },
        10: { name: 'مرتع', floodScore: 6 },
        11: { name: 'تالاب', floodScore: 9 },
        12: { name: 'زمین زراعی', floodScore: 7 },
        13: { name: 'زمین شهری', floodScore: 10 },
        14: { name: 'زراعت/پوشش طبیعی', floodScore: 6 },
        15: { name: 'برف و یخ', floodScore: 3 },
        16: { name: 'زمین بایر', floodScore: 4 },
        17: { name: 'پهنه آبی', floodScore: 10 }
    };
    return m[code] || { name: 'نامشخص', floodScore: 5 };
}

// ============================================================
// فاصله از رودخانه
// ============================================================
let riverDataCache = null;

async function loadRiverData() {
    if (riverDataCache) return riverDataCache;
    try {
        const res = await fetch('iran-rivers.geojson');
        if (!res.ok) return null;
        const data = await res.json();
        riverDataCache = data;
        return data;
    } catch (e) { return null; }
}

async function getRiverDistance(lat, lon) {
    const riverData = await loadRiverData();
    if (!riverData || !riverData.features) {
        return { found: false, distanceText: 'داده در دسترس نیست' };
    }
    const userPoint = turf.point([lon, lat]);
    let minDistance = Infinity;
    let nearestRiver = null;
    const buffer = 0.5;
    
    riverData.features.forEach(feature => {
        if (!feature.geometry) return;
        const geomType = feature.geometry.type;
        if (geomType !== 'LineString' && geomType !== 'MultiLineString') return;
        
        const bbox = turf.bbox(feature);
        if (bbox[0] > lon + buffer || bbox[2] < lon - buffer) return;
        if (bbox[1] > lat + buffer || bbox[3] < lat - buffer) return;
        
        try {
            const dist = turf.pointToLineDistance(userPoint, feature, { units: 'meters' });
            if (dist < minDistance) { minDistance = dist; nearestRiver = feature; }
        } catch (e) {}
    });
    
    if (!nearestRiver) return { found: false, distanceText: 'بیش از ۵۰ کیلومتر' };
    
    const distanceText = minDistance < 1000 
        ? minDistance.toFixed(0) + ' متر' 
        : (minDistance / 1000).toFixed(2) + ' کیلومتر';
    
    return {
        distance: minDistance,
        distanceText: distanceText,
        name: (nearestRiver.properties && nearestRiver.properties.name) || 'بدون نام',
        found: true,
        source: 'HydroRIVERS'
    };
}

// ============================================================
// USGS - زلزله
// ============================================================
async function getEarthquakeData(lat, lon) {
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=' + lat + '&longitude=' + lon + '&maxradiuskm=500&minmagnitude=4.0&starttime=1900-01-01&limit=500';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const quakes = data.features || [];
        if (quakes.length === 0) return { count: 0, maxMag: 0, nearest: null };
        const quakeData = quakes.map(q => ({
            mag: q.properties.mag,
            dist: haversine(lat, lon, q.geometry.coordinates[1], q.geometry.coordinates[0]) / 1000
        }));
        const maxMag = Math.max(...quakeData.map(q => q.mag));
        const nearest = quakeData.reduce((min, q) => q.dist < min.dist ? q : min, quakeData[0]);
        return { count: quakes.length, maxMag, nearest };
    } catch (e) { return null; }
}

// ============================================================
// محاسبات ریسک
// ============================================================
function calculateFloodRisk(elevation, slopePercent, annualPrecip, dischargeData, ndviData, landCoverData, riverData, recentPrecip, manualDistance) {
    let totalScore = 0, weightSum = 0;
    const factors = [];

    if (dischargeData) {
        let s;
        const r = dischargeData.ratio;
        if (r > 5) s = 10; else if (r > 3) s = 8; else if (r > 2) s = 6;
        else if (r > 1.5) s = 5; else if (r > 1) s = 3; else s = 1;
        factors.push({ name: 'دبی رودخانه (GloFAS)', value: dischargeData.current.toFixed(1) + ' m³/s (نسبت ' + r.toFixed(2) + ')', score: s, weight: 5 });
        totalScore += s * 5; weightSum += 5;
    }
    if (elevation !== null) {
        let s;
        if (elevation < 200) s = 10; else if (elevation < 500) s = 8; else if (elevation < 1000) s = 6;
        else if (elevation < 1500) s = 4; else if (elevation < 2000) s = 2; else s = 1;
        factors.push({ name: 'ارتفاع از سطح دریا', value: elevation.toFixed(0) + ' متر', score: s, weight: 2 });
        totalScore += s * 2; weightSum += 2;
    }
    if (slopePercent !== null) {
        let s;
        if (slopePercent < 0.5) s = 10; else if (slopePercent < 1) s = 8; else if (slopePercent < 2) s = 6;
        else if (slopePercent < 5) s = 4; else if (slopePercent < 10) s = 2; else s = 1;
        factors.push({ name: 'شیب', value: slopePercent.toFixed(2) + '%', score: s, weight: 2 });
        totalScore += s * 2; weightSum += 2;
    }
    if (annualPrecip) {
        let s;
        const a = annualPrecip.annualAvg;
        if (a > 1000) s = 10; else if (a > 700) s = 8; else if (a > 500) s = 6;
        else if (a > 300) s = 4; else if (a > 150) s = 2; else s = 1;
        factors.push({ name: 'بارش سالانه', value: a.toFixed(0) + ' mm', score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }
    if (annualPrecip && annualPrecip.pci) {
        let s;
        const p = annualPrecip.pci;
        if (p < 10) s = 2; else if (p < 15) s = 4; else if (p < 20) s = 6; else if (p < 25) s = 8; else s = 10;
        factors.push({ name: 'شاخص تمرکز بارش (PCI)', value: p.toFixed(1), score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }
    if (ndviData) {
        let s;
        const n = ndviData.avg;
        if (n < 0) s = 10; else if (n < 0.1) s = 9; else if (n < 0.2) s = 7; else if (n < 0.3) s = 5;
        else if (n < 0.4) s = 4; else if (n < 0.5) s = 3; else if (n < 0.6) s = 2; else s = 1;
        factors.push({ name: 'پوشش گیاهی (NDVI)', value: n.toFixed(3), score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }
    if (landCoverData) {
        const s = landCoverData.floodScore;
        factors.push({ name: 'کاربری اراضی', value: landCoverData.name, score: s, weight: 4 });
        totalScore += s * 4; weightSum += 4;
    }
    let riverDist = null;
    let riverText = '';
    if (riverData && riverData.found) {
        riverDist = riverData.distance;
        riverText = riverData.distanceText + (riverData.name && riverData.name !== 'بدون نام' ? ' تا ' + riverData.name : '');
    } else if (manualDistance && !isNaN(manualDistance)) {
        riverDist = manualDistance;
        riverText = manualDistance.toFixed(0) + ' متر (دستی)';
    }
    if (riverDist !== null) {
        let s;
        if (riverDist < 100) s = 10; else if (riverDist < 200) s = 9; else if (riverDist < 300) s = 8;
        else if (riverDist < 500) s = 7; else if (riverDist < 1000) s = 5; else if (riverDist < 2000) s = 4;
        else if (riverDist < 5000) s = 3; else if (riverDist < 10000) s = 2; else s = 1;
        factors.push({ name: 'فاصله از رودخانه', value: riverText, score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }
    if (recentPrecip) {
        let s;
        const a = recentPrecip.avg;
        if (a > 5) s = 10; else if (a > 3) s = 8; else if (a > 1) s = 6; else if (a > 0.5) s = 4; else s = 2;
        factors.push({ name: 'بارش ۱۰ روز اخیر', value: a.toFixed(2) + ' mm', score: s, weight: 2 });
        totalScore += s * 2; weightSum += 2;
    }
    return { score: weightSum > 0 ? totalScore / weightSum : 0, factors: factors };
}

function calculateEarthquakeRisk(eqData, lat, lon) {
    const factors = [];
    let score = 3;
    if (eqData && eqData.count > 0) {
        let magScore = eqData.maxMag >= 7 ? 10 : eqData.maxMag >= 6 ? 8 : eqData.maxMag >= 5 ? 6 : 4;
        factors.push({ name: 'حداکثر بزرگی زلزله (M≥4)', value: eqData.maxMag.toFixed(1) + ' ریشتر', score: magScore, weight: 5 });
        let distFactor = 1;
        if (eqData.nearest.dist < 50) distFactor = 1;
        else if (eqData.nearest.dist < 100) distFactor = 0.8;
        else if (eqData.nearest.dist < 200) distFactor = 0.6;
        else distFactor = 0.4;
        factors.push({ name: 'فاصله تا نزدیک‌ترین زلزله', value: eqData.nearest.dist.toFixed(0) + ' km', score: Math.round(10 * distFactor), weight: 4 });
        score = Math.min(10, magScore * distFactor);
    } else {
        if (lat > 35 && lat < 37 && lon > 49 && lon < 54) { score = 8; factors.push({ name: 'نزدیکی به گسل البرز', value: 'بالا', score: 8, weight: 5 }); }
        else if (lat > 30 && lat < 35 && lon > 45 && lon < 52) { score = 7; factors.push({ name: 'نزدیکی به گسل زاگرس', value: 'بالا', score: 7, weight: 5 }); }
        else { score = 4; factors.push({ name: 'منطقه مرکزی', value: 'متوسط', score: 4, weight: 5 }); }
    }
    return { score: score, factors: factors };
}

function calculateLandslideRisk(slopePercent, annualPrecip, elevation) {
    let totalScore = 0, weightSum = 0;
    const factors = [];

    if (slopePercent !== null) {
        let s = slopePercent > 25 ? 10 : slopePercent > 15 ? 8 : slopePercent > 10 ? 6 : slopePercent > 5 ? 4 : slopePercent > 2 ? 2 : 1;
        factors.push({ name: 'شیب', value: slopePercent.toFixed(2) + '%', score: s, weight: 5 });
        totalScore += s * 5; weightSum += 5;
    }
    if (annualPrecip) {
        const a = annualPrecip.annualAvg;
        let s = a > 1000 ? 10 : a > 700 ? 8 : a > 500 ? 6 : a > 300 ? 4 : a > 150 ? 2 : 1;
        factors.push({ name: 'بارش سالانه', value: a.toFixed(0) + ' mm', score: s, weight: 4 });
        totalScore += s * 4; weightSum += 4;
    }
    if (elevation !== null) {
        let s = elevation > 2500 ? 8 : elevation > 2000 ? 7 : elevation > 1500 ? 5 : elevation > 1000 ? 3 : 2;
        factors.push({ name: 'ارتفاع از سطح دریا', value: elevation.toFixed(0) + ' متر', score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }
    return { score: weightSum > 0 ? totalScore / weightSum : 0, factors: factors };
}

function calculateLightningRisk(lat, lon, annualPrecip) {
    const factors = [];
    let ngScore = 5;
    if (lat > 35 && lat < 38) ngScore = 8;
    else if (lat > 30 && lat < 38) ngScore = 7;
    factors.push({ name: 'چگالی صاعقه (تخمینی)', value: ngScore.toFixed(1), score: ngScore, weight: 4 });

    if (annualPrecip) {
        const a = annualPrecip.annualAvg;
        let s = a > 1000 ? 9 : a > 700 ? 7 : a > 500 ? 5 : a > 300 ? 4 : 2;
        factors.push({ name: 'فعالیت رعد و برق (از بارش)', value: a.toFixed(0) + ' mm', score: s, weight: 3 });
        return { score: (ngScore * 4 + s * 3) / 7, factors: factors };
    }
    return { score: ngScore, factors: factors };
}

function calculateSubsidenceRisk(lat, lon) {
    const factors = [];
    let score = 3;
    if (lat > 32 && lat < 36 && lon > 50 && lon < 55) {
        score = 9;
        factors.push({ name: 'منطقه دشت مرکزی', value: 'بحرانی', score: 9, weight: 5 });
    } else if (lat > 29 && lat < 32 && lon > 51 && lon < 57) {
        score = 7;
        factors.push({ name: 'منطقه فارس', value: 'بالا', score: 7, weight: 5 });
    } else {
        factors.push({ name: 'منطقه کم‌خطر', value: 'پایین', score: 3, weight: 5 });
    }
    return { score: score, factors: factors };
}

// ============================================================
// تحلیل اصلی
// ============================================================
async function analyzeAll() {
    hideError();
    const resultEl = document.getElementById('result');
    const loadingEl = document.getElementById('loading');
    const btn = document.getElementById('analyzeBtn');

    resultEl.classList.remove('show');
    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);

    if (isNaN(lat) || isNaN(lon)) { showError('مختصات معتبر وارد کنید'); return; }

    btn.disabled = true;
    loadingEl.style.display = 'block';

    const token = getToken();
    const manualInput = document.getElementById('manualRiverDistance');
    const manualValue = manualInput ? parseFloat(manualInput.value) : NaN;
    const manualElevInput = document.getElementById('manualElevation');
    const manualElevValue = manualElevInput ? parseFloat(manualElevInput.value) : NaN;

    try {
        const results = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getMonthlyPrecipitation(lat, lon),
            getFloodDischarge(lat, lon),
            getNDVI(lat, lon, token),
            getLandCover(lat, lon, token),
            getRiverDistance(lat, lon),
            getPrecipitation(lat, lon),
            getEarthquakeData(lat, lon)
        ]);

        const autoElevation = results[0];
        const slopeData = results[1];
        const annualPrecip = results[2];
        const dischargeData = results[3];
        const ndviData = results[4];
        const landCoverData = results[5];
        const riverData = results[6];
        const recentPrecip = results[7];
        const eqData = results[8];

        loadingEl.style.display = 'none';

        let elevation = autoElevation;
        if (!isNaN(manualElevValue)) {
            elevation = manualElevValue;
        }
        
        const manualElevGroup = document.getElementById('manualElevationGroup');
        if (elevation === null || elevation > 5000 || elevation < -500) {
            manualElevGroup.style.display = 'block';
        } else {
            manualElevGroup.style.display = 'none';
        }
        
        const manualGroup = document.getElementById('manualRiverGroup');
        if (!riverData || !riverData.found) {
            manualGroup.style.display = 'block';
        } else {
            manualGroup.style.display = 'none';
        }

        const slopePercent = slopeData ? slopeData.slopePercent : null;

        const flood = calculateFloodRisk(elevation, slopePercent, annualPrecip, dischargeData, ndviData, landCoverData, riverData, recentPrecip, manualValue);
        const earthquake = calculateEarthquakeRisk(eqData, lat, lon);
        const landslide = calculateLandslideRisk(slopePercent, annualPrecip, elevation);
        const lightning = calculateLightningRisk(lat, lon, annualPrecip);
        const subsidence = calculateSubsidenceRisk(lat, lon);

        const scores = [flood.score, earthquake.score, landslide.score, lightning.score, subsidence.score];
        const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        let overallLevel;
        if (overallScore >= 8) overallLevel = '🔴 ریسک کلی: خیلی زیاد';
        else if (overallScore >= 6) overallLevel = '🟠 ریسک کلی: زیاد';
        else if (overallScore >= 4) overallLevel = '🟡 ریسک کلی: متوسط';
        else if (overallScore >= 2) overallLevel = '🟢 ریسک کلی: کم';
        else overallLevel = '🟢 ریسک کلی: خیلی کم';

        document.getElementById('overallRisk').textContent = overallLevel;
        document.getElementById('overallScore').innerHTML = '<strong>نمره کلی: ' + overallScore.toFixed(2) + ' از ۱۰</strong>';

        const getClass = s => s >= 8 ? 'very-high' : s >= 6 ? 'high' : s >= 4 ? 'medium' : 'low';
        document.getElementById('hazardCards').innerHTML =
            '<div class="hazard-card"><h4>🌊 سیل</h4><div class="score ' + getClass(flood.score) + '">' + flood.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>🌍 زلزله</h4><div class="score ' + getClass(earthquake.score) + '">' + earthquake.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>⛰️ رانش</h4><div class="score ' + getClass(landslide.score) + '">' + landslide.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>⚡ صاعقه</h4><div class="score ' + getClass(lightning.score) + '">' + lightning.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>📉 فرونشست</h4><div class="score ' + getClass(subsidence.score) + '">' + subsidence.score.toFixed(2) + '</div></div>';

        const groups = [
            { title: '🌊 سیل (۹ پارامتر)', factors: flood.factors },
            { title: '🌍 زلزله (USGS)', factors: earthquake.factors },
            { title: '⛰️ رانش زمین', factors: landslide.factors },
            { title: '⚡ صاعقه', factors: lightning.factors },
            { title: '📉 فرونشست', factors: subsidence.factors }
        ];
        let detailsHtml = '<h3>📋 جزئیات پارامترها</h3>';
        groups.forEach(g => {
            if (g.factors.length > 0) {
                detailsHtml += '<h4>' + g.title + '</h4><ul>';
                g.factors.forEach(f => {
                    detailsHtml += '<li><strong>' + f.name + ':</strong> ' + f.value + ' (نمره: ' + f.score + '/10، وزن: ' + f.weight + ')</li>';
                });
                detailsHtml += '</ul>';
            }
        });
        document.getElementById('paramDetails').innerHTML = detailsHtml;

        drawRadarChart(scores);
        drawBarChart(scores);

        resultEl.classList.add('show');

    } catch (e) {
        console.error(e);
        showError('خطا: ' + e.message);
    } finally {
        btn.disabled = false;
        loadingEl.style.display = 'none';
    }
}

// ============================================================
// نمودارها
// ============================================================
function drawRadarChart(scores) {
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['سیل', 'زلزله', 'رانش', 'صاعقه', 'فرونشست'],
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
                    beginAtZero: true, max: 10,
                    ticks: { stepSize: 2, font: { family: 'Tahoma' } },
                    pointLabels: { font: { family: 'Tahoma', size: 13 } }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function drawBarChart(scores) {
    const ctx = document.getElementById('barChart').getContext('2d');
    if (barChart) barChart.destroy();
    const colors = scores.map(s => s >= 8 ? '#e53e3e' : s >= 6 ? '#dd6b20' : s >= 4 ? '#d69e2e' : '#38a169');
    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['سیل', 'زلزله', 'رانش', 'صاعقه', 'فرونشست'],
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
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 10, title: { display: true, text: 'نمره ریسک', font: { family: 'Tahoma' } }, ticks: { font: { family: 'Tahoma' } } },
                x: { ticks: { font: { family: 'Tahoma', size: 13 } } }
            }
        }
    });
}

// ============================================================
// 📄 تولید گزارش PDF
// ============================================================
async function downloadPDF() {
    const resultEl = document.getElementById('result');
    const btn = document.getElementById('pdfBtn');
    const lat = document.getElementById('lat').value;
    const lon = document.getElementById('lon').value;

    if (!resultEl.classList.contains('show')) {
        alert('لطفاً ابتدا تحلیل را انجام دهید.');
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ در حال ساخت PDF...';
    btn.disabled = true;

    try {
        // ۱. تبدیل بخش نتیجه به عکس
        const canvas = await html2canvas(resultEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // ۲. ساخت PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // ۳. هدر PDF
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text("Risk Assessment Report", pdfWidth / 2, 15, { align: "center" });
        
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Location: Lat ${lat}, Lon ${lon}`, pdfWidth / 2, 22, { align: "center" });
        
        // ۴. افزودن عکس به صفحات
        let position = 30;
        let heightLeft = imgHeight;
        
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - position);

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        pdf.save(`Risk-Report-${lat}-${lon}.pdf`);

    } catch (error) {
        console.error('PDF Error:', error);
        alert('خطا در تولید PDF. لطفاً دوباره تلاش کنید.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================================
// راه‌اندازی
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
    loadToken();
    initMap();
    setupSmartSearch();
    console.log('🚀 سامانه راه‌اندازی شد');
});
