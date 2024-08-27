/**
 * Copyright 2013-2024 Netshot
 * 
 * This file is part of Netshot.
 * 
 * Netshot is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Netshot is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Netshot.  If not, see <http://www.gnu.org/licenses/>.
 */


/**
 * NOTES ON THIS DRIVER:
 * This driver triggers a backup of the target Checkpoint appliance and
 * download the file using SCP.
 * In order for SCP to work, the SSH user must have /bin/bash as login shell.
 */

var Info = {
	name: "CheckpointGaia",
	description: "Checkpoint Gaia",
	author: "NetFishers",
	version: "2.1"
};

var Config = {
	"productVersion": {
		type: "Text",
		title: "Gaia Product Version",
		comparable: true,
		searchable: true,
		checkable: true,
		dump: {
			preLine: "## Product version: "
		}
	},
	"kernelVersion": {
		type: "Text",
		title: "Kernel version",
		comparable: true,
		searchable: true,
		checkable: true
	},
	"configuration": {
		type: "LongText",
		title: "Configuration (clish)",
		comparable: true,
		searchable: true,
		checkable: true,
		dump: {
			pre: "## Configuration (taken on %when%):",
			post: "## End of configuration"
		}
	},
	"cpLicense": {
		type: "LongText",
		title: "License",
		comparable: true,
		searchable: true,
		checkable: true,
		dump: {
			pre: "## License status:",
			preLine: "## ",
			post: "## End of license"
		}
	},
	"backupArchive": {
		type: "BinaryFile",
		title: "Backup Archive",
	},
};

var Device = {
	"configurationSaved": {
		type: "Binary",
		title: "Configuration saved",
		searchable: true
	},
	"osEdition": {
		type: "Text",
		title: "OS Edition",
		searchable: true
	}
};

