var cs5463 = null;
// comment below line for WebMatrix testing
var cs5463 = require("cs5463");
require("./common");

var samples = 500;   // number of instantaneous voltage and current samples to collect for each measurement
var bytesPerSample = 10;
var sampleBuffer = Buffer.alloc(samples * bytesPerSample);
var Mode = "000061";  // Enable hpf on current and voltage channels
var Config = "001001"; // set interrupt High-Low
var _DeviceOpen = false;
var Configuration = null;
var CalculatedFrequencies = [];

var InputPins = {
    isr: 18         // Header 18 - GPIO5  (interrupt pin - connect to INT (20) on CS5463)
};

var OutputPins = {
    channel0: 11,    // header 11 - GPIO0
    channel1: 12,    // header 12 - GPIO1
    channel2: 13,    // header 13 - GPIO2
    channel3: 15,    // header 15 - GPIO3
    board0: 16,      // header 16 - GPIO4
    board1: 8,      // header 8 - TxD
    board2: 5,      // header 5 - GPIO9
    voltage0: 7,    // header 7  - GPIO7
    voltage1: 10,    // header 10  - RxD
    disable: 3,     // header 3  - SDA0   (8 and 9 have internal pull-up resistors, use 15, 16 if that causes a problem)
    reset: 22        // header 22  - GPIO6
};

var Registers = {
    Config: 0,
    CurrentDCOffset: 1,
    CurrentGain: 2,
    VoltageDCOffset: 3,
    VoltageGain: 4,
    CycleCount: 5,
    PulseRateE: 6,
    InstCurrent: 7,
    InstVoltage: 8,
    InstPower: 9,
    RealPower: 10,
    RmsCurrent: 11,
    RmsVoltage: 12,
    Epsilon: 13, // line frequency ratio
    PowerOffset: 14,
    Status: 15,
    CurrentACOffset: 16,
    VoltageACOffset: 17,
    Mode: 18,
    Temp: 19,
    AveReactivePower: 20,
    InstReactivePower: 21,
    PeakCurrent: 22,
    PeakVoltge: 23,
    ReactivePowerTriangle: 24,
    PowerFactor: 25,
    InterruptMask: 26,
    ApparentPower: 27,
    Control: 28,
    HarmonicActivePower: 29,
    FundamentalActivePower: 30,
    FundamentalReactivePower: 31
};

var GetCycleCount = function () {
    if (Configuration == null)
        return 4000; // default to 4000 (1sec)

    var tmp = Configuration.SampleTime * 4000;
    if (tmp < 100)
        return 100; // CS5490 docs say not to use < 100
    if (tmp > 4000 * 60 * 5)
        return 4000 * 60 * 5; // 5 min seems long enough
    return tmp;
}

var sleep = function (delayMs) {
    var s = new Date().getTime();
    while ((new Date().getTime() - s) < delayMs) {
        //do nothing
        //console.log('sleeping');
    }
}

var write = function (cmd, desc) {
    if (_DeviceOpen) {
        cs5463.send(cmd);
        if (desc != null)
            console.log('write: ' + desc + '(' + cmd + ')')
    }
}

var writeRegister = function (register, data, desc) {
    if (_DeviceOpen) {
        while (data.length < 6)
            data = '0' + data;
        while (register.length < 2)
            register = '0' + register;
        var cmd = (0x40 + (register << 1)).toString(16) + data
        write(cmd, desc);
    }
}

