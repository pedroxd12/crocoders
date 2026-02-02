
const https = require('https');
const http = require('http');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }).on('error', (err) => reject(err));
    });
}

async function test() {
    console.log('Testing OmegaUp...');
    try {
        // Test with a known user, e.g. 'joemcc' or 'tourist' or someone likely to exist. 'test' worked in python.
        const resOnly = await fetchUrl('https://omegaup.com/api/user/profile/?username=test');
        console.log('OmegaUp Status:', resOnly.statusCode);
        console.log('OmegaUp Data Preview:', resOnly.data.substring(0, 200));
    } catch (e) {
        console.error('OmegaUp Error:', e.message);
    }

    console.log('\nTesting VJudge...');
    try {
        const resVJ = await fetchUrl('https://vjudge.net/user/tourist'); // tourist exists on vjudge
        console.log('VJudge Status:', resVJ.statusCode);
        console.log('VJudge Data Preview:', resVJ.data.substring(0, 200));
        
        if (resVJ.data.includes('Overall solved')) {
            console.log('VJudge: "Overall solved" found');
        } else {
            console.log('VJudge: "Overall solved" NOT found');
        }
    } catch (e) {
        console.error('VJudge Error:', e.message);
    }
}

test();
