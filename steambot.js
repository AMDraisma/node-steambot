var Colors = require('colors/safe');
var readline = require('readline');
var fs = require('fs');
var config = require('config');

var Steam = require('steam');
var SteamResources = require('steam-resources');


var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

var steamClient = new Steam.SteamClient();
var steamUser = new Steam.SteamUser(steamClient);
var steamFriends = new Steam.SteamFriends(steamClient);
var steamGameCoordinator = new Steam.SteamGameCoordinator(steamClient, 570);
var steamRichPresence = new Steam.SteamRichPresence(steamClient, 570);

var username = config.get('login.username');
var password = config.get('login.password');
var authcode = undefined;


LogType = {
	Info: 0,
	Warning: 1,
	Error: 2,
	Critical: 3,
	Chat: 4
};


///////////////////////
// utility functions //
///////////////////////

function log(type, message) {
	switch (type) {
		case LogType.Info:
			console.log(Colors.cyan("+INFO+: " + message));
			break;
		case LogType.Warning:
			console.log(Colors.yellow("*WARN*: " + message));
			break;
		case LogType.Info:
			console.log(Colors.orange("≡ERRR≡: " + message));
			break;
		case LogType.Info:
			console.log(Colors.red("☼CRIT☼: " + message));
			break;
		case LogType.Chat:
			console.log(Colors.green("!CHAT!"));
			console.log(Colors.green(message[0] + ":"));
			console.log(Colors.green(message[1]));
			break;
		default:
			console.log("-UNKW-: " + message);
			break;
	}
}

function tryReadSentryFile() {
	var result;
	var sentryfile = config.get('sentryfile.location');
	fs.access(sentryfile, fs.R_OK | fs.W_OK, (err) => {
		result = err ? undefined : fs.readFileSync(sentryfile);
	});
	return result;
}

function initPersonaStates() {
	var count = 0;
	var online = 0;
	var dota = 0;
	for (var personaState in steamFriends.personaStates.friends) {
		count++;
		if (personaState.persona_state == Steam.EPersonaState.Online) {
			online++;
			if (personaState.gameid == 570) {
				dota++;
			}
		}
	}
	log(LogType.Info, online + "/" + count + " people online, " + dota + " playing dota.");
}


// starts the CLI
function initInterface() {
	rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "BOT>"
	});

	rl.prompt();

	rl.on('line', (line) => {
		args = line.trim().split(" ");
		switch (args[0]) {
			case "message":
				log(LogType.Info, "Sending message to " + args[1]);
				steamFriends.sendMessage(args[1], args.slice(2));
				break;
			case "getsid":
				log(LogType.Info, "Attempting to get sid for player" + args[1]);
				sendSpectateRequest(args[1]);
				break;
			default:
				log(LogType.Error, "Unknown command: " + line.trim());
				break;
		}
		rl.prompt();
	}).on('close', () => {
		log(LogType.Info, "Logging off...");
		steamClient.disconnect();
	});
}


////////////////////////
// steamclient events //
////////////////////////

steamClient.on('connected', function() {
	log(LogType.Info, "Connected to steam, logging in...");
	var sentry_sha = tryReadSentryFile();
	if (sentry_sha != undefined ) {
		log(LogType.Info, "Sentry file found.");
	}
	steamUser.logOn({
		account_name: username,
		password: password,
		auth_code: authcode,
		sha_sentryfile: sentry_sha
	});
});

steamClient.on('loggedOff', function() {
	log(LogType.Info, "Logged off, exiting.");
	process.exit(0);
});

// swallow error because reasons
steamClient.on('error', function() { });

steamClient.on('sentry', function(sentry) {
	log(LogType.Info, "Sentry file received. Saving...");
	fs.writeFileSync(config.get('sentryfile.location'), sentry);
});

steamClient.on('logOnResponse', function(response) {
	log(LogType.Info, "Logonresponse: " + response.eresult);
	switch (response.eresult) {
		case Steam.EResult.OK:
			log(LogType.Info, "Logged on success");

			// set bot as online
			steamFriends.setPersonaState(Steam.EPersonaState.Online);

			// start bot command line interface
			initInterface();

			// read initial persona states
			initPersonaStates();
			break;
		case Steam.EResult.Fail:
			log(LogType.Info, "Logon failed");
			break;
		case Steam.EResult.NoConnection:
			log(LogType.Info, "Logon failed: No connection");
			break;
		case Steam.EResult.InvalidPassword:
			log(LogType.Info, "Logon failed: Wrong password");
			break;
		case Steam.EResult.AccountLogonDenied:
			log(LogType.Info, "Authcode required");
			rl.question('Authcode: ', (answer) => {
				authcode = answer;
				steamClient.connect();
			rl.close();
			});
			break;
		default:
			log(LogType.Warning, "Unhandled login EResult");
			break;
	}
});

/////////////////////////
// steamfriends events //
/////////////////////////

steamFriends.on('personaState', function (friendPersonaState) {
	switch (friendPersonaState.persona_state) {
		case Steam.EPersonaState.Online:
			if (friendPersonaState.friendPersonaState.friendid == "") {
				
			}
			if (friendPersonaState.gameid == 570) {
				log(LogType.Info, friendPersonaState.player_name + " is playing Dota 2.");
			}
			break;
	}
});

steamFriends.on('friendMsg', function(steamid, message, eChatEntryType) {
	if (eChatEntryType == Steam.EChatEntryType.ChatMsg) {
		log(LogType.Chat, [steamid, message]);
	}
});

/////////////////////////////////
// steamgamecoordinator events //
/////////////////////////////////

steamGameCoordinator.on('message', (header, body) => {
	if (header.msg == steam.GC.Dota.Internal.EDOTAGCMsg.k_EMsgGCSpectateFriendGameResponse) {
		log(LogType.Info, "Received spectateFriendGameResponse. Server steamid: " + body.server_steamid);
	}
});

///////////////////////
// steamgc functions //
///////////////////////

function sendSpectateRequest (steamid) {
	var header = {
		msg: steam.GC.Dota.Internal.EDOTAGCMsg.k_EMsgGCSpectateFriendGame,
		proto: false
	};
	var body =  {
		steam_id: steamid
	};
	steamGameCoordinator.send(header, body);
}

/////////////
// connect //
/////////////

steamClient.connect();
