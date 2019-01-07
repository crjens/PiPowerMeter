#!/bin/sh
cd ~
curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt-get -y install git
git clone https://github.com/crjens/PiPowerMeter.git app
cd app
git checkout test
git pull
npm install