const { ToggleButton } = require("sdk/ui/button/toggle");
const panels = require("sdk/panel");
const tabs = require("sdk/tabs");
const self = require("sdk/self");
const data = require("sdk/self").data;
const { window: { document } } = require('sdk/addon/window');
const { getTabContentWindow, getActiveTab } = require('sdk/tabs/utils');
const { getMostRecentBrowserWindow } = require('sdk/window/utils');

// This add-on uses built-in tracking protection, which doesn't have
// hooks for add-ons to use yet.
const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

// Enable tracking protection globally when add-on is installed.
Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true);

let button = ToggleButton({
  id: "tracking-button",
  label: "Tracking Protection",
  icon: {
    "18": "./shield-error-icon-16.png",
    "32": "./shield-error-icon-32.png",
    "64": "./shield-error-icon-64.png"
  },
  onChange: (state) => {
    if (state.checked) {
      panel.show({
        position: button
      });
    }
  }
});

let panel = panels.Panel({
  contentURL: data.url("panel.html"),
  contentScriptFile: data.url("panel.js"),
  onHide: () => {
    button.state("window", {checked: false});
  }
});

function normalizeUrl(url) {
  // NOTE below is from:
  // https://dxr.mozilla.org/mozilla-central/rev/be593a64d7c6a826260514fe758ef32a6ee580f7/browser/base/content/browser-trackingprotection.js
  // Convert document URI into the format used by
  // nsChannelClassifier::ShouldEnableTrackingProtection.
  // Any scheme turned into https is correct.
  // TODO would be nice to make this easier for add-ons to extend

  // FIXME there must be a way to get at the nsIURI in activeTab...
  // what we really want is hostPort
  let hostPort = url.replace(/^http:\/\//, "https://");
  return Services.io.newURI(hostPort, null, null);
}

function enableControls() {
  let normalizedUrl = normalizeUrl(tabs.activeTab.url);
  if (normalizedUrl.scheme != "https") {
    console.log("tracking protection only works for web URLs");
    panel.port.emit("changeurl");
    return;
  }
  if (Services.perms.testPermission(normalizedUrl, "trackingprotection")) {
    console.log("tracking protection *not* already active for:", normalizedUrl.spec);
    panel.port.emit("disabled");
  } else {
    console.log("tracking protection already active for:", normalizedUrl.spec);
    panel.port.emit("enabled");
  }
  panel.port.emit("changeurl", normalizedUrl.host);
}

// a new tab has been selected, reset the add-on controls
tabs.on("activate", () => {
  panel.port.emit("reset");
  enableControls();
});

// DOM has loaded but page isn't finished, reset the add-on controls
tabs.on("ready", (tab) => {
  panel.port.emit("reset");
  enableControls();
});

// Page is retrieved from back/forward cache.
// This also fires when regular pages are done loading.
tabs.on("pageshow", (tab) => {
  enableControls();
});

panel.port.on("toggle", (addonMessage) => {
  panel.port.emit("reset");

  let activeTab = tabs.activeTab;
  let normalizedUrl = normalizeUrl(activeTab.url);

  if (Services.perms.testPermission(normalizedUrl, "trackingprotection")) {
    Services.perms.remove(normalizedUrl, "trackingprotection");
  } else {
    Services.perms.add(normalizedUrl,
      "trackingprotection", Services.perms.ALLOW_ACTION);
  }

  activeTab.reload();
});

enableControls();
