﻿var http = require('http'); 
var express = require('express');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var methodOverride = require('method-override');
var power = require('./cs5463');
var db = require('./database');
var onFinished = require('on-finished')
var basicAuth = require('basic-auth');
var path = require('path');



var username = "", password = "", compactRunning = false;

var app = express(), server;


// Add timestamp to console messages
(function (o) {
    if (o.__ts__) { return; }
    var slice = Array.prototype.slice;
    ['log', 'debug', 'info', 'warn', 'error'].forEach(function (f) {
        var _ = o[f];
        o[f] = function () {
            var args = slice.call(arguments);
            args.unshift(new Date().toISOString());
            return _.apply(o, args);
        };
    });
    o.__ts__ = true;
})(console);

var auth = function (req, res, next) {
    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.sendStatus(401);
    };
    
    // bypass auth for local devices or empty username/password
    if ((username == "" && password == "") || req.ip.indexOf("127.0.0.") == 0)
        return next();

    var user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        return unauthorized(res);
    };

    if (user.name === username && user.pass === password) {
        return next();
    } else {
        console.warn('login failure: [' + user.name + '][' + user.pass + ']');
        return unauthorized(res);
    };
};



app.set('port', 3000);
app.use(express.static(path.join(__dirname, 'public')));
app.use(auth);
app.use(logger);
app.use(bodyParser.urlencoded({ extended: true }))
app.use(favicon(__dirname + '/public/images/favicon.png'));
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(logErrors);
app.use(clientErrorHandler);
app.use(errorHandler);

  

var readConfig = function () {

    db.readConfig(function (err, results) {
        if (err) {
            console.log('failed to read username and password from config: ' + err);
        } else {
            if (results["UserName"] != null && results["Password"] != null) {
                username = results["UserName"];
                password = results["Password"];
            }
            console.log('username: ' + username + "    password: " + password);
        }
    });
};

readConfig();

function logger(req, res, next) {
    var start = (new Date()).getTime();
    res._startTime = start;
    console.log('start %s %s', req.method, req.url);
   
    onFinished(res, function (err) {
        var duration = (new Date()).getTime() - res._startTime;
        console.log('end %s %s : %s ms', req.method, req.url, duration);
    })

  next();
}

function logErrors(err, req, res, next) {
  console.log(err);
  console.error(err.stack);
  next(err);
}

function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.send(500, { error: 'Server error' });
  } else {
    next(err);
  }
}

function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}

function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}


