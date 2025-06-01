
const VITALS_URL = 'vital_data.json';
const PROXY_URL = 'proxy_drug_data.json';

let vitalData = {};
let proxyData = {};
let allParamKeys = [];         
let globalCorrMatrix = {};     

const caseSelect = d3.select('#case-select');
const xSelect = d3.select('#param-x');
const ySelect = d3.select('#param-y');
const svg = d3.select('#scatterplot');
const tooltip = d3.select('#tooltip');
const heatmapSvg = d3.select('#heatmap');

const margin = { top: 40, right: 40, bottom: 60, left: 60 };
const width = parseInt(svg.style('width')) - margin.left - margin.right;
const height = parseInt(svg.style('height')) - margin.top - margin.bottom;

const g = svg
  .append('g')
  .attr('transform', `translate(${margin.left},${margin.top})`);

const xScale = d3.scaleLinear().range([0, width]);
const yScale = d3.scaleLinear().range([height, 0]);

const xAxisG = g.append('g').attr('transform', `translate(0, ${height})`);
const yAxisG = g.append('g');

g.append('text')
  .attr('class', 'x-label')
  .attr('x', width / 2)
  .attr('y', height + 45)
  .attr('text-anchor', 'middle')
  .style('font-weight', '600');

g.append('text')
  .attr('class', 'y-label')
  .attr('x', -height / 2)
  .attr('y', -45)
  .attr('transform', 'rotate(-90)')
  .attr('text-anchor', 'middle')
  .style('font-weight', '600');


Promise.all([d3.json(VITALS_URL), d3.json(PROXY_URL)]).then(
  ([vData, pData]) => {
    vitalData = vData;
    proxyData = pData;

    const caseIDs = Object.keys(vitalData).sort((a, b) => +a - +b);
    caseSelect
      .selectAll('option')
      .data(caseIDs)
      .enter()
      .append('option')
      .attr('value', (d) => d)
      .text((d) => `Case ${d}`);

    const paramSet = new Set();
    caseIDs.forEach((c) => {
      if (vitalData[c]) {
        Object.keys(vitalData[c]).forEach((k) => paramSet.add(k));
      }
      if (proxyData[c]) {
        Object.keys(proxyData[c]).forEach((k) => paramSet.add(k));
      }
    });
    allParamKeys = Array.from(paramSet).sort();

    computeGlobalCorrelation(caseIDs);

    drawHeatmap();
    caseSelect.on('change', () => {
      updateParamOptions();
      plotScatter();
    });
    updateParamOptions();
    plotScatter();
  }
);

xSelect.on('change', plotScatter);
ySelect.on('change', plotScatter);

function updateParamOptions() {
  const caseID = caseSelect.property('value');
  const vitalKeys = Object.keys(vitalData[caseID] || []);
  const proxyKeys = Object.keys(proxyData[caseID] || []);

  xSelect.html(null);
  ySelect.html(null);

  function addOptions(selectElem, groupName, keys) {
    if (!keys || keys.length === 0) return;
    const og = selectElem.append('optgroup').attr('label', groupName);
    og.selectAll('option')
      .data(keys.sort())
      .enter()
      .append('option')
      .attr('value', (d) => d)
      .text((d) => d);
  }

  addOptions(xSelect, 'Patient Vitals', vitalKeys);
  addOptions(xSelect, 'Ventilator & Infusion Settings', proxyKeys);
  addOptions(ySelect, 'Patient Vitals', vitalKeys);
  addOptions(ySelect, 'Ventilator & Infusion Settings', proxyKeys);

  const allXOpts = xSelect.selectAll('option').nodes();
  if (allXOpts.length) xSelect.property('value', allXOpts[0].value);
  const allYOpts = ySelect.selectAll('option').nodes();
  if (allYOpts.length) {
    ySelect.property('value', allYOpts[1] ? allYOpts[1].value : allYOpts[0].value);
  }
}

