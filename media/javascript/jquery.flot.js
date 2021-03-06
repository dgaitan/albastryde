/* Javascript plotting library for jQuery, v. 0.5.
 *
 * Released under the MIT license by IOLA, December 2007.
 *
 */

one_pi=Math.PI;
two_pi=2*Math.PI;

(function($) {
    function Plot(target_, data_, options_) {
        // data is on the form:
        //   [ series1, series2 ... ]
        // where series is either just the data as [ [x1, y1], [x2, y2], ... ]
        // or { data: [ [x1, y1], [x2, y2], ... ], label: "some label" }
        
        var series = [],
            options = {
                // the color theme used for graphs
                colors: ["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"],
                legend: {
                    show: true,
                    noColumns: 1, // number of colums in legend table
                    labelFormatter: null, // fn: string -> string
                    labelBoxBorderColor: "#ccc", // border color for the little label boxes
                    container: null, // container (as jQuery object) to put legend in, null means default on top of graph
                    position: "ne", // position of default legend container within plot
                    margin: 5, // distance from grid edge to default legend container within plot
                    backgroundColor: null, // null means auto-detect
                    backgroundOpacity: 0.85 // set to 0 to avoid background
                },
                xaxis: [{
                    mode: null, // null or "time" or "unixtime"
                    min: null, // min. value to show, null means set automatically
                    max: null, // max. value to show, null means set automatically
                    autoscaleMargin: null, // margin in % to add if auto-setting min/max
                    ticks: null, // either [1, 3] or [[1, "a"], 3] or (fn: axis info -> ticks) or app. number of ticks for auto-ticks
                    tickFormatter: null, // fn: number -> string
                    labelWidth: null, // size of tick labels in pixels
                    labelHeight: null,
                    
                    // mode specific options
                    tickDecimals: null, // no. of decimals, null means auto
                    tickSize: null, // number or [number, "unit"]
                    minTickSize: null, // number or [number, "unit"]
                    monthNames: null, // list of names of months
                    timeformat: null // format string to use
                },
                {
                    autoscaleMargin: null
                }],
                yaxis: [
		{
                    autoscaleMargin: 0.02
                },
		{
                    autoscaleMargin: 0.02
                },
                {
                    autoscaleMargin: 0.02
                }],              
                points: {
                    show: false,
		    drawCall: false,
                    radius: 3,
                    lineWidth: 2, // in pixels
                    fill: true,
                    fillColor: "#ffffff"
                },
                lines: {
                    // we don't put in show: false so we can see
                    // whether the user actively disabled lines
                    lineWidth: 2, // in pixels
                    fill: false,
                    fillColor: null
                },
                bars: {
                    show: false,
                    lineWidth: 2, // in pixels
                    barWidth: 1, // in units of the x axis
                    fill: true,
                    fillColor: null,
                    align: "left" // or "center"
                },
                grid: {
                    color: "#545454", // primary color used for outline and labels
                    backgroundColor: null, // null for transparent, else color
                    tickColor: "#dddddd", // color used for the ticks
                    labelMargin: 5, // in pixels
                    borderWidth: 2, // in pixels
                    borderColor: null, // set if different from the grid color
                    markings: null, // array of ranges or fn: axes -> array of ranges
                    markingsColor: "#f4f4f4",
                    markingsLineWidth: 2,
                    // interactive stuff
                    clickable: false,
                    hoverable: false,
                    autoHighlight: true, // highlight in case mouse is near
                    mouseActiveRadius: 10 // how far the mouse can be away to activate an item
                },
                selection: {
                    mode: null, // one of null, "x", "y" or "xy"
                    color: "#e8cfac"
                },
                crosshair: {
                    mode: null, // one of null, "x", "y" or "xy",
                    color: "#aa0000"
                },
                shadowSize: 4
            },
        canvas = null,      // the canvas for the plot itself
        overlay = null,     // canvas for interactive stuff on top of plot
        eventHolder = null, // jQuery object that events should be bound to
        ctx = null, octx = null,
        target = $(target_),
        axes = { xaxis: [{},{}], yaxis: [{},{},{}] },
        plotOffset = { left: 0, right: 0, top: 0, bottom: 0},
        canvasWidth = 0, canvasHeight = 0,
        plotWidth = 0, plotHeight = 0,
        // dedicated to storing data for buggy standard compliance cases
        workarounds = {};
        
        this.setData = setData;
        this.setupGrid = setupGrid;
        this.draw = draw;
        this.clearSelection = clearSelection;
        this.setSelection = setSelection;
        this.getCanvas = function() { return canvas; };
        this.getPlotOffset = function() { return plotOffset; };
        this.getData = function() { return series; };
        this.getAxes = function() { return axes; };
        this.setCrosshair = setCrosshair;
        this.clearCrosshair = function () { setCrosshair(null); };
        this.highlight = highlight;
        this.unhighlight = unhighlight;
        
        // initialize
        parseOptions(options_);
        setData(data_);
        constructCanvas();
        setupGrid();
        draw();


        function setData(d) {
            series = parseData(d);

            fillInSeriesOptions();
            processData();
        }
        
        function parseData(d) {
            var res = [];
            for (var i = 0; i < d.length; ++i) {
                var s;
                if (d[i].data) {
                    s = {};
                    for (var v in d[i])
                        s[v] = d[i][v];
                }
                else {
                    s = { data: d[i] };
                }
                res.push(s);
            }

            return res;
        }
        
        function parseOptions(o) {
            $.extend(true, options, o);
            if (options.grid.borderColor == null)
                options.grid.borderColor = options.grid.color
            // backwards compatibility, to be removed in future
            if (options.xaxis[0].noTicks && options.xaxis[0].ticks == null)
                options.xaxis[0].ticks = options.xaxis[0].noTicks;
            if (options.yaxis[0].noTicks && options.yaxis[0].ticks == null)
                options.yaxis[0].ticks = options.yaxis[0].noTicks;
            if (options.grid.coloredAreas)
                options.grid.markings = options.grid.coloredAreas;
            if (options.grid.coloredAreasColor)
                options.grid.markingsColor = options.grid.coloredAreasColor;
        }

        function fillInSeriesOptions() {
            var i;
            
            // collect what we already got of colors
            var neededColors = series.length,
                usedColors = [],
                assignedColors = [];
            for (i = 0; i < series.length; ++i) {
                var sc = series[i].color;
                if (sc != null) {
                    --neededColors;
                    if (typeof sc == "number") {
                        assignedColors.push(sc);
			series[i].color_number=sc;	
                    } else {
                        usedColors.push(parseColor(series[i].color));
		    } 
               }
            }
            
            // we might need to generate more colors if higher indices
            // are assigned
            for (i = 0; i < assignedColors.length; ++i) {
                neededColors = Math.max(neededColors, assignedColors[i] + 1);
            }

            // produce colors as needed
            var colors = [], variation = 0;
            i = 0;
            while (colors.length < neededColors) {
                var c;
                if (options.colors.length == i) // check degenerate case
                    c = new Color(100, 100, 100);
                else
                    c = parseColor(options.colors[i]);

                // vary color if needed
                var sign = variation % 2 == 1 ? -1 : 1;
                var factor = 1 + sign * Math.ceil(variation / 2) * 0.2;
                c.scale(factor, factor, factor);

                // FIXME: if we're getting to close to something else,
                // we should probably skip this one
                colors.push(c);
                
                ++i;
                if (i >= options.colors.length) {
                    i = 0;
                    ++variation;
                }
            }

            // fill in the options
            var colori = 0, s;
            for (i = 0; i < series.length; ++i) {
                s = series[i];

                // assign colors
                if (s.color == null) {
                    s.color = colors[colori].toString();
                    ++colori;
                }
                else if (typeof s.color == "number")
                    s.color = colors[s.color].toString();

                // copy the rest
                s.lines = $.extend(true, {}, options.lines, s.lines);
                s.points = $.extend(true, {}, options.points, s.points);
                s.bars = $.extend(true, {}, options.bars, s.bars);

		// turn on series in case nothing is set
		if (s.show == null)
		    s.show = true;
		// turn off checkboxes in legend in case nothing is set
		if (s.legend == null)
		    s.legend = {};
		if (s.legend.checkboxes == null)
		    s.legend.checkboxes = false;

                // turn on lines automatically in case nothing is set
                if (s.lines.show == null && !s.bars.show && !s.points.show)
                    s.lines.show = true;
                if (s.shadowSize == null)
                    s.shadowSize = options.shadowSize;

//                if (s.xaxis == 1)
//                    s.xaxis = axes.xaxis[0];
//                else if (s.xaxis == 2)
//                    s.xaxis = axes.xaxis[1];

		if (s.xaxis) {
		    if (s.xaxis > axes.xaxis.length) {
			for (var f=axes.xaxis.length;f<s.xaxis;f++) {
			    axes.xaxis[f]={};
			}
		    }
		    if (s.xaxis > options.xaxis.length) {
			for (var f=options.xaxis.length;f<s.xaxis;f++) {
			    options.xaxis[f]={};
			}
		    }
		    s.xaxis=axes.xaxis[s.xaxis-1];
                } else {
                    s.xaxis = axes.xaxis[0];
		}

		if (s.yaxis) {
		    if (s.yaxis > axes.yaxis.length) {
			for (var f=axes.yaxis.length;f<s.yaxis;f++) {
			    axes.yaxis[f]={};
			}
		    }
		    if (s.yaxis > options.yaxis.length) {
			for (var f=options.yaxis.length;f<s.yaxis;f++) {
			    lastOptions=options.yaxis[options.yaxis.length-1];
			//    options.yaxis[f]=lastOptions.clone();
			    options.yaxis[f] = $.extend(true, {}, lastOptions);
			}
		    }
		    s.yaxis=axes.yaxis[s.yaxis-1];
                } else {
                    s.yaxis = axes.yaxis[0];
		}

//                if (!s.yaxis)
//                    s.yaxis = axes.yaxis[0];

//                if (s.yaxis == 1)
//                    s.yaxis = axes.yaxis[0];
//                else if (s.yaxis == 2)
//                    s.yaxis = axes.yaxis[1];
//		else {
//		    eval('axes.y'+String(s.yaxis)+'axis={};');
//		    eval('s.yaxis=axes.y'+String(s.yaxis)+'axis;');
//		}
	
            }
        }
        
        function processData() {
            var topSentry = Number.POSITIVE_INFINITY,
                bottomSentry = Number.NEGATIVE_INFINITY,
                axis;

            for (axis in axes.xaxis) {
                axes.xaxis[axis].datamin = topSentry;
                axes.xaxis[axis].datamax = bottomSentry;
                axes.xaxis[axis].min = options.xaxis[axis].min;
                axes.xaxis[axis].max = options.xaxis[axis].max;		    
                axes.xaxis[axis].used = false;
            }
            for (axis in axes.yaxis) {
                axes.yaxis[axis].datamin = topSentry;
                axes.yaxis[axis].datamax = bottomSentry;
                axes.yaxis[axis].min = options.yaxis[axis].min;
                axes.yaxis[axis].max = options.yaxis[axis].max;
                axes.yaxis[axis].used = false;
            }
            
            for (var i = 0; i < series.length; ++i) {
	      if (series[i].show) {
                var data = series[i].data,
                    axisx = series[i].xaxis,
                    axisy = series[i].yaxis,
                    mindelta = 0, maxdelta = 0;
                
                if (series[i].bars.show) {
                    // make sure we got room for the bar
                    mindelta = series[i].bars.align == "left" ? 0 : -series[i].bars.barWidth/2;
                    maxdelta = mindelta + series[i].bars.barWidth;
                }

                axisx.used = axisy.used = true;
                
                for (var j = 0; j < data.length; ++j) {
                    if (data[j] == null)
                        continue;
                    
//interval                    var x = data[j][0], y = data[j][1];
                    var xMin, xMax, y = data[j][1];
		    xMin = (typeof(data[j][0])=='object') ? data[j][0][0] : data[j][0];  
		    xMax = (typeof(data[j][0])=='object') ? data[j][0][1] : data[j][0];  
//interval end
                    // convert to number
//                    if (x != null && !isNaN(x = +x)) {
//                        if (x + mindelta < axisx.datamin)
//                            axisx.datamin = x + mindelta;
//                        if (x + maxdelta > axisx.datamax)
//                           axisx.datamax = x + maxdelta;
//interval                    }
                    if (xMin != null && !isNaN(xMin = +xMin) && xMax != null && !isNaN(xMax = +xMax)) {
                        if (xMin + mindelta < axisx.datamin)
                            axisx.datamin = xMin + mindelta;
                        if (xMax + maxdelta > axisx.datamax)
                            axisx.datamax = xMax + maxdelta;
                    }
//interval end                    
                    if (y != null && !isNaN(y = +y)) {
                        if (y < axisy.datamin)
                            axisy.datamin = y;
                        if (y > axisy.datamax)
                            axisy.datamax = y;
                    }
                    
//interval                    if (x == null || y == null || isNaN(x) || isNaN(y))
                    if (xMin == null || xMax == null || y == null || isNaN(xMin) || isNaN(xMax) || isNaN(y))
                        data[j] = null; // mark this point as invalid
                }
	      } 
            }

            for (axis in axes) {
                if (axes[axis].datamin == topSentry)
                    axes[axis].datamin = 0;
                if (axes[axis].datamax == bottomSentry)
                    axes[axis].datamax = 1;
            }
        }

        function constructCanvas() {
            function makeCanvas(width, height) {
                var c = document.createElement('canvas');
                c.width = width;
                c.height = height;
                if ($.browser.msie) // excanvas hack
                    c = window.G_vmlCanvasManager.initElement(c);
                return c;
            }
            
            if ($.browser.msie) // excanvas hack
 	        window.G_vmlCanvasManager.init_(document); // make sure everything is setup

            canvasWidth = target.width();
            canvasHeight = target.height();
            target.html(""); // clear target
            if (target.css("position") == 'static')
                target.css("position", "relative"); // for positioning labels and overlay

            if (canvasWidth <= 0 || canvasHeight <= 0)
               throw "Invalid dimensions for plot, width = " + canvasWidth + ", height = " + canvasHeight;


            // the canvas
            canvas = $(makeCanvas(canvasWidth, canvasHeight)).appendTo(target).get(0);
            ctx = canvas.getContext("2d");

            // overlay canvas for interactive features
            overlay = $(makeCanvas(canvasWidth, canvasHeight)).css({ position: 'absolute', left: 0, top: 0 }).appendTo(target).get(0);
            octx = overlay.getContext("2d");

            // we include the canvas in the event holder too, because IE 7
            // sometimes has trouble with the stacking order
            eventHolder = $([overlay, canvas]);

            // bind events
            if (options.selection.mode != null || options.crosshair.mode != null
                || options.grid.hoverable) {
                // FIXME: temp. work-around until jQuery bug 1871 is fixed
                eventHolder.each(function () {
                    this.onmousemove = onMouseMove;
                });

                if (options.selection.mode != null)
                    eventHolder.mousedown(onMouseDown);
            }

            if (options.crosshair.mode != null)
                eventHolder.mouseout(onMouseOut);
            
            if (options.grid.clickable)
                eventHolder.click(onClick);
        }

        function setupGrid() {
            function setupAxis(axis, options, direction) {
                setRange(axis, options);
                prepareTickGeneration(axis, options);
                setTicks(axis, options);
                // add transformation helpers
                if (direction == 'horizontal') {
                    // data point to canvas coordinate
                    axis.p2c = function (p) { return (p - axis.min) * axis.scale; };
                    // canvas coordinate to data point 
                    axis.c2p = function (c) { return axis.min + c / axis.scale; };
                }
                else {
                    axis.p2c = function (p) { return (axis.max - p) * axis.scale; };
                    axis.c2p = function (p) { return axis.max - p / axis.scale; };
                }
            }

            for (var axis in axes.xaxis)
                setupAxis(axes.xaxis[axis], options.xaxis[axis],'horizontal');

            for (var axis in axes.yaxis)
                setupAxis(axes.yaxis[axis], options.yaxis[axis],'vertical');

            setSpacing();
            insertLabels();
            insertLegend();
        }
        
        function setRange(axis, axisOptions) {
            var min = axisOptions.min != null ? +axisOptions.min : axis.datamin;
            var max = axisOptions.max != null ? +axisOptions.max : axis.datamax;

            if (max - min == 0.0) {
                // degenerate case
                var widen = max == 0 ? 1 : 0.01;

                if (axisOptions.min == null)
                    min -= widen;
                // alway widen max if we couldn't widen min to ensure we
                // don't fall into min == max which doesn't work
                if (axisOptions.max == null || axisOptions.min != null)
                    max += widen;
            }
            else {
                // consider autoscaling
                var margin = axisOptions.autoscaleMargin;
                if (margin != null) {
                    if (axisOptions.min == null) {
                        min -= (max - min) * margin;
                        // make sure we don't go below zero if all values
                        // are positive
                        if (min < 0 && axis.datamin >= 0)
                            min = 0;
                    }
                    if (axisOptions.max == null) {
                        max += (max - min) * margin;
                        if (max > 0 && axis.datamax <= 0)
                            max = 0;
                    }
                }
            }
            axis.min = min;
            axis.max = max;
        }

        function prepareTickGeneration(axis, axisOptions) {
            // estimate number of ticks
            var noTicks;
            if (typeof axisOptions.ticks == "number" && axisOptions.ticks > 0)
                noTicks = axisOptions.ticks;
            else if (axis in axes.xaxis)
                noTicks = canvasWidth / 100;
            else
                noTicks = canvasHeight / 100;
            
// 60 is correct was not working
            var delta = (axis.max - axis.min) / noTicks;
            var size, generator, unit, formatter, i, magn, norm;

            if ((axisOptions.mode == "time") || (axisOptions.mode == "unixtime")){
                // pretty handling of time
		var timefactor;
		if (axisOptions.mode == "unixtime") {
                    timefactor=1000;
		} else {
                    timefactor=1;
		}
                // map of app. size of time units in milliseconds
                var timeUnitSize = {
                        "second": 1000/timefactor,
                        "minute": 60 * 1000/timefactor,
                        "hour": 60 * 60 * 1000/timefactor,
                        "day": 24 * 60 * 60 * 1000/timefactor,
                        "month": 30 * 24 * 60 * 60 * 1000/timefactor,
                        "year": 365.2425 * 24 * 60 * 60 * 1000/timefactor
                    };
                // the allowed tick sizes, after 1 year we use
                // an integer algorithm
                var spec = [
                    [1, "second"], [2, "second"], [5, "second"], [10, "second"],
                    [30, "second"], 
                    [1, "minute"], [2, "minute"], [5, "minute"], [10, "minute"],
                    [30, "minute"], 
                    [1, "hour"], [2, "hour"], [4, "hour"],
                    [8, "hour"], [12, "hour"],
                    [1, "day"], [2, "day"], [3, "day"],
                    [0.25, "month"], [0.5, "month"], [1, "month"],
                    [2, "month"], [3, "month"], [6, "month"],
                    [1, "year"]
                ];

                var minSize = 0;
                if (axisOptions.minTickSize != null) {
                    if (typeof axisOptions.tickSize == "number")
                        minSize = axisOptions.tickSize;
                    else
                        minSize = axisOptions.minTickSize[0] * timeUnitSize[axisOptions.minTickSize[1]];
                }
		delta=Math.round(delta);
                for (i = 0; i < spec.length - 1; ++i)
                    if (delta < (spec[i][0] * timeUnitSize[spec[i][1]]
                                 + spec[i + 1][0] * timeUnitSize[spec[i + 1][1]]) / 2
                       && spec[i][0] * timeUnitSize[spec[i][1]] >= minSize)
                        break;

                size = spec[i][0];
                unit = spec[i][1];
                
                // special-case the possibility of several years
                if (unit == "year") {
                    magn = Math.pow(10, Math.floor(Math.log(delta / timeUnitSize.year) / Math.LN10));
                    norm = (delta / timeUnitSize.year) / magn;
                    if (norm < 1.5)
                        size = 1;
                    else if (norm < 3)
                        size = 2;
                    else if (norm < 7.5)
                        size = 5;
                    else
                        size = 10;

                    size *= magn;
                }

                if (axisOptions.tickSize) {
                    size = axisOptions.tickSize[0];
                    unit = axisOptions.tickSize[1];
                }
                generator = function(axis) {
                    var ticks = [],
		        tickSize=axis.tickSize[0],
                        unit = axis.tickSize[1],
                        d = new Date(axis.min*timefactor);
                    var step = tickSize * timeUnitSize[unit];
                    if (unit == "second")
                        d.setUTCSeconds(floorInBase(d.getUTCSeconds(), tickSize));
                    if (unit == "minute")
                        d.setUTCMinutes(floorInBase(d.getUTCMinutes(), tickSize));
                    if (unit == "hour")
                        d.setUTCHours(floorInBase(d.getUTCHours(), tickSize));
                    if (unit == "month")
                        d.setUTCMonth(floorInBase(d.getUTCMonth(), tickSize));
                    if (unit == "year")
                        d.setUTCFullYear(floorInBase(d.getUTCFullYear(), tickSize));
                    
                    // reset smaller components
                    d.setUTCMilliseconds(0);
                    if (step >= timeUnitSize.minute)
                        d.setUTCSeconds(0);
                    if (step >= timeUnitSize.hour)
                        d.setUTCMinutes(0);
                    if (step >= timeUnitSize.day)
                        d.setUTCHours(0);
                    if (step >= timeUnitSize.day * 4)
                        d.setUTCDate(1);
                    if (step >= timeUnitSize.year)
                        d.setUTCMonth(0);

                    var carry = 0, v = Number.NaN, prev;
                    do {
                        prev = v;
                        v = d.getTime();
                        ticks.push({ v: Math.round(v/timefactor), label: axis.tickFormatter(v, axis) });
                        if (unit == "month") {
                            if (tickSize < 1) {
                                // a bit complicated - we'll divide the month
                                // up but we need to take care of fractions
                                // so we don't end up in the middle of a day
                                d.setUTCDate(1);
                                var start = d.getTime();
                                d.setUTCMonth(d.getUTCMonth() + 1);
                                var end = d.getTime();
                                d.setTime(v + carry * timeUnitSize.hour + (end - start) * tickSize);
                                carry = d.getUTCHours();
                                d.setUTCHours(0);
                            }
                            else
                                d.setUTCMonth(d.getUTCMonth() + tickSize);
                        }
                        else if (unit == "year") {
                            d.setUTCFullYear(d.getUTCFullYear() + tickSize);
                        }
                        else {
                            d.setTime(v + (step*timefactor));
			}
                    } while (v < axis.max*timefactor && v != prev);
                    return ticks;
                };

                formatter = function (v, axis) {
                    var d = new Date(v);
                    // first check global format
                    if (axisOptions.timeformat != null)
                        return $.plot.formatDate(d, axisOptions.timeformat, axisOptions.monthNames);
                    
                    var t = axis.tickSize[0] * timeUnitSize[axis.tickSize[1]];
                    var span = axis.max - axis.min;
                    
                    if (t < timeUnitSize.minute)
                        fmt = "%h:%M:%S";
                    else if (t < timeUnitSize.day) {
                        if (span < 2 * timeUnitSize.day)
                            fmt = "%h:%M";
                        else
                            fmt = "%b %d %h:%M";
                    }
                    else if (t < timeUnitSize.month)
                        fmt = "%b %d";
                    else if (t < timeUnitSize.year) {
                        if (span < timeUnitSize.year)
                            fmt = "%b";
                        else
                            fmt = "%b %y";
                    }
                    else
                        fmt = "%y";
                   
                    return $.plot.formatDate(d, fmt, axisOptions.monthNames);
                };
            }
            else {
                // pretty rounding of base-10 numbers
                var maxDec = axisOptions.tickDecimals;
                var dec = -Math.floor(Math.log(delta) / Math.LN10);
                if (maxDec != null && dec > maxDec)
                    dec = maxDec;
                
                magn = Math.pow(10, -dec);
                norm = delta / magn; // norm is between 1.0 and 10.0
                
                if (norm < 1.5)
                    size = 1;
                else if (norm < 3) {
                    size = 2;
                    // special case for 2.5, requires an extra decimal
                    if (norm > 2.25 && (maxDec == null || dec + 1 <= maxDec)) {
                        size = 2.5;
                        ++dec;
                    }
                }
                else if (norm < 7.5)
                    size = 5;
                else
                    size = 10;

                size *= magn;
                
                if (axisOptions.minTickSize != null && size < axisOptions.minTickSize)
                    size = axisOptions.minTickSize;

                if (axisOptions.tickSize != null)
                    size = axisOptions.tickSize;
                
                axis.tickDecimals = Math.max(0, (maxDec != null) ? maxDec : dec);
                
                generator = function (axis) {
                    var ticks = [];

                    // spew out all possible ticks
                    var start = floorInBase(axis.min, axis.tickSize),
                        i = 0, v = Number.NaN, prev;
                    do {
                        prev = v;
                        v = start + i * axis.tickSize;
                        ticks.push({ v: v, label: axis.tickFormatter(v, axis) });
                        ++i;
                    } while (v < axis.max && v != prev);
                    return ticks;
                };

                formatter = function (v, axis) {
                    return v.toFixed(axis.tickDecimals);
                };
            }

            axis.tickSize = unit ? [size, unit] : size;
            axis.tickGenerator = generator;
            if ($.isFunction(axisOptions.tickFormatter))
                axis.tickFormatter = function (v, axis) { return "" + axisOptions.tickFormatter(v, axis); };
            else
                axis.tickFormatter = formatter;
            if (axisOptions.labelWidth != null)
                axis.labelWidth = axisOptions.labelWidth;
            if (axisOptions.labelHeight != null)
                axis.labelHeight = axisOptions.labelHeight;
        }
        function setTicks(axis, axisOptions) {
            axis.ticks = [];
            if (!axis.used)
                return;
            if (axisOptions.ticks == null)
                axis.ticks = axis.tickGenerator(axis);
            else if (typeof axisOptions.ticks == "number") {
                if (axisOptions.ticks > 0)
                    axis.ticks = axis.tickGenerator(axis);
            }
            else if (axisOptions.ticks) {
                var ticks = axisOptions.ticks;

                if ($.isFunction(ticks))
                    // generate the ticks
                    ticks = ticks({ min: axis.min, max: axis.max });
                
                // clean up the user-supplied ticks, copy them over
                var i, v;
                for (i = 0; i < ticks.length; ++i) {
                    var label = null;
                    var t = ticks[i];
                    if (typeof t == "object") {
                        v = t[0];
                        if (t.length > 1)
                            label = t[1];
                    }
                    else
                        v = t;
                    if (label == null)
                        label = axis.tickFormatter(v, axis);
                    axis.ticks[i] = { v: v, label: label };
                }
            }

            if (axisOptions.autoscaleMargin != null && axis.ticks.length > 0) {
                // snap to ticks
                if (axisOptions.min == null)
                    axis.min = Math.min(axis.min, axis.ticks[0].v);
                if (axisOptions.max == null && axis.ticks.length > 1)
                    axis.max = Math.min(axis.max, axis.ticks[axis.ticks.length - 1].v);
            }
        }
        
        function setSpacing() {
            function measureXLabels(axis) {
                // to avoid measuring the widths of the labels, we
                // construct fixed-size boxes and put the labels inside
                // them, we don't need the exact figures and the
                // fixed-size box content is easy to center
                if (axis.labelWidth == null)
                    axis.labelWidth = canvasWidth / 6;

                // measure x label heights
                if (axis.labelHeight == null) {
                    labels = [];
                    for (i = 0; i < axis.ticks.length; ++i) {
                        l = axis.ticks[i].label;
                        if (l)
                            labels.push('<div class="tickLabel" style="float:left;width:' + axis.labelWidth + 'px">' + l + '</div>');
                    }
                    
                    axis.labelHeight = 0;
                    if (labels.length > 0) {
                        var dummyDiv = $('<div style="position:absolute;top:-10000px;width:10000px;font-size:smaller">'
                                         + labels.join("") + '<div style="clear:left"></div></div>').appendTo(target);
                        axis.labelHeight = dummyDiv.height();
                        dummyDiv.remove();
                    }
                }
            }
            
            function measureYLabels(axis) {
                if (axis.labelWidth == null || axis.labelHeight == null) {
                    var i, labels = [], l;
                    // calculate y label dimensions
                    for (i = 0; i < axis.ticks.length; ++i) {
                        l = axis.ticks[i].label;
                        if (l)
                            labels.push('<div class="tickLabel">' + l + '</div>');
                    }
                    
                    if (labels.length > 0) {
                        var dummyDiv = $('<div style="position:absolute;top:-10000px;font-size:smaller">'
                                         + labels.join("") + '</div>').appendTo(target);
                        if (axis.labelWidth == null)
                            axis.labelWidth = dummyDiv.width();
                        if (axis.labelHeight == null)
                            axis.labelHeight = dummyDiv.find("div").height();
                        dummyDiv.remove();
                    }
                    
                    if (axis.labelWidth == null)
                        axis.labelWidth = 0;
                    if (axis.labelHeight == null)
                        axis.labelHeight = 0;
                }
            }
            for (i in axes.xaxis) {
	            measureXLabels(axes.xaxis[i]);
	    }
            for (i in axes.yaxis) {
	            measureYLabels(axes.yaxis[i]);
	    }

//            measureXLabels(axes.xaxis[0]);
//            measureYLabels(axes.yaxis[0]);
//            measureXLabels(axes.xaxis[1]);
//            measureYLabels(axes.yaxis[1]);

            // get the most space needed around the grid for things
            // that may stick out
            var maxOutset = options.grid.borderWidth;
            for (i = 0; i < series.length; ++i) {
                maxOutset = Math.max(maxOutset, 2 * (series[i].points.radius + series[i].points.lineWidth/2));
	    }

            plotOffset.left = plotOffset.right = plotOffset.top = plotOffset.bottom = maxOutset;

            var margin = options.grid.labelMargin + options.grid.borderWidth;

	    var halfXgraphs=parseInt((axes.xaxis.length/2),10);

	    var totalLabelBottom = totalLabelTop = totalLabelRight = totalLabelLeft = 0;

	    for (i = 0; i < halfXgraphs; i++) {
		totalLabelBottom += axes.xaxis[i].labelHeight + margin;
	    }
            
	    for (i = halfXgraphs; i < axes.xaxis.length; i++) {
		totalLabelTop += axes.xaxis[i].labelHeight + margin;
	    }            

	    if (totalLabelBottom > 0) 
		plotOffset.bottom = Math.max(maxOutset, totalLabelBottom);

	    if (totalLabelTop > 0)
		plotOffset.top = Math.max(maxOutset, totalLabelTop);

//            if (axes.xaxis[0].labelHeight > 0)
//                plotOffset.bottom = Math.max(maxOutset, axes.xaxis[0].labelHeight + margin);

//            if (axes.xaxis[1].labelHeight > 0)
//                plotOffset.top = Math.max(maxOutset, axes.xaxis[1].labelHeight + margin);

	    var halfYgraphs=parseInt((axes.yaxis.length/2),10);

	    for (i = 0; i < halfYgraphs; i++) {
		totalLabelLeft += axes.yaxis[i].labelWidth + margin;
	    }
            
	    for (i = halfYgraphs; i < axes.yaxis.length; i++) {
		totalLabelRight += axes.yaxis[i].labelWidth + margin;
	    }            

	    if (totalLabelLeft > 0)
		plotOffset.left = Math.max(maxOutset, totalLabelLeft);

	    if (totalLabelRight > 0)
		plotOffset.right = Math.max(maxOutset, totalLabelRight);

//            if (axes.yaxis[0].labelWidth > 0)
//               plotOffset.left = Math.max(maxOutset, axes.yaxis[0].labelWidth + margin);
            
//            if (axes.yaxis[1].labelWidth > 0)
//                plotOffset.right = Math.max(maxOutset, axes.yaxis[1].labelWidth + margin);


            plotWidth = canvasWidth - plotOffset.left - plotOffset.right;
            plotHeight = canvasHeight - plotOffset.bottom - plotOffset.top;

            // precompute how much the axis is scaling a point in canvas space
            for (i in axes.xaxis) {
 	           axes.xaxis[i].scale = plotWidth / (axes.xaxis[i].max - axes.xaxis[i].min);
	    }
            for (i in axes.yaxis) {
 	           axes.yaxis[i].scale = plotHeight / (axes.yaxis[i].max - axes.yaxis[i].min);
	    }

//            axes.xaxis[0].scale = plotWidth / (axes.xaxis[0].max - axes.xaxis[0].min);
//            axes.yaxis[0].scale = plotHeight / (axes.yaxis[0].max - axes.yaxis[0].min);
//            axes.xaxis[1].scale = plotWidth / (axes.xaxis[1].max - axes.xaxis[1].min);
//            axes.yaxis[1].scale = plotHeight / (axes.yaxis[1].max - axes.yaxis[1].min);
        }
        
        function draw() {
            drawGrid();
            for (var i = 0; i < series.length; i++) {
                drawSeries(series[i]);
            }
        }

        function extractRange(ranges, coord) {
	    var	direction=coord+'axis',
                axis, from, to, reverse;

	    for (i = 0 ; i < axes[direction].length ; i++) {
                if (ranges[direction][i]) {
                    axis = axes[direction][i];
                    from = ranges[direction][i].from;
                    to = ranges[direction][i].to;
		    break;
                }
	    }
//            else if (ranges[direction][secondaryAxis]) {
//                axis = axes[direction][secondaryAxis];
//                from = ranges[direction][secondaryAxis].from;
//                to = ranges[direction][secondaryAxis].to;
//            }
//            else {
//                // backwards-compat stuff - to be removed in future
//                axis = axes[direction][firstAxis];
//                from = ranges[coord + "1"];
//                to = ranges[coord + "2"];
//            }

            // auto-reverse as an added bonus
            if (from != null && to != null && from > to)
                return { from: to, to: from, axis: axis };
            
            return { from: from, to: to, axis: axis };
        }
        
        function drawGrid() {
            var i;
            
            ctx.save();
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.translate(plotOffset.left, plotOffset.top);

            // draw background, if any
            if (options.grid.backgroundColor) {
                ctx.fillStyle = getColorOrGradient(options.grid.backgroundColor, plotHeight, 0, "rgba(255, 255, 255, 0)");
                ctx.fillRect(0, 0, plotWidth, plotHeight);
            }

            // draw markings
            var markings = options.grid.markings;
            if (markings) {
                if ($.isFunction(markings))
                    // xmin etc. are backwards-compatible, to be removed in future
//                    markings = markings({ xmin: axes.xaxis[0].min, xmax: axes.xaxis[0].max, ymin: axes.yaxis[0].min, ymax: axes.yaxis[0].max, xaxis: [axes.xaxis[0],axes.xaxis[1]], yaxis: [axes.yaxis[0],axes.yaxis[1]] });
//                    markings = markings({ xmin: axes.xaxis[0].min, xmax: axes.xaxis[0].max, ymin: axes.yaxis[0].min, ymax: axes.yaxis[0].max, xaxis: [], yaxis: [] });
                    markings = markings({ xaxis: axes.xaxis, yaxis: axes.yaxis });

//		for (i=0; i< axes.xaxis.length; i++) {
//		    markings.xaxis.push(axes.xaxis[i]);
//		}

//		for (i=0; i< axes.yaxis.length; i++) {
//		    markings.yaxis.push(axes.yaxis[i]);
//		}

                for (i = 0; i < markings.length; ++i) {
                    var m = markings[i],
                        xrange = extractRange(m, "x"),
                        yrange = extractRange(m, "y");

                    // fill in missing
                    if (xrange.from == null)
                        xrange.from = xrange.axis.min;
                    if (xrange.to == null)
                        xrange.to = xrange.axis.max;
                    if (yrange.from == null)
                        yrange.from = yrange.axis.min;
                    if (yrange.to == null)
                        yrange.to = yrange.axis.max;

                    // clip
                    if (xrange.to < xrange.axis.min || xrange.from > xrange.axis.max ||
                        yrange.to < yrange.axis.min || yrange.from > yrange.axis.max)
                        continue;

                    xrange.from = Math.max(xrange.from, xrange.axis.min);
                    xrange.to = Math.min(xrange.to, xrange.axis.max);
                    yrange.from = Math.max(yrange.from, yrange.axis.min);
                    yrange.to = Math.min(yrange.to, yrange.axis.max);

                    if (xrange.from == xrange.to && yrange.from == yrange.to)
                        continue;

                    // then draw
                    xrange.from = xrange.axis.p2c(xrange.from);
                    xrange.to = xrange.axis.p2c(xrange.to);
                    yrange.from = yrange.axis.p2c(yrange.from);
                    yrange.to = yrange.axis.p2c(yrange.to);
                    
                    if (xrange.from == xrange.to || yrange.from == yrange.to) {
                        // draw line
                        ctx.strokeStyle = m.color || options.grid.markingsColor;
                        ctx.beginPath();
                        ctx.lineWidth = m.lineWidth || options.grid.markingsLineWidth;
                        //ctx.moveTo(Math.floor(xrange.from), yrange.from);
                        //ctx.lineTo(Math.floor(xrange.to), yrange.to);
                        ctx.moveTo(xrange.from, yrange.from);
                        ctx.lineTo(xrange.to, yrange.to);
                        ctx.stroke();
                    }
                    else {
                        // fill area
                        ctx.fillStyle = m.color || options.grid.markingsColor;
                        ctx.fillRect(xrange.from, yrange.to,
                                     xrange.to - xrange.from,
                                     yrange.from - yrange.to);
                    }
                }
            }
            
            // draw the inner grid
            ctx.lineWidth = 1;
            ctx.strokeStyle = options.grid.tickColor;
            ctx.beginPath();
            var v, axis;

	    for (f in axes.xaxis) { 
		axis= axes.xaxis[f];
            for (i = 0; i < axis.ticks.length; ++i) {
                v = axis.ticks[i].v;
                if (v <= axis.min || v >= axes.xaxis.max)
                    continue;   // skip those lying on the axes

                ctx.moveTo(Math.floor(axis.p2c(v)) + ctx.lineWidth/2, 0);
                ctx.lineTo(Math.floor(axis.p2c(v)) + ctx.lineWidth/2, plotHeight);
            }
	    }

	    for (f in axes.yaxis) {
            axis = axes.yaxis[f];
            for (i = 0; i < axis.ticks.length; ++i) {
                v = axis.ticks[i].v;
                if (v <= axis.min || v >= axis.max)
                    continue;

                ctx.moveTo(0, Math.floor(axis.p2c(v)) + ctx.lineWidth/2);
                ctx.lineTo(plotWidth, Math.floor(axis.p2c(v)) + ctx.lineWidth/2);
            }
	    }
            axis = axes.xaxis[1];
            for (i = 0; i < axis.ticks.length; ++i) {
                v = axis.ticks[i].v;
                if (v <= axis.min || v >= axis.max)
                    continue;
    
                ctx.moveTo(Math.floor(axis.p2c(v)) + ctx.lineWidth/2, -5);
                ctx.lineTo(Math.floor(axis.p2c(v)) + ctx.lineWidth/2, 5);
            }

//            axis = axes.yaxis[1];
//            for (i = 0; i < axis.ticks.length; ++i) {
//                v = axis.ticks[i].v;
//                if (v <= axis.min || v >= axis.max)
//                    continue;

//                ctx.moveTo(plotWidth-5, Math.floor(axis.p2c(v)) + ctx.lineWidth/2);
//                ctx.lineTo(plotWidth+5, Math.floor(axis.p2c(v)) + ctx.lineWidth/2);
//            }
            
            ctx.stroke();
            
            if (options.grid.borderWidth) {
                // draw border
                var bw = options.grid.borderWidth;
                ctx.lineWidth = bw;
                ctx.strokeStyle = options.grid.borderColor;
                ctx.strokeRect(-bw/2, -bw/2, plotWidth + bw, plotHeight + bw);
            }

            ctx.restore();
        }
        
        function insertLabels() {
            //target.find(".tickLabels").remove();
            
            var html = '<div class="tickLabels" style="font-size:smaller;color:' + options.grid.color + '">';

            function addLabels(axis, labelGenerator) {
                for (var i = 0; i < axis.ticks.length; ++i) {
                    var tick = axis.ticks[i];
                    if (!tick.label || tick.v < axis.min || tick.v > axis.max)
                        continue;
                    html += labelGenerator(tick, axis);
                }
            }

            var margin = options.grid.labelMargin + options.grid.borderWidth;

	    var halfXgraphs=parseInt((axes.xaxis.length/2),10);
	    var halfYgraphs=parseInt((axes.yaxis.length/2),10);
	    var offset;

            for (i=0;i<halfXgraphs;i++) {
		offset=0;
		for (f=i+1;f<halfXgraphs;f++) {
		    offset += axes.xaxis[f].labelHeight + margin;
		}
                addLabels(axes.xaxis[i], function (tick, axis) {
                    return '<div style="position:absolute;top:' + (plotOffset.top + plotHeight + margin + offset) + 'px;left:' + (plotOffset.left + axis.p2c(tick.v) - axis.labelWidth/2) + 'px;width:' + axis.labelWidth + 'px;text-align:center" class="tickLabel">' + tick.label + "</div>";
                });
            }
            
            for (i=halfXgraphs;i<axes.xaxis.length;i++) {
		offset=0;
		for (f=i+1;f<axes.xaxis.length;f++) {
		    offset += axes.xaxis[f].labelHeight + margin;
		}
                addLabels(axes.xaxis[i], function (tick, axis) {
                    return '<div style="position:absolute;bottom:' + (plotOffset.bottom + plotHeight + margin + offset) + 'px;left:' + (plotOffset.left + axis.p2c(tick.v) - axis.labelWidth/2) + 'px;width:' + axis.labelWidth + 'px;text-align:center" class="tickLabel">' + tick.label + "</div>";
                });
	    }

            for (i=0;i<halfYgraphs;i++) {
		offset=0;
		for (f=i+1;f<halfYgraphs;f++) {
		    offset += axes.yaxis[f].labelWidth + margin;
		}
                addLabels(axes.yaxis[i], function (tick, axis) {
                    return '<div style="position:absolute;top:' + (plotOffset.top + axis.p2c(tick.v) - axis.labelHeight/2) + 'px;right:' + (plotOffset.right + plotWidth + margin + offset) + 'px;width:' + axis.labelWidth + 'px;text-align:right" class="tickLabel">' + tick.label + "</div>";
                });
	    }
            
            
            for (i=halfYgraphs;i<axes.yaxis.length;i++) {
		offset=0;
		for (f=i+1;f<axes.yaxis.length;f++) {
		    offset += axes.yaxis[f].labelWidth + margin;
		}
                addLabels(axes.yaxis[i], function (tick, axis) {
                    return '<div style="position:absolute;top:' + (plotOffset.top + axis.p2c(tick.v) - axis.labelHeight/2) + 'px;left:' + (plotOffset.left + plotWidth + margin + offset) +'px;width:' + axis.labelWidth + 'px;text-align:left" class="tickLabel">' + tick.label + "</div>";
                });
	    }

            html += '</div>';
            
            target.append(html);
        }

        function drawSeries(series) {
	    if (series.show) {
                if (series.lines.show)
                    drawSeriesLines(series);
                if (series.bars.show)
                    drawSeriesBars(series);
                if (series.points.show)
                    drawSeriesPoints(series);
	    }
        }
        
        function drawSeriesLines(series) {
            function plotLine(data, offset, axisx, axisy) {
                var prev, cur = null, drawx = null, drawy = null;
                
                ctx.beginPath();
                for (var i = 0; i < data.length; ++i) {
                    prev = cur;
                    cur = data[i];

                    if (prev == null || cur == null)
                        continue;
                    
//interval                    var x1 = prev[0], y1 = prev[1],
//                        x2 = cur[0], y2 = cur[1];
		    var x1,y1=prev[1],x2,y2=cur[1];
		    x1 = (typeof(prev[0])=='object') ? (prev[0][0]+(prev[0][1] - prev[0][0])/2) : prev[0];                    
		    x2 = (typeof(cur[0])=='object') ? (cur[0][0]+(cur[0][1] - cur[0][0])/2) : cur[0];    
//interval end

                    // clip with ymin
                    if (y1 <= y2 && y1 < axisy.min) {
                        if (y2 < axisy.min)
                            continue;   // line segment is outside
                        // compute new intersection point
                        x1 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y1 = axisy.min;
                    }
                    else if (y2 <= y1 && y2 < axisy.min) {
                        if (y1 < axisy.min)
                            continue;
                        x2 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y2 = axisy.min;
                    }

                    // clip with ymax
                    if (y1 >= y2 && y1 > axisy.max) {
                        if (y2 > axisy.max)
                            continue;
                        x1 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y1 = axisy.max;
                    }
                    else if (y2 >= y1 && y2 > axisy.max) {
                        if (y1 > axisy.max)
                            continue;
                        x2 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y2 = axisy.max;
                    }

                    // clip with xmin
                    if (x1 <= x2 && x1 < axisx.min) {
                        if (x2 < axisx.min)
                            continue;
                        y1 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x1 = axisx.min;
                    }
                    else if (x2 <= x1 && x2 < axisx.min) {
                        if (x1 < axisx.min)
                            continue;
                        y2 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x2 = axisx.min;
                    }

                    // clip with xmax
                    if (x1 >= x2 && x1 > axisx.max) {
                        if (x2 > axisx.max)
                            continue;
                        y1 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x1 = axisx.max;
                    }
                    else if (x2 >= x1 && x2 > axisx.max) {
                        if (x1 > axisx.max)
                            continue;
                        y2 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x2 = axisx.max;
                    }

                    if (drawx != axisx.p2c(x1) || drawy != axisy.p2c(y1) + offset)
                        ctx.moveTo(axisx.p2c(x1), axisy.p2c(y1) + offset);
                    
                    drawx = axisx.p2c(x2);
                    drawy = axisy.p2c(y2) + offset;
                    ctx.lineTo(drawx, drawy);
                }
                ctx.stroke();
            }

            function plotLineArea(data, axisx, axisy) {
                var prev, cur = null;
                
                var bottom = Math.min(Math.max(0, axisy.min), axisy.max);
                var top, lastX = 0;

                var areaOpen = false;
                
                for (var i = 0; i < data.length; ++i) {
                    prev = cur;
                    cur = data[i];

                    if (areaOpen && prev != null && cur == null) {
                        // close area
                        ctx.lineTo(axisx.p2c(lastX), axisy.p2c(bottom));
                        ctx.fill();
                        areaOpen = false;
                        continue;
                    }

                    if (prev == null || cur == null)
                        continue;
                        
//interval                    var x1 = prev[0], y1 = prev[1],
//                        x2 = cur[0], y2 = cur[1];
		    var x1,y1=prev[1],x2,y2=cur[1];
		    x1 = (typeof(prev[0])=='object') ? (prev[0][0]+(prev[0][1] - prev[0][0])/2) : prev[0];                    
		    x2 = (typeof(cur[0])=='object') ? (cur[0][0]+(cur[0][1] - cur[0][0])/2) : cur[0];    
//interval end
                    // clip x values
                    
                    // clip with xmin
                    if (x1 <= x2 && x1 < axisx.min) {
                        if (x2 < axisx.min)
                            continue;
                        y1 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x1 = axisx.min;
                    }
                    else if (x2 <= x1 && x2 < axisx.min) {
                        if (x1 < axisx.min)
                            continue;
                        y2 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x2 = axisx.min;
                    }

                    // clip with xmax
                    if (x1 >= x2 && x1 > axisx.max) {
                        if (x2 > axisx.max)
                            continue;
                        y1 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x1 = axisx.max;
                    }
                    else if (x2 >= x1 && x2 > axisx.max) {
                        if (x1 > axisx.max)
                            continue;
                        y2 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
                        x2 = axisx.max;
                    }

                    if (!areaOpen) {
                        // open area
                        ctx.beginPath();
                        ctx.moveTo(axisx.p2c(x1), axisy.p2c(bottom));
                        areaOpen = true;
                    }
                    
                    // now first check the case where both is outside
                    if (y1 >= axisy.max && y2 >= axisy.max) {
                        ctx.lineTo(axisx.p2c(x1), axisy.p2c(axisy.max));
                        ctx.lineTo(axisx.p2c(x2), axisy.p2c(axisy.max));
                        lastX = x2;
                        continue;
                    }
                    else if (y1 <= axisy.min && y2 <= axisy.min) {
                        ctx.lineTo(axisx.p2c(x1), axisy.p2c(axisy.min));
                        ctx.lineTo(axisx.p2c(x2), axisy.p2c(axisy.min));
                        lastX = x2;
                        continue;
                    }
                    
                    // else it's a bit more complicated, there might
                    // be two rectangles and two triangles we need to fill
                    // in; to find these keep track of the current x values
                    var x1old = x1, x2old = x2;

                    // and clip the y values, without shortcutting
                    
                    // clip with ymin
                    if (y1 <= y2 && y1 < axisy.min && y2 >= axisy.min) {
                        x1 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y1 = axisy.min;
                    }
                    else if (y2 <= y1 && y2 < axisy.min && y1 >= axisy.min) {
                        x2 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y2 = axisy.min;
                    }

                    // clip with ymax
                    if (y1 >= y2 && y1 > axisy.max && y2 <= axisy.max) {
                        x1 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y1 = axisy.max;
                    }
                    else if (y2 >= y1 && y2 > axisy.max && y1 <= axisy.max) {
                        x2 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
                        y2 = axisy.max;
                    }


                    // if the x value was changed we got a rectangle
                    // to fill
                    if (x1 != x1old) {
                        if (y1 <= axisy.min)
                            top = axisy.min;
                        else
                            top = axisy.max;
                        
                        ctx.lineTo(axisx.p2c(x1old), axisy.p2c(top));
                        ctx.lineTo(axisx.p2c(x1), axisy.p2c(top));
                    }
                    
                    // fill the triangles
                    ctx.lineTo(axisx.p2c(x1), axisy.p2c(y1));
                    ctx.lineTo(axisx.p2c(x2), axisy.p2c(y2));

                    // fill the other rectangle if it's there
                    if (x2 != x2old) {
                        if (y2 <= axisy.min)
                            top = axisy.min;
                        else
                            top = axisy.max;
                        
                        ctx.lineTo(axisx.p2c(x2), axisy.p2c(top));
                        ctx.lineTo(axisx.p2c(x2old), axisy.p2c(top));
                    }

                    lastX = Math.max(x2, x2old);
                }

                if (areaOpen) {
                    ctx.lineTo(axisx.p2c(lastX), axisy.p2c(bottom));
                    ctx.fill();
                }
            }
            
            ctx.save();
            ctx.translate(plotOffset.left, plotOffset.top);
            ctx.lineJoin = "round";

            var lw = series.lines.lineWidth,
                sw = series.shadowSize;
            // FIXME: consider another form of shadow when filling is turned on
            if (lw > 0 && sw > 0) {
                // draw shadow in two steps
                var w = sw / 2;
                ctx.lineWidth = w;
		if ('minData' in series) { // put shadow only on minimum line
	                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                	plotLine(series.minData, lw/2 + w + w/2, series.xaxis, series.yaxis);
                	ctx.strokeStyle = "rgba(0,0,0,0.2)";
                	plotLine(series.minData, lw/2 + w/2, series.xaxis, series.yaxis);
		} else {
	                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                	plotLine(series.data, lw/2 + w + w/2, series.xaxis, series.yaxis);
                	ctx.strokeStyle = "rgba(0,0,0,0.2)";
                	plotLine(series.data, lw/2 + w/2, series.xaxis, series.yaxis);
		}
            }

            ctx.lineWidth = lw;
            ctx.strokeStyle = series.color;
            var fillStyle = getFillStyle(series.lines, series.color, 0, plotHeight);
            if (fillStyle) {
                ctx.fillStyle = fillStyle;
		if ('minData' in series) {
			var fillLine = series.minData.concat(series.data.slice().reverse());
                	plotLineArea(fillLine, series.xaxis, series.yaxis);
		} else {
                	plotLineArea(series.data, series.xaxis, series.yaxis);
		}
            }

            if (lw > 0) {
		if ('minData' in series) {
            	    plotLine(series.minData, 0, series.xaxis, series.yaxis);
	        }
                plotLine(series.data, 0, series.xaxis, series.yaxis);
	    }
            ctx.restore();
        }

        function drawSeriesPoints(series) {
	    var i,x,y;
            function plotPoints(data, radius, fillStyle, axisx, axisy) {
		var data_length=data.length;
                for (i = 0; i < data_length; i++) {
                    if (data[i] == null)
                        continue;
                    
//interval                    var x = data[i][0], y = data[i][1];
                    y = data[i][1];
                    x = (typeof(data[i][0]) == 'object') ? (data[i][0][0]+(data[i][0][1] - data[i][0][0])/2) : data[i][0];
//interval end
                    if (x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max)
                        continue;
                    if(series.points.drawCall) {
			series.points.drawCall.apply(eventHolder,[ctx,axisx.p2c(x),axisy.p2c(y),radius,fillStyle,plotOffset,data[i],series]);
                    } else {
                        ctx.beginPath();
                        ctx.arc(axisx.p2c(x), axisy.p2c(y), radius, 0, two_pi, true);
                        if (fillStyle) {
                            ctx.fillStyle = fillStyle;
                            ctx.fill();
                        }
                        ctx.stroke();
		    };
                }
            }

            function plotPointShadows(data, offset, radius, axisx, axisy) {
		var data_length=data.length, x,y,i;
                for (i = 0; i < data_length; i++) {
                    if (data[i] == null)
                        continue;
                    
//interval                    var x = data[i][0], y = data[i][1];
                    y = data[i][1];
		    x = (typeof(data[i][0]) == 'object') ? (data[i][0][0]+(data[i][0][1] - data[i][0][0])/2): data[i][0];
//interval end
                    if (x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max)
                        continue;
                    ctx.beginPath();
                    ctx.arc(axisx.p2c(x), axisy.p2c(y) + offset, radius, 0, one_pi, false);
                    ctx.stroke();
                }
            }
            
            ctx.save();
            ctx.translate(plotOffset.left, plotOffset.top);

            var lw = series.lines.lineWidth,
                sw = series.shadowSize;
            if (lw > 0 && sw > 0) {
                // draw shadow in two steps
                var w = sw / 2;
                ctx.lineWidth = w;
                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                plotPointShadows(series.data, w + w/2,
                                 series.points.radius, series.xaxis, series.yaxis);

                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                plotPointShadows(series.data, w/2,
                                 series.points.radius, series.xaxis, series.yaxis);
            }

            ctx.lineWidth = series.points.lineWidth;
            ctx.strokeStyle = series.color;
            plotPoints(series.data, series.points.radius,
                       getFillStyle(series.points, series.color),
                       series.xaxis, series.yaxis);
            ctx.restore();
        }

        function drawBar(x, y, barLeft, barRight, offset, fillStyleCallback, axisx, axisy, c) {
            var drawLeft = true, drawRight = true,
                drawTop = true, drawBottom = false,
                left = x + barLeft, right = x + barRight,
                bottom = 0, top = y;

            // account for negative bars
            if (top < bottom) {
                top = 0;
                bottom = y;
                drawBottom = true;
                drawTop = false;
            }
            
            // clip
            if (right < axisx.min || left > axisx.max ||
                top < axisy.min || bottom > axisy.max)
                return;
            
            if (left < axisx.min) {
                left = axisx.min;
                drawLeft = false;
            }

            if (right > axisx.max) {
                right = axisx.max;
                drawRight = false;
            }

            if (bottom < axisy.min) {
                bottom = axisy.min;
                drawBottom = false;
            }
            
            if (top > axisy.max) {
                top = axisy.max;
                drawTop = false;
            }

            left = axisx.p2c(left);
            bottom = axisy.p2c(bottom);
            right = axisx.p2c(right);
            top = axisy.p2c(top);
            
            // fill the bar
            if (fillStyleCallback) {
                c.beginPath();
                c.moveTo(left, bottom);
                c.lineTo(left, top);
                c.lineTo(right, top);
                c.lineTo(right, bottom);
                c.fillStyle = fillStyleCallback(bottom, top);
                c.fill();
            }

            // draw outline
            if (drawLeft || drawRight || drawTop || drawBottom) {
                c.beginPath();

                // FIXME: inline moveTo is buggy with excanvas
                c.moveTo(left, bottom + offset);
                if (drawLeft)
                    c.lineTo(left, top + offset);
                else
                    c.moveTo(left, top + offset);
                if (drawTop)
                    c.lineTo(right, top + offset);
                else
                    c.moveTo(right, top + offset);
                if (drawRight)
                    c.lineTo(right, bottom + offset);
                else
                    c.moveTo(right, bottom + offset);
                if (drawBottom)
                    c.lineTo(left, bottom + offset);
                else
                    c.moveTo(left, bottom + offset);
                c.stroke();
            }
        }
        
        function drawSeriesBars(series) {
            function plotBars(data, barLeft, barRight, offset, fillStyleCallback, axisx, axisy) {
                for (var i = 0; i < data.length; i++) {
                    if (data[i] == null)
                        continue;
//interval                    drawBar(data[i][0], data[i][1], barLeft, barRight, offset, fillStyleCallback, axisx, axisy, ctx);
		    if (typeof(data[i][0])=='object') {
                        drawBar(data[i][0][0], data[i][1], barLeft, barLeft+(data[i][0][1]-data[i][0][0]), offset, fillStyleCallback, axisx, axisy, ctx);
		    } else {
                        drawBar(data[i][0], data[i][1], barLeft, barRight, offset, fillStyleCallback, axisx, axisy, ctx);
		    }
//interval end
                }
            }

            ctx.save();
            ctx.translate(plotOffset.left, plotOffset.top);
            ctx.lineJoin = "round";

            // FIXME: figure out a way to add shadows (for instance along the right edge)
            /*
            var bw = series.bars.barWidth;
            var lw = series.bars.lineWidth;
            var sw = series.shadowSize;
            if (sw > 0) {
                // draw shadow in two steps
                ctx.lineWidth = sw / 2;
                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                plotBars(series.data, bw, lw/2 + sw/2 + ctx.lineWidth/2, false);

                ctx.lineWidth = sw / 2;
                ctx.strokeStyle = "rgba(0,0,0,0.2)";
                plotBars(series.data, bw, lw/2 + ctx.lineWidth/2, false);
            }*/

            ctx.lineWidth = series.bars.lineWidth;
            ctx.strokeStyle = series.color;
            var barLeft = series.bars.align == "left" ? 0 : -series.bars.barWidth/2;
            var fillStyleCallback = series.bars.fill ? function (bottom, top) { return getFillStyle(series.bars, series.color, bottom, top); } : null;
            plotBars(series.data, barLeft, barLeft + series.bars.barWidth, 0, fillStyleCallback, series.xaxis, series.yaxis);
            ctx.restore();
        }

        function getFillStyle(filloptions, seriesColor, bottom, top) {
            var fill = filloptions.fill;
            if (!fill)
                return null;

            if (filloptions.fillColor)
                return getColorOrGradient(filloptions.fillColor, bottom, top, seriesColor);
            
            var c = parseColor(seriesColor);
            c.a = typeof fill == "number" ? fill : 0.4;
            c.normalize();
            return c.toString();
        }
        
        function insertLegend() {
            target.find(".legend").remove();

            if (!options.legend.show)
                return;
            
            var fragments = [];
            var rowStarted = false;
            for (i = 0; i < series.length; ++i) {
                if (!series[i].label)
                    continue;
                
                if (i % options.legend.noColumns == 0) {
                    if (rowStarted)
                        fragments.push('</tr>');
                    fragments.push('<tr>');
                    rowStarted = true;
                }

                var label = series[i].label;
                if (options.legend.labelFormatter != null)
                    label = options.legend.labelFormatter(label);
                
		var checkbox='';
		if (options.legend.checkboxes) {
			checkbox += '<td class="legendCheckBox">';
			if (series[i].show) {
		    		checkbox += '<input type="checkbox" class="dataseries" name="'+series[i].color_number+'" checked="checked" />';
			} else {
		    		checkbox += '<input type="checkbox" class="dataseries" name="'+series[i].color_number+'" />';
			}
			checkbox += '</td>';
	                fragments.push(
        	            checkbox+'<td class="legendColorBox"><div style="border:1px solid ' + options.legend.labelBoxBorderColor + ';padding:1px"><div style="width:4px;height:0;border:5px solid ' + series[i].color + ';overflow:hidden"></div></div></td>' +
                	    '<td class="legendLabel">' + label + '</td>');
		} else {
			if (series[i].show) {
	                	fragments.push(
        	        	    '<td class="legendColorBox"><div style="border:1px solid ' + options.legend.labelBoxBorderColor + ';padding:1px"><div style="width:4px;height:0;border:5px solid ' + series[i].color + ';overflow:hidden"></div></div></td>' +
                		    '<td class="legendLabel">' + label + '</td>');
			}
		}
            }
            if (rowStarted)
                fragments.push('</tr>');
            
            if (fragments.length == 0)
                return;

            var table = '<table style="font-size:smaller;color:' + options.grid.color + '">' + fragments.join("") + '</table>';
            if (options.legend.container != null)
                $(options.legend.container).html(table);
            else {
                var pos = "",
                    p = options.legend.position,
                    m = options.legend.margin;
                if (m[0] == null)
                    m = [m, m];
                if (p.charAt(0) == "n")
                    pos += 'top:' + (m[1] + plotOffset.top) + 'px;';
                else if (p.charAt(0) == "s")
                    pos += 'bottom:' + (m[1] + plotOffset.bottom) + 'px;';
                if (p.charAt(1) == "e")
                    pos += 'right:' + (m[0] + plotOffset.right) + 'px;';
                else if (p.charAt(1) == "w")
                    pos += 'left:' + (m[0] + plotOffset.left) + 'px;';
                var legend = $('<div class="legend">' + table.replace('style="', 'style="position:absolute;' + pos +';') + '</div>').appendTo(target);
                if (options.legend.backgroundOpacity != 0.0) {
                    // put in the transparent background
                    // separately to avoid blended labels and
                    // label boxes
                    var c = options.legend.backgroundColor;
                    if (c == null) {
                        var tmp;
                        if (options.grid.backgroundColor && typeof options.grid.backgroundColor == "string")
                            tmp = options.grid.backgroundColor;
                        else
                            tmp = extractColor(legend);
                        c = parseColor(tmp).adjust(null, null, null, 1).toString();
                    }
                    var div = legend.children();
                    $('<div style="position:absolute;width:' + div.width() + 'px;height:' + div.height() + 'px;' + pos +'background-color:' + c + ';"> </div>').prependTo(legend).css('opacity', options.legend.backgroundOpacity);
                    
                }
            }
        }


        // interactive features
        
        var lastMousePos = { pageX: null, pageY: null },
            selection = {
                first: { x: -1, y: -1}, second: { x: -1, y: -1},
                show: false, active: false },
            crosshair = { pos: { x: -1, y: -1 } },
            highlights = [],
            clickIsMouseUp = false,
            redrawTimeout = null,
            hoverTimeout = null;
        
        // Returns the data item the mouse is over, or null if none is found
        function findNearbyItem(mouseX, mouseY, seriesFilter) {
            var maxDistance = options.grid.mouseActiveRadius,
                lowestDistance = maxDistance * maxDistance + 1,
                item = null, foundPoint = false;

            function result(i, j) {
               k= { datapoint: series[i].data[j],
                         dataIndex: j,
                         series: series[i],
                         seriesIndex: i };
		return k
	            };
            
            for (var i = 0; i < series.length; ++i) {
                if (!seriesFilter(series[i]))
                    continue;
		if (series[i].show==false) {
		    break;
		} 
                
                var data = series[i].data,
                    axisx = series[i].xaxis,
                    axisy = series[i].yaxis,
                
                    // precompute some stuff to make the loop faster
                    mx = axisx.c2p(mouseX),
                    my = axisy.c2p(mouseY),
                    maxx = maxDistance / axisx.scale,
                    maxy = maxDistance / axisy.scale,
                    checkbar = series[i].bars.show,
                    checkpoint = !(series[i].bars.show && !(series[i].lines.show || series[i].points.show)),
                    barLeft = series[i].bars.align == "left" ? 0 : -series[i].bars.barWidth/2;
//interval                    var barRight = barLeft + series[i].bars.barWidth;
                for (var j = 0; j < data.length; ++j) {
                    if (data[j] == null)
                        continue;

//interval                    var x = data[j][0], y = data[j][1];
                    var barRight,pointX, barX, y = data[j][1];
		    if (typeof(data[j][0])=='object') {
			pointX = data[j][0][0]+(data[j][0][1]-data[j][0][0])/2;
			barX = data[j][0][0];
			barRight = (data[j][0][1]-data[j][0][0]);
		    } else {
			pointX = data[j][0];
			barX = data[j][0];
			barRight = barLeft + series[i].bars.barWidth;
		    }
//interval end
                    if (checkbar) {
                        // For a bar graph, the cursor must be inside the bar
                        // and no other point can be nearby
                        if (!foundPoint && mx >= barX + barLeft &&
                            mx <= barX + barRight &&
                            my >= Math.min(0, y) && my <= Math.max(0, y))
                            item = result(i, j);
                    }
 
                    if (checkpoint) {
                        // For points and lines, the cursor must be within a
                        // certain distance to the data point
 
                        // check bounding box first
                        if ((pointX - mx > maxx || pointX - mx < -maxx) ||
                            (y - my > maxy || y - my < -maxy))
                            continue;

                        // We have to calculate distances in pixels, not in
                        // data units, because the scale of the axes may be different
                        var dx = Math.abs(axisx.p2c(pointX) - mouseX),
                            dy = Math.abs(axisy.p2c(y) - mouseY),
                            dist = dx * dx + dy * dy;
                        if (dist < lowestDistance) {
                            lowestDistance = dist;
                            foundPoint = true;
                            item = result(i, j);
                        }
                    }
                }
            }

            return item;
        }

        function onMouseMove(ev) {
            // FIXME: temp. work-around until jQuery bug 1871 is fixed
            var e = ev || window.event;
            if (e.pageX == null && e.clientX != null) {
                var de = document.documentElement, b = document.body;
                lastMousePos.pageX = e.clientX + (de && de.scrollLeft || b.scrollLeft || 0) - (de.clientLeft || 0);
                lastMousePos.pageY = e.clientY + (de && de.scrollTop || b.scrollTop || 0) - (de.clientTop || 0);
            }
            else {
                lastMousePos.pageX = e.pageX;
                lastMousePos.pageY = e.pageY;
            }
            
            if (options.grid.hoverable)
                triggerClickHoverEvent("plothover", lastMousePos,
                                       function (s) { return s["hoverable"] != false; });

            if (options.crosshair.mode != null) {
                if (!selection.active) {
                    setPositionFromEvent(crosshair.pos, lastMousePos);
                    triggerRedrawOverlay();
                }
                else
                    crosshair.pos.x = -1; // hide the crosshair while selecting
            }

            if (selection.active) {
                target.trigger("plotselecting", [ selectionIsSane() ? getSelectionForEvent() : null ]);

                updateSelection(lastMousePos);
            }
        }
        
        function onMouseDown(e) {
            if (e.which != 1)  // only accept left-click
                return;
            
            // cancel out any text selections
            document.body.focus();

            // prevent text selection and drag in old-school browsers
            if (document.onselectstart !== undefined && workarounds.onselectstart == null) {
                workarounds.onselectstart = document.onselectstart;
                document.onselectstart = function () { return false; };
            }
            if (document.ondrag !== undefined && workarounds.ondrag == null) {
                workarounds.ondrag = document.ondrag;
                document.ondrag = function () { return false; };
            }
            
            setSelectionPos(selection.first, e);
                
            lastMousePos.pageX = null;
            selection.active = true;
            $(document).one("mouseup", onSelectionMouseUp);
        }

        function onMouseOut(ev) {
            if (options.crosshair.mode != null && crosshair.pos.x != -1) {
                crosshair.pos.x = -1;
                triggerRedrawOverlay();
            }
        }
        
        function onClick(e) {
            if (clickIsMouseUp) {
                clickIsMouseUp = false;
                return;
            }

            triggerClickHoverEvent("plotclick", e,
                                   function (s) { return s["clickable"] != false; });
        }

        
        // trigger click or hover event (they send the same parameters
        // so we share their code)
        function triggerClickHoverEvent(eventname, event, seriesFilter) {
            var offset = eventHolder.offset(),
                pos = { pageX: event.pageX, pageY: event.pageY, y:[], x:[] },
                canvasX = event.pageX - offset.left - plotOffset.left,
                canvasY = event.pageY - offset.top - plotOffset.top;


//	    for (i=0;i<axes.xaxis.length;i++) {
//                if (axes.xaxis[i].used)
//                   pos.x[i] = axes.xaxis[i].c2p(canvasX);
//	    }


//	    for (i=0;i<axes.yaxis.length;i++) {
//                if (axes.yaxis[i].used)
//                   pos.y[i] = axes.yaxis[i].c2p(canvasY);
//	    }

            if (axes.xaxis[0].used)
                pos.x = axes.xaxis[0].c2p(canvasX);
            if (axes.yaxis[0].used)
                pos.y = axes.yaxis[0].c2p(canvasY);
            if (axes.xaxis[1].used)
                pos.x2 = axes.xaxis[1].c2p(canvasX);
            if (axes.yaxis[1].used)
                pos.y2 = axes.yaxis[1].c2p(canvasY);

            var item = findNearbyItem(canvasX, canvasY, seriesFilter);

            if (item) {
                // fill in mouse pos for any listeners out there
//interval                item.pageX = parseInt(item.series.xaxis.p2c(item.datapoint[0]) + offset.left + plotOffset.left);
		var time_value = (typeof(item.datapoint[0])=='object') ? (item.datapoint[0][0]+(item.datapoint[0][1]-item.datapoint[0][0])/2) : item.datapoint[0];
                item.pageX = parseInt(item.series.xaxis.p2c(time_value) + offset.left + plotOffset.left,10);
//interval end
                item.pageY = parseInt(item.series.yaxis.p2c(item.datapoint[1]) + offset.top + plotOffset.top);
            }

            if (options.grid.autoHighlight) {
                // clear auto-highlights
                for (var i = 0; i < highlights.length; ++i) {
                    var h = highlights[i];
                    if (h.auto == eventname &&
                        !(item && h.series == item.series && h.point == item.datapoint))
                        unhighlight(h.series, h.point);
                }
                
                if (item)
                    highlight(item.series, item.datapoint, eventname);
            }
            
            target.trigger(eventname, [ pos, item ]);
        }

        function triggerRedrawOverlay() {
            if (!redrawTimeout)
                redrawTimeout = setTimeout(redrawOverlay, 30);
        }

        function redrawOverlay() {
            redrawTimeout = null;

            // redraw highlights
            octx.save();
            octx.clearRect(0, 0, canvasWidth, canvasHeight);
            octx.translate(plotOffset.left, plotOffset.top);
            
            var i, hi; 
            for (i = 0; i < highlights.length; ++i) {
                hi = highlights[i];

                if (hi.series.bars.show)
                    drawBarHighlight(hi.series, hi.point);
                else
                    drawPointHighlight(hi.series, hi.point);
            }

            // redraw selection
            if (selection.show && selectionIsSane()) {
                octx.strokeStyle = parseColor(options.selection.color).scale(null, null, null, 0.8).toString();
                octx.lineWidth = 1;
                ctx.lineJoin = "round";
                octx.fillStyle = parseColor(options.selection.color).scale(null, null, null, 0.4).toString();
                
                var x = Math.min(selection.first.x, selection.second.x),
                    y = Math.min(selection.first.y, selection.second.y),
                    w = Math.abs(selection.second.x - selection.first.x),
                    h = Math.abs(selection.second.y - selection.first.y);
                
                octx.fillRect(x, y, w, h);
                octx.strokeRect(x, y, w, h);
            }

            // redraw crosshair
            if (options.crosshair.mode != null && crosshair.pos.x != -1) {
                octx.strokeStyle = parseColor(options.crosshair.color).scale(null, null, null, 0.8).toString();
                octx.lineWidth = 1;
                ctx.lineJoin = "round";
                var pos = crosshair.pos;

                octx.beginPath();
                if (options.crosshair.mode.indexOf("x") != -1) {
                    octx.moveTo(pos.x, 0);
                    octx.lineTo(pos.x, plotHeight);
                }
                if (options.crosshair.mode.indexOf("y") != -1) {
                    octx.moveTo(0, pos.y);
                    octx.lineTo(plotWidth, pos.y);
                }
                octx.stroke();
                
            }
            octx.restore();
        }
        
        function highlight(s, point, auto) {
            if (typeof s == "number")
                s = series[s];

            if (typeof point == "number")
                point = s.data[point];

            var i = indexOfHighlight(s, point);
            if (i == -1) {
                highlights.push({ series: s, point: point, auto: auto });

                triggerRedrawOverlay();
            }
            else if (!auto)
                highlights[i].auto = false;
        }
            
        function unhighlight(s, point) {
            if (typeof s == "number")
                s = series[s];

            if (typeof point == "number")
                point = s.data[point];

            var i = indexOfHighlight(s, point);
            if (i != -1) {
                highlights.splice(i, 1);

                triggerRedrawOverlay();
            }
        }
        
        function indexOfHighlight(s, p) {
            for (var i = 0; i < highlights.length; ++i) {
                var h = highlights[i];
                if (h.series == s && h.point[0] == p[0]
                    && h.point[1] == p[1])
                    return i;
            }
            return -1;
        }
        
        function drawPointHighlight(series, point) {
//interval            var x = point[0], y = point[1],
//                axisx = series.xaxis, axisy = series.yaxis;
            var x, y = point[1],
                axisx = series.xaxis, axisy = series.yaxis;
            x = (typeof(point[0])=='object') ? (point[0][0]+(point[0][1]-point[0][0])/2): point[0];
//interval end            
            if (x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max)
                return;
            
            var pointRadius = series.points.radius + series.points.lineWidth / 2;
            octx.lineWidth = pointRadius;
            octx.strokeStyle = parseColor(series.color).scale(1, 1, 1, 0.5).toString();
            var radius = 1.5 * pointRadius;
            octx.beginPath();
            octx.arc(axisx.p2c(x), axisy.p2c(y), radius, 0, two_pi, true);
            octx.stroke();
        }

        function drawBarHighlight(series, point) {
            octx.lineJoin = "round";
            octx.lineWidth = series.bars.lineWidth;
            octx.strokeStyle = parseColor(series.color).scale(1, 1, 1, 0.5).toString();
            var fillStyle = parseColor(series.color).scale(1, 1, 1, 0.5).toString();
            var barLeft = series.bars.align == "left" ? 0 : -series.bars.barWidth/2;
//interval            drawBar(point[0], point[1], barLeft, barLeft + series.bars.barWidth,
//                    0, function () { return fillStyle; }, series.xaxis, series.yaxis, octx);
	    if (typeof(point[0])=='object') {
                drawBar(point[0][0], point[1], barLeft, barLeft + (point[0][1]-point[0][0]),
                    0, function () { return fillStyle; }, series.xaxis, series.yaxis, octx);
	    } else {
                drawBar(point[0], point[1], barLeft, barLeft + series.bars.barWidth,
                    0, function () { return fillStyle; }, series.xaxis, series.yaxis, octx);
	    }
//interval end
        }

        function setPositionFromEvent(pos, e) {
            var offset = eventHolder.offset();
            pos.x = clamp(0, e.pageX - offset.left - plotOffset.left, plotWidth);
            pos.y = clamp(0, e.pageY - offset.top - plotOffset.top, plotHeight);
        }

        function setCrosshair(pos) {
            if (pos == null)
                crosshair.pos.x = -1;
            else {
                crosshair.pos.x = clamp(0, pos.x != null ? axes.xaxis[0].p2c(pos.x) : axes.xaxis[1].p2c(pos.x2), plotWidth);
                crosshair.pos.y = clamp(0, pos.y != null ? axes.yaxis[0].p2c(pos.y) : axes.yaxis[1].p2c(pos.y2), plotHeight);
            }
            triggerRedrawOverlay();
        }

        function getSelectionForEvent() {
            var x1 = Math.min(selection.first.x, selection.second.x),
                x2 = Math.max(selection.first.x, selection.second.x),
                y1 = Math.max(selection.first.y, selection.second.y),
                y2 = Math.min(selection.first.y, selection.second.y);

            var r = {};
	    r.xaxis=[],r.yaxis=[];

	    for (i=0;i<axes.xaxis.length;i++) {	    
//                if (axes.xaxis[i].used)
                    r.xaxis[i] = { from: axes.xaxis[i].c2p(x1), to: axes.xaxis[i].c2p(x2) };
	    }

	    for (i=0;i<axes.yaxis.length;i++) {	    
//                if (axes.yaxis[i].used)
                    r.yaxis[i] = { from: axes.yaxis[i].c2p(y1), to: axes.yaxis[i].c2p(y2) };
	    }

//            if (axes.xaxis[0].used)
//                r.xaxis[0] = { from: axes.xaxis[0].c2p(x1), to: axes.xaxis[0].c2p(x2) };
//            if (axes.xaxis[1].used)
//                r.xaxis[1] = { from: axes.xaxis[1].c2p(x1), to: axes.xaxis[1].c2p(x2) };
//            if (axes.yaxis[0].used)
//                r.yaxis[0] = { from: axes.yaxis[0].c2p(y1), to: axes.yaxis[0].c2p(y2) };
//            if (axes.yaxis[1].used)
//                r.yaxis[1] = { from: axes.yaxis[1].c2p(y1), to: axes.yaxis[1].c2p(y2) };
            return r;
        }
        
        function triggerSelectedEvent() {
            var r = getSelectionForEvent();
            
            target.trigger("plotselected", [ r ]);

            // backwards-compat stuff, to be removed in future
       //     if (axes.xaxis[0].used && axes.yaxis[0].used)
       //         target.trigger("selected", [ { x1: r.xaxis[0].from, y1: r.yaxis[0].from, x2: r.xaxis[0].to, y2: r.yaxis[0].to } ]);
        }
        
        function onSelectionMouseUp(e) {
            // revert drag stuff for old-school browsers
            if (document.onselectstart !== undefined)
                document.onselectstart = workarounds.onselectstart;
            if (document.ondrag !== undefined)
                document.ondrag = workarounds.ondrag;
            
            // no more draggy-dee-drag
            selection.active = false;
            updateSelection(e);
            
            if (selectionIsSane()) {
                triggerSelectedEvent();
                clickIsMouseUp = true;
            }
            else {
                // this counts as a clear
                target.trigger("plotunselected", [ ]);
                target.trigger("plotselecting", [ null ]);
            }
            
            return false;
        }

        function setSelectionPos(pos, e) {
            setPositionFromEvent(pos, e);
            
            if (options.selection.mode == "y") {
                if (pos == selection.first)
                    pos.x = 0;
                else
                    pos.x = plotWidth;
            }

            if (options.selection.mode == "x") {
                if (pos == selection.first)
                    pos.y = 0;
                else
                    pos.y = plotHeight;
            }
        }

        function updateSelection(pos) {
            if (pos.pageX == null)
                return;

            setSelectionPos(selection.second, pos);
            if (selectionIsSane()) {
                selection.show = true;
                triggerRedrawOverlay();
            }
            else
                clearSelection(true);
        }

        function clearSelection(preventEvent) {
            if (selection.show) {
                selection.show = false;
                triggerRedrawOverlay();
                if (!preventEvent)
                    target.trigger("plotunselected", [ ]);
            }
        }

        function setSelection(ranges, preventEvent) {
            var range;
            
            if (options.selection.mode == "y") {
                selection.first.x = 0;
                selection.second.x = plotWidth;
            }
            else {
                range = extractRange(ranges, "x");
                selection.first.x = range.axis.p2c(range.from);
                selection.second.x = range.axis.p2c(range.to);
            }
            
            if (options.selection.mode == "x") {
                selection.first.y = 0;
                selection.second.y = plotHeight;
            }
            else {
                range = extractRange(ranges, "y");
                
                selection.first.y = range.axis.p2c(range.from);
                selection.second.y = range.axis.p2c(range.to);
            }

            selection.show = true;
            triggerRedrawOverlay();
            if (!preventEvent)
                triggerSelectedEvent();
        }
        
        function selectionIsSane() {
            var minSize = 5;
            return Math.abs(selection.second.x - selection.first.x) >= minSize &&
                Math.abs(selection.second.y - selection.first.y) >= minSize;
        }
        
        function getColorOrGradient(spec, bottom, top, defaultColor) {
            if (typeof spec == "string")
                return spec;
            else {
                // assume this is a gradient spec; IE currently only
                // supports a simple vertical gradient properly, so that's
                // what we support too
                var gradient = ctx.createLinearGradient(0, top, 0, bottom);
                
                for (var i = 0, l = spec.colors.length; i < l; ++i) {
                    var c = spec.colors[i];
                    gradient.addColorStop(i / (l - 1), typeof c == "string" ? c : parseColor(defaultColor).scale(c.brightness, c.brightness, c.brightness, c.opacity));
                }
                
                return gradient;
            }
        }
    }
    
    $.plot = function(target, data, options) {
        var plot = new Plot(target, data, options);
        /*var t0 = new Date();     
        var t1 = new Date();
        var tstr = "time used (msecs): " + (t1.getTime() - t0.getTime())
        if (window.console)
            console.log(tstr);
        else
            alert(tstr);*/
        return plot;
    };

    // returns a string with the date d formatted according to fmt
    $.plot.formatDate = function(d, fmt, monthNames) {
        var leftPad = function(n) {
            n = "" + n;
            return n.length == 1 ? "0" + n : n;
        };
        
        var r = [];
        var escape = false;
        if (monthNames == null)
            monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        for (var i = 0; i < fmt.length; ++i) {
            var c = fmt.charAt(i);
            
            if (escape) {
                switch (c) {
                case 'h': c = "" + d.getUTCHours(); break;
                case 'H': c = leftPad(d.getUTCHours()); break;
                case 'M': c = leftPad(d.getUTCMinutes()); break;
                case 'S': c = leftPad(d.getUTCSeconds()); break;
                case 'd': c = "" + d.getUTCDate(); break;
                case 'm': c = "" + (d.getUTCMonth() + 1); break;
                case 'y': c = "" + d.getUTCFullYear(); break;
                case 'b': c = "" + monthNames[d.getUTCMonth()]; break;
                }
                r.push(c);
                escape = false;
            }
            else {
                if (c == "%")
                    escape = true;
                else
                    r.push(c);
            }
        }
        return r.join("");
    };
    
    // round to nearby lower multiple of base
    function floorInBase(n, base) {
        return base * Math.floor(n / base);
    }
    
    function clamp(min, value, max) {
        if (value < min)
            return min;
        else if (value > max)
            return max;
        else
            return value;
    }
    
    // color helpers, inspiration from the jquery color animation
    // plugin by John Resig
    function Color (r, g, b, a) {
       
        var rgba = ['r','g','b','a'];
        var x = 4; //rgba.length
       
        while (-1<--x) {
            this[rgba[x]] = arguments[x] || ((x==3) ? 1.0 : 0);
        }
       
        this.toString = function() {
            if (this.a >= 1.0) {
                return "rgb("+[this.r,this.g,this.b].join(",")+")";
            } else {
                return "rgba("+[this.r,this.g,this.b,this.a].join(",")+")";
            }
        };

        this.scale = function(rf, gf, bf, af) {
            x = 4; //rgba.length
            while (-1<--x) {
                if (arguments[x] != null)
                    this[rgba[x]] *= arguments[x];
            }
            return this.normalize();
        };

        this.adjust = function(rd, gd, bd, ad) {
            x = 4; //rgba.length
            while (-1<--x) {
                if (arguments[x] != null)
                    this[rgba[x]] += arguments[x];
            }
            return this.normalize();
        };

        this.clone = function() {
            return new Color(this.r, this.b, this.g, this.a);
        };

        var limit = function(val,minVal,maxVal) {
            return Math.max(Math.min(val, maxVal), minVal);
        };

        this.normalize = function() {
            this.r = clamp(0, parseInt(this.r), 255);
            this.g = clamp(0, parseInt(this.g), 255);
            this.b = clamp(0, parseInt(this.b), 255);
            this.a = clamp(0, this.a, 1);
            return this;
        };

        this.normalize();
    }
    
    var lookupColors = {
        aqua:[0,255,255],
        azure:[240,255,255],
        beige:[245,245,220],
        black:[0,0,0],
        blue:[0,0,255],
        brown:[165,42,42],
        cyan:[0,255,255],
        darkblue:[0,0,139],
        darkcyan:[0,139,139],
        darkgrey:[169,169,169],
        darkgreen:[0,100,0],
        darkkhaki:[189,183,107],
        darkmagenta:[139,0,139],
        darkolivegreen:[85,107,47],
        darkorange:[255,140,0],
        darkorchid:[153,50,204],
        darkred:[139,0,0],
        darksalmon:[233,150,122],
        darkviolet:[148,0,211],
        fuchsia:[255,0,255],
        gold:[255,215,0],
        green:[0,128,0],
        indigo:[75,0,130],
        khaki:[240,230,140],
        lightblue:[173,216,230],
        lightcyan:[224,255,255],
        lightgreen:[144,238,144],
        lightgrey:[211,211,211],
        lightpink:[255,182,193],
        lightyellow:[255,255,224],
        lime:[0,255,0],
        magenta:[255,0,255],
        maroon:[128,0,0],
        navy:[0,0,128],
        olive:[128,128,0],
        orange:[255,165,0],
        pink:[255,192,203],
        purple:[128,0,128],
        violet:[128,0,128],
        red:[255,0,0],
        silver:[192,192,192],
        white:[255,255,255],
        yellow:[255,255,0]
    };    

    function extractColor(element) {
        var color, elem = element;
        do {
            color = elem.css("background-color").toLowerCase();
            // keep going until we find an element that has color, or
            // we hit the body
            if (color != '' && color != 'transparent')
                break;
            elem = elem.parent();
        } while (!$.nodeName(elem.get(0), "body"));

        // catch Safari's way of signalling transparent
        if (color == "rgba(0, 0, 0, 0)")
            return "transparent";
        
        return color;
    }
    
    // parse string, returns Color
    function parseColor(str) {
        var result;

        // Look for rgb(num,num,num)
        if (result = /rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(str))
            return new Color(parseInt(result[1], 10), parseInt(result[2], 10), parseInt(result[3], 10));
        
        // Look for rgba(num,num,num,num)
        if (result = /rgba\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(str))
            return new Color(parseInt(result[1], 10), parseInt(result[2], 10), parseInt(result[3], 10), parseFloat(result[4]));
            
        // Look for rgb(num%,num%,num%)
        if (result = /rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(str))
            return new Color(parseFloat(result[1])*2.55, parseFloat(result[2])*2.55, parseFloat(result[3])*2.55);

        // Look for rgba(num%,num%,num%,num)
        if (result = /rgba\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(str))
            return new Color(parseFloat(result[1])*2.55, parseFloat(result[2])*2.55, parseFloat(result[3])*2.55, parseFloat(result[4]));
        
        // Look for #a0b1c2
        if (result = /#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(str))
            return new Color(parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16));

        // Look for #fff
        if (result = /#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(str))
            return new Color(parseInt(result[1]+result[1], 16), parseInt(result[2]+result[2], 16), parseInt(result[3]+result[3], 16));

        // Otherwise, we're most likely dealing with a named color
        var name = $.trim(str).toLowerCase();
        if (name == "transparent")
            return new Color(255, 255, 255, 0);
        else {
            result = lookupColors[name];
            return new Color(result[0], result[1], result[2]);
        }
    }
        
})(jQuery);
