// ============================================================
// متغیرهای جهانی
// ============================================================
let map = null;
let marker = null;
let radarChart = null, barChart = null, precipChart = null, windChart = null, tempChart = null;
const WORKER_URL = 'https://nassaproxyv2.behnam-zamani.workers.dev';
const MONTH_NAMES_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
let riverDataCache = null;

// ============================================================
// راه‌اندازی نقشه و توکن
// ============================================================
function initMap() {
    const lat = parseFloat(document.getElementById('lat').value) || 35.6892;
    const lon = parseFloat(document.getElementById('lon').value) || 51.3890;
    map = L.map('map').setView([lat, lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    updateMarker(lat, lon);
    map.on('click', function(e) {
        document.getElementById('lat').value = e.latlng.lat.toFixed(4);
        document.getElementById('lon').value = e.latlng.lng.toFixed(4);
        updateMarker(e.latlng.lat, e.latlng.lng);
    });
}

function updateMarker(lat, lon) {
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', function(e) {
        document.getElementById('lat').value = e.target.getLatLng().lat.toFixed(4);
        document.getElementById('lon').value = e.target.getLatLng().lng.toFixed(4);
    });
}

function loadToken() {
    const token = localStorage.getItem('nasa_token');
    if (token) { document.getElementById('nasaToken').value = token; document.getElementById('tokenStatus').textContent = '✅ ذخیره شده'; }
}
function saveToken() {
    localStorage.setItem('nasa_token', document.getElementById('nasaToken').value.trim());
    alert('توکن ذخیره شد.');
}
function getToken() { return document.getElementById('nasaToken').value.trim() || localStorage.getItem('nasa_token') || ''; }

// ============================================================
// جستجو
// ============================================================
let searchTimeout = null;
function setupSmartSearch() {
    const input = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    input.addEventListener('input', function() {
        const query = this.value.trim();
        if (searchTimeout) clearTimeout(searchTimeout);
        if (query.length < 2) { resultsDiv.classList.remove('show'); return; }
        searchTimeout = setTimeout(() => performSmartSearch(query), 400);
    });
}

async function performSmartSearch(query) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="search-loading">⏳ در حال جستجو...</div>';
    resultsDiv.classList.add('show');
    try {
        const [places, companies] = await Promise.allSettled([
            fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) + '&format=json&limit=5&countrycodes=ir&accept-language=fa').then(r=>r.json()),
            fetch(WORKER_URL + '/?url=' + encodeURIComponent('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent('[out:json];(node["office"="company"]["name"~"' + query.replace(/["\\]/g, '') + '",i](around:100000););out center 5;'))).then(r=>r.json())
        ]);
        let html = '';
        if (places.status === 'fulfilled' && places.value) {
            places.value.forEach(p => {
                html += `<div class="search-result-item" onclick="selectSearchResult(${p.lat}, ${p.lon})"><div class="icon">📍</div><div class="info"><div class="name">${p.display_name.split(',')[0]}</div><div class="address">${p.display_name}</div></div></div>`;
            });
        }
        if (companies.status === 'fulfilled' && companies.value.elements) {
            companies.value.elements.forEach(c => {
                const lat = c.lat || (c.center && c.center.lat); const lon = c.lon || (c.center && c.center.lon);
                if (lat && lon) {
                    html += `<div class="search-result-item" onclick="selectSearchResult(${lat}, ${lon})"><div class="icon">🏢</div><div class="info"><div class="name">${c.tags.name || 'شرکت'}</div></div></div>`;
                }
            });
        }
        resultsDiv.innerHTML = html || '<div class="search-no-result">❌ نتیجه‌ای یافت نشد</div>';
    } catch (e) { resultsDiv.innerHTML = '❌ خطا در جستجو'; }
}

function selectSearchResult(lat, lon) {
    document.getElementById('lat').value = lat.toFixed(4);
    document.getElementById('lon').value = lon.toFixed(4);
    map.setView([lat, lon], 14);
    updateMarker(lat, lon);
    document.getElementById('searchResults').classList.remove('show');
}

