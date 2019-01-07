#!/bin/sh

# check if sudo is used
if [ "$(id -u)" != 0 ]; then
  echo 'Sorry, you need to run this script with sudo'
  exit 1
fi

cd ~
#curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
#sudo apt install -y nodejs
#sudo apt-get -y install git
#git clone https://github.com/crjens/PiPowerMeter.git app
cd app
#git checkout test
#git pull
#npm install
 
# enable SPI on Raspberry Pi
echo '>>> Enable SPI'
if lsmod | grep spi_; then
  echo 'SPI already enab;ed'
else
  echo 'dtparam=spi=on' >> /boot/config.txt
fi
