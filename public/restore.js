// Paint the last dashboard the moment the page opens; the app swaps in live data a few ms later.
// Saved by main.tsx when the page is hidden. Separate file because MV3 forbids inline scripts.
var shell = localStorage.getItem("shell");
if (shell) document.getElementById("app").innerHTML = shell;
