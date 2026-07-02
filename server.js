// ====================================================================
//  粒子音乐可视化播放器 — Server v2 (YouTube Edition)
//  - Provider: YouTube (via yt-dlp)
//  - Functions: Search, Stream URL, Basic Metadata
// ====================================================================
/*
 * Modified by akimiya7742 on 02/07/2026
 * Original work Copyright (C) 2026 XxHuberrr
*/
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Innertube } = require("youtubei.js");
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
let loggedIn = false;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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
const USER_DATA_PATH = process.env.APPDATA || (process.platform == 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
const APP_DATA_DIR = path.join(USER_DATA_PATH, 'mineradio');
const COOKIE_FILE_PATH = path.join(APP_DATA_DIR, 'ytcookie.txt');
if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
/**
 * Chuyển đổi định dạng Netscape sang Cookie String cho Innertube
 */
function parseNetscapeCookies(filePath) {
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
                if (domain.includes('youtube.com') && cookieName === '__Secure-3PSIDTS') {
                    return `${cookieName}=${cookieValue}`;
                }
            }
        }
        return ''; // Không tìm thấy thì trả về empty
    } catch (e) {
        console.error('[Cookie Parse Error]', e);
        return '';
    }
}
/**
 * Khởi tạo Innertube với cookie nếu có sẵn
 */
async function initInnertube() {
    const cookieString = parseNetscapeCookies(COOKIE_FILE_PATH);
	//console.log(cookieString);
    if (cookieString) {
        console.log('[System] Found saved cookie.txt, logging in...');
        innertube = await Innertube.create({ cookie: cookieString });
		loggedIn = true;
    } else {
        innertube = await Innertube.create({cookie:null});
    }
}

// Gọi khởi tạo khi server chạy
initInnertube().then(() => {
    console.log("[Auth Status]", loggedIn); // In ra true vì block này chỉ chạy sau khi hàm xong
});
// ---------- YouTube Logic (yt-dlp) ----------

/**
 * Executes yt-dlp commands and returns JSON
 */
