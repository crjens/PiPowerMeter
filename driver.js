var rollupTimeHr = 16;  // hour at which rollups are sent 16 == 4pm UTC which is 9 am PST
var _circuit = 0;
var costPerKWH = 0.0, deviceName="", region="en-US";
var configuration={};
var rollupEvent = null, runInterval = null;
var bootTime = new Date();

var db = require('./database');
var netUtils = require('./utils.js');
var fs = require("fs");
var mqtt = null, mqttClient = null;


Number.prototype.round = function (decimals) {
    return Number(Math.round(this + 'e' + decimals) + 'e-' + decimals).toFixed(decimals);
};


// load currently installed software version and check for updates every hour
var exec = require('child_process').exec, softwareVersion = null;
(function checkForUpdates() {
    try {
        exec("git log -1 --format='%H %ad'", function (error, stdout, stderr) {
            if (error)
                console.error('unable to fetch installed software version: ' + error);
            else {
                try {
                    var pos = stdout.trim().indexOf(" ");
                    var currentSha = stdout.trim().substring(0, pos);
                    var currentDate = (new Date(stdout.trim().substring(pos))).toISOString();

                    console.log('currentSha: ' + currentSha);
                    console.log('currentDate: ' + currentDate);
            
                    var obj = { Installed: { Sha: currentSha, Timestamp: currentDate } };

                    // get latest commit from github
                    exec("curl https://api.github.com/repos/crjens/pipowermeter/git/refs/heads/master", function (error, stdout, stderr) {
                        if (error)
                            console.error('unable to fetch latest commit from github: ' + error);
                        else {
                            try {
                                var json = JSON.parse(stdout.trim());
                                var latestSha = json.object.sha;
                                console.log('latest software version: ' + latestSha);

                                if (currentSha == latestSha) {
                                    console.log('software is up to date - will periodically check for updates');
                                    obj.Latest = { Sha: currentSha, Timestamp: currentDate };
                                    obj.UpdateRequired = false;
                                    softwareVersion = obj;
                                } else {

                                    // load actual commit to get date
                                    exec("curl " + json.object.url, function (error, stdout, stderr) {
                                        if (error)
                                            console.error('unable to fetch commit ' + latestSha + ' from github: ' + error);
                                        else {
                                            try {
                                                var json = JSON.parse(stdout.trim());

                                                console.log('latest software date: ' + json.author.date);

                                                obj.Latest = { Sha: json.sha, Timestamp: json.author.date };
                                                obj.UpdateRequired = true;
                                            } catch (err)
                                            {
                                                console.error("Error checking for updates during latest commit proceesing: " + err);
                                            }
                                        }
                                        softwareVersion = obj;
                                    });
                                }
                            } catch (err) {
                                console.error("Error checking for updates during latest commit processing: " + err);
                            }

                        }
                    });
                } catch (err) {
                    console.error("Error checking for updates during git log processing: " + err);
                }
            }
        });
    } catch (err) {
        console.error("Error checking for updates: " + err);
    }

    setTimeout(checkForUpdates, 1000 * 60 * 60);
})();


var FindProbeFactor = function (probeId) {
    if (configuration.Probes != null) {
        for (var i = 0; i < configuration.Probes.length; i++) {
            if (configuration.Probes[i].Name == probeId)
                return configuration.Probes[i].Factor;
        }
    }

    return null;
}

