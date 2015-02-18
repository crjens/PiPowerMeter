var rollupTimeHr = 16;  // hour at which rollups are sent 16 == 4pm UTC which is 9 am PST
var HardwareVersion=0, probes = [], vFactor;
var samples = 500;   // number of instantaneous voltage and current samples to collect for each measurement
var bytesPerSample = 10;
var OutputPins, InputPins;
var sampleBuffer = new Buffer(samples * bytesPerSample);
var circuit = 0, Mode, Config;
var costPerKWH = 0.0, deviceName="";
var configuration={};
var rollupEvent = null, runInterval = null;

var Registers = {
    RealPower: 10,
    RmsCurrent: 11,
    RmsVoltage: 12,
    Epsilon: 13, // line frequency ratio
    AveReactivePower: 20,
    PeakCurrent: 22,
    PeakVoltge: 23,
    PowerFactor: 25
};

var cs5463 = null; 
var db = require('./database');
var netUtils = require('./utils.js');
var fs = require("fs");

// comment below line for WebMatrix testing
var cs5463 = require( "cs5463" );
       

// load currently installed software version and check for updates every hour
var exec = require('child_process').exec, softwareVersion = null;
(function checkForUpdates(){
    exec("git log -1 --format='%H %ad'", function (error, stdout, stderr) {
        if (error)
            console.error('unable to fetch installed software version: ' + error);
        else {

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
                                var json = JSON.parse(stdout.trim());

                                console.log('latest software date: ' + json.author.date);

                                obj.Latest = { Sha: json.sha, Timestamp: json.author.date };
                                obj.UpdateRequired = true;
                            }
                            softwareVersion = obj;
                        });
                    }

                }
            });
            

            //exec("curl https://api.github.com/repos/crjens/pipowermeter/commits", function (error, stdout, stderr) {
            //    if (error)
            //        console.error('unable to fetch commits from github: ' + error);
            //    else {
            //        //console.log('commits: ' + stdout);

            //        var json = JSON.parse(stdout.trim());

            //        console.log('latest software version: ' + json[0].sha);

            //        obj.Latest = { Sha: json[0].sha, Timestamp: json[0].commit.author.date };
            //        obj.UpdateRequired = (obj.Installed.Sha != obj.Latest.Sha);

            //        for (var i = 0; i < json.length; i++) {
            //            if (json[i].sha == obj.Installed.Sha) {
            //                obj.Installed.Timestamp = json[i].commit.author.date;
            //                break;
            //            }
            //        }

            //        console.log("version: " + JSON.stringify(obj));

            //        softwareVersion = obj;
            //    }
            //});
        }
    });

    setTimeout(checkForUpdates, 1000 * 60 * 60);
})();

var loadConfiguration = function (callback) {

    console.log('loading configuration...');
    // load circuits and filter out disabled ones
    db.getCircuits(function (err, data) {
        if (err) {
            console.log(err);
        } else {
            Mode = data.Mode;
            Config = data.Config;
            vFactor = data.VoltageScale;
            HardwareVersion = data.HardwareVersion;
            configuration.Probes = data.Probes;
            for (var i = 0; i < data.Circuits.length; i++) {
                data.Circuits[i].InstantEnabled = data.Circuits[i].Enabled;
            }
            configuration.Circuits = data.Circuits;
            deviceName = data.DeviceName;

            //console.log("configuration.Probes: " + JSON.stringify(configuration.Probes));
            //console.log("configuration.Circuits: " + JSON.stringify(configuration.Circuits));

            netUtils.InitializeTwilio(data.Text, data.Twilio, data.TwilioSID, data.TwilioAuthToken, deviceName);
        }

        if (callback != null)
            callback(err);

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

            message += "\nToday: " + (data.LastDay * 24 / 1000).toFixed(1) + " KWh\n30 day avg: " + (data.LastMonth * 24 / 1000).toFixed(1) + " KWh";

            for (var i = 0; i < data.Circuits.length; i++)
                message += ("\n" + data.Circuits[i].CircuitId + ": " + (data.Circuits[i].Watts * 24 / 1000).toFixed(1) + " KWh");
            console.log('rollup: ' + message);

            netUtils.sendText(message);
	}
	
	if (callback)
		callback();
    });
}

