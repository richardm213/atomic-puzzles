import { useEffect, useRef, useState } from "react";

export const TopNav = ({ appPath }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const target = searchQuery.trim();
    if (!target) return;
    window.location.href = appPath(`/@/${encodeURIComponent(target)}`);
  };

  const closeSearchIfFocusOutside = () => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        setSearchOpen(false);
        return;
      }

      if (!activeElement.closest(".navSearch")) {
        setSearchOpen(false);
      }
    });
  };

  const closeSearchOnMouseLeave = () => {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header className="topNav">
      <a className="homeBrand" href={appPath("/")} aria-label="Go to home page">
        <img src={appPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
      </a>
      <div className="topNavCenter">
        <div className="navSearchSlot">
          <form
            className={`navSearch ${searchOpen ? "open" : ""}`}
            onSubmit={handleSearchSubmit}
            onMouseEnter={() => setSearchOpen(true)}
            onMouseLeave={closeSearchOnMouseLeave}
            onFocusCapture={() => setSearchOpen(true)}
            onBlurCapture={closeSearchIfFocusOutside}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              placeholder="Search player"
              aria-label="Search player username"
              onChange={(event) => setSearchQuery(event.target.value)}
              tabIndex={searchOpen ? 0 : -1}
            />
            <button
              className="navSearchIcon"
              type={searchOpen ? "submit" : "button"}
              aria-label="Search player"
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true);
                }
              }}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            </button>
            <button className="navSearchGo" type="submit" tabIndex={searchOpen ? 0 : -1}>
              Go
            </button>
          </form>
        </div>
        <nav className="topNavLinks" aria-label="Main navigation">
          <a href={appPath("/rankings")}>Rankings</a>
          <a href={appPath("/solve")}>Puzzles</a>
          <a href={appPath("/recent")}>Recent</a>
        </nav>
      </div>
    </header>
  );
};
