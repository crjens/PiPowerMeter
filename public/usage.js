

var GetTimespanDate = function (timespan) {

    var start, end = new Date();
    if (timespan == 'Hour')
        start = new Date(end.getTime() - 1000 * 60 * 60);
    else if (timespan == 'Day')
        start = new Date(end.getTime() - 1000 * 60 * 60 * 24);
    else if (timespan == 'Week')
        start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 7);
    else if (timespan == 'Month') {
        if (end.getMonth() == 0)
            start = new Date(end.getFullYear() - 1, 11, end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
        else
            start = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
    }
    else if (timespan == 'Year') {
        start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds());
    }
    else if (timespan == 'Custom') {
        start = $("#start").datetimepicker('getDate');
        end = $("#end").datetimepicker('getDate');
    }
    else {
        start = end = null;
    }


    if (timespan != 'Custom') {
        if (start != null)
            $("#start").addClass('dontSelectCustom').datetimepicker('setDate', start).removeClass('dontSelectCustom');
        else
            $("#start").val('');

        if (end != null)
            $("#end").addClass('dontSelectCustom').datetimepicker('setDate', end).removeClass('dontSelectCustom');
        else
            $("#end").val('');
    }

    return { Start: start, End: end };
}


function labelFormatter(label, series) {
    var cost = "";
    
    if (_start != null && _end != null) {
        var kw = parseFloat(series.data[0][1]) / 1000.0;
        var timespanMs = _end.getTime() - _start.getTime();
        var hours = timespanMs / (1000 * 60 * 60);
        cost = "    ($" + parseFloat(kw * dollarsPerKWh * hours).toFixed(2) + ")";
    }
        
    //var cost = parseFloat(watts * dollarsPerKWh).toFixed(2);
    return "<div style='font-size:12pt; text-align:center; padding:2px; color: black;'>" +  label + "<br/>" + Math.round(series.percent) + "%" + cost + "</div>";
}

function labelFormatter2(label, series) {
    return "<div style='font-size:12pt; text-align:center; padding:2px; color: black;'>" + label + "<br/>" + series.data[0][1].toFixed(1) + " W</div>";
}

var options = {
	series: {
	    pie: {
	        show: true,
	        radius: 1,
	        label: {
	            show: true,
	            radius: 4 / 5,
	            threshold: 0.02,
	            formatter: labelFormatter,
	            background: {
	                //opacity: 0.5
	            }
	        }
	    }
	},
	legend: {
	    show: false
	},
	grid: { hoverable: true, clickable: true }
};

var data = [], dollarsPerKWh = 0.0, _start, _end, results = null;




$(document).ready(function () {
    $('input[type=radio][name=order]').change(function () {
        draw();
    });
});


var RefreshComparisonGraph = function (start, end, callback) {

    _start = start;
    _end = end;
    var placeholder = $("#placeholder3");
    placeholder.empty();
    data = [];

    placeholder.bind("plotclick", function (event, pos, item) {
        if (item) {
            var timespan = $('#Timespan option:selected').val();
            var timespanDate = GetTimespanDate(timespan);
            
            var url = "/circuit.html#channel=" + item.series.label + "&timespan=" + timespan;

            if (timespan == "Custom")
                url += "&start=" + timespanDate.Start.toISOString() + "&end=" + timespanDate.End.toISOString();

            window.location.href = url;
            //alert("" + item.series.label + ": " + percent + "%");
        }
    });


    placeholder.bind("plothover", function (event, pos, obj) {

        if (!obj) {
            $("#tooltip").hide();
        } else {

            var usage;
            var watts = obj.series.data[0][1];


            var kwh = watts / 1000.0;
            var costPerHour = "$" + parseFloat(kwh * dollarsPerKWh).toFixed(2);
            var costPerDay = "$" + parseFloat(kwh * dollarsPerKWh * 24).toFixed(2);
            var costPerMonth = "$" + parseFloat(kwh * dollarsPerKWh * 24 * 30).toFixed(2);
            var costPerYear = "$" + parseFloat(kwh * dollarsPerKWh * 24 * 365).toFixed(2);
            var min = 0, max = 0, avg = 0;

            // find min/max in data array
            for (var i = 0; i < data.length; i++) {
                if (data[i].label == obj.series.label) {
                    min = data[i].Min;
                    max = data[i].Max;
                    avg = data[i].Avg;
                }
            }

            //if (max < 1000)
            usage = min.toFixed(1) + ' / ' + avg.toFixed(1) + ' / ' + max.toFixed(1) + ' Watts (min/avg/max)';
            //else
            //  usage = (parseFloat(min) / 1000.0).toFixed(1) + " / " + (watts/1000).toFixed(1) + ' / ' + (max/1000).toFixed(1) + ' KW (min/avg/max)';

            $("#tooltip")
                .html("<span style='font-weight:bold; color:black;'>" + obj.series.label + "</span><span style='color:black;'><br/>Usage: " + usage + "<br/>Cost: " + costPerHour + " / " + costPerDay + " / " + costPerMonth + " / " + costPerYear + " (hr/day/month/year)</span>")
                .css({ top: pos.pageY + 5, left: pos.pageX + 5 })
		    	.fadeIn(200);
        }

    });

    if ($("#tooltip").length == 0) {
        $("<div id='tooltip'></div>").css({
            position: "absolute",
            display: "none",
            border: "1px solid #fdd",
            padding: "2px",
            "background-color": "#fee",
            opacity: 0.80
        }).appendTo("body");
    }

    var url = '/cumulative';
    if (start != null && end != null)
        url += '?start=' + start.getTime() + '&end=' + end.getTime();
    
    $.ajax({
        url: url,
        type: 'get',
        dataType: 'json',
        cache: false,
        success: function (res) {

            results = res;
            draw(callback);

        }
    });
}