function plotScatter() {
  const caseID = caseSelect.property('value');
  const paramX = xSelect.property('value');
  const paramY = ySelect.property('value');

  if (!caseID || !paramX || !paramY) return;

  const xRaw =
    (vitalData[caseID] && vitalData[caseID][paramX]) ||
    (proxyData[caseID] && proxyData[caseID][paramX]) ||
    [];
  const yRaw =
    (vitalData[caseID] && vitalData[caseID][paramY]) ||
    (proxyData[caseID] && proxyData[caseID][paramY]) ||
    [];

  const yMap = new Map(yRaw.map((d) => [d.time, +d.value]));

  const points = xRaw
    .map((d) => {
      const yv = yMap.get(d.time);
      return yv != null ? { t: d.time, x: +d.value, y: +yv } : null;
    })
    .filter((d) => d !== null);

  if (points.length === 0) {
    g.selectAll('.dot').remove();
    xAxisG.call(d3.axisBottom(xScale).ticks(0));
    yAxisG.call(d3.axisLeft(yScale).ticks(0));
    g.select('.x-label').text('');
    g.select('.y-label').text('');
    return;
  }

  const xVals = points.map((d) => d.x);
  const yVals = points.map((d) => d.y);
  xScale.domain([d3.min(xVals), d3.max(xVals)]).nice();
  yScale.domain([d3.min(yVals), d3.max(yVals)]).nice();

  xAxisG.transition().duration(200).call(d3.axisBottom(xScale).ticks(6));
  yAxisG.transition().duration(200).call(d3.axisLeft(yScale).ticks(6));

  g.select('.x-label').text(`${paramX} (t)`);
  g.select('.y-label').text(`${paramY} (t)`);

  const dots = g.selectAll('.dot').data(points, (d) => d.t);

  dots
    .enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .attr('r', 4)
    .attr('fill', '#1f77b4')
    .attr('opacity', 0.75)
    .on('mouseover', (event, d) => {
      const timeStr = formatSecondsToMMSS(d.t);
      tooltip
        .style('visibility', 'visible')
        .html(`
          <div><strong>Time:</strong> ${timeStr}</div>
          <div><strong>${paramX}:</strong> ${d.x}</div>
          <div><strong>${paramY}:</strong> ${d.y}</div>
        `);
    })
    .on('mousemove', (event) => {
      tooltip
        .style('top', event.pageY + 10 + 'px')
        .style('left', event.pageX + 10 + 'px');
    })
    .on('mouseout', () => {
      tooltip.style('visibility', 'hidden');
    })
    .merge(dots)
    .transition()
    .duration(200)
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y));

  // EXIT
  dots
    .exit()
    .transition()
    .duration(200)
    .attr('r', 0)
    .remove();
}

function computeGlobalCorrelation(caseIDs) {
  function pearsonCorr(arrA, arrB) {
    const bMap = new Map(arrB.map((d) => [d.time, +d.value]));
    const pairs = [];
    arrA.forEach((d) => {
      const yv = bMap.get(d.time);
      if (yv != null) {
        pairs.push([+d.value, yv]);
      }
    });
    if (pairs.length < 2) return null;
    const meanX = d3.mean(pairs, (d) => d[0]);
    const meanY = d3.mean(pairs, (d) => d[1]);
    let num = 0,
      denX = 0,
      denY = 0;
    pairs.forEach(([xv, yv]) => {
      const dx = xv - meanX;
      const dy = yv - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    });
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
  }

  for (let i = 0; i < allParamKeys.length; i++) {
    for (let j = i; j < allParamKeys.length; j++) {
      const keyA = allParamKeys[i];
      const keyB = allParamKeys[j];
      const corrVals = [];

      caseIDs.forEach((c) => {
        const seriesA =
          (vitalData[c] && vitalData[c][keyA]) ||
          (proxyData[c] && proxyData[c][keyA]) ||
          [];
        const seriesB =
          (vitalData[c] && vitalData[c][keyB]) ||
          (proxyData[c] && proxyData[c][keyB]) ||
          [];
        if (seriesA.length > 1 && seriesB.length > 1) {
          const r = pearsonCorr(seriesA, seriesB);
          if (r !== null) corrVals.push(r);
        }
      });

      let avgR = 0;
      if (corrVals.length > 0) {
        avgR = d3.mean(corrVals);
      }
      globalCorrMatrix[`${keyA}||${keyB}`] = avgR;
      globalCorrMatrix[`${keyB}||${keyA}`] = avgR;
    }
  }

  allParamKeys.forEach((k) => {
    globalCorrMatrix[`${k}||${k}`] = 1.0;
  });
}

