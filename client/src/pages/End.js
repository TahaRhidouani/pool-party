function End(props) {
  if (props.winner) {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <img id="logo" src="logo.webp" />
            <br />
            <hr style={{ width: "100%" }} />
            <br />
            <h4>
              You won
              {" " +
                props.winningAmount.toLocaleString("en-CA", {
                  style: "currency",
                  currency: "CAD",
                })}
              !
            </h4>
          </div>
          <button className="back" onClick={() => props.handleClick("home")}>
            Main Menu
          </button>
        </div>
      </>
    );
  } else {
    return (
      <>
        <div className="centered_menu">
          <div id="setting_menu">
            <img id="logo" src="logo.webp" />
            <br />
            <hr style={{ width: "100%" }} />
            <br />
            <h4>You lost!</h4>
          </div>
          <button className="back" onClick={() => props.handleClick("home")}>
            Main Menu
          </button>
        </div>
      </>
    );
  }
}

export default End;
