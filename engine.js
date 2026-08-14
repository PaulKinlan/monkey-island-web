export class Engine {
  constructor(uiCallbacks) {
    this.verbs = ["Look at", "Go to", "Talk to", "Use"];
    this.currentVerb = "Go to";
    this.currentScene = null;
    this.history = [];
    this.ui = uiCallbacks; // { onHistoryUpdate, onSceneUpdate, onVerbUpdate }
  }

  setVerb(verb) {
    if (this.verbs.includes(verb)) {
      this.currentVerb = verb;
      this.ui.onVerbUpdate(this.currentVerb);
    }
  }

  loadScene(scene) {
    this.currentScene = scene;
    this.addHistory(`[Arrived at: ${scene.title}]`);
    if (scene.narration && scene.narration.length > 0) {
      this.addHistory(scene.narration[0]); // Initial description
    }
    this.ui.onSceneUpdate(scene);
    this.ui.onVerbUpdate(this.currentVerb);
  }

  interact(hotspot) {
    const actionText = `${this.currentVerb} ${hotspot.label}`;
    this.addHistory(`> ${actionText}`);

    switch (this.currentVerb) {
      case "Look at":
        this.addHistory(hotspot.description || `It's just a ${hotspot.label}.`);
        break;
      case "Go to":
        if (hotspot.type === "link" && hotspot.url) {
          this.addHistory(`Walking to ${hotspot.label}...`);
          this.ui.onNavigate(hotspot.url);
        } else {
          this.addHistory("I can't go there.");
        }
        break;
      case "Use":
        this.addHistory("I can't use that right now.");
        break;
      case "Talk to":
        if (hotspot.type === "character") {
          this.addHistory(hotspot.description || "They don't have much to say.");
        } else {
          this.addHistory("It doesn't talk back.");
        }
        break;
      default:
        this.addHistory("I don't know how to do that.");
    }
    // reset verb to default
    this.setVerb("Go to");
  }

  addHistory(text) {
    if (text) {
      this.history.push(text);
      this.ui.onHistoryUpdate(this.history);
    }
  }
}
