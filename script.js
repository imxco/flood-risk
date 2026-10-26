// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let radarChart = null, barChart = null, precipChart = null, windChart = null, tempChart = null;
const WORKER_URL = 'https://nassaproxyv2.behnam-zamani.workers.dev';
const MONTH_NAMES_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
let riverDataCache = null;
let citiesSubsidenceCache = null;
let hanoverSubsidenceCache = null;

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
    });

    document.getElementById('lat').addEventListener('change', syncMapWithInputs);
    document.getElementById('lon').addEventListener('change', syncMapWithInputs);
}

function syncMapWithInputs() {
    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);
    if (!isNaN(lat) && !isNaN(lon) && map) {
        map.setView([lat, lon], 14);
        updateMarker(lat, lon);
    }
}

function updateMarker(lat, lon) {
    if (!map) return;
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        document.getElementById('lat').value = pos.lat.toFixed(4);
        document.getElementById('lon').value = pos.lng.toFixed(4);
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
// جستجوی هوشمند
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
            return '<div class="search-result-item" onclick="selectSearchResult(' + item.lat + ', ' + item.lon + ')">' +
                '<div class="icon">' + icon + '</div>' +
                '<div class="info">' +
                    '<div class="name">' + item.displayName.split(',')[0] + '</div>' +
                    '<div class="address">' + item.displayName + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        resultsDiv.innerHTML = '<div class="search-no-result">❌ خطا در جستجو</div>';
    }
}

async function searchPlace(query) {
    const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=5&countrycodes=ir&accept-language=fa';
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MultiHazardApp/1.0' } });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map(item => ({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), displayName: item.display_name }));
    } catch (e) { return []; }
}

async function searchCompany(query) {
    const safeQuery = query.replace(/["\\]/g, '');
    const q = '[out:json][timeout:25];(node["office"="company"]["name"~"' + safeQuery + '",i](around:100000););out center 5;';
    const url = WORKER_URL + '/?url=' + encodeURIComponent('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q));
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.elements || []).map(el => ({ lat: el.lat || el.center.lat, lon: el.lon || el.center.lon, displayName: (el.tags && el.tags.name) || 'شرکت' }));
    } catch (e) { return []; }
}

function selectSearchResult(lat, lon) {
    document.getElementById('lat').value = lat.toFixed(4);
    document.getElementById('lon').value = lon.toFixed(4);
    if (map) { map.setView([lat, lon], 14); updateMarker(lat, lon); }
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('searchInput').value = '';
}

// ============================================================
// دریافت داده‌های محیطی
// ============================================================
async function getElevation(lat, lon) {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat + '&longitude=' + lon);
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
        return { avg: precip.reduce((a, b) => a + b, 0) / precip.length, max: Math.max(...precip) };
    } catch (e) { return null; }
}

