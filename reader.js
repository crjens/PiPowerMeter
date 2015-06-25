// This is a child process that should be forked from the parent and is responsible for 
// reading from the power meter hardware and sending messages back to its parent
// every time it reads a new sample.  On startup it enters a loop and sequentially
// reads samples until told to stop by the parent



var HardwareVersion = 0;
var samples = 500;   // number of instantaneous voltage and current samples to collect for each measurement
var bytesPerSample = 10;
var OutputPins, InputPins;
var sampleBuffer = new Buffer(samples * bytesPerSample);
var Mode, Config;

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
// comment below line for WebMatrix testing
var cs5463 = require( "cs5463" );
       

var sleep = function (delayMs) {
    var s = new Date().getTime();
    while ((new Date().getTime() - s) < delayMs) {
        //do nothing
        //console.log('sleeping');
    }
}

var command = function (cmd, desc) {
    if (_DeviceOpen) {
        cs5463.send(cmd);
        if (desc != null)
            console.log('command: ' + desc + '(' + cmd + ')')
    }
}

var write = function (cmd, desc) {
    if (_DeviceOpen) {
        cs5463.send(cmd);
        if (desc != null)
            console.log('write: ' + desc + '(' + cmd + ')')
    }
}

var read = function (register, desc) {
    if (_DeviceOpen) {
        var cmd = (register << 1).toString(16) + 'FFFFFF';
        while (cmd.length < 8)
            cmd = '0' + cmd;
        //console.log('cmd: ' + cmd)

        var result = cs5463.send(cmd);
        var ret = new Buffer(result, 'hex').slice(1);

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
// voltagechannel should be 0-3
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
}

var resultFromBuffer = function (buffer, index) {
    var offset = index * 4 + 1;
    return buffer.slice(offset, offset + 3);
}

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

    result.iRms = Number((convert(resultFromBuffer(r, 0), -1, false) * iFactor).toFixed(2));
    result.vRms = Number((convert(resultFromBuffer(r, 1), -1, false) * vFactor).toFixed(2));
    result.pAve = Number((convert(resultFromBuffer(r, 2), 0, true) * vFactor * iFactor).toFixed(1));
    result.qAve = Number((convert(resultFromBuffer(r, 3), 0, true) * vFactor * iFactor).toFixed(1));  // average reactive power
    result.pf = Number((convert(resultFromBuffer(r, 4), 0, true)).toFixed(5));
    result.iPeak = Number((convert(resultFromBuffer(r, 5), 0, true) * iFactor).toFixed(2));
    result.vPeak = Number((convert(resultFromBuffer(r, 6), 0, true) * vFactor).toFixed(2));
    result.freq = Number((convert(resultFromBuffer(r, 7), 0, true) * 4000.0).toFixed(5));

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
    } else {
        //console.log('Reset not needed:' + epsilon.toString('hex') + " " + mode.toString('hex') + " " + config.toString('hex'));
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




// Kick off the main read loop
var Open = function () {
    if (cs5463 != null) {
        Close();
        cs5463.Open("/dev/spidev0.0", 2000000);   // raspberry pi
        //cs5463.Open("/dev/spidev0.0", 1200000);  // banana pi

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

        // enable output gpio pins
        for (var pin in OutputPins) {
            //console.log('pinmode(' + OutputPins[pin] + ') ' + pin);
            cs5463.PinMode(OutputPins[pin], 1);
        }

        _DeviceOpen = true;
        console.log("Device opened: Hardware version: " + HardwareVersion);

        Reset();

        var intSetup = 0, intFallingEdge = 1, intRisingEdge = 2, intBothEdges = 3;
        var noResistor = 0, pullDownResistor = 1, pullUpResistor = 2;
        cs5463.InitializeISR(InputPins.isr, pullUpResistor, intFallingEdge);
    }
}

var _DeviceOpen = false;
var Close = function () {
    _DeviceOpen = false;
    if (cs5463 != null)
        cs5463.Close();
}

// read from hardware
process.on('message', function (data) {

    if (data.Action == "Start") {
        HardwareVersion = data.HardwareVersion;
        Mode = data.Mode;
        Config = data.Config;
        Open();
    }
    else if (data.Action == "Stop") {
        Close();
    }
    else if (data.Action == "Read") {
        //console.log("reader: Read");
        //console.log(JSON.stringify(data));
        for (var i = 0; i < data.Probes.length; i++) {

            var probe = data.Probes[i];
            //console.log("reader: probe: " + probe.id);
            SetCircuit(probe.Board, probe.CurrentChannel, probe.VoltageChannel);

            var result = ReadPower(probe.iFactor, probe.vFactor);
            if (result == null || result.freq > 70 || result.freq < 40)
                result = null;

            probe.Result = result;
        }

        process.send(data);
    }

});
