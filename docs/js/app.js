// TODO(peter)
// - Save pan/zoom settings in query params

const parseTime = d3.timeParse("%Y%m%d");
const formatTime = d3.timeFormat("%b %d");
const dateBisector = d3.bisector(d => d.date).left;

let minDate;
let maxDate;
let max = {
    date: new Date(),
    opsSec: 0,
    readBytes: 0,
    writeBytes: 0,
    readAmp: 0,
    writeAmp: 0
};
let detail;
let detailName;
let detailFormat;

let annotations = [];

function styleWidth(e) {
    const width = +e.style("width").slice(0, -2);
    return Math.round(Number(width));
}

function styleHeight(e) {
    const height = +e.style("height").slice(0, -2);
    return Math.round(Number(height));
}

function pathGetY(path, x) {
    // Walk along the path using binary search to locate the point
    // with the supplied x value.
    let start = 0;
    let end = path.getTotalLength();
    while (start < end) {
        const target = (start + end) / 2;
        const pos = path.getPointAtLength(target);
        if (Math.abs(pos.x - x) < 0.01) {
            // Close enough.
            return pos.y;
        } else if (pos.x > x) {
            end = target;
        } else {
            start = target;
        }
    }
    return path.getPointAtLength(start).y;
}

// Pretty formatting of a number in human readable units.
function humanize(s) {
    const iecSuffixes = [" B", " KB", " MB", " GB", " TB", " PB", " EB"];
    if (s < 10) {
        return "" + s;
    }
    let e = Math.floor(Math.log(s) / Math.log(1024));
    let suffix = iecSuffixes[Math.floor(e)];
    let val = Math.floor(s / Math.pow(1024, e) * 10 + 0.5) / 10;
    return val.toFixed(val < 10 ? 1 : 0) + suffix;
}

