import User from "../components/User.js";

function Home(props) {
  return (
    <>
      <div id="navbar">
        <User handleClick={props.handleClick} />
      </div>

      <div className="centered_menu_nav">
        <img id="logo" src="logo.webp" />
        <div className="button_menu">
          <button onClick={() => props.handleClick("matchmaking-public")}>Start Game</button>
          <button onClick={() => props.handleClick("matchmaking-private")}>Private Game</button>
        </div>
      </div>
    </>
  );
}

export default Home;
