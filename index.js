const mysql = require("mysql");
const express = require("express");
const bodyParser = require("body-parser");
var multer = require('multer')
var upload = multer({ dest: 'uploads/' })
const PoolManager = require('mysql-connection-pool-manager');
const nodemailer = require("nodemailer");
const http = require("http");
const querystring = require("querystring");

var mySQLPool = mysql.createPool({
	connectionLimit: 120,
	host: "localhost",
	user: "public_root",
	password: "",
	database: "codecrackers",
	waitForConnections: true
});

require('dotenv').config();

require('isomorphic-fetch');
var fs = require('fs');
const { Console } = require("console");

var app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

const PORT1 = process.env.PORT || 8080;	//Express port
const PORT2 = 8000;	//Http port
const UidLength = 11;
const TokenLength = 20;
const OtpLength = 6;

const appDomainPrefix = "http://192.168.1.10:" + PORT2 + "/"

class SessionHandler {
	constructor() {
		this.pendingSessions = {};
		this.activeSessions = [];
	}

	activateSession(data, callback) {
		if (this.activeSessions.includes(data))
			this.pendingSessions.data = callback;
		else {
			this.activeSessions.push(data);
			callback();
		}
	}

	deactivateSession(data) {
		if (this.pendingSessions.data != undefined) {
			this.pendingSessions.data();
			delete this.pendingSessions.data;
		} else {
			this.activeSessions.splice(this.activeSessions.indexOf(data), 1);
		}
	}
}

function nodemailerSendEmail(hrefLink, target, callback) {
	//error? success?
	const transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		auth: {
			user: process.env.eUser,
			pass: process.env.ePass2
		}
	});

	fs.readFile("mail-templates/mail-template.html", function (err, contents) {
		transporter.sendMail({
			from: 'unknown@gmail.com', // sender address
			to: target, // list of receivers
			subject: "Hello ✔", // Subject line
			text: "Hello world?", // plain text body
			html: contents.toString().replace("{{{{href}}}}", hrefLink), // html body
		}, function (err, info) {
			if (err) {
				//Exception
				callback(err, false);
			} else {
				//Success
				callback(null, true);
			}
		});
	});
}

function twilioSendMessage(message, to, callback) {
	const accountSid = process.env.twilio_sid;
	const authToken = process.env.twilio_token;

	const client = require('twilio')(accountSid, authToken);

	client.messages
		.create({
			body: message,
			from: '+15622194094',
			to: '+91' + to
		}).then(callback);
}

function generateUid(callback) {
	var count = UidLength;
	var _sym = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var str = '';
	for (var i = 0; i < count; i++) {
		str += _sym[parseInt(Math.random() * (_sym.length))];
	}
	callback(str)
}
function generateToken(callback) {
	var count = TokenLength;
	var _sym = 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var str = '';
	for (var i = 0; i < count; i++) {
		str += _sym[parseInt(Math.random() * (_sym.length))];
	}
	callback(str)
}
function generateOtp(callback) {
	var count = OtpLength;
	var _sym = '1234567890';
	var str = '';
	for (var i = 0; i < count; i++) {
		str += _sym[parseInt(Math.random() * (_sym.length))];
	}
	callback(str);
}

function isNumber(n) {
	return /^-?[\d.]+(?:e-?\d+)?$/.test(n);
}

function reflectIndex(index, callback) {
	callback(index);
}

function checkEmail(emailAddress, callback) {
	//error? emailExists?
	mySQLPool.query("SELECT userId FROM users WHERE emailAddress='" + emailAddress + "'",
		function (err, res) {
			if (err) {
				//Exception
				callback(err, false);
				return;
			}

			if (res.length == 1) {
				//Email exists
				callback(null, true);
			} else {
				//Email doesn't exist
				callback(null, false);
			}
		});
}

function getUserIdFromEmail(emailAddress, callback) {
	//error? emailExists? userId?
	checkEmail(emailAddress, function (err, exists) {
		if (err) {
			callback(err, false, null);
			return;
		}

		if (exists) {
			mySQLPool.query("SELECT userId FROM users WHERE emailAddress='" + emailAddress + "'",
				function (err, res) {
					if (err) {
						callback(err, true, null);
						return;
					}

					if (res.length == 1) {
						callback(null, true, res[0].userId);
					}
				});
		} else {
			//Email doesn't exist
			allback(null, false, null);
		}
	});
}

