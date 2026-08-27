// Notes module — Markdown vaults, the vault tree, and document read/write/file
// operations. Vaults are registered in config.json (machine-local app state);
// documents live on the user's real filesystem at absolute paths.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{read_config, write_config, AppState};

/// Global registry of active vault watchers keyed by vault path.
fn watchers() -> &'static Mutex<HashMap<String, Mutex<RecommendedWatcher>>> {
	static WATCHERS: OnceLock<Mutex<HashMap<String, Mutex<RecommendedWatcher>>>> = OnceLock::new();
	WATCHERS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Clone)]
pub struct VaultMeta {
	pub id: String,
	pub path: String,
	pub name: String,
	pub exists: bool,
}

#[derive(Serialize, Clone)]
pub struct VaultNode {
	pub name: String,
	pub dirs: Vec<VaultNode>,
	pub files: Vec<String>,
}

#[derive(Serialize)]
pub struct NoteRead {
	pub text: String,
	pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct WriteResult {
	pub conflict: bool,
	pub mtime_ms: u64,
}

fn mtime_ms(p: &Path) -> u64 {
	fs::metadata(p)
		.ok()
		.and_then(|m| m.modified().ok())
		.and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
		.map(|d| d.as_millis() as u64)
		.unwrap_or(0)
}

fn is_markdown(name: &str) -> bool {
	let lower = name.to_lowercase();
	lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn valid_name(name: &str) -> bool {
	!name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\']) && !name.contains('\0')
}

// ---------------------------------------------------------------------------
// Vault registry (persisted in config.json)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn notes_list_vaults(state: State<'_, AppState>) -> Result<Vec<VaultMeta>, String> {
	let config = read_config(&state.config_path).unwrap_or_default();
	let list = config.get("vaults").cloned().unwrap_or_else(|| serde_json::json!([]));
	let mut out = Vec::new();
	if let Some(arr) = list.as_array() {
		for v in arr {
			let path = v.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string();
			let id = v.get("id").and_then(|p| p.as_str()).unwrap_or("").to_string();
			let name = v
				.get("name")
				.and_then(|n| n.as_str())
				.map(|s| s.to_string())
				.unwrap_or_else(|| {
					Path::new(&path)
						.file_name()
						.map(|f| f.to_string_lossy().to_string())
						.unwrap_or_else(|| path.clone())
				});
			let exists = !path.is_empty() && Path::new(&path).is_dir();
			out.push(VaultMeta { id, path, name, exists });
		}
	}
	Ok(out)
}

#[tauri::command]
pub fn notes_add_vault(state: State<'_, AppState>, path: String) -> Result<VaultMeta, String> {
	if path.trim().is_empty() {
		return Err("Choose a folder".into());
	}
	let p = PathBuf::from(&path);
	if !p.is_dir() {
		return Err("Not a folder".into());
	}
	let canonical = p.canonicalize().map_err(|e| e.to_string())?;
	let mut config = read_config(&state.config_path).unwrap_or_default();
	let mut list = config.get("vaults").cloned().unwrap_or_else(|| serde_json::json!([]));
	if let Some(arr) = list.as_array() {
		for v in arr {
			let existing = v.get("path").and_then(|x| x.as_str()).unwrap_or("");
			if !existing.is_empty()
				&& Path::new(existing)
					.canonicalize()
					.ok()
					.map(|c| c == canonical)
					.unwrap_or(false)
			{
				return Err("That folder is already a vault".into());
			}
		}
	}
	let name = p
		.file_name()
		.map(|f| f.to_string_lossy().to_string())
		.unwrap_or_else(|| path.clone());
	let meta = VaultMeta {
		id: uuid::Uuid::new_v4().to_string(),
		path,
		name,
		exists: true,
	};
	list.as_array_mut()
		.map(|a| a.push(serde_json::json!({ "id": meta.id, "path": meta.path, "name": meta.name })));
	config["vaults"] = list;
	let has_active = config
		.get("activeVaultId")
		.and_then(|v| v.as_str())
		.map(|s| !s.is_empty())
		.unwrap_or(false);
	if !has_active {
		config["activeVaultId"] = serde_json::json!(meta.id);
	}
	write_config(&state.config_path, &config)?;
	Ok(meta)
}

#[tauri::command]
pub fn notes_remove_vault(state: State<'_, AppState>, id: String) -> Result<(), String> {
	let mut config = read_config(&state.config_path).unwrap_or_default();
	if let Some(list) = config.get_mut("vaults").and_then(|v| v.as_array_mut()) {
		list.retain(|v| v.get("id").and_then(|x| x.as_str()).unwrap_or("") != id);
	}
	if config.get("activeVaultId").and_then(|v| v.as_str()) == Some(id.as_str()) {
		config["activeVaultId"] = serde_json::json!("");
	}
	write_config(&state.config_path, &config)
}

#[tauri::command]
pub fn notes_set_active_vault(state: State<'_, AppState>, id: String) -> Result<(), String> {
	let mut config = read_config(&state.config_path).unwrap_or_default();
	config["activeVaultId"] = serde_json::json!(id);
	write_config(&state.config_path, &config)
}

// ---------------------------------------------------------------------------
// Tree scan
// ---------------------------------------------------------------------------

fn scan_dir(path: &Path) -> Result<VaultNode, String> {
	let name = path
		.file_name()
		.map(|f| f.to_string_lossy().to_string())
		.unwrap_or_else(|| path.to_string_lossy().to_string());
	let mut dirs = Vec::new();
	let mut files = Vec::new();
	for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
		let entry = entry.map_err(|e| e.to_string())?;
		let fname = entry.file_name().to_string_lossy().to_string();
		if fname.starts_with('.') {
			continue;
		}
		// file_type() does not follow symlinks — symlinks are simply skipped.
		let ft = entry.file_type().map_err(|e| e.to_string())?;
		if ft.is_dir() {
			dirs.push(scan_dir(&entry.path())?);
		} else if ft.is_file() && is_markdown(&fname) {
			files.push(fname);
		}
	}
	dirs.sort_by(|a, b| a.name.cmp(&b.name));
	files.sort();
	Ok(VaultNode { name, dirs, files })
}

