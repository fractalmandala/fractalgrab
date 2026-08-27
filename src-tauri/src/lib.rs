mod http_server;
mod notes;

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use regex::Regex;	use serde::Serialize;
	use tauri::{AppHandle, Manager, State};
use url::Url;

const MANIFEST_NAME: &str = "fractalgrab.json";
const CONFIG_NAME: &str = "config.json";
const BACKUP_META_NAME: &str = "backup-meta.json";
const EXT_PORT: u16 = 48123;

pub struct AppState {
	pub library: Mutex<PathBuf>,
	pub config_path: PathBuf,
	pub server_running: AtomicBool,
	/// In-memory manifest cache — the single authority for fractalgrab.json.
	/// Both the webview (write_manifest) and the extension server (save_ext_item)
	/// read/write through this cache to prevent lost writes.
	pub manifest_cache: Mutex<Option<serde_json::Value>>,
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_millis() as u64)
		.unwrap_or(0)
}

fn slugify(s: &str) -> String {
	let mut out = String::new();
	for c in s.trim().chars() {
		if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
			out.push(c);
		} else {
			out.push(' ');
		}
	}
	let joined: String = out.split_whitespace().collect::<Vec<_>>().join(" ");
	let joined: String = joined.chars().take(90).collect();
	if joined.is_empty() {
		"untitled".to_string()
	} else {
		joined
	}
}

fn xml_escape(s: &str) -> String {
	s.replace('&', "&amp;")
		.replace('<', "&lt;")
		.replace('>', "&gt;")
		.replace('"', "&quot;")
		.replace('\'', "&apos;")
}

fn webloc_bytes(url: &str) -> Vec<u8> {
	format!(
		"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n\t<key>URL</key>\n\t<string>{}</string>\n</dict>\n</plist>\n",
		xml_escape(url)
	)
	.into_bytes()
}

fn sanitize_filename(name: &str) -> String {
	let base = Path::new(name)
		.file_name()
		.map(|f| f.to_string_lossy().to_string())
		.unwrap_or_else(|| name.to_string());
	base.chars()
		.map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.' | '(' | ')') { c } else { ' ' })
		.collect::<String>()
		.split_whitespace()
		.collect::<Vec<_>>()
		.join(" ")
}

fn write_file_unique(lib: &Path, base: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
	let mut name = format!("{base}{ext}");
	let mut n = 1;
	while lib.join(&name).exists() {
		n += 1;
		name = format!("{base} {n}{ext}");
	}
	fs::write(lib.join(&name), bytes).map_err(|e| e.to_string())?;
	Ok(name)
}

fn is_inside_library(lib: &Path, path: &Path) -> bool {
	match (lib.canonicalize(), path.canonicalize()) {
		(Ok(l), Ok(p)) => p.starts_with(l),
		_ => path.starts_with(lib),
	}
}