function dirname(path) {
    return path.match(/.*\//)[0];
}

function equalDay(d1, d2) {
    return (
        d1.getYear() == d2.getYear() &&
        d1.getMonth() == d2.getMonth() &&
        d1.getDate() == d2.getDate()
    );
}

function renderChart(chart) {
    const chartKey = chart.attr("data-key");
    const vals = data[chartKey];

    const svg = chart.html("");

    const margin = { top: 25, right: 60, bottom: 25, left: 60 };

    const width = styleWidth(svg) - margin.left - margin.right,
        height = styleHeight(svg) - margin.top - margin.bottom;

    const defs = svg.append("defs");
    const filter = defs
        .append("filter")
        .attr("id", "textBackground")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 1)
        .attr("height", 1);
    filter.append("feFlood").attr("flood-color", "white");
    filter.append("feComposite").attr("in", "SourceGraphic");

    defs
        .append("clipPath")
        .attr("id", chartKey)
        .append("rect")
        .attr("x", 0)
        .attr("y", -margin.top)
        .attr("width", width)
        .attr("height", margin.top + height + 10);

    svg
        .append("text")
        .attr("x", margin.left + width / 2)
        .attr("y", 15)
        .style("text-anchor", "middle")
        .style("font", "8pt sans-serif")
        .text(chartKey);

    const g = svg
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    const x = d3.scaleTime().range([0, width]);
    const x2 = d3.scaleTime().range([0, width]);
    const y1 = d3.scaleLinear().range([height, 0]);
    const z = d3.scaleOrdinal(d3.schemeCategory10);
    const xFormat = formatTime;

    x.domain([minDate, max.date]);
    x2.domain([minDate, max.date]);
    y1.domain([0, max.opsSec]);

    const xAxis = d3.axisBottom(x).ticks(5);

    g
        .append("g")
        .attr("class", "axis axis--x")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);
    g
        .append("g")
        .attr("class", "axis axis--y")
        .call(d3.axisLeft(y1).ticks(5));

    if (!vals) {
        // That's all we can draw for an empty chart.
        svg
            .append("text")
            .attr("x", margin.left + width / 2)
            .attr("y", margin.top + height / 2)
            .style("text-anchor", "middle")
            .style("font", "8pt sans-serif")
            .text("No data");
        return;
    }

    const view = g
        .append("g")
        .attr("class", "view")
        .attr("clip-path", "url(#" + chartKey + ")");

    const triangle = d3
        .symbol()
        .type(d3.symbolTriangle)
        .size(12);
    view
        .selectAll("path.annotation")
        .data(annotations)
        .enter()
        .append("path")
        .attr("class", "annotation")
        .attr("d", triangle)
        .attr("stroke", "#2b2")
        .attr("fill", "#2b2")
        .attr(
            "transform",
            d => "translate(" + (x(d) + "," + (height + 5) + ")")
        );

    view
        .selectAll("line.annotation")
        .data(annotations)
        .enter()
        .append("line")
        .attr("class", "annotation")
        .attr("fill", "none")
        .attr("stroke", "#2b2")
        .attr("stroke-width", "1px")
        .attr("stroke-dasharray", "1 2")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", 0)
        .attr("y2", height);

    const line1 = d3
        .line()
        .x(d => x(d.date))
        .y(d => y1(d.opsSec));
    const path = view
        .selectAll(".line1")
        .data([vals])
        .enter()
        .append("path")
        .attr("class", "line1")
        .attr("d", line1)
        .style("stroke", d => z(0));

    let line2;
    if (detail) {
        const y2 = d3.scaleLinear().range([height, 0]);
        y2.domain([0, detail(max)]);
        g
            .append("g")
            .attr("class", "axis axis--y")
            .attr("transform", "translate(" + width + ",0)")
            .call(
                d3
                    .axisRight(y2)
                    .ticks(5)
                    .tickFormat(detailFormat)
            );

        line2 = d3
            .line()
            .x(d => x(d.date))
            .y(d => y2(detail(d)));
        const path = view
            .selectAll(".line2")
            .data([vals])
            .enter()
            .append("path")
            .attr("class", "line2")
            .attr("d", line2)
            .style("stroke", d => z(1));
    }

    const updateZoom = function(t) {
        x.domain(t.rescaleX(x2).domain());
        g.select(".axis--x").call(xAxis);
        g.select(".line1").attr("d", line1);
        if (detail) {
            g.select(".line2").attr("d", line2);
        }
        g
            .selectAll("path.annotation")
            .attr(
                "transform",
                d => "translate(" + (x(d) + "," + (height + 5) + ")")
            );
        g
            .selectAll("line.annotation")
            .attr("x1", d => x(d))
            .attr("x2", d => x(d));
    };
    svg.node().updateZoom = updateZoom;

    // This is a bit funky: initDate() initializes the date range to
    // [today-90,today]. We then allow zooming out by 4x which will
    // give a maximum range of 360 days. We limit translation to the
    // 360 day period. The funkiness is that it would be more natural
    // to start at the maximum zoomed amount and then initialize the
    // zoom. But that doesn't work because we want to maintain the
    // existing zoom settings whenever we have to (re-)render().
    const zoom = d3
        .zoom()
        .scaleExtent([0.25, 2])
        .translateExtent([[-width * 3, 0], [width, 1]])
        .extent([[0, 0], [width, 1]])
        .on("zoom", function() {
            const t = d3.event.transform;
            if (!d3.event.sourceEvent) {
                updateZoom(t);
                return;
            }

            d3.selectAll(".chart").each(function() {
                this.updateZoom(t);
            });

            d3.selectAll(".chart").each(function() {
                this.__zoom = t.translate(0, 0);
            });

            const mouse = d3.mouse(this);
            if (mouse && mouse[0]) {
                const mousex = mouse[0] - margin.left;
                d3.selectAll(".chart").each(function() {
                    this.updateMouse(mousex);
                });
            }
        });

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomTransform(svg.node()));

    const lineHover = view
        .append("line")
        .attr("class", "hover")
        .style("fill", "none")
        .style("stroke", "#f99")
        .style("stroke-width", "1px");

    const dateHover = g
        .append("text")
        .attr("class", "hover")
        .attr("fill", "#f22")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "hanging")
        .attr("transform", "translate(0, 0)");

    const opsHover = view
        .append("text")
        .attr("class", "hover")
        .attr("fill", "#f22")
        .attr("text-anchor", "middle")
        .attr("transform", "translate(0, 0)");

    const marker = view
        .append("circle")
        .attr("class", "hover")
        .attr("r", 3)
        .style("opacity", "0")
        .style("stroke", "#f22")
        .style("fill", "#f22");

    svg.node().updateMouse = function(mousex, date) {
        const i = dateBisector(vals, date, 1);
        const v =
            i == vals.length
                ? vals[i - 1]
                : mousex - x(vals[i - 1].date) < x(vals[i].date) - mousex
                    ? vals[i - 1]
                    : vals[i];
        const noData = mousex < x(vals[0].date);

        lineHover
            .attr("x1", mousex)
            .attr("x2", mousex)
            .attr("y1", noData ? height : pathGetY(path.node(), mousex))
            .attr("y2", height);
        marker
            .attr(
                "transform",
                "translate(" + x(v.date) + "," + y1(v.opsSec) + ")"
            )
            .style("opacity", noData ? 0 : 1);
        dateHover
            .attr("transform", "translate(" + mousex + "," + (height + 8) + ")")
            .text(xFormat(date));
        opsHover
            .attr(
                "transform",
                "translate(" + x(v.date) + "," + (y1(v.opsSec) - 7) + ")"
            )
            .style("opacity", noData ? 0 : 1)
            .text(v.opsSec.toFixed(0));
    };

    const rect = svg
        .append("rect")
        .attr("class", "mouse")
        .attr("cursor", "move")
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .attr("width", width)
        .attr("height", height + margin.top + margin.bottom)
        .attr("transform", "translate(" + margin.left + "," + 0 + ")")
        .on("mousemove", function() {
            const mousex = d3.mouse(this)[0];
            const date = x.invert(mousex);

            // TODO(peter):
            // - Allow hovering over the annotation to highlight the
            //   annotation in the list.
            // for (let i in annotations) {
            //     if (equalDay(annotations[i], date)) {
            //         console.log("annotation", formatTime(date));
            //     }
            // }

            d3.selectAll(".chart").each(function() {
                this.updateMouse(mousex, date);
            });
        })
        .on("mouseover", function() {
            d3
                .selectAll(".chart")
                .selectAll(".hover")
                .style("opacity", 1.0);
        })
        .on("mouseout", function() {
            d3
                .selectAll(".chart")
                .selectAll(".hover")
                .style("opacity", 0);
        });
}