#[tauri::command]
pub fn notes_scan(path: String) -> Result<VaultNode, String> {
	let p = PathBuf::from(&path);
	if !p.is_dir() {
		return Err("Folder does not exist".into());
	}
	scan_dir(&p)
}

// ---------------------------------------------------------------------------
// Document read / write (mtime-based conflict detection)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn notes_read(path: String) -> Result<NoteRead, String> {
	let p = PathBuf::from(&path);
	if !p.is_file() {
		return Err("File does not exist".into());
	}
	let bytes = fs::read(&p).map_err(|e| e.to_string())?;
	let text = String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8 text".to_string())?;
	Ok(NoteRead {
		text,
		mtime_ms: mtime_ms(&p),
	})
}

#[tauri::command]
pub fn notes_write(
	path: String,
	text: String,
	expected_mtime_ms: Option<u64>,
) -> Result<WriteResult, String> {
	let p = PathBuf::from(&path);
	if !p.exists() {
		return Ok(WriteResult {
			conflict: true,
			mtime_ms: 0,
		});
	}
	let cur = mtime_ms(&p);
	if let Some(expected) = expected_mtime_ms {
		if expected != 0 && cur != expected {
			return Ok(WriteResult {
				conflict: true,
				mtime_ms: cur,
			});
		}
	}
	fs::write(&p, text.as_bytes()).map_err(|e| e.to_string())?;
	Ok(WriteResult {
		conflict: false,
		mtime_ms: mtime_ms(&p),
	})
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

fn unique_copy_name(dir: &Path, stem: &str, ext: &str) -> String {
	let mut n = 0;
	loop {
		n += 1;
		let name = if n == 1 {
			format!("{stem} copy{ext}")
		} else {
			format!("{stem} copy {n}{ext}")
		};
		if !dir.join(&name).exists() {
			return name;
		}
	}
}

fn copy_recursive(src: &Path, dest: &Path) -> Result<(), String> {
	if src.is_dir() {
		fs::create_dir_all(dest).map_err(|e| e.to_string())?;
		for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
			let entry = entry.map_err(|e| e.to_string())?;
			copy_recursive(&entry.path(), &dest.join(entry.file_name()))?;
		}
	} else {
		fs::copy(src, dest).map_err(|e| e.to_string())?;
	}
	Ok(())
}

