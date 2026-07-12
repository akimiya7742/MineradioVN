// ====================================================================
//  粒子音乐可视化播放器 — Server v2 (YouTube Edition)
//  - Provider: YouTube (via yt-dlp)
//  - Functions: Search, Stream URL, Basic Metadata
// ====================================================================
/*
 * Modified by akimiya7742 on 04/07/2026
 * Original work Copyright (C) 2026 XxHuberrr
*/
const http = require('http');
const DiscordRPC = require('discord-rpc');
const https = require('https');
const dns = require('dns');
const ua = require('user-agents');
const fs = require('fs');
const { Innertube } = require("youtubei.js");
const os = require('os');
const { chromium } = require('playwright'); // Thay cho puppeteer[cite: 1]
const path = require('path');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
require('dotenv').config();
let userName = null;
let avatarUrl = null;
let loggedIn = false;
let cookiestring = null;
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.svg': 'image/svg+xml',
};
let innertube = null;
let fetchedrecommenddata = null;
const USER_DATA_PATH = process.env.APPDATA || (process.platform == 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
const clientId = process.env.CLIENT_ID || "1524089827291562094";
function updateDiscordPresence(data) {
    if (!rpcReady) return;
    const startTimestamp = Date.now();
    const endTimestamp = data.duration ? startTimestamp + (data.duration * 1000 - (data.currentTime * 1000)) : undefined;
	let payload = {
        details: data.title,
        state: `${data.artist}`,
        startTimestamp: data.paused ? undefined : startTimestamp,
        endTimestamp: data.paused ? undefined : endTimestamp,
        largeImageKey: data.cover,
        largeImageText: data.title,
        smallImageKey: data.paused ? 'https://cdn-icons-png.flaticon.com/512/16/16427.png' : 'https://cdn-icons-png.flaticon.com/512/16/16630.png',
        smallImageText: data.paused ? 'Paused' : 'Playing',
        instance: false,
		type: 2,
	}
	if (data.id) {
		payload.buttons = [
			{ label: "Listen now", url: data.externalUrl || (data.provider === 'spt' ? `https://open.spotify.com/track/${data.id}` : `https://music.youtube.com/watch?v=${data.id}`) }
		]
	}
    rpc.setActivity(payload);
}
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
let rpcReady = false;
rpc.on('ready', () => {
    console.log('[Discord] Rich Presence đã sẵn sàng!');
    rpcReady = true;
});
const APP_DATA_DIR = path.join(USER_DATA_PATH, 'Mineradio');
const SPOTIFY_CONFIG_FILE = path.join(APP_DATA_DIR, 'spotify_config.json');
const SPOTIFY_TOKEN_FILE = path.join(APP_DATA_DIR, 'spotify_tokens.json');
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/spotify/callback`;
const SPOTIFY_SCOPES = [
	'streaming',
	'user-read-private',
	'user-read-email',
	'user-read-playback-state',
	'user-read-currently-playing',
	'user-modify-playback-state',
	'playlist-read-private',
	'user-library-read'
].join(' ');
let spotifyOAuthAttempt = null;
const COOKIE_FILE_PATH = path.join(APP_DATA_DIR, 'youtube_cookies.txt');
const JSON_COOKIE = path.join(APP_DATA_DIR, 'youtube_cookies.json');
const SAVED_USER_AGENT = path.join(APP_DATA_DIR, 'user_agent.txt');
if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });

function readPrivateJson(filePath, fallback) {
	try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
	catch (_) { return fallback; }
}

function writePrivateJson(filePath, value) {
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
}

function spotifyClientConfig() {
	const saved = readPrivateJson(SPOTIFY_CONFIG_FILE, {});
	return {
		clientId: String(process.env.SPOTIFY_CLIENT_ID || saved.clientId || '').trim(),
		redirectUri: SPOTIFY_REDIRECT_URI
	};
}

function base64Url(buffer) {
	return Buffer.from(buffer).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function spotifyErrorMessage(payload, fallback) {
	return (payload && payload.error && (payload.error.message || payload.error_description || payload.error)) ||
		(payload && payload.error_description) || fallback;
}

async function exchangeSpotifyToken(params) {
	const config = spotifyClientConfig();
	if (!config.clientId) throw new Error('SPOTIFY_CLIENT_ID_REQUIRED');
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(Object.assign({ client_id: config.clientId }, params))
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(spotifyErrorMessage(payload, `SPOTIFY_TOKEN_${response.status}`));
	return payload;
}

async function getSpotifyAccessToken() {
	let tokens = readPrivateJson(SPOTIFY_TOKEN_FILE, null);
	if (!tokens || !tokens.access_token) throw new Error('SPOTIFY_LOGIN_REQUIRED');
	if (Number(tokens.expires_at || 0) > Date.now() + 60000) return tokens.access_token;
	if (!tokens.refresh_token) throw new Error('SPOTIFY_LOGIN_REQUIRED');
	let refreshed;
	try {
		refreshed = await exchangeSpotifyToken({
			grant_type: 'refresh_token',
			refresh_token: tokens.refresh_token
		});
	} catch (error) {
		if (/invalid_grant/i.test(String(error && error.message || ''))) {
			if (fs.existsSync(SPOTIFY_TOKEN_FILE)) fs.unlinkSync(SPOTIFY_TOKEN_FILE);
			throw new Error('SPOTIFY_REAUTH_REQUIRED');
		}
		throw error;
	}
	tokens = Object.assign({}, tokens, refreshed, {
		refresh_token: refreshed.refresh_token || tokens.refresh_token,
		expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000
	});
	writePrivateJson(SPOTIFY_TOKEN_FILE, tokens);
	return tokens.access_token;
}

async function spotifyApi(pathname, options) {
	const token = await getSpotifyAccessToken();
	const response = await fetch(`https://api.spotify.com/v1${pathname}`, Object.assign({}, options, {
		headers: Object.assign({}, options && options.headers, { Authorization: `Bearer ${token}` })
	}));
	if (response.status === 204) return null;
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(spotifyErrorMessage(payload, `SPOTIFY_API_${response.status}`));
		error.statusCode = response.status;
		throw error;
	}
	return payload;
}