function render() {
    d3.selectAll(".chart").each(function(d, i) {
        renderChart(d3.select(this));
    });
}

function initData() {
    for (key in data) {
        data[key] = d3.csvParseRows(data[key], function(d, i) {
            return {
                date: parseTime(d[0]),
                opsSec: +d[1],
                readBytes: +d[2],
                writeBytes: +d[3],
                readAmp: +d[4],
                writeAmp: +d[5]
            };
        });

        const vals = data[key];
        max.opsSec = Math.max(max.opsSec, d3.max(vals, d => d.opsSec));
        max.readBytes = Math.max(max.readBytes, d3.max(vals, d => d.readBytes));
        max.writeBytes = Math.max(
            max.writeBytes,
            d3.max(vals, d => d.writeBytes)
        );
        max.readAmp = Math.max(max.readAmp, d3.max(vals, d => d.readAmp));
        max.writeAmp = Math.max(max.writeAmp, d3.max(vals, d => d.writeAmp));
    }
}

function initDateRange() {
    max.date.setHours(0, 0, 0, 0);
    minDate = new Date(new Date().setDate(max.date.getDate() - 90));
}

function initAnnotations() {
    // TODO(peter):
    // - Allow hovering over the annotation to highlight the
    //   annotation on the charts.
    // - Allow click to show/hide an annotation on the charts.
    d3.selectAll(".annotation").each(function() {
        const annotation = d3.select(this);
        const date = parseTime(annotation.attr("data-date"));
        annotation
            .append("span")
            .attr("class", "date")
            .lower()
            .text(formatTime(date) + ": ");
        annotations.push(date);
    });
}

function setQueryParams() {
    var params = new URLSearchParams();
    if (detailName) {
        params.set("detail", detailName);
    }
    var search = "?" + params;
    if (window.location.search != search) {
        window.history.pushState(null, null, search);
    }
}

function setDetail(name) {
    detail = undefined;
    detailFormat = undefined;
    detailName = name;

    switch (detailName) {
        case "readBytes":
            detail = d => d.readBytes;
            detailFormat = humanize;
            break;
        case "writeBytes":
            detail = d => d.writeBytes;
            detailFormat = humanize;
            break;
        case "readAmp":
            detail = d => d.readAmp;
            detailFormat = d3.format(",.1f");
            break;
        case "writeAmp":
            detail = d => d.writeAmp;
            detailFormat = d3.format(",.1f");
            break;
    }

    d3.selectAll(".toggle").classed("selected", false);
    d3.select("#" + detailName).classed("selected", detail != null);
}

function initQueryParams() {
    var params = new URLSearchParams(window.location.search.substring(1));
    setDetail(params.get("detail"));
}

function toggleDetail(name) {
    const link = d3.select("#" + name);
    const selected = !link.classed("selected");
    link.classed("selected", selected);
    if (selected) {
        setDetail(name);
    } else {
        setDetail(null);
    }
    setQueryParams();
    render();
}

window.onload = function init() {
    d3.selectAll(".toggle").each(function() {
        const link = d3.select(this);
        link.attr("href", 'javascript:toggleDetail("' + link.attr("id") + '")');
    });

    initData();
    initDateRange();
    initAnnotations();
    initQueryParams();
    render();
};

window.onpopstate = function() {
    console.log("onpopstate");
    initQueryParams();
    render();
};

window.addEventListener("resize", render);