#[tauri::command]
pub fn notes_copy(src: String, dest_dir: String) -> Result<String, String> {
	let src_path = PathBuf::from(&src);
	let dest = PathBuf::from(&dest_dir);
	if !src_path.exists() {
		return Err("Source does not exist".into());
	}
	if !dest.is_dir() {
		return Err("Destination is not a folder".into());
	}
	let stem = src_path
		.file_stem()
		.map(|s| s.to_string_lossy().to_string())
		.unwrap_or_else(|| "copy".into());
	let ext = src_path
		.extension()
		.map(|e| format!(".{}", e.to_string_lossy()))
		.unwrap_or_default();
	let name = unique_copy_name(&dest, &stem, &ext);
	let out = dest.join(&name);
	copy_recursive(&src_path, &out)?;
	Ok(out.to_string_lossy().to_string())
}

#[tauri::command]
pub fn notes_move(src: String, dest_dir: String) -> Result<String, String> {
	let src_path = PathBuf::from(&src);
	let dest = PathBuf::from(&dest_dir);
	if !src_path.exists() {
		return Err("Source does not exist".into());
	}
	if !dest.is_dir() {
		return Err("Destination is not a folder".into());
	}
	if dest.starts_with(&src_path) {
		return Err("Cannot move a folder into itself".into());
	}
	let name = src_path
		.file_name()
		.map(|f| f.to_string_lossy().to_string())
		.ok_or_else(|| "Invalid source name".to_string())?;
	let out = dest.join(&name);
	if out.exists() {
		return Err("An item with that name already exists there".into());
	}
	fs::rename(&src_path, &out).map_err(|e| e.to_string())?;
	Ok(out.to_string_lossy().to_string())
}

#[tauri::command]
pub fn notes_rename(path: String, new_name: String) -> Result<String, String> {
	if !valid_name(&new_name) {
		return Err("Invalid name".into());
	}
	let p = PathBuf::from(&path);
	if !p.exists() {
		return Err("Item does not exist".into());
	}
	let parent = p.parent().ok_or_else(|| "Invalid path".to_string())?;
	let out = parent.join(&new_name);
	if out.exists() {
		return Err("An item with that name already exists".into());
	}
	fs::rename(&p, &out).map_err(|e| e.to_string())?;
	Ok(out.to_string_lossy().to_string())
}

#[tauri::command]
pub fn notes_delete(path: String) -> Result<(), String> {
	let p = PathBuf::from(&path);
	if !p.exists() {
		return Ok(());
	}
	trash::delete(&p).map_err(|e| format!("Could not move to trash: {e}"))
}

/// Open a file or folder with the OS default application.
#[tauri::command]
pub fn notes_open_external(path: String) -> Result<(), String> {
	let p = PathBuf::from(&path);
	if !p.exists() {
		return Err("Path does not exist".into());
	}
	#[cfg(target_os = "macos")]
	std::process::Command::new("open")
		.arg(&p)
		.spawn()
		.map_err(|e| e.to_string())?;
	#[cfg(target_os = "windows")]
	std::process::Command::new("cmd")
		.args(["/C", "start", "", &path])
		.spawn()
		.map_err(|e| e.to_string())?;
	#[cfg(target_os = "linux")]
	std::process::Command::new("xdg-open")
		.arg(&p)
		.spawn()
		.map_err(|e| e.to_string())?;
	Ok(())
}

