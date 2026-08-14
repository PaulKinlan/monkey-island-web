// Monkey Island Web — game engine.
// Data-driven: every hotspot carries explicit per-verb behaviour.
//   hotspot = {
//     id, label, kind: 'link' | 'character' | 'item' | 'object', url?,
//     look: "text shown for Look at",
//     talk: [ { ifFlag?, notFlag?, ifHas?, notHas?, lines: [...], give?, setFlag? } ],
//     use:  { say }                                  // simple use
//         | { take: true, say }                      // portable item -> inventory
//         | { needs: 'item-id', fail: "text",        // requires held inventory item
//             success: { say, reveal?: hotspot, setFlag?, win?: true, consume?: true } }
//   }
// Dialogue entries are evaluated IN ORDER; put terminal states first so an
// end-state can never be masked by an earlier unfinished-quest condition.

export class Engine {
  constructor(uiCallbacks) {
    this.verbs = ["Look at", "Go to", "Talk to", "Use"];
    this.currentVerb = "Go to";
    this.currentScene = null;
    this.history = [];
    this.inventory = [];      // [{ id, label, look }]
    this.held = null;         // inventory id currently held for "Use X on Y"
    this.flags = {};
    this.won = false;
    this.ui = uiCallbacks;    // { onHistoryUpdate, onSceneUpdate, onVerbUpdate, onInventoryUpdate, onNavigate, onWin, onStateChange }
  }

  // Restore a saved game (quest flags, inventory, log, win state).
  restore(save) {
    this.flags = { ...(save.flags ?? {}) };
    this.inventory = structuredClone(save.inventory ?? []);
    this.history = [...(save.history ?? [])];
    this.won = !!save.won;
    this.held = null;
    if (this.history.length) this.ui.onHistoryUpdate(this.history);
    this.ui.onInventoryUpdate(this.inventory, this.held);
    if (this.won) this.ui.onWin?.();
  }

  serialize(sceneUrl) {
    return {
      flags: this.flags,
      inventory: this.inventory,
      history: this.history,
      won: this.won,
      sceneUrl,
    };
  }

  setVerb(verb) {
    if (this.verbs.includes(verb)) {
      this.currentVerb = verb;
      if (verb !== "Use") this.held = null;
      this.ui.onVerbUpdate(this.currentVerb, this.held);
      this.ui.onInventoryUpdate(this.inventory, this.held);
    }
  }

  loadScene(scene) {
    // deep-copy so dynamic reveals never mutate the shared fixture
    this.currentScene = structuredClone(scene);
    // Re-apply deterministic reveals earned in earlier sessions/visits:
    // any hotspot whose use-success both sets a flag and reveals a hotspot
    // re-reveals it when that flag is already set (reload/navigation safety).
    for (const hs of this.currentScene.hotspots) {
      const succ = hs.use?.success;
      if (succ?.reveal && succ.setFlag && this.flags[succ.setFlag]) {
        if (!this.currentScene.hotspots.some((h) => h.id === succ.reveal.id)) {
          this.currentScene.hotspots.push(structuredClone(succ.reveal));
        }
      }
    }
    this.addHistory(`[Arrived at: ${scene.title}]`);
    for (const line of scene.narration ?? []) this.addHistory(line);
    this.ui.onSceneUpdate(this.currentScene);
    this.ui.onVerbUpdate(this.currentVerb, this.held);
    if (scene.onArrive?.win) this.win();
  }

  hold(itemId) {
    if (this.held === itemId) {
      this.held = null; // toggle off
    } else if (this.inventory.some((i) => i.id === itemId)) {
      this.held = itemId;
      this.currentVerb = "Use";
    }
    this.ui.onVerbUpdate(this.currentVerb, this.held);
    this.ui.onInventoryUpdate(this.inventory, this.held);
  }

  heldItem() {
    return this.inventory.find((i) => i.id === this.held) ?? null;
  }

  hasItem(id) {
    return this.inventory.some((i) => i.id === id);
  }

  giveItem(item) {
    // Idempotent: the same item is never granted twice, even across reloads.
    if (!this.hasItem(item.id)) {
      this.inventory.push(item);
      this.addHistory(`(Picked up: ${item.label})`);
      this.ui.onInventoryUpdate(this.inventory, this.held);
    }
  }