var read = function (register, desc) {
    if (_DeviceOpen) {
        var cmd = (register << 1).toString(16) + 'FFFFFF';
        while (cmd.length < 8)
            cmd = '0' + cmd;

        var result = cs5463.send(cmd);

        //console.log('cmd: ' + cmd + ' -> ' + result)

        var ret = Buffer.from(result, 'hex').slice(1);

        if (desc != null)
            console.log('read: ' + desc + '(' + cmd + ') -> ' + ret.toString('hex')); // + '  ' + result);

        return ret;
    } else {
        return null;
    }

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

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

var Encode2sComplememt = function (val, binPt, neg) {
    if (neg && val < 0)
        return (Math.round((val + Math.pow(2, binPt + 1)) * Math.pow(2, 23 - binPt)) | 0x800000).toString(16);
    return Math.round(val * Math.pow(2, 23 - binPt)).toString(16);
}

var Decode2sComplement = function (buffer, binPt, neg) {
    var n = parseInt(buf2hex(buffer), 16);
    var val = n / Math.pow(2, 23 - binPt);
    if (neg && buffer[0] & 0x80)
        return -1 * (Math.pow(2, binPt + 1) - val);
    return val;
}

var resultFromBuffer = function (buffer, index) {
    var offset = index * 4 + 1;
    return buffer.slice(offset, offset + 3);
}

var ResetIfNeeded = function () {

    var epsilon = read(Registers.Epsilon);
    var mode = read(Registers.Mode);
    var config = read(Registers.Config);
    var status = read(Registers.Status);
    var cycleCount = read(Registers.CycleCount);

    // Check status of:
    //   IOR and VOR
    //   IROR, VROR, EOR, IFAULT, VSAG
    //   TOD, VOD, IOD, LSD 
    if ((status[0] & 0x03) || (status[1] & 0x7C) || (status[2] & 0x58)) {
        console.log('Resetting due to incorrect status: ' + status.toString('hex'));
        console.error('Resetting due to incorrect status: ' + status.toString('hex'));
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
    else if (parseInt('0x' + cycleCount.toString('hex')) != GetCycleCount()) {
        console.log('Resetting due to incorrect CycleCount: ' + parseInt('0x' + cycleCount.toString('hex')) + ' expected: ' + GetCycleCount());
        Reset();
    }
    else {
        //Reset();
        //console.log('Reset not needed:' + epsilon.toString('hex') + " " + mode.toString('hex') + " " + config.toString('hex'));
    }
}

var DumpRegisters = function () {
    console.log("Register dump:");
    for (var propertyName in Registers) {
        var val = Registers[propertyName];
        //vconsole.log(val + ' - ' + propertyName + ': ' + read(val).toString('hex'));
        console.log(val + ' - ' + propertyName + ': ' + read(val).toString('hex'));
    }
}

var Reset = function () {

    console.log('RESET');

    // HARD RESET CHIP
    cs5463.DigitalPulse(OutputPins.reset, 0, 1, 100);

    sleep(500);

    write('FFFFFFFE', 'init serial port');
    write('80', 'reset');

    DumpRegisters();

    var s;
    do {
        if (!_DeviceOpen)
            return;

        s = read(15); // read status
        console.log('status: ' + s.toString('hex'));

        if (!(s[0] & 0x80))
            sleep(500);
    } while (!(s[0] & 0x80));

    write("5EFFFFFF", "clear status");

    read(Registers.Mode, 'read Mode register');
    // 60 = 0110 0000  => High-Pass filters enabled on both current and voltage channels
    // E0 = 1110 0000  => one sample of current channel delay, High-Pass filters enabled on both current and voltage channels
    // E1 = 1110 0001  => one sample of current channel delay, High-Pass filters enabled on both current and voltage channels, auto line frequency measurement enabled
    writeRegister(Registers.Mode, Mode, 'hpf on with current phase compensation');
    read(Registers.Mode, 'read Mode register');

    read(Registers.Config, 'read configuration register');
    writeRegister(Registers.Config, Config, 'interrupts set to high to low pulse with phase comp');
    // C0 = 1100 0000 => first 7 bits set delay in voltage channel relative to current channel (00-7F), 1100000 => 
    // 10 = 0001 0000 => set interrupts to high to low pulse
    // 01 = 0000 0001 => set clock divider to 1 (default)
    read(Registers.Config, 'read configuration register');

    var cycleCount = GetCycleCount().toString(16);
    writeRegister(Registers.CycleCount, cycleCount, 'CycleCount to ' + cycleCount);

    console.log('initialized');
}

var exports = {
    // board should be 0-7
    // currentchannel should be 0-15
    // voltagechannel should be 0-3
    SetCircuit: function (board, currentChannel, voltageChannel) {
        if (board < 0 || board > 8) {
            console.log('Invalid board: ' + board);
            return;
        }

        if (currentChannel < 0 || currentChannel > 15) {
            console.log('Invalid current channel: ' + currentChannel);
            return;
        }

        if (voltageChannel < 0 || voltageChannel > 3) {
            console.log('Invalid voltage channel: ' + voltageChannel);
            return;
        }

        if (_DeviceOpen) {

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
            cs5463.DigitalWrite(OutputPins.voltage1, (voltageChannel & 0x2));

            // enable
            cs5463.DigitalWrite(OutputPins.disable, 0);
        }
    },
    ReadPower: function (iFactor, vFactor) {

        ResetIfNeeded();

        if (!_DeviceOpen)
            return;

        if (CalculatedFrequencies.length > 0) {
            var total = 0;
            CalculatedFrequencies.forEach(function (item, index) {
                total += item;
            });
            var avgFreq = total / CalculatedFrequencies.length;
            var epsilon = Encode2sComplememt(avgFreq / 4000.0, 0, true);

            writeRegister(Registers.Epsilon, epsilon);
        }

        var result = {
            vInst: [],
            iInst: [],
            tsInst: [],
            ts: new Date(),
            tsZC: []
        };

        var lastV = 0, lastTsZC = 0, lastTs = 0, totalTime = 0, totalCount = 0;
        sampleBuffer.fill(0);

        // do measurement
        var instSamples;
        try {
            instSamples = cs5463.ReadCycleWithInterrupts(sampleBuffer);
            if (instSamples <= 0) {
                console.log("ReadCycle returned: " + instSamples + ' samples');
                return null;
            }
        }
        catch (err) {
            //console.log("ReadCycleWithInterrupts failed: " + err);
            console.error("ReadCycleWithInterrupts failed: " + err);
            return null;
        }

        // convert buffer values for instantaneous current and voltage
        // buffer is formatted as follows:  
        //      bytes 0-2: Instantaneous current
        //      bytes 3-5: Instantaneous voltage
        //      bytes 6-9: timestamp
        for (var s = 0; s < instSamples; s++) {
            var offset = s * bytesPerSample;

            var iInst = Decode2sComplement(sampleBuffer.slice(offset, offset + 3), 0, true) * iFactor;
            var vInst = Decode2sComplement(sampleBuffer.slice(offset + 3, offset + 6), 0, true) * vFactor;
            var tsInst = sampleBuffer.readInt32LE(offset + 6) / 1000000.0;

            result.iInst.push(Number(iInst));
            result.vInst.push(Number(vInst));
            result.tsInst.push(Number(tsInst));

            // frequency detect
            // look for zero crossing and ensure we didn't miss any samples 
            if ((lastV > 0 && vInst < 0) || (lastV < 0 && vInst > 0)) {

                var tsZCInterpolated = lastTs + lastV * (tsInst - lastTs) / (lastV - vInst)
                if (lastTsZC > 0 && (tsInst - lastTs) < 0.375) {
                    // Sample freq should be 4000Hz which is 0.25 ms per sample so use 0.375 for some margin
                    // if sample freq > 0.375 ms we'll assume a sample was missed and throw out the reading

                    // throw out any samples that are not between 40Hz and 70Hz
                    // ex: (1/40) / 2 = 12.5 ms
                    // ex: (1/70) / 2 = 7.1 ms
                    var sampleTime = tsZCInterpolated - lastTsZC;
                    if (sampleTime >= 7.1 && sampleTime <= 12.5) {
                        totalCount++;
                        totalTime += (tsZCInterpolated - lastTsZC);
                        result.tsZC.push(Number(tsZCInterpolated));
                    }
                }
                lastTsZC = tsZCInterpolated;
            }
            lastV = vInst;
            lastTs = tsInst;
        }

        if (totalCount > 0) {
            result.CalculatedFrequency = 1000 / ((totalTime / totalCount) * 2);  //in Hz
            if (CalculatedFrequencies.unshift(result.CalculatedFrequency) > 5)
                CalculatedFrequencies = CalculatedFrequencies.slice(0, 5);
        }
        else
            result.CalculatedFrequency = 0;

        //console.log('CalculatedFrequency: ' + result.CalculatedFrequency);

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

        var r = Buffer.from(cs5463.send(cmd), 'hex');

        result.iRms = Decode2sComplement(resultFromBuffer(r, 0), -1, false) * iFactor;
        result.vRms = Decode2sComplement(resultFromBuffer(r, 1), -1, false) * vFactor;
        result.pAve = Decode2sComplement(resultFromBuffer(r, 2), 0, true) * vFactor * iFactor;
        result.qAve = Decode2sComplement(resultFromBuffer(r, 3), 0, true) * vFactor * iFactor;  // average reactive power
        result.pf = Decode2sComplement(resultFromBuffer(r, 4), 0, true);
        result.iPeak = Decode2sComplement(resultFromBuffer(r, 5), 0, true) * iFactor;
        result.vPeak = Decode2sComplement(resultFromBuffer(r, 6), 0, true) * vFactor;
        result.freq = Decode2sComplement(resultFromBuffer(r, 7), 0, true) * 4000.0;

        return result;
    },
    Frequency: function () {
        var epsilon = read(Registers.Epsilon);
        return (4000.0 * Decode2sComplement(epsilon, 0, true)).round(2) + " Hz";
    },
    SetConfig: function (configuration) {
        Configuration = configuration;
    },
    Close: function () {
        console.log("reader closed 1");
        _DeviceOpen = false;
        if (cs5463 != null)
            cs5463.Close();

        console.log("reader closed 2");
    },
    Open: function (data) {
        Configuration = data.Configuration;

        if (cs5463 != null) {
            // enable output gpio pins
            for (var pin in OutputPins) {
                console.log('pinmode(' + OutputPins[pin] + ') ' + pin);
                cs5463.PinMode(OutputPins[pin], 1);
            }

            cs5463.Close();
            cs5463.Open("/dev/spidev0.0", 2000000);   // raspberry pi
            //cs5463.Open("/dev/spidev0.0", 1200000);  // banana pi

            _DeviceOpen = true;
            console.log("Device opened");

            Reset();

            if (_DeviceOpen) {

                var intSetup = 0, intFallingEdge = 1, intRisingEdge = 2, intBothEdges = 3;
                var noResistor = 0, pullDownResistor = 1, pullUpResistor = 2;
                cs5463.InitializeISR(InputPins.isr, pullUpResistor, intFallingEdge);
            }
        }
    }
};

module.exports = exports;