#[tauri::command]
pub fn notes_create(dir: String, kind: String, name: String) -> Result<String, String> {
	if !valid_name(&name) {
		return Err("Invalid name".into());
	}
	let parent = PathBuf::from(&dir);
	if !parent.is_dir() {
		return Err("Folder does not exist".into());
	}
	let out = parent.join(&name);
	if out.exists() {
		return Err("An item with that name already exists".into());
	}
	match kind.as_str() {
		"note" => fs::write(&out, "").map_err(|e| e.to_string())?,
		"folder" => fs::create_dir(&out).map_err(|e| e.to_string())?,
		_ => return Err("Unknown kind".into()),
	}
	Ok(out.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// File watching
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn notes_watch_vault(app: AppHandle, path: String) -> Result<(), String> {
	{
		let mut watchers = watchers().lock().map_err(|e| e.to_string())?;
		// Remove any existing watcher for this path
		watchers.remove(&path);
	}

	let p = PathBuf::from(&path);
	if !p.is_dir() {
		return Err("Path is not a directory".into());
	}

	let app_handle = app.clone();
	let watch_path = path.clone();

	let mut watcher: RecommendedWatcher =
		notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
			if let Ok(event) = res {
				// Only emit on create/remove/rename — skip modify to avoid spammmy refreshes
				match event.kind {
					EventKind::Create(_)
					| EventKind::Remove(_)
					| EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
						// Debounce: wait 200ms then emit
						std::thread::sleep(Duration::from_millis(200));
						let _ = app_handle.emit("vault-changed", &watch_path);
				}
				_ => {}
			}
		}
	})
	.map_err(|e| e.to_string())?;

	watcher
		.watch(&p, RecursiveMode::Recursive)
		.map_err(|e| e.to_string())?;

	{
		let mut watchers = watchers().lock().map_err(|e| e.to_string())?;
		watchers.insert(path, Mutex::new(watcher));
	}

	Ok(())
}