var loadConfiguration = function (callback) {

    console.log('loading configuration...');
    // load circuits and filter out disabled ones
    db.getCircuits(function (err, data) {
        if (err) {
            console.log(err);
        } else {
            /*Mode = data.Mode;
            Config = data.Config;
	        CycleCount = data.CycleCount;
            vFactor = data.VoltageScale;
            HardwareVersion = data.HardwareVersion;*/
            configuration.Probes = data.Probes;
            for (var i = 0; i < data.Circuits.length; i++) {
                data.Circuits[i].InstantEnabled = data.Circuits[i].Enabled;

                // set probe factors
                for (var j = 0; j < data.Circuits[i].Probes.length; j++) {
                    data.Circuits[i].Probes[j].iFactor = FindProbeFactor(data.Circuits[i].Probes[j].Type);
                    data.Circuits[i].Probes[j].vFactor = data.Configuration.VoltageScale;
                }
            }
            configuration.Circuits = data.Circuits;
            deviceName = data.Configuration.DeviceName;

            //console.log("configuration: " + JSON.stringify(configuration));
            //console.log("configuration.Circuits: " + JSON.stringify(configuration.Circuits));

            var port = data.Configuration.Port;
            netUtils.InitializeTwilio(data.Configuration.Text, data.Configuration.Twilio, data.Configuration.TwilioSID, data.Configuration.TwilioAuthToken, deviceName, port);

            console.log('mqtt: ' + data.Configuration.MqttServer);
            if (data.MqttServer != null) {
                try{
                    mqtt = require('mqtt');
                    mqttClient = mqtt.connect(data.Configuration.MqttServer);
                }
                catch (err) {
                    mqttClient = null;
                    console.error("Error initializing MQTT server: " +  data.Configuration.MqttServer + ".  Error: " + err);
                }
            } else {
                mqttClient = null;
            }
        }

        if (callback != null)
            callback(err, data.Configuration);
    });
}

var scheduleNextRollupMessage = function () {
    var now = new Date();
    var ms = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rollupTimeHr, 0, 0, 0) - now;
    //var ms = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0) - now;

    if (ms < 0)
        ms += 86400000; // it's after time wait till tomorrow.
	//ms += 3600000; // it's after time wait till next hour

    console.log("next rollup in: " + ms);

    if (rollupEvent != null)
	clearTimeout(rollupEvent);

    rollupEvent = setTimeout(function() {
	 rollupEvent=null;
         sendRollupText(function() {
		scheduleNextRollupMessage();
	 });
	
    }, ms);
}

var sendRollupText = function (callback) {

    var d = new Date();
    var curr_date = d.getDate();
    var curr_month = d.getMonth() + 1; //Months are zero based
    var curr_year = d.getFullYear();

    console.log("sending rollup mail");

    db.rollup(function (err, data) {
        var message = "Rollup for " + curr_month + "/" + curr_date + "/" + curr_year;
        if (err) {
		console.log('error sending rollup: ' + err);
	} else {

            console.log(JSON.stringify(data));

            message += "\nToday: " + (data.LastDay * 24 / 1000).round(1) + " KWh\n30 day avg: " + (data.LastMonth * 24 / 1000).round(1) + " KWh";

            for (var i = 0; i < data.Circuits.length; i++)
                message += ("\n" + data.Circuits[i].CircuitId + ": " + (data.Circuits[i].Watts * 24 / 1000).round(1) + " KWh");
            console.log('rollup: ' + message);

            netUtils.sendText(message);
	}
	
	if (callback)
		callback();
    });
}


function getFilesizeInBytes(filename) {
    var stats = fs.statSync(filename);
     var fileSizeInBytes = stats["size"];
     return fileSizeInBytes;
}

// schedule rollup message
scheduleNextRollupMessage();


var NextCircuit = function () {
    if (configuration != null && configuration.Circuits != null && configuration.Circuits.length > 0) {

        while (_circuit < configuration.Circuits.length && !configuration.Circuits[_circuit].InstantEnabled)
            _circuit++;

        if (_circuit >= configuration.Circuits.length) {
            _circuit = 0;

            while (_circuit < configuration.Circuits.length && !configuration.Circuits[_circuit].InstantEnabled)
                _circuit++;

            if (_circuit >= configuration.Circuits.length) {
                console.log("no circuits are enabled");
                return null;
            }
        }

        return configuration.Circuits[_circuit++];
    }
    return null;
}

var ReadNext = function () {
    if (_running) {
        var circuit = NextCircuit();
        if (circuit != null) {
            reader.send({ Action: "Read", CircuitId: circuit.id, Probes: circuit.Probes });
        } else {
            // schedule another read later
            setTimeout(ReadNext, 1000);
        }
    }
}

var FindCircuit = function (circuitId) {
    if (configuration != null && configuration.Circuits != null) {
        for (var i = 0; i < configuration.Circuits.length; i++) {
            if (configuration.Circuits[i].id == circuitId) {
                return configuration.Circuits[i];
            }
        }
    }

    return null;
}