app.get('/powermeter.db', function (req, res) {

    var options = {
        root: __dirname,
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    var fileName = "powermeter.db";
    db.lockWrites(true);
    res.sendFile(fileName, options, function (err) {
        db.lockWrites(false);
        if (err) 
            next(err);
        else 
            console.log('Sent:', fileName);
    });
});

app.get('/waveform', function (req, res) {
    var circuitId = req.query.circuitId;
    console.log("waveform(" + circuitId + ')');
    res.send(power.ReadCircuit(circuitId));
});
app.get('/instant', function (req, res) {
    res.send(power.Readings());
});
app.get('/power', function (req, res, next) {
    var circuitId = req.query.circuitId;
    var start = req.query.start;
    var end = req.query.end;
    var groupBy = req.query.groupBy;
    var offset = req.query.offset;
    
    console.log("power(" + circuitId + ', ' + start + ', ' + end + ', ' + groupBy + ', ' + offset + ')');
    var telemetry = [];
    power.ReadPower(circuitId, new Date(Number(start)), new Date(Number(end)), groupBy, offset, telemetry, function (err, result) {

        if (err)
            next(err);
        else {
            result.Telemetry = telemetry;
            res.send(result);
        }
    });
});
app.get('/cumulative', function (req, res, next) {
    var start = req.query.start;
    var end = req.query.end;
    var order = req.query.order;

    console.log("cumulative(" + start + ', ' + end + ', ' + order + ')');

    var startDate = null, endDate = null;
    if (start != null)
        startDate = new Date(Number(start));

    if (end != null)
        endDate = new Date(Number(end));

    var telemetry = [];

    power.Cumulative(startDate, endDate, order, telemetry, function (err, result) {
        if (err) {
            next(err);
        }
        else {
            result.Telemetry = telemetry;
            res.send(result);
        }
    });
});
app.get('/config', function (req, res, next) {
    power.GetCircuits(function (err, result) {
        if (err)
            next(err);
        else {
            res.send(result);
        }
    }, true);
});
app.get('/compact', function (req, res, next) {

    if (compactRunning)
        return res.send('Compact already running');

    var start = req.query.start;
    var end = req.query.end;

    if (start == null || end == null)
        return res.send("invalid start or end date");

    compactRunning = true;

    console.log("compact(" + start + ', ' + end + ')');

    var startDate = null, endDate = null;
    if (isNumber(start))
        startDate = new Date(Number(start));
    else
        startDate = new Date(start);

    if (isNumber(end))
        endDate = new Date(Number(end));
    else
        endDate = new Date(end);

    
    db.compact(startDate, endDate, function (err) {
        compactRunning = false;
        if (err) {
            next(err);
        }
        else {
            res.send("compacted in: " + elapsed + " seconds");
        }
    });
    
});
app.get('/count', function (req, res, next) {
    var start = req.query.start;
    var end = req.query.end;

    if (start == null || end == null)
        return res.send("invalid start or end date");

    console.log("count(" + start + ', ' + end + ')');

    var startDate = null, endDate = null;
    if (isNumber(start))
        startDate = new Date(Number(start));
    else
        startDate = new Date(start);

    if (isNumber(end))
        endDate = new Date(Number(end));
    else
        endDate = new Date(end);


    db.count(startDate, endDate, function (err, result) {
        compactRunning = false;
        if (err) {
            next(err);
        }
        else {
            res.send("Compacted: " + result.Compacted + "   Not Compacted: " + result.NotCompacted);
        }
    });

});
app.post('/enabled', function (req, res, next) {
    var config = req.body.config;

    if (config == null || config.length == 0) {
        console.log("invalid post config value= " + config);
        next("Invalid configuration");
        res.send('error');
    } else {
        console.log('circuit: ' + config.circuit + "   enabled: " + config.enabled);
        power.UpdateCircuitEnabled(config.circuit, config.enabled);
        res.send('success');
    }
});
app.post('/config', function (req, res, next) {
    var config = req.body.config;

    if (config == null || config.length == 0) {
        console.log("invalid post config value= " + config);
        next("Invalid configuration");
        res.send('error');
    } else {
        power.ReplaceConfiguration(function (err) {
            if (err)
                res.send('error');
            else {
                res.send('success');
            }
        }, config);
    }
});
app.post('/probeDef', function (req, res, next) {
    var config = req.body.config;

    if (config == null) {
        console.log("invalid post config value= " + config);
        next("Invalid configuration");
    } else {
        power.ReplaceProbeDefConfiguration(function (err) {
            if (err)
                next(err);
            else
                res.send('success');

            // reload config in case username/password changed
            readConfig();

        }, config);
    }
});
app.post('/deleteCircuit', function (req, res, next) {
    var circuitId = req.body.circuitId;

    if (isNaN(circuitId)) {
        console.log("invalid circuitId value= " + circuitId);
        next("Invalid circuitId");
    } else {
        power.DeleteCircuit(function (err) { 
            if (err)
                next(err);
            else
                res.send('success');
        }, circuitId);
    }
});
app.post('/deleteProbe', function (req, res, next) {
    var probeId = req.body.probeId;

    if (isNaN(probeId)) {
        console.log("invalid probeId value= " + probeId);
        next("Invalid probeId");
    } else {
        power.DeleteProbe(function (err) { 
            if (err)
                next(err);
            else
                res.send('success');
        }, probeId);
    }
});
app.post('/update', function (req, res, next) {
    console.log('Updating source...');
    var exec = require('child_process').exec;
    exec('npm update powermeter', function (error, stdout, stderr) {
        if (error)
            next(error);
        else {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            gracefulShutdown();

            res.send('success');
        }
    });
});

app.get('/log', function (req, res, next) {
    var options = {
        root: __dirname + '/../',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    var fileName = "nodejs.err.log";
    res.sendFile(fileName, options, function (err) {
        if (err)
            next(err);
        else
            console.log('Sent:', fileName);
    });

});

app.get('/', function (req, res, next) {
    var options = {
        root: __dirname + '/public/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    var fileName = "usage.html";
    res.sendFile(fileName, options, function (err) {
        if (err) 
            next(err);
        else 
            console.log('Sent:', fileName);
    });

});
// Express route for any other unrecognised incoming requests 
app.get('*', function(req, res){ 
	res.send(404, 'Unrecognised API call'); 
}); 


server = app.listen(app.get('port'), function() {
    console.log('App Server running at port ' + app.get('port'));
});


// this function is called when you want the server to die gracefully
// i.e. wait for existing connections
var gracefulShutdown = function () {
    console.log("Received kill signal, shutting down gracefully.");
    power.Stop();
    server.close(function () {
        console.log("Closed out remaining connections.");
        process.exit()
    });

    // if after 
    setTimeout(function () {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit()
    }, 10 * 1000);
}

// listen for TERM signal .e.g. kill 
process.on('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);