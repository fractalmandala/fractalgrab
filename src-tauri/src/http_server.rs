use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{manifest_read, manifest_write, now_ms, save_link, slugify, webloc_bytes, write_file_unique, AppState};

#[derive(Deserialize)]
struct ExtSave {
	url: Option<String>,
	title: Option<String>,
	text: Option<String>,
	#[serde(default)]
	kind: Option<String>,
}

#[derive(Serialize, Clone)]
struct ExtItem {
	id: String,
	#[serde(rename = "type")]
	item_type: String,
	title: String,
	filename: String,
	url: Option<String>,
	createdAt: u64,
	updatedAt: u64,
	favourite: bool,
	collectionIds: Vec<String>,
	tags: Vec<String>,
	note: Option<String>,
	colors: Vec<String>,
	ocrText: Option<String>,
	aiTags: Vec<String>,
	faviconFile: Option<String>,
	imageFile: Option<String>,
	width: Option<u32>,
	height: Option<u32>,
}

pub fn start(app: AppHandle, port: u16) {
	std::thread::spawn(move || {
		let listener = match TcpListener::bind(("127.0.0.1", port)) {
			Ok(l) => l,
			Err(_) => return,
		};
		for stream in listener.incoming() {
			let Ok(stream) = stream else { continue };
			let app = app.clone();
			let running = app.state::<AppState>().server_running.load(Ordering::SeqCst);
			if !running {
				break;
			}
			handle_connection(stream, &app);
		}
	});
}

fn handle_connection(mut stream: TcpStream, app: &AppHandle) {
	stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
	let mut buf = Vec::new();
	let mut chunk = [0u8; 4096];
	let mut total = 0usize;
	// Read headers
	let header_end;
	loop {
		match stream.read(&mut chunk) {
			Ok(0) | Err(_) => return,
			Ok(n) => {
				buf.extend_from_slice(&chunk[..n]);
				total += n;
				if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
					header_end = pos + 4;
					break;
				}
				if total > 1_000_000 {
					return;
				}
			}
		}
	}
	let header_text = String::from_utf8_lossy(&buf[..header_end]).to_string();
	let mut lines = header_text.split("\r\n");
	let request_line = lines.next().unwrap_or("");
	let mut parts = request_line.split_whitespace();
	let method = parts.next().unwrap_or("").to_string();
	let path = parts.next().unwrap_or("").to_string();

	// Content-Length
	let mut content_length = 0usize;
	for line in lines {
		let lower = line.to_lowercase();
		if let Some(v) = lower.strip_prefix("content-length:") {
			content_length = v.trim().parse().unwrap_or(0);
		}
	}
	// Read body if needed
	let mut body = buf[header_end..].to_vec();
	while body.len() < content_length {
		match stream.read(&mut chunk) {
			Ok(0) | Err(_) => break,
			Ok(n) => body.extend_from_slice(&chunk[..n]),
		}
	}

	let cors = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n";

	let response = match (method.as_str(), path.as_str()) {
		("OPTIONS", _) => format!("HTTP/1.1 204 No Content\r\n{cors}\r\n"),
		("GET", "/ping") => json_response(&serde_json::json!({ "ok": true, "app": "fractalgrab" }), &cors),
		("POST", "/save") => {
			let payload: Result<ExtSave, _> = serde_json::from_slice(&body);
			match payload {
				Ok(save) => match save_ext_item(app, save) {
					Ok(item) => {
						let _ = app.emit(
							"fractalgrab://extension-save",
							serde_json::to_string(&item).unwrap_or_default(),
						);
						json_response(&serde_json::json!({ "ok": true, "item": item }), &cors)
					}
					Err(e) => json_response(&serde_json::json!({ "ok": false, "error": e }), &cors),
				},
				Err(e) => json_response(&serde_json::json!({ "ok": false, "error": e.to_string() }), &cors),
			}
		}
		_ => {
			format!("HTTP/1.1 404 Not Found\r\n{cors}Content-Length: 0\r\nConnection: close\r\n\r\n")
		}
	};
	let _ = stream.write_all(response.as_bytes());
	let _ = stream.flush();
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
	haystack
		.windows(needle.len())
		.position(|window| window == needle)
}