var sleep = function (delayMs) {
    var s = new Date().getTime();
    while ((new Date().getTime() - s) < delayMs) {
        //do nothing
        //console.log('sleeping');
    }
}

var command = function (cmd, desc) {
    cs5463.send(cmd);
    if(desc!=null)
        console.log('command: ' + desc + '(' + cmd + ')')
}

var write = function (cmd, desc) {
    cs5463.send(cmd);
    if(desc!=null)
        console.log('write: ' + desc + '(' + cmd + ')')
}

var read = function (register, desc) {

    var cmd = (register << 1).toString(16) + 'FFFFFF';
    while (cmd.length < 8)
        cmd = '0' + cmd;
    //console.log('cmd: ' + cmd)

    var result = cs5463.send(cmd);
    var ret = new Buffer(result, 'hex').slice(1);

    if (desc != null)
        console.log('read: ' + desc + '(' + cmd + ') -> ' + ret.toString('hex')); // + '  ' + result);

    return ret;
}

var getCommand = function (register) {
    var c = (register << 1).toString(16);
    if (c.length == 1)
        c = '0' + c;
    return c + 'FFFFFF';
}

var makeReadCommand = function (registers) {
    var cmd = "";
    if (registers instanceof Array) {
        for (var i = 0; i < registers.length; i++) {
            cmd += getCommand(registers[i]);
        }
    } else {
        cmd = getCommand(registers);
    }

    return cmd;
}

var convert = function (buffer, binPt, neg) {

    var power = binPt;
    var result = 0;
    for (var i = 0; i < 3; i++) {
        var byte = buffer[i];
        //console.log(byte.toString())

        for (var j = 7; j >=0; j--) {
            if (byte & (1 << j)) {

                var x;

                if (neg && i == 0 && j == 7)
                    x = -Math.pow(2, power);
                else
                    x = Math.pow(2, power);

                result += x;
                //console.log('(' + i + ',' + j + ')' + x);
            }
            power--;
        }
    }

    return result;
}

// board should be 0-7
// currentchannel should be 0-15
// voltagechannel should be 0-1
var SetCircuit = function (board, currentChannel, voltageChannel) {

//console.log('set: ' + board + ', ' + currentChannel + ', ' + voltageChannel);
    if (board < 0 || board > 8) {
        console.log('Invalid board: ' + board);
        return;
    }

    if (currentChannel < 0 || currentChannel > 15) {
        console.log('Invalid current channel: ' + currentChannel);
        return;
    }

    if (voltageChannel < 0 || voltageChannel > 1) {
        console.log('Invalid voltage channel: ' + voltageChannel);
        return;
    }

    // disable
    cs5463.DigitalWrite(OutputPins.disable, 1);

    // set board
    cs5463.DigitalWrite(OutputPins.board0, (board & 0x1));
    cs5463.DigitalWrite(OutputPins.board1, (board & 0x2));
    cs5463.DigitalWrite(OutputPins.board2, (board & 0x4));

    // set current channel
    cs5463.DigitalWrite(OutputPins.channel0, (currentChannel & 0x1));
    cs5463.DigitalWrite(OutputPins.channel1, (currentChannel & 0x2));
    cs5463.DigitalWrite(OutputPins.channel2, (currentChannel & 0x4));
    cs5463.DigitalWrite(OutputPins.channel3, (currentChannel & 0x8));

    // set voltage channel
    cs5463.DigitalWrite(OutputPins.voltage0, (voltageChannel & 0x1));
    if (HardwareVersion == 1.2) {
        cs5463.DigitalWrite(OutputPins.voltage1, (voltageChannel & 0x2));
    }

    // enable
    cs5463.DigitalWrite(OutputPins.disable, 0);
}

var FindProbeFactor = function (probeId) {
    if (configuration.Probes != null) {
        for (var i = 0; i < configuration.Probes.length; i++) {
            if (configuration.Probes[i].Name == probeId)
                return configuration.Probes[i].Factor;
        }
    }

    return null;
}

