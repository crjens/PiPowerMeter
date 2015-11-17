var databaseFile = 'powermeter.db';
var exec = require('child_process').exec;
var fs = require('fs');

var readingsTableColumnsSQL = "id INTEGER primary key, CircuitId int, I real, V real, P real, Q real, PF real, Timestamp int, Compacted int, F real";

var dbLocked = false;
var cachedConfig = null, strippedConfig = null;
var backupTimer = null;

var scheduleBackup = function(backupPath) {
    if (backupTimer != null)
        clearTimeout(backupTimer);

    if (backupPath != null && backupPath != "") {

        var path = require("path").join(backupPath, databaseFile);

        if (fs.existsSync(backupPath)) {
            console.log('setting backup path to: ' + path);
            backupTimer = setTimeout(function () {
                console.log('backing database to: ' + path);
                backupTimer = null;
                dbLocked = true;
                exec('sudo cp ' + databaseFile + ' ' + path, function () {
                    dbLocked = false;
                    console.log('bfinished acking database to: ' + path);
                    scheduleBackup(backupPath);
                });
            }, 1000 * 60 * 60 * 24);
        } else {
            console.error("Database backup path: " + path + " does not exist");
        }
        
    }
}

var TableStates = { Readings: false, Config: false, Probes: false, Circuits: false};
var totalRowCount = 0;
var sqlite3 = require('sqlite3');
var powerDb = new sqlite3.Database(databaseFile, function (err) {

    if (err) {
        console.log("Error opening database: " + databaseFile + " : " + err);
    } else {

        console.log('opened database: ' + databaseFile);

        
        //db.run('PRAGMA temp_store=memory', null, true);
        db.runSql('PRAGMA foreign_keys=on', null, true);

        db.runSql("create table if not exists Probes ( id INTEGER primary key, Type text, Board int check(Board>=0 and Board<=7), CurrentChannel int check(CurrentChannel>=0 and CurrentChannel<=15), VoltageChannel int check(VoltageChannel>=0 and VoltageChannel<=3), Breaker int, Alert Text);", function (err) {
            if (err) {
                console.log("Error creating Probes table: " + err);
                TableStates.Probes = "Error";
            } else {

                var afterReady = function () {
                    // insert first probe if none exist
                    db.runSql("Insert into Probes (id, Type, Board, CurrentChannel, VoltageChannel, Breaker, Alert) select 1,'30A',0,0,0,20,null where (select count(*) from Probes) = 0;", null, true);

                    console.log('Probes table ready');
                    TableStates.Probes = true;
                }
                
                // add Alert column if doesn't exist
                db.all("pragma table_info(Probes);", function(err, results) {
                   if(err) {
		                console.log("Error selecting from Probes table: " + err);
                        TableStates.Probes = "Error";
                   } else if (results.length == 6) {
                       //console.log("Adding Alert column to Probes table");
                       db.runSql("Alter table Probes add column Alert int;", function (err) {
                           if(err) {
                              console.log("Error adding Alert column to Probes table: " + err);
                              TableStates.Probes = "Error";
                           } else {
                               afterReady();
                           }
                       }, true);
                   } else {
                       afterReady();
                   }
                }, true);
            }
        }, true);

        db.runSql("create table if not exists Config ( Name text primary key, Value Text);", function (err) {
            if (err) {
                console.log("Error creating Config table: " + err);
                TableStates.Config = "Error";
            } else {

                db.runSql("Insert or ignore into Config Values('Port', '3000');", null, true);
                db.runSql("Insert or ignore into Config Values('Mode', '000060');", null, true);
                db.runSql("Insert or ignore into Config Values('Config', '001001');", null, true);
                db.runSql("Insert or ignore into Config Values('DeviceName', '');", null, true);
                db.runSql("Insert or ignore into Config Values('Price', '0.1');", null, true);
                db.runSql("Insert or ignore into Config Values('Region', 'en-US');", null, true);
                db.runSql("Insert or ignore into Config Values('VoltageScale', '384');", null, true);

                db.runSql("Insert or ignore into Config Values('Probes', '[{''Name'':''30A'',''Factor'':''31''},{''Name'':''100A'',''Factor'':''115''},{''Name'':''200A'',''Factor'':''370''}]');", null, true);

                console.log('Config table ready');
                TableStates.Config = true;

                db.all("Select * from Config where Name = 'BackupDB';", function (err, results) {
                    if (!err && results.length == 1)  {
                        scheduleBackup(results[0].Value);
                    }
                }, true);
            }
        }, true);


        db.runSql("create table if not exists Circuits ( id INTEGER primary key, Name Text, Description Text, Enabled int, IsMain int, Probes text);", function (err) {
            if (err) {
                console.log("Error creating Circuits table: " + err);
                TableStates.Circuits = "Error";
            } else {

                // insert first circuit if none exist
                db.runSql("Insert into Circuits (id, Name, Description, Enabled, IsMain, Probes) select null,'Circuit 1','',1,0,'1' where (select count(*) from Circuits) = 0;", null, true);

                console.log('Circuits table ready');
                TableStates.Circuits = true;

                db.runSql("create table if not exists Readings (" + readingsTableColumnsSQL + ", foreign key(CircuitId) references Circuits(id));", function (err) {
                    if (err) {
                        console.log("Error creating Readings table: " + err);
                        TableStates.Readings = "Error";
                    } else {

                        var afterTableReady = function () {

                            // schedule for later to improve perf
                            updateTotalRowCount();
                            //setTimeout(updateTotalRowCount, 5000);

                            console.log('Readings table ready');
                            TableStates.Readings = true;
                            //db.runSql("create index if not exists Readings_CircuitId_idx on Readings(CircuitId);", null, true);
                            db.runSql("create index if not exists Readings_Timestamp_CircuitId_P_idx on Readings(Timestamp, CircuitId, P);", null, true);
                            db.runSql("create index if not exists Readings_CircuitId_Timestamp_P_idx on Readings(CircuitId, Timestamp, P);", null, true);
                        }

                        // add F column if doesn't exist
                        db.all("pragma table_info(Readings);", function (err, results) {
                            if (err) {
                                console.log("Error selecting from Readings table: " + err);
                                TableStates.Readings = "Error";
                            } else if (results.length == 9) {
                                db.runSql("Alter table Readings add column F real;", function (err) {
                                    if (err) {
                                        console.log("Error adding F column to Readings table: " + err);
                                        TableStates.Readings = "Error";
                                    } else {
                                        afterTableReady();
                                    }
                                }, true);
                            } else {
                                afterTableReady();
                            }
                        }, true);
                    }
                }, true);
            }
        }, true);
    }

});