function spotifyTrackToSong(track) {
	const images = track && track.album && Array.isArray(track.album.images) ? track.album.images : [];
	return {
		id: track.id,
		uri: track.uri || `spotify:track:${track.id}`,
		name: track.name || '',
		artist: Array.isArray(track.artists) ? track.artists.map((artist) => artist.name).filter(Boolean).join(', ') : '',
		artistId: track.artists && track.artists[0] ? track.artists[0].id : null,
		album: track.album ? track.album.name : '',
		cover: images[0] ? images[0].url : '',
		duration: Number(track.duration_ms || 0),
		explicit: !!track.explicit,
		playable: track.is_playable !== false,
		provider: 'spt',
		source: 'spt',
		type: 'spt'
	};
}
// Bắt các Uncaught Exception (Ngoại lệ không được bắt)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Ghi log lỗi vào hệ thống (ví dụ: Sentry, Winston)
  // Sau đó thoát ứng dụng một cách an toàn
  process.exit(1);
});

// Bắt các Unhandled Promise Rejection (Promise bị từ chối không được bắt)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Có thể không cần exit(1) ngay nhưng nên có log để theo dõi
});

let recommenddata = [];
let UA = '';
if (fs.existsSync(SAVED_USER_AGENT)) {
	UA = fs.readFileSync(SAVED_USER_AGENT, 'utf-8');
} else {
	const userAgent = new ua({
		deviceCategory: 'desktop',
	});
	UA = userAgent.toString();
	fs.writeFileSync(SAVED_USER_AGENT, UA);
}

