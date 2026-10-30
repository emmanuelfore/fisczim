/**
 * profileStore.js  –  Profile persistence for the configurable parser engine.
 *
 * Profiles are stored as:
 *   <userData>/profiles/<id>@<version>.json
 *
 * A profile is immutable once saved at a given version.
 * Saving over an existing profile increments the version automatically.
 *
 * All functions are synchronous (tiny JSON files, no perf concern).
 */

const fs   = require('fs');
const path = require('path');

let _profileDir = null;

function init(userDataPath) {
  _profileDir = path.join(userDataPath, 'profiles');
  if (!fs.existsSync(_profileDir)) fs.mkdirSync(_profileDir, { recursive: true });

  // Seed built-in starter profiles if not already present
  const builtinsDir = path.join(__dirname, 'profiles');
  if (fs.existsSync(builtinsDir)) {
    for (const file of fs.readdirSync(builtinsDir)) {
      if (!file.endsWith('.json')) continue;
      const dest = path.join(_profileDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(builtinsDir, file), dest);
      }
    }
  }
}

function _dir() {
  if (!_profileDir) throw new Error('profileStore.init() not called');
  return _profileDir;
}

/** Return all profiles (latest version of each id) */
function listProfiles() {
  const dir = _dir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const map = {};
  for (const file of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const key = p.id;
      if (!map[key] || p.version > map[key].version) map[key] = p;
    } catch {}
  }
  return Object.values(map).sort((a, b) => (a.name||a.id).localeCompare(b.name||b.id));
}

/** Return all versions of a profile id (sorted ascending) */
function getProfileVersions(id) {
  const dir = _dir();
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(id + '@') && f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);
}

/** Get a specific profile version (or latest if version omitted) */
function getProfile(id, version = null) {
  if (version !== null) {
    const file = path.join(_dir(), `${id}@${version}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const all = getProfileVersions(id);
  return all.length ? all[all.length - 1] : null;
}

/** Save a (possibly new) profile. Auto-increments version if id already exists. */
function saveProfile(profile) {
  const dir = _dir();
  if (!profile.id) throw new Error('Profile must have an id');

  const existing = getProfile(profile.id);
  const version  = existing ? existing.version + 1 : 1;
  const saved    = { ...profile, version, savedAt: new Date().toISOString() };
  const filename = `${saved.id}@${version}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(saved, null, 2), 'utf8');
  return saved;
}

/** Delete all versions of a profile (use with care) */
function deleteProfile(id) {
  const dir = _dir();
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(id + '@')) { fs.unlinkSync(path.join(dir, f)); count++; }
  }
  return count;
}

/** Export a profile to a specific path */
function exportProfile(id, version, destPath) {
  const p = getProfile(id, version);
  if (!p) throw new Error(`Profile ${id}@${version} not found`);
  fs.writeFileSync(destPath, JSON.stringify(p, null, 2), 'utf8');
  return destPath;
}

/** Import a profile from a JSON file (assigns new version if id conflicts) */
function importProfile(srcPath) {
  const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  // Strip version so saveProfile auto-assigns
  delete raw.version;
  return saveProfile(raw);
}

module.exports = { init, listProfiles, getProfileVersions, getProfile, saveProfile, deleteProfile, exportProfile, importProfile };