var ReadCircuit = function (circuit, probes2) {

    var readings = [];
    var overloadMsg=null;
    for (var i = 0; i < circuit.Probes.length; i++) {

        var probe = circuit.Probes[i];
        var probefactor = FindProbeFactor(probe.Type);

        if (probe != null) {
            SetCircuit(probe.Board, probe.CurrentChannel, probe.VoltageChannel);

            var result = ReadPower(probefactor, vFactor);
            if (result == null || result.freq > 70 || result.freq < 50)
                return null;

            // check for overload
            if (probe.Breaker > 0 && result.iRms > probe.Breaker && (circuit.OverloadWarningSent == null || ((new Date()) - circuit.OverloadWarningSent) > 1000*60*60)) {
                // send text
                if (overloadMsg == null) overloadMsg = "";
                overloadMsg += " [Probe: " + i + ": iRms = " + result.iRms.toFixed(1) + " amps / breaker = " + probe.Breaker + " amps]";
            }

            readings.push(result);
        }
    }

    if (overloadMsg != null) {
        circuit.OverloadWarningSent = new Date();
        var msg = "Overload on " + circuit.Name + overloadMsg;
        console.log(msg);
        netUtils.sendText(msg);        
    }
    circuit.Samples = readings;
    circuit.pAve = 0;
    circuit.qAve = 0;
    circuit.pf = 0;

    for (var s = 0; s < readings.length; s++) {
        readings[s].pAve = Number(readings[s].pAve.toFixed(1));
        readings[s].qAve = Number(readings[s].qAve.toFixed(1));
        readings[s].pf = Number(readings[s].pf.toFixed(5));
        readings[s].iRms = Number(readings[s].iRms.toFixed(2));
        readings[s].vRms = Number(readings[s].vRms.toFixed(2));
        readings[s].iPeak = Number(readings[s].iPeak.toFixed(2));
        readings[s].vPeak = Number(readings[s].vPeak.toFixed(2));
        readings[s].freq = Number(readings[s].freq.toFixed(5));

        circuit.pAve += readings[s].pAve;
        circuit.qAve += readings[s].qAve;
        circuit.pf += readings[s].pf;
    }
    circuit.pf /= readings.length;
    return { iRms: readings[0].iRms, vRms: readings[0].vRms, pAve: circuit.pAve, qAve: circuit.qAve, pf: circuit.pf, freq: readings[0].freq, ts: readings[0].ts };
}


var resultFromBuffer = function (buffer, index) {
    var offset = index * 4 + 1;
    return buffer.slice(offset, offset + 3);
}

/*
var c = 128, m = -1, it=0, _buffer = '', _pf=0, _phase=-999, _run=0;
var updateDelay = function () {

    if (_run != 0)
        return;

    if (_phase != -999) {
        _buffer += (_phase + "," + _pf + "\n");
    }

    if (c == 128) {
        if (m == -1) {
            write('640000c0', 'Mode');
            m = 0;
        } else if (m == 0) {
            write('64000060', 'Mode');
            m = 1;
        } else if (m == 1) {
            write('64000160', 'Mode');
            m = 2;
        }
        else {
            run++;
            console.log('******************************************************************************************');
            var fs = require('fs');
            fs.writeFile("pf" + _run + ".csv", _buffer, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("The file was saved!");
                }
                //_buffer = '';
            });

        }
    }

    if (c > 254) {
        c = 0;
        console.log('----------------------------------------------------------------------------------------------');
    }


    var hex = c.toString(16);
    while (hex.length < 2) {
        hex = "0" + hex;
    }
    write('40' + hex + '1001'); //, 'Config');

    var pc0 = (c >> 1) & 63;
    //console.log('pc0: ' + pc0);
    var pc6 = (c & 128) >> 7;
    //console.log('pc6: ' + pc6);
    _phase = (60 * 360 * (pc0 - (pc6 * 64) + ((m - 1) * 128))) / (4096000 / 8);
    console.log('phase: ' + _phase);

    c += 32;
}
*/