#[tauri::command]
pub fn notes_unwatch_vault(path: String) -> Result<(), String> {
	let mut watchers = watchers().lock().map_err(|e| e.to_string())?;
	watchers.remove(&path);
	Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
	use super::*;
	use std::time::Duration;

	fn tmpdir() -> PathBuf {
		let d = std::env::temp_dir().join(format!("fg-notes-test-{}", uuid::Uuid::new_v4()));
		fs::create_dir_all(&d).unwrap();
		d
	}

	#[test]
	fn scan_detects_folders_and_markdown_only() {
		let root = tmpdir();
		fs::create_dir_all(root.join("a/b")).unwrap();
		fs::create_dir_all(root.join(".hidden")).unwrap();
		fs::write(root.join("one.md"), "# hi").unwrap();
		fs::write(root.join("two.MARKDOWN"), "x").unwrap();
		fs::write(root.join("notes.txt"), "no").unwrap();
		fs::write(root.join(".dot.md"), "no").unwrap();
		fs::write(root.join("a/b/deep.md"), "d").unwrap();
		fs::write(root.join("a/plain.txt"), "no").unwrap();
		#[cfg(unix)]
		std::os::unix::fs::symlink(&root.join("one.md"), root.join("link.md")).unwrap();
		let tree = scan_dir(&root).unwrap();
		assert_eq!(tree.files, vec!["one.md".to_string(), "two.MARKDOWN".to_string()]);
		assert_eq!(tree.dirs.len(), 1);
		assert_eq!(tree.dirs[0].name, "a");
		assert_eq!(tree.dirs[0].dirs[0].name, "b");
		assert_eq!(tree.dirs[0].dirs[0].files, vec!["deep.md".to_string()]);
		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn valid_name_rejects_bad_names() {
		assert!(!valid_name(""));
		assert!(!valid_name("."));
		assert!(!valid_name(".."));
		assert!(!valid_name("a/b"));
		assert!(!valid_name("a\\b"));
		assert!(!valid_name("a\0b"));
		assert!(valid_name("hello.md"));
		assert!(valid_name("with space.md"));
	}

	#[test]
	fn unique_copy_name_suffixes() {
		let dir = tmpdir();
		fs::write(dir.join("note copy.md"), "").unwrap();
		fs::write(dir.join("note copy 2.md"), "").unwrap();
		assert_eq!(unique_copy_name(&dir, "note", ".md"), "note copy 3.md");
		fs::write(dir.join("a.md"), "").unwrap();
		assert_eq!(unique_copy_name(&dir, "a", ".md"), "a copy.md");
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn rename_rejects_collision_and_moves() {
		let dir = tmpdir();
		fs::write(dir.join("a.md"), "a").unwrap();
		fs::write(dir.join("b.md"), "b").unwrap();
		assert!(notes_rename(dir.join("a.md").to_string_lossy().to_string(), "b.md".into()).is_err());
		let moved =
			notes_rename(dir.join("a.md").to_string_lossy().to_string(), "c.md".into()).unwrap();
		assert_eq!(Path::new(&moved).file_name().unwrap(), "c.md");
		assert!(!dir.join("a.md").exists());
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn write_conflicts_on_stale_mtime() {
		let dir = tmpdir();
		let p = dir.join("n.md");
		fs::write(&p, "v1").unwrap();
		let read = notes_read(p.to_string_lossy().to_string()).unwrap();
		std::thread::sleep(Duration::from_millis(20));
		fs::write(&p, "v2-external").unwrap();
		let res =
			notes_write(p.to_string_lossy().to_string(), "v1-edited".into(), Some(read.mtime_ms)).unwrap();
		assert!(res.conflict);
		let cur = mtime_ms(&p);
		let res2 =
			notes_write(p.to_string_lossy().to_string(), "v1-edited".into(), Some(cur)).unwrap();
		assert!(!res2.conflict);
		assert_eq!(fs::read_to_string(&p).unwrap(), "v1-edited");
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn write_missing_file_is_conflict() {
		let dir = tmpdir();
		let p = dir.join("gone.md");
		let res = notes_write(p.to_string_lossy().to_string(), "x".into(), None).unwrap();
		assert!(res.conflict);
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn read_rejects_non_utf8() {
		let dir = tmpdir();
		let p = dir.join("bin.md");
		fs::write(&p, [0xff, 0xfe, 0x00, 0x41]).unwrap();
		assert!(notes_read(p.to_string_lossy().to_string()).is_err());
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn copy_and_move_work() {
		let dir = tmpdir();
		fs::create_dir_all(dir.join("src/sub")).unwrap();
		fs::write(dir.join("src/a.md"), "a").unwrap();
		fs::write(dir.join("src/sub/b.md"), "b").unwrap();
		let copied =
			notes_copy(dir.join("src").to_string_lossy().to_string(), dir.to_string_lossy().to_string())
				.unwrap();
		assert!(Path::new(&copied).join("sub/b.md").exists());
		let moved = notes_move(
			dir.join("src/sub/b.md").to_string_lossy().to_string(),
			dir.to_string_lossy().to_string(),
		)
		.unwrap();
		assert!(Path::new(&moved).exists());
		assert!(notes_move(
			dir.join("src").to_string_lossy().to_string(),
			dir.join("src").to_string_lossy().to_string()
		)
		.is_err());
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn create_note_and_folder() {
		let dir = tmpdir();
		let n = notes_create(dir.to_string_lossy().to_string(), "note".into(), "New.md".into()).unwrap();
		assert!(Path::new(&n).is_file());
		assert!(notes_create(dir.to_string_lossy().to_string(), "note".into(), "New.md".into()).is_err());
		let f = notes_create(dir.to_string_lossy().to_string(), "folder".into(), "Docs".into()).unwrap();
		assert!(Path::new(&f).is_dir());
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn delete_missing_is_ok() {
		let dir = tmpdir();
		assert!(notes_delete(dir.join("gone.md").to_string_lossy().to_string()).is_ok());
		let _ = fs::remove_dir_all(&dir);
	}
}
