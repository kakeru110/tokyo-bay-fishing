(function () {
  const CATCHES = window.CATCHES || [];
  const SOURCES = window.SOURCES || {};
  const GENERATED_AT = window.GENERATED_AT || null;
  const GEAR_RECOMMENDATIONS = window.GEAR_RECOMMENDATIONS || {};
  const GEAR_DEFAULT = window.GEAR_DEFAULT || [];
  const AMAZON_ASSOCIATE_TAG = window.AMAZON_ASSOCIATE_TAG || "";

  const state = {
    days: 30,
    species: new Set(),
    funayado: new Set(),
  };

  const allSpecies = Array.from(new Set(CATCHES.map(r => r.species).filter(Boolean))).sort();
  const allFunayado = Array.from(new Set(CATCHES.map(r => r.funayado).filter(Boolean)));
  allSpecies.forEach(s => state.species.add(s));
  allFunayado.forEach(f => state.funayado.add(f));

  document.getElementById('lastUpdated').textContent = GENERATED_AT
    ? `最終更新: ${GENERATED_AT}`
    : '最終更新: 不明';
  document.getElementById('sourceCount').textContent = Object.keys(SOURCES).length;
  document.getElementById('recordCount').textContent = CATCHES.length;

  // --- Filter chip UI ---
  const chipConfigs = {};

  function buildChips(containerId, values, activeSet, labelFn) {
    chipConfigs[containerId] = { values, activeSet, labelFn };
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    values.forEach(v => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (activeSet.has(v) ? ' active' : '');
      chip.textContent = labelFn ? labelFn(v) : v;
      chip.dataset.value = v;
      chip.addEventListener('click', () => {
        if (activeSet.has(v)) activeSet.delete(v); else activeSet.add(v);
        chip.classList.toggle('active');
        render();
      });
      container.appendChild(chip);
    });
  }

  buildChips('speciesChips', allSpecies, state.species);
  buildChips('funayadoChips', allFunayado, state.funayado, f => (SOURCES[f] && SOURCES[f].name) || f);

  document.querySelectorAll('.select-all-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target; // "species" | "funayado"
      const containerId = target === 'species' ? 'speciesChips' : 'funayadoChips';
      const cfg = chipConfigs[containerId];
      cfg.activeSet.clear();
      if (btn.dataset.mode === 'all') cfg.values.forEach(v => cfg.activeSet.add(v));
      buildChips(containerId, cfg.values, cfg.activeSet, cfg.labelFn);
      render();
    });
  });

  document.querySelectorAll('#periodButtons button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#periodButtons button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.days = Number(btn.dataset.days);
      render();
    });
  });

  // --- Map setup ---
  const map = L.map('map').setView([35.45, 139.75], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 17,
  }).addTo(map);
  let markerLayer = L.layerGroup().addTo(map);

  let speciesChart, trendChart;

  function fmtRange(min, max, unit) {
    if (min == null && max == null) return '-';
    if (min == null) return `${max}${unit || ''}`;
    if (max == null) return `${min}${unit || ''}`;
    if (min === max) return `${min}${unit || ''}`;
    return `${min}〜${max}${unit || ''}`;
  }

  function todayJstStr() {
    // JST = UTC+9, no DST
    const jstNow = new Date(Date.now() + 9 * 3600000);
    return jstNow.toISOString().slice(0, 10);
  }

  function withinPeriod(dateStr) {
    if (!dateStr) return false;
    if (state.days === 0) return dateStr === todayJstStr();
    if (state.days >= 9999) return true;
    const d = new Date(dateStr + 'T00:00:00+09:00');
    const now = new Date();
    const diffDays = (now - d) / 86400000;
    return diffDays >= -1 && diffDays <= state.days;
  }

  function amazonSearchUrl(keyword) {
    const params = new URLSearchParams({ k: keyword, tag: AMAZON_ASSOCIATE_TAG });
    return `https://www.amazon.co.jp/s?${params.toString()}`;
  }

  function renderGearRecommendations(records) {
    const container = document.getElementById('gearCards');
    if (!container) return;

    const speciesTotals = {};
    records.forEach(r => { if (r.species) speciesTotals[r.species] = (speciesTotals[r.species] || 0) + 1; });
    const topSpecies = Object.entries(speciesTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sp]) => sp);

    const items = [];
    const seenKeywords = new Set();
    topSpecies.forEach(sp => {
      (GEAR_RECOMMENDATIONS[sp] || []).forEach(item => {
        if (seenKeywords.has(item.keyword)) return;
        seenKeywords.add(item.keyword);
        items.push({ ...item, species: sp });
      });
    });
    if (items.length === 0) {
      GEAR_DEFAULT.forEach(item => {
        if (seenKeywords.has(item.keyword)) return;
        seenKeywords.add(item.keyword);
        items.push(item);
      });
    }

    container.innerHTML = items.map(item => `
      <a class="gear-card" href="${amazonSearchUrl(item.keyword)}" target="_blank" rel="noopener sponsored">
        ${item.species ? `<div class="gear-species">${item.species}</div>` : ''}
        <div class="gear-label">${item.label}</div>
        <div class="gear-cta">Amazonで見る →</div>
      </a>
    `).join('');
  }

  function filteredRecords() {
    return CATCHES.filter(r =>
      withinPeriod(r.date) &&
      state.species.has(r.species) &&
      state.funayado.has(r.funayado)
    );
  }

  function render() {
    const records = filteredRecords();

    // --- stats ---
    document.getElementById('statReports').textContent = records.length;
    const groundKey = r => `${(r.lat ?? '').toFixed ? r.lat.toFixed(3) : r.lat},${(r.lon ?? '').toFixed ? r.lon.toFixed(3) : r.lon}`;
    const groundGroups = {};
    records.forEach(r => {
      if (r.lat == null || r.lon == null) return;
      const key = groundKey(r);
      if (!groundGroups[key]) groundGroups[key] = { lat: r.lat, lon: r.lon, names: new Set(), records: [] };
      const fallbackLabel = ((SOURCES[r.funayado] || {}).port ? `${SOURCES[r.funayado].port}港周辺` : '不明');
      groundGroups[key].names.add(r.ground_text || fallbackLabel);
      groundGroups[key].records.push(r);
    });
    document.getElementById('statGrounds').textContent = Object.keys(groundGroups).length;
    document.getElementById('statSpecies').textContent = new Set(records.map(r => r.species)).size;

    renderGearRecommendations(records);

    let topGroundName = '-';
    let topCount = 0;
    Object.values(groundGroups).forEach(g => {
      if (g.records.length > topCount) {
        topCount = g.records.length;
        topGroundName = Array.from(g.names)[0];
      }
    });
    document.getElementById('statTopGround').textContent = topGroundName;

    // --- map markers ---
    markerLayer.clearLayers();
    const maxCount = Math.max(1, ...Object.values(groundGroups).map(g => g.records.length));
    Object.values(groundGroups).forEach(g => {
      const radius = 6 + 18 * Math.sqrt(g.records.length / maxCount);
      const marker = L.circleMarker([g.lat, g.lon], {
        radius,
        color: '#38bdf8',
        weight: 1,
        fillColor: '#38bdf8',
        fillOpacity: 0.55,
      });

      const speciesCounts = {};
      g.records.forEach(r => { speciesCounts[r.species] = (speciesCounts[r.species] || 0) + 1; });
      const speciesSummary = Object.entries(speciesCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sp, c]) => `${sp}(${c})`)
        .join('・');

      const recent = g.records
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8)
        .map(r => {
          const link = r.source_url ? `<a href="${r.source_url}" target="_blank" rel="noopener">記事</a>` : '';
          const size = fmtRange(r.size_min, r.size_max, r.size_unit);
          const qty = fmtRange(r.qty_min, r.qty_max, r.qty_unit);
          return `<div class="popup-row">${r.date} ${(SOURCES[r.funayado] || {}).name || r.funayado} — ${r.species} ${size} / ${qty} ${link}</div>`;
        })
        .join('');

      marker.bindPopup(`
        <div class="popup-title">${Array.from(g.names).join('・')}(報告${g.records.length}件)</div>
        <div class="popup-row" style="color:#94a3b8">${speciesSummary}</div>
        <hr style="border-color:#334155">
        ${recent}
      `);
      markerLayer.addLayer(marker);
    });

    // --- species chart ---
    const speciesTotals = {};
    records.forEach(r => { speciesTotals[r.species] = (speciesTotals[r.species] || 0) + 1; });
    const speciesSorted = Object.entries(speciesTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (speciesChart) speciesChart.destroy();
    speciesChart = new Chart(document.getElementById('speciesChart'), {
      type: 'bar',
      data: {
        labels: speciesSorted.map(s => s[0]),
        datasets: [{ label: '報告件数', data: speciesSorted.map(s => s[1]), backgroundColor: '#38bdf8' }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#e2e8f0' }, grid: { color: '#334155' } },
          y: { ticks: { color: '#e2e8f0' }, grid: { color: '#334155' } },
        },
      },
    });

    // --- trend chart (per day) ---
    const dayTotals = {};
    records.forEach(r => { if (r.date) dayTotals[r.date] = (dayTotals[r.date] || 0) + 1; });
    const days = Object.keys(dayTotals).sort();
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: '報告件数',
          data: days.map(d => dayTotals[d]),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.2)',
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#e2e8f0', maxRotation: 60, minRotation: 45 }, grid: { color: '#334155' } },
          y: { ticks: { color: '#e2e8f0' }, grid: { color: '#334155' }, beginAtZero: true },
        },
      },
    });

    // --- table ---
    const tbody = document.querySelector('#reportTable tbody');
    tbody.innerHTML = '';
    records
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 500)
      .forEach(r => {
        const tr = document.createElement('tr');
        const link = r.source_url ? `<a href="${r.source_url}" target="_blank" rel="noopener">元記事</a>` : '';
        tr.innerHTML = `
          <td>${r.date || '-'}</td>
          <td>${(SOURCES[r.funayado] || {}).name || r.funayado}</td>
          <td>${r.species || '-'}</td>
          <td>${fmtRange(r.size_min, r.size_max, r.size_unit)}</td>
          <td>${fmtRange(r.qty_min, r.qty_max, r.qty_unit)}</td>
          <td>${r.ground_text || '-'}</td>
          <td>${link}</td>
        `;
        tbody.appendChild(tr);
      });
  }

  render();
})();