fn json_response(v: &serde_json::Value, cors: &str) -> String {
	let body = serde_json::to_string(v).unwrap_or_else(|_| "{}".into());
	format!(
		"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{cors}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
		body.len(),
		body
	)
}

fn save_ext_item(app: &AppHandle, save: ExtSave) -> Result<ExtItem, String> {
	let lib = {
		let st = app.state::<AppState>();
		let guard = st.library.lock().map_err(|e| e.to_string())?;
		guard.clone()
	};
	let id = uuid::Uuid::new_v4().to_string();
	let ts = now_ms();

	let (item_type, filename, url, title, favicon_file, image_file) =
		if save.kind.as_deref() == Some("image") {
			let Some(u) = save.url else { return Err("Image save needs a URL".into()) };
			let title = save
				.title
				.filter(|t| !t.trim().is_empty())
				.unwrap_or_else(|| "Clipped image".into());
			let bytes = download_image(&u)?;
			let ext = ext_from_url(&u);
			let name = write_file_unique(&lib, &slugify(&title), &ext, &bytes)?;
			("image".to_string(), name, Some(u), title, None, None)
		} else if let Some(u) = save.url {
			let title = save
				.title
				.filter(|t| !t.trim().is_empty())
				.unwrap_or_else(|| "Untitled link".into());
			// Fetch the page (title, favicon, og:image) exactly like an in-app
			// capture so extension-clipped links get a real thumbnail too.
			match tauri::async_runtime::block_on(save_link(app.clone(), u.clone(), Some(title.clone()))) {
				Ok(ls) => (
					"link".to_string(),
					ls.filename,
					Some(u),
					ls.title,
					ls.favicon_file,
					ls.image_file,
				),
				Err(_) => {
					// Offline / blocked page — a plain .webloc still works.
					let name = write_file_unique(&lib, &slugify(&title), ".webloc", &webloc_bytes(&u))?;
					("link".to_string(), name, Some(u), title, None, None)
				}
			}
		} else if let Some(t) = save.text {
			let title = save
				.title
				.filter(|x| !x.trim().is_empty())
				.unwrap_or_else(|| "Clipped text".into());
			let name = write_file_unique(&lib, &slugify(&title), ".md", t.as_bytes())?;
			("note".to_string(), name, None, title, None, None)
		} else {
			return Err("Nothing to save".into());
		};

	let item = ExtItem {
		id,
		item_type,
		title,
		filename,
		url,
		createdAt: ts,
		updatedAt: ts,
		favourite: false,
		collectionIds: vec![],
		tags: vec![],
		note: None,
		colors: vec![],
		ocrText: None,
		aiTags: vec![],
		faviconFile: favicon_file,
		imageFile: image_file,
		width: None,
		height: None,
	};

	// Append to the manifest via the shared cache (prevents race with webview persist).
	{
		let st = app.state::<AppState>();
		let mut manifest = manifest_read(&st).map_err(|e| e.to_string())?;
		if let Some(items) = manifest.get_mut("items").and_then(|i| i.as_array_mut()) {
			items.push(serde_json::to_value(&item).unwrap_or_default());
		}
		manifest_write(&st, manifest).map_err(|e| e.to_string())?;
	}

	Ok(item)
}

fn download_image(u: &str) -> Result<Vec<u8>, String> {
	let client = reqwest::blocking::Client::builder()
		.timeout(Duration::from_secs(20))
		.user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 FractalGrab/0.1")
		.build()
		.map_err(|e| e.to_string())?;
	let resp = client.get(u).send().map_err(|e| e.to_string())?;
	let ct = resp
		.headers()
		.get(reqwest::header::CONTENT_TYPE)
		.and_then(|v| v.to_str().ok())
		.unwrap_or("");
	if !ct.starts_with("image/") {
		return Err("Not an image".into());
	}
	let bytes = resp.bytes().map_err(|e| e.to_string())?;
	if bytes.len() > 20 * 1024 * 1024 {
		return Err("Image too large".into());
	}
	Ok(bytes.to_vec())
}

fn ext_from_url(u: &str) -> String {
	let path = u.split('?').next().unwrap_or("");
	let ext = std::path::Path::new(path)
		.extension()
		.map(|e| e.to_string_lossy().to_lowercase())
		.unwrap_or_default();
	match ext.as_str() {
		"jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "svg" | "bmp" => format!(".{ext}"),
		_ => ".png".to_string(),
	}
}

