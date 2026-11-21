import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Read the code-analysis CSV and convert numeric/date fields into usable values.
async function loadData() {
  return await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
}

// Turn the line-level CSV into one object per commit.
function processCommits(data) {
  let commits = d3.groups(data, (d) => d.commit).map(([commit, lines]) => {
    const first = lines[0];
    const { author, date, time, timezone, datetime } = first;

    const commitInfo = {
      id: commit,
      url: 'https://github.com/kevinc-333/portfolio/commit/' + commit,
      author,
      date,
      time,
      timezone,
      datetime,
      hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
      totalLines: lines.length,
    };

    // Keep the original line records available without cluttering the object.
    Object.defineProperty(commitInfo, 'lines', {
      value: lines,
      enumerable: false,
      configurable: false,
      writable: false,
    });

    return commitInfo;
  });

  // Sort commits chronologically, from earliest to latest.
  commits.sort((a, b) => a.datetime - b.datetime);

  return commits;
}

// Display summary statistics about the codebase.
function renderCommitInfo(data, commits) {
  const stats = d3.select('#stats').append('dl').attr('class', 'stats');

  stats.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  stats.append('dd').text(data.length);

  stats.append('dt').text('Total commits');
  stats.append('dd').text(commits.length);

  stats.append('dt').text('Files');
  stats.append('dd').text(d3.group(data, (d) => d.file).size);

  const fileLengths = d3.rollups(
    data,
    (lines) => d3.max(lines, (d) => d.line),
    (d) => d.file,
  );

  stats.append('dt').text('Average file length');
  stats.append('dd').text(`${d3.mean(fileLengths, (d) => d[1]).toFixed(0)} lines`);

  const longestFile = d3.greatest(fileLengths, (d) => d[1]);
  stats.append('dt').text('Longest file');
  stats.append('dd').text(longestFile ? `${longestFile[0]} (${longestFile[1]} lines)` : '—');
}

let xScale;
let yScale;
let commits = [];

// Draw the commits as a scatterplot of date versus time of day.
function renderScatterPlot(commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Gridlines first, so they sit behind the chart's marks.
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes.
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3.axisLeft(yScale).tickFormat(
        (hour) => String(hour % 24).padStart(2, '0') + ':00',
      ),
    );

  // Scale dot sizes according to the number of lines in each commit.
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([5, 20]);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('fill-opacity', 0.3)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.6);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.3);
      updateTooltipVisibility(false);
    });

  createBrushSelector(svg);
}

// Add a brush and keep the dots above the brush overlay so hover still works.
function createBrushSelector(svg) {
  const brush = d3.brush().on('start brush end', brushed);
  svg.call(brush);
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// Handle brush selection.
function brushed(event) {
  const selection = event.selection;

  d3.selectAll('#chart circle').classed('selected', (commit) =>
    isCommitSelected(selection, commit),
  );

  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// Check whether a commit falls inside the brush selection.
function isCommitSelected(selection, commit) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Display how many commits have been selected.
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((commit) => isCommitSelected(selection, commit))
    : [];

  document.querySelector('#selection-count').textContent =
    `${selectedCommits.length || 'No'} commits selected`;

  return selectedCommits;
}

// Show the language distribution among lines in selected commits.
function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((commit) => isCommitSelected(selection, commit))
    : [];

  const container = document.querySelector('#language-breakdown');

  if (selectedCommits.length === 0) {
    container.replaceChildren();
    return;
  }

  const lines = selectedCommits.flatMap((commit) => commit.lines);
  const breakdown = d3.rollup(lines, (rows) => rows.length, (d) => d.type);

  container.replaceChildren();

  for (const [language, count] of breakdown) {
    const proportion = d3.format('.1~%')(count / lines.length);

    container.insertAdjacentHTML(
      'beforeend',
      `<dt>${language}</dt><dd>${count} lines (${proportion})</dd>`,
    );
  }
}

// Update the hover tooltip.
function renderTooltipContent(commit) {
  document.querySelector('#commit-link').href = commit.url;
  document.querySelector('#commit-link').textContent = commit.id;

  document.querySelector('#commit-date').textContent =
    commit.datetime.toLocaleString('en', { dateStyle: 'full' });

  document.querySelector('#commit-time').textContent = commit.time;
  document.querySelector('#commit-author').textContent = commit.author;
  document.querySelector('#commit-lines').textContent = commit.totalLines;
}

// Show or hide the tooltip.
function updateTooltipVisibility(isVisible) {
  document.querySelector('#commit-tooltip').hidden = !isVisible;
}

// Position the tooltip near the mouse.
function updateTooltipPosition(event) {
  const tooltip = document.querySelector('#commit-tooltip');
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
}

// Load data, prepare commits, and draw the page.
const data = await loadData();
commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(commits);

let commitProgress = 100;

let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);

let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;

function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;

  const margin = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 20,
  };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  // Select the SVG that already exists
  const svg = d3.select('#chart').select('svg');

  // Update the x-axis scale based on the filtered commits
  xScale = xScale.domain(
    d3.extent(commits, (d) => d.datetime)
  );

  // Update the circle size scale
  const [minLines, maxLines] = d3.extent(
    commits,
    (d) => d.totalLines
  );

  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([2, 30]);

  // Create the new x-axis
  const xAxis = d3.axisBottom(xScale);

  // Select and clear the existing x-axis
  const xAxisGroup = svg.select('g.x-axis');

  xAxisGroup.selectAll('*').remove();

  // Draw the updated x-axis
  xAxisGroup.call(xAxis);

  // Select the existing circles group
  const dots = svg.select('g.dots');

  // Sort commits by size
  const sortedCommits = d3.sort(
    commits,
    (d) => -d.totalLines
  );

  // Update the circles
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget)
        .style('fill-opacity', 1);

      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget)
        .style('fill-opacity', 0.7);

      updateTooltipVisibility(false);
    });
}

let colors = d3.scaleOrdinal(d3.schemeTableau10);

updateFileDisplay(filteredCommits);

function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);

  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, fileLines]) => ({
      name,
      lines: fileLines,
      type: fileLines[0]?.type,
    }))
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').append('code');
          div.append('dd');
        }),
    );

  filesContainer.attr(
    'style',
    (d) => `--color: ${colors(d.type)}`
  );

  filesContainer
    .select('dt > code')
    .text((d) => d.name);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc');
}

d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html(
    (d, i) => `
		On ${d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    })},
		I made <a href="${d.url}" target="_blank">${i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
      }</a>.
		I edited ${d.totalLines} lines across ${d3.rollups(
        d.lines,
        (D) => D.length,
        (d) => d.file,
      ).length
      } files.
		Then I looked over all I had made, and I saw that it was very good.
	`,
  );

function onStepEnter(response) {
  let commit = response.element.__data__;

  // Set the cutoff date to the current commit
  commitMaxTime = commit.datetime;

  // Filter commits up to this date
  filteredCommits = commits.filter(
    (d) => d.datetime <= commitMaxTime
  );

  // Update the scatter plot
  updateScatterPlot(data, filteredCommits);

  // Update the file visualization
  updateFileDisplay(filteredCommits);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);