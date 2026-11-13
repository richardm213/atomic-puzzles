import "./Openings.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { useEffect, useRef, useState } from "react";

import { validateOpeningDocument } from "../../../shared/domain/openings/repertoire";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { changeOpening, fetchOpening, fetchOpeningLibrary } from "../../lib/openings/api";
import { getBrowserStorageItem, setBrowserStorageItem } from "../../utils/browserStorage";
import { getErrorMessage } from "../../utils/errors";
import { OpeningEditor } from "./OpeningEditor";

export const OpeningsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const selected = search.opening ?? "";
  const username = (auth.user?.username ?? "").toLowerCase();
  const [creating, setCreating] = useState(false);
  const createDialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (creating) createDialog.current?.showModal();
    else createDialog.current?.close();
  }, [creating]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fen, setFen] = useState(INITIAL_FEN);
  const [side, setSide] = useState<"white" | "black">("white");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createId, setCreateId] = useState(() => crypto.randomUUID());
  const library = useQuery({
    queryKey: ["openings", username],
    queryFn: fetchOpeningLibrary,
    enabled: auth.isAuthenticated,
  });
  const copy = useQuery({
    queryKey: ["opening", username, selected],
    queryFn: () => fetchOpening(selected),
    enabled: auth.isAuthenticated && !!selected,
  });
  const lastOpeningKey = `atomic-puzzles.openings.last.${username}`;
  useEffect(() => {
    if (username && selected && copy.data?.id === selected)
      setBrowserStorageItem("local", lastOpeningKey, selected);
  }, [username, selected, copy.data?.id, lastOpeningKey]);
  useEffect(() => {
    if (!username || selected || creating || !library.data) return;
    const previous = getBrowserStorageItem("local", lastOpeningKey);
    if (previous && library.data.some((item) => item.id === previous))
      void navigate({ to: "/openings", search: { opening: previous }, replace: true });
  }, [username, selected, creating, library.data, lastOpeningKey, navigate]);
  const libraryPanel = (
    <div className="openingLibrary">
      <div className="openingLibraryActions">
        <button
          aria-label="New opening"
          title="New opening"
          className="openingAddButton"
          onClick={() => setCreating(true)}
        >
          +
        </button>
      </div>
      {library.isPending ? <p>Loading openings…</p> : null}
      {library.error ? (
        <p role="alert">{getErrorMessage(library.error, "Unable to load openings.")}</p>
      ) : null}
      <nav aria-label="Your repertoires">
        {library.data?.map((item) => (
          <Link
            key={item.id}
            to="/openings"
            search={{ opening: item.id }}
            aria-current={selected === item.id ? "page" : undefined}
          >
            {item.title}
            {item.update_available ? " · Update available" : ""}
          </Link>
        ))}
      </nav>
    </div>
  );
  return (
    <main className="page openingPage">
      <Seo
        title="Opening practice"
        description="Build and practice your atomic opening repertoire."
        path="/openings"
      />
      {!auth.isAuthenticated ? (
        <section className="panel">
          <button onClick={() => void auth.login("/openings")}>
            Log in to save and train openings
          </button>
        </section>
      ) : (
        <>
          {!copy.data ? (
            <section className="panel openingLibraryEmpty">{libraryPanel}</section>
          ) : null}
          <dialog ref={createDialog} className="openingConfirm" onCancel={() => setCreating(false)}>
            {creating ? (
              <form
                className="openingNewForm"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  void (async () => {
                    try {
                      const document = validateOpeningDocument({
                        startFen: fen,
                        side,
                        lines: [],
                      });
                      const created = await changeOpening({
                        action: "create",
                        id: createId,
                        title,
                        description,
                        document,
                      });
                      queryClient.setQueryData(["opening", username, created.id], created);
                      await queryClient.invalidateQueries({ queryKey: ["openings", username] });
                      setCreating(false);
                      setCreateId(crypto.randomUUID());
                      void navigate({ to: "/openings", search: { opening: created.id } });
                    } catch (e) {
                      setError(getErrorMessage(e, "Unable to create opening."));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <h2>New opening</h2>
                {error ? <p role="alert">{error}</p> : null}
                <label>
                  Name
                  <input
                    required
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label>
                  Starting FEN
                  <textarea required value={fen} onChange={(e) => setFen(e.target.value)} />
                </label>
                <label>
                  Train as
                  <select value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </label>
                <div className="openingActions">
                  <button disabled={busy}>{busy ? "Creating…" : "Create opening"}</button>
                  <button type="button" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </dialog>
          {!creating && (error || copy.error) ? (
            <p role="alert">{error || getErrorMessage(copy.error, "Unable to load opening.")}</p>
          ) : null}
          {selected && copy.isPending ? <p>Loading opening…</p> : null}
          {copy.data ? (
            <OpeningEditor key={copy.data.id} initial={copy.data} libraryPanel={libraryPanel} />
          ) : null}
        </>
      )}
    </main>
  );
};