async function getClimateData(lat, lon) {
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=precipitation_sum,temperature_2m_mean,wind_speed_10m_mean&wind_speed_unit=kmh&timezone=auto`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.daily) return null;
        
        const precip = data.daily.precipitation_sum;
        const temp = data.daily.temperature_2m_mean;
        const wind = data.daily.wind_speed_10m_mean; 
        
        const monthlyPrecip = Array(12).fill(0);
        const monthlyTemp = Array(12).fill(0);
        const monthlyWind = Array(12).fill(0);
        const counts = Array(12).fill(0);
        const yearlyTotals = {};

        data.daily.time.forEach((t, i) => {
            const date = new Date(t);
            const year = date.getFullYear();
            const month = date.getMonth();
            
            if (precip[i] !== null) {
                if (!yearlyTotals[year]) yearlyTotals[year] = Array(12).fill(0);
                yearlyTotals[year][month] += precip[i];
            }
            if (temp[i] !== null) { monthlyTemp[month] += temp[i]; counts[month]++; }
            if (wind[i] !== null) { monthlyWind[month] += wind[i]; }
        });

        const years = Object.keys(yearlyTotals);
        const avgMonthlyPrecip = Array(12).fill(0);
        years.forEach(y => { for(let m=0; m<12; m++) avgMonthlyPrecip[m] += yearlyTotals[y][m]; });
        for(let m=0; m<12; m++) avgMonthlyPrecip[m] /= years.length;
        
        const annualPrecipAvg = avgMonthlyPrecip.reduce((a, b) => a + b, 0);
        const sumSq = avgMonthlyPrecip.reduce((a, b) => a + b*b, 0);
        const pci = annualPrecipAvg > 0 ? (sumSq / (annualPrecipAvg * annualPrecipAvg)) * 100 : 0;

        for(let m=0; m<12; m++) if(counts[m]>0) monthlyTemp[m] /= counts[m];
        const annualTempAvg = monthlyTemp.reduce((a,b)=>a+b,0) / 12;

        const avgDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        for(let m=0; m<12; m++) monthlyWind[m] /= (years.length * avgDaysInMonth[m]);

        const annualWindAvgKmh = monthlyWind.reduce((a,b)=>a+b,0) / 12;
        const windiestMonthIndex = monthlyWind.indexOf(Math.max(...monthlyWind));

        const monthOrder = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
        return {
            precip: { monthly: monthOrder.map(m=>avgMonthlyPrecip[m]), annualAvg: annualPrecipAvg, pci: pci },
            temp: { monthly: monthOrder.map(m=>monthlyTemp[m]), annualAvg: annualTempAvg },
            wind: { monthly: monthOrder.map(m=>monthlyWind[m]), annualAvg: annualWindAvgKmh, windiestMonth: MONTH_NAMES_FA[monthOrder.indexOf(windiestMonthIndex)] }
        };
    } catch (e) { return null; }
}

async function estimateSlope(lat, lon) {
    const delta = 0.01;
    const points = [{ lat: lat + delta, lon: lon }, { lat: lat - delta, lon: lon }, { lat: lat, lon: lon + delta }, { lat: lat, lon: lon - delta }];
    const centerElev = await getElevation(lat, lon);
    if (centerElev === null) return null;
    const elevs = await Promise.all(points.map(p => getElevation(p.lat, p.lon)));
    if (elevs.some(e => e === null)) return null;
    const dLat = delta * 111000;
    const dLon = delta * 111000 * Math.cos(lat * Math.PI / 180);
    const gradN = (elevs[0] - centerElev) / dLat, gradS = (centerElev - elevs[1]) / dLat;
    const gradE = (elevs[2] - centerElev) / dLon, gradW = (centerElev - elevs[3]) / dLon;
    return { slopePercent: Math.sqrt(Math.pow((gradN + gradS) / 2, 2) + Math.pow((gradE + gradW) / 2, 2)) * 100 };
}

async function getVs30Estimate(slopePercent) {
    if (slopePercent === null) return 300;
    if (slopePercent > 15) return 760; else if (slopePercent > 5) return 450; else return 250;
}

// ============================================================
// GloFAS (با جستجوی اطراف)
// ============================================================
async function getFloodDischarge(lat, lon) {
    const offsets = [
        { lat: lat, lon: lon }, { lat: lat + 0.1, lon: lon }, { lat: lat - 0.1, lon: lon },
        { lat: lat, lon: lon + 0.1 }, { lat: lat, lon: lon - 0.1 }
    ];
    let bestDischarge = null, bestRatio = 0;

    for (const point of offsets) {
        const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${point.lat}&longitude=${point.lon}&daily=river_discharge,river_discharge_max&past_days=30&forecast_days=7&timezone=auto`;
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (!data.daily || !data.daily.river_discharge) continue;
            const discharge = data.daily.river_discharge.filter(v => v !== null);
            if (discharge.length === 0) continue;
            const current = discharge[discharge.length - 1];
            
            if (current < 1 || current > 5000) continue;
            
            const avg = discharge.reduce((a, b) => a + b, 0) / discharge.length;
            const ratio = avg > 0 ? current / avg : 0;
            if (current > bestDischarge || bestDischarge === null) {
                bestDischarge = current;
                bestRatio = ratio;
            }
        } catch (e) { continue; }
    }
    if (bestDischarge === null) return null;
    return { current: bestDischarge, avg: bestDischarge / (bestRatio || 1), ratio: bestRatio };
}

