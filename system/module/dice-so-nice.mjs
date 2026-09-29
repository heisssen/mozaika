/** Optional Dice So Nice integration: a stained-glass mosaic d10 in the zine's colours. */
export function registerDiceSoNice() {
  Hooks.once("diceSoNiceReady", dice3d => {
    const id = "mozaika";
    dice3d.addSystem({ id, name: "Мозаїка" }, "preferred");
    dice3d.addTexture("mozaika-mosaic", { name: "Мозаїка: вітраж", composite: "multiply", source: `systems/${id}/assets/dice/mosaic.webp` });
    dice3d.addColorset({
      name: "mozaika", description: "Мозаїка — вітраж", category: "Мозаїка",
      foreground: "#ffffff", background: "#ffffff", outline: "#000000", edge: "#1d2b7a",
      texture: "mozaika-mosaic", material: "glass", font: "MozDisplay", fontScale: { d10: 1.1 }
    }, "default");
    dice3d.addColorset({
      name: "mozaika-pink", description: "Мозаїка — рожевий зін", category: "Мозаїка",
      foreground: "#1d2b7a", background: "#e98fb0", outline: "#ffffff", edge: "#1d2b7a",
      texture: "none", material: "plastic", font: "MozDisplay"
    });
    dice3d.addDicePreset({
      type: "d10", system: id, colorset: "mozaika", font: "MozDisplay",
      labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
    });
  });
}