async function runYtDlp(args) {
	try {
		const command = `yt-dlp --no-warnings --ignore-errors ${args}`;
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
			album: item.album?.name || 'YouTube Video',
			cover: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
			duration: (item.duration || 0) * 1000,
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

    const args = `-f "ba/b" ${cookieArg} -g "https://music.youtube.com/watch?v=${id}"`;
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
/**
 * Fetch Video Details
 */
async function handleGetDetail(id) {
	if (!innertube) innertube = await Innertube.create();
	const track_info = await innertube.music.getInfo(id);
	if (!track_info) return null;
	return {
		id: track_info.basic_info.id,
		name: track_info.basic_info.title,
		artist: track_info.basic_info.author,
		cover: track_info.basic_info.thumbnail[0].url,
		duration: track_info.basic_info.length_seconds * 1000
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
async function getRecommendedTracks(limit = 20) {
	if (!innertube) innertube = Innertube.create();

	// Get explore page with recommendations
	const explore = await innertube.music.getExplore();

	let tracks = [];
	let count = 0;

	// Iterate through sections
	for (const section of explore.sections) {
		if (!section.contents) continue;

		// Iterate through items in section
		for (const item of section.contents) {
			if (count >= limit) break;

			// Only process songs (not videos, albums, artists, etc.)
			if (item.type ==! 'song' || !item.id) continue;

			try {
				// Get track info for detailed data
				const trackInfo = await innertube.music.getInfo(item.id);
				//console.log(trackInfo);
				const artist = item.artists?.[0]?.name ||
					trackInfo.basic_info.author ||
					'Unknown Artist';
				const album = trackInfo.album?.name || 'Unknown Album';
				const thumb = trackInfo.basic_info.thumbnail[0].url;
				const duration = trackInfo.basic_info.duration * 1000;

				tracks.push({
					id: trackInfo.basic_info.id,
					title: trackInfo.basic_info.title || '',
					artist: artist,
					album: album,
					cover: thumb,
					duration: duration,
					url: `https://youtube.com/watch?v=${item.id}`
				});

				count++;
			} catch (error) {
				console.error(`Failed to get track info for ${item.id}:`, error.message);
				continue;
			}
		}

		if (count >= limit) break;
	}

	return tracks;
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
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);
	const pn = url.pathname;
	console.log(`[Debug] Route called: ${pn}`)
	// Search API
	if (pn === '/api/search' || pn === '/api/qq/search') {
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
	if (pn === '/api/song/url' || pn === '/api/qq/song/url') {
		try {
			const id = url.searchParams.get('id') || url.searchParams.get('mid');
			const info = await handleGetUrl(id);
			sendJSON(res, info);
		} catch (err) {
			sendJSON(res, { error: err.message, url: null }, 500);
		}
		return;
	}

	// ---------- Lyrics (LRCLIB Search) ----------
	if (pn === '/api/lyric' || pn === '/api/qq/lyric') {
		try {
			const id = url.searchParams.get('id') || url.searchParams.get('mid');
			let query = url.searchParams.get('q'); // Option to pass a direct query

			// If no direct query is passed, get the title/artist from YouTube
			if (!query && id) {
				const meta = await handleGetDetail(id);
				if (meta) {
					// Construct a query like "The Weeknd - Blinding Lights"
					query = `${meta.artist} - ${meta.name}`;
				}
			}
			if (!query) {
				return sendJSON(res, { error: 'QUERY_OR_ID_REQUIRED', lyric: '' }, 400);
			}

			// Clean query: remove common YouTube fluff like "(Official Video)" 
			// to improve LRCLIB search accuracy
			const cleanQuery = cleanAndNormalizeYoutubeTitle(query);

			const data = await searchLrcLib(cleanQuery);

			if (data) {
				sendJSON(res, {
					lyric: data.syncedLyrics || data.plainLyrics || "",
					tlyric: "",
					source: "lrclib_search",
					match: `${data.artistName} - ${data.trackName}`
				});
			} else {
				sendJSON(res, {
					lyric: "[00:00.00] No lyrics found for: " + cleanQuery,
					source: "lrclib_empty"
				});
			}
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

	// Audio Proxy (Essential for streaming direct links which often have IP/Referer locks)
	if (pn === '/api/audio') {
		const audioUrl = url.searchParams.get('url');
		if (!audioUrl) return res.end();

		const headers = { 'User-Agent': UA };
		if (req.headers.range) headers.Range = req.headers.range;

		https.get(audioUrl, { headers }, (proxyRes) => {
			res.writeHead(proxyRes.statusCode, {
				...proxyRes.headers,
				'Access-Control-Allow-Origin': '*'
			});
			proxyRes.pipe(res);
		}).on('error', () => {
			res.writeHead(500); res.end();
		});
		return;
	}
    if (pn == '/api/login') {
        // Chúng ta sẽ dùng phương thức POST để nhận dữ liệu file
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    // Lưu file vào đường dẫn đã định nghĩa
                    fs.writeFileSync(COOKIE_FILE_PATH, body, 'utf-8');
                    
                    // Parse lại để login Innertube
                    const cookieString = parseNetscapeCookies(COOKIE_FILE_PATH);
                    innertube = await Innertube.create({ cookie: cookieString });
                    
                    loggedIn = true;
                    sendJSON(res, { success: true });	
                } catch (err) {
                    sendJSON(res, { success: false, error: err.message }, 500);
                }
            });
        }
        return;
    }

    if (pn == '/api/logout') {
        if (fs.existsSync(COOKIE_FILE_PATH)) fs.unlinkSync(COOKIE_FILE_PATH);
		//if (innertube) await innertube.session.signOut();
        innertube = await Innertube.create({cookie:null});
        sendJSON(res, { success: true });
		loggedIn = false;
        return;
    }
	if (pn == '/api/recommend') {
		const rmd = await getRecommendedTracks();
		sendJSON(res, {success:true,rmd});
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
		sendJSON(res,{success:true,up_next});
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