var ReadPower = function (iFactor, vFactor) {
    //console.log(iFactor +", " + vFactor);

    ResetIfNeeded();

    var result = {
        vInst: [],
        iInst: [],
        tsInst: [],
        ts: new Date()
    };

    sampleBuffer.fill(0);

    // do measurement
    var instSamples = cs5463.ReadCycleWithInterrupts(sampleBuffer);
    if (instSamples <= 0) {
        console.log("ReadCycle returned: " + instSamples + ' samples');
        return null;
    }

    // convert buffer values for instantaneous current and voltage
    // buffer is formatted as follows:  
    //      bytes 0-2: Instantaneous current
    //      bytes 3-5: Instantaneous voltage
    //      bytes 6-9: timestamp
    for (var s = 0; s < instSamples; s++) {
        var offset = s * bytesPerSample;

        var iInst = convert(sampleBuffer.slice(offset, offset + 3), 0, true) * iFactor;
        var vInst = convert(sampleBuffer.slice(offset + 3, offset + 6), 0, true) * vFactor;
        var tsInst = sampleBuffer.readInt32LE(offset + 6) / 1000000.0;

        result.iInst.push(Number(iInst.toFixed(1)));
        result.vInst.push(Number(vInst.toFixed(1)));
        result.tsInst.push(Number(tsInst.toFixed(2)));
    }

    // read average values over complete cycle
    var cmd = makeReadCommand(
        [Registers.RmsCurrent,
         Registers.RmsVoltage,
         Registers.RealPower,
         Registers.AveReactivePower,
         Registers.PowerFactor,
         Registers.PeakCurrent,
         Registers.PeakVoltge,
         Registers.Epsilon]);

    var r = new Buffer(cs5463.send(cmd), 'hex');

    result.iRms = convert(resultFromBuffer(r, 0), -1, false) * iFactor;
    result.vRms = convert(resultFromBuffer(r, 1), -1, false) * vFactor;
    result.pAve = convert(resultFromBuffer(r, 2), 0, true) * vFactor * iFactor;
    result.qAve = convert(resultFromBuffer(r, 3), 0, true) * vFactor * iFactor;  // average reactive power
    result.pf = convert(resultFromBuffer(r, 4), 0, true);
    result.iPeak = convert(resultFromBuffer(r, 5), 0, true) * iFactor;
    result.vPeak = convert(resultFromBuffer(r, 6), 0, true) * vFactor;
    result.freq = convert(resultFromBuffer(r, 7), 0, true) * 4000.0;

    if (result.pAve < 3.0)
        result.pAve = 0;  // noise

    //_pf = result.pf;

    return result;
}

var ResetIfNeeded = function() {
    var epsilon = read(13);
    var mode = read(18);
    var config = read(0);
    if (epsilon.toString('hex') != "01eb85") {
        console.log('Resetting due to incorrect epsilon: ' + epsilon.toString('hex') + ' expected: ' + "01eb85");
        Reset();
    }
    else if (mode.toString('hex') != Mode) {
        console.log('Resetting due to incorrect Mode: ' + mode.toString('hex') + ' expected: ' + Mode);
        Reset();
    }
    else if (config.toString('hex') != Config) {
        console.log('Resetting due to incorrect Config: ' + config.toString('hex') + ' expected: ' + Config);
        Reset();
    }
}

var Reset = function () {
    console.log('RESET');

    // HARD RESET CHIP
    cs5463.DigitalPulse(OutputPins.reset, 0, 1, 100);

sleep(500);

    write('FFFFFFFE', 'init serial port');
    command('80', 'reset');
    var s;
    do {
        s = read(15); // read status
        console.log('status: ' + s.toString('hex'));
        sleep(500);
    } while (!(s[0] & 0x80));

    write("5EFFFFFF", "clear status");


    //write('64000060', 'hpf on');
    //write('64000160', 'hpf on with voltage phase compensation');
    read(18, 'read Mode register');
    // 60 = 0110 0000  => High-Pass filters enabled on both current and voltage channels
    // E0 = 1110 0000  => one sample of current channel delay, High-Pass filters enabled on both current and voltage channels
    // E1 = 1110 0001  => one sample of current channel delay, High-Pass filters enabled on both current and voltage channels, auto line frequency measurement enabled
    //write('640000E0', 'hpf on with current phase compensation');  
    write('64' + Mode, 'hpf on with current phase compensation');
    read(18, 'read Mode register');

    read(0, 'read configuration register');
    //write('40001001', 'interrupts set to high to low pulse');
    //write('40C01001', 'interrupts set to high to low pulse with phase comp');
    write('40' + Config, 'interrupts set to high to low pulse with phase comp');
    // C0 = 1100 0000 => first 7 bits set delay in voltage channel relative to current channel (00-7F), 1100000 => 
    // 10 = 0001 0000 => set interrupts to high to low pulse
    // 01 = 0000 0001 => set clock divider to 1 (default)
    read(0, 'read configuration register');
    
    console.log('epsilon before: ' + convert(read(13), 0, true));
    write('5A01EB85', 'set epsilon to 60Hz');
    console.log('epsilon after: ' + convert(read(13), 0, true));

    console.log('initialized');

}

