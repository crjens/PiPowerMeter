#! /bin/sh
# /etc/init.d/node-server

### BEGIN INIT INFO
# Provides:          node-server
# Required-Start:    $remote_fs $syslog
# Required-Stop:     $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
### END INIT INFO

# change this to wherever your node app lives #
path_to_node_app=/home/pi/app/server.js
APP_DIR=/home/pi/app
SERVER_JS_FILE=/home/pi/app/server.js
FOREVER=forever
USER=pi
OUT=/home/pi
NODE=/usr/bin/node

# Carry out specific functions when asked to by the system
case "$1" in
  start)
    echo "* starting node-server * "
    echo "* starting node-server * [`date`]" >> /var/log/node-server.log
    cd /home/pi/app
#	sudo $NODE $SERVER_JS_FILE >> /dev/null 2>&1&
    sudo $FOREVER start --workingDir $APP_DIR -a -o /dev/null -e $OUT/nodejs.err.log --killSignal=SIGTERM $SERVER_JS_FILE
    ;;
  stop)
    echo "* stopping node-server * "
    echo "* stopping node-server * [`date`]" >> /var/log/node-server.log
#	killall $NODE
    sudo $FOREVER stop --killSignal=SIGTERM $SERVER_JS_FILE 
    ;;
  *)
    echo "Usage: /etc/init.d/node-server {start|stop}"
    exit 1
    ;;
esac
 
exit 0