var FindProbeOffset = function (circuit, probeId) {
    for (var p = 0; p < circuit.Probes.length; p++) {
        if (circuit.Probes[p].id == probeId) {
            return p;
        }
    }

    return null;
}

var GetProbeAlertTime = function (probe) {
    if (probe == null || probe.Alert == null || probe.Alert.indexOf(",") == -1)
        return -1;

    var index = probe.Alert.indexOf(",");

    // min alert time is 30 minutes
    return Math.max(30, Number(probe.Alert.substring(0, index)));
}

var GetProbeAlertThreshold = function (probe) {
    if (probe == null || probe.Alert == null || probe.Alert.indexOf(",") == -1)
        return 0;

    var index = probe.Alert.indexOf(",");

    return Number(probe.Alert.substring(index+1));
}

// create reader process
var reader = require('child_process').fork(__dirname + '/reader.js');
console.log('spawned reader with pid: ' + reader.pid);
var frequency = "unknown";

// Process read results from child process
reader.on('message', function (data) {

    // copy out frequency
    frequency = data.Frequency;

    // find circuit
    var circuit = FindCircuit(data.CircuitId);

    if (circuit != null) {
        circuit.Samples = [];
        var pTotal=0, qTotal=0, overloadMsg = null;
        for (var i = 0; i < data.Probes.length; i++) {

            // update each probe
            var probe = data.Probes[i];

            if (probe.Result != null) {
                var offset = FindProbeOffset(circuit, probe.id);

                if (offset != null) {
                    circuit.Samples[offset] = probe.Result;
                    pTotal += probe.Result.pAve;
                    qTotal += probe.Result.qAve;
                }

                // check for overload
                if (probe.Breaker > 0 && probe.Result.iRms > probe.Breaker && (circuit.OverloadWarningSent == null || ((new Date()) - circuit.OverloadWarningSent) > 1000 * 60 * 60)) {
                    if (overloadMsg == null) overloadMsg = "";
                    overloadMsg += " [Probe: " + i + ": iRms = " + probe.Result.iRms.round(1) + " amps / breaker = " + probe.Breaker + " amps]";
                }

                // check for alert
                var alertTime = GetProbeAlertTime(probe);
                if (alertTime >= 0) {
                    if (circuit.AlertLevelExceeded == null) {
                        circuit.AlertLevelExceeded = new Date();
                        circuit.AlertTotalWatts = 0;
                        circuit.AlertTotalSamples = 0;
                    }

                    if (probe.Result.pAve < GetProbeAlertThreshold(probe)) {
                        circuit.AlertLevelExceeded = new Date();
                        circuit.AlertTotalWatts = 0;
                        circuit.AlertTotalSamples = 0;
                    } else {

                        circuit.AlertTotalWatts += probe.Result.pAve;
                        circuit.AlertTotalSamples++;

                        if ((circuit.AlertWarningSent == null || ((new Date()) - circuit.AlertWarningSent) > 1000 * 60 * alertTime)) {// && ((new Date()) - circuit.AlertLevelExceeded) > 1000 * 60 * alertTime) {
                            var elapsed = ((new Date()) - circuit.AlertLevelExceeded) / (1000 * 60);
                            var avgWatts = circuit.AlertTotalWatts / circuit.AlertTotalSamples;
                            //var msg = "Alert: " + circuit.Name + " has exceeded the threshold of " + GetProbeAlertThreshold(probe) + " watts for " + elapsed.round(0) + " minutes";
                            var msg = "Alert: Threshold exceeded on " + circuit.Name + " averaged " + avgWatts.round(1) + " watts for " + elapsed.round(0) + " minutes";
                            console.log(msg);
                            netUtils.sendText(msg);
                            circuit.AlertWarningSent = new Date();
                        }
                    }
                }
            }
        }

        circuit.pTotal = Number(pTotal);
        circuit.qTotal = Number(qTotal);

        // send text if overloaded
        if (overloadMsg != null) {
            circuit.OverloadWarningSent = new Date();
            var msg = "Overload on " + circuit.Name + overloadMsg;
            console.log(msg);
            netUtils.sendText(msg);
        }
        
        if (circuit.Samples.length > 0) {
            //console.log(JSON.stringify(circuit.Samples[0]));
            db.insert(circuit.id, circuit.Samples[0].iRms, circuit.Samples[0].vRms, pTotal, qTotal, circuit.Samples[0].pf, new Date(circuit.Samples[0].ts), circuit.Samples[0].CalculatedFrequency);
            console.log(circuit.Name + ' : V= ' + circuit.Samples[0].vRms.round(1) + '  I= ' + circuit.Samples[0].iRms.round(1) + '  P= ' + pTotal.round(1) + '  Q= ' + qTotal.round(1) + '  PF= ' + circuit.Samples[0].pf.round(4) + '  F= ' + circuit.Samples[0].CalculatedFrequency.round(3) + '  F2= ' + circuit.Samples[0].freq.round(3) + ' (' + circuit.Samples[0].tsInst.length + ' samples in ' + circuit.Samples[0].tsInst[circuit.Samples[0].tsInst.length-1] + 'ms)'); 

            if (mqttClient != null) {
                try {
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Name', circuit.Name);
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Voltage', circuit.Samples[0].vRms.round(1));
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Current', circuit.Samples[0].iRms.round(2));
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Watts', pTotal.round(1));
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Vars', qTotal.round(1));
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/PowerFactor', circuit.Samples[0].pf.round(4));
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Timestamp', circuit.Samples[0].ts);
                    mqttClient.publish('PiPowerMeter/' + circuit.id + '/Frequency', circuit.Samples[0].CalculatedFrequency.round(3));
                    if (circuit.LastDayKwh != null)
                        mqttClient.publish('PiPowerMeter/' + circuit.id + '/LastDayKwh', circuit.LastDayKwh.round(1));
                }
                catch (err) {
                    console.error("Error writing to MQTT server: " + data.MqttServer + ".  Error: " + err);
                }
            }
        } else {
            console.log(circuit.Name + ' ********* Read operation failed *******');
        }
    }

    // start next read
    ReadNext();

    // keep 24hr avg up to date
    updateState();
});



function numberWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}


var realtimeTimer = null;

function ResetRealtimeTimer() {

    if (realtimeTimer != null) {
        clearTimeout(realtimeTimer);
    }

    realtimeTimer = setTimeout(function () {
        for (var i = 0; i < configuration.Circuits.length; i++) {
            configuration.Circuits[i].InstantEnabled = configuration.Circuits[i].Enabled;
        }
        realtimeTimer = null;
    }, 30000);
}

var _running = false;
var Start = function () {
    _running = true;

    // Kick off the main read loop
    loadConfiguration(function (err, config) {
        if (err) {
            console.log('unable to load configuration: ' + err);
        } else {
            reader.send({ Action: "Start", Configuration: config/*, HardwareVersion: HardwareVersion, Mode: Mode, Config: Config, CycleCount: CycleCount*/ });
            ReadNext();
        }
    });

    
}

var Stop = function () {
    _running = false;
    console.log('sending Stop to reader...');
    reader.send({ Action: "Stop"});
    console.log('running: sudo kill -9 ' + reader.pid);

    var exec = require('child_process').exec;
    exec('sudo kill -9 ' + reader.pid, function (error, stdout, stderr) {
        if (err)
            console.log('failed to kill reader');
        else
            console.log('killed reader');
    });
}


var timeSince = function (date) {
    if (typeof date !== 'object') {
        date = new Date(date);
    }

    var seconds = Math.floor((new Date() - date) / 1000);
    var intervalType;

    var interval = Math.floor(seconds / 31536000);
    if (interval >= 1) {
        intervalType = 'year';
    } else {
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) {
            intervalType = 'month';
        } else {
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) {
                intervalType = 'day';
            } else {
                interval = Math.floor(seconds / 3600);
                if (interval >= 1) {
                    intervalType = "hour";
                } else {
                    interval = Math.floor(seconds / 60);
                    if (interval >= 1) {
                        intervalType = "minute";
                    } else {
                        interval = seconds;
                        intervalType = "second";
                    }
                }
            }
        }
    }

    if (interval > 1 || interval === 0) {
        intervalType += 's';
    }

    return interval + ' ' + intervalType;
};

