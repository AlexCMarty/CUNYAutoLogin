/**
 * Chrome and Firefox expose the same “side UI” idea through different manifest keys.
 * This object is the only manifest definition for that surface; Vite merges it into
 * `dist/manifest.json` in development builds. Production builds omit it entirely.
 */

export const devSideSurfaceManifestPatch = {
  side_panel: {
    default_path: "sidebar.html",
  },
  sidebar_action: {
    default_title: "CUNYAutoLogin dev",
    default_panel: "sidebar.html",
    default_icon: "icons/dev-sidebar-48.png",
  },
} as const;
