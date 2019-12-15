function GetDateTime() {
    picker = $('#reportrange').data('daterangepicker')
    start = picker.startDate.toDate()
    end = picker.endDate.toDate()
    timespan = _label
    return { Start: start, End: end, timespan: timespan }
}

var _label = "";
$(document).ready(function () {

    $('#reportrange').daterangepicker({
        startDate: moment().subtract(1, 'hours'),
        endDate: moment(),
        //maxDate: moment(),
        drops: 'up',
        opens: 'center',
        autoApply: true,
        linkedCalendars: false,
        showDropdowns: true,
        autoUpdateInput: true,
        timePicker: true,
        ranges: {
            'Instant': [moment(), moment()],
            'Hour': [moment().subtract(1, 'hours'), moment()],
            'Day': [moment().subtract(1, 'days'), moment()],
            'Week': [moment().subtract(1, 'weeks'), moment()],
            'Month': [moment().subtract(1, 'months'), moment()],
            'Year': [moment().subtract(1, 'years'), moment()]
        }
    });

    $('#reportrange').on('apply.daterangepicker', function(ev, picker) {
        UpdateDateTime(picker.startDate, picker.endDate, picker.chosenLabel)
      });
});

function InitializeDateTime(start, end, label) {
    e = s = moment()
    if (label == "Hour")
        s = moment().subtract(1, 'hours')
    else if (label == "Day")
        s = moment().subtract(1, 'days')
    else if (label == "Week")
        s = moment().subtract(1, 'weeks')
    else if (label == "Month")
        s = moment().subtract(1, 'months')
    else if (label == "Year")
        s = moment().subtract(1, 'years')
    else if (label == "Custom") {
        s = moment(start)
        e = moment(end)
    } else {
        label = "Instant"
    }

    picker = $('#reportrange').data('daterangepicker')
    picker.setStartDate(s);
    picker.setEndDate(e);

    UpdateDateTime(s,e,label)
}

function UpdateDateTime(start, end, label) {
    _label = label
    if (_label.includes("Custom")) {
        _label = "Custom";
        $('#reportrange span').html(start.format("L") + ' - ' + end.format("L"));
    } else {
        $('#reportrange span').html(_label);
    }
    refresh();
}