async function updateYtdlpSmart() {
    console.log("🔄 Đang kiểm tra cách cập nhật tối ưu cho yt-dlp...");
	try {
        // Lấy version hiện tại và convert sang string
        const curr = execSync('yt-dlp --version', { stdio: 'pipe' }).toString().trim();
        
        const res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
            headers: { 'User-Agent': 'Node.js-App' }
        });
        const data = await res.json();
        const latest = data.tag_name; // Format: 2026.07.05

        // So sánh theo dạng số YYYYMMDD để đảm bảo chính xác nhất
        const v1 = parseInt(curr.replace(/\./g, ''));
        const v2 = parseInt(latest.replace(/\./g, ''));

        if (v1 >= v2) {
            console.log("✅ yt-dlp đã là bản mới nhất.");
            return { success: true, status: "already_updated" };
        }
    } catch (e) {
        console.log("⚠️ Không kiểm tra được phiên bản hoặc yt-dlp chưa cài đặt.");
    }
    // Thử cập nhật bằng lệnh build-in trước (-U)
    try {
        console.log("🚀 Thử cập nhật trực tiếp bằng lệnh `yt-dlp -U`...");
        // Nếu là Linux/Mac, có thể cần pkexec/sudo để ghi đè file binary trực tiếp
        const prefix = process.platform !== 'win32' ? 'pkexec ' : '';
        
        // Chạy lệnh update gốc của yt-dlp
        execSync(`${prefix}yt-dlp -U`, { stdio: 'inherit' });
        console.log("🎉 Cập nhật thành công bằng lệnh chính chủ của yt-dlp!");
        return { success: true }
    } catch (error) {
        console.log("⚠️ Lệnh `yt-dlp -U` bị chặn hoặc thất bại (Khả năng cao do Package Manager quản lý).");
        console.log("🔄 Đang chuyển hướng sang cập nhật qua Package Manager của hệ thống...");
    }

    // --- FALLBACK: Khu vực chạy các lệnh Package Manager cũ nếu lệnh -U thất bại ---
    let pm = "";
    if (process.platform === 'win32') {
        pm = "winget"; // Mặc định trên Windows hiện đại
    } else {
        // Kiểm tra các package manager trên Unix
        const checkCmd = (cmd) => {
            try { execSync(`which ${cmd} 2>/dev/null`); return true; } catch { return false; }
        };

        if (checkCmd('brew')) pm = 'brew';
        else if (checkCmd('apt-get')) pm = 'apt';
        else if (checkCmd('pacman')) pm = 'pacman';
        else if (checkCmd('dnf')) pm = 'dnf';
        else if (checkCmd('pip3') || checkCmd('pip')) pm = 'pip';
    }

    if (!pm) {
        throw new Error("⛔ Không tìm thấy trình quản lý gói nào phù hợp (hỗ trợ winget, brew, apt, pacman, dnf, pip).");
    }
    let command = "";
    const rootPrefix = (pm !== 'brew' && pm !== 'winget') ? "pkexec " : "";

    switch (pm) {
        case 'winget': command = "winget install yt-dlp ffmpeg"; break;
        case 'brew': command = "brew install yt-dlp ffmpeg"; break;
		case 'apt': command = `${rootPrefix}bash -c "apt-get update && apt-get install -y ffmpeg curl && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp"`; break;
        case 'pacman': command = `${rootPrefix}pacman -Sy --noconfirm yt-dlp ffmpeg`; break;
		case 'dnf': command = `${rootPrefix}bash -c "dnf swap 'ffmpeg-free' 'ffmpeg' --allowerasing -y && dnf install -y yt-dlp"`; break;
        case 'pip': command = `${rootPrefix}pip3 install --upgrade --break-system-packages yt-dlp`; break;
    }

    try {
        console.log(`💻 Đang chạy lệnh package manager: ${command}`);
        execSync(command, { stdio: 'inherit' });
        console.log("🎉 Đã cập nhật xong qua Package Manager!");
		return { success: true }
    } catch (err) {
        console.error("💥 Thất bại hoàn toàn:", err.message);
		return { success: false, error: err.message }
    }
}
function getBrowsersDir() {
	// Kiểm tra xem app có đang được đóng gói hay không (isPackaged)
	const execName = path.basename(process.execPath).toLowerCase();
	const isPackaged = execName && execName !== 'node' && execName !== 'node.exe' && execName !== 'electron.exe' && execName !== 'electron';

	if (isPackaged) {
		// Môi trường Prod: Dùng process.resourcesPath
		return path.join(process.resourcesPath, 'browsers');
	} else {
		// Môi trường Dev: Dùng thư mục trong dự án của bạn
		// Vì project của bạn để ở 'resources/browsers'
		return path.join(__dirname, 'resources', 'browsers');
	}
}
function getNode() {
	try {
		const cmd = process.platform === 'win32' ? 'where node' : 'bash -c \"which node\"';
		return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		return null;
	}
}
function getPlaywrightExecutable() {
	// Trỏ tới thư mục extraResources
	const browsersDir = getBrowsersDir();

	// Tìm thư mục con bắt đầu bằng 'chromium-'
	const chromiumDir = fs.readdirSync(browsersDir)
		.find(dir => dir.startsWith('chromium-'));

	if (!chromiumDir) return null;

	// Đường dẫn tùy theo hệ điều hành
	if (process.platform === 'win32') {
		return path.join(browsersDir, chromiumDir, 'chrome-win64', 'chrome.exe');
	} else if (process.platform === 'linux') {
		return path.join(browsersDir, chromiumDir, 'chrome-linux64', 'chrome');
	} else if (process.platform === 'darwin') {
		return path.join(browsersDir, chromiumDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
	}
	return null;
}
/**
 * Chuyển đổi JSON cookies từ Puppeteer sang định dạng Netscape (cookie.txt)
 */
function jsontoNetscape(cookies) {
	let netscapeContent = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This is a generated file! Do not edit.\n\n";

	for (const cookie of cookies) {
		const domain = cookie.domain;
		const includeSubdomains = domain.startsWith('.') ? "TRUE" : "FALSE";
		const path = cookie.path;
		const secure = cookie.secure ? "TRUE" : "FALSE";

		// FIX: Nếu expires là -1 hoặc null, đặt về 0
		let expires = 0;
		if (typeof cookie.expires === 'number' && cookie.expires > 0) {
			expires = Math.round(cookie.expires);
		}

		const name = cookie.name;
		const value = cookie.value;

		netscapeContent += `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expires}\t${name}\t${value}\n`;
	}
	return netscapeContent;
}
function parseNetscapeCookies(filePath) {
	const result = [];
	try {
		if (!fs.existsSync(filePath)) return '';
		const content = fs.readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');

		for (const line of lines) {
			// Bỏ qua comment hoặc dòng trống
			if (!line.trim() || line.startsWith('#')) continue;

			const parts = line.split(/\s+/);
			if (parts.length >= 7) {
				const domain = parts[0];
				const cookieName = parts[5];
				const cookieValue = parts[6];

				// Check đúng domain youtube và đúng tên cookie
				if (domain.includes('youtube.com')) {
					result.push(`${cookieName}=${cookieValue}`);
				}
			}
		}
		return result.join("; ")
	} catch (e) {
		console.error('[Cookie Parse Error]', e);
		return '';
	}
}
/**
 * Khởi tạo Innertube với cookie nếu có sẵn
 */

async function initInnertube() {
	cookiestring = parseNetscapeCookies(COOKIE_FILE_PATH);
	if (cookiestring) {
		console.log('[System] Found saved cookie.txt, logging in...');
		innertube = await Innertube.create({ cookie: cookiestring });
		loggedIn = true;
	} else {
		innertube = await Innertube.create({ cookie: null });
	}
}

// Gọi khởi tạo khi server chạy
initInnertube().then(() => {
	if (process.env.NODE_ENV == 'development') console.log("[Auth Status]", loggedIn);
});
// ---------- YouTube Logic (yt-dlp) ----------

/**
 * Executes yt-dlp commands and returns JSON
 */
async function runYtDlp(args) {
	try {
		let command = `yt-dlp --no-warnings --ignore-errors `;
		const node = getNode();
		if (node) command += `--js-runtimes \"node:${node}\" --remote-components ejs:github `;
		command += args;
		console.log(`[yt-dlp] Running command: ${command}`)
		const { stdout } = await execAsync(command);
		return stdout;
	} catch (e) {
		console.error('[yt-dlp Error]', e.message);
		return null;
	}
}

/**
 * Hàm tổng hợp: Sạch rác + Khử trùng Artist + Chuẩn hóa chữ
 */
function cleanAndNormalizeYoutubeTitle(title) {
	if (!title) return '';

	// Lưu ý: dùng cờ 'u' (unicode) để \p{L} hoạt động
	let cleaned = title.toLowerCase();

	// 1. Diệt metadata
	const patternsToRemove = [
		/\[\s*(official|mv|video|audio|lyrics|lyric|visualizer|ost|music video|4k|hd|sub\s*viet|vietsub|karaoke|live|performance)\s*\]/gi,
		/\(\s*(official|mv|video|audio|lyrics|lyric|visualizer|ost|music video|4k|hd|sub\s*viet|vietsub|karaoke|live|performance)\s*\)/gi,
		/\b(official mv|official video|official audio|music video|lyrics video|lyric video|audio|lyrics|visualizer|official|channel)\b/gi
	];
	patternsToRemove.forEach(pattern => cleaned = cleaned.replace(pattern, ''));

	// 2. GIẢI PHÁP FIX LỖI: Sử dụng \p{L} để giữ lại chữ cái (bao gồm tiếng Việt)
	// Thay vì \w, ta dùng [\p{L}\p{N}\s\-\|] (L: Letter, N: Number)
	cleaned = cleaned.replace(/[^\p{L}\p{N}\s\-\|]/gu, '');

	cleaned = cleaned.replace(/\s*\|\s*/g, ' - ');
	cleaned = cleaned.replace(/\s+/g, ' ').trim();

	// 3. XỬ LÝ TRÙNG LẶP ARTIST
	let parts = cleaned.split('-').map(p => p.trim()).filter(Boolean);

	if (parts.length >= 2) {
		const artist = parts[0];
		parts = parts.map((part, index) => {
			if (index === 0) return part;
			if (part === artist || part.includes(artist) || artist.includes(part)) {
				let customClean = part.replace(artist, '').trim();
				return customClean;
			}
			return part;
		}).filter(Boolean);
	}

	let finalResult = parts.map(part => part).join(' - ');
	patternsToRemove.forEach(pattern => finalResult = finalResult.replace(pattern, ''));
	return finalResult.replace(/^-+|-+$/g, '').trim();
}
/**
 * Search YouTube
 */
async function handleSearch(keywords, limit = 20) {
	console.log('[YouTube Search]', keywords);
	if (!innertube) innertube = await Innertube.create();
	const res = await innertube.music.search(keywords, { type: 'song' }, limit);
	if (!res || !res.songs || !res.songs.contents || res.songs.contents.length === 0) return [];
	const songs = res.songs.contents;
	return songs.map(item => {
		return {
			id: item.id,
			name: item.title,
			artist: item.artists.map(artist => artist.name).join(', ') || "Unknown",
			artistId: item.artists[0]?.channel_id || null,
			album: item.album?.name || 'YouTube Video',
			cover: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
			duration: (item.duration?.seconds || 0),
			url: `https://www.youtube.com/watch?v=${item.id}`,
			provider: 'youtube'
		};
	});
}

/**
 * Get direct Audio Stream URL
 */
async function handleGetUrl(id) {	
	console.log('[YouTube URL Discovery]', id);

	// Kiểm tra xem file cookie có tồn tại không để truyền vào yt-dlp
	let cookieArg = '';
	if (fs.existsSync(COOKIE_FILE_PATH)) {
		cookieArg = `--cookies "${COOKIE_FILE_PATH}"`;
	}

	const args = `-f "ba/b/best" ${cookieArg} -g "https://music.youtube.com/watch?v=${id}"`;
	const url = await runYtDlp(args);

	if (!url) return { url: null, error: 'COULD_NOT_EXTRACT_URL' };

	return {
		url: url.trim(),
		playable: true,
		provider: 'youtube',
		level: 'standard',
		quality: 'Best Audio'
	};
}
async function autoScroll(page, maxTimeMs = 5000) {
	await page.evaluate(async (maxTime) => {
		await new Promise((resolve) => {
			let totalHeight = 0;
			const distance = 100;
			const startTime = performance.now(); // Ghi lại thời điểm bắt đầu cuộn

			const timer = setInterval(() => {
				const scrollHeight = document.body.scrollHeight;
				window.scrollBy(0, distance);
				totalHeight += distance;

				const elapsedTime = performance.now() - startTime; // Tính thời gian đã chạy

				// Dừng nếu đã cuộn hết trang HOẶC đã quá giới hạn thời gian
				if (totalHeight >= scrollHeight || elapsedTime >= maxTime) {
					clearInterval(timer);
					resolve();
				}
			}, 100);
		});
	}, maxTimeMs); // Truyền tham số thời gian từ Playwright vào trình duyệt
}

/**
 * Fetch Video Details
 */
async function handleGetDetail(id) {
	let args = '';
	if (fs.existsSync(COOKIE_FILE_PATH)) {
		args+=`--cookies ${COOKIE_FILE_PATH} `
	}
	args+=`--skip-download --dump-json https://music.youtube.com/watch?v=${id}`;
	const output = await runYtDlp(args);
	const outputjson = JSON.parse(output);
	return {
		id: outputjson.id,
		name: outputjson.title,
		artist: outputjson.artists.join(', ') || "Unknown",
		cover: `https://i.ytimg.com/vi/${outputjson.id}/maxresdefault.jpg`,
		duration: outputjson.duration,
		album: outputjson.album || "Unknown"
	}
}

// ---------- Server Utils ----------

function sendJSON(res, data, status = 200) {
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Access-Control-Allow-Origin': '*',
	});
	res.end(JSON.stringify(data));
}
async function getRecommendedTracks(brow = null, pge = null) {
	if (!innertube) innertube = await Innertube.create();
	if (!fs.existsSync(JSON_COOKIE)) return [];
	const cookies = JSON.parse(fs.readFileSync(JSON_COOKIE, 'utf-8')).cookies;
	if (!cookies) return [];
	if (recommenddata.length == 0) {
		if (brow && brow != null && pge && pge != null) {
			const browser = brow, page = pge;
			await browser.newContext({ userAgent: UA });

			// 3. Truy cập YouTube Music
			await page.goto('https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F', { waitUntil: 'networkidle' });
			if (!avatarUrl || !userName) {
				await page.click('ytmusic-settings-button'); 

				// Đợi menu xuất hiện hẳn rồi mới lấy
				await page.waitForSelector('ytmusic-multi-page-menu-renderer', { state: 'visible' });

				// Lưu kết quả vào biến tạm từ hàm evaluate
				const data = await page.evaluate(() => {
					// Tìm element account-name
					const nameElement = document.querySelector('yt-formatted-string#account-name');
					// Tìm element ảnh avatar
					const imgElement = document.querySelector('yt-img-shadow img');

					return {
						name: nameElement ? nameElement.title.trim() : null,
						img: imgElement ? imgElement.getAttribute('src') : null
					};
				});

				// Cập nhật vào biến của bác
				userName = data.name;
				avatarUrl = data.img;

				await page.keyboard.press('Escape'); 
				// Đợi menu đóng hẳn để tránh lỗi click sau này
				await page.waitForSelector('ytmusic-multi-page-menu-renderer', { state: 'hidden' });
			}
			await autoScroll(page);
			// 4. Scrap phần "Chọn nhanh đài phát" (Giống logic bạn đã hỏi ở trên)
			const data = await page.evaluate(() => {
				const carousel = Array.from(document.querySelectorAll('ytmusic-carousel-shelf-renderer'))
					.find(el => (el.innerText.includes('Quick picks') || el.innerText.includes('Chọn nhanh đài phát')));

				if (!carousel) return [];

				// Lấy danh sách item
				const items = Array.from(carousel.querySelectorAll('ytmusic-responsive-list-item-renderer'));

				return items.map(item => {
					const linkEl = item.querySelector('a.yt-simple-endpoint');
					const href = linkEl ? linkEl.getAttribute('href') : '';
					const urlParams = new URLSearchParams(href.split('?')[1]);

					return {
						title: item.querySelector('.title')?.innerText,
						id: urlParams.get('v'), // ID video
						list: urlParams.get('list') // ID list
					};
				});
			});
			recommenddata = data;
			await browser.close();
		} else {
			const browser = await chromium.launch({
				headless: false,
				executablePath: getPlaywrightExecutable(),
				args: [
					'--disable-blink-features=AutomationControlled',
					'--no-sandbox',
					'--disable-web-security',
					'--disable-infobars',
					'--disable-extensions',
					'--disable-setuid-sandbox',
        			'--disable-infobars',
					'--start-maximized',
					'--window-size=1280,720'
				]
			}); // Có thể để false để debug
			const context = await browser.newContext({ userAgent: UA });
			const page = await context.newPage();
			await context.addCookies(cookies);
			await page.goto('https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F', { waitUntil: 'networkidle' });
			if (!avatarUrl || !userName) {
				await page.click('ytmusic-settings-button'); 
				
				// Đợi menu xuất hiện hẳn rồi mới lấy
				await page.waitForSelector('ytmusic-multi-page-menu-renderer', { state: 'visible' });

				// Lưu kết quả vào biến tạm từ hàm evaluate
				const data = await page.evaluate(() => {
					// Tìm element account-name
					const nameElement = document.querySelector('yt-formatted-string#account-name');
					// Tìm element ảnh avatar
					const imgElement = document.querySelector('yt-img-shadow img');
					
					return {
						name: nameElement ? nameElement.title.trim() : null,
						img: imgElement ? imgElement.getAttribute('src') : null
					};
				});

				// Cập nhật vào biến của bác
				userName = data.name;
				avatarUrl = data.img;

				await page.keyboard.press('Escape'); 
				// Đợi menu đóng hẳn để tránh lỗi click sau này
				await page.waitForSelector('ytmusic-multi-page-menu-renderer', { state: 'hidden' });
			}
			await autoScroll(page); // Cuộn xuống để load hết nội dung
			const data = await page.evaluate(() => {
				const carousel = Array.from(document.querySelectorAll('ytmusic-carousel-shelf-renderer'))
					.find(el => (el.innerText.includes('Quick picks') || el.innerText.includes('Chọn nhanh đài phát')));

				if (!carousel) return [];

				// Lấy danh sách item
				const items = Array.from(carousel.querySelectorAll('ytmusic-responsive-list-item-renderer'));

				return items.map(item => {
					const linkEl = item.querySelector('a.yt-simple-endpoint');
					const href = linkEl ? linkEl.getAttribute('href') : '';
					const urlParams = new URLSearchParams(href.split('?')[1]);

					return {
						title: item.querySelector('.title')?.innerText,
						id: urlParams.get('v'), // ID video
						list: urlParams.get('list') // ID list
					};
				});
			});
			recommenddata = data;
			await browser.close();
		}
	}
	let tracks = [];
	const trackPromises = recommenddata.map(async (item) => {
		try {
			const trackInfo = await innertube.music.getInfo(item.id);
			const artist = trackInfo.basic_info.author || 'Unknown';
			const album = trackInfo.album?.name || 'Unknown Album';
			const thumb = trackInfo.basic_info.thumbnail[0].url;
			const duration = trackInfo.basic_info.duration * 1000;

			return {
				id: trackInfo.basic_info.id,
				title: trackInfo.basic_info.title || '',
				artist: artist,
				album: album,
				cover: thumb,
				duration: duration,
				url: `https://youtube.com/watch?v=${item.id}`
			};
		} catch (error) {
			console.error(`Failed to get track info for ${item.id}:`, error.message);
			return null; // Trả về null nếu lỗi để tí nữa lọc bỏ
		}
	});

	// Chờ tất cả các Promise hoàn thành
	const resolvedTracks = await Promise.all(trackPromises);

	// Lọc bỏ những bài bị lỗi (null)
	tracks = resolvedTracks.filter(track => track !== null);
	fetchedrecommenddata = {tracks,userName, avatarUrl};
	return {tracks,userName, avatarUrl};
}
function serveStatic(res, filePath) {
	const ext = path.extname(filePath);
	fs.readFile(filePath, (err, data) => {
		if (err) { res.writeHead(404); res.end('Not Found'); return; }
		res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
		res.end(data);
	});
}