var CLI = {
	telnet: {
		macros: {
			clish: {
				options: [ "login", "clish", "expert" ],
				target: "clish"
			},
			expert: {
				options: [ "username", "clish", "expert", "noExpertPassword" ],
				target: "expert"
			}
		}
	},
	ssh: {
		macros: {
			clish: {
				options: [ "clish", "expert" ],
				target: "clish"
			},
			expert: {
				options: [ "clish", "expert" ],
				target: "expert"
			}
		}
	},
	username: {
		prompt: /^login: $/,
		macros: {
			auto: {
				cmd: "$$NetshotUsername$$",
				options: [ "password", "usernameAgain" ]
			}
		}
	},
	password: {
		prompt: /^Password: $/,
		macros: {
			auto: {
				cmd: "$$NetshotPassword$$",
				options: [ "loginAgain", "clish", "expert" ]
			}
		}
	},
	loginAgain: {
		prompt: /^login: $/,
		fail: "Authentication failed - Telnet authentication failure."
	},
	clish: {
		prompt: /^([A-Za-z\-_0-9\.:]+> )$/,
		error: /^(CLINFR0329|NMSHNM0679) .*nvalid/m,
		pager: {
			avoid: "set clienv rows 0",
			match: /^-- More --$/,
			response: " "
		},
		macros: {
			expert: {
				cmd: "expert",
				options: [ "expert", "noExpertPassword", "expertPassword" ],
				target: "expert"
			},
			save: {
				cmd: "save config",
				options: [ "clish" ],
				target: "clish"
			}
		}
	},
	expert: {
		prompt: /^(\[Expert@[A-Za-z\-_0-9\.]+:[0-9]+\]# )$/,
		macros: {
			clish: {
				cmd: "clish",
				options: [ "clish" ],
				target: "clish"
			},
			clishBack: {
				cmd: "exit",
				options: [ "clish" ],
				target: "clish"
			}
		}
	},
	noExpertPassword: {
		prompt: /Expert password has not been defined/,
		fail: "Unable to switch to expert mode - No expert password defined."
	},
	expertPassword: {
		prompt: /^Enter expert password:$/,
		macros: {
			auto: {
				cmd: "$$NetshotSuperPassword$$",
				options: [ "expert", "wrongPassword" ]
			}
		}
	},
	wrongPassword: {
		prompt: /Wrong password./,
		fail: "Invalid expert password"
	}
};

function snapshot(cli, device, config) {
	var addMatchSet = function(e) {
		e.matchSet = function(data, re, field, defaultValue) {
			var r = data.match(re);
			if (r) {
				e.set(field, r[1]);
			}
			else if (defaultValue) {
				e.set(field, defaultValue);
			}
		} 
	}
	addMatchSet(config);
	addMatchSet(device);
	
	
	cli.macro("clish");
	var showConfig = cli.command("show configuration");
	showConfig = showConfig.replace(/^(# Exported by .*) on .*/mg, "$1");
	config.set("configuration", showConfig);
	
	var configState = cli.command("show config-state");
	device.set("configurationSaved", !!configState.match(/^saved/));
	
	device.matchSet(showConfig, /^set hostname (.+)/m, "name");
	device.matchSet(showConfig, /^set snmp contact "(.+)"/m, "contact");
	device.matchSet(showConfig, /^set snmp location "(.+)"/m, "location");
	
	var showVersion = cli.command("show version all");
	config.matchSet(showVersion, /^Product version (.+)/m, "productVersion");
	config.matchSet(showVersion, /^OS kernel version (.+)/m, "kernelVersion");
	device.matchSet(showVersion, /^OS edition (.+)/m, "osEdition");
	
	var version = showVersion.match(/^Product version Check Point Gaia (.+)/m);
	if (version) {
		device.set("softwareVersion", version[1]);
	}
	
	var license = cli.command("cplic print");
	config.set("cpLicense", license);

	device.set("networkClass", "FIREWALL");
	
	var showInterfaces = cli.command("show interfaces all");
	var interfaces = cli.findSections(showInterfaces, /^Interface (.+)/m);
	for (var i in interfaces) {
		var networkInterface = {
			name: interfaces[i].match[1],
			ip: []
		};
		var description = interfaces[i].config.match(/^ *comments (\{(.+)\}|(.+))$/m);
		if (description) {
			networkInterface.description = description[2] || description[3];
		}
		var ipv4 = interfaces[i].config.match(/^ *ipv4-address (\d+\.\d+\.\d+\.\d+)\/(\d+)/m);
		if (ipv4) {
			networkInterface.ip.push({
				ip: ipv4[1],
				mask: parseInt(ipv4[2]),
				usage: "PRIMARY"
			});
			var vrrpPattern = /^set vrrp interface (.+) monitored-circuit vrid (\d+) backup-address (\d+\.\d+\.\d+\.\d+)/mg;
			while (match = vrrpPattern.exec(config)) {
				if (match[1] == networkInterface.name) {
					networkInterface.ip.push({
						ip: match[3],
						mask: parseInt(ipv4[2]),
						usage: "VRRP"
					});
				}
			}
		}
		var ipv6 = interfaces[i].config.match(/^ *ipv6-address ([A-Fa-f0-9:]+)\/(\d+)/m);
		if (ipv6) {
			networkInterface.ip.push({
				ip: match[1],
				mask: parseInt(match[2]),
				usage: "PRIMARY"
			});
		}
		var macAddress = interfaces[i].config.match(/^ *mac-addr (([0-9A-fa-f][0-9A-fa-f]:){5}[0-9A-fa-f][0-9A-fa-f])/m);
		if (macAddress) {
			networkInterface.mac = macAddress[1];
		}
		if (interfaces[i].config.match(/^ *state off/m)) {
			networkInterface.enabled = false;
		}
		device.add("networkInterface", networkInterface);
	}
	
	var showAsset = cli.command("show asset all");
	device.matchSet(showAsset, /^Model (.+)/m, "family", "Check Point");
	
	var parts = ["Motherboard", "Chassis"];
	for (var p in parts) {
		var part = parts[p];
		var partNumber = showAsset.match(new RegExp("^" + part + " Assembly Part Number: (.+)", "m"));
		var serialNumber = showAsset.match(new RegExp("^" + part + " Serial Number: (.+)", "m"));
		if (partNumber && serialNumber) {
			device.add("module", {
				slot: part,
				partNumber: partNumber[1],
				serialNumber: serialNumber[1]
			});
		}
		if (serialNumber) {
			device.set("serialNumber", serialNumber[1]);
		}
	}

	var addBackup = cli.command("add backup local");
	if (!addBackup.match(/Creating backup package/)) {
		throw "Can't start backup: " + addBackup;
	}

	var maxLoops = 12 * 20;
	while (true) {
		backupStatus = cli.command("show backup status");
		if (backupStatus.match(/backup succeeded/)) {
			break;
		}
		else if (backupStatus.match(/Performing local backup/)) {
			maxLoops -= 1;
			if (maxLoops <= 0) {
				throw "The local backup took too long";
			}
			cli.sleep(5000);
		}
		else {
			throw "Invalid Checkpoint backup status";
		}
	}

	var backupNameMatch = backupStatus.match(/Backup file location: (.+)/);
	if (backupNameMatch) {
		var backupName = backupNameMatch[1];
		try {
			config.download("backupArchive", backupName, { method: "scp" });
		}
		catch (e) {
			var text = "" + e;
			if (text.match(/SCP error/)) {
				throw "SCP error: is /bin/bash the user's login shell?";
			}
			throw e;
		}
		finally {
			backupName = backupName.replace(/^.*\//, "");
			cli.command("delete backup " + backupName);
		}
	}
	else {
		throw "Unable to find backup file path";
	}
};

function analyzeSyslog(message) {
	if (message.match(/%SYS\-5\-CONFIG_I: Configured from (.*) by (.*)/)) {
		return true;
	}
	return false;
}

function analyzeTrap(trap, debug) {
	return trap["1.3.6.1.6.3.1.1.4.1.0"] == "1.3.6.1.4.1.2620.1.3000.10.1.1";
}

function snmpAutoDiscover(sysObjectID, sysDesc) {
	return sysObjectID.substring(0, 17) == "1.3.6.1.4.1.2620.";
}
