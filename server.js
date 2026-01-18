const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static('.'));
app.use(express.json());

const DOWNLOADS_DIR = process.env.NODE_ENV === 'production' 
    ? '/tmp/downloads' 
    : path.join(__dirname, 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

cleanupOldFiles();
setInterval(cleanupOldFiles, 5 * 60 * 1000);

function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        const now = Date.now();
        let cleaned = 0;
        files.forEach(file => {
            const filePath = path.join(DOWNLOADS_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > 5 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            } catch (e) {}
        });
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old file(s)`);
        }
    } catch (e) {
        console.error('Cleanup error:', e);
    }
}

const YT_DLP = fs.existsSync('./yt-dlp') ? './yt-dlp' : 'yt-dlp';

app.get('/download', async (req, res) => {
    const videoUrl = req.query.url;
    const format = req.query.format || 'mp4';
    const quality = req.query.quality || '480p';
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    
    if (!videoUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const timestamp = Date.now();
    const tempFile = path.join(DOWNLOADS_DIR, `${timestamp}_temp`);
    const outputFile = path.join(DOWNLOADS_DIR, `${timestamp}_output.${format}`);
    
    try {
        let command;
        
        if (format === 'mp3') {
            command = `${YT_DLP} -x --audio-format mp3 --audio-quality 0 --add-header "User-Agent:Mozilla/5.0" -o "${tempFile}.%(ext)s" "${videoUrl}"`;
        } else {
            // Fix: Handle "highest" quality properly
            let formatString;
            if (quality === 'highest') {
                formatString = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            } else {
                const qualityNum = quality.replace('p', '');
                formatString = `bestvideo[height<=${qualityNum}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${qualityNum}]`;
            }
            
            command = `${YT_DLP} -f "${formatString}" --merge-output-format mp4 --add-header "User-Agent:Mozilla/5.0" -o "${tempFile}.%(ext)s" "${videoUrl}"`;
        }

        console.log(`Processing download for video: ${videoId}`);

        exec(command, { maxBuffer: 1024 * 1024 * 100, timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Download error:', error.message);
                console.error('stderr:', stderr);
                return res.status(500).json({ error: 'Download failed. YouTube may be blocking the request.' });
            }

            const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(timestamp.toString() + '_temp'));
            
            if (files.length === 0) {
                return res.status(500).json({ error: 'Downloaded file not found' });
            }

            const downloadedFile = path.join(DOWNLOADS_DIR, files[0]);

            if (startTime && endTime) {
                console.log('Trimming video');
                
                const duration = calculateDuration(startTime, endTime);
                const trimCommand = `ffmpeg -i "${downloadedFile}" -ss ${startTime} -t ${duration} -c:v libx264 -preset ultrafast -c:a aac "${outputFile}"`;
                
                exec(trimCommand, { maxBuffer: 1024 * 1024 * 100, timeout: 300000 }, (trimError) => {
                    try { fs.unlinkSync(downloadedFile); } catch (e) {}

                    if (trimError) {
                        console.error('Trimming error:', trimError.message);
                        return res.status(500).json({ error: 'Trimming failed' });
                    }

                    sendFileAndCleanup(res, outputFile, `trimmed_${videoId}.${format}`);
                });
            } else {
                sendFileAndCleanup(res, downloadedFile, `${videoId}.${format}`);
            }
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Server error occurred' });
    }
});

function calculateDuration(startTime, endTime) {
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    const startSec = start[0] * 3600 + start[1] * 60 + start[2];
    const endSec = end[0] * 3600 + end[1] * 60 + end[2];
    const dur = endSec - startSec;
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    const s = dur % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function sendFileAndCleanup(res, filePath, fileName) {
    res.download(filePath, fileName, (err) => {
        if (err) {
            console.error('Download send error:', err);
        }
        setTimeout(() => {
            try { 
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        }, 3000);
    });
}

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    exec(`${YT_DLP} --version`, (err, out) => {
        if (!err) {
            console.log('✓ yt-dlp:', out.trim());
        } else {
            console.log('✗ WARNING: yt-dlp not found');
        }
    });
    
    exec('ffmpeg -version', (err2, out2) => {
        if (!err2) {
            console.log('✓ ffmpeg: installed');
        } else {
            console.log('✗ WARNING: ffmpeg not found');
        }
    });
});