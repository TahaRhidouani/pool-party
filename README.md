# Pool Party

### Main features:

- Utilizes web sockets for low-latency real-time multiplayer
- Securely stores encrypted logins with MongoDB
- Features an efficient public matchmaking algorithm & private lobby option
- Displays smooth animations and responsive UI

<br />

**Real-time multiplayer using web sockets**

![TODO](./images/screenshot_1.gif?raw=true)

<br />

**Features a respondive & clean UI**

![home](./images/screenshot_2.png?raw=true)

<br />

**Secure login system with backend encryption**

![TODO](./images/screenshot_3.png?raw=true)

<br />

**Create a party and play private games with friends**

![TODO](./images/screenshot_4.png?raw=true)

<br />

**Pick different players and wager settings**

![TODO](./images/screenshot_5.png?raw=true)

<br />

**Play with up to 5 other players**

![TODO](./images/screenshot_6.png?raw=true)

<br />

## Run

Every push to `main` builds the image `ghcr.io/taharhidouani/pool-party` (tags `main` and `sha-<commit>`). The container listens on port 8080, answers `GET /healthz` and serves the React client and Socket.IO from the same origin, so it works under any path prefix.

| Variable | Purpose |
| --- | --- |
| `MONGO_URL` | MongoDB connection string; data and sessions go to the database `pool-party` |
| `SESSION_SECRET` | Random string that signs session cookies; without it sessions reset on every restart |
| `PORT` | Listen port, default 8080 |

```sh
docker run -p 8080:8080 -e MONGO_URL=mongodb://user:pass@mongo:27017/pool-party?authSource=pool-party -e SESSION_SECRET=change-me ghcr.io/taharhidouani/pool-party:main
```

All data lives in MongoDB. Locally: `npm install` and `npm run build` in `client/`, then `npm install` and `npm start` in `server/`.
