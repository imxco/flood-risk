// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
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

    marker = L.marker([lat, lon], { draggable: true, title: 'موقعیت تحلیل' }).addTo(map);

    marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(4);
        document.getElementById('lon').value = pos.lng.toFixed(4);
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
// جستجو (Nominatim + Overpass)
// ============================================================
async function searchPlace(query) {
    const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=5&countrycodes=ir&accept-language=fa';
    const res = await fetch(url, { headers: { 'User-Agent': 'MultiHazardApp/1.0' } });
    if (!res.ok) throw new Error('خطا در جستجو');
    const data = await res.json();
    return data.map(item => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        displayName: item.display_name
    }));
}

async function searchCompany(query) {
    const radius = 50000;
    const q = '[out:json][timeout:25];(node["office"="company"]["name"~"' + query + '",i](around:' + radius + ');way["office"="company"]["name"~"' + query + '",i](around:' + radius + '););out center;';
    const servers = [
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter'
    ];

    for (const server of servers) {
        try {
            const res = await fetch(server, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MultiHazardApp/1.0' },
                body: 'data=' + encodeURIComponent(q)
            });
            if (!res.ok) continue;
            const data = await res.json();
            if (!data.elements || data.elements.length === 0) continue;
            return data.elements
                .filter(el => el.lat || el.center)
                .map(el => ({
                    lat: el.lat || el.center.lat,
                    lon: el.lon || el.center.lon,
                    displayName: (el.tags && el.tags.name) || 'شرکت بدون نام'
                })).slice(0, 5);
        } catch (e) { continue; }
    }
    return [];
}

