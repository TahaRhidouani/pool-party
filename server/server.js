const express = require("express");
const app = express();
const cors = require("cors");
const session = require("express-session");
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongo = require("mongodb");
const MongoDBStore = require("connect-mongodb-session")(session);
const bcrypt = require("bcrypt");
const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;

const mongoURL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/";
const matchInfo = { 2: { wagerAmount: [5, 10, 25, 50, 100], resultTeaseRange: [30, 34], selectionPeriod: 15000, houseCommission: 0.05, playerReturn: 1.9 }, 3: { wagerAmount: [5, 10, 25, 50, 100], resultTeaseRange: [30, 34], selectionPeriod: 20000, houseCommission: 0.1, playerReturn: 2.7 }, 5: { wagerAmount: [3, 5, 10, 25, 50], resultTeaseRange: [30, 34], selectionPeriod: 25000, houseCommission: 0.15, playerReturn: 4.25 } };
const colors = ["#d1361b", "#4169e1", "#32CD32", "#e8cc15", "#8a2be2"]; // Red, Blue, Green, Yellow, Purple

let matchmakingData = { 2: { 5: {}, 10: {}, 25: {}, 50: {}, 100: {} }, 3: { 5: {}, 10: {}, 25: {}, 50: {}, 100: {} }, 5: { 3: {}, 5: {}, 10: {}, 25: {}, 50: {} } };
let allGamesData = {};

let database;
let MongoClient = mongo.MongoClient;
let mongoStore = new MongoDBStore({
  uri: mongoURL,
  databaseName: "pool-party",
  collection: "users-sessions",
});

// The store has no touch(), which resave: false relies on to keep a used session from expiring
mongoStore.touch = function (id, session, callback) {
  const expires = session.cookie && session.cookie.expires ? new Date(session.cookie.expires) : new Date(Date.now() + this.options.expires);
  if (!this.db) return callback();
  this.db.collection(this.options.collection).updateOne(this._generateQuery(id), { $set: { [this.options.expiresKey]: expires } }, (error) => callback(error));
};

const sessionMiddleware = session({ secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"), resave: false, saveUninitialized: false, store: mongoStore, cookie: { secure: "auto", sameSite: "lax" } });

app.set("trust proxy", true);

app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.use(express.static(path.join(__dirname, "../client/build")));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => (database ? next() : res.status(503).send()));
app.use(sessionMiddleware);
app.use(express.json());

app.post("/login", async (req, res, next) => {
  if (await validCredentials(req.body.username, req.body.password)) {
    signIn(req, req.body.username, (err) => (err ? next(err) : res.status(200).send()));
  } else {
    res.status(401).send();
  }
});

app.post("/register", async (req, res, next) => {
  if (typeof req.body.username !== "string" || typeof req.body.email !== "string" || typeof req.body.password !== "string") {
    res.status(400).send();
  } else if (await userExists(req.body.username)) {
    res.status(400).send();
  } else if (await emailExists(req.body.email)) {
    res.status(401).send();
  } else {
    await database.collection("users").insertOne({ username: req.body.username, email: req.body.email, password: await bcrypt.hash(req.body.password, 10), credits: 2000 });
    signIn(req, req.body.username, (err) => (err ? next(err) : res.status(200).send()));
  }
});

app.post("/logout", (req, res, next) => {
  // End the session and drop its cookie, so the old session ID no longer works
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    res.status(200).send();
  });
});

app.get("/user", async (req, res) => res.status(200).send(await getInformation(req.session.username)));

