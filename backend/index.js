require("dotenv").config();
const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const urlEncodedParser = bodyParser.urlencoded({ extended: false });
const DB = require("./utils/DatabaseManager");
const AWS_Presigner = require("./utils/AWSPresigner");
const Chat = require("./utils/Chat").Chat;
const matcher = new (require("./utils/Matcher").Matcher)();
const { EventQueue, Event, MESSAGE_EVENT } = require('./utils/Events');


var isServerOutdated = false;

function validatePassword(password) {
    const regex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{6,}$/;
    return regex.test(password);
}

app.use(bodyParser.json());

app.get("/", (req, res) => {
	if (!isServerOutdated) {
		res.status(200).send("Server is Alive");
	} else {
		res.status(503).send("Server is updating...");
	}
});

app.get("/fetchUsers", (req, res) => {
	DB.fetchUsers({ email: req.query.email })
		.then(async function (result) {

			for (var i = 0; i < result.length; i++) {
				result[i].image = await AWS_Presigner.generateSignedGetUrl(
					"user_images/" + result[i].email
				);
			}

			res.send(result);
		})
		.catch((err) => {
			console.log(err);
			res.status(500).send("Database Fetch Error");
		});
});

app.get("/fetchMatches", (req, res) => {
	matcher
		.getMatches(req.query.email)
		.then((matches) => {
			DB.fetchUsers({ _id: { $in: matches } })
				.then(async (users) => {
					for (var i = 0; i < users.length; i++) {
						users[i].image = await AWS_Presigner.generateSignedGetUrl(
							"user_images/" + users[i].email
						);
					}

					res.status(200).send(users);
				})
				.catch((err) => {
					console.log(err);
					res.status(500).send("Database Fetch Error");
				});
		})
		.catch((err) => {
			console.log(err);
			res.status(500).send("Server Error");
		});
});

app.get("/fetchConnections", (req, res) => {
	DB.fetchUsers({ email: req.query.email })
		.then((result) => {
			
			if (result.length === 0) {
				console.log(`No user with email ${req.body.email}`);
				res.status(404).send(
					"404: User with email " +
						req.body.email +
						" couldn't be found"
				);
				return;
			}

			const user = result[0];
			let ids = [];
			user.blueConnections.forEach(element => {
				ids.push(element._id);
			});
			DB.fetchUsers({ _id: { $in: ids } })
				.then(async (connections) => {
					for (let i = 0; i < connections.length; i++) {
						const element = connections[i];

						delete element.password;
						delete element.chats;
						delete element.blueConnections;
						delete element.greenConnections;

						element.image = await AWS_Presigner.generateSignedGetUrl(
							"user_images/" + element.email
						);
					}

					res.status(200).send(JSON.stringify(connections));
				})
				.catch((err) => {
					console.log(err);
					res.status(500).send("Server Error");
				});
		})
		.catch((err) => {
			console.log(err);
			res.status(500).send("Server Error");
		});
});

app.get("/fetchChatData", (req, res) => {
	const MSG_TO = req.query.to;
	DB.fetchUsers({ email: req.query.from })
		.then(async (users) => {
			const user = users[0];
			var chatFound = false;
			let chat = null;

			for (let i = 0; i < user.chats.length && !chatFound; i++) {
				try {
					chat = (await DB.fetchChat(user.chats[i]))[0].chat;

					if (chat.user1 === MSG_TO || chat.user2 === MSG_TO) {
						chatFound = true;
						res.status(200).send(JSON.stringify(chat));
					}
				} catch (err) {
					console.log("err fetching chats");
					console.log(err);
					res.status(500).send("Server Error");
				}
			}

			if (!chatFound) {
				res.status(404).send("chat data DNE");
			}
		})
		.catch((err) => {
			res.status(500).send("Server Error");
		});
});

app.get("/fetchNotifications", (req, res) => {
	DB.fetchUsers({ email: req.query.email })
		.then(async (users) => {
			const user = users[0];
			const userEventQueue = new EventQueue(user.eventQueue.events);

			res.status(200).send(userEventQueue.dequeueAll());
			
			DB.updateUser({ eventQueue: userEventQueue }, { email: req.query.email });
		})
		.catch((err) => {
			console.log(err);
			res.status(500).send("Database Fetch Error");
		});
})