function userLogin(emailAddress, callback) {
	//error? emailExists? userId?
	checkEmail(emailAddress, function (err, emailExists) {
		if (err) {
			callback(err, false, null);
			return;
		}

		if (emailExists) {
			getUserIdFromEmail(emailAddress, function (err, emailExists, userId) {
				createUserVerif(userId, emailAddress, function (err, success) {
					if (err) {
						callback(err, true, null);
						return;
					}

					if (success) {
						//Success
						callback(null, true, userId);
					}
				});
			})
		} else {
			//User has not registered, or wrong email address
			callback(null, false, null);
		}
	});
}
function createUserVerif(userId, emailAddress, callback) {
	//error? success?
	generateToken(function (token) {
		mySQLPool.query("SELECT token FROM userverif WHERE emailAddress='" + emailAddress + "'",
			function (err, res) {
				if (err) {
					callback(err, false);
					return;
				}

				if (res.length > 0) {
					var token2 = res[0].token;

					callback(null, true);

					mailUserToken(emailAddress, token2, function (err, success) {
						if (err) {
							return;
						}
					});
				} else {
					mySQLPool.query("INSERT INTO userverif (userId, emailAddress, token) VALUES ('" + userId + "', '" + emailAddress + "', '" + token + "')",
						function (err, res) {
							if (err) {
								callback(err, false);
								return;
							}

							//Success
							callback(null, true);

							mailUserToken(emailAddress, token, function (err, success) {
								if (err) {
									return;
								}
							});
						});
				}
			});
	});
}
function mailUserToken(emailAddress, token, callback) {
	//error? success?
	const transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		auth: {
			user: process.env.eUser,
			pass: process.env.ePass2
		}
	});

	fs.readFile("mail-templates/mail-template.html", function (err, contents) {
		transporter.sendMail({
			from: 'unknown@gmail.com', // sender address
			to: emailAddress, // list of receivers
			subject: "Hello ✔", // Subject line
			text: "Hello User!", // plain text body
			html: contents.toString().replace("{{{{href}}}}", appDomainPrefix + "userverification?email=" + emailAddress + "&token=" + token), // html body
		}, function (err, info) {
			if (err) {
				callback(err, false);
			} else {
				//Success
				callback(null, true);
			}
		});
	});
}
function returnErrorHtmlPage(error, callback) {
	fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
		return data.toString().replace("{{{{errorMessage}}}}", error);
	});
}

function userRegister(emailAddress, fullName, phoneNumber, deviceId, callback) {
	//error? emailExists? success?
	checkEmail(emailAddress, function (err, emailExists) {
		if (err) {
			callback(err, false, false);
			return;
		}

		if (!emailExists) {
			generateUid(function (uid) {
				mySQLPool.query("INSERT INTO users (userId, emailAddress, fullName, phoneNumber, verifiedUser, registeredUser) VALUES ('" + uid + "', '" + emailAddress + "', '" + fullName + "', '" + phoneNumber + "', 0, 0)");
				generateUid(function (authToken) {
					mySQLPool.query("INSERT INTO usersauth (userId, authToken, deviceId) VALUES ('" + uid + "', '" + authToken + "', '" + deviceId + "')");
					//Success
					callback(null, false, true);
				});
			});
		} else {
			//Email already exists
			callback(null, true, false);
		}
	});
}

function checkUserVerifStatus(emailAddress, callback) {
	//error? emailExists? state?
	mySQLPool.query("SELECT verifiedUser FROM users WHERE emailAddress='" + emailAddress + "'",
		function (err, res) {
			if (err) {
				callback(err, false, false);
				return;
			}

			if (res.length == 1) {
				var verifiedUser = res[0].verifiedUser;
				callback(null, true, verifiedUser);
			} else {
				callback(null, false, false);
			}
		});
}

function getAuthTokenForDevice(emailAddress, deviceId, callback) {
	//error? emailExists? success? userId?
	checkEmail(emailAddress, function (err, emailExists) {
		if (err) {
			callback(err, false, false, null);
			return;
		}

		if (emailExists) {
			getUserIdFromEmail(emailAddress, function (err, emailExists, userId) {
				if (err) {
					callback(err, true, false, null);
					return;
				}

				mySQLPool.query("SELECT authToken FROM usersauth WHERE userId='" + userId + "' AND deviceId='" + deviceId + "'",
					function (err, res) {
						if (err) {
							callback(err, true, false, null);
							return;
						}

						if (res.length == 1) {
							var authToken = res[0].authToken;
							callback(null, true, true, authToken);
						} else {
							//Internal error
							callback("internalError", true, true, null);
						}
					});
			})
		} else {
			//Email doesn't exist
			callback("emailDoesNotExist", false, false, null);
		}
	});
}

app.listen(PORT1, function () {
	console.log("Express server running on port " + PORT1 + "...");
});