// Get express session coookies
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Check if user is authenticated
io.use(async (socket, next) => {
  if (await getInformation(socket.request.session.username)) {
    next();
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  if (alreadyInGame(socket.request.session.username)) return socket.emit("already-ingame");

  // Every client event carries an object payload, drop anything else
  socket.use(([, data], next) => {
    if (data !== null && typeof data === "object") next();
  });

  socket.on("find-match", async (query) => {
    let gameCode;
    let foundGame = false;

    if (query.gameCode == null && !validMatchSettings(query)) return;

    if (query.public) {
      if ((await getInformation(socket.request.session.username)).credits < query.wagerAmount) return socket.emit("insufficient-funds");

      let matchQuery = matchmakingData[query.playerAmount][query.wagerAmount];

      // Go through every awaiting public games
      for (let gameID in matchQuery) {
        if (matchQuery[gameID].type !== "public") continue;

        matchQuery[gameID].playerList.push(socket.request.session.username);
        socket.join(gameID);
        gameCode = gameID;

        socket.emit("awaiting-players");

        if (matchQuery[gameID].playerList.length == query.playerAmount) playGame(gameID, query.playerAmount, query.wagerAmount);

        foundGame = true;
        break;
      }

      // If no public game found, create one
      if (!foundGame) {
        gameCode = generateGameCode();
        matchQuery[gameCode] = { type: "public", playerList: [socket.request.session.username] };
        socket.join(gameCode);
        socket.emit("awaiting-players");
      }
    } else {
      if (query?.gameCode != null) {
        // Look every game for matching game code
        for (let playerSetting in matchmakingData) {
          for (let wagerSetting in matchmakingData[playerSetting]) {
            for (let gameID in matchmakingData[playerSetting][wagerSetting]) {
              if (gameID === query?.gameCode) {
                foundGame = true;
                let matchQuery = matchmakingData[playerSetting][wagerSetting][gameID];

                if ((await getInformation(socket.request.session.username)).credits < query.wagerAmount) return socket.emit("insufficient-funds");

                socket.emit("game-settings", { playerAmount: parseInt(playerSetting), wagerAmount: parseInt(wagerSetting), gameCreator: matchQuery.playerList[0] });

                socket.on("response-settings", (data) => {
                  if (!data.acceptSettings) return;

                  matchQuery.playerList.push(socket.request.session.username);
                  socket.join(gameID);
                  gameCode = gameID;

                  socket.emit("awaiting-players");

                  if (matchQuery.playerList.length == matchQuery.playerAmount) playGame(gameID, matchQuery.playerAmount, matchQuery.wagerAmount);
                });
              }
            }
          }
        }

        if (!foundGame) socket.emit("incorrect-gamecode");
      } else {
        if ((await getInformation(socket.request.session.username)).credits < query.wagerAmount) return socket.emit("insufficient-funds");

        gameCode = generateGameCode();
        matchmakingData[query.playerAmount][query.wagerAmount][gameCode] = { type: "private", playerList: [socket.request.session.username], playerAmount: query.playerAmount, wagerAmount: query.wagerAmount };
        socket.join(gameCode);
        socket.emit("game-code", { gameCode: gameCode });
        socket.emit("awaiting-players");
      }
    }

    socket.on("select-square", (data) => {
      if (allGamesData[gameCode]?.selectionPeriod && allGamesData[gameCode]?.picks[data.squareNumber] === undefined && allGamesData[gameCode].players[socket.request.session.username].picksLeft > 0) {
        allGamesData[gameCode].picks[data.squareNumber] = { username: socket.request.session.username, color: allGamesData[gameCode].players[socket.request.session.username].color };
        allGamesData[gameCode].players[socket.request.session.username].picksLeft--;
        io.sockets.to(gameCode).emit("square-status", { picks: allGamesData[gameCode].picks });
      }
    });

    socket.on("unselect-square", (data) => {
      if (allGamesData[gameCode]?.selectionPeriod && allGamesData[gameCode].picks[data.squareNumber]?.username === socket.request.session.username) {
        delete allGamesData[gameCode].picks[data.squareNumber];
        allGamesData[gameCode].players[socket.request.session.username].picksLeft++;
        io.sockets.to(gameCode).emit("square-status", { picks: allGamesData[gameCode].picks });
      }
    });

    socket.on("mouse-position", (data) => {
      io.sockets.to(gameCode).emit("mouse-position", { username: socket.request.session.username, position: { x: data.x, y: data.y } });
    });
  });

  socket.on("disconnect", () => {
    for (let playerSetting in matchmakingData) {
      for (let wagerSetting in matchmakingData[playerSetting]) {
        for (let gameID in matchmakingData[playerSetting][wagerSetting]) {
          for (let player of matchmakingData[playerSetting][wagerSetting][gameID].playerList) {
            if (player === socket.request.session.username) {
              let playerList = matchmakingData[playerSetting][wagerSetting][gameID].playerList;
              playerList.splice(playerList.indexOf(player), 1);

              if (playerList.length === 0) delete matchmakingData[playerSetting][wagerSetting][gameID];
            }
          }
        }
      }
    }
  });
});

http.listen(PORT, () => {
  console.log("listening on port " + PORT);
});

MongoClient.connect(mongoURL, async function (err, client) {
  if (err) throw err;

  // Sessions from before held the password itself: delete them before serving requests
  const db = client.db("pool-party");
  const { deletedCount } = await db.collection("users-sessions").deleteMany({ "session.password": { $exists: true } });
  if (deletedCount) console.log(`Deleted ${deletedCount} sessions that held a password`);
  database = db;
});

async function playGame(roomID, playerNum, wagerAmt) {
  allGamesData[roomID] = { selectionPeriod: true, picks: {}, players: {} };

  let index = 0;
  matchmakingData[playerNum][wagerAmt][roomID].playerList.forEach((username) => {
    updateCredits(username, -wagerAmt);
    allGamesData[roomID].players[username] = { color: colors[index++], picksLeft: 5 };
  });
  delete matchmakingData[playerNum][wagerAmt][roomID];

  io.sockets.to(roomID).emit("start-game", { selectionTime: matchInfo[playerNum].selectionPeriod, players: allGamesData[roomID].players });

  let timeLeft = matchInfo[playerNum].selectionPeriod / 1000;
  let countdown = setInterval(() => {
    io.sockets.to(roomID).emit("countdown", { timeLeft: --timeLeft });

    if (timeLeft == 0) {
      clearInterval(countdown);
      let repeatAnimation = generateRandomNumber(matchInfo[playerNum].resultTeaseRange[0], matchInfo[playerNum].resultTeaseRange[1]);
      let revealTimeout = generateRandomNumber(500, 1500);
      let resultNumbers = [revealTimeout, generateRandomNumber(0, playerNum * 5 - 1)];

      for (let i = 1; i <= repeatAnimation; i++) resultNumbers.push((resultNumbers.at(-1) + 1) % (playerNum * 5));

      for (let i = 0; i < playerNum * 5; i++) {
        if (allGamesData[roomID].picks[i] === undefined) {
          for (let player in allGamesData[roomID].players) {
            if (allGamesData[roomID].players[player].picksLeft > 0) {
              allGamesData[roomID].players[player].picksLeft--;
              allGamesData[roomID].picks[i] = { username: player, color: allGamesData[roomID].players[player].color };
              break;
            }
          }
        }
      }

      io.sockets.to(roomID).emit("square-status", { picks: allGamesData[roomID].picks });

      io.sockets.to(roomID).emit("selection-period-expired", resultNumbers);
      allGamesData[roomID].selectionPeriod = false;

      updateCredits(allGamesData[roomID].picks[resultNumbers.at(-1)].username, wagerAmt * matchInfo[playerNum].playerReturn);

      delete allGamesData[roomID];
    }
  }, 1000);
}

function generateRandomNumber(min, max, previousValue = null) {
  let result = Math.floor(Math.random() * (max - min + 1)) + min; // Generate a random number between min & max (inclusive)

  while (result == previousValue) result = Math.floor(Math.random() * (max - min + 1)) + min; // If previousValue is provided, return a different value

  return result;
}

function alreadyInGame(username) {
  for (let playerSetting in matchmakingData) {
    for (let wagerSetting in matchmakingData[playerSetting]) {
      for (let gameID in matchmakingData[playerSetting][wagerSetting]) {
        for (let player of matchmakingData[playerSetting][wagerSetting][gameID].playerList) {
          if (player === username) return true;
        }
      }
    }
  }

  for (let gameID in allGamesData) {
    for (let player of Object.keys(allGamesData[gameID].players)) {
      if (player === username) return true;
    }
  }

  return false;
}

function updateCredits(username, amount) {
  database.collection("users").updateOne({ username: username }, { $inc: { credits: amount } });
}

async function userExists(username) {
  return (await database.collection("users").findOne({ username: username })) ? true : false;
}

async function emailExists(email) {
  return (await database.collection("users").findOne({ email: email })) ? true : false;
}

function validMatchSettings(query) {
  return Object.hasOwn(matchmakingData, query.playerAmount) && Object.hasOwn(matchmakingData[query.playerAmount], query.wagerAmount);
}

async function validCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string" || !database) return false;
  let pwd = await database.collection("users").findOne({ username: username });
  return pwd && (await bcrypt.compare(password, pwd.password));
}

// The signed-in user's details without the password hash, or false
async function getInformation(username) {
  if (typeof username !== "string" || !database) return false;
  return (await database.collection("users").findOne({ username: username }, { projection: { _id: 0, password: 0 } })) || false;
}

// Give the signed-in user a new session ID (against session fixation) that holds only the username
function signIn(req, username, callback) {
  req.session.regenerate((err) => {
    if (err) return callback(err);
    req.session.username = username;
    req.session.save(callback);
  });
}

function generateGameCode() {
  let code = nanoid();
  while (allGamesData.hasOwnProperty(code)) code = nanoid();
  return code;
}
