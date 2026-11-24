// Paint the last dashboard the moment the page opens; the app swaps in live data a few ms later.
// Saved by main.tsx when the page is hidden. Favicons were stripped from the saved HTML and live
// in their own deduplicated store (see favicons.tsx); data: URLs load synchronously, so setting
// them here puts icons in the very first frame. Separate file because MV3 forbids inline scripts.
var shell = localStorage.getItem("shell");
if (shell) {
  var app = document.getElementById("app");
  app.innerHTML = shell;
  try {
    var icons = JSON.parse(localStorage.getItem("favicons"));
    app.querySelectorAll("img[data-favicon]").forEach(function (img) {
      var i = icons.u[img.dataset.favicon];
      if (i !== undefined) img.src = icons.d[i];
    });
  } catch (e) {}
}
