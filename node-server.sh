#! /bin/sh
# /etc/init.d/node-server

### BEGIN INIT INFO
# Provides:          node-server
# Required-Start:    $remote_fs $syslog
# Required-Stop:     $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
### END INIT INFO

USER=ReplaceWithUser

# Carry out specific functions when asked to by the system
case "$1" in
  start)
    echo "* starting node-server * "
    echo "* starting node-server * [`date`]" >> /var/log/node-server.log
    cd /home/$USER/app
    sudo forever start --workingDir /home/$USER/app -a -o /dev/null -e /home/$USER/nodejs.err.log --killSignal=SIGTERM /home/$USER/app/server.js
    ;;
  stop)
    echo "* stopping node-server * "
    echo "* stopping node-server * [`date`]" >> /var/log/node-server.log
    sudo forever stop --killSignal=SIGTERM /home/$USER/app/server.js
    ;;
  *)
    echo "Usage: /etc/init.d/node-server {start|stop}"
    exit 1
    ;;
esac
 
exit 0
