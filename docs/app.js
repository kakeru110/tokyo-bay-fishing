(function () {
  const T = window.TBF;
  const { CATCHES, SOURCES, state, filteredRecords, fmtRange, displayGroundLabel } = T;

  const GEAR_RECOMMENDATIONS = window.GEAR_RECOMMENDATIONS || {};
  const GEAR_DEFAULT = window.GEAR_DEFAULT || [];
  const AMAZON_ASSOCIATE_TAG = window.AMAZON_ASSOCIATE_TAG || "";

  state.sortKey = 'date';
  state.sortDir = 'desc';

  // Per-species "大物" (notably large catch) threshold: 85th percentile of
  // size_max (falling back to size_min) among that species' own records.
  const speciesBigSizeThreshold = {};
  {
    const bySpecies = {};
    CATCHES.forEach(r => {
      const v = r.size_max ?? r.size_min;
      if (v == null || !r.species) return;
      (bySpecies[r.species] = bySpecies[r.species] || []).push(v);
    });
    Object.entries(bySpecies).forEach(([sp, vals]) => {
      if (vals.length < 5) return;
      vals.sort((a, b) => a - b);
      const idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.85));
      speciesBigSizeThreshold[sp] = vals[idx];
    });
  }

  T.initFilterUI(render);

  // --- Sortable table headers ---
  function updateSortIndicators() {
    document.querySelectorAll('#reportTable thead th[data-sort]').forEach(th => {
      const active = th.dataset.sort === state.sortKey;
      th.classList.toggle('sorted', active);
      th.dataset.sortArrow = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    });
  }

  document.querySelectorAll('#reportTable thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = (key === 'date' || key === 'size' || key === 'qty') ? 'desc' : 'asc';
      }
      updateSortIndicators();
      render();
    });
  });
  updateSortIndicators();

  function sortValue(r, key) {
    switch (key) {
      case 'date': return r.date || '';
      case 'funayado': return (SOURCES[r.funayado] || {}).name || r.funayado || '';
      case 'species': return r.species || '';
      case 'size': { const v = r.size_max ?? r.size_min; return v == null ? -Infinity : v; }
      case 'qty': { const v = r.qty_max ?? r.qty_min; return v == null ? -Infinity : v; }
      case 'ground': return displayGroundLabel(r);
      default: return '';
    }
  }

  function compareRecords(a, b) {
    const va = sortValue(a, state.sortKey);
    const vb = sortValue(b, state.sortKey);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return state.sortDir === 'asc' ? cmp : -cmp;
  }

  // --- Map setup ---
  const map = L.map('map').setView([35.45, 139.75], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 17,
  }).addTo(map);
  let markerLayer = L.layerGroup().addTo(map);

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

  function render() {
    const records = filteredRecords();

    // --- stats ---
    document.getElementById('statReports').textContent = records.length;

    const speciesTotals = {};
    records.forEach(r => { if (r.species) speciesTotals[r.species] = (speciesTotals[r.species] || 0) + 1; });
    const speciesSorted = Object.entries(speciesTotals).sort((a, b) => b[1] - a[1]);

    const avgSizeEl = document.getElementById('statAvgSize');
    const avgSizeLabelEl = document.getElementById('statAvgSizeLabel');
    if (avgSizeEl && avgSizeLabelEl) {
      const topSpecies = speciesSorted[0] && speciesSorted[0][0];
      const sizeVals = topSpecies
        ? records
            .filter(r => r.species === topSpecies && (r.size_min != null || r.size_max != null))
            .map(r => (r.size_min != null && r.size_max != null) ? (r.size_min + r.size_max) / 2 : (r.size_min ?? r.size_max))
        : [];
      if (topSpecies && sizeVals.length) {
        const avg = sizeVals.reduce((a, b) => a + b, 0) / sizeVals.length;
        const unitRec = records.find(r => r.species === topSpecies && r.size_unit);
        avgSizeEl.textContent = `${avg.toFixed(1)}${unitRec ? unitRec.size_unit : ''}`;
        avgSizeLabelEl.textContent = `平均サイズ(${topSpecies})`;
      } else {
        avgSizeEl.textContent = '-';
        avgSizeLabelEl.textContent = '平均サイズ';
      }
    }

    const groundKey = r => `${(r.lat ?? '').toFixed ? r.lat.toFixed(3) : r.lat},${(r.lon ?? '').toFixed ? r.lon.toFixed(3) : r.lon}`;
    const groundGroups = {};
    records.forEach(r => {
      if (r.lat == null || r.lon == null) return;
      const key = groundKey(r);
      if (!groundGroups[key]) groundGroups[key] = { lat: r.lat, lon: r.lon, names: new Set(), records: [] };
      groundGroups[key].names.add(displayGroundLabel(r));
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
      const isFallback = g.records.every(r => r.geocode_match === 'fallback_port');
      const radius = 6 + 18 * Math.sqrt(g.records.length / maxCount);
      const marker = L.circleMarker([g.lat, g.lon], {
        radius,
        color: isFallback ? '#94a3b8' : '#eb6834',
        weight: isFallback ? 2 : 1,
        dashArray: isFallback ? '3,3' : null,
        fillColor: isFallback ? '#94a3b8' : '#eb6834',
        fillOpacity: isFallback ? 0.35 : 0.6,
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

      const fallbackNote = isFallback
        ? '<div class="popup-row popup-fallback-note">⚠ 釣り場の記載がなく、船宿の所在地で代用しています(実際の釣り場ではありません)</div>'
        : '';

      marker.bindPopup(`
        <div class="popup-title">${Array.from(g.names).join('・')}(報告${g.records.length}件)</div>
        ${fallbackNote}
        <div class="popup-row" style="color:#5c7188">${speciesSummary}</div>
        <hr style="border-color:#d6e6f2">
        ${recent}
      `);
      markerLayer.addLayer(marker);
    });

    // --- table ---
    const tbody = document.querySelector('#reportTable tbody');
    tbody.innerHTML = '';
    records
      .slice()
      .sort(compareRecords)
      .slice(0, 500)
      .forEach(r => {
        const tr = document.createElement('tr');
        const link = r.source_url ? `<a href="${r.source_url}" target="_blank" rel="noopener">元記事</a>` : '';
        const sizeVal = r.size_max ?? r.size_min;
        const isBig = sizeVal != null && speciesBigSizeThreshold[r.species] != null && sizeVal >= speciesBigSizeThreshold[r.species];
        const sizeCell = fmtRange(r.size_min, r.size_max, r.size_unit) + (isBig ? ' <span class="badge-big">大物</span>' : '');
        tr.innerHTML = `
          <td>${r.date || '-'}</td>
          <td>${(SOURCES[r.funayado] || {}).name || r.funayado}</td>
          <td>${r.species || '-'}</td>
          <td>${sizeCell}</td>
          <td>${fmtRange(r.qty_min, r.qty_max, r.qty_unit)}</td>
          <td>${displayGroundLabel(r)}</td>
          <td>${link}</td>
        `;
        tbody.appendChild(tr);
      });
  }

  render();
})();