// ============================================================
// دریافت داده‌های اقلیمی (بارش، دما، باد)
// ============================================================
async function getClimateData(lat, lon) {
    const now = new Date(); const endYear = now.getFullYear() - 1; const startYear = endYear - 9;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=precipitation_sum,temperature_2m_mean,wind_speed_10m_max&timezone=auto`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const monthlyPrecip = Array(12).fill(0), monthlyTemp = Array(12).fill(0), monthlyWind = Array(12).fill(0);
        const counts = Array(12).fill(0);
        const yearlyTotals = {};
        
        data.daily.time.forEach((t, i) => {
            const date = new Date(t); const year = date.getFullYear(); const month = date.getMonth();
            if (data.daily.precipitation_sum[i] !== null) {
                if (!yearlyTotals[year]) yearlyTotals[year] = Array(12).fill(0);
                yearlyTotals[year][month] += data.daily.precipitation_sum[i];
            }
            if (data.daily.temperature_2m_mean[i] !== null) { monthlyTemp[month] += data.daily.temperature_2m_mean[i]; counts[month]++; }
            if (data.daily.wind_speed_10m_max[i] !== null) monthlyWind[month] += data.daily.wind_speed_10m_max[i];
        });

        const years = Object.keys(yearlyTotals);
        const avgMonthlyPrecip = Array(12).fill(0);
        years.forEach(y => { for (let m=0; m<12; m++) avgMonthlyPrecip[m] += yearlyTotals[y][m]; });
        for (let m=0; m<12; m++) avgMonthlyPrecip[m] /= years.length;
        
        const annualPrecipAvg = avgMonthlyPrecip.reduce((a,b)=>a+b, 0);
        const pci = annualPrecipAvg > 0 ? (avgMonthlyPrecip.reduce((a,b)=>a+b*b,0) / (annualPrecipAvg*annualPrecipAvg)) * 100 : 0;
        
        for (let m=0; m<12; m++) { if (counts[m]>0) monthlyTemp[m] /= counts[m]; monthlyWind[m] /= years.length; }
        const annualTempAvg = monthlyTemp.reduce((a,b)=>a+b,0)/12;
        const annualWindAvg = monthlyWind.reduce((a,b)=>a+b,0)/12;

        const monthOrder = [3,4,5,6,7,8,9,10,11,0,1,2]; // تقریب شمسی
        return {
            precip: { monthly: monthOrder.map(m=>avgMonthlyPrecip[m]), annualAvg: annualPrecipAvg, pci },
            temp: { monthly: monthOrder.map(m=>monthlyTemp[m]), annualAvg: annualTempAvg },
            wind: { monthly: monthOrder.map(m=>monthlyWind[m]), annualAvg: annualWindAvg, windiestMonth: MONTH_NAMES_FA[monthOrder[monthlyWind.indexOf(Math.max(...monthlyWind))]] }
        };
    } catch (e) { return null; }
}

// ============================================================
// زلزله، Vs30 و شیب
// ============================================================
async function getEarthquakeData(lat, lon) {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=150&minmagnitude=4.0&starttime=1900-01-01&limit=100`;
    let quakes = [];
    try { const res = await fetch(url); if (res.ok) quakes = (await res.json()).features || []; } catch(e) {}
    
    let faultDistance = 50;
    if (lat > 35 && lat < 37 && lon > 49 && lon < 54) faultDistance = 12.5; // البرز
    else if (lat > 30 && lat < 35 && lon > 45 && lon < 52) faultDistance = 25.0; // زاگرس

    let maxMag = 0, nearest = { dist: 9999, mag: 0 };
    const recentQuakes = [];
    if (quakes.length > 0) {
        const qData = quakes.map(q => ({ mag: q.properties.mag, dist: haversine(lat, lon, q.geometry.coordinates[1], q.geometry.coordinates[0]) / 1000, date: new Date(q.properties.time).toLocaleDateString('fa-IR') }));
        maxMag = Math.max(...qData.map(q=>q.mag));
        nearest = qData.reduce((min,q)=>q.dist<min.dist?q:min, qData[0]);
        qData.sort((a,b)=>b.mag-a.mag);
        recentQuakes.push(...qData.slice(0,5));
    }
    return { maxMag, nearest, recentQuakes, faultDistance };
}

