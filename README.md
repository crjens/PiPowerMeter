PiPowerMeter
=====

PiPowerMeter is an energy usage monitor based on the Cirrus Logic CS5463 energy IC (http://www.cirrus.com/en/products/pro/detail/P1092.html) and a Raspberry Pi.  It consists of two custom designed stacking pcb's.  The main board houses the power supply, CS5463 IC, voltage sensors and supporting electronics.  The current sensor board houses 16 multiplexed current input channels that allow monitoring up to 16 different circuits via standard clamp-on ct's.  A single main board supports up to 8 stacked current sensor boards for a total monitoring capacity of up to 128 circuits.
The system is controlled by a nodejs based program running on the Raspberry Pi and includes a self contained web based monitoring portal.  Energy data are stored locally on the Raspberry Pi in a sqlite database making the system 100% stand-alone with no requirement for additional hardware or external servers.



Features
--------
 - 100% stand alone system with no reliance on external hardware or servers
 - Ability to monitor up to 128 circuits via round-robin sampling
 - Uses simple off the shelf clamp-on current sensors
 - Highly accurate measurement of voltage, current, power usage and power factor based on CS5463 energy IC
 - Raspberry Pi based control system
   * All data stored locally in sqlite database
   * Web based monitoring portal for viewing energy usage and configuration
   * Ability to recieve text alerts for overloads or other events.
 

 ![hardware](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/DSC_0009.JPG)

Screenshots
-----------
- [Main](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/main.png)
- [Daily](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/graph.png)
- [Instantaneous](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/instant.png)
- [Readings](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/readings.png)
- [Configuration](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/config.png)


Additional Images
-----------------
- [Installed System](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/DSC_0077.JPG)
- [Installed System 2](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/DSC_0078.JPG)
- [Sensors](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/DSC_0002.JPG)
- [Boards](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/DSC_0012.JPG)


Install Instructions
--------------------
1. Start with latest Raspbian image from http://downloads.raspberrypi.org/raspbian_lite_latest
	1. (verified with Raspbian Stretch 2017-09-07 (both lite and full))
	2. It's recommended that you use the Lite version because it's smaller and installs faster but you can use either.
2. login to Pi with Putty or other 
	1. the latest versions of Raspbian have ssh disabled.  You can enable ssh via raspi-config or just create an empty file named 'ssh' in the boot partition of the sd card.
3. Install/Update Nodejs (use one of the two methods below depending your model of Raspberry Pi)
	1. For Raspberry Pi 2 or Raspberry Pi 3 (64 bit only)
		1. curl -sL https://deb.nodesource.com/setup_6.x | sudo bash -
		2. sudo apt -y install nodejs
	2. For Raspberry Pi all versions (32 or 64 bit)
		1. wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.4/install.sh | bash
		2. nvm install --lts
		3. sudo cp -R $NVM_DIR/versions/node/$(nvm version)/* /usr/local/
4. Install PiPowerMeter software into app directory
	1. (Raspbian-Lite only) If using Raspbian-Lite you'll need to first install git.  Raspbian-Full has git preinstalled so you can skip this step.
		1. sudo apt-get -y install git
	2. git clone https://github.com/crjens/PiPowerMeter.git app
	3. cd app
	4. npm install
5. run 'sudo raspi-config' 
	1. set locale and timezone under Localisation options
	2. enable SPI under Interfacing Options
	3. expand filesystem under Advanced options
	4. change user password (optional)
	5. reboot when prompted after exiting raspi-config
6. Open your browser to http://<Your Raspberry Pi's IP Address>:3000
