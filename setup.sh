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
sudo sed -i 's/^#dtparam=spi=on.*//' /boot/config.txt
if grep -q 'dtparam=spi=on' /boot/config.txt; then
  echo 'SPI already enabled'
else
  echo 'dtparam=spi=on' >> /boot/config.txt
  echo 'SPI enabled'
fi

# enable UART on Raspberry Pi
echo '>>> Enable UART'
wget -O uart_control.sh https://raw.githubusercontent.com/itemir/rpi_boat_utils/master/uart_control/uart_control
chmod +x uart_control.sh
sudo ./uart_control.sh gpio