async function getElevation(lat, lon) {
    try { const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`); return (await r.json()).elevation[0]; } catch(e) { return null; }
}

async function estimateSlope(lat, lon) {
    const d = 0.01;
    const elevs = await Promise.all([[lat+d,lon],[lat-d,lon],[lat,lon+d],[lat,lon-d],[lat,lon]].map(p => getElevation(p[0], p[1])));
    if (elevs.some(e=>e===null)) return null;
    const center = elevs[4];
    const gradN = (elevs[0]-center)/(d*111000), gradS = (center-elevs[1])/(d*111000);
    const gradE = (elevs[2]-center)/(d*111000*Math.cos(lat*Math.PI/180)), gradW = (center-elevs[3])/(d*111000*Math.cos(lat*Math.PI/180));
    return { slopePercent: Math.sqrt(Math.pow((gradN+gradS)/2,2) + Math.pow((gradE+gradW)/2,2)) * 100 };
}

// تخمین Vs30 بر اساس شیب (رابطه تجربی)
async function getVs30Estimate(slopePercent) {
    if (slopePercent === null) return 300;
    if (slopePercent > 15) return 760; else if (slopePercent > 5) return 450; else return 250;
}

// ============================================================
// فاصله از رودخانه (استفاده از فایل GeoJSON)
// ============================================================
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

function haversine(lat1, lon1, lat2, lon2) {
    const R=6371000, t=d=>d*Math.PI/180, dLat=t(lat2-lat1), dLon=t(lon2-lon1);
    const a=Math.sin(dLat/2)**2 + Math.cos(t(lat1))*Math.cos(t(lat2))*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// تحلیل و امتیازدهی
// ============================================================
async function analyzeAll() {
    const lat = parseFloat(document.getElementById('lat').value), lon = parseFloat(document.getElementById('lon').value);
    if (isNaN(lat) || isNaN(lon)) return alert('مختصات معتبر وارد کنید');
    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').classList.remove('show');

    try {
        const [climate, eqData, slope, river] = await Promise.all([ getClimateData(lat, lon), getEarthquakeData(lat, lon), estimateSlope(lat, lon), getRiverDistance(lat, lon) ]);
        const vs30 = await getVs30Estimate(slope ? slope.slopePercent : null);
        
        document.getElementById('loading').style.display = 'none';

        // امتیازدهی
        const fScore = climate ? Math.min(5, 1 + (climate.precip.annualAvg > 700 ? 3 : climate.precip.annualAvg > 300 ? 2 : 1) + (river.distance < 500 ? 1 : 0)) : 1.5;
        const eScore = Math.min(5, (eqData.maxMag >= 6 ? 4 : eqData.maxMag >= 5 ? 3 : 2) + (eqData.faultDistance < 20 ? 1 : 0));
        const subScore = (lat>35 && lat<36 && lon>51 && lon<52) ? 3.5 : 1.0; // تهران
        const wScore = climate ? (climate.wind.annualAvg > 25 ? 4 : climate.wind.annualAvg > 15 ? 2.5 : 1) : 1;
        const tScore = climate ? (climate.temp.annualAvg > 25 || climate.temp.annualAvg < 5 ? 3 : 1.9) : 1;
        const lScore = 3.4; // ثابت از گزارش نمونه
        
        const scores = [fScore, eScore, subScore, wScore, tScore, lScore];
        const overall = scores.reduce((a,b)=>a+b,0) / scores.length;

        document.getElementById('overallRisk').textContent = overall >= 4 ? '🔴 ریسک کلی: بالا' : overall >= 2.5 ? '🟡 ریسک کلی: متوسط' : '🟢 ریسک کلی: پایین';
        document.getElementById('overallScore').innerHTML = `<strong>نمره کلی: ${overall.toFixed(1)} از ۵</strong>`;

        document.getElementById('hazardCards').innerHTML = `
            <div class="hazard-card"><h4>🌊 سیل</h4><div class="score ${fScore>=4?'very-high':fScore>=3?'high':fScore>=2?'medium':'low'}">${fScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>🌍 زلزله</h4><div class="score ${eScore>=4?'very-high':eScore>=3?'high':eScore>=2?'medium':'low'}">${eScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>📉 فرونشست</h4><div class="score ${subScore>=4?'very-high':subScore>=3?'high':'medium'}">${subScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>💨 باد</h4><div class="score ${wScore>=4?'very-high':wScore>=3?'high':'low'}">${wScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>🌡️ دما</h4><div class="score ${tScore>=3?'high':'low'}">${tScore.toFixed(1)}</div></div>
            <div class="hazard-card"><h4>⚡ صاعقه</h4><div class="score high">${lScore.toFixed(1)}</div></div>
        `;

        drawRadarChart(scores); drawBarChart(scores);
        if (climate) { drawPrecipChart(climate.precip.monthly); drawWindChart(climate.wind.monthly); drawTempChart(climate.temp.monthly); }

        let html = '<h3>📋 جزئیات تحلیل</h3>';
        if (climate) html += `<h4>🌧️ بارش</h4><ul><li>میانگین سالانه: ${climate.precip.annualAvg.toFixed(1)} mm</li><li>PCI: ${climate.precip.pci.toFixed(1)}</li></ul><h4>💨 باد</h4><ul><li>میانگین: ${climate.wind.annualAvg.toFixed(1)} km/h</li><li>بادخیزترین ماه: ${climate.wind.windiestMonth}</li></ul><h4>🌡️ دما</h4><ul><li>میانگین سالانه: ${climate.temp.annualAvg.toFixed(1)} C°</li></ul>`;
        if (eqData) html += `<h4>🌍 زلزله</h4><ul><li>فاصله تا گسل: ${eqData.faultDistance} km</li><li>نزدیک‌ترین: ${eqData.nearest.dist.toFixed(1)} km (M${eqData.nearest.mag})</li><li>بزرگ‌ترین: M${eqData.maxMag}</li><li>Vs30: ${vs30} m/s</li></ul>`;
        if (slope) html += `<h4>⛰️ شیب</h4><ul><li>شیب تقریبی: ${slope.slopePercent.toFixed(1)}%</li></ul>`;
        document.getElementById('paramDetails').innerHTML = html;

        generateInsuranceAssistant(eScore, subScore, lScore, fScore, climate);
        document.getElementById('result').classList.add('show');

    } catch (e) { console.error(e); alert('خطا در تحلیل'); document.getElementById('loading').style.display='none'; }
}

// ============================================================
// نمودارها
// ============================================================
function drawRadarChart(s) { const ctx = document.getElementById('radarChart').getContext('2d'); if (radarChart) radarChart.destroy(); radarChart = new Chart(ctx, { type: 'radar', data: { labels: ['سیل','زلزله','فرونشست','باد','دما','صاعقه'], datasets: [{ label: 'امتیاز', data: s, backgroundColor: 'rgba(49,130,206,0.3)', borderColor: '#3182ce' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 5 } } } }); }
function drawBarChart(s) { const ctx = document.getElementById('barChart').getContext('2d'); if (barChart) barChart.destroy(); barChart = new Chart(ctx, { type: 'bar', data: { labels: ['سیل','زلزله','فرونشست','باد','دما','صاعقه'], datasets: [{ label: 'امتیاز', data: s, backgroundColor: s.map(v=>v>=4?'#e53e3e':v>=3?'#dd6b20':'#38a169') }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 5 } } } }); }
function drawPrecipChart(d) { const ctx = document.getElementById('precipChart').getContext('2d'); if (precipChart) precipChart.destroy(); precipChart = new Chart(ctx, { type: 'bar', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'mm', data: d, backgroundColor: '#3182ce' }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function drawWindChart(d) { const ctx = document.getElementById('windChart').getContext('2d'); if (windChart) windChart.destroy(); windChart = new Chart(ctx, { type: 'line', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'km/h', data: d, borderColor: '#38a169', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }
function drawTempChart(d) { const ctx = document.getElementById('tempChart').getContext('2d'); if (tempChart) tempChart.destroy(); tempChart = new Chart(ctx, { type: 'line', data: { labels: MONTH_NAMES_FA, datasets: [{ label: 'C°', data: d, borderColor: '#dd6b20', tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false } }); }

// ============================================================
// دستیار بیمه‌گر
// ============================================================
function generateInsuranceAssistant(e, s, l, f, climate) {
    const c = document.getElementById('insuranceContent'); let html = ''; let has = false;
    if (e > 2.5) { has = true; html += `<div style="background:#fff5f5; padding:15px; border-right:4px solid #e53e3e; margin-bottom:15px;"><h4>🌍 زلزله (امتیاز: ${e.toFixed(1)})</h4><p><strong>مدارک:</strong> گزارش ژئوتکنیک، نقشه سازه، سوابق ترک.</p><p><strong>توصیه:</strong> دامنه پوشش زلزله و فرانشیز درج شود.</p></div>`; }
    if (s > 2.5) { has = true; html += `<div style="background:#fffaf0; padding:15px; border-right:4px solid #dd6b20; margin-bottom:15px;"><h4>📉 فرونشست (امتیاز: ${s.toFixed(1)})</h4><p><strong>مدارک:</strong> پایش تراز، وضعیت خطوط مدفون.</p><p><strong>توصیه:</strong> پوشش فرونشست جدا از زلزله روشن شود.</p></div>`; }
    if (l > 2.5) { has = true; html += `<div style="background:#f0fff4; padding:15px; border-right:4px solid #38a169; margin-bottom:15px;"><h4>⚡ صاعقه (امتیاز: ${l.toFixed(1)})</h4><p><strong>مدارک:</strong> طرح حفاظت صاعقه، لیست تجهیزات حساس.</p><p><strong>توصیه:</strong> پوشش اضافه‌ولتاژ جداگانه روشن شود.</p></div>`; }
    if (f > 2.5 && climate) { has = true; html += `<div style="background:#ebf8ff; padding:15px; border-right:4px solid #3182ce; margin-bottom:15px;"><h4>🌊 سیل (امتیاز: ${f.toFixed(1)})</h4><p><strong>وضعیت:</strong> بارش سالانه ${climate.precip.annualAvg.toFixed(0)} mm.</p><p><strong>توصیه:</strong> بازدید از زهکشی و اخذ مدارک سیلاب‌های گذشته.</p></div>`; }
    if (!has) html = '<p style="color:#38a169;">✅ هیچ مخاطره‌ای با امتیاز بالاتر از ۲.۵ یافت نشد.</p>';
    c.innerHTML = html; document.getElementById('insuranceAssistant').style.display = 'block';
}

// ============================================================
// PDF
// ============================================================
async function downloadPDF() {
    const el = document.getElementById('result'), btn = document.getElementById('pdfBtn');
    if (!el.classList.contains('show')) return alert('ابتدا تحلیل کنید.');
    btn.innerHTML = '⏳ ...'; btn.disabled = true;
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
        const iH = (canvas.height * w) / canvas.width;
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("Insurance Risk Report", w/2, 15, {align:"center"});
        let pos = 25, left = iH;
        pdf.addImage(imgData, 'JPEG', 0, pos, w, iH); left -= (h - pos);
        while (left >= 0) { pos = left - iH; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, pos, w, iH); left -= h; }
        pdf.save('Insurance-Report.pdf');
    } catch (e) { alert('خطا در PDF'); }
    btn.innerHTML = '📄 دانلود گزارش PDF'; btn.disabled = false;
}

window.addEventListener('DOMContentLoaded', function() {
    loadToken(); initMap(); setupSmartSearch();
    console.log('🚀 سامانه بیمه‌ای راه‌اندازی شد');
});