function ReadNext(callback) {
    if (configuration != null && configuration.Circuits != null && configuration.Circuits.length > 0) {
                
        while (circuit < configuration.Circuits.length && !configuration.Circuits[circuit].InstantEnabled)
            circuit++;

        if (circuit >= configuration.Circuits.length) {
            circuit = 0;
            
            while (circuit < configuration.Circuits.length && !configuration.Circuits[circuit].InstantEnabled)
                circuit++;

            if (circuit >= configuration.Circuits.length) {

                console.log("no circuits are enabled");

                if (callback != null)
                    callback();
                return;
            }

            //updateDelay();
        }
//console.log('next id ' + circuit);
        var ckt = configuration.Circuits[circuit++];
//console.log('ckt: ' + ckt.id);

        //console.log('circuit 3: ' + circuit);
        var result = ReadCircuit(ckt, configuration.Probes);
        if (result != null) {
            db.insert(ckt.id, result.iRms, result.vRms, result.pAve, result.qAve, result.pf, result.ts);     

            console.log(ckt.Name + ' : V= ' + result.vRms.toFixed(1) + '  I= ' + result.iRms.toFixed(1) + '  P= ' + result.pAve.toFixed(1) + '  Q= ' + result.qAve.toFixed(1) + '  PF= ' + result.pf.toFixed(4));
            //console.log('inst count: ' + result.tsInst.length)
        } else {
            console.log('Read returned null - REBOOT ???');
            Reset();
        }
    } else {
        console.log('not ready');
    }

    if (callback != null)
        callback();
}

function Start() {
    Stop();
    Reset();

    var intSetup = 0, intFallingEdge = 1, intRisingEdge = 2, intBothEdges = 3;
    var noResistor = 0, pullDownResistor = 1, pullUpResistor = 2;
    cs5463.InitializeISR(InputPins.isr, pullUpResistor, intFallingEdge);

    runInterval  = setInterval(function () {
        ReadNext();
    }, 1000);
}

function Stop() {

    if (runInterval != null) {
        console.log('Stopping read loop');
        clearInterval(runInterval);
        runInterval = null;
    }
}

function getFilesizeInBytes(filename) {
    var stats = fs.statSync(filename);
     var fileSizeInBytes = stats["size"];
     return fileSizeInBytes;
}

// schedule rollup message
scheduleNextRollupMessage();