var WaitForTable = function (tableName, callback) {
    if (TableStates[tableName] == true && !dbLocked)
        callback();
    else if (TableStates[tableName] == "Error")
        callback("Table " + tableName + " failed to initialize");
    else {
        console.log("waiting for table: " + tableName);
        setTimeout(WaitForTable, 100, tableName, callback);
    }
}


var runSqlCommands = function(sql, callback) {
    _runSqlCommands(sql, 0, callback);
}

var _runSqlCommands = function(sql, index, callback) {

    if (index < sql.length) {
        //console.log("running: " + sql[index]);
        var startTime = new Date();
        db.runSql(sql[index], function (err) {
            var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
            
            if (err) {
                console.log('run time: ' + elapsed + " seconds");
                callback(err);
            }
            else {
                console.log("success(" + elapsed + " s): " + sql[index]);
                _runSqlCommands(sql, index + 1, callback);
            }
        });
    } else {
        callback(null);
    }
}


var updateTotalRowCount = function (callback) {
    sql = 'select count(*) as Rows from Readings;';
    
    db.all(sql, function (err, rows) {
        totalRowCount = rows[0].Rows;

        if (callback != null)
            callback(err, result);
    }, true);
}

function numberWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}


String.prototype.escape = function (str) { return (this.replace(/'/g, "''")) }

var db =
{
    lockWrites: function (locked) {
        dbLocked = (locked == true);
    },
    readConfig: function (callback) {

        WaitForTable("Config", function (err) {

            if (err)
                return callback(err);

            sql = "Select * from Config;";

            //console.log(sql);

            db.all(sql, function (err, results) {
                if (err) {
                    console.log(sql);
                    console.log("select err: " + err);
                    callback(err);
                } else {
                    //console.log(results);

                    var ret = {};
                    for (var i = 0; i < results.length; i++) {
                        ret[results[i].Name] = results[i].Value;
                    }

                    callback(null, ret);
                }
            }, true);
        });
    },
    setConfig: function (name, value, callback) {
        cachedConfig = null;
        WaitForTable("Config", function (err) {

            if (err)
                return callback(err);

            sql = "Insert or Replace into Config Values('" + name.escape() + "', '" + value.escape() + "');";
            db.all(sql, function (err, results) {
                if (err) {
                    console.log(sql);
                    console.log("select err: " + err);
                }

                if (callback != null)
                    callback(err);
            }, true);
        });
    },
    insert: function (circuitId, i, v, p, q, pf, ts, f, callback) {
        WaitForTable("Readings", function (err) {

            if (err) {
                if (callback != null)
                    callback(err);
            } else {

                var sql = "Insert into Readings Values(null," + circuitId + ',' + i.toFixed(4) + ',' + v.toFixed(2) + ',' + p.toFixed(2) + "," + q.toFixed(2) + ',' + pf.toFixed(6) + ",'" + ts.getTime() / 1000 + "',null," + f.toFixed(4) + ");"

                db.execSql(sql, function (err) {
                    if (err)
                        console.log("Sql error executing statement: " + sql + " err: " + err);
                    else
                        totalRowCount++;

                    if (callback != null)
                        callback(err);
                });
            }
        });
    },
    count: function (start, end, callback) {

        var sql = "select count(*) as count from readings where Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " and Compacted is not null;";

        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                //console.log(results);

                var ret = {};
                ret.Compacted = results[0].count;
                sql = "select count(*) as count from readings where Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " and Compacted is null;";

                db.all(sql, function (err, results) {
                    if (err) {
                        console.log(sql);
                        console.log("select err: " + err);
                        callback(err);
                    } else {
                        //console.log(results);
                        ret.NotCompacted = results[0].count;
                        callback(null, ret);
                    }
                }, true);
            }
        }, true);
        
    },
    // compact the database
    // 1) copying the raw data to a back up database
    // 2) delete raw data from original database
    // 3) copy hourly averages back into original database
    compact: function (start, end, callback) {
        /*
        
        powerDb.serialize(function () {

            var e = null;
            try {
                run("attach database 'archive.db' as archive;");
                run("create table if not exists archive.Readings (" + readingsTableColumnsSQL + ");");
                run("create index if not exists archive.Readings_Timestamp_idx on Readings(Timestamp);");

                var where = " where Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " ";

                run("insert into archive.Readings Select * from Readings " + where + " and Compacted is null;");
                run("delete from Readings " + where + ";");
                run("insert into Readings (CircuitId, I, V, P, Q, PF, Timestamp, Compacted) " +
                            "Select CircuitId, round(avg(I),1) as I,round(avg(V),1) as V, round(avg(P),1) as P,round(avg(Q),1) as Q, round(avg(PF),5) as PF, strftime('%s', strftime('%Y-%m-%d %H:00:00', datetime(timestamp, 'unixepoch'))) as Timestamp, 1 as Compacted " +
                            "from archive.Readings " + where + " group by CircuitId, strftime('%Y%m%d%H', datetime(timestamp, 'unixepoch'));");
            }
            catch (err)
            {
                concole.log("Compact failed: " + err);
                e = err;
            }
            finally
            {
                run("detach database archive;", function () {
                    callback(e);
                });
            }
        });
  */
        
        
        var sql = [];
        sql.push("attach database 'archive.db' as archive;");
        sql.push("create table if not exists archive.Readings (" + readingsTableColumnsSQL + ");");
        //sql.push("create index if not exists archive.Readings_Timestamp_idx on Readings(Timestamp);");
        sql.push("create index if not exists Readings_Timestamp_CircuitId_P_idx on Readings(Timestamp, CircuitId, P);");
        sql.push("create index if not exists Readings_CircuitId_Timestamp_P_idx on Readings(CircuitId, Timestamp, P);");

        var where = " where Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " ";

        sql.push("insert into archive.Readings Select * from Readings " + where + " and Compacted is null;");
        sql.push("delete from Readings " + where + ";");
        sql.push("insert into Readings (CircuitId, I, V, P, Q, PF, Timestamp, Compacted, F) " +
                    "Select CircuitId, round(avg(I),1) as I,round(avg(V),1) as V, round(avg(P),1) as P,round(avg(Q),1) as Q, round(avg(PF),5) as PF, strftime('%s', strftime('%Y-%m-%d %H:00:00', datetime(timestamp, 'unixepoch'))) as Timestamp, 1 as Compacted, round(avg(F),2) as F " +
                    "from archive.Readings " + where + " group by CircuitId, strftime('%Y%m%d%H', datetime(timestamp, 'unixepoch'));");

        sql.push("detach database archive;");

        runSqlCommands(sql, function (err) {
            updateTotalRowCount();
            if (err)
                db.runSql("detach database archive;", function (err2) {
                    if (err2)
                        console.log("failed to detach: " + err2);
                    else
                        console.log("detached");

                    callback(err);
                });
            else
                callback(err);
        });
        
    },
    // return data for a given time range
    read: function (circuitId, start, end, groupBy, timeOffset, telemetry, callback) {

        
        var sql;

        if (groupBy == null)
            groupBy = '';

        if (groupBy.toLowerCase() == 'hour')
            sql = "Select round(avg(P),0) as P, strftime('%s', (strftime('%Y-%m-%d %H:00:00', datetime(timestamp, 'unixepoch')))) as Timestamp from Readings where CircuitId = " + circuitId + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by strftime('%Y%m%d%H', datetime(timestamp, 'unixepoch'));";
        else if (groupBy.toLowerCase() == 'day')
            sql = "Select round(avg(P),0) as P, strftime('%s', (strftime('%Y-%m-%d 00:00:00" + timeOffset + "', datetime(timestamp, 'unixepoch', '" + timeOffset + "')))) as Timestamp from Readings where CircuitId = " + circuitId + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by strftime('%Y%m%d', datetime(timestamp, 'unixepoch', '" + timeOffset + "'));";
        else if (groupBy.toLowerCase() == 'month')
        //sql = "Select avg(P) as P, strftime('%s', (strftime('%Y-%m-01', datetime(timestamp, 'unixepoch')))) as Timestamp from Readings where CircuitId = " + circuitId + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by strftime('%Y%m', datetime(timestamp, 'unixepoch'));";
            sql = "Select round(avg(P),0) as P, strftime('%s', (strftime('%Y-%m-01 00:00:00" + timeOffset + "', datetime(timestamp, 'unixepoch', '" + timeOffset + "')))) as Timestamp from Readings where CircuitId = " + circuitId + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by strftime('%Y%m', datetime(timestamp, 'unixepoch', '" + timeOffset + "'));";
        else
            sql = "Select round(P,0) as P, Timestamp from Readings where CircuitId = " + circuitId + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + ';';

        var startTime = new Date();
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                var ts = [], P = [];
                for (var i = 0; i < results.length; i++) {
                    ts[i] = results[i].Timestamp;
                    P[i] = results[i].P;
                }
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                telemetry.push("read (" + elapsed + " ms) : " + sql);
                callback(null, { ts: ts, P: P });
            }
        }, true);
    },
    minmaxavg: function (circuit, start, end, telemetry, callback) {
        var sql;

        if (start != null && end != null) {
            sql = "select round(min(P),0) as min, round(max(P),0) as max, round(avg(P),0) as avg from readings where CircuitId = " + circuit + " and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + ";";
        }
        else {
            sql = "select round(min(P),0) as min, round(max(P),0) as max, round(avg(P),0) as avg from readings where CircuitId = " + circuit + " and Timestamp > " + (new Date().getTime() - 60*60*24*1000) / 1000 + ";";
        }

        var startTime = new Date();

        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                telemetry.push("minmaxavg (" + elapsed + " ms) : " + sql);
                callback(null, results);
            }
        }, true);
    },
    // return cumulative power for a given time range
    cumulative: function (start, end, orderBy, telemetry, callback) {

        var sql;

        if (orderBy != 'Watts' && orderBy != 'Min' && orderBy != 'Max')
            orderBy = "Watts";  // default to Watts

        if (start != null && end != null) {
            sql = "Select C.Name as CircuitId, round(avg(P),0) as Watts, round(min(P),0) as Min, round(max(P),0) as Max from Readings R inner join Circuits C on R.CircuitId=C.id where C.IsMain = 0 and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by CircuitId order by " + orderBy + " desc;";
        }
        else {
            sql = 'select (select Name from Circuits where id = CircuitId) as CircuitId, P as Watts, P as Min, P as Max from (select * from readings order by timestamp desc limit (select count(*) from Circuits where Enabled=1))  where (select IsMain from Circuits where id=CircuitId) = 0 order by ' + orderBy + ' desc;';
        }

        var startTime = new Date();
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                telemetry.push("cumulative (" + elapsed + " ms) : " + sql);
                callback(null, results);
            }
        }, true);
    },
    rollup: function (callback, includeMains) {

        var result = {};
        var msPerDay = 1000 * 60 * 60 * 24; // one day
        var end = new Date();
        var start = new Date(end - msPerDay), sql;
        var exclude = "C.IsMain = 0 and";

        if (includeMains)
            exclude = "";

        // get top three circuits using the most energy over the last day
        var sql = "Select C.Name as CircuitId, round(avg(P),1) as Watts from Readings R inner join Circuits C on R.CircuitId=C.id where " + exclude + " Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + " group by CircuitId order by Watts desc limit 3; ";
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else if (results.length == 0) {
                db.rollup(callback, true);
            } else {

                //console.log('double sql result: ' + JSON.stringify(results));

                result.Circuits = [];
                for (var i = 0; i < results.length; i++)
                    result.Circuits.push(results[i]);

                // total energy consumed on Mains over last day
                sql = "Select round(avg(P),1) as Watts from Readings where CircuitId=(select id from Circuits where IsMain=1) and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + ";";
                db.all(sql, function (err, results) {
                    if (err) {
                        console.log(sql);
                        console.log("select err: " + err);
                        callback(err);
                    } else {

                        //console.log('LastDay: ' + JSON.stringify(results));
                        result.LastDay = results[0].Watts;

                        // total energy consumed on Mains over last 30 days
                        start = new Date(end - (msPerDay * 30));
                        sql = "Select round(avg(P),1) as Watts from Readings where CircuitId=(select id from Circuits where IsMain=1) and Timestamp >= " + start.getTime() / 1000 + " and Timestamp < " + end.getTime() / 1000 + ";";
                        db.all(sql, function (err, results) {
                            if (err) {
                                console.log(sql);
                                console.log("select err: " + err);
                                callback(err);
                            } else {

                                //console.log('LastMonth: ' + JSON.stringify(results));
                                result.LastMonth = results[0].Watts;

                                //console.log(JSON.stringify(result));
                                callback(null, result);
                            }
                        }, true);
                    }
                }, true);
            }
        }, true);
    },
    updateProbe: function (id, type, board, currentChannel, voltageChannel, breaker, alert, callback) {

        var sql = '';

        if (id == null || id === undefined || id.toString() == '') {
            sql = "Insert into Probes Values(null,'" + type.escape() + "'," + board + ',' + currentChannel + ',' + voltageChannel + ',' + breaker + ",'" + alert + "'); ";
        } else {
            sql = "Insert or replace into Probes Values(" + id + ",'" + type.escape() + "'," + board + ',' + currentChannel + ',' + voltageChannel + ',' + breaker + ",'" + alert + "'); ";
        }
        
        db.runSql(sql, callback, true);
    },
    all: function (sql, callback, log) {
        var startTime = null;
        if (arguments.length == 3)
            startTime = new Date();

        powerDb.all(sql, function (err, results) {

            if (startTime != null) {
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                console.log("elapsed " + elapsed + " (" + sql + ")");
            }

            if (err)
                console.log("Sql error running statement: " + sql + " err: " + err);

            if (callback != null)
                callback(err, results);
        });
    },
    execSql: function (sql, callback, log) {
        var startTime = null;
        if (arguments.length == 3)
            startTime = new Date();

        powerDb.exec(sql, function (err) {
            if (startTime != null) {
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                console.log("elapsed " + elapsed + " (" + sql + ")");
            }

            if (err)
                console.log("Sql error executing statement: " + sql + " err: " + err);

            if (callback != null)
                callback(err);
        });
    },
    runSql: function (sql, callback, log) {
        var startTime = null;
        if (arguments.length == 3)
            startTime = new Date();
        powerDb.run(sql, function (err) {

            if (startTime != null) {
                var elapsed = (new Date().getTime() - startTime.getTime()) / 1000;
                console.log("elapsed " + elapsed + " (" + sql + ")");
            }

            if (err)
                console.log("Sql error running statement: " + sql + " err: " + err);

            if (callback != null)
                callback(err, this.lastID, this.changes);
        });
    },
    updateProbes: function (probes, callback) {
        cachedConfig = null;
        var probeIds = [];
        var f = function (index) {
            if (index < probes.length) {
                db.updateProbe(probes[index].id, probes[index].Type, probes[index].Board, probes[index].CurrentChannel, probes[index].VoltageChannel, probes[index].Breaker, probes[index].Alert, function (err, lastID) {
                    if (err) {
                        if (callback != null)
                            callback(err);
                    } else {
                        probeIds.push(lastID);
                        f(index + 1);
                    }
                });
            } else if (callback != null) {
                callback(null, probeIds);
            }
        }

        f(0);
    },
    getProbes: function (callback) {
        db.select(callback, "Select * from Probes;");
    },
    getCostPerKWh: function (callback) {
        db.select(function (err, result1) {
            db.getRegion(function (err, result2)
            {
                callback(err, result1, result2);
            });
        }, "Select * from Config where Name='Price';");
    },
    getRegion: function (callback) {
        db.select(callback, "Select * from Config where Name='Region';");
    },
    updateCircuit: function (circuitId, name, description, enabled, isMain, probes, callback) {
        cachedConfig = null;
        db.updateProbes(probes, function (err, probeIds) {
            if (err) {
                if (callback != null)
                    callback(err);
            } else {
                var sql = "into Circuits Values(null,'" + name.escape() + "', '" + description.escape() + "'," + enabled + "," + isMain + ",'" + probeIds.join() + "');";
                if (circuitId == null || circuitId === undefined || circuitId.toString() == '') {
                    db.runSql("insert " + sql, callback, true);
                } else {
                    // to improve perf try update first then insert
                    var updatesql = "update Circuits set Name='"+ name.escape() + "', Description='"+ description.escape() + "', Enabled="+ enabled + ", IsMain=" + isMain + ", Probes='" + probeIds.join() + "' where id =" + circuitId + ";"; //Values(" + circuitId + ",'" + name.escape() + "', '" + description.escape() + "'," + enabled + "," + isMain + ",'" + probeIds.join() + "');";
                    db.runSql(updatesql, function (err, lastID, changes) {

                        if (err == null && changes == 0) {
                            db.runSql('insert or replace ' + sql, callback, true);
                        } else {
                            callback(err, lastID);
                        }
                    }, true);
                }
            }
        });
    },
    updateCircuits: function (circuits, callback) {
        cachedConfig = null;

        // first drop any existing circuits that are not in the new config
        var newCktIds = [];
        for (i = 0; i < circuits.length; i++) {
            if (circuits[i].id != "" && circuits[i].id != null)
                newCktIds.push(circuits[i].id);
        }


        var f = function (index, callback) {
            if (index < circuits.length) {
                db.updateCircuit(circuits[index].id, circuits[index].Name, circuits[index].Description, circuits[index].Enabled, circuits[index].IsMain, circuits[index].Probes, function (err) {
                    if (err) {
                        console.log('UpdateCircuits failed: ' + err);
                        if (callback != null)
                            callback(err);
                    } else {
                        f(index + 1, callback);
                    }
                });
            } else {
                if (callback != null)
                    callback(null);
            }
        }

        var f2 = function (index, results, callback) {
            if (index < results.length) {
                db.deleteCircuit(function (err) {
                    if (err) {
                        console.log('deleteCircuit failed: ' + err);
                        if (callback != null)
                            callback(err);
                    } else {
                        f2(index + 1, results, callback);
                    }
                }, results[index].id);
            } else {
                if (callback != null)
                    callback(null);
            }
        }

        

        db.select(function (err, results) {
            if (err) {
                callback(err);
            } else {
                f2(0, results, function (err) {
                    if (err) {
                        if (callback != null)
                            callback(err);
                    } else {
                        f(0, callback);
                    }
                });

                
            }

            
        }, "select id from circuits where id not in (" + newCktIds.join(",") + ");");

        //f(0);
    },
    getCircuits: function (callback, strip) {

        if (cachedConfig != null) {
            console.log("sending cached config");
            cachedConfig['DatabaseRows'] = numberWithCommas(totalRowCount);
            strippedConfig['DatabaseRows'] = numberWithCommas(totalRowCount);

            if (strip)
                return callback(null, strippedConfig);
            else
                return callback(null, cachedConfig);
        }

        WaitForTable("Circuits", function (err) {

            if (err) {
                console.log('getCircuits error:' + err);
                return callback(err);
            }

            var sql = "select * from Circuits;";

            db.all(sql, function (err, circuits) {
                if (err) {
                    console.log(sql);
                    console.log("select err: " + err);
                    callback(err);
                } else {

                    // fetch probes
                    sql = "Select * from Probes;";
                    //console.log(sql);
                    db.all(sql, function (err, probes) {
                        if (err) {
                            console.log(sql);
                            console.log("select err: " + err);
                            callback(err);
                        } else {

                            var findProbe = function (probeId) {
                                for (var i = 0; i < probes.length; i++) {
                                    if (probes[i].id == probeId)
                                        return probes[i];
                                }
                                return null;
                            };


                            for (index = 0; index < circuits.length; ++index) {
                                var c2 = circuits[index].Probes.split(',');
                                circuits[index].Probes = [];
                                for (var i = 0; i < c2.length; i++) {
                                    var probe = findProbe(c2[i]);
                                    if (probe != null) {
                                        circuits[index].Probes.push(probe);
                                    }
                                }
                                //circuits[index].Probes = c2;
                            }

                            sql = "Select * from Config;";
                            //console.log(sql);
                            db.all(sql, function (err, configs) {
                                //console.log('config: ' + JSON.stringify(config));
                                result = {};

                                for (var i = 0; i < configs.length; i++) {
                                    var x = configs[i];

                                    /*if (x.Name == "VoltageFactor")
                                    result.VoltageFactor = Number(x.Value);
                                    */

                                    if (x.Name == "Probes") {
                                        result.Probes = eval('(' + x.Value + ')');
                                    } else {

                                        console.log('read: ' + x.Name + "->" + x.Value);
                                        result[x.Name] = x.Value;
                                    }
                                }

                                result["HardwareVersion"] = "2.2";

                                //console.log(JSON.stringify(result));
                                result.Circuits = circuits;
                                result['DatabaseRows'] = totalRowCount;

                                //strip out samples
                                strippedConfig = JSON.parse(JSON.stringify(result));
                                for (var i = 0; i < strippedConfig.Circuits.length; i++) {
                                    strippedConfig.Circuits[i].Samples = null;
                                }

                                // set up backup
                                scheduleBackup(result['BackupDB']);

                                cachedConfig = result;
                                if (strip)
                                    callback(null, strippedConfig);
                                else
                                    callback(null, result);
                            }, true);
                        }
                    }, true);
                }
            }, true);
        });
    },
    select: function (callback, sql) {
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                callback(null, results);
            }
        });
    },


    replaceConfiguration: function (callback, configuration) {
        cachedConfig = null;
        //console.log('length: ' + configuration.length);
        if (configuration != null) {
            var sql = ""; //"Update Configuration set Enabled=0; ";  // disable all circuits.  can't delete due to foreign key relationship with Readings table

            for (index = 0; index < configuration.length; ++index) {
                var val = configuration[index];
                if (isNaN(val.id) || val.id == '')
                    val.id = 'null';

                var p1 = (val.Probe1 == null) ? null : "'" + val.Probe1.escape() + "'";
                var p2 = (val.Probe2 == null) ? null : "'" + val.Probe2.escape() + "'";

                sql += "Insert or replace into Circuits Values(" + val.id + "," + p1 + "," + val.Board1 + ',' + val.CurrentChannel1 + ',' + val.VoltageChannel1 + "," + p2 + "," + val.Board2 + ',' + val.CurrentChannel2 + ',' + val.VoltageChannel2 + ",'" + val.Name.escape() + "', '" + val.Description.escape() + "'," + val.Enabled + ',' + val.IsMain + ");"
            };

            //console.log(sql);
            db.execSql(sql, function (err) {
                if (err) {
                    console.log("Sql error executing statement: " + sql + " err: " + err);
                }
                callback(err);
            }, true);
        } else {
            console.log('bad');
        }
    },
    deleteCircuit: function (callback, circuitId) {
        // WARNING - deletes all data !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        cachedConfig = null;
        var sql = "Select Probes from Circuits where id=" + circuitId + ";"
        
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                sql = "Delete from Readings where CircuitId=" + circuitId + "; Delete from Probes where id in(" + results[0].Probes + "); Delete from Circuits where id=" + circuitId + ";";
                
                db.execSql(sql, function (err) {
                    if (err) {
                        console.log(sql);
                        console.log("delete err: " + err);
                        callback(err);
                    } else {
                        callback(null);
                    }
                }, true);
            }
        }, true);
    },
    deleteProbe: function (callback, probeId) {
        cachedConfig = null;
        var sql = "Select * from Circuits where Probes like '%" + probeId + "%';"
        
        db.all(sql, function (err, results) {
            if (err) {
                console.log(sql);
                console.log("select err: " + err);
                callback(err);
            } else {
                for (var i = 0; i < results.length; i++) {
                    var probes = results[i].Probes.split(',');
                    var updated = false;

                    for (var j = probes.length - 1; j >= 0; j--) {
                        if (probes[j] === probeId) {
                            probes.splice(j, 1);
                            updated = true;
                        }
                    }

                    if (updated) {
                        // write it back
                        sql = "Update Circuits set Probes='" + probes.join() + "' where id=" + results[i].id + ";";
                        console.log(sql);
                        db.execSql(sql);
                    }
                }
                // delete from probes table
                sql = "Delete from Probes where id=" + probeId + ";";
                
                db.execSql(sql, function (err) {
                    if (err) {
                        console.log(sql);
                        console.log("delete err: " + err);
                        callback(err);
                    } else {
                        callback(null);
                    }
                }, true);
            }
        }, true);
    }
};

module.exports = db;