async function getNDVI(lat, lon, token) {
    if (!token) return null;
    const nasaUrl = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=' + lat + '&longitude=' + lon + '&band=250m_16_days_NDVI&startDate=A2023001&endDate=A2023096&kmAboveBelow=1&kmLeftRight=1';
    const url = WORKER_URL + '/?url=' + encodeURIComponent(nasaUrl);
    try {
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.subset || data.subset.length === 0) return null;
        const scale = parseFloat(data.scale) || 0.0001;
        let vals = [];
        data.subset.forEach(item => {
            const raw = item.value !== undefined ? item.value : item.data;
            if (raw === undefined || raw === null) return;
            const num = parseFloat(raw);
            if (!isNaN(num) && num !== -3000) {
                const scaled = num * scale;
                if (scaled >= -1 && scaled <= 1) vals.push(scaled);
            }
        });
        return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length } : null;
    } catch (e) { return null; }
}

async function getLandCover(lat, lon, token) {
    if (!token) return null;
    const nasaUrl = 'https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset?latitude=' + lat + '&longitude=' + lon + '&band=LC_Type1&startDate=A2022001&endDate=A2022365&kmAboveBelow=1&kmLeftRight=1';
    const url = WORKER_URL + '/?url=' + encodeURIComponent(nasaUrl);
    try {
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.subset || data.subset.length === 0) return null;
        const counts = {};
        data.subset.forEach(item => {
            const code = parseInt(item.value !== undefined ? item.value : item.data);
            if (!isNaN(code) && code !== 255) counts[code] = (counts[code] || 0) + 1;
        });
        let dom = null, max = 0;
        for (const c in counts) if (counts[c] > max) { max = counts[c]; dom = parseInt(c); }
        const info = getLandCoverInfo(dom);
        return { code: dom, name: info.name, floodScore: info.floodScore };
    } catch (e) { return null; }
}

function getLandCoverInfo(code) {
    const m = { 1:{name:'جنگل سوزنی‌برگ',floodScore:1}, 2:{name:'جنگل پهن‌برگ',floodScore:1}, 3:{name:'جنگل خزان‌کننده',floodScore:2}, 4:{name:'جنگل پهن‌برگ خزان',floodScore:2}, 5:{name:'جنگل مختلط',floodScore:2}, 6:{name:'بیشه‌زار',floodScore:4}, 7:{name:'بوته‌زار',floodScore:5}, 8:{name:'ساوانا',floodScore:5}, 9:{name:'ساوانا',floodScore:6}, 10:{name:'مرتع',floodScore:6}, 11:{name:'تالاب',floodScore:9}, 12:{name:'زمین زراعی',floodScore:7}, 13:{name:'زمین شهری',floodScore:10}, 14:{name:'زراعت',floodScore:6}, 15:{name:'برف',floodScore:3}, 16:{name:'بایر',floodScore:4}, 17:{name:'پهنه آبی',floodScore:10} };
    return m[code] || { name: 'نامشخص', floodScore: 5 };
}

async function loadRiverData() {
    if (riverDataCache) return riverDataCache;
    try { const res = await fetch('iran-rivers.geojson'); if (!res.ok) return null; riverDataCache = await res.json(); return riverDataCache; } catch(e) { return null; }
}

async function getRiverDistance(lat, lon) {
    const data = await loadRiverData();
    if (!data || !data.features) return { found: false, distanceText: 'داده در دسترس نیست' };
    const pt = turf.point([lon, lat]); let minD = Infinity, nearest = null;
    data.features.forEach(f => {
        if (!f.geometry || (f.geometry.type !== 'LineString' && f.geometry.type !== 'MultiLineString')) return;
        const b = turf.bbox(f);
        if (b[0] > lon+0.5 || b[2] < lon-0.5 || b[1] > lat+0.5 || b[3] < lat-0.5) return;
        try { const d = turf.pointToLineDistance(pt, f, {units:'meters'}); if (d < minD) { minD = d; nearest = f; } } catch(e) {}
    });
    if (!nearest) return { found: false, distanceText: 'بیش از ۵۰ کیلومتر' };
    return { found: true, distance: minD, distanceText: minD < 1000 ? minD.toFixed(0)+' متر' : (minD/1000).toFixed(2)+' کیلومتر', name: nearest.properties?.name || 'بدون نام' };
}

