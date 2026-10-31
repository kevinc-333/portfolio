import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

const projectTitle = document.querySelector(".projects-title");
projectTitle.textContent = `${Object.keys(projects).length} Projects`;


let selectedIndex = -1;
let query = '';


function filterProjects() {
    let filteredProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    if (selectedIndex !== -1) {
        let rolledData = d3.rollups(
            projects,
            (v) => v.length,
            (d) => d.year,
        );

        let data = rolledData.map(([year, count]) => ({ value: count, label: year }));

        filteredProjects = filteredProjects.filter((project) => {
            return project.year === data[selectedIndex].label;
        });
    }

    renderProjects(filteredProjects, projectsContainer, 'h2');
}

// Pie chart and legend
function renderPieChart(projects) {
    let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

    let rolledData = d3.rollups(
        projects,
        (v) => v.length,
        (d) => d.year,
    );
    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let colors = d3.scaleOrdinal(d3.schemeTableau10);

    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));

    let svg = d3.select('svg');
    svg.selectAll('path').remove();
    arcs.forEach((arc, idx) => {
        svg
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(idx))
            .on('click', () => {
                selectedIndex = selectedIndex === idx ? -1 : idx;
                // console.log(selectedIndex);
                svg
                    .selectAll('path')
                    .attr('class', (_, i) => (i === selectedIndex ? 'selected' : ''));
                legend
                    .selectAll('li')
                    .attr('class', (_, i) => (i === selectedIndex ? 'legend-item selected' : 'legend-item'));
                
                filterProjects();
            })
            ;
    });
    let legend = d3.select('.legend');
    legend.selectAll('li').remove();
    data.forEach((d, idx) => {
    legend
        .append('li')
        .attr('style', `--color:${colors(idx)}`) // set the style attribute while passing in parameters
        .attr('class', 'legend-item')
        .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`); // set the inner html of <li>
    });
}

renderPieChart(projects);

// Search bar


let searchInput = document.querySelector('.searchBar');
searchInput.addEventListener('input', (event) => {


    // update query value
    query = event.target.value;
    // console.log(query);
    // TODO: filter the projects
    filterProjects();
});