function drawHeatmap() {
  const n = allParamKeys.length;
  if (n === 0) return;

  const cellSize = 30;
  const marginLeft = 150;
  const marginTop = 180; 
  const marginRight = 100; 
  const marginBottom = 50;

  const gridWidth = n * cellSize;
  const gridHeight = n * cellSize;

  heatmapSvg
    .attr('width', marginLeft + gridWidth + marginRight)
    .attr('height', marginTop + gridHeight + marginBottom);

  heatmapSvg.selectAll('*').remove();

  const hmG = heatmapSvg
    .append('g')
    .attr('transform', `translate(${marginLeft}, ${marginTop})`);

  const colorScale = d3.scaleSequential(d3.interpolateRdBu).domain([1, -1]);

  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const keyA = allParamKeys[i];
      const keyB = allParamKeys[j];
      const r = globalCorrMatrix[`${keyA}||${keyB}`] || 0;
      cells.push({ i, j, value: r });
    }
  }

  hmG.selectAll('rect')
    .data(cells)
    .enter()
    .append('rect')
    .attr('x', (d) => d.j * cellSize)
    .attr('y', (d) => d.i * cellSize)
    .attr('width', cellSize)
    .attr('height', cellSize)
    .style('fill', (d) => colorScale(d.value))
    .style('stroke', '#eee');

  heatmapSvg.append('g')
    .attr('transform', `translate(${marginLeft - 10}, ${marginTop})`)
    .selectAll('text')
    .data(allParamKeys)
    .enter()
    .append('text')
    .attr('x', 0)
    .attr('y', (d, i) => i * cellSize + cellSize / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('class', 'heatmap-label')
    .text((d) => d);

  heatmapSvg.append('g')
    .attr('transform', `translate(${marginLeft}, ${marginTop - 10})`)
    .selectAll('text')
    .data(allParamKeys)
    .enter()
    .append('text')
    .attr('x', (d, i) => i * cellSize + cellSize / 2)
    .attr('y', 0)
    .attr('text-anchor', 'start')
    .attr('transform', (d, i) => {
      const x = i * cellSize + cellSize / 2;
      const y = 0;
      return `rotate(-90, ${x}, ${y})`;
    })
    .attr('class', 'heatmap-label')
    .text((d) => d);

  const legendX = marginLeft + n * cellSize + 20;
  const legendY = marginTop;
  const legendHeight = gridHeight;
  const legendWidth = 20;

  const defs = heatmapSvg.append('defs');
  const linearGradient = defs.append('linearGradient')
    .attr('id', 'corr-gradient')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '0%')
    .attr('y2', '100%');

  linearGradient.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', d3.interpolateRdBu(0));
  linearGradient.append('stop')
    .attr('offset', '50%')
    .attr('stop-color', d3.interpolateRdBu(0.5));
  linearGradient.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', d3.interpolateRdBu(1));

  heatmapSvg.append('rect')
    .attr('x', legendX)
    .attr('y', legendY)
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .style('fill', 'url(#corr-gradient)');

  const legendScale = d3.scaleLinear()
    .domain([1, -1])
    .range([legendY, legendY + legendHeight]);

  const legendAxis = d3.axisRight(legendScale)
    .ticks(5)
    .tickFormat((d) => d.toFixed(1));

  heatmapSvg.append('g')
    .attr('transform', `translate(${legendX + legendWidth}, 0)`)
    .call(legendAxis)
    .selectAll('text')
    .style('font-size', '10px');
}


function formatSecondsToMMSS(sec) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}
