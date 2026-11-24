// Runs synchronously before first paint so the dark theme never flashes light.
// MV3 forbids inline scripts, hence a separate file.
var t = localStorage.getItem("theme") || "system";
if (t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}
