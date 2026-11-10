import { useState, useEffect, useRef } from "react";
import Grid from "../components/Grid.js";

let socket;
const io = require("socket.io-client");

function Game(props) {
  const [gameFound, setGameFound] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [gameCode, setGameCode] = useState(null);
  const [selected, setSelected] = useState({});
  const [result, setResult] = useState([]);

  let mouseRef = useRef({});
  let gridRef = useRef(null);
  let [mouseDots, setMouseDots] = useState([]);
  let [playersList, setPlayersList] = useState([]);

  let [playerAmount, setPlayerAmount] = useState(null);
  let [wagerAmount, setWagerAmount] = useState(null);
  let [multiplier, setMultiplier] = useState(1);

  function finishGame(number) {
    if (selected[number].username === props.username) {
      props.setWinningAmount(wagerAmount * multiplier);
      props.handleClick("end_won");
    } else {
      props.handleClick("end_lost");
    }
  }

  function setupMultiplier(playerAmount) {
    if (playerAmount === 2) setMultiplier(1.9);
    if (playerAmount === 3) setMultiplier(2.7);
    if (playerAmount === 5) setMultiplier(4.25);
  }

  function playGame() {
    socket.emit("find-match", { public: props.filter.public, playerAmount: props.filter.playerAmount, wagerAmount: props.filter.wagerAmount, gameCode: props.filter.gameCode });

    socket.on("insufficient-funds", () => {
      alert("Insufficient funds");
      props.mainMenu("home");
    });

    socket.on("incorrect-gamecode", () => {
      alert("Game does not exist");
      props.handleClick("private_match");
    });

    setPlayerAmount(props.filter.playerAmount);
    setWagerAmount(props.filter.wagerAmount);
    setupMultiplier(props.filter.playerAmount);
    setGameCode(props.filter.gameCode);

    socket.on("awaiting-players", () => {
      setGameFound(false);
    });

    socket.on("game-code", (data) => {
      setGameCode(data.gameCode);
    });

    socket.on("game-settings", (data) => {
      setPlayerAmount(data.playerAmount);
      setWagerAmount(data.wagerAmount);
      setupMultiplier(data.playerAmount);
      socket.emit("response-settings", { acceptSettings: true });
    });

    socket.on("start-game", (game) => {
      Object.keys(game.players).forEach((username, index) => {
        if (username !== props.username) mouseDots.push(<div ref={(dot) => (mouseRef.current[username] = dot)} key={index} style={{ backgroundColor: game.players[username].color }} className="mouse_dot"></div>);
        playersList.push(
          <div key={index} className="player_name">
            <span className="player_color_square" style={{ color: game.players[username].color }}>
              &#9632;
            </span>
            <span>{username + (username !== props.username ? "" : " (you)")}</span>
          </div>
        );
      });
      setMouseDots(mouseDots);
      setPlayersList(playersList);

      setGameFound(true);

      socket.on("countdown", (countdown) => {
        setTimeLeft(countdown.timeLeft);
      });

      socket.on("square-status", (data) => {
        setSelected(data.picks);
      });

      socket.on("mouse-position", (data) => {
        if (data.username !== props.username) {
          if (data.position.x != null && data.position.y != null) {
            mouseRef.current[data.username].style.left = data.position.x * 100 + "%";
            mouseRef.current[data.username].style.top = data.position.y * 100 + "%";
            mouseRef.current[data.username].style.opacity = 1;
          } else {
            mouseRef.current[data.username].style.opacity = 0;
          }
        }
      });

      socket.on("selection-period-expired", (numbers) => {
        removeMouse();
        setResult(numbers);
      });
    });
  }

  function pickSquare(n) {
    if (!(n in selected)) {
      socket.emit("select-square", { squareNumber: n });
    } else if (selected[n].username === props.username) {
      socket.emit("unselect-square", { squareNumber: n });
    }
  }

  useEffect(() => {
    socket = io("/", {
      path: window.location.pathname + "socket.io/",
    });

    socket.on("connect", playGame);

    socket.on("already-ingame", () => {
      alert("Already in a seperate game");
      props.mainMenu("home");
    });

    return () => {
      if (socket?.connected) socket?.disconnect();
    };
  }, [props.filter.gameCode]);

  let prevMouseX, prevMouseY;
  function updateMouse(event) {
    if (window.matchMedia("(pointer: coarse)").matches) removeMouse(); // If mobile device, send null

    if ((prevMouseX !== event.clientX || prevMouseY !== event.clientY) && result.length === 0) {
      prevMouseX = event.clientX;
      prevMouseY = event.clientY;

      socket.emit("mouse-position", { x: (event.clientX - gridRef.current.offsetLeft) / gridRef.current.offsetWidth, y: (event.clientY - gridRef.current.offsetTop) / gridRef.current.offsetHeight });
    }
  }

  function removeMouse() {
    socket.emit("mouse-position", { x: null, y: null });
  }

  if (gameFound) {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <h3>{"Time left: " + timeLeft + "s"}</h3>
            <div ref={gridRef}>
              <Grid result={result} playerAmount={playerAmount} wagerAmount={wagerAmount} pickSquare={pickSquare} picks={selected} finishGame={finishGame} updateMouse={updateMouse} removeMouse={removeMouse} mouseDots={mouseDots} />
            </div>
            <div id="info_menu">
              <div id="info_submenu">
                <h4>
                  {"Wager amount: " +
                    wagerAmount.toLocaleString("en-CA", {
                      style: "currency",
                      currency: "CAD",
                    })}
                </h4>
                <h4>
                  {"Winner's prize: " +
                    (wagerAmount * multiplier).toLocaleString("en-CA", {
                      style: "currency",
                      currency: "CAD",
                    })}
                </h4>
              </div>
              <div id="player_list">{playersList}</div>
            </div>
          </div>
        </div>
      </>
    );
  } else if (gameFound === null) {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <img id="logo" src="logo.webp" />
            <br />
            <hr style={{ width: "100%" }} />
            <br />
            <h4>Creating room...</h4>
          </div>
          <button className="back" onClick={() => props.handleClick("home")}>
            Main Menu
          </button>
        </div>
      </>
    );
  } else if (props.filter.public) {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <img id="logo" src="logo.webp" />
            <br />
            <hr style={{ width: "100%" }} />
            <br />
            <h4>Finding players...</h4>
          </div>
          <button className="back" onClick={() => props.handleClick("home")}>
            Main Menu
          </button>
        </div>
      </>
    );
  } else if (!props.filter.public) {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <img id="logo" src="logo.webp" />
            <br />
            <h4 style={{ marginBlock: "20px" }}>Your Game ID is:</h4>
            <h2>{gameCode}</h2>
            <br />
            <hr style={{ width: "100%" }} />
            <br />
            <h4>Waiting for players...</h4>
          </div>
          <button className="back" onClick={() => props.handleClick("home")}>
            Main Menu
          </button>
        </div>
      </>
    );
  }
}

export default Game;
