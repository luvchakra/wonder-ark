// DISC-IG-P0-01.1: the helper's settings: the pace it holds to, and WonderArk's address.
const fields = ["dailyLimit", "gapSeconds", "base"];
const show = (settings) => fields.forEach((id) => (document.getElementById(id).value = settings[id]));
chrome.runtime.sendMessage({ type: "settings" }, (answer) => answer && answer.ok && show(answer.data));
document.getElementById("save").addEventListener("click", () => {
  const settings = Object.fromEntries(fields.map((id) => [id, document.getElementById(id).value]));
  chrome.runtime.sendMessage({ type: "saveSettings", settings }, (answer) => {
    if (answer && answer.ok) show(answer.data);
    document.getElementById("status").textContent = answer && answer.ok ? "Saved." : "Couldn't save.";
  });
});