var draw = function (callback) {
    if (results != null) {
        var placeholder = $("#placeholder3");
        var order = $('input[name=order]:checked').val();
        if (order != "Min" && order != "Max")
            order = "Watts";
        var result = results.result;
        var j = 0;
        totalWatts = 0;
        data = [];
        for (var i = 0; i < result.length; i++) {
            totalWatts += result[i].Watts;

            var val = result[i].Watts;
            if (order == "Min")
                val = result[i].Min;
            else if (order == "Max")
                val = result[i].Max;


            data[j++] = { label: result[i].CircuitId.toString(), data: val, Min: result[i].Min, Max: result[i].Max, Avg: result[i].Watts };
        }

        // sort descending
        data.sort(function (a, b) {
            if (a.data > b.data) return -1;
            if (a.data < b.data) return 1;
            return 0;
        });

        dollarsPerKWh = results.CostPerKWH;
        var kwh = totalWatts / 1000.0;
        var costPerMonth = "$" + parseFloat(kwh * dollarsPerKWh * 24 * 30).toFixed(2) + " / month";

        $('.header').text(results.DeviceName + " Power Meter: " + costPerMonth);


        if (data.length == 0) {
            placeholder.append("<h2>No Data found</h2>");
            //window.location.href = "/circuit.html";
        } else {
            if (order == "Watts")
                options.series.pie.label.formatter = labelFormatter;
            else
                options.series.pie.label.formatter = labelFormatter2;

            var plot = $.plot(placeholder, data, options);
            maxWatts = results.MaxWatts;
            currentWatts = totalWatts.toFixed(0);
            resizeGage(true);
        }
    }

    if ($.isFunction(callback))
        callback();
}

var lastWidth = 0, lastHeight = 0, currentWatts=0, maxWatts=0, gage=null;

var resizeGage = function (force) {
    var width = $(window).width();
    var height = $(window).height();

    if (force || ((width != lastWidth || height != lastHeight) && currentWatts > 0)) {
        lastHeight = height;
        lastWidth = width;

        var w = width / 5;
        if (w < 60)
            w = 60;

        var h = .8 * w;

        if ($("#gauge").length == 0) {
            $("<div id='gauge'></div>").css({
                position: "absolute",
                "background-color": "white",
                opacity: 0.90
            }).appendTo("body");
        }

        $("#gauge")
            .empty()
            .css({ width: w, height: h, top: $(window).height() - $('.footer').outerHeight() - h, left: $(window).width() - w });

        gage = new JustGage({
            id: "gauge",
            value: currentWatts,
            min: 0,
            max: maxWatts,
            title: "Watts"
        });
    }
}

var RedrawComparisonGraph = function () {
    var placeholder = $("#placeholder3");
    var plot = $.plot(placeholder, data, options);

    resizeGage(false);
}

   
