var hostName = require("os").hostname();
var twilio = require('twilio');

var fromText = "", toText = "";
var twilioSID = "";
var twilioAuthToken = "";
var exec = require('child_process').exec;
var client = null;// = new twilio.RestClient(twilioSID, twilioAuthToken);
var ipSent = false;



var getNetworkIPs = (function (callback) {
    var ignoreRE = /^(127\.0\.0\.1|::1|fe80(:1)?::1(%.*)?)$/i;

    var cached;
    var command;
    var filterRE;

    switch (process.platform) {
        case 'win32':
            //case 'win64': // TODO: test
            command = 'ipconfig';
            filterRE = /\bIPv[46][^:\r\n]+:\s*([^\s]+)/g;
            break;
        case 'darwin':
            command = 'ifconfig';
            filterRE = /\binet\s+([^\s]+)/g;
            // filterRE = /\binet6\s+([^\s]+)/g; // IPv6
            break;
        default:
            command = 'ifconfig';
            filterRE = /\binet\b[^:]+:\s*([^\s]+)/g;
            // filterRE = /\binet6[^:]+:\s*([^\s]+)/g; // IPv6
            break;
    }

console.log('running: ' + command);

    exec(command, function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        } else {

            cached = [];
            var ip;
            var matches = stdout.match(filterRE) || [];
            for (var i = 0; i < matches.length; i++) {
                ip = matches[i].replace(filterRE, '$1')
                if (!ignoreRE.test(ip)) {
                    cached.push(ip);
                }
            }
        }

        callback(error, cached[0]);
    });
});

exports.InitializeTwilio = function (to, from, sid, token, deviceName) {

    if (to != null && from != null && sid != null && token != null && to != '' && from != '' && sid != '' && token != '') {

        console.log("initializing twilio: " + to + ", " + from + ", " + sid + ", " + token + ", " + deviceName);
        toText = to.toString();
        fromText = from.toString();
        twilioSID = sid.toString();
        twilioAuthToken = token.toString();
        if (deviceName != null)
            hostName = deviceName;
        client = new twilio.RestClient(twilioSID, twilioAuthToken);


        if (!ipSent) {
            ipSent = true;
            console.log('sending ip address');
            getNetworkIPs(function (error, ip) {
                if (error) {
                    console.log('ip error:', error);
                    exports.sendText("ip error: " + error);
                } else {
                    console.log("ip: " + ip);
                    exports.sendText("ip: " + ip);
                }

            }, false);
        }

        //exports.sendText("Twilio initialized");
    }

}



exports.sendText = function (msg) {

    if (client == null) {
        console.log("Twilio client not initialized");

    } else {

        client.sms.messages.create({
            to: toText,
            from: fromText,
            body: hostName + " " + msg
        }, function (error, message) {
            // The HTTP request to Twilio will run asynchronously. This callback
            // function will be called when a response is received from Twilio
            // The "error" variable will contain error information, if any.
            // If the request was successful, this value will be "falsy"
            if (!error) {
                // The second argument to the callback will contain the information
                // sent back by Twilio for the request. In this case, it is the
                // information about the text messsage you just sent:
                console.log('Success! The SID for this SMS message is:');
                console.log(message.sid);

                console.log('Message sent on:');
                console.log(message.dateCreated);
            } else {
                console.log('Oops! There was an error: ' + JSON.stringify(error));
            }
        });
    }


}