// ---------- Router ----------
/**
 * Searches LRCLIB and picks the first result
 * @param {string} query - The search string (e.g., "Artist - Title")
 */
async function searchLrcLib(query) {
	try {
		const url = new URL('https://lrclib.net/api/search');
		url.searchParams.set('q', query);

		console.log(`[LRCLIB Search] Querying: ${query}`);
		const response = await fetch(url, {
			headers: { 'User-Agent': 'MineradioVisualizer/1.0' }
		});

		if (!response.ok) return null;
		const results = await response.json();

		// Return index 0 of the array if it exists
		if (Array.isArray(results) && results.length > 0) {
			console.log(`[LRCLIB Search] Match found: ${results[0].artistName} - ${results[0].trackName}`);
			return results[0];
		}

		return null;
	} catch (e) {
		console.error('[LRCLIB Search Error]', e.message);
		return null;
	}
}
function checkInternet() {
	return new Promise((resolve) => {
		let resolved = false;
		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve(false);
			}
		}, 2500);

		dns.lookup('google.com', (err) => {
			clearTimeout(timer);
			if (!resolved) {
				resolved = true;
				resolve(!err);
			}
		});
	});
}

rpc.login({ clientId }).catch(console.error);
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	res.setHeader('Access-Control-Allow-Origin', '*'); // Cho phép mọi nguồn (hoặc thay bằng 'http://127.0.0.1:3000')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
	res.setHeader('Access-Control-Allow-Credentials', true);

	// 2. Xử lý preflight request (OPTIONS) - rất quan trọng
	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}
	const pn = url.pathname;
	const remoteAddress = String(req.socket && req.socket.remoteAddress || '');
	const isLoopbackRequest = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
	const queryString = url.searchParams.toString();
	if (process.env.NODE_ENV == 'development') {
		if (queryString) {
			console.log(`[Debug] Route called: ${pn}?${queryString}`);
		} else {
			console.log(`[Debug] Route called: ${pn}`);
		}
	}
	// Ping API
	if (pn === '/api/ping') {
		try {
			const online = await checkInternet();
			sendJSON(res, { online });
		} catch (err) {
			sendJSON(res, { online: false, error: err.message }, 500);
		}
		return;
	}

	// Spotify OAuth + Web API. Sensitive routes are intentionally loopback-only.
	if (pn.startsWith('/api/spotify/')) {
		if (!isLoopbackRequest) return sendJSON(res, { error: 'LOCAL_REQUEST_REQUIRED' }, 403);
		if (pn === '/api/spotify/config') {
			if (req.method === 'POST') {
				let raw = '';
				for await (const chunk of req) {
					raw += chunk;
					if (raw.length > 16384) return sendJSON(res, { error: 'REQUEST_TOO_LARGE' }, 413);
				}
				try {
					const body = JSON.parse(raw || '{}');
					const clientId = String(body.clientId || '').trim();
					if (clientId && !/^[A-Za-z0-9]{16,128}$/.test(clientId)) return sendJSON(res, { error: 'INVALID_CLIENT_ID' }, 400);
					writePrivateJson(SPOTIFY_CONFIG_FILE, { clientId });
					if (fs.existsSync(SPOTIFY_TOKEN_FILE)) fs.unlinkSync(SPOTIFY_TOKEN_FILE);
					return sendJSON(res, { success: true, configured: !!clientId, redirectUri: SPOTIFY_REDIRECT_URI });
				} catch (error) {
					return sendJSON(res, { error: 'INVALID_JSON' }, 400);
				}
			}
			const config = spotifyClientConfig();
			return sendJSON(res, { configured: !!config.clientId, clientId: config.clientId, redirectUri: config.redirectUri });
		}
		if (pn === '/api/spotify/login') {
			const config = spotifyClientConfig();
			if (!config.clientId) return sendJSON(res, { error: 'SPOTIFY_CLIENT_ID_REQUIRED', redirectUri: config.redirectUri }, 400);
			const verifier = base64Url(crypto.randomBytes(64));
			const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
			const state = base64Url(crypto.randomBytes(24));
			spotifyOAuthAttempt = { verifier, state, createdAt: Date.now() };
			const authorize = new URL('https://accounts.spotify.com/authorize');
			authorize.search = new URLSearchParams({
				client_id: config.clientId,
				response_type: 'code',
				redirect_uri: config.redirectUri,
				scope: SPOTIFY_SCOPES,
				state,
				code_challenge_method: 'S256',
				code_challenge: challenge
			}).toString();
			res.writeHead(302, { Location: authorize.toString(), 'Cache-Control': 'no-store' });
			res.end();
			return;
		}
		if (pn === '/api/spotify/callback') {
			try {
				const attempt = spotifyOAuthAttempt;
				spotifyOAuthAttempt = null;
				if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error'));
				if (!attempt || Date.now() - attempt.createdAt > 10 * 60 * 1000 || url.searchParams.get('state') !== attempt.state) {
					throw new Error('SPOTIFY_OAUTH_STATE_INVALID');
				}
				const code = url.searchParams.get('code');
				if (!code) throw new Error('SPOTIFY_AUTH_CODE_MISSING');
				const tokens = await exchangeSpotifyToken({
					grant_type: 'authorization_code',
					code,
					redirect_uri: SPOTIFY_REDIRECT_URI,
					code_verifier: attempt.verifier
				});
				tokens.expires_at = Date.now() + Number(tokens.expires_in || 3600) * 1000;
				tokens.authorized_at = Date.now();
				writePrivateJson(SPOTIFY_TOKEN_FILE, tokens);
				res.writeHead(302, { Location: '/api/spotify/login/complete?status=success', 'Cache-Control': 'no-store' });
				res.end();
			} catch (error) {
				res.writeHead(302, { Location: `/api/spotify/login/complete?status=error&message=${encodeURIComponent(error.message)}`, 'Cache-Control': 'no-store' });
				res.end();
			}
			return;
		}
		if (pn === '/api/spotify/login/complete') {
			const ok = url.searchParams.get('status') === 'success';
			const message = ok ? 'Spotify đã kết nối với Mineradio.' : (url.searchParams.get('message') || 'Spotify login failed');
			res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
			res.end(`<!doctype html><meta charset="utf-8"><title>${ok ? 'Spotify connected' : 'Spotify error'}</title><style>html{color-scheme:dark;font-family:system-ui;background:#0d0f0e;color:#fff}body{display:grid;place-items:center;min-height:90vh}.card{padding:28px 32px;border:1px solid #ffffff24;border-radius:18px;background:#ffffff0a;max-width:440px}b{color:#1ed760}</style><div class="card"><b>${ok ? 'Connected' : 'Unable to connect'}</b><p>${String(message).replace(/[<>&"]/g, '')}</p><small>You can close this window</small></div>`);
			return;
		}
		if (pn === '/api/spotify/logout') {
			if (fs.existsSync(SPOTIFY_TOKEN_FILE)) fs.unlinkSync(SPOTIFY_TOKEN_FILE);
			return sendJSON(res, { success: true });
		}
		if (pn === '/api/spotify/token') {
			try { return sendJSON(res, { accessToken: await getSpotifyAccessToken(), expiresAt: readPrivateJson(SPOTIFY_TOKEN_FILE, {}).expires_at || 0 }); }
			catch (error) { return sendJSON(res, { error: error.message }, error.message === 'SPOTIFY_LOGIN_REQUIRED' ? 401 : 500); }
		}
		if (pn === '/api/spotify/login/status') {
			try {
				const profile = await spotifyApi('/me');
				return sendJSON(res, {
					provider: 'spt', loggedIn: true, userId: profile.id || '', nickname: profile.display_name || profile.id || 'Spotify',
					avatar: profile.images && profile.images[0] ? profile.images[0].url : '', premiumRequired: true
				});
			} catch (error) {
				return sendJSON(res, { provider: 'spt', loggedIn: false, configured: !!spotifyClientConfig().clientId, error: error.message });
			}
		}
		if (pn === '/api/spotify/search') {
			try {
				const keywords = String(url.searchParams.get('keywords') || '').trim();
				if (!keywords) return sendJSON(res, { songs: [], provider: 'spt' });
				const limit = Math.max(1, Math.min(10, Number(url.searchParams.get('limit')) || 10));
				const data = await spotifyApi(`/search?${new URLSearchParams({ q: keywords, type: 'track', limit: String(limit) })}`);
				return sendJSON(res, { songs: ((data.tracks && data.tracks.items) || []).map(spotifyTrackToSong), provider: 'spt' });
			} catch (error) {
				return sendJSON(res, { error: error.message, songs: [] }, error.statusCode || 500);
			}
		}
		if (pn === '/api/spotify/queue') {
			if (req.method !== 'GET') return sendJSON(res, { error: 'METHOD_NOT_ALLOWED' }, 405);
			try {
				const data = await spotifyApi('/me/player/currently-playing');
				if (data && data.item) {
					const trackQuery = data.item.name;
					const trackAlbum = data.item.album.name;
					const searchQuery = `album:\"${trackAlbum}\" track:\"${trackQuery}\"`;
					const searchres = await spotifyApi(`/search?${new URLSearchParams({ q: searchQuery, type: 'track', limit: String(10) })}`);
					const parsed = ((searchres.tracks && searchres.tracks.items) || []);
					return sendJSON(res, { success: true, currently_playing: parsed[0], queue: parsed.slice(1) });
				}
			} catch (error) {
				return sendJSON(res, { error: error.message, currently_playing: null, queue: [] }, error.statusCode || 500);
			}
		}
		if (pn === '/api/spotify/devices') {
			if (req.method !== 'GET') return sendJSON(res, { error: 'METHOD_NOT_ALLOWED' }, 405);
			try {
				const data = await spotifyApi('/me/player/devices');
				return sendJSON(res, { devices: data && Array.isArray(data.devices) ? data.devices : [] });
			} catch (error) {
				return sendJSON(res, { error: error.message, devices: [] }, error.statusCode || 500);
			}
		}
		return sendJSON(res, { error: 'SPOTIFY_ROUTE_NOT_FOUND' }, 404);
	}

	// Search API
	if (pn === '/api/search') {
		try {
			const kw = url.searchParams.get('keywords') || '';
			const limit = parseInt(url.searchParams.get('limit') || '10');
			const songs = await handleSearch(kw, limit);
			sendJSON(res, { songs, provider: 'youtube' });
		} catch (err) {
			sendJSON(res, { error: err.message, songs: [] }, 500);
		}
		return;
	}

	// Get Stream URL API
	if (pn === '/api/song/url') {
		try {
			const id = url.searchParams.get('id') || url.searchParams.get('mid');
			const info = await handleGetUrl(id);
			sendJSON(res, info);
		} catch (err) {
			sendJSON(res, { error: err.message, url: null }, 500);
		}
		return;
	}
	// Audio Proxy - Sửa lỗi CORS và hỗ trợ tua nhạc (Seeking)
	if (pn === '/api/audio') {
		const audioUrl = url.searchParams.get('url');
		if (!audioUrl) return res.end();

		const headers = {
			'User-Agent': UA,
			'Referer': 'https://www.youtube.com/',
			'Origin': 'https://www.youtube.com'
		};
		if (cookiestring) {
			headers.Cookie = cookiestring;
		}
		if (req.headers.range) {
			headers.Range = req.headers.range;
		}

		https.get(audioUrl, { headers }, (proxyRes) => {
			// Ép cứng các header CORS
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Range');
			res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
			for (const key in proxyRes.headers) {
				if (!['access-control-allow-origin', 'access-control-allow-methods'].includes(key)) {
					res.setHeader(key, proxyRes.headers[key]);
				}
			}

			res.writeHead(proxyRes.statusCode);
			proxyRes.pipe(res);
		}).on('error', (e) => {
			console.error('[Audio Proxy Error]', e.message);
			res.writeHead(500);
			res.end();
		});
		return;
	}
	// ---------- Lyrics (BetterLyrics Search for Youtube Track) ----------
	if (pn == '/api/blyric') {
		const id = url.searchParams.get('id');
		if (!id) return sendJSON(res, { error: 'ID_REQUIRED' }, 404);
		const token = url.searchParams.get('token') || process.env.BETTERLYRICS_TOKEN;
		console.log(`[BetterLyrics]: Searching for ${id}`)
		if (!token) return sendJSON(res, { error: 'NO_BETTER_LYRICS_TOKEN' }, 401);
		const response = await fetch(`https://lyrics.api.dacubeking.com/lyrics?videoId=${id}&token=${token}`)
		if (response.ok) {
			const data = await response.json();
			if (!data?.musixmatchSyncedLyrics && !data?.lrclibSyncedLyrics && !data?.goLyricsApiTtml) return sendJSON(res,{ error: "NO_BETTER_LYRICS" },404); // tell the frontend to search regular lyrics
			else {
				return sendJSON(res, {
					lyric: data.musixmatchSyncedLyrics || data.lrclibSyncedLyrics,
					ttmlLyric: data?.goLyricsApiTtml || null,
					source: "betterlyrics",
				})
			}
		} else {
			return sendJSON(res,{ error: "CANNOT_FETCH" },404); // tell the frontend to search regular lyrics
		}
	}
	// ---------- Lyrics (LRCLIB Search) ----------
	if (pn === '/api/lyric') {
		try {
			const id = url.searchParams.get('id') || url.searchParams.get('mid');
			let query = url.searchParams.get('title');
			let artist = url.searchParams.get('artist');
			let duration = url.searchParams.get('duration');
			let album = url.searchParams.get('album');
			
			let meta = { name: query, artist, duration, album };
			if (Number(meta.duration) > 1000) meta.duration = Math.round(Number(meta.duration) / 1000);

			// Chỉ fetch metadata nếu thiếu thông tin quan trọng
			if ((!query || !artist || artist == 'Unknown') && id) {
				const detail = await handleGetDetail(id);
				if (detail) {
					meta.name = query || detail.name;
					meta.artist = artist || detail.artist;
					meta.duration = duration || detail.duration;
					meta.album = album || detail.album;
				}
			}

			if (!meta.name || !meta.artist) {
				return sendJSON(res, { error: 'QUERY_OR_ID_REQUIRED', lyric: '' }, 400);
			}

			// Try 1: Lấy trực tiếp từ LRCLIB bằng các tham số đã có
			try {
				const params = new URLSearchParams({
					track_name: meta.name,
					artist_name: meta.artist,
					...(meta.album && { album_name: meta.album }),
					...(meta.duration && { duration: meta.duration })
				});

				const tryDirect = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
				if (tryDirect.ok) {
					const data = await tryDirect.json();
					if (data && (data.syncedLyrics || data.plainLyrics)) {
						console.log(`[LRCLIB Direct get] Match found: ${data.artistName} - ${data.trackName}`);
						return sendJSON(res, {
							lyric: data.syncedLyrics || data.plainLyrics || "",
							tlyric: "",
							source: "lrclib",
							match: `${data.artistName} - ${data.trackName}`
						});
					} else if (data && data.instrumental) {
						return sendJSON(res, {
							lyriic: `[00:00.00] ${data.artistName} - ${data.trackName} (Instrumental)`,
							source: "lrclib",
							match: `${data.artistName} - ${data.trackName}`
						})
					}
				}
			} catch (err) {
				console.error("Try 1 failed:", err);
			}

			// Try 2: Tìm kiếm theo query nếu Try 1 thất bại
			try {
				const cleanQuery = cleanAndNormalizeYoutubeTitle(`${meta.artist} - ${meta.name}`);
				const data = await searchLrcLib(cleanQuery);
				if (data && (data.syncedLyrics || data.plainLyrics)) {
					return sendJSON(res, {
						lyric: data.syncedLyrics || data.plainLyrics || "",
						tlyric: "",
						source: "lrclib_search",
						match: `${data.artistName} - ${data.trackName}`
					});
				} else if (data && data.instrumental) {
					return sendJSON(res, {
						lyric: `[00:00.00] ${data.artistName} - ${data.trackName} (Instrumental)`,
						source: "lrclib",
						match: `${data.artistName} - ${data.trackName}`
					})
				}
			} catch (err) {
				console.error("Try 2 failed:", err);
			}

			sendJSON(res, {
				lyric: "[00:00.00] No lyrics found for: " + meta.name,
				source: "lrclib_empty"
			});

		} catch (err) {
			console.error('[Lyric Route Error]', err);
			sendJSON(res, { error: err.message, lyric: "" }, 500);
		}
		return;
	}

	// Cover Proxy (To bypass YouTube CORS for Canvas color extraction)
	if (pn === '/api/cover') {
		const target = url.searchParams.get('url');
		if (!target) return res.end();
		try {
			const resp = await fetch(target);
			const buffer = await resp.arrayBuffer();
			res.writeHead(200, {
				'Content-Type': 'image/jpeg',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(Buffer.from(buffer));
		} catch (e) {
			res.writeHead(404); res.end();
		}
		return;
	}
	// Thay thế đoạn route /api/login cũ của bạn bằng đoạn này
	if (pn == '/api/login') {
		try {
			const browser = await chromium.launch({
				headless: false,
				executablePath: getPlaywrightExecutable(),
				args: [
					'--disable-blink-features=AutomationControlled',
					'--no-sandbox',
					'--disable-web-security',
					'--disable-infobars',
					'--disable-extensions',
					'--start-maximized',
					'--disable-setuid-sandbox',
					'--disable-infobars',
					'--window-size=1280,720'  // Set a specific window size
				]
			});
			const context = await browser.newContext({
				userAgent: UA,
				viewport: { width: 1280, height: 720 },
				deviceScaleFactor: 1,
			});
			await context.addInitScript(() => {
				// 1. Overwrite the webdriver property to false
				Object.defineProperty(navigator, 'webdriver', {
					get: () => undefined,
				});

				// 2. Mock languages and plugins to look like a standard user browser
				Object.defineProperty(navigator, 'languages', {
					get: () => ['en-US', 'en'],
				});

				Object.defineProperty(navigator, 'plugins', {
					get: () => [
						{ description: "Portable Document Format", filename: "internal-pdf-viewer", name: "Chrome PDF Viewer" },
						{ description: "Chromium PDF Plugin", filename: "internal-pdf-viewer", name: "Chromium PDF Viewer" }
					],
				});


				// 4. Mock WebGL vendor strings
				const getParameter = WebGLRenderingContext.prototype.getParameter;
				WebGLRenderingContext.prototype.getParameter = function(parameter) {
					if (parameter === 37445) return 'Intel Inc.';
					if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640';
					return getParameter.valueOf()(parameter);
				};
			});
			const page = await context.newPage();

			await page.goto('https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F', { waitUntil: 'networkidle' });
			const checkLogin = setInterval(async () => {
				const cookies = await context.cookies();
				const hasLoginCookie = cookies.some(c => c.name === '__Secure-3PSID' && c.domain.includes('youtube.com'));

				if (hasLoginCookie) {
					clearInterval(checkLogin);
					await context.storageState({ path: JSON_COOKIE });

					const netscape = jsontoNetscape(cookies);
					fs.writeFileSync(COOKIE_FILE_PATH, netscape);
					await getRecommendedTracks(browser, page);
					await browser.close();
					if (avatarUrl && userName) sendJSON(res, { success: true, avatarUrl: avatarUrl, userName: userName });
					else sendJSON(res, { success: true });
				}
			}, 2000);
		} catch (err) {
			console.error('[Login Error]', err);
			sendJSON(res, { success: false, error: err.message }, 500);
		}
		return;
	}

	if (pn == '/api/logout') {
		if (fs.existsSync(COOKIE_FILE_PATH)) fs.unlinkSync(COOKIE_FILE_PATH);
		if (fs.existsSync(JSON_COOKIE)) fs.unlinkSync(JSON_COOKIE);
		if (fs.existsSync(SAVED_USER_AGENT)) fs.unlinkSync(SAVED_USER_AGENT);
		const newUserAgent = new ua({ deviceCategory: 'desktop' }).toString();
		fs.writeFileSync(SAVED_USER_AGENT, newUserAgent);
		UA = newUserAgent;
		//if (innertube) await innertube.session.signOut();
		innertube = await Innertube.create({ cookie: null });
		sendJSON(res, { success: true });
		loggedIn = false;
		return;
	}
	if (pn == '/api/recommend') {
		const rmd = (fetchedrecommenddata && Object.keys(fetchedrecommenddata).length > 0) ? fetchedrecommenddata : await getRecommendedTracks();
		sendJSON(res, { success: true, rmd: rmd.tracks, userName: rmd.userName, avatarUrl: rmd.avatarUrl });
		return;
	}
	if (pn == '/api/login/status') {
		const actualStatus = innertube && innertube.session && innertube.session.logged_in;
		sendJSON(res, {
			success: true,
			loggedIn: actualStatus || false,
		});
		return;
	}
	if (pn == '/api/related') {
		const id = url.searchParams.get('id');
		const info = await innertube.music.getInfo(id);
		const up_next = await info.getUpNext();
		sendJSON(res, { success: true, up_next });
		return;

	}
	if (pn == '/api/update-check-yt-dlp'){
		const data = await updateYtdlpSmart();
		sendJSON(res, data);
		return;
	}
	if (pn == '/api/update') {
        const result = await fetch('https://api.github.com/repos/akimiya7742/MineradioVN/releases/latest', {
            headers: { 'User-Agent': 'Node.js-App' }
        });
        const data = await result.json();
        const latest = data.tag_name.slice(1);
		const url = data.html_url;
		const changelog = data.body;
		return sendJSON(res,{
			success: true,
			latest: latest,
			url: url,
			changelog: changelog // the markdown result
		})
	}
	if (pn === '/api/rpc/update') {
		let body = '';
		req.on('data', chunk => { body += chunk.toString(); });
		req.on('end', () => {
			try {
				const data = JSON.parse(body);
				updateDiscordPresence(data);
				sendJSON(res, { success: true });
			} catch (e) {
				sendJSON(res, { success: false }, 400);
			}
		});
		return;
	}
	// Static files
	let filePath = pn === '/' ? '/index.html' : pn;
	const fullPath = path.join(__dirname, 'public', filePath);
	serveStatic(res, fullPath);
});

server.listen(PORT, HOST, () => {
	console.log(`======================================================`);
	console.log(` MineradioVN Server Running`);
	console.log(` URL: http://localhost:${PORT}`);
	console.log(` Mode: Youtube.JS wrapper`);
	console.log(`======================================================`);
});
module.exports = server;
