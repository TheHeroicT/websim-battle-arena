import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Character = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "cbs_characters_v1";

const newId = () =>
  `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const LoadingDots = ({ label }: { label: string }) => (
  <span>
    {label}
    <span className="cbs-loading-dot">.</span>
    <span className="cbs-loading-dot">.</span>
    <span className="cbs-loading-dot">.</span>
  </span>
);

const Index = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [battleContext, setBattleContext] = useState("");
  const [story, setStory] = useState("");
  const [winnerName, setWinnerName] = useState("");
  const [explanation, setExplanation] = useState("");
  const [isBattleRunning, setIsBattleRunning] = useState(false);
  const [isExplanationRunning, setIsExplanationRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCharacters(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
  }, [characters]);

  const sorted = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
    [characters]
  );

  const resetForm = () => {
    setEditingId("");
    setName("");
    setDescription("");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const d = description.trim();
    if (!n || !d) return;
    if (editingId) {
      setCharacters((cs) =>
        cs.map((c) =>
          c.id === editingId
            ? { ...c, name: n, description: d, updatedAt: Date.now() }
            : c
        )
      );
    } else {
      setCharacters((cs) => [
        ...cs,
        {
          id: newId(),
          name: n,
          description: d,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    }
    resetForm();
  };

  const startEdit = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setName(c.name);
    setDescription(c.description);
  };

  const deleteCharacter = (id: string) => {
    setCharacters((cs) => cs.filter((c) => c.id !== id));
    setSelectedIds((s) => s.filter((x) => x !== id));
    if (editingId === id) resetForm();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id);
      if (sel.length >= 2) return sel;
      return [...sel, id];
    });
  };

  const selectionStatus = (() => {
    if (selectedIds.length === 0) return "Select 2 characters to battle.";
    if (selectedIds.length === 1) return "Select 1 more character.";
    const a = characters.find((c) => c.id === selectedIds[0]);
    const b = characters.find((c) => c.id === selectedIds[1]);
    return `${a?.name ?? "Unknown"} vs ${b?.name ?? "Unknown"}`;
  })();

  const handleExport = () => {
    try {
      const data = JSON.stringify(characters, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `characters-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const raw = JSON.parse(text);
        if (!Array.isArray(raw)) throw new Error("not array");
        const normalized: Character[] = [];
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const n = (item.name || "").toString().trim();
          const d = (item.description || "").toString().trim();
          if (!n || !d) continue;
          normalized.push({
            id:
              typeof item.id === "string" && item.id.trim()
                ? item.id.trim()
                : newId(),
            name: n,
            description: d,
            createdAt:
              typeof item.createdAt === "number" ? item.createdAt : Date.now(),
            updatedAt:
              typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
          });
        }
        if (!normalized.length) {
          toast.error("No valid characters found in file.");
          return;
        }
        setCharacters(normalized);
        setSelectedIds([]);
      } catch (err) {
        console.error(err);
        toast.error("Import failed: invalid JSON.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("Could not read file.");
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const runBattle = async () => {
    if (selectedIds.length !== 2 || isBattleRunning) return;
    const a = characters.find((c) => c.id === selectedIds[0]);
    const b = characters.find((c) => c.id === selectedIds[1]);
    if (!a || !b) return;

    setIsBattleRunning(true);
    setStory("");
    setWinnerName("");
    setExplanation("");

    try {
      const { data, error } = await supabase.functions.invoke("battle", {
        body: {
          mode: "battle",
          a: { name: a.name, description: a.description },
          b: { name: b.name, description: b.description },
          extraContext: battleContext.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text: string = data?.content || "";
      const m = text.match(/WINNER:(.+)$/m);
      let storyText = text;
      let winner = "";
      if (m) {
        winner = m[1].trim();
        storyText = text.replace(/WINNER:.+$/m, "").trim();
      }
      setStory(storyText || "No battle description produced.");
      setWinnerName(winner);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      toast.error(msg);
      setStory("There was an error running the battle simulation. Please try again.");
      setWinnerName("");
    } finally {
      setIsBattleRunning(false);
    }
  };

  const runExplanation = async () => {
    if (!story || isExplanationRunning) return;
    const a = characters.find((c) => c.id === selectedIds[0]);
    const b = characters.find((c) => c.id === selectedIds[1]);
    if (!a || !b) return;
    setIsExplanationRunning(true);
    setExplanation("");
    try {
      const { data, error } = await supabase.functions.invoke("battle", {
        body: {
          mode: "explain",
          a: { name: a.name, description: a.description },
          b: { name: b.name, description: b.description },
          story,
          winnerName,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text: string = data?.content || "";
      setExplanation(text.trim() || "No explanation was produced.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      toast.error(msg);
      setExplanation("There was an error generating the explanation. Please try again.");
    } finally {
      setIsExplanationRunning(false);
    }
  };

  const battleDisabled = selectedIds.length !== 2 || isBattleRunning;
  const explainDisabled = !story || isExplanationRunning || isBattleRunning;

  return (
    <main className="min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[780px] p-2.5 flex flex-col gap-2.5 min-h-screen">
        <h1 className="sr-only">Character Battle Simulator</h1>

        {/* Add / Edit */}
        <section className="cbs-card">
          <header className="cbs-card-header">
            <span>{editingId ? "Edit Character" : "Add Character"}</span>
          </header>
          <form
            onSubmit={handleSave}
            className="p-2.5 px-3.5 pb-3 flex flex-col gap-2"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="cbs-name" className="cbs-label">
                Name
              </label>
              <input
                id="cbs-name"
                type="text"
                maxLength={60}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="cbs-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cbs-desc" className="cbs-label">
                Description &amp; Abilities
              </label>
              <textarea
                id="cbs-desc"
                rows={5}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="cbs-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-1.5 mt-0.5">
              <button type="submit" className="cbs-btn cbs-btn-primary">
                {editingId ? "Update" : "Save"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="cbs-btn cbs-btn-secondary"
                style={{ visibility: editingId ? "visible" : "hidden" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>

        {/* Character list */}
        <section className="cbs-card flex-1 min-h-0">
          <header className="cbs-card-header">
            <span>Characters</span>
            <div className="flex items-center gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="cbs-btn cbs-btn-secondary cbs-btn-icon"
                title="Import characters from JSON"
              >
                Import
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="cbs-btn cbs-btn-secondary cbs-btn-icon"
                title="Export characters to JSON"
              >
                Export
              </button>
            </div>
          </header>
          <div className="p-2.5 px-3.5 pb-3 flex flex-col gap-1.5 overflow-y-auto cbs-scroll max-h-full pr-2">
            {sorted.length === 0 && (
              <div className="text-base text-muted-foreground">
                No characters yet. Add one to begin.
              </div>
            )}
            {sorted.map((c) => {
              const isSel = selectedIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, input")) return;
                    toggleSelection(c.id);
                  }}
                  className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 border transition-colors cursor-pointer"
                  style={{
                    background: isSel
                      ? "radial-gradient(circle at left, hsl(28 40% 11%) 0%, hsl(0 0% 6%) 55%)"
                      : "hsl(0 0% 6%)",
                    borderColor: isSel
                      ? "hsl(var(--primary-strong))"
                      : "hsl(0 0% 14%)",
                  }}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelection(c.id)}
                      className="w-[18px] h-[18px] cursor-pointer"
                      style={{ accentColor: "hsl(var(--primary))" }}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="text-[18px] font-medium truncate">
                      {c.name}
                    </div>
                    <div className="text-base text-muted-foreground">
                      Tap to edit or select for battle.
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="cbs-btn cbs-btn-secondary cbs-btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(c.id);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="cbs-btn cbs-btn-secondary cbs-btn-icon"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCharacter(c.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Battle */}
        <section className="cbs-card flex-1 min-h-0">
          <header className="cbs-card-header">
            <span>Battle</span>
          </header>
          <div className="p-2.5 px-3.5 pb-3 flex flex-col gap-2 h-full">
            <div className="flex flex-col gap-1">
              <label htmlFor="cbs-context" className="cbs-label">
                Additional Context / Instructions
              </label>
              <textarea
                id="cbs-context"
                rows={3}
                value={battleContext}
                onChange={(e) => setBattleContext(e.target.value)}
                placeholder="Optional: add mood, themes, twists, or specific details you want the AI to consider for this battle."
                className="cbs-input resize-none"
              />
              <div className="text-[15px] text-muted-foreground">
                This will be blended into the story if provided.
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[17px] text-muted-foreground">
                {selectionStatus}
              </span>
              <button
                onClick={runBattle}
                disabled={battleDisabled}
                className="cbs-btn cbs-btn-accent"
              >
                {isBattleRunning ? "Simulating..." : "Battle!"}
              </button>
            </div>

            <div
              className={`flex-1 rounded-[10px] border px-3 py-2.5 text-[20px] leading-[1.5] overflow-y-auto whitespace-pre-wrap cbs-scroll ${
                !story && !isBattleRunning
                  ? "flex items-center justify-center text-muted-foreground text-[17px]"
                  : ""
              }`}
              style={{
                background: "hsl(0 0% 4.5%)",
                borderColor: "hsl(0 0% 14%)",
                minHeight: 120,
              }}
            >
              {isBattleRunning ? (
                <LoadingDots label="Running battle simulation" />
              ) : story ? (
                story
              ) : (
                "Battle results will appear here."
              )}
            </div>

            <div
              className="min-h-[18px] text-[19px] font-semibold"
              style={{ color: "hsl(var(--winner))" }}
            >
              {winnerName ? `WINNER: ${winnerName}` : ""}
            </div>

            <div className="mt-1.5 pt-1.5 border-t border-border flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  className="cbs-btn cbs-btn-accent"
                  style={{ paddingInline: 12, fontSize: 17, minHeight: 28 }}
                  disabled={explainDisabled}
                  onClick={runExplanation}
                >
                  Explanation
                </button>
                <span className="text-base text-muted-foreground">
                  AI reasoning about the battle and winner.
                </span>
              </div>
              <div
                className={`rounded-lg border px-2.5 py-2 text-[18px] leading-[1.5] max-h-[140px] overflow-y-auto whitespace-pre-wrap cbs-scroll ${
                  !explanation && !isExplanationRunning
                    ? "flex items-center justify-center text-muted-foreground text-base"
                    : ""
                }`}
                style={{
                  background: "hsl(0 0% 3.5%)",
                  borderColor: "hsl(0 0% 14%)",
                }}
              >
                {isExplanationRunning ? (
                  <LoadingDots label="Generating explanation" />
                ) : explanation ? (
                  explanation
                ) : (
                  "Explanation will appear here after a battle."
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Index;
