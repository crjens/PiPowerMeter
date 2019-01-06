// This is a child process that should be forked from the parent and is responsible for 
// reading from the power meter hardware and sending messages back to its parent
// every time it reads a new sample.  On startup it enters a loop and sequentially
// reads samples until told to stop by the parent
// read from hardware

var driver = require('./CS5463');

process.on('message', function (data) {
    //    console.log('reader received: ' + data.Action);
    if (data.Action == "Start") {
        HardwareVersion = data.HardwareVersion;
        Mode = data.Mode;
        Config = data.Config;
        driver.Open();
    }
    else if (data.Action == "Stop") {
        console.log("reader received stop");
        driver.Close();
    }
    else if (data.Action == "Read") {
        //console.log("reader: Read");
        //console.log(JSON.stringify(data));
        for (var i = 0; i < data.Probes.length; i++) {

            var probe = data.Probes[i];
            //console.log("reader: probe: " + probe.id);
            driver.SetCircuit(probe.Board, probe.CurrentChannel, probe.VoltageChannel);

            var result = driver.ReadPower(probe.iFactor, probe.vFactor);
            if (result == null || result.freq > 70 || result.freq < 40) 
                result = null;
            else if ((probe.SourceType == 1 && result.pAve < 0.0) || // load cannot generate 
                     (probe.SourceType == 2 && result.pAve > 0.0)) { // source cannot consume
                result.iRms = 0.0;
                result.pAve = 0.0;
                result.qAve = 0.0;
                result.pf = 1.0;
                result.iPeak = 0.0;
            }
            
            probe.Result = result;

            if (Epsilon == Epsilon50Hz)
                data.Frequency = "50Hz";
            else if (Epsilon == Epsilon60Hz)
                data.Frequency = "60Hz";
            else
                data.Frequency = "Unknown";
        }

        process.send(data);
    }
});