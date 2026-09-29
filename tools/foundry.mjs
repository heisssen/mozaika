/**
 * Dev helper for the local Foundry server:
 *   node tools/foundry.mjs shutdown     return the active world to setup (as the dev world's GM)
 *   node tools/foundry.mjs launch [id]  launch a world (default mozaika-dev)
 *   node tools/foundry.mjs status
 */
const URL = process.env.FOUNDRY_URL ?? "http://localhost:30000";
const [cmd = "status", world = "mozaika-dev"] = process.argv.slice(2);

async function status() {
  return (await fetch(`${URL}/api/status`)).json();
}

async function gmSession() {
  const r = await fetch(`${URL}/join`, { redirect: "manual" });
  const session = (r.headers.get("set-cookie") ?? "").match(/session=([^;]+)/)?.[1];
  const html = await r.text();
  // Resolve the Gamemaster user id from the join page / socket-less fallback.
  let userId = html.match(/value="([A-Za-z0-9]{16})"[^>]*>\s*Gamemaster/)?.[1];
  if (!userId) {
    const { io } = await import("socket.io-client");
    userId = await new Promise((resolve, reject) => {
      const s = io(URL, { transports: ["websocket"], query: { session }, extraHeaders: { Cookie: `session=${session}` } });
      s.on("session", () => s.emit("getJoinData", d => { s.disconnect(); resolve(d.users.find(u => /gamemaster/i.test(u.name))?._id); }));
      setTimeout(() => reject(new Error("timeout")), 10000);
    });
  }
  const j = await fetch(`${URL}/join`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: `session=${session}` },
    body: JSON.stringify({ action: "join", userid: userId, userId, password: "" })
  });
  if (!j.ok) throw new Error(`join failed ${j.status}`);
  return session;
}

if (cmd === "status") console.log(await status());
if (cmd === "shutdown") {
  const s = await status();
  if (!s.active) { console.log("already at setup"); process.exit(0); }
  const session = await gmSession();
  await fetch(`${URL}/setup`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `session=${session}` }, body: JSON.stringify({ shutdown: true }), redirect: "manual" });
  for (let i = 0; i < 20 && (await status()).active; i++) await new Promise(r => setTimeout(r, 500));
  console.log(await status());
}
if (cmd === "launch") {
  await fetch(`${URL}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "launchWorld", world }) });
  for (let i = 0; i < 40 && !(await status()).active; i++) await new Promise(r => setTimeout(r, 500));
  console.log(await status());
}
