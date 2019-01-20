#!/bin/sh




# install nodejs on armv6
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.4/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
nvm install --lts
sudo cp -R $NVM_DIR/versions/node/$(nvm version)/* /usr/local/

# install nodejs
#curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
#sudo apt install -y nodejs



# install git
sudo apt-get -y install git

# install and configure PiPowerMeter
git clone https://github.com/crjens/PiPowerMeter.git app
cd app
git checkout test
git pull
npm install
 
# expand filesystem
sudo raspi-config nonint do_expand_rootfs

# enable SPI
echo '>>> Enable SPI'
sudo raspi-config nonint do_spi 0
#sudo sed -i 's/^#dtparam=spi=on.*/dtparam=spi=on/' /boot/config.txt

# enable UART
echo '>>> Enable UART'
sudo raspi-config nonint do_serial 2

echo '>>> Disable bluetooth and enable PL011 uart'
sudo raspi-config nonint set_config_var dtoverlay pi3-disable-bt /boot/config.txt
sudo systemctl disable hciuart
#wget -O uart_control.sh https://raw.githubusercontent.com/itemir/rpi_boat_utils/master/uart_control/uart_control
#chmod +x uart_control.sh
#sudo ./uart_control.sh gpio

echo '>>> PiPowerMeter is installed.  Please reboot now.'
sudo reboot