http.createServer(function (req, res) {
	if (req.url.startsWith("/userverification?")) {
		try {
			var queries = querystring.parse(req.url.split("?")[1]);
			var emailAddress = queries.email;
			var token = queries.token;

			checkEmail(emailAddress, function (err, exists) {
				if (err) {
					fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
						res.end(data);
					});
					return;
				}

				if (exists) {
					mySQLPool.query("SELECT token FROM userverif WHERE emailAddress='" + emailAddress + "'",
						function (err, res2) {
							if (err) {
								fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
									res.end(data);
								});
								return;
							}

							if (res2.length > 0) {
								if (token == res2[0].token) {
									//Success
									fs.readFile("mail-templates/mail-template-success.html", function (err, data) {
										res.end(data);
										mySQLPool.query("DELETE FROM userverif where emailAddress='" + emailAddress + "'");
										mySQLPool.query("UPDATE users SET verifiedUser=1 WHERE emailAddress='" + emailAddress + "'");
									});
								} else {
									//Invalid token
									fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
										res.end(data);
									});
								}
							} else {
								//No User verification request was made
								fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
									res.end(data);
								});
							}
						});
				} else {
					//Email doesn't exist
					fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
						res.end(data);
					});
				}
			});
		} catch (e) {
			//Exception
			fs.readFile("mail-templates/mail-template-failure.html", function (err, data) {
				res.end(data);
			});
		}
	}
}).listen(PORT2);
console.log("Http server running on port " + PORT1 + "...");

app.post("/login", function (req, res, next) {
	const data = req.body;

	const emailAddress = data.emailAddress;
	const deviceId = req.query.deviceId;

	if (emailAddress && deviceId) {
		userLogin(emailAddress, function (err, emailExists, userId) {
			if (err) {
				res.json({
					"error": err,
					"code": 1
				});
				res.end();
				return;
			}

			if (emailExists) {
				res.json({
					"error": null,
					"code": 0,
					"userId": userId
				});
				res.end();
			} else {
				res.json({
					"error": "userDoesNotExist",
					"code": 1
				});
				res.end();
			}
		})
	} else {
		//Not enough information
		res.json({
			"error": "notEnoughInformation",
			"code": 1
		});
		res.end();
	}
});
app.post("/login/status", function (req, res, next) {
	const data = req.body;

	const emailAddress = data.emailAddress;

	if (emailAddress) {
		checkUserVerifStatus(emailAddress, function (err, emailExists, state) {
			if (err) {
				res.json({
					"error": err,
					"code": 1
				});
				res.end();
				return;
			}

			if (emailExists) {
				res.json({
					"error": null,
					"code": 0,
					"state": state
				});
				res.end();
			} else {
				res.json({
					"error": "userDoesNotExist",
					"code": 1
				});
				res.end();
			}
		})
	} else {
		//Not enough information
		res.json({
			"error": "notEnoughInformation",
			"code": 1
		});
		res.end();
	}
});
app.post("/login/authToken", function (req, res, next) {
	const data = req.body;

	const emailAddress = data.emailAddress;
	const deviceId = data.deviceId;

	if (emailAddress && deviceId) {
		getAuthTokenForDevice(emailAddress, deviceId, function (err, emailExists, success, authToken) {
			if (err) {
				res.json({
					"error": err,
					"code": 1
				});
				res.end();
				return;
			}

			if (emailExists) {
				if (success) {
					res.json({
						"error": null,
						"code": 0,
						"authToken": authToken
					});
					res.end();
				} else {
					res.json({
						"error": "internalError",
						"code": 1,
					});
					res.end();
				}
			} else {
				res.json({
					"error": "userDoesNotExist",
					"code": 1
				});
				res.end();
			}
		})
	} else {
		//Not enough information
		res.json({
			"error": "notEnoughInformation",
			"code": 1
		});
		res.end();
	}
});
app.post("/register", function (req, res, next) {
	const data = req.body;

	const emailAddress = data.emailAddress;
	const fullName = data.fullName;
	const phoneNumber = data.phoneNumber;
	const deviceId = data.deviceId;

	if (emailAddress && deviceId) {
		userRegister(emailAddress, fullName, phoneNumber, deviceId, function (err, emailExists, success) {
			console.log(err);
			if (err) {
				res.json({
					"error": err,
					"code": 1
				});
				res.end();
				return;
			}

			if (!emailExists) {
				if (success) {
					//Success
					res.json({
						"error": null,
						"code": 0,
					});
					res.end();
				} else {
					res.json({
						"error": "failure",
						"code": 1,
					});
					res.end();
				}
			} else {
				res.json({
					"error": "userDoesNotExist",
					"code": 1
				});
				res.end();
			}
		})
	} else {
		//Not enough information
		res.json({
			"error": "notEnoughInformation",
			"code": 1
		});
		res.end();
	}
});