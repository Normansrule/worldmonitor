// SPDX-License-Identifier: AGPL-3.0-only
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    terra_atlas_lib::run()
}
