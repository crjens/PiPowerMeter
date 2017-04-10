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



Install Instructions
--------------------
1. Start with latest Raspbian image from http://downloads.raspberrypi.org/raspbian_lite_latest
	1. (verified with Raspbian Jessie 2016-05-27 (both lite and full))  The installation steps are different so pay attention to step 4!
	2. It's recommended that you use the Lite version because it's smaller and installs faster but you can use either.
2. login to Pi with Putty or other 
3. run 'sudo raspi-config' 
	1. set locale and timezone under internationalisation options
	2. enable SPI under Advanced Options
	3. expand filesystem
	4. reboot when prompted after exiting raspi-config
4. Raspbian Jessie Lite Only.  Jessie-Lite does not ship with Git so install it
	1. sudo apt-get install git
5. Raspbian Jessie Full Only.  The Raspbian full version ships with Nodejs v0.10.29 which contains a bug that prevents installation of many 3rd party node packages so you'll need to remove it before installing Nodejs v4.*  Jessie-Lite does not ship with Nodejs so you can skip this step if using Jessie-Lite.
	1. sudo apt-get remove nodejs nodejs-legacy
6. Install Nodejs v4.4.5
	1. For Raspberry Pi model A+ or B+
		1. wget https://nodejs.org/dist/v4.4.5/node-v4.4.5-linux-armv6l.tar.gz 
		2. tar -xvf node-v4.4.5-linux-armv6l.tar.gz 
		3. sudo cp -R ./node-v4.4.5-linux-armv6l/* /usr/local/
	2. For Raspberry Pi 2 or Raspberry Pi 3
		1. wget https://nodejs.org/dist/v4.4.5/node-v4.4.5-linux-armv7l.tar.gz 
		2. tar -xvf node-v4.4.5-linux-armv7l.tar.gz 
		3. sudo cp -R ./node-v4.4.5-linux-armv7l/* /usr/local/
7. Clone PiPowerMeter into app directory
	1. git clone https://github.com/crjens/PiPowerMeter.git app
	2. cd app
	3. npm install


