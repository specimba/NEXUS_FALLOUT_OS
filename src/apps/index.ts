// ============================================================
// NEXUS OS — App barrel
//
// Importing this module loads the registry first, then every app
// module. Each app calls registerApp() as a side-effect of import,
// so by the time the desktop mounts the registry is fully populated.
//
// WAVE-2: only the registry is imported (no apps yet).
// WAVE-3 will append `import './terminal'`, `import './nexus-ai'`, etc.
// ============================================================

import './registry'