  interact(hotspot) {
    const verb = this.currentVerb;
    this.addHistory(`> ${verb} ${hotspot.label}`);

    switch (verb) {
      case "Look at":
        this.addHistory(hotspot.look ?? hotspot.description ?? `It's a perfectly ordinary ${hotspot.label}.`);
        break;

      case "Go to":
        if (hotspot.kind === "link" && hotspot.url) {
          this.addHistory(`You make your way to ${hotspot.label}...`);
          this.ui.onNavigate(hotspot.url);
          return; // navigation keeps the verb; scene load resets state
        }
        this.addHistory(
          hotspot.kind === "character"
            ? `${hotspot.label} is right here. Walking into them would be rude.`
            : `You can't walk to the ${hotspot.label}; it's part of this page.`,
        );
        break;

      case "Talk to":
        this.runDialogue(hotspot);
        break;

      case "Use":
        this.runUse(hotspot);
        break;
    }
    this.setVerb("Go to");
  }

  runDialogue(hotspot) {
    if (hotspot.kind !== "character" || !Array.isArray(hotspot.talk)) {
      this.addHistory(`You address the ${hotspot.label}. It says nothing, but somehow you feel judged.`);
      return;
    }
    const entry = hotspot.talk.find((e) =>
      (!e.ifFlag || this.flags[e.ifFlag]) &&
      (!e.notFlag || !this.flags[e.notFlag]) &&
      (!e.ifHas || this.hasItem(e.ifHas)) &&
      (!e.notHas || !this.hasItem(e.notHas)),
    );
    if (!entry) {
      this.addHistory(`${hotspot.label} has nothing more to say.`);
      return;
    }
    for (const line of entry.lines) this.addHistory(`${hotspot.label}: “${line}”`);
    if (entry.setFlag) this.flags[entry.setFlag] = true;
    if (entry.give) this.giveItem(entry.give);
    // Atomic save: every emission above fired before these mutations applied;
    // this final onStateChange persists the complete post-dialogue state.
    this.ui.onStateChange?.();
  }

  runUse(hotspot) {
    const use = hotspot.use;
    const held = this.heldItem();

    if (!use) {
      this.addHistory(`Using the ${hotspot.label} doesn't occur to you as something that would work.`);
      return;
    }

    // Held item applied to a target that accepts it.
    if (held && use.needs) {
      if (use.needs === held.id) {
        this.addHistory(use.success.say);
        if (use.success.setFlag) this.flags[use.success.setFlag] = true;
        if (use.success.consume) {
          this.inventory = this.inventory.filter((i) => i.id !== held.id);
          this.held = null;
        }
        if (use.success.reveal) {
          if (!this.currentScene.hotspots.some((h) => h.id === use.success.reveal.id)) {
            this.currentScene.hotspots.push(structuredClone(use.success.reveal));
          }
          this.ui.onSceneUpdate(this.currentScene);
        }
        this.ui.onInventoryUpdate(this.inventory, this.held);
        if (use.success.win) this.win();
        // Atomic save after the full success effect (flag/consume/reveal).
        this.ui.onStateChange?.();
      } else {
        this.addHistory(use.fail ?? `The ${held.label} does nothing for the ${hotspot.label}.`);
      }
      return;
    }

    // Held item applied to something with no matching socket.
    if (held) {
      this.addHistory(`You wave the ${held.label} at the ${hotspot.label}. Nothing happens.`);
      return;
    }

    // Target requires an item the player isn't holding.
    if (use.needs) {
      this.addHistory(use.fail ?? `The ${hotspot.label} needs something you don't have.`);
      return;
    }

    // Portable item: pick it up.
    if (use.take) {
      this.addHistory(use.say);
      this.giveItem({ id: hotspot.id, label: hotspot.label, look: hotspot.look });
      this.ui.onStateChange?.();
      return;
    }

    this.addHistory(use.say);
  }

  win() {
    if (this.won) return; // terminal state is idempotent
    this.won = true;
    this.addHistory("★ THE END — you shipped the essay. ★");
    this.ui.onWin?.();
  }

  addHistory(text) {
    if (!text) return;
    this.history.push(text);
    this.ui.onHistoryUpdate(this.history);
    this.ui.onStateChange?.();
  }
}