fn read_config(config_path: &Path) -> Result<serde_json::Value, String> {
	if !config_path.exists() {
		return Ok(serde_json::json!({}));
	}
	let raw = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
	serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_config(config_path: &Path, v: &serde_json::Value) -> Result<(), String> {
	fs::write(config_path, serde_json::to_string_pretty(v).map_err(|e| e.to_string())?)
		.map_err(|e| e.to_string())
}

fn default_library_dir() -> PathBuf {
	dirs::download_dir()
		.or_else(dirs::home_dir)
		.unwrap_or_else(|| PathBuf::from("."))
		.join("fractalgrab")
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_dialog::init())
		.setup(|app| {
			let config_dir = app.path().app_config_dir()?;
			fs::create_dir_all(&config_dir)?;
			let config_path = config_dir.join(CONFIG_NAME);
			let config = read_config(&config_path).unwrap_or_default();
			let library = config
				.get("libraryPath")
				.and_then(|v| v.as_str())
				.map(PathBuf::from)
				.unwrap_or_else(default_library_dir);
			fs::create_dir_all(&library)?;
			// Pre-load manifest cache from disk
			let manifest_path = library.join(MANIFEST_NAME);
			let cached_manifest = if manifest_path.exists() {
				fs::read_to_string(&manifest_path)
					.ok()
					.and_then(|s| serde_json::from_str(&s).ok())
			} else {
				None
			};
			app.manage(AppState {
				library: Mutex::new(library),
				config_path,
				server_running: AtomicBool::new(false),
				manifest_cache: Mutex::new(cached_manifest),
			});
			let handle = app.handle().clone();
			spawn_backup_scheduler(handle);
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![
			get_library_dir,
			set_library_dir,
			read_manifest,
			write_manifest,
			list_library,
			import_file,
			write_item_file,
			delete_file,
			rename_file,
			open_item,
			reveal_in_finder,
			save_link,
			backup_now,
			get_backup_meta,
			set_extension_server,
			get_extension_status,
			notes::notes_list_vaults,
			notes::notes_add_vault,
			notes::notes_remove_vault,
			notes::notes_set_active_vault,
			notes::notes_scan,
			notes::notes_read,
			notes::notes_write,
			notes::notes_rename,
			notes::notes_delete,
			notes::notes_copy,
			notes::notes_move,
			notes::notes_create,
			notes::notes_open_external,
		])
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Library / manifest commands
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
struct FileMeta {
	name: String,
	size: u64,
	mtime: u64,
}

#[tauri::command]
fn get_library_dir(state: State<'_, AppState>) -> Result<String, String> {
	Ok(state.library.lock().map_err(|e| e.to_string())?.to_string_lossy().to_string())
}

#[tauri::command]
fn set_library_dir(state: State<'_, AppState>, path: String) -> Result<String, String> {
	let dir = PathBuf::from(&path);
	fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
	let mut config = read_config(&state.config_path).unwrap_or_default();
	config["libraryPath"] = serde_json::Value::String(path);
	write_config(&state.config_path, &config)?;
	*state.library.lock().map_err(|e| e.to_string())? = dir;
	// Clear manifest cache so the new library's manifest is loaded fresh
	manifest_clear_cache(&state);
	Ok(get_library_dir(state).unwrap_or_default())
}

/// Read the manifest from the in-memory cache (or disk on first access).
pub fn manifest_read(app: &AppState) -> Result<serde_json::Value, String> {
	let mut cache = app.manifest_cache.lock().map_err(|e| e.to_string())?;
	if let Some(ref v) = *cache {
		return Ok(v.clone());
	}
	let lib = app.library.lock().map_err(|e| e.to_string())?;
	let path = lib.join(MANIFEST_NAME);
	let v: serde_json::Value = if path.exists() {
		fs::read_to_string(&path)
			.ok()
			.and_then(|s| serde_json::from_str(&s).ok())
			.unwrap_or_else(|| serde_json::json!({ "items": [] }))
	} else {
		serde_json::json!({ "items": [] })
	};
	*cache = Some(v.clone());
	Ok(v)
}

/// Write the manifest to both the in-memory cache and disk.
pub fn manifest_write(app: &AppState, v: serde_json::Value) -> Result<(), String> {
	{
		let mut cache = app.manifest_cache.lock().map_err(|e| e.to_string())?;
		*cache = Some(v.clone());
	}
	let lib = app.library.lock().map_err(|e| e.to_string())?;
	fs::write(
		lib.join(MANIFEST_NAME),
		serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?,
	)
	.map_err(|e| e.to_string())
}

/// Clear the manifest cache (called when the library directory changes).
pub fn manifest_clear_cache(app: &AppState) {
	if let Ok(mut cache) = app.manifest_cache.lock() {
		*cache = None;
	}
}

#[tauri::command]
fn read_manifest(state: State<'_, AppState>) -> Result<Option<String>, String> {
	let v = manifest_read(&state)?;
	if v.as_object().map_or(false, |o| o.is_empty()) {
		Ok(None)
	} else {
		Ok(Some(serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?))
	}
}

#[tauri::command]
fn write_manifest(state: State<'_, AppState>, contents: String) -> Result<(), String> {
	let v: serde_json::Value =
		serde_json::from_str(&contents).map_err(|e| format!("invalid manifest JSON: {e}"))?;
	manifest_write(&state, v)
}

#[tauri::command]
fn list_library(state: State<'_, AppState>) -> Result<Vec<FileMeta>, String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let mut out = Vec::new();
	for entry in fs::read_dir(lib.as_path()).map_err(|e| e.to_string())? {
		let entry = entry.map_err(|e| e.to_string())?;
		let md = entry.metadata().map_err(|e| e.to_string())?;
		if md.is_file() {
			let mtime = md
				.modified()
				.ok()
				.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
				.map(|d| d.as_secs())
				.unwrap_or(0);
			out.push(FileMeta {
				name: entry.file_name().to_string_lossy().to_string(),
				size: md.len(),
				mtime,
			});
		}
	}
	Ok(out)
}

/// Copy an existing file (from a Finder dialog or drag) into the library.
#[tauri::command]
fn import_file(state: State<'_, AppState>, src: String) -> Result<String, String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let src_path = PathBuf::from(&src);
	if !src_path.exists() {
		return Err("Source file does not exist".into());
	}
	let base = slugify(
		&src_path
			.file_stem()
			.map(|s| s.to_string_lossy().to_string())
			.unwrap_or_else(|| "file".into()),
	);
	let ext = src_path
		.extension()
		.map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
		.unwrap_or_default();
	let bytes = fs::read(&src_path).map_err(|e| e.to_string())?;
	write_file_unique(&lib, &base, &ext, &bytes)
}

/// Write bytes sent from the webview (paste / drop / clipboard content).
#[tauri::command]
fn write_item_file(
	state: State<'_, AppState>,
	filename: String,
	data_b64: String,
) -> Result<String, String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let safe = sanitize_filename(&filename);
	let bytes = base64::engine::general_purpose::STANDARD
		.decode(data_b64)
		.map_err(|e| e.to_string())?;
	let mut name = safe.clone();
	let mut n = 1;
	while lib.join(&name).exists() {
		n += 1;
		let stem = Path::new(&safe)
			.file_stem()
			.map(|s| s.to_string_lossy().to_string())
			.unwrap_or_else(|| "file".into());
		let ext = Path::new(&safe)
			.extension()
			.map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
			.unwrap_or_default();
		name = format!("{stem} {n}{ext}");
	}
	fs::write(lib.join(&name), bytes).map_err(|e| e.to_string())?;
	Ok(name)
}

#[tauri::command]
fn delete_file(state: State<'_, AppState>, filename: String) -> Result<(), String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let target = lib.join(&filename);
	if !is_inside_library(&lib, &target) {
		return Err("Refusing to delete outside the library".into());
	}
	if target.file_name().map(|n| n == MANIFEST_NAME).unwrap_or(false) {
		return Err("Refusing to delete the library manifest".into());
	}
	fs::remove_file(&target).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_file(
	state: State<'_, AppState>,
	old: String,
	new: String,
) -> Result<String, String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let safe = sanitize_filename(&new);
	if safe.is_empty() {
		return Err("Invalid filename".into());
	}
	let old_path = lib.join(&old);
	let new_path = lib.join(&safe);
	if !is_inside_library(&lib, &old_path) || !is_inside_library(&lib, &new_path) {
		return Err("Refusing to rename outside the library".into());
	}
	if new_path.exists() {
		return Err("A file with that name already exists".into());
	}
	fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
	Ok(safe)
}

#[tauri::command]
fn open_item(
	state: State<'_, AppState>,
	filename: Option<String>,
	url: Option<String>,
) -> Result<(), String> {
	if let Some(u) = url {
		return open::that(&u).map_err(|e| e.to_string());
	}
	if let Some(f) = filename {
		let lib = state.library.lock().map_err(|e| e.to_string())?;
		let path = lib.join(&f);
		return open::that(&path).map_err(|e| e.to_string());
	}
	Err("Nothing to open".into())
}

#[tauri::command]
fn reveal_in_finder(state: State<'_, AppState>, filename: String) -> Result<(), String> {
	let lib = state.library.lock().map_err(|e| e.to_string())?;
	let path = lib.join(&filename);
	#[cfg(target_os = "macos")]
	{
		std::process::Command::new("open")
			.arg("-R")
			.arg(&path)
			.status()
			.map_err(|e| e.to_string())?;
		return Ok(());
	}
	#[cfg(not(target_os = "macos"))]
	{
		let _ = open::that(&path).map_err(|e| e.to_string());
		Ok(())
	}
}

// ---------------------------------------------------------------------------
// save_link: fetch a URL, build a .webloc + favicon + key image
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct LinkSave {
	filename: String,
	title: String,
	favicon_file: Option<String>,
	image_file: Option<String>,
}

#[tauri::command]
async fn save_link(
	app: AppHandle,
	url: String,
	title: Option<String>,
) -> Result<LinkSave, String> {
	let lib = {
		let st = app.state::<AppState>();
		let guard = st.library.lock().map_err(|e| e.to_string())?;
		guard.clone()
	};

	let parsed = Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
	let base = parsed.to_string();

	let client = reqwest::Client::builder()
		.timeout(Duration::from_secs(15))
		.user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 FractalGrab/0.1")
		.build()
		.map_err(|e| e.to_string())?;

	let html = match client.get(&base).send().await {
		Ok(r) => match r.text().await {
			Ok(t) => t,
			Err(_) => String::new(),
		},
		Err(_) => String::new(),
	};

	let extracted_title = extract_title(&html);
	let page_title = extracted_title
		.filter(|t| !t.is_empty())
		.or(title)
		.unwrap_or_else(|| parsed.host_str().unwrap_or("untitled").to_string());
	let base_slug = slugify(&page_title);

	let webloc = webloc_bytes(&base);
	let webloc_name = write_file_unique(&lib, &base_slug, ".webloc", &webloc)?;

	let mut favicon_file = None;
	if let Some(fav_url) = extract_favicon(&html, &parsed) {
		if let Some(bytes) = download_capped(&client, &fav_url, 2 * 1024 * 1024, true).await {
			if let Ok(name) = write_file_unique(&lib, &base_slug, ".favicon.png", &bytes) {
				favicon_file = Some(name);
			}
		}
	}

	let mut image_file = None;
	if let Some(img_url) = extract_og_image(&html, &parsed) {
		if let Some(bytes) = download_capped(&client, &img_url, 12 * 1024 * 1024, true).await {
			let ext = extension_for_content(&img_url);
			if let Ok(name) = write_file_unique(&lib, &base_slug, &ext, &bytes) {
				image_file = Some(name);
			}
		}
	}

	Ok(LinkSave {
		filename: webloc_name,
		title: page_title,
		favicon_file,
		image_file,
	})
}

fn extract_title(html: &str) -> Option<String> {
	let re = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok()?;
	let m = re.captures(html)?;
	let raw = m.get(1)?.as_str().to_string();
	let stripped = Regex::new(r"(?is)<[^>]+>")
		.ok()?
		.replace_all(&raw, "")
		.to_string();
	let cleaned = html_unescape(&stripped).trim().to_string();
	if cleaned.is_empty() {
		None
	} else {
		Some(cleaned)
	}
}

fn html_unescape(s: &str) -> String {
	s.replace("&amp;", "&")
		.replace("&lt;", "<")
		.replace("&gt;", ">")
		.replace("&quot;", "\"")
		.replace("&#39;", "'")
		.replace("&nbsp;", " ")
}

fn absolute_url(base: &Url, href: &str) -> Option<String> {
	let href = href.trim();
	if href.is_empty() {
		return None;
	}
	base.join(href).ok().map(|u| u.to_string())
}

fn extract_favicon(html: &str, base: &Url) -> Option<String> {
	let link_re = Regex::new(r"(?is)<link[^>]+>").ok()?;
	let href_re = Regex::new(r#"(?is)href=["']([^"']+)["']"#).ok()?;
	let rel_re = Regex::new(r#"(?is)rel=["'][^"']*icon[^"']*["']"#).ok()?;
	for cap in link_re.captures_iter(html) {
		let tag = cap.get(0)?.as_str();
		if rel_re.is_match(tag) {
			if let Some(h) = href_re.captures(tag) {
				if let Some(u) = absolute_url(base, h.get(1)?.as_str()) {
					return Some(u);
				}
			}
		}
	}
	// Fall back to the site's root favicon.
	absolute_url(base, "/favicon.ico")
}

fn extract_og_image(html: &str, base: &Url) -> Option<String> {
	let re = Regex::new(r#"(?is)<meta[^>]+(?:property=["']og:image["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*property=["']og:image["'])"#)
		.ok()?;
	let caps = re.captures(html)?;
	let href = caps
		.get(1)
		.or_else(|| caps.get(2))
		.map(|m| m.as_str())?;
	absolute_url(base, href)
}

async fn download_capped(
	client: &reqwest::Client,
	u: &str,
	cap: u64,
	expect_image: bool,
) -> Option<Vec<u8>> {
	let resp = client.get(u).send().await.ok()?;
	if expect_image {
		let ct = resp
			.headers()
			.get(reqwest::header::CONTENT_TYPE)
			.and_then(|v| v.to_str().ok())
			.unwrap_or("");
		if !ct.starts_with("image/") {
			return None;
		}
	}
	if let Some(cl) = resp.content_length() {
		if cl > cap {
			return None;
		}
	}
	let bytes = resp.bytes().await.ok()?;
	if bytes.len() as u64 > cap {
		return None;
	}
	Some(bytes.to_vec())
}

fn extension_for_content(url: &str) -> String {
	let path = url.split('?').next().unwrap_or("");
	let ext = Path::new(path)
		.extension()
		.map(|e| e.to_string_lossy().to_lowercase())
		.unwrap_or_default();
	match ext.as_str() {
		"jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "svg" | "bmp" => format!(".{ext}"),
		_ => ".png".to_string(),
	}
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

#[tauri::command]
fn backup_now(app: AppHandle) -> Result<String, String> {
	let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
	let lib = app.state::<AppState>().library.lock().map_err(|e| e.to_string())?.clone();
	run_backup(&lib, &config_dir).map(|p| p.to_string_lossy().to_string())
}

fn run_backup(lib: &Path, config_dir: &Path) -> Result<PathBuf, String> {
	let backups_dir = config_dir.join("backups");
	fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
	let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
	let out = backups_dir.join(format!("fractalgrab-{ts}.zip"));
	let file = fs::File::create(&out).map_err(|e| e.to_string())?;
	let mut zip = zip::ZipWriter::new(file);
	let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

	fn add_dir(
		zip: &mut zip::ZipWriter<fs::File>,
		dir: &Path,
		base: &Path,
		opts: zip::write::SimpleFileOptions,
	) -> Result<(), String> {
		for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
			let entry = entry.map_err(|e| e.to_string())?;
			let path = entry.path();
			let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
			let name = rel.to_string_lossy().replace('\\', "/");
			let md = entry.metadata().map_err(|e| e.to_string())?;
			if md.is_dir() {
				add_dir(zip, &path, base, opts)?;
			} else if md.is_file() {
				let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
				zip.start_file(name, opts).map_err(|e| e.to_string())?;
				let mut buf = [0u8; 65536];
				loop {
					let n = f.read(&mut buf).map_err(|e| e.to_string())?;
					if n == 0 {
						break;
					}
					zip.write_all(&buf[..n]).map_err(|e| e.to_string())?;
				}
			}
		}
		Ok(())
	}

	add_dir(&mut zip, lib, lib, opts)?;
	let file = zip.finish().map_err(|e| e.to_string())?;
	file.sync_all().map_err(|e| e.to_string())?;

	// Keep the most recent 14 backups.
	let mut entries: Vec<(PathBuf, u64)> = fs::read_dir(&backups_dir)
		.map_err(|e| e.to_string())?
		.filter_map(|e| e.ok())
		.filter(|e| e.path().extension().map(|x| x == "zip").unwrap_or(false))
		.filter_map(|e| {
			e.metadata()
				.ok()
				.map(|m| (e.path(), m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)))
		})
		.collect();
	entries.sort_by_key(|(_, t)| *t);
	while entries.len() > 14 {
		if let Some((oldest, _)) = entries.first() {
			let _ = fs::remove_file(oldest);
		}
		entries.remove(0);
	}

	let meta_path = config_dir.join(BACKUP_META_NAME);
	let meta = serde_json::json!({
		"lastBackupAt": now_ms(),
		"lastBackupPath": out.to_string_lossy().to_string(),
	});
	let _ = fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_default());

	Ok(out)
}

fn spawn_backup_scheduler(app: AppHandle) {
	std::thread::spawn(move || {
		// One pass shortly after launch so backups happen even for short sessions.
		std::thread::sleep(Duration::from_secs(20));
		run_backup_if_due(&app);
		loop {
			std::thread::sleep(Duration::from_secs(600));
			run_backup_if_due(&app);
		}
	});
}

fn run_backup_if_due(app: &AppHandle) {
	let Ok(config_dir) = app.path().app_config_dir() else { return };
	let lib = {
		let st = app.state::<AppState>();
		let Ok(l) = st.library.lock() else { return };
		l.clone()
	};
	let manifest_path = lib.join(MANIFEST_NAME);
	let Ok(contents) = fs::read_to_string(&manifest_path) else { return };
	let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) else { return };
	let enabled = v["settings"]["backup"]["enabled"].as_bool().unwrap_or(false);
	let interval_h = v["settings"]["backup"]["intervalHours"].as_u64().unwrap_or(6);
	let meta_path = config_dir.join(BACKUP_META_NAME);
	let last = fs::read_to_string(&meta_path)
		.ok()
		.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
		.and_then(|m| m["lastBackupAt"].as_u64())
		.unwrap_or(0);
	let due = enabled && (last == 0 || now_ms().saturating_sub(last) >= interval_h * 3_600_000);
	if due {
		let _ = run_backup(&lib, &config_dir);
	}
}

#[tauri::command]
fn get_backup_meta(app: AppHandle) -> Result<Option<String>, String> {
	let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
	let meta_path = config_dir.join(BACKUP_META_NAME);
	if meta_path.exists() {
		Ok(Some(fs::read_to_string(&meta_path).map_err(|e| e.to_string())?))
	} else {
		Ok(None)
	}
}

// ---------------------------------------------------------------------------
// Extension server (localhost only)
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_extension_server(app: AppHandle, enabled: bool) -> Result<bool, String> {
	let state = app.state::<AppState>();
	let already = state.server_running.load(Ordering::SeqCst);
	if enabled && !already {
		state.server_running.store(true, Ordering::SeqCst);
		http_server::start(app.clone(), EXT_PORT);
	} else if !enabled {
		state.server_running.store(false, Ordering::SeqCst);
	}
	Ok(enabled)
}

#[tauri::command]
fn get_extension_status(state: State<'_, AppState>) -> Result<bool, String> {
	Ok(state.server_running.load(Ordering::SeqCst))
}