loadConfiguration(function (err) {
    if (err) {
        console.log('unable to load configuration: ' + err);
    } else {

        if (cs5463 != null) {
            cs5463.Open("/dev/spidev0.0", 2000000);   // rapberry pi
            //cs5463.Open("/dev/spidev0.0", 1200000);  // banana pi


            console.log("Configuring hardware version: " + HardwareVersion);

            if (HardwareVersion == 1.1) {
                // pins 0, 1, 2, 3 control the channel
                // pins 4, 5, 6 control the board
                // pin 7 controls the voltage
                // pin 8 is a global disable for both voltage and current
                // pin 9 is to reset the meter IC
                OutputPins = {
                    channel0: 0,    // header 11 - GPIO0
                    channel1: 1,    // header 12 - GPIO1
                    channel2: 2,    // header 13 - GPIO2
                    channel3: 3,    // header 15 - GPIO3
                    board0: 4,      // header 16 - GPIO4
                    board1: 5,      // header 18 - GPIO5
                    board2: 6,      // header 22 - GPIO6
                    voltage0: 7,    // header 7  - GPIO7
                    disable: 8,     // header 3  - SDA0   (8 and 9 have internal pull-up resistors, use 15, 16 if that causes a problem)
                    reset: 9        // header 5  - SCL0
                }

                InputPins = {
                    isr: 15         // Header 8 - TxD  (interrupt pin - connect to INT (20) on CS5463)
                }
            }
            else if (HardwareVersion == 1.2) {
                OutputPins = {
                    channel0: 0,    // header 11 - GPIO0
                    channel1: 1,    // header 12 - GPIO1
                    channel2: 2,    // header 13 - GPIO2
                    channel3: 3,    // header 15 - GPIO3
                    board0: 4,      // header 16 - GPIO4
                    board1: 15,      // header 18 - TxD
                    board2: 9,      // header 22 - GPIO6
                    voltage0: 7,    // header 7  - GPIO7
                    voltage1: 16,    // header 10  - RxD
                    disable: 8,     // header 3  - SDA0   (8 and 9 have internal pull-up resistors, use 15, 16 if that causes a problem)
                    reset: 6        // header 22  - GPIO6
                }

                InputPins = {
                    isr: 5         // Header 18 - GPIO5  (interrupt pin - connect to INT (20) on CS5463)
                }
            } else {
                Console.log('Invalid Hardware version');
                return;
            }

            // enable output gpio pins
            for (var pin in OutputPins) {
                //console.log('pinmode(' + OutputPins[pin] + ') ' + pin);
                cs5463.PinMode(OutputPins[pin], 1);
            }

            //start the read loop
            Start();
        }
    }
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

                    console.log("ctk: " + circuit + " initial: " + initial + "   final: " + configuration.Circuits[i].InstantEnabled);
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

                var w = [], a = [], v = [], q = [], pf = [], l = [], ts = [], probe = [], breaker=[];
                for (var p = 0; p < ckt.Probes.length; p++) {
                    w.push(ckt.Samples[p].pAve.toFixed(0));
                    a.push(ckt.Samples[p].iRms.toFixed(1));
                    probe.push(ckt.Probes[p].id);
                    breaker.push(ckt.Probes[p].Breaker + " Amp");
                    v.push(ckt.Samples[p].vRms.toFixed(1));
                    q.push(ckt.Samples[p].qAve.toFixed(0));
                    pf.push(ckt.Samples[p].pf.toFixed(5));
                    l.push(Math.round(ckt.Samples[p].iRms * 100.0 / ckt.Probes[p].Breaker) + " %");
                    ts.push(ckt.Samples[p].ts);
                }

                if (ckt.Probes.length > 1) {
                    w.push(ckt.pAve.toFixed(0));
                    q.push(ckt.qAve.toFixed(0));
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
                    load: l
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

                if (_config.DeviceName != null)
                    deviceName = _config.DeviceName;

                if (softwareVersion != null)
                    _config.SoftwareVersion = softwareVersion;

                _config.DatabaseSize = numberWithCommas(getFilesizeInBytes('powermeter.db'));
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

            db.minmaxavg("(select id from Circuits where IsMain=1)", start, end, telemetry, function (err, _max) {
                if (_max != null && _max.length == 1)
                    results.MaxWatts = _max[0].max;
                else
                    results.MaxWatts = 0.0;

                if (costPerKWH == 0) {
                    db.getCostPerKWh(function (err, cost) {
                        if (cost != null && cost.length == 1)
                            costPerKWH = cost[0].Value;

                        results.CostPerKWH = costPerKWH;
                        callback(err, results);
                    });
                } else {
                    results.CostPerKWH = costPerKWH;
                    callback(err, results);
                }
            });
        });
    },
    Reset: function () {
        Reset();
        return 0;
    },
    GetConfiguration: function (callback) {
        db.getConfiguration(function (err, config) {

            if (config != null) {

                if (config.DeviceName != null)
                    deviceName = config.DeviceName;

                for (index = 0; index < config.length; ++index) {
                    config[index].HardwareVersion = HardwareVersion;
                    config[index].Probes = probes;
                }

                callback(err, config);
            } else {
                callback(err);
            }


        });
    },
    ReplaceConfiguration: function (callback, config) {
        db.updateCircuits(config, function (err) {
            loadConfiguration();
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