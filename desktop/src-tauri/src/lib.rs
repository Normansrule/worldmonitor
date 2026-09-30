// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas desktop shell. The window loads the same static site that GitHub Pages serves
// (../../site) and opens on the 3D globe. Links to other sites open in the default browser.
//
// `fetch_text` lets the page read live feeds natively. Browsers refuse cross-site responses that lack
// CORS headers, which covers most flight trackers. A request made here in Rust isn't subject to that,
// so the desktop app gets real-time flights while the website falls back to a 10-minute snapshot.
// Only https:// requests to the data hosts listed below are allowed. The page can't use this command
// to reach arbitrary sites or your local network.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const ALLOWED_HOSTS: &[&str] = &[
    // flights
    "opensky-network.org", "api.airplanes.live", "api.adsb.lol", "opendata.adsb.fi", "api.adsbdb.com",
    // snapshots and space
    "raw.githubusercontent.com", "ll.thespacedevs.com", "celestrak.org",
    // Earth and hazards
    "earthquake.usgs.gov", "eonet.gsfc.nasa.gov", "www.gdacs.org", "services.swpc.noaa.gov", "api.open-meteo.com",
    // news, places, reference
    "api.gdeltproject.org", "en.wikipedia.org", "restcountries.com", "api.worldbank.org", "nominatim.openstreetmap.org",
    "overpass-api.de", "api.panoramax.xyz",
    // ships, cameras, crime
    "meri.digitraffic.fi", "api.tfl.gov.uk", "data.gov.hk", "cwwp2.dot.ca.gov", "data.police.uk",
    "data.cityofchicago.org", "data.cityofnewyork.us", "data.lacity.org", "data.sfgov.org",
];

struct Cache(Mutex<HashMap<String, (Instant, String)>>);
struct Http(reqwest::Client);

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.host_str().map_or(false, |h| ALLOWED_HOSTS.iter().any(|a| h == *a || h.ends_with(&format!(".{a}"))))
}

#[tauri::command]
async fn fetch_text(
    url: String,
    timeout_ms: Option<u64>,
    http: tauri::State<'_, Http>,
    cache: tauri::State<'_, Cache>,
) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("bad URL: {e}"))?;
    if !allowed(&parsed) {
        return Err(format!("{} is not on the desktop app's data-host list", parsed.host_str().unwrap_or("?")));
    }
    // Several layers can ask for the same URL within a moment of each other; answer those from memory.
    if let Some((t, body)) = cache.0.lock().unwrap().get(&url) {
        if t.elapsed() < Duration::from_secs(5) {
            return Ok(body.clone());
        }
    }
    let res = http
        .0
        .get(parsed)
        .timeout(Duration::from_millis(timeout_ms.unwrap_or(20_000).clamp(1_000, 90_000)))
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "timed out".to_string() } else { e.to_string() })?;
    let status = res.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    let mut c = cache.0.lock().unwrap();
    if c.len() > 256 {
        c.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(5));
    }
    c.insert(url, (Instant::now(), body.clone()));
    Ok(body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .user_agent(concat!("TerraAtlas-Desktop/", env!("CARGO_PKG_VERSION"), " (+https://github.com/Normansrule/worldmonitor)"))
        .gzip(true)
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("HTTP client");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Http(client))
        .manage(Cache(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![fetch_text])
        .run(tauri::generate_context!())
        .expect("error while running Terra Atlas");
}

#[cfg(test)]
mod tests {
    use super::allowed;
    fn ok(u: &str) -> bool { allowed(&reqwest::Url::parse(u).unwrap()) }
    #[test]
    fn allowlist() {
        assert!(ok("https://opensky-network.org/api/states/all"));
        assert!(ok("https://raw.githubusercontent.com/Normansrule/worldmonitor/live-data/flights.json"));
        assert!(!ok("http://opensky-network.org/api/states/all"), "plain http is refused");
        assert!(!ok("https://evil-opensky-network.org/"), "look-alike hosts are refused");
        assert!(!ok("https://opensky-network.org.evil.com/"), "suffix tricks are refused");
        assert!(!ok("https://127.0.0.1/"), "local network is refused");
        assert!(!ok("https://localhost:8080/"));
    }
}
