(function () {
  const CATCHES = window.CATCHES || [];
  const SOURCES = window.SOURCES || {};
  const GENERATED_AT = window.GENERATED_AT || null;
  const GEAR_RECOMMENDATIONS = window.GEAR_RECOMMENDATIONS || {};
  const GEAR_DEFAULT = window.GEAR_DEFAULT || [];
  const AMAZON_ASSOCIATE_TAG = window.AMAZON_ASSOCIATE_TAG || "";
  const WEATHER = window.WEATHER || {};

  const state = {
    days: 30,
    species: new Set(),
    funayado: new Set(),
    sortKey: 'date',
    sortDir: 'desc',
    dailySizeSpecies: null,
    dailyQtySpecies: null,
    tideSizeSpecies: null,
    tideQtySpecies: null,
  };

  const allSpecies = Array.from(new Set(CATCHES.map(r => r.species).filter(Boolean))).sort();
  const allFunayado = Array.from(new Set(CATCHES.map(r => r.funayado).filter(Boolean)));
  allSpecies.forEach(s => state.species.add(s));
  allFunayado.forEach(f => state.funayado.add(f));

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

  document.getElementById('lastUpdated').textContent = GENERATED_AT
    ? `最終更新: ${GENERATED_AT}`
    : '最終更新: 不明';
  document.getElementById('sourceCount').textContent = Object.keys(SOURCES).length;
  document.getElementById('recordCount').textContent = CATCHES.length;

  // --- Filter chip UI ---
  const chipConfigs = {};
  const countElIds = { speciesChips: 'speciesCount', funayadoChips: 'funayadoCount' };

  function updateFilterCount(containerId) {
    const countEl = document.getElementById(countElIds[containerId]);
    const cfg = chipConfigs[containerId];
    if (!countEl || !cfg) return;
    countEl.textContent = `${cfg.activeSet.size}/${cfg.values.length}`;
  }

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
        updateFilterCount(containerId);
        render();
      });
      container.appendChild(chip);
    });
    updateFilterCount(containerId);
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

  document.getElementById('dailySizeSpecies').addEventListener('change', (e) => {
    state.dailySizeSpecies = e.target.value;
    render();
  });

  document.getElementById('dailyQtySpecies').addEventListener('change', (e) => {
    state.dailyQtySpecies = e.target.value;
    render();
  });

  document.getElementById('tideSizeSpecies').addEventListener('change', (e) => {
    state.tideSizeSpecies = e.target.value;
    render();
  });

  document.getElementById('tideQtySpecies').addEventListener('change', (e) => {
    state.tideQtySpecies = e.target.value;
    render();
  });

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

  let trendChart, dailySizeChart, dailyQtyChart, tideSizeChart, tideQtyChart, weatherChart;

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

  function displayGroundLabel(r) {
    const port = (SOURCES[r.funayado] || {}).port;
    if (!r.ground_text) return port ? `${port}港周辺` : '不明';
    // Pier/breakwater fishing (各堤・桟橋 etc.) has no offshore ground name, so the
    // pipeline falls back to the boat's home port coordinates; prefix the port name
    // so "各堤" alone doesn't read as an unlabeled, ambiguous location.
    if (r.geocode_match === 'fallback_port' && port && !r.ground_text.includes(port)) {
      return `${port}港 ${r.ground_text}`;
    }
    return r.ground_text;
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

    // --- size range chart (per species: min / avg / max, cm left axis / kg right axis) ---
    function rangeBucket(map, key, unit, lo, hi) {
      const entry = map[key] || (map[key] = {});
      const b = entry[unit] || (entry[unit] = { min: Infinity, max: -Infinity, sum: 0, count: 0 });
      b.min = Math.min(b.min, lo);
      b.max = Math.max(b.max, hi);
      b.sum += (lo + hi) / 2;
      b.count += 1;
    }

    function buildSizeRangeDatasets(order, statsByKey) {
      return [
        {
          type: 'bar',
          label: '最小〜最大(cm)',
          yAxisID: 'yCm',
          data: order.map(k => (statsByKey[k] && statsByKey[k].cm) ? [statsByKey[k].cm.min, statsByKey[k].cm.max] : null),
          backgroundColor: 'rgba(42,120,214,0.35)',
          borderColor: '#2a78d6',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: 'bar',
          label: '最小〜最大(kg)',
          yAxisID: 'yKg',
          data: order.map(k => (statsByKey[k] && statsByKey[k].kg) ? [statsByKey[k].kg.min, statsByKey[k].kg.max] : null),
          backgroundColor: 'rgba(235,104,52,0.3)',
          borderColor: '#eb6834',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          type: 'line',
          label: '平均(cm)',
          yAxisID: 'yCm',
          data: order.map(k => (statsByKey[k] && statsByKey[k].cm) ? statsByKey[k].cm.sum / statsByKey[k].cm.count : null),
          showLine: false,
          pointStyle: 'circle',
          pointRadius: 5,
          pointBackgroundColor: '#123152',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
        },
        {
          type: 'line',
          label: '平均(kg)',
          yAxisID: 'yKg',
          data: order.map(k => (statsByKey[k] && statsByKey[k].kg) ? statsByKey[k].kg.sum / statsByKey[k].kg.count : null),
          showLine: false,
          pointStyle: 'triangle',
          pointRadius: 6,
          pointBackgroundColor: '#123152',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1,
        },
      ];
    }

    function sizeRangeTooltipLabel(ctx) {
      if (ctx.raw == null) return null;
      return ctx.dataset.type === 'line'
        ? `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}`
        : `${ctx.dataset.label}: ${ctx.raw[0]}〜${ctx.raw[1]}`;
    }

    const sizeRangeScales = {
      x: { ticks: { color: '#3b5166', autoSkip: true, maxRotation: 45, minRotation: 0 }, grid: { color: '#e1ecf5' } },
      yCm: { position: 'left', ticks: { color: '#2a78d6' }, grid: { color: '#e1ecf5' }, title: { display: true, text: 'cm', color: '#2a78d6' } },
      yKg: { position: 'right', min: 0, max: 8, ticks: { color: '#eb6834' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'kg', color: '#eb6834' } },
    };

    const sizeStatsBySpecies = {};
    records.forEach(r => {
      if (r.size_unit !== 'cm' && r.size_unit !== 'kg') return;
      const lo = r.size_min ?? r.size_max;
      const hi = r.size_max ?? r.size_min;
      if (lo == null || hi == null) return;
      rangeBucket(sizeStatsBySpecies, r.species, r.size_unit, lo, hi);
    });
    const sizeSpeciesOrder = speciesSorted
      .map(([sp]) => sp)
      .filter(sp => sizeStatsBySpecies[sp]);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trendChart'), {
      data: {
        labels: sizeSpeciesOrder,
        datasets: buildSizeRangeDatasets(sizeSpeciesOrder, sizeStatsBySpecies),
      },
      options: {
        plugins: {
          legend: { display: true, position: 'top', labels: { color: '#3b5166', boxWidth: 12, font: { size: 10 } } },
          tooltip: { callbacks: { label: sizeRangeTooltipLabel } },
        },
        scales: sizeRangeScales,
      },
    });

    // --- min/avg/max chart for a single selected species, grouped by date or tide phase ---
    // Mixing species together isn't meaningful (different species, different scales),
    // so these charts always focus on one species at a time.
    function renderSingleSpeciesRangeChart({ existingChart, canvasId, selectedSpecies, getRange, groupKey, categoryOrder, rotateLabels }) {
      if (existingChart) existingChart.destroy();
      if (!selectedSpecies) return { chart: null, categories: [] };
      const stats = {};
      let unit = null;
      records.forEach(r => {
        if (r.species !== selectedSpecies) return;
        const key = groupKey(r);
        if (!key) return;
        const range = getRange(r);
        if (!range) return;
        const [lo, hi, u] = range;
        if (lo == null || hi == null) return;
        unit = u;
        rangeBucket(stats, key, u, lo, hi);
      });
      const categories = categoryOrder
        ? categoryOrder.filter(c => stats[c])
        : Object.keys(stats).sort();
      if (!categories.length || !unit) return { chart: null, categories };

      const color = '#2a78d6';
      const chart = new Chart(document.getElementById(canvasId), {
        data: {
          labels: categories,
          datasets: [
            {
              type: 'bar',
              label: `最小〜最大(${unit})`,
              data: categories.map(c => [stats[c][unit].min, stats[c][unit].max]),
              backgroundColor: 'rgba(42,120,214,0.35)',
              borderColor: color,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              type: 'line',
              label: '平均',
              data: categories.map(c => stats[c][unit].sum / stats[c][unit].count),
              showLine: false,
              pointStyle: 'circle',
              pointRadius: 5,
              pointBackgroundColor: '#123152',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 1,
            },
          ],
        },
        options: {
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#3b5166', boxWidth: 12, font: { size: 10 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ctx.dataset.type === 'line'
                  ? `平均: ${ctx.raw.toFixed(1)}${unit}`
                  : `最小〜最大: ${ctx.raw[0]}〜${ctx.raw[1]}${unit}`,
              },
            },
          },
          scales: {
            x: {
              ticks: rotateLabels === false
                ? { color: '#3b5166' }
                : {
                    color: '#3b5166',
                    autoSkip: true,
                    maxRotation: 60,
                    minRotation: 45,
                    maxTicksLimit: window.innerWidth < 600 ? 7 : 14,
                  },
              grid: { color: '#e1ecf5' },
            },
            y: { position: 'left', ticks: { color }, grid: { color: '#e1ecf5' }, title: { display: true, text: unit, color } },
          },
        },
      });
      return { chart, categories };
    }

    // 日別サイズ
    const dailySizeSelect = document.getElementById('dailySizeSpecies');
    const dailySizeNote = document.getElementById('dailySizeNote');
    if (!state.dailySizeSpecies || !sizeSpeciesOrder.includes(state.dailySizeSpecies)) {
      state.dailySizeSpecies = sizeSpeciesOrder[0] || null;
    }
    dailySizeSelect.innerHTML = sizeSpeciesOrder
      .map(sp => `<option value="${sp}"${sp === state.dailySizeSpecies ? ' selected' : ''}>${sp}</option>`)
      .join('');
    {
      const result = renderSingleSpeciesRangeChart({
        existingChart: dailySizeChart,
        canvasId: 'dailySizeChart',
        selectedSpecies: state.dailySizeSpecies,
        groupKey: r => r.date,
        getRange: r => (r.size_unit === 'cm' || r.size_unit === 'kg')
          ? [r.size_min ?? r.size_max, r.size_max ?? r.size_min, r.size_unit]
          : null,
      });
      dailySizeChart = result.chart;
      dailySizeNote.textContent = !state.dailySizeSpecies
        ? 'サイズデータのある魚種がありません'
        : result.categories.length
          ? `${state.dailySizeSpecies}のサイズ推移(${result.categories.length}日分)`
          : `${state.dailySizeSpecies}のサイズデータがありません`;
    }

    // 日別数量
    const qtySpeciesOrder = speciesSorted
      .map(([sp]) => sp)
      .filter(sp => records.some(r => r.species === sp && r.qty_unit && (r.qty_min != null || r.qty_max != null)));
    const dailyQtySelect = document.getElementById('dailyQtySpecies');
    const dailyQtyNote = document.getElementById('dailyQtyNote');
    if (!state.dailyQtySpecies || !qtySpeciesOrder.includes(state.dailyQtySpecies)) {
      state.dailyQtySpecies = qtySpeciesOrder[0] || null;
    }
    dailyQtySelect.innerHTML = qtySpeciesOrder
      .map(sp => `<option value="${sp}"${sp === state.dailyQtySpecies ? ' selected' : ''}>${sp}</option>`)
      .join('');
    {
      const result = renderSingleSpeciesRangeChart({
        existingChart: dailyQtyChart,
        canvasId: 'dailyQtyChart',
        selectedSpecies: state.dailyQtySpecies,
        groupKey: r => r.date,
        getRange: r => r.qty_unit ? [r.qty_min ?? r.qty_max, r.qty_max ?? r.qty_min, r.qty_unit] : null,
      });
      dailyQtyChart = result.chart;
      dailyQtyNote.textContent = !state.dailyQtySpecies
        ? '数量データのある魚種がありません'
        : result.categories.length
          ? `${state.dailyQtySpecies}の数量推移(${result.categories.length}日分)`
          : `${state.dailyQtySpecies}の数量データがありません`;
    }

    // 潮名別サイズ・数量(大潮/中潮/小潮/長潮/若潮)
    const TIDE_ORDER = ['大潮', '中潮', '小潮', '長潮', '若潮'];
    const tideSizeSelect = document.getElementById('tideSizeSpecies');
    const tideSizeNote = document.getElementById('tideSizeNote');
    if (!state.tideSizeSpecies || !sizeSpeciesOrder.includes(state.tideSizeSpecies)) {
      state.tideSizeSpecies = sizeSpeciesOrder[0] || null;
    }
    tideSizeSelect.innerHTML = sizeSpeciesOrder
      .map(sp => `<option value="${sp}"${sp === state.tideSizeSpecies ? ' selected' : ''}>${sp}</option>`)
      .join('');
    {
      const result = renderSingleSpeciesRangeChart({
        existingChart: tideSizeChart,
        canvasId: 'tideSizeChart',
        selectedSpecies: state.tideSizeSpecies,
        groupKey: r => r.tide_title,
        categoryOrder: TIDE_ORDER,
        rotateLabels: false,
        getRange: r => (r.size_unit === 'cm' || r.size_unit === 'kg')
          ? [r.size_min ?? r.size_max, r.size_max ?? r.size_min, r.size_unit]
          : null,
      });
      tideSizeChart = result.chart;
      tideSizeNote.textContent = !state.tideSizeSpecies
        ? 'サイズデータのある魚種がありません'
        : result.categories.length
          ? `${state.tideSizeSpecies}のサイズ(潮名別、1件あたり平均)`
          : `${state.tideSizeSpecies}のサイズデータがありません`;
    }

    const tideQtySelect = document.getElementById('tideQtySpecies');
    const tideQtyNote = document.getElementById('tideQtyNote');
    if (!state.tideQtySpecies || !qtySpeciesOrder.includes(state.tideQtySpecies)) {
      state.tideQtySpecies = qtySpeciesOrder[0] || null;
    }
    tideQtySelect.innerHTML = qtySpeciesOrder
      .map(sp => `<option value="${sp}"${sp === state.tideQtySpecies ? ' selected' : ''}>${sp}</option>`)
      .join('');
    {
      const result = renderSingleSpeciesRangeChart({
        existingChart: tideQtyChart,
        canvasId: 'tideQtyChart',
        selectedSpecies: state.tideQtySpecies,
        groupKey: r => r.tide_title,
        categoryOrder: TIDE_ORDER,
        rotateLabels: false,
        getRange: r => r.qty_unit ? [r.qty_min ?? r.qty_max, r.qty_max ?? r.qty_min, r.qty_unit] : null,
      });
      tideQtyChart = result.chart;
      tideQtyNote.textContent = !state.tideQtySpecies
        ? '数量データのある魚種がありません'
        : result.categories.length
          ? `${state.tideQtySpecies}の数量(潮名別、1件あたり平均)`
          : `${state.tideQtySpecies}の数量データがありません`;
    }

    // --- weather vs report count (report count reflects whether boats went out at all) ---
    {
      const dayReports = {};
      records.forEach(r => { if (r.date) dayReports[r.date] = (dayReports[r.date] || 0) + 1; });
      const weatherDates = Object.keys(dayReports).filter(d => WEATHER[d]).sort();

      if (weatherChart) weatherChart.destroy();
      if (weatherDates.length) {
        weatherChart = new Chart(document.getElementById('weatherChart'), {
          data: {
            labels: weatherDates,
            datasets: [
              {
                type: 'bar',
                label: '報告件数',
                yAxisID: 'yCount',
                data: weatherDates.map(d => dayReports[d]),
                backgroundColor: 'rgba(42,120,214,0.35)',
                borderColor: '#2a78d6',
                borderWidth: 1,
                borderRadius: 3,
              },
              {
                type: 'line',
                label: '最大風速(km/h)',
                yAxisID: 'yWind',
                data: weatherDates.map(d => WEATHER[d].wind_kmh),
                borderColor: '#eb6834',
                backgroundColor: 'rgba(235,104,52,0.15)',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.3,
              },
            ],
          },
          options: {
            plugins: {
              legend: { display: true, position: 'top', labels: { color: '#3b5166', boxWidth: 12, font: { size: 10 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => ctx.dataset.type === 'line'
                    ? `最大風速: ${ctx.raw}km/h`
                    : `報告件数: ${ctx.raw}件`,
                },
              },
            },
            scales: {
              x: {
                ticks: {
                  color: '#3b5166',
                  autoSkip: true,
                  maxRotation: 60,
                  minRotation: 45,
                  maxTicksLimit: window.innerWidth < 600 ? 7 : 14,
                },
                grid: { color: '#e1ecf5' },
              },
              yCount: { position: 'left', ticks: { color: '#2a78d6' }, grid: { color: '#e1ecf5' }, title: { display: true, text: '報告件数', color: '#2a78d6' }, beginAtZero: true },
              yWind: { position: 'right', ticks: { color: '#eb6834' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'km/h', color: '#eb6834' }, beginAtZero: true },
            },
          },
        });
      }
    }

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
