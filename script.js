document.getElementById('customTime').addEventListener('change', function() {
    const timeInputs = document.getElementById('timeInputs');
    timeInputs.style.display = this.checked ? 'grid' : 'none';
});

function validateTimeInput(input, max) {
    input.addEventListener('input', function() {
        if (this.value < 0) this.value = 0;
        if (this.value > max) this.value = max;
        if (this.value.length > 2) this.value = this.value.slice(0, 2);
    });
}

validateTimeInput(document.getElementById('startHour'), 23);
validateTimeInput(document.getElementById('startMin'), 59);
validateTimeInput(document.getElementById('startSec'), 59);
validateTimeInput(document.getElementById('endHour'), 23);
validateTimeInput(document.getElementById('endMin'), 59);
validateTimeInput(document.getElementById('endSec'), 59);

function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const format = document.getElementById('format').value;
    const customTime = document.getElementById('customTime').checked;
    const statusDiv = document.getElementById('status');
    const btnText = document.getElementById('btnText');
    const downloadBtn = document.querySelector('.download-btn');

    statusDiv.className = 'status';
    statusDiv.style.display = 'none';

    if (!videoUrl) {
        showStatus('Please enter a YouTube URL', 'error');
        return;
    }

    if (!isValidYouTubeUrl(videoUrl)) {
        showStatus('Please enter a valid YouTube URL', 'error');
        return;
    }

    downloadBtn.disabled = true;
    btnText.textContent = 'Processing...';

    const downloadUrl = 'http://localhost:3000/download?url=' + encodeURIComponent(videoUrl) + '&format=' + format;
    
    showStatus('Starting download...', 'info');
    
    window.location.href = downloadUrl;
    
    setTimeout(function() {
        showStatus('Download started! Check your downloads folder.', 'success');
        downloadBtn.disabled = false;
        btnText.textContent = 'Download';
    }, 2000);
}

function isValidYouTubeUrl(url) {
    const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11}/;
    return pattern.test(url);
}

function extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status show ' + type;
    statusDiv.style.whiteSpace = 'pre-line';
}

document.getElementById('videoUrl').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        downloadVideo();
    }
});