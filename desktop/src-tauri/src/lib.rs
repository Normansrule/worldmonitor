// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas desktop shell. The window loads the same static site that GitHub Pages serves
// (../../site), opening on the 3D globe. Links to other sites open in the default browser.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Terra Atlas");
}
