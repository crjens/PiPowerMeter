
var toCurrency = function (amount) {
    return Globalize().format(amount, "c", Region);
}

var toFloat = function (amount, fixed) {
    return Globalize().format(amount, 'n' + fixed, Region);
}

function labelFormatter(label, series) {
    var cost = "";

    if (_start != null && _end != null) {
        var kw = parseFloat(series.data[0][1]) / 1000.0;
        var timespanMs = _end.getTime() - _start.getTime();
        var hours = timespanMs / (1000 * 60 * 60);
        cost = "    (" + toCurrency(kw * dollarsPerKWh * hours) + ")";
    }

    return "<div style='font-size:12pt; text-align:center; padding:2px; color: black;'>" + label + "<br/>" + toFloat(series.percent, 0) + "%" + cost + "</div>";
}

function labelFormatter2(label, series) {
    return "<div style='font-size:12pt; text-align:center; padding:2px; color: black;'>" + label + "<br/>" + toFloat(series.data[0][1], 1) + " W</div>";
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
var Region = "en-US";  // for currency format



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
            var dateTime = GetDateTime();

            var url = "/circuit.html#channel=" + item.series.label + "&timespan=" + dateTime.timespan;

            if (timespan == "Custom")
                url += "&start=" + dateTime.Start.toISOString() + "&end=" + dateTime.End.toISOString();

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
            var costPerHour = toCurrency(kwh * dollarsPerKWh);
            var costPerDay = toCurrency(kwh * dollarsPerKWh * 24);
            var costPerMonth = toCurrency(kwh * dollarsPerKWh * 24 * 30);
            var costPerYear = toCurrency(kwh * dollarsPerKWh * 24 * 365);

            var min = 0, max = 0, avg = 0;

            // find min/max in data array
            for (var i = 0; i < data.length; i++) {
                if (data[i].label == obj.series.label) {
                    min = data[i].Min;
                    max = data[i].Max;
                    avg = data[i].Avg;
                }
            }

            usage = toFloat(min, 1) + ' / ' + toFloat(avg, 1) + ' / ' + toFloat(max, 1) + ' Watts (min/avg/max)';

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
    if (start != null && end != null && start.getTime() != end.getTime())
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
            if (result[i].Watts > 0) {   // ignore negative values
                totalWatts += result[i].Watts;

                var val = result[i].Watts;
                if (order == "Min")
                    val = result[i].Min;
                else if (order == "Max")
                    val = result[i].Max;


                data[j++] = { label: result[i].CircuitId.toString(), data: val, Min: result[i].Min, Max: result[i].Max, Avg: result[i].Watts };
            }
        }

        // sort descending
        data.sort(function (a, b) {
            if (a.data > b.data) return -1;
            if (a.data < b.data) return 1;
            return 0;
        });

        dollarsPerKWh = results.CostPerKWH;
        Region = results.Region;
        var kwh = totalWatts / 1000.0;
        var costPerMonth = toCurrency(kwh * dollarsPerKWh * 24 * 30) + " / month";

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
        }
    }

    if ($.isFunction(callback))
        callback();
}

var RedrawComparisonGraph = function () {
    var placeholder = $("#placeholder3");
    var plot = $.plot(placeholder, data, options);
}


