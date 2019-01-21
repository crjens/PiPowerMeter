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
