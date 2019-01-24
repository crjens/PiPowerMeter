PiPowerMeter
=====

PiPowerMeter is an energy usage monitor based on the Cirrus Logic CS5463/5490 energy IC's (http://www.cirrus.com/en/products/pro/detail/P1092.html) and a Raspberry Pi.  It consists of two custom designed stacking pcb's.  The main board houses the power supply, energy IC, voltage sensors and supporting electronics.  The current sensor board houses 16 multiplexed current input channels that allow monitoring up to 16 different circuits via standard clamp-on ct's.  A single main board supports up to 8 stacked current sensor boards for a total monitoring capacity of up to 128 circuits.
The system is controlled by a nodejs based program running on the Raspberry Pi and includes a self contained web based monitoring portal.  Energy data are stored locally on the Raspberry Pi in a sqlite database making the system 100% stand-alone with no requirement for additional hardware or external servers.



Features
--------
 - 100% stand alone system with no reliance on external hardware or servers
 - Ability to monitor up to 128 circuits via round-robin sampling
 - Uses simple off the shelf clamp-on current sensors
 - Highly accurate measurement of voltage, current, power usage and power factor based on CS5463/CS5490 energy IC
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

Hardware Installation
---------------------
1. The Raspberry Pi mounts directly to the 40-pin header on the control board and is powered from the control board's universal power supply.  Do not attempt to power the Raspberry Pi via its micro usb port or it may be damaged.
2. The control board requires a direct connection to the AC power source that is being monitored.  This AC connection provides both the voltage reference for the energy calculations as well as the power source for the Raspberry Pi and supporting electronics.  The AC power source is connected via 5 pin terminal connector shown [here](https://raw.githubusercontent.com/crjens/PiPowerMeter/master/Documentation/ACIn.jpg) and supports 100-240VAC and 50/60Hz.  

	- For US 120/240V split phase connect Ground, Neutral, AC1 and AC2.
	- For 240V single phase connect Ground, Neutral and AC1.
	- For 3 phase connect Ground, Neutral, AC1, AC2 and AC3.
3. Current sensors are connected to the input board via standard 3.5mm (1/8") audio plugs.  They must be current-type sensors without built-in sense resistors and must produce a full scale output of less than 50mA.  YHDC produces a full line of current sensors that are inexpensive and readily available. Popular models include:
	- [YHDC-006 (20A)](http://en.yhdc.com/product1311.html?productId=612)
	- [YHDC-013-000 (100A)](http://en.yhdc.com/product1311.html?productId=401)
	- [YHDC-019 (200A)](http://en.yhdc.com/product1311.html?productId=380)


Software Installation
---------------------
1. Any of the full size Raspberry Pi models with the 40 pin header are supported including: V1 A+, V1 B+, V2, V3 B and V3 B+.  The additional memory and computing power of the V2/V3 models is recommended.
2. Start with latest Raspbian image from http://downloads.raspberrypi.org/raspbian_lite_latest
	1. (verified with Raspbian Stretch 2018-11-13)
	2. It's recommended that you use the Lite version because it's smaller and installs faster but you can use either.
3. login to Pi with Putty or other 
	1. the latest versions of Raspbian have ssh disabled.  You can enable ssh via raspi-config or just create an empty file named 'ssh' in the boot partition of the sd card.
4. Install the PiPowerMeter software by running the following command:
	1. wget -O - https://raw.githubusercontent.com/crjens/PiPowerMeter/test/setup.sh | bash
5. run 'sudo raspi-config' 
	1. set locale and timezone under Localisation options
	2. expand filesystem under Advanced options
	3. change user password (optional)
	4. reboot when prompted after exiting raspi-config
6. Open your browser to http://<Your Raspberry Pi's IP Address>:3000
