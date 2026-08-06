(function () {
  const T = window.TBF;
  const { state, filteredRecords, rangeBucket, WEATHER } = T;

  state.dailySizeSpecies = null;
  state.dailyQtySpecies = null;
  state.tideSizeSpecies = null;
  state.tideQtySpecies = null;

  T.initFilterUI(render);
  T.renderFilterSummary('filterSummary');

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

  let trendChart, dailySizeChart, dailyQtyChart, tideSizeChart, tideQtyChart, weatherChart;

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

  // --- min/avg/max chart for a single selected species, grouped by date or tide phase ---
  // Mixing species together isn't meaningful (different species, different scales),
  // so these charts always focus on one species at a time.
  function renderSingleSpeciesRangeChart({ existingChart, canvasId, selectedSpecies, records, getRange, groupKey, categoryOrder, rotateLabels }) {
    if (existingChart) existingChart.destroy();
    if (!selectedSpecies) return { chart: null, categories: [] };
    const stats = {};
    records.forEach(r => {
      if (r.species !== selectedSpecies) return;
      const key = groupKey(r);
      if (!key) return;
      const range = getRange(r);
      if (!range) return;
      const [lo, hi, u] = range;
      if (lo == null || hi == null) return;
      rangeBucket(stats, key, u, lo, hi);
    });
    // A species should really use one unit, but real-world reports sometimes mix
    // cm/kg for the same species; pick whichever unit has the most samples and
    // only keep categories that actually have data in that unit.
    const unitCounts = {};
    Object.values(stats).forEach(entry => {
      Object.entries(entry).forEach(([u, b]) => { unitCounts[u] = (unitCounts[u] || 0) + b.count; });
    });
    const unit = Object.keys(unitCounts).sort((a, b) => unitCounts[b] - unitCounts[a])[0] || null;
    const categories = (categoryOrder ? categoryOrder.filter(c => stats[c]) : Object.keys(stats).sort())
      .filter(c => unit && stats[c][unit]);
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

  const TIDE_ORDER = ['大潮', '中潮', '小潮', '長潮', '若潮'];

  function render() {
    const records = filteredRecords();
    T.renderFilterSummary('filterSummary');

    const speciesTotals = {};
    records.forEach(r => { if (r.species) speciesTotals[r.species] = (speciesTotals[r.species] || 0) + 1; });
    const speciesSorted = Object.entries(speciesTotals).sort((a, b) => b[1] - a[1]);

    // --- species size range chart (cm left axis / kg right axis) ---
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
        records,
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
        records,
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
        records,
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
        records,
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
  }

  render();
})();