app.post("/updateKeywords", (req, res) => {
	let keywords = req.body.keywords;
	for (let i = 0; i < keywords.length; i++) {
		keywords[i] = String(keywords[i]).toLowerCase();
	}

	DB.fetchUsers({ email: req.body.email }).then((users) => {
		const oldKeywords = users[0].keywords;

		DB.updateUser({ keywords }, { email: req.body.email })
			.then((updateRes) => {
				matcher.updateGraph(req.body.email, oldKeywords).then((value) => {
					value ? res.status(201).send("success") : res.status(500).send("Server Error");
				}).catch((err) => {
					console.log(err);
					res.status(500).send("Server Error");
				})
			})
			.catch((err) => {
				console.log(err);
				res.status(500).send("Database Update Error");
			});
	}).catch((err) => {
		console.log(err);
		res.status(500).send("Database Fetch Error");
	})
});

app.post("/updateUserInfo", (req, res) => {
	const user = req.body.user;

	DB.fetchUsers({ email: user.email }).then((users) => {

		if (user.password !== undefined) {
			if (!validatePassword(user.password) && bcrypt.compareSync(user.oldPassword, users[0].password)) {
				res.status(406).send("invalid password");
				return;
			}
	
			user.password = bcrypt.hashSync(user.password, 10);
		}
	
		DB.fetchUsers({ email: user.email })
			.then(async (users) => {
				let user = users[0];
				await DB.updateUser(user, {email: user.email});
				res.status(201).send("success")	
			})
			.catch((err) => {
				console.log(err);
				res.status(500).send("Server error");
			});
	}).catch((err) => {
		console.log(err);
		res.status(500).send('Database Fetch Error');
	})
	
});

app.post("/new-user", (req, res) => {
	const requestData = {
		name: req.body.name,
		email: req.body.email,
		password: bcrypt.hashSync(req.body.password, 10),
		gender: req.body.gender,
		uni: req.body.uni,
		major: req.body.major,
		age: Number(req.body.age),
		chats: [],
		keywords: [],
		bio: "",
		blueConnections: [],
		greenConnections: [],
	};

	DB.insertUser(requestData)
		.then(async (result) => {
			// sendEmail(requestData);
			matcher.generateGraph(requestData.email);

			res.status(201).send(
				JSON.stringify({
					signedPutUrl: await AWS_Presigner.generateSignedPutUrl("user_images/" + requestData.email),
				})
			);
		})
		.catch((err) => {
			// unsuccessful insert, reply back with unsuccess response code
			console.log(err);
			res.status(500).send("Insert Failed");
		});
});

app.post("/login", (req, res) => {
	const requestData = {
		email: req.body.email,
		password: req.body.password,
	};

	DB.fetchUsers({ email: requestData.email })
		.then((users) => {
			if (users.length < 1) {
				res.status(401).send("Invalid Email");
				return;
			}

			let user = users[0];
			if (bcrypt.compareSync(requestData.password, user.password)) {
				// Passwords match
				res.status(200).send(JSON.stringify(user));
			} else {
				// Passwords don't match
				res.status(401).send("Invalid password");
			}
		})
		.catch((err) => {
			console.log(err);
			res.status(500).send("Server error");
		});
});

app.post("/update", (req, res) => {
	const isMaster = req.body.ref === "refs/heads/master";
	if (isMaster) {
		isServerOutdated = true;
	}

	res.status(200);
	res.end();
});

function resetGraph() {
	DB.fetchUsers({}).then(async (users) => {

		for (let i = 0; i < users.length; i++) {
			const user = users[i];
			user.blueConnections = [];
			user.greenConnections = [];
	
			await DB.updateUser(user, {email:user.email});
		}

		for (let i = 0; i < users.length; i++) {
			const result = await matcher.generateGraph(users[i].email);
		    console.log(`Graph generation for ${users[i].name} ${result ? "successful" : "failed"}`);
		}
	});
}

//resetGraph();