// ============================================================
// 📉 فرونشست (منطق مرج: شهرها + هانوفر با شعاع پویا)
// ============================================================
async function loadCitiesData() {
    if (citiesSubsidenceCache) return citiesSubsidenceCache;
    try { const res = await fetch('iran-subsidence-cities.geojson'); if (!res.ok) return null; citiesSubsidenceCache = await res.json(); return citiesSubsidenceCache; } catch (e) { return null; }
}

async function loadHanoverData() {
    if (hanoverSubsidenceCache) return hanoverSubsidenceCache;
    try { const res = await fetch('iran-subsidence.geojson'); if (!res.ok) return null; hanoverSubsidenceCache = await res.json(); return hanoverSubsidenceCache; } catch (e) { return null; }
}

async function getSubsidenceData(lat, lon) {
    const userPoint = turf.point([lon, lat]);
    
    const citiesData = await loadCitiesData();
    if (citiesData && citiesData.features) {
        let minDist = Infinity, nearest = null, chosenRadius = 50;
        citiesData.features.forEach(f => {
            if (!f.geometry || f.geometry.type !== 'Point') return;
            const dist = turf.distance(userPoint, f, { units: 'kilometers' });
            const radius = f.properties.radius || 50;
            if (dist <= radius && dist < minDist) {
                minDist = dist; nearest = f; chosenRadius = radius;
            }
        });
        if (nearest) {
            let rate = null;
            for (const key in nearest.properties) {
                if (key.includes('SAMPLE') || key.includes('VALUE')) { rate = parseFloat(nearest.properties[key]); break; }
            }
            if (rate !== null && !isNaN(rate)) {
                return { rate: rate, distance: minDist, found: true, source: 'city', radius: chosenRadius };
            }
        }
    }

    const hanoverData = await loadHanoverData();
    if (hanoverData && hanoverData.features) {
        let minDist = Infinity, nearest = null;
        const hanoverRadius = 50;
        hanoverData.features.forEach(f => {
            if (!f.geometry || f.geometry.type !== 'Point') return;
            const dist = turf.distance(userPoint, f, { units: 'kilometers' });
            if (dist <= hanoverRadius && dist < minDist) {
                minDist = dist; nearest = f;
            }
        });
        if (nearest) {
            let rate = null;
            for (const key in nearest.properties) {
                if (key.includes('SAMPLE') || key.includes('VALUE')) { rate = parseFloat(nearest.properties[key]); break; }
            }
            if (rate !== null && !isNaN(rate)) {
                return { rate: rate, distance: minDist, found: true, source: 'hanover', radius: hanoverRadius };
            }
        }
    }

    return { found: false, message: 'در شعاع تعیین‌شده این نقطه، داده معتبری ثبت نشده است.' };
}