var stateLastUpdated = 0;
var updateState = function () {
    var now = new Date(); // now
    var msPerHour = 1000 * 60 * 60;
    if (stateLastUpdated < now.getTime() - msPerHour) {
        stateLastUpdated = now.getTime();

        var start = new Date(now - (msPerHour * 24)); // 24hr ago
        var telemetry = [];
        var CalcLastDayKwh = function(id)
        {
            db.minmaxavg(id, start, now, telemetry, function (err, result) {
                if (result) {
                    var circuit = FindCircuit(id);
                    if (circuit != null) {
                        var kwh = (result[0].avg || 0) / 1000.0 * 24.0;
                        console.log("setting lastkwh for ckt: " + id + " to " + kwh);
                        circuit.LastDayKwh = kwh;
                    } else {
                        stateLastUpdated = 0;
                    }
                } else {
                    console.log("failed to set kwh for ckt: " + id);
                }
            });
        }


        for (var i = 0; i < configuration.Circuits.length; i++) {
            CalcLastDayKwh(configuration.Circuits[i].id);
        }
    }
};



var exports = {
    // waveform
    ReadCircuit: function (circuitId) {
        for (var i = 0; i < configuration.Circuits.length; i++) {
            if (configuration.Circuits[i].id == circuitId) {
                configuration.Circuits[i].DeviceName = deviceName || "";
                return configuration.Circuits[i];
            }
        }
        return null;
    },
    // return inst power on circuit and Kwh used in last day
    ReadState: function (circuitId) {

        var circuit = FindCircuit(circuitId);
        if (circuit != null) {
            
            var res = { current: circuit.pTotal, last24Kwh: circuit.LastDayKwh };
            console.log("returning : " + JSON.stringify(res));
            return res;
        }
        
        return null;
    },
    UpdateCircuitEnabled: function (circuitId, enabled) {
        if (circuitId == 'all' && enabled == 1) {
            console.log('resetting enabled flag');
            for (var i = 0; i < configuration.Circuits.length; i++) {
                configuration.Circuits[i].InstantEnabled = configuration.Circuits[i].Enabled;
            }
        } else {
            for (var i = 0; i < configuration.Circuits.length; i++) {
                if (circuitId == 'all' || configuration.Circuits[i].id == circuitId) {
                    var initial = configuration.Circuits[i].InstantEnabled;
                    configuration.Circuits[i].InstantEnabled = parseInt(enabled, 10);

                    console.log("ctk: " + i + " initial: " + initial + "   final: " + configuration.Circuits[i].InstantEnabled);
                }
            }
            ResetRealtimeTimer();
        }
        
    },
    Readings: function () {

        ResetRealtimeTimer();

        var result = [];
        for (var i = 0; i < configuration.Circuits.length; i++) {
            var ckt = configuration.Circuits[i];

            if (ckt.Samples != null && ckt.Samples.length > 0) {

                var w = [], a = [], v = [], q = [], pf = [], l = [], ts = [], probe = [], breaker=[], f=[];
                for (var p = 0; p < ckt.Probes.length; p++) {
                    w.push(Number(ckt.Samples[p].pAve));
                    a.push(Number(ckt.Samples[p].iRms));
                    probe.push(ckt.Probes[p].id);
                    breaker.push(Number(ckt.Probes[p].Breaker));
                    v.push(Number(ckt.Samples[p].vRms));
                    q.push(Number(ckt.Samples[p].qAve));
                    pf.push(Number(ckt.Samples[p].pf));
                    l.push(Number(ckt.Samples[p].iRms / ckt.Probes[p].Breaker));
                    ts.push(ckt.Samples[p].ts);
                    f.push(Number(ckt.Samples[p].CalculatedFrequency));
                }

                if (ckt.Probes.length > 1) {
                    w.push(Number(ckt.pTotal));
                    q.push(Number(ckt.qTotal));
                    probe.push("All");
                }

                result.push({
                    id: ckt.id,
                    name: ckt.Name,
                    breaker: breaker,
                    enabled: ckt.InstantEnabled,
                    watts: w,
                    amps: a,
                    probe: probe,
                    volts: v,
                    q: q,
                    pf: pf,
                    timestamp: ts,
                    f: f,
                    load: l,
		            region: region
                });
            }
        }
        return { Readings: result, DeviceName: deviceName } ;
    },
    ReadPower: function (circuitId, start, end, groupBy, timeOffset, telemetry, callback) {
        db.read(circuitId, start, end, groupBy, timeOffset, telemetry, function (err, result) {
            if (err) {
                callback(err);
            } else {
                if (result != null) {
                    result.Cost = costPerKWH;
                    result.Region = region;
                    result.DeviceName = deviceName;
                }

                // get min, max and average over interval       
                db.minmaxavg(circuitId, start, end, telemetry, function (err2, result2) {
                    if (result2) {
                        result.min = result2[0].min || 0;
                        result.max = result2[0].max || 0;
                        result.avg = result2[0].avg || 0;
                    }

                    callback(err2, result);
                });
            }
        });
    },
    GetCircuits: function (callback, strip) {
        db.getCircuits(function (err, _config) {
            if (_config != null) {
                costPerKWH = _config.Price;
                if (costPerKWH <= 0)
                    costPerKWH = 0.1; // default to 10 / KWh

                region = _config.Region;
                if (region == null || region == "")
                    region = "en-US"; // default

                if (_config.DeviceName != null)
                    deviceName = _config.DeviceName;

                if (softwareVersion != null)
                    _config.SoftwareVersion = softwareVersion;

                _config.Uptime = timeSince(bootTime);
                _config.DatabaseSize = numberWithCommas(getFilesizeInBytes('powermeter.db'));
                _config.Frequency = frequency;
                callback(err, _config);

            } else {
                callback(err);
            }
        }, strip);
    },
    Cumulative: function (start, end, orderBy, telemetry, callback) {
        db.cumulative(start, end, orderBy, telemetry, function (err, result) {

            var results = {};
            results.result = result;
            results.DeviceName = deviceName;

            db.minmaxavg("(select id from Circuits where IsMain=1)", start, end, telemetry, function (err, _val) {
                if (_val != null && _val.length == 1) {
                    results.MaxWatts = _val[0].max;
                    results.AvgWatts = _val[0].avg;
                    results.MinWatts = _val[0].min;
                }
                else {
                    results.MaxWatts = 0.0;
                    results.AvgWatts = 0.0;
                    results.MinWatts = 0.0;
                }
                    

                if (costPerKWH == 0) {
                    db.getCostPerKWh(function (err, cost, _region) {
                        if (cost != null && cost.length == 1)
                            costPerKWH = cost[0].Value;

                        if (_region != null && _region.length == 1)
                            region = _region[0].Value;

                        results.CostPerKWH = costPerKWH;
                        results.Region = region;
                        callback(err, results);
                    });
                } else {
                    results.CostPerKWH = costPerKWH;
                    results.Region = region;
                    callback(err, results);
                }
            });
        });
    },
    Reset: function () {
        Reset();
        return 0;
    },
    ReplaceConfiguration: function (callback, config) {
        db.updateCircuits(config, function (err) {
            //loadConfiguration();
            Stop();
            Start();
            callback(err);
        });
    },
    DeleteCircuit: function (callback, circuitId) {
        db.deleteCircuit(function (err) {
            loadConfiguration();
            callback(err);
        }, circuitId);
    },
    DeleteProbe: function (callback, probeId) {
        db.deleteProbe(function (err) {
            loadConfiguration();
            callback(err);
        }, probeId);
    },
    ReplaceProbeDefConfiguration: function (callback, config) {

        var array = [];
        for (var name in config) {
            array.push({ name: name, value: config[name] });
        }


        var setVal = function (index) {
            if (index < array.length) {
                var name = array[index].name;
                var value = array[index].value;

                if (Object.prototype.toString.call(value) === '[object Array]') {
                    value = JSON.stringify(value);
                }

                db.setConfig(name, value, function (err) {
                    if (!err)
                        setVal(index + 1);  // next
                    else
                        callback(err);  // error
                });
            } else {
                loadConfiguration(function (err) {
                    callback(err);  // finished
                });
            }
        }
        setVal(0);
    },
    Stop: function () {
        Stop();
    },
    Start: function () {
        Start();
    }
};

module.exports = exports;
