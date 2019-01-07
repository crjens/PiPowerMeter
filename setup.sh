#!/bin/sh

# install nodejs
curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
sudo apt install -y nodejs

# install git
sudo apt-get -y install git

# install and configure PiPowerMeter
git clone https://github.com/crjens/PiPowerMeter.git app
cd app
git checkout test
git pull
npm install
 
# enable SPI
echo '>>> Enable SPI'
sudo sed -i 's/^#dtparam=spi=on.*//' /boot/config.txt
if grep -q 'dtparam=spi=on' /boot/config.txt; then
  echo 'SPI already enabled'
else
  echo 'dtparam=spi=on' >> /boot/config.txt
  echo 'SPI enabled'
fi

# enable UART
echo '>>> Enable UART'
wget -O uart_control.sh https://raw.githubusercontent.com/itemir/rpi_boat_utils/master/uart_control/uart_control
chmod +x uart_control.sh
sudo ./uart_control.sh gpio