// ============================================================
// زلزله
// ============================================================
async function getEarthquakeData(lat, lon) {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=150&minmagnitude=4.0&starttime=1900-01-01&limit=100`;
    let quakes = [];
    try { const res = await fetch(url); if (res.ok) quakes = (await res.json()).features || []; } catch(e) {}
    
    let faultDistance = 50;
    if (lat > 35 && lat < 37 && lon > 49 && lon < 54) faultDistance = 12.5;
    else if (lat > 30 && lat < 35 && lon > 45 && lon < 52) faultDistance = 25.0;
    
    let maxMag = 0, nearest = { dist: 9999, mag: 0 };
    let recentQuakes = [];

    if (quakes.length > 0) {
        const qData = quakes.map(q => ({
            mag: q.properties.mag,
            dist: haversine(lat, lon, q.geometry.coordinates[1], q.geometry.coordinates[0]) / 1000,
            time: q.properties.time,
            date: new Date(q.properties.time).toLocaleDateString('fa-IR')
        }));
        
        maxMag = Math.max(...qData.map(q=>q.mag));
        nearest = qData.reduce((min,q)=>q.dist<min.dist?q:min, qData[0]);
        
        qData.sort((a, b) => b.time - a.time);
        recentQuakes = qData.slice(0, 10); 
    }
    return { maxMag, nearest, faultDistance, recentQuakes };
}

function haversine(lat1, lon1, lat2, lon2) {
    const R=6371000, t=d=>d*Math.PI/180, dLat=t(lat2-lat1), dLon=t(lon2-lon1);
    const a=Math.sin(dLat/2)**2 + Math.cos(t(lat1))*Math.cos(t(lat2))*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// تحلیل و امتیازدهی یکپارچه
// ============================================================
async function analyzeAll() {
    const lat = parseFloat(document.getElementById('lat').value), lon = parseFloat(document.getElementById('lon').value);
    if (isNaN(lat) || isNaN(lon)) return alert('مختصات معتبر وارد کنید');
    
    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').classList.remove('show');
    const token = getToken();

    try {
        const [autoElevation, slopeData, climate, recentPrecip, discharge, ndvi, landCover, river, eqData, subsidenceData] = await Promise.all([
            getElevation(lat, lon),
            estimateSlope(lat, lon),
            getClimateData(lat, lon),
            getPrecipitation(lat, lon),
            getFloodDischarge(lat, lon),
            getNDVI(lat, lon, token),
            getLandCover(lat, lon, token),
            getRiverDistance(lat, lon),
            getEarthquakeData(lat, lon),
            getSubsidenceData(lat, lon)
        ]);

        document.getElementById('loading').style.display = 'none';
        
        if (autoElevation === null) {
            alert("خطا در دریافت ارتفاع از سطح دریا از سرور");
            return;
        }
        
        const slopePercent = slopeData ? slopeData.slopePercent : null;
        const vs30 = await getVs30Estimate(slopePercent);

        let fScore = 1;
        if (climate) {
            if (climate.precip.annualAvg > 700) fScore = 4;
            else if (climate.precip.annualAvg > 500) fScore = 3;
            else if (climate.precip.annualAvg > 300) fScore = 2;
            if (climate.precip.pci > 25) fScore += 0.5;
        }
        if (discharge && discharge.ratio > 2) fScore += 0.5;
        if (river && river.found && river.distance < 500) fScore += 0.5;
        fScore = Math.min(5, fScore);

        let eScore = 1;
        if (eqData.maxMag >= 6) eScore = 4;
        else if (eqData.maxMag >= 5) eScore = 3;
        else if (eqData.maxMag >= 4) eScore = 2;
        if (eqData.faultDistance < 20) eScore += 0.5;
        if (vs30 < 300) eScore += 0.5;
        eScore = Math.min(5, eScore);

        let landScore = 1;
        if (slopePercent) {
            if (slopePercent > 15) landScore = 4;
            else if (slopePercent > 5) landScore = 3;
            else if (slopePercent > 2) landScore = 2;
        }
        if (climate && climate.precip.annualAvg > 700) landScore += 0.5;
        landScore = Math.min(5, landScore);

        let subScore = 1;
        let subsidenceText = '';
        
        if (subsidenceData && subsidenceData.found) {
            const absRate = Math.abs(subsidenceData.rate);
            if (absRate > 20) subScore = 5;
            else if (absRate > 10) subScore = 4;
            else if (absRate > 5) subScore = 3;
            else if (absRate > 2) subScore = 2;
            else subScore = 1;
            
            const sourceLabel = (subsidenceData.source === 'city') ? 'داده شهری' : 'داده ماهواره‌ای';
            subsidenceText = `نرخ فرونشست: ${absRate.toFixed(1)} سانتی‌متر در سال (منبع: ${sourceLabel}، فاصله: ${subsidenceData.distance.toFixed(1)} کیلومتر)`;
        } else if (subsidenceData && subsidenceData.message) {
            subsidenceText = `⚠️ ${subsidenceData.message}`;
        } else {
            if (lat > 35 && lat < 36 && lon > 51 && lon < 52) subScore = 3.5; 
            else if (lat > 32 && lat < 36 && lon > 50 && lon < 55) subScore = 4.5; 
            subsidenceText = 'داده فرونشست در دسترس نیست (تخمین بر اساس منطقه).';
        }

        let lScore = 2;
        if (climate) {
            if (climate.precip.annualAvg > 700) lScore = 4;
            else if (climate.precip.annualAvg > 300) lScore = 3;
        }

        let wScore = 1;
        if (climate) {
            if (climate.wind.annualAvg > 30) wScore = 4;
            else if (climate.wind.annualAvg > 15) wScore = 2.5;
        }

        let tScore = 1.9;
        if (climate) {
            if (climate.temp.annualAvg > 25 || climate.temp.annualAvg < 5) tScore = 3;
        }

        const scores = [fScore, eScore, landScore, subScore, lScore, wScore, tScore];
        const overall = scores.reduce((a,b)=>a+b,0) / scores.length;

        document.getElementById('overallRisk').textContent = overall >= 4 ? '🔴 ریسک کلی: بالا' : overall >= 2.5 ? '🟡 ریسک کلی: متوسط' : '🟢 ریسک کلی: پایین';
        document.getElementById('overallScore').innerHTML = `<strong>نمره کلی: ${overall.toFixed(1)} از ۵</strong>`;

        const getClass = v => v >= 4 ? 'very-high' : v >= 3 ? 'high' : v >= 2 ? 'medium' : 'low';
        document.getElementById('hazardCards').innerHTML = `
            <div class="hazard-card"><h4>🌊 سیل</h4><div class="score ${getClass(fScore)}">${fScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>🌍 زلزله</h4><div class="score ${getClass(eScore)}">${eScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>⛰️ رانش</h4><div class="score ${getClass(landScore)}">${landScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>📉 فرونشست</h4><div class="score ${getClass(subScore)}">${subScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>⚡ صاعقه</h4><div class="score ${getClass(lScore)}">${lScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>💨 باد</h4><div class="score ${getClass(wScore)}">${wScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>🌡️ دما</h4><div class="score ${getClass(tScore)}">${tScore.toFixed(1)}</div></div>
        `;

        drawRadarChart(scores);
        drawBarChart(scores);
        if (climate) {
            drawPrecipChart(climate.precip.monthly);
            drawWindChart(climate.wind.monthly);
            drawTempChart(climate.temp.monthly);
        }

        let html = '<h3>📋 جزئیات تحلیل</h3>';
        
        html += `<h4>🌊 سیل</h4><ul>`;
        if (climate) html += `<li>بارش سالانه: ${climate.precip.annualAvg.toFixed(1)} mm</li><li>PCI: ${climate.precip.pci.toFixed(1)}</li>`;
        
        if (discharge) {
            html += `<li>دبی GloFAS: ${discharge.current.toFixed(1)} m³/s</li>`;
        } else {
            let fallbackMsg = `⚠️ داده دبی GloFAS برای این نقطه معتبر نیست.`;
            if (river && river.found && river.distance < 1000) {
                const riverName = (river.name && river.name !== 'بدون نام') ? river.name : 'رودخانه';
                fallbackMsg += ` با توجه به فاصله بسیار کم تا ${riverName} (${river.distanceText})، ریسک سیل بالا است. لطفاً از داده‌های ایستگاه هیدرومتری محلی استفاده کنید.`;
            }
            html += `<li style="color: #dd6b20;">${fallbackMsg}</li>`;
        }
        
        if (ndvi) html += `<li>NDVI: ${ndvi.avg.toFixed(3)}</li>`;
        if (landCover) html += `<li>کاربری اراضی: ${landCover.name}</li>`;
        
        if (river && river.found) {
            const riverName = (river.name && river.name !== 'بدون نام') ? river.name : 'رودخانه بدون نام';
            html += `<li>فاصله از رودخانه: ${river.distanceText} (تا ${riverName})</li>`;
        }
        
        if (recentPrecip) html += `<li>بارش ۱۰ روز اخیر: ${recentPrecip.avg.toFixed(2)} mm</li>`;
        html += `</ul>`;

        html += `<h4>🌍 زلزله</h4>`;
        html += `<ul>
                    <li>فاصله تا گسل: ${eqData.faultDistance} km</li>
                    <li>Vs30: ${vs30} m/s</li>
                 </ul>`;
                 
        if (eqData.recentQuakes.length > 0) {
            const maxMagRecent = Math.max(...eqData.recentQuakes.map(q => q.mag));
            html += `<table style="width:100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;">
                     <thead>
                         <tr style="background-color: #edf2f7;">
                             <th style="border: 1px solid #cbd5e0; padding: 5px;">تاریخ</th>
                             <th style="border: 1px solid #cbd5e0; padding: 5px;">بزرگا (ریشتر)</th>
                             <th style="border: 1px solid #cbd5e0; padding: 5px;">فاصله (km)</th>
                         </tr>
                     </thead>
                     <tbody>`;
            eqData.recentQuakes.forEach(q => {
                const isMax = (q.mag === maxMagRecent);
                const rowStyle = isMax ? 'background-color: #fed7d7; font-weight: bold; color: #c53030;' : '';
                html += `<tr style="${rowStyle}">
                            <td style="border: 1px solid #cbd5e0; padding: 5px; text-align: center;">${q.date}</td>
                            <td style="border: 1px solid #cbd5e0; padding: 5px; text-align: center;">${q.mag.toFixed(1)}</td>
                            <td style="border: 1px solid #cbd5e0; padding: 5px; text-align: center;">${q.dist.toFixed(1)}</td>
                         </tr>`;
            });
            html += `</tbody></table>`;
        }

        html += `<h4>🏔️ توپوگرافی</h4><ul>
                    <li>ارتفاع از سطح دریا: ${autoElevation.toFixed(0)} متر</li>
                    <li>شیب تقریبی: ${slopePercent ? slopePercent.toFixed(1) : 'نامشخص'}%</li>
                 </ul>`;

        html += `<h4>📉 فرونشست زمین</h4><ul><li>${subsidenceText}</li></ul>`;

        if (climate) html += `<h4>🌡️ دما و باد</h4><ul><li>میانگین دما: ${climate.temp.annualAvg.toFixed(1)} C°</li><li>میانگین باد: ${climate.wind.annualAvg.toFixed(1)} km/h</li></ul>`;

        document.getElementById('paramDetails').innerHTML = html;

        generateInsuranceAssistant(eScore, subScore, lScore, fScore, landScore, climate);
        document.getElementById('result').classList.add('show');

    } catch (e) {
        console.error(e);
        alert('خطا در تحلیل: ' + e.message);
        document.getElementById('loading').style.display = 'none';
    }
}

// ============================================================
// نمودارها
// ============================================================
function drawRadarChart(s) { const ctx = document.getElementById('radarChart').getContext('2d'); if (radarChart) radarChart.destroy(); radarChart = new Chart(ctx, { type: 'radar', data: { labels: ['سیل','زلزله','رانش','فرونشست','صاعقه','باد','دما'], datasets: [{ label: 'امتیاز', data: s, backgroundColor: 'rgba(49,130,206,0.3)', borderColor: '#3182ce' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 5 } } } }); }
function drawBarChart(s) { const ctx = document.getElementById('barChart').getContext('2d'); if (barChart) barChart.destroy(); barChart = new Chart(ctx, { type: 'bar', data: { labels: ['سیل','زلزله','رانش','فرونشست','صاعقه','باد','دما'], datasets: [{ label: 'امتیاز', data: s, backgroundColor: s.map(v=>v>=4?'#e53e3e':v>=3?'#dd6b20':'#38a169') }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 5 } } } }); }
function drawPrecipChart(d) { const ctx = document.getElementById('precipChart').getContext('2d'); if (precipChart) precipChart.destroy(); precipChart = new Chart(ctx, { type: 'bar', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'mm', data: d, backgroundColor: '#3182ce' }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function drawWindChart(d) { const ctx = document.getElementById('windChart').getContext('2d'); if (windChart) windChart.destroy(); windChart = new Chart(ctx, { type: 'line', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'km/h', data: d, borderColor: '#38a169', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function drawTempChart(d) { const ctx = document.getElementById('tempChart').getContext('2d'); if (tempChart) tempChart.destroy(); tempChart = new Chart(ctx, { type: 'line', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'C°', data: d, borderColor: '#dd6b20', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }

// ============================================================
// دستیار بیمه‌گر
// ============================================================
function generateInsuranceAssistant(e, s, l, f, land, climate) {
    const c = document.getElementById('insuranceContent'); let html = ''; let has = false;
    if (e > 2.5) { has = true; html += `<div style="background:#fff5f5; padding:15px; border-right:4px solid #e53e3e; margin-bottom:15px;"><h4>🌍 زلزله (امتیاز: ${e.toFixed(1)})</h4><p><strong>مدارک:</strong> گزارش ژئوتکنیک، نقشه سازه، سوابق ترک.</p><p><strong>توصیه:</strong> دامنه پوشش زلزله و فرانشیز درج شود.</p></div>`; }
    if (s > 2.5) { has = true; html += `<div style="background:#fffaf0; padding:15px; border-right:4px solid #dd6b20; margin-bottom:15px;"><h4>📉 فرونشست (امتیاز: ${s.toFixed(1)})</h4><p><strong>مدارک:</strong> پایش تراز، وضعیت خطوط مدفون.</p><p><strong>توصیه:</strong> پوشش فرونشست جدا از زلزله روشن شود.</p></div>`; }
    if (l > 2.5) { has = true; html += `<div style="background:#f0fff4; padding:15px; border-right:4px solid #38a169; margin-bottom:15px;"><h4>⚡ صاعقه (امتیاز: ${l.toFixed(1)})</h4><p><strong>مدارک:</strong> طرح حفاظت صاعقه، لیست تجهیزات حساس.</p><p><strong>توصیه:</strong> پوشش اضافه‌ولتاژ جداگانه روشن شود.</p></div>`; }
    if (f > 2.5 && climate) { has = true; html += `<div style="background:#ebf8ff; padding:15px; border-right:4px solid #3182ce; margin-bottom:15px;"><h4>🌊 سیل (امتیاز: ${f.toFixed(1)})</h4><p><strong>وضعیت:</strong> بارش سالانه ${climate.precip.annualAvg.toFixed(0)} mm.</p><p><strong>توصیه:</strong> بازدید از زهکشی و اخذ مدارک سیلاب‌های گذشته.</p></div>`; }
    if (land > 2.5) { has = true; html += `<div style="background:#faf5ff; padding:15px; border-right:4px solid #805ad5; margin-bottom:15px;"><h4>⛰️ رانش زمین (امتیاز: ${land.toFixed(1)})</h4><p><strong>توصیه:</strong> بررسی پایداری شیب و زهکشی دامنه‌ها.</p></div>`; }
    if (!has) html = '<p style="color:#38a169;">✅ هیچ مخاطره‌ای با امتیاز بالاتر از ۲.۵ یافت نشد.</p>';
    c.innerHTML = html; document.getElementById('insuranceAssistant').style.display = 'block';
}

// ============================================================
// PDF
// ============================================================
async function downloadPDF() {
    const resultEl = document.getElementById('result');
    const btn = document.getElementById('pdfBtn');
    
    if (!resultEl.classList.contains('show')) return alert('ابتدا تحلیل را انجام دهید.');
    
    const originalBtnStyle = btn.style.display;
    btn.style.display = 'none';
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pdfWidth - (margin * 2);
        let currentY = 20;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text("Insurance Risk Assessment Report", pdfWidth / 2, 15, { align: "center" });
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.text("Generated by Multi-Hazard Risk Assessment System", pdfWidth / 2, 22, { align: "center" });
        currentY = 30;

        const addElementToPDF = async (element, title = null) => {
            if (!element || element.offsetHeight === 0) return;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const imgWidth = contentWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            if (currentY + imgHeight + 10 > pdfHeight - margin) {
                pdf.addPage();
                currentY = margin;
            }
            if (title) {
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(12);
                pdf.text(title, margin, currentY);
                currentY += 6;
            }
            pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 10;
        };

        await addElementToPDF(document.getElementById('hazardCards'), "Risk Score Summary");
        await addElementToPDF(document.getElementById('radarChart').closest('.chart-section'), "Radar Chart");
        await addElementToPDF(document.getElementById('barChart').closest('.chart-section'), "Comparison Chart");
        await addElementToPDF(document.getElementById('precipChart').closest('.chart-section'), "Monthly Precipitation");
        await addElementToPDF(document.getElementById('windChart').closest('.chart-section'), "Monthly Wind Speed");
        await addElementToPDF(document.getElementById('tempChart').closest('.chart-section'), "Monthly Temperature");
        await addElementToPDF(document.getElementById('paramDetails'), "Analysis Details");
        await addElementToPDF(document.getElementById('insuranceAssistant'), "Insurance Assistant Recommendations");

        pdf.save('Insurance-Risk-Report.pdf');

    } catch (error) {
        console.error('PDF Error:', error);
        alert('خطا در تولید PDF. لطفاً دوباره تلاش کنید.');
    } finally {
        btn.style.display = originalBtnStyle;
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
    console.log('🚀 سامانه جامع بیمه‌ای راه‌اندازی شد');
});