async function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    const searchType = document.getElementById('searchType').value;
    const resultsDiv = document.getElementById('searchResults');

    if (!query) {
        resultsDiv.innerHTML = '<p style="color: #e53e3e;">لطفاً نام را وارد کنید.</p>';
        return;
    }

    resultsDiv.innerHTML = '<p style="color: #3182ce;">⏳ در حال جستجو...</p>';

    try {
        const results = searchType === 'place'
            ? await searchPlace(query)
            : await searchCompany(query);

        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="color: #d69e2e;">❌ نتیجه‌ای یافت نشد.</p>';
            return;
        }

        resultsDiv.innerHTML = results.map(item => 
            '<div class="search-result-item" onclick="selectSearchResult(' + item.lat + ', ' + item.lon + ')">' +
                '<strong>' + item.displayName + '</strong><br>' +
                '<small>' + item.lat.toFixed(4) + ', ' + item.lon.toFixed(4) + '</small>' +
            '</div>'
        ).join('');
    } catch (e) {
        resultsDiv.innerHTML = '<p style="color: #e53e3e;">❌ خطا: ' + e.message + '</p>';
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
// داده‌های پایه
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

async function getAnnualPrecipitation(lat, lon) {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon + '&start_date=' + startYear + '-01-01&end_date=' + endYear + '-12-31&daily=precipitation_sum&timezone=auto';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
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
        return {
            annualAvg: years.reduce((sum, y) => sum + annualTotals[y], 0) / years.length,
            yearsCount: years.length
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
// 🌊 دبی رودخانه از GloFAS (سیل دقیق)
// ============================================================
async function getFloodDischarge(lat, lon) {
    const url = 'https://flood-api.open-meteo.com/v1/flood?latitude=' + lat + '&longitude=' + lon + '&daily=river_discharge,river_discharge_max&past_days=30&forecast_days=7&timezone=auto';
    
    console.log('GloFAS Request:', url);
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('GloFAS response not OK:', res.status);
            return null;
        }
        const data = await res.json();
        
        if (!data.daily || !data.daily.river_discharge) return null;
        
        const discharge = data.daily.river_discharge.filter(v => v !== null && v !== undefined);
        const maxDischarge = data.daily.river_discharge_max ? data.daily.river_discharge_max.filter(v => v !== null && v !== undefined) : [];
        
        if (discharge.length === 0) return null;
        
        const currentDischarge = discharge[discharge.length - 1];
        const peakDischarge = maxDischarge.length > 0 ? Math.max(...maxDischarge) : Math.max(...discharge);
        const avgDischarge = discharge.reduce((a, b) => a + b, 0) / discharge.length;
        
        // نسبت دبی فعلی به میانگین
        const ratio = avgDischarge > 0 ? currentDischarge / avgDischarge : 0;
        
        console.log('GloFAS Data:', {
            current: currentDischarge,
            peak: peakDischarge,
            avg: avgDischarge,
            ratio: ratio
        });
        
        return {
            current: currentDischarge,
            peak: peakDischarge,
            avg: avgDischarge,
            ratio: ratio,
            unit: 'm³/s'
        };
    } catch (e) {
        console.warn('GloFAS error:', e);
        return null;
    }
}

// ============================================================
// 🌍 زلزله (USGS + تخمین PGA)
// ============================================================
async function getEarthquakeRisk(lat, lon) {
    // دریافت زلزله‌های تاریخی از USGS
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=' + lat + '&longitude=' + lon + '&maxradiuskm=500&minmagnitude=4.0&starttime=1900-01-01&limit=100';
    
    console.log('USGS Request:', url);
    
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        
        const quakes = data.features || [];
        
        if (quakes.length === 0) {
            return {
                score: 2,
                count: 0,
                maxMagnitude: 0,
                nearestDistance: null,
                factors: [{ name: 'تعداد زلزله (M≥4)', value: '0', score: 2, weight: 5 }]
            };
        }
        
        // محاسبه فاصله و بزرگی
        const quakeData = quakes.map(q => {
            const coords = q.geometry.coordinates;
            const qLat = coords[1];
            const qLon = coords[0];
            const magnitude = q.properties.mag;
            const dist = haversine(lat, lon, qLat, qLon);
            return { magnitude, dist, place: q.properties.place };
        });
        
        // نزدیک‌ترین زلزله
        const nearest = quakeData.reduce((min, q) => q.dist < min.dist ? q : min, quakeData[0]);
        
        // حداکثر بزرگی
        const maxMag = Math.max(...quakeData.map(q => q.magnitude));
        
        // محاسبه نمره بر اساس بزرگی و فاصله
        let magScore = 0;
        if (maxMag >= 7) magScore = 10;
        else if (maxMag >= 6) magScore = 8;
        else if (maxMag >= 5) magScore = 6;
        else if (maxMag >= 4) magScore = 4;
        else magScore = 2;
        
        // ضریب فاصله
        let distanceFactor = 1.0;
        if (nearest.dist < 50) distanceFactor = 1.0;
        else if (nearest.dist < 100) distanceFactor = 0.8;
        else if (nearest.dist < 200) distanceFactor = 0.6;
        else if (nearest.dist < 500) distanceFactor = 0.4;
        else distanceFactor = 0.2;
        
        // نمره نهایی
        const score = Math.min(10, magScore * distanceFactor);
        
        return {
            score: score,
            count: quakes.length,
            maxMagnitude: maxMag,
            nearestDistance: nearest.dist,
            nearestPlace: nearest.place,
            factors: [
                { name: 'حداکثر بزرگی زلزله', value: maxMag.toFixed(1) + ' ریشتر', score: magScore, weight: 5 },
                { name: 'نزدیک‌ترین زلزله', value: nearest.dist.toFixed(0) + ' کیلومتر', score: Math.round(10 * distanceFactor), weight: 4 },
                { name: 'تعداد زلزله (M≥4)', value: quakes.length, score: Math.min(10, quakes.length / 5), weight: 2 }
            ]
        };
    } catch (e) {
        console.warn('USGS error:', e);
        return null;
    }
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // کیلومتر
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// ⛰️ رانش زمین (NASA LHASA + پارامترهای محلی)
// ============================================================
async function getLandslideRisk(lat, lon, slopePercent, annualPrecip, elevation) {
    let totalScore = 0, weightSum = 0;
    const factors = [];

    // شیب (مهم‌ترین)
    if (slopePercent !== null) {
        let s;
        if (slopePercent > 25) s = 10;
        else if (slopePercent > 15) s = 8;
        else if (slopePercent > 10) s = 6;
        else if (slopePercent > 5) s = 4;
        else if (slopePercent > 2) s = 2;
        else s = 1;
        factors.push({ name: 'شیب زمین', value: slopePercent.toFixed(2) + '%', score: s, weight: 5 });
        totalScore += s * 5; weightSum += 5;
    }

    // بارش سالانه
    if (annualPrecip) {
        let s;
        const a = annualPrecip.annualAvg;
        if (a > 1000) s = 10;
        else if (a > 700) s = 8;
        else if (a > 500) s = 6;
        else if (a > 300) s = 4;
        else if (a > 150) s = 2;
        else s = 1;
        factors.push({ name: 'بارش سالانه', value: a.toFixed(0) + ' mm', score: s, weight: 4 });
        totalScore += s * 4; weightSum += 4;
    }

    // ارتفاع
    if (elevation !== null) {
        let s;
        if (elevation > 2500) s = 8;
        else if (elevation > 2000) s = 7;
        else if (elevation > 1500) s = 5;
        else if (elevation > 1000) s = 3;
        else s = 2;
        factors.push({ name: 'ارتفاع', value: elevation.toFixed(0) + ' متر', score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }

    return {
        score: weightSum > 0 ? totalScore / weightSum : 0,
        factors: factors
    };
}

// ============================================================
// ⚡ صاعقه
// ============================================================
async function getLightningRisk(lat, lon, annualPrecip) {
    let totalScore = 0, weightSum = 0;
    const factors = [];

    // تخمین چگالی صاعقه بر اساس عرض جغرافیایی و بارش
    let ngScore = 5;
    if (lat > 30 && lat < 38 && lon > 45 && lon < 55) ngScore = 7;
    if (lat > 35 && lat < 38) ngScore = 8; // شمال ایران
    
    factors.push({ name: 'چگالی صاعقه (تخمینی)', value: ngScore.toFixed(1), score: ngScore, weight: 4 });
    totalScore += ngScore * 4; weightSum += 4;

    if (annualPrecip) {
        let s;
        const a = annualPrecip.annualAvg;
        if (a > 1000) s = 9;
        else if (a > 700) s = 7;
        else if (a > 500) s = 5;
        else if (a > 300) s = 4;
        else s = 2;
        factors.push({ name: 'بارش سالانه (نشانگر فعالیت رعد و برق)', value: a.toFixed(0) + ' mm', score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }

    return {
        score: weightSum > 0 ? totalScore / weightSum : 0,
        factors: factors
    };
}

// ============================================================
// 📉 فرونشست
// ============================================================
function getSubsidenceRisk(lat, lon) {
    let baseScore = 3;
    const factors = [];

    // دشت‌های بحرانی ایران
    if (lat > 32 && lat < 36 && lon > 50 && lon < 55) {
        baseScore = 9;
        factors.push({ name: 'منطقه دشت مرکزی', value: 'بحرانی (اصفهان، تهران، قزوین)', score: 9, weight: 5 });
    } else if (lat > 29 && lat < 32 && lon > 51 && lon < 57) {
        baseScore = 7;
        factors.push({ name: 'منطقه فارس', value: 'بالا (داراب، مرودشت)', score: 7, weight: 5 });
    } else if (lat > 35 && lat < 38 && lon > 45 && lon < 50) {
        baseScore = 6;
        factors.push({ name: 'منطقه شمال‌غرب', value: 'متوسط (تبریز، ارومیه)', score: 6, weight: 5 });
    } else {
        factors.push({ name: 'منطقه کم‌خطر', value: 'پایین', score: 3, weight: 5 });
    }

    factors.push({ name: 'افت سطح آب زیرزمینی', value: 'تخمینی', score: baseScore, weight: 4 });

    return { score: baseScore, factors: factors };
}

// ============================================================
// 🌊 ارزیابی سیل (با GloFAS)
// ============================================================
function calculateFloodRisk(elevation, slopePercent, annualPrecip, dischargeData) {
    let totalScore = 0, weightSum = 0;
    const factors = [];

    // دبی رودخانه (وزن ۵ - بالاترین)
    if (dischargeData) {
        let s;
        const ratio = dischargeData.ratio;
        if (ratio > 5) s = 10;
        else if (ratio > 3) s = 8;
        else if (ratio > 2) s = 6;
        else if (ratio > 1.5) s = 5;
        else if (ratio > 1) s = 3;
        else s = 1;
        
        factors.push({
            name: 'دبی رودخانه (GloFAS)',
            value: dischargeData.current.toFixed(1) + ' m³/s (نسبت: ' + ratio.toFixed(2) + ')',
            score: s,
            weight: 5
        });
        totalScore += s * 5; weightSum += 5;
    }

    // ارتفاع
    if (elevation !== null) {
        let s;
        if (elevation < 200) s = 10;
        else if (elevation < 500) s = 8;
        else if (elevation < 1000) s = 6;
        else if (elevation < 1500) s = 4;
        else if (elevation < 2000) s = 2;
        else s = 1;
        factors.push({ name: 'ارتفاع از سطح دریا', value: elevation.toFixed(0) + ' متر', score: s, weight: 2 });
        totalScore += s * 2; weightSum += 2;
    }

    // شیب
    if (slopePercent !== null) {
        let s;
        if (slopePercent < 0.5) s = 10;
        else if (slopePercent < 1) s = 8;
        else if (slopePercent < 2) s = 6;
        else if (slopePercent < 5) s = 4;
        else if (slopePercent < 10) s = 2;
        else s = 1;
        factors.push({ name: 'شیب زمین', value: slopePercent.toFixed(2) + '%', score: s, weight: 2 });
        totalScore += s * 2; weightSum += 2;
    }

    // بارش سالانه
    if (annualPrecip) {
        let s;
        const a = annualPrecip.annualAvg;
        if (a > 1000) s = 10;
        else if (a > 700) s = 8;
        else if (a > 500) s = 6;
        else if (a > 300) s = 4;
        else if (a > 150) s = 2;
        else s = 1;
        factors.push({ name: 'بارش سالانه', value: a.toFixed(0) + ' mm', score: s, weight: 3 });
        totalScore += s * 3; weightSum += 3;
    }

    return {
        score: weightSum > 0 ? totalScore / weightSum : 0,
        factors: factors
    };
}

// ============================================================
// تحلیل اصلی
// ============================================================
async function analyzeMultiHazard() {
    hideError();
    const resultEl = document.getElementById('result');
    const loadingEl = document.getElementById('loading');
    const btn = document.getElementById('analyzeBtn');

    resultEl.classList.remove('show');
    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);

    if (isNaN(lat) || isNaN(lon)) {
        showError('لطفاً مختصات معتبر وارد کنید');
        return;
    }

    btn.disabled = true;
    loadingEl.style.display = 'block';

    try {
        // دریافت همه داده‌ها به صورت موازی
        const [elevation, slopeData, annualPrecip, dischargeData, earthquakeData] = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getAnnualPrecipitation(lat, lon),
            getFloodDischarge(lat, lon),
            getEarthquakeRisk(lat, lon)
        ]);

        const slopePercent = slopeData ? slopeData.slopePercent : null;

        // ارزیابی مخاطرات
        const flood = calculateFloodRisk(elevation, slopePercent, annualPrecip, dischargeData);
        const earthquake = earthquakeData || { score: 0, factors: [] };
        const landslide = await getLandslideRisk(lat, lon, slopePercent, annualPrecip, elevation);
        const lightning = await getLightningRisk(lat, lon, annualPrecip);
        const subsidence = getSubsidenceRisk(lat, lon);

        loadingEl.style.display = 'none';

        const scores = [flood.score, earthquake.score, landslide.score, lightning.score, subsidence.score];
        const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // سطح ریسک
        let overallLevel;
        if (overallScore >= 8) overallLevel = '🔴 ریسک کلی: خیلی زیاد';
        else if (overallScore >= 6) overallLevel = '🟠 ریسک کلی: زیاد';
        else if (overallScore >= 4) overallLevel = '🟡 ریسک کلی: متوسط';
        else if (overallScore >= 2) overallLevel = '🟢 ریسک کلی: کم';
        else overallLevel = '🟢 ریسک کلی: خیلی کم';

        document.getElementById('overallRisk').textContent = overallLevel;
        document.getElementById('overallScore').innerHTML = '<strong>نمره کلی: ' + overallScore.toFixed(2) + ' از ۱۰</strong>';

        // کارت‌ها
        const getClass = (s) => s >= 8 ? 'very-high' : s >= 6 ? 'high' : s >= 4 ? 'medium' : 'low';
        document.getElementById('hazardCards').innerHTML = 
            '<div class="hazard-card"><h4>🌊 سیل</h4><div class="score ' + getClass(flood.score) + '">' + flood.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>🌍 زلزله</h4><div class="score ' + getClass(earthquake.score) + '">' + earthquake.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>⛰️ رانش</h4><div class="score ' + getClass(landslide.score) + '">' + landslide.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>⚡ صاعقه</h4><div class="score ' + getClass(lightning.score) + '">' + lightning.score.toFixed(2) + '</div></div>' +
            '<div class="hazard-card"><h4>📉 فرونشست</h4><div class="score ' + getClass(subsidence.score) + '">' + subsidence.score.toFixed(2) + '</div></div>';

        // جزئیات پارامترها
        const groups = [
            { title: '🌊 سیل (GloFAS)', factors: flood.factors },
            { title: '🌍 زلزله (USGS)', factors: earthquake.factors },
            { title: '⛰️ رانش زمین', factors: landslide.factors },
            { title: '⚡ صاعقه', factors: lightning.factors },
            { title: '📉 فرونشست', factors: subsidence.factors }
        ];

        let detailsHtml = '<h3>📋 جزئیات پارامترها</h3>';
        groups.forEach(g => {
            if (g.factors.length > 0) {
                detailsHtml += '<h4 style="margin-top: 15px; color: #2d3748;">' + g.title + '</h4><ul>';
                g.factors.forEach(f => {
                    detailsHtml += '<li><strong>' + f.name + ':</strong> ' + f.value + ' (نمره: ' + f.score + '/10، وزن: ' + f.weight + ')</li>';
                });
                detailsHtml += '</ul>';
            }
        });
        document.getElementById('paramDetails').innerHTML = detailsHtml;

        // نمودارها
        drawRadarChart(scores);
        drawBarChart(scores);

        resultEl.classList.add('show');

    } catch (e) {
        console.error(e);
        showError('خطا در تحلیل: ' + e.message);
        loadingEl.style.display = 'none';
    } finally {
        btn.disabled = false;
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
                    beginAtZero: true,
                    max: 10,
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
                y: {
                    beginAtZero: true,
                    max: 10,
                    title: { display: true, text: 'نمره ریسک', font: { family: 'Tahoma' } },
                    ticks: { font: { family: 'Tahoma' } }
                },
                x: { ticks: { font: { family: 'Tahoma', size: 13 } } }
            }
        }
    });
}

// ============================================================
// راه‌اندازی
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
    initMap();
    console.log('🚀 برنامه چندمخاطره‌ای با داده‌های دقیق راه‌اندازی شد');
});