function addDummyUser() {
	const requestData = {
		name: "Sheldon Cooper",
		email: "sheldon.cooper@caltech.edu",
		password: bcrypt.hashSync("Cooper73", 10),
		gender: "M",
		uni: "California Institute of Technology",
		major: "Physics",
		age: 40,
		chats: [],
		keywords: ["CSC209", "MAT224", "PHY136"],
		bio:
			"One cries because one is sad. I cry because others are stupid and that makes me sad",
		blueConnections: [],
		greenConnections: [],
	};

	DB.insertUser(requestData)
		.then(async (result) => {
			// sendEmail(requestData);
			matcher.generateGraph(requestData.email).then((res) => {
				console.log(`${requestData.name} ${res ? "added" : "failed"}`);
			});
		})
		.catch((err) => {
			// unsuccessful insert, reply back with unsuccess response code
			console.log(err);
		});
}
// addDummyUser();

/* Socket Listeners for chat */

io.on("connection", (socket) => {
	socket
		.join(socket.handshake.query.name)
		.to(socket.handshake.query.name)
		.emit("joined chat room" + socket.rooms);
	console.log(`${socket.handshake.query.name} Connected`);

	socket.on("new msg", (msg) => {
		DB.fetchUsers({ email: msg.from })
			.then(async (users) => {
				const user = users[0];
				let chat = null;
				var msgHandled = false;
				const receiverIsReachable = io.sockets.adapter.rooms[msg.to] && io.sockets.adapter.rooms[msg.to].length > 0;

				for (let i = 0; i < user.chats.length && !msgHandled; i++) {
					try {
						chat = (await DB.fetchChat(user.chats[i]))[0].chat;
						
						if (chat.user1 === msg.to || chat.user2 === msg.to) {
							chat = Chat.parseJSON(chat);

							chat.newMessage(msg.from, msg.content, msg.time);
							msgHandled = true;

							try {
								await DB.updateChat(chat, {
									_id: user.chats[i],
								});

								if (receiverIsReachable) {
									socket.to(msg.to).emit("new msg", msg);
								} else {
									// store message event in eventQueue to notify user later
									DB.fetchUsers({ email: msg.to }).then((receiver) => {
										receiver = receiver[0];
										receiver.eventQueue = new EventQueue(receiver.eventQueue.events);
										receiver.eventQueue.enqueue(new Event(MESSAGE_EVENT, {
											from: msg.from,
											content: msg.content,
											time: msg.time
										}));

										DB.updateUser({ eventQueue: receiver.eventQueue }, { email: msg.to });

									}).catch((reason) => {
										console.log(reason);
									})
								}
							} catch (err_nested) {
								console.log(err_nested);
								socket.emit("send failed");
							}
						}
					} catch (err) {
						console.log(err);
						socket.emit("server error");
						msgHandled = true;
					}
				}

				// no existing chat b/w users, so create a new one
				if (!msgHandled) {
					const chat = new Chat(msg.from, msg.to);
					chat.newMessage(msg.from, msg.content, msg.time);

					DB.insertChat({ chat })
						.then((result) => {

							user.chats.push(result.ops[0]._id);
							DB.updateUser({ chats: user.chats }, { email: user.email })
								.then((value) => {
									// socket.to(msg.to).emit("new msg", msg);
								})
								.catch((reason) => {
									socket.emit("send failed");
									DB.deleteChat(result.ops[0]._id);
									console.log(reason);
								});

							DB.fetchUsers({ email: msg.to })
								.then((res) => {
									let user = res[0];
									user.chats.push(result.ops[0]._id);

									DB.updateUser({ chats: user.chats }, { email: user.email })
										.then((value) => {
											if (receiverIsReachable) {
												socket.to(msg.to).emit("new msg", msg);
											} else {
												// store message event in eventQueue to notify user later
												DB.fetchUsers({ email: msg.to }).then((receiver) => {
													receiver = receiver[0];
													receiver.eventQueue = new EventQueue(receiver.eventQueue.events);
													receiver.eventQueue.enqueue(new Event(MESSAGE_EVENT, {
														from: msg.from,
														content: msg.content,
														time: msg.time
													}));
			
													DB.updateUser({ eventQueue: receiver.eventQueue }, { email: msg.to });
												}).catch((reason) => {
													console.log(reason);
												});
											}
										})
										.catch((reason) => {
											console.log(reason);
										});
								})
								.catch((err) => {
									console.log(err);
								});
						})
						.catch((err) => {
							socket.emit("send failed");
							console.log(err);
						});
				}
			})
			.catch((err) => {
				socket.emit("server error");
			});
	});
});

http.listen(3000, () => {
	console.log("Server is